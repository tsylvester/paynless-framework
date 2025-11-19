import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';

/**
 * Dependencies for the `shouldEnqueueRenderJob` utility function.
 */
export interface ShouldEnqueueRenderJobDeps {
    /** The Supabase database client. */
    dbClient: SupabaseClient<Database>;
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
