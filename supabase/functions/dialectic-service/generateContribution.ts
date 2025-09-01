// deno-lint-ignore-file no-explicit-any
import {
    GenerateContributionsPayload,
    GenerateContributionsDeps,
  } from "./dialectic.interface.ts";
import type { Database, Json } from "../types_db.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { logger } from "../_shared/logger.ts";
import { User } from "npm:@supabase/supabase-js@2";
import { hasStepsRecipe } from "../_shared/utils/type_guards.ts";
  
export async function generateContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateContributionsPayload,
    user: User,
    _deps: GenerateContributionsDeps,
    authToken?: string | null,
): Promise<{ success: boolean; data?: { job_ids: string[] }; error?: { message: string; status?: number; details?: string; code?: string } }> {

    const { sessionId, iterationNumber = 1, stageSlug, continueUntilComplete, maxRetries = 3 } = payload;
    logger.info(`[generateContributions] Enqueuing job for session ID: ${sessionId}, stage: ${stageSlug}, iteration: ${iterationNumber}, continueUntilComplete: ${continueUntilComplete}`);

    if (!stageSlug) {
      logger.warn("[generateContributions] stageSlug is required in the payload.", { payload });
      return { success: false, error: { message: "stageSlug is required in the payload.", status: 400 } };
    }
    if (!sessionId) {
        logger.warn("[generateContributions] sessionId is required in the payload.", { payload });
        return { success: false, error: { message: "sessionId is required in the payload.", status: 400 } };
    }
    if (!user || !user.id) {
        logger.warn("[generateContributions] userId is required for enqueuing a job.", { payload });
        return { success: false, error: { message: "User could not be identified for job creation.", status: 401 } };
    }

    // Enforce wallet presence for manual/test job creation before any DB work
    if (typeof payload.walletId !== 'string' || payload.walletId.trim() === '') {
        logger.warn("[generateContributions] walletId is required in the payload.", { payload });
        return { success: false, error: { message: "walletId is required to create generation jobs.", status: 400 } };
    }

    try {
        // Fetch session details to get the selected models and validate context
        const { data: sessionData, error: sessionError } = await dbClient
            .from('dialectic_sessions')
            .select(`
                project_id,
                selected_model_ids,
                iteration_count,
                current_stage:current_stage_id(slug)
            `)
            .eq('id', sessionId)
            .single();

        if (sessionError) {
            logger.error(`[generateContributions] Failed to fetch session details for session ${sessionId}.`, { error: sessionError });
            return { success: false, error: { message: `Failed to fetch session details: ${sessionError.message}`, status: 500, details: sessionError.details, code: sessionError.code } };
        }

        // --- Context Validation ---
        if (sessionData.project_id !== payload.projectId) {
            const message = "Session's project ID does not match the provided project ID.";
            logger.warn(`[generateContributions] ${message}`, { sessionId, sessionProjectId: sessionData.project_id, payloadProjectId: payload.projectId });
            return { success: false, error: { message, status: 400 } };
        }
        if (sessionData.iteration_count !== payload.iterationNumber) {
            const message = "Session's iteration number does not match the provided iteration number.";
            logger.warn(`[generateContributions] ${message}`, { sessionId, sessionIteration: sessionData.iteration_count, payloadIteration: payload.iterationNumber });
            return { success: false, error: { message, status: 400 } };
        }
        // The joined `dialectic_stages` table is an object if found, or null.
        if (!sessionData.current_stage || Array.isArray(sessionData.current_stage) || sessionData.current_stage.slug !== payload.stageSlug) {
            const message = "Session's current stage does not match the provided stage slug.";
            const sessionStageSlug = (sessionData.current_stage && !Array.isArray(sessionData.current_stage)) ? sessionData.current_stage.slug : 'Not Found';
            logger.warn(`[generateContributions] ${message}`, { sessionId, sessionStage: sessionStageSlug, payloadStage: payload.stageSlug });
            return { success: false, error: { message, status: 400 } };
        }
        // --- End Context Validation ---

        const selectedModelIds = sessionData?.selected_model_ids;
        if (!selectedModelIds || selectedModelIds.length === 0) {
            logger.warn("[generateContributions] The session has no selected models. Cannot create jobs.", { sessionId });
            return { success: false, error: { message: "The session has no selected models. Please select at least one model.", status: 400 } };
        }
        
        // 1. Fetch the recipe for the stage
        const { data: stageDef, error: recipeError } = await dbClient
            .from('dialectic_stages')
            .select('*')
            .eq('slug', stageSlug)
            .single();

        if (recipeError || !stageDef) {
            logger.error(`[generateContributions] Could not find recipe for stage ${stageSlug}.`, { error: recipeError });
            return { success: false, error: { message: `Could not find recipe for stage ${stageSlug}.`, status: 500 } };
        }
        
        console.log('[generateContributions] Fetched stageDef:', JSON.stringify(stageDef, null, 2));
        console.log('[generateContributions] Result of hasStepsRecipe:', hasStepsRecipe(stageDef));

        // 2. Calculate total steps from the recipe
        const totalSteps = hasStepsRecipe(stageDef) ? stageDef.input_artifact_rules.steps.length : 1;
        
        const jobIds: string[] = [];
        for (const modelId of selectedModelIds) {
            // 3. Create a formal 'plan' payload for each job
            const jobPayload: Json = {
                ...payload,
                model_id: modelId,
                user_jwt: authToken,
                job_type: 'plan',
                step_info: {
                    current_step: 1,
                    total_steps: totalSteps,
                    status: 'pending',
                }
            };
            
            console.log(`[generateContributions] Final jobPayload for model ${modelId}:`, JSON.stringify(jobPayload, null, 2));


            const { data: job, error: insertError } = await dbClient
                .from('dialectic_generation_jobs')
                .insert({
                    session_id: sessionId,
                    user_id: user.id,
                    stage_slug: stageSlug,
                    iteration_number: iterationNumber,
                    payload: jobPayload,
                    status: 'pending',
                    max_retries: maxRetries,
                })
                .select('id')
                .single();
        
            if (insertError) {
                logger.error(`[generateContributions] Failed to enqueue job for session ${sessionId}, model ${modelId}.`, { error: insertError, payload });
                // Return failure for the entire operation if any job fails to enqueue
                return { success: false, error: { message: `Failed to create job for model ${modelId}: ${insertError.message}`, status: 500, details: insertError.details, code: insertError.code } };
            }
            jobIds.push(job.id);
            logger.info(`[generateContributions] Successfully enqueued job ${job.id} for session ${sessionId} and model ${modelId}.`);
        }
        
        return { success: true, data: { job_ids: jobIds } };

    } catch (error: unknown) {
        let errorMessage = "An unexpected server error occurred while creating the generation jobs.";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        logger.error(`[generateContributions] Unhandled exception while enqueuing jobs for session ${sessionId}.`, { error });

        return { 
            success: false, 
            error: { 
                message: "An unexpected server error occurred while creating the generation jobs.", 
                status: 500,
                details: errorMessage,
                code: 'UNHANDLED_ENQUEUE_FAILURE'
            }
        };
    }
}
  