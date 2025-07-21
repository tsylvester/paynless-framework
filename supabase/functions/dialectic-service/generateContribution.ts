// deno-lint-ignore-file no-explicit-any
import {
    GenerateContributionsPayload,
    GenerateContributionsDeps,
  } from "./dialectic.interface.ts";
import type { Database, Json } from "../types_db.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { logger } from "../_shared/logger.ts";
import { User } from "npm:@supabase/supabase-js@2";
  
export async function generateContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateContributionsPayload,
    user: User,
    _deps: GenerateContributionsDeps
): Promise<{ success: boolean; data?: { job_ids: string[] }; error?: { message: string; status?: number; details?: string; code?: string } }> {

    const { sessionId, iterationNumber = 1, stageSlug, continueUntilComplete, maxRetries = 3, selectedModelIds } = payload;
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
    if (!selectedModelIds || selectedModelIds.length === 0) {
        logger.warn("[generateContributions] selectedModelIds must be a non-empty array.", { payload });
        return { success: false, error: { message: "selectedModelIds must be a non-empty array.", status: 400 } };
    }

    try {
        const jobIds: string[] = [];
        for (const modelId of selectedModelIds) {
            // Create a discrete payload for each job
            const { selectedModelIds: _, ...restOfPayload } = payload;
            const jobPayload: Json = { 
                ...restOfPayload, 
                model_id: modelId,
            };

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
  