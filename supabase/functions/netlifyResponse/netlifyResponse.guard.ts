import type { NetlifyResponseBody, NetlifyResponseDeps } from './netlifyResponse.interface.ts';

export function isNetlifyResponseBody(value: unknown): value is NetlifyResponseBody {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v['job_id'] === 'string' &&
        typeof v['assembled_content'] === 'string' &&
        (v['token_usage'] === null || (typeof v['token_usage'] === 'object' && v['token_usage'] !== null)) &&
        (v['finish_reason'] === null || typeof v['finish_reason'] === 'string') &&
        typeof v['sig'] === 'string'
    );
}

export function isNetlifyResponseDeps(value: unknown): value is NetlifyResponseDeps {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v['computeJobSig'] === 'function' &&
        v['adminClient'] !== null && v['adminClient'] !== undefined &&
        typeof v['saveResponse'] === 'function' &&
        v['saveResponseDeps'] !== null && v['saveResponseDeps'] !== undefined
    );
}
