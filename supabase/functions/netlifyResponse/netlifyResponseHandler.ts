import type { NetlifyResponseDeps, NetlifyResponseHandlerFn } from './netlifyResponse.interface.ts';
import { isNetlifyResponseBody } from './netlifyResponse.guard.ts';
import type {
    SaveResponseParams,
    SaveResponsePayload,
} from '../dialectic-worker/saveResponse/saveResponse.interface.ts';

const JOB_TTL_MS = 2 * 60 * 60 * 1000;

export const netlifyResponseHandler: NetlifyResponseHandlerFn = async (
    deps: NetlifyResponseDeps,
    req: Request,
): Promise<Response> => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    if (!isNetlifyResponseBody(body)) {
        return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400 });
    }

    const { data: jobRows, error: dbError } = await deps.adminClient
        .from('dialectic_generation_jobs')
        .select('id, user_id, created_at')
        .eq('id', body.job_id)
        .single();

    if (dbError || !jobRows) {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    }

    const job = jobRows as { id: string; user_id: string; created_at: string };

    const expectedSig = await deps.computeJobSig(job.id, job.user_id, job.created_at);

    const encoder = new TextEncoder();
    const actualBytes = encoder.encode(body.sig);
    const expectedBytes = encoder.encode(expectedSig);
    let mismatches = actualBytes.length !== expectedBytes.length ? 1 : 0;
    const len = Math.min(actualBytes.length, expectedBytes.length);
    for (let i = 0; i < len; i++) {
        mismatches |= actualBytes[i] ^ expectedBytes[i];
    }
    if (mismatches !== 0) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    if (new Date(job.created_at).getTime() + JOB_TTL_MS < Date.now()) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const srParams: SaveResponseParams = {
        job_id: body.job_id,
        dbClient: deps.adminClient,
    };
    const srPayload: SaveResponsePayload = {
        assembled_content: body.assembled_content,
        token_usage: body.token_usage,
        finish_reason: body.finish_reason,
    };

    const result = await deps.saveResponse(deps.saveResponseDeps, srParams, srPayload);

    if ('status' in result) {
        return new Response(JSON.stringify({ status: result.status }), { status: 200 });
    }
    if (result.retriable) {
        return new Response(JSON.stringify({ error: result.error.message }), { status: 503 });
    }
    return new Response(JSON.stringify({ error: result.error.message }), { status: 500 });
};
