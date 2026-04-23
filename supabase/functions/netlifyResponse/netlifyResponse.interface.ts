import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type { ComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.interface.ts';
import type {
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseFn,
} from '../dialectic-worker/saveResponse/saveResponse.interface.ts';

export interface NetlifyResponseBody {
    job_id: string;
    assembled_content: string;
    token_usage: NodeTokenUsage | null;
    finish_reason: string | null;
    sig: string;
}

export interface NetlifyResponseDeps {
    computeJobSig: ComputeJobSig;
    adminClient: SupabaseClient<Database>;
    saveResponse: SaveResponseFn;
    saveResponseDeps: SaveResponseDeps;
}

export type NetlifyResponseHandlerFn = (
    deps: NetlifyResponseDeps,
    req: Request,
) => Promise<Response>;
