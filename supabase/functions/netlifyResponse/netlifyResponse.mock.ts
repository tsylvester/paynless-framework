import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type {
    NetlifyResponseDeps,
    NetlifyResponseHandlerFn,
    NetlifyResponseBody,
} from './netlifyResponse.interface.ts';
import { mockComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.mock.ts';
import { mockBoundSaveResponseFn } from '../dialectic-worker/saveResponse/saveResponse.provides.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';

export type NetlifyResponseBodyOverrides = Partial<NetlifyResponseBody>;
export type NetlifyResponseBodyCorruptions = { [K in keyof NetlifyResponseBody]?: unknown };

export function buildNetlifyResponseBody(
    overrides?: NetlifyResponseBodyOverrides,
): NetlifyResponseBody {
    const base: NetlifyResponseBody = {
        job_id: 'job-1',
        assembled_content: 'assembled text',
        token_usage: null,
        finish_reason: null,
        sig: 'mock-sig',
        processingTimeMs: 100,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateNetlifyResponseBody(
    corruptions: NetlifyResponseBodyCorruptions,
): unknown {
    return { ...buildNetlifyResponseBody(), ...corruptions };
}

export type NetlifyResponseDepsOverrides = Partial<NetlifyResponseDeps>;
export type NetlifyResponseDepsCorruptions = { [K in keyof NetlifyResponseDeps]?: unknown };

export function buildNetlifyResponseDeps(
    overrides?: NetlifyResponseDepsOverrides,
): NetlifyResponseDeps {
    const { client } = createMockSupabaseClient();
    const base: NetlifyResponseDeps = {
        computeJobSig: mockComputeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: mockBoundSaveResponseFn,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateNetlifyResponseDeps(
    corruptions: NetlifyResponseDepsCorruptions,
): unknown {
    return { ...buildNetlifyResponseDeps(), ...corruptions };
}

export const mockNetlifyResponseHandler: NetlifyResponseHandlerFn = async (
    _deps: NetlifyResponseDeps,
    _req: Request,
): Promise<Response> => new Response(
    JSON.stringify({ status: 'completed' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
);
