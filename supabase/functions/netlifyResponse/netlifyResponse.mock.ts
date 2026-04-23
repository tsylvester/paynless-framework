import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type {
    NetlifyResponseDeps,
    NetlifyResponseHandlerFn,
} from './netlifyResponse.interface.ts';
import type { ComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.interface.ts';
import type {
    SaveResponseDeps,
    SaveResponseFn,
    SaveResponseSuccessReturn,
} from '../dialectic-worker/saveResponse/saveResponse.interface.ts';
import { mockComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.mock.ts';
import { createMockSaveResponseDeps } from '../dialectic-worker/saveResponse/saveResponse.provides.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';

export type MockJobRow = {
    id: string;
    user_id: string;
    created_at: string;
};

export type CreateMockNetlifyResponseDepsOverrides = {
    computeJobSig?: ComputeJobSig;
    jobRow?: MockJobRow | null;
    saveResponse?: SaveResponseFn;
    saveResponseDeps?: SaveResponseDeps;
};

export function createMockNetlifyResponseDeps(
    overrides: CreateMockNetlifyResponseDepsOverrides = {},
): NetlifyResponseDeps {
    const defaultJobRow: MockJobRow = {
        id: 'mock-job-id',
        user_id: 'mock-user-id',
        created_at: new Date().toISOString(),
    };
    const jobRow: MockJobRow | null = 'jobRow' in overrides
        ? (overrides.jobRow ?? null)
        : defaultJobRow;
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                select: { data: jobRow ? [jobRow] : [], error: null },
            },
        },
    });
    const adminClient = client as unknown as SupabaseClient<Database>;

    const defaultSaveResponse: SaveResponseFn = async () => {
        const result: SaveResponseSuccessReturn = { status: 'completed' };
        return result;
    };

    return {
        computeJobSig: overrides.computeJobSig ?? mockComputeJobSig,
        adminClient,
        saveResponse: overrides.saveResponse ?? defaultSaveResponse,
        saveResponseDeps: overrides.saveResponseDeps ?? createMockSaveResponseDeps(),
    };
}

export const mockNetlifyResponseHandler: NetlifyResponseHandlerFn = async (
    _deps: NetlifyResponseDeps,
    _req: Request,
): Promise<Response> => new Response(
    JSON.stringify({ status: 'completed' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
);
