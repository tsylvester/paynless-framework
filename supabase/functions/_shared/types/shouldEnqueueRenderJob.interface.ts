import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { ILogger } from '../types.ts';
/**
 * Dependencies for the `shouldEnqueueRenderJob` utility function.
 */
export interface ShouldEnqueueRenderJobDeps {
    /** The Supabase database client. */
    dbClient: SupabaseClient<Database>;
    /** The application logger. */
    logger: ILogger;
}

/**
 * Parameters for the `shouldEnqueueRenderJob` utility function.
 */
export interface ShouldEnqueueRenderJobParams {
    /** The output type to check if it requires rendering. */
    outputType: string;
    /** The slug of the stage to query recipe steps from. */
    stageSlug: string;
}

/**
 * Enumerates all possible reasons for the render decision.
 */
export type RenderCheckReason = 
    | 'is_markdown' 
    | 'is_json' 
    | 'stage_not_found' 
    | 'instance_not_found' 
    | 'steps_not_found' 
    | 'parse_error' 
    | 'query_error' 
    | 'no_active_recipe';

/**
 * Provides both the decision (`shouldRender`) and diagnostic information.
 */
export interface ShouldEnqueueRenderJobResult {
    /** Whether the output type should be rendered. */
    shouldRender: boolean;
    /** The reason for the decision. */
    reason: RenderCheckReason;
    /** Optional details for error messages or context. */
    details?: string;
}

export type ShouldEnqueueRenderJobFn = (
  deps: ShouldEnqueueRenderJobDeps,
  params: ShouldEnqueueRenderJobParams
) => Promise<ShouldEnqueueRenderJobResult>;
