// deno-lint-ignore-file no-explicit-any
import { 
    GenerateContributionsPayload, 
  } from "./dialectic.interface.ts";
import type { Database, Json } from "../types_db.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import { logger } from "../_shared/logger.ts";
  
export async function generateContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateContributionsPayload,
    userId: string,
): Promise<{ success: boolean; data?: { job_id: string }; error?: { message: string; status?: number; details?: string; code?: string } }> {

    const { sessionId, iterationNumber = 1, stageSlug, continueUntilComplete, maxRetries = 3 } = payload;
    logger.info(`[generateContributions] Enqueuing job for session ID: ${sessionId}, stage: ${stageSlug}, iteration: ${iterationNumber}, continueUntilComplete: ${continueUntilComplete}`);

    if (!stageSlug) {
      logger.error("[generateContributions] stageSlug is required in the payload.");
      return { success: false, error: { message: "stageSlug is required in the payload.", status: 400 } };
    }
    if (!sessionId) {
        logger.error("[generateContributions] sessionId is required in the payload.");
        return { success: false, error: { message: "sessionId is required in the payload.", status: 400 } };
    }
    if (!userId) {
        logger.error("[generateContributions] userId is required for enqueuing a job.");
        return { success: false, error: { message: "User could not be identified for job creation.", status: 401 } };
    }

    try {
        const jobPayload: Json = { ...payload };

        const { data: job, error: insertError } = await dbClient
            .from('dialectic_generation_jobs')
            .insert({
                session_id: sessionId,
                user_id: userId,
                stage_slug: stageSlug,
                iteration_number: iterationNumber,
                payload: jobPayload,
                status: 'pending',
                max_retries: maxRetries,
            })
            .select('id')
            .single();
    
        if (insertError || !job) {
            logger.error(`[generateContributions] Failed to enqueue job for session ${sessionId}.`, { error: insertError });
            return { success: false, error: { message: "Failed to create generation job.", status: 500, details: insertError?.message } };
        }

        logger.info(`[generateContributions] Successfully enqueued job ${job.id} for session ${sessionId}.`);
        
        return { success: true, data: { job_id: job.id } };

    } catch (error: unknown) {
      const anyError = error as { message?: string };
      logger.error(`[generateContributions] Unhandled exception while enqueuing job for session ${sessionId}.`, { error: anyError });

      return { 
        success: false, 
        error: { 
          message: "An unexpected server error occurred while creating the generation job.", 
          status: 500,
          details: anyError.message,
          code: 'UNHANDLED_ENQUEUE_FAILURE'
      }
    };
    }
  }
  