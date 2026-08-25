import type { NetlifyResponseBody, NetlifyResponseDeps } from './netlifyResponse.interface.ts';

export function isNetlifyResponseBody(value: unknown): value is NetlifyResponseBody {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v['job_id'] === 'string' &&
        typeof v['assembled_content'] === 'string' &&
        (v['token_usage'] === null || (typeof v['token_usage'] === 'object' && v['token_usage'] !== null)) &&
        (v['finish_reason'] === null || typeof v['finish_reason'] === 'string') &&
        typeof v['sig'] === 'string' &&
        typeof v['processingTimeMs'] === 'number' &&
        Number.isFinite(v['processingTimeMs']) &&
        v['processingTimeMs'] >= 0
    );
}

export function isNetlifyResponseDeps(value: unknown): value is NetlifyResponseDeps {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v['computeJobSig'] === 'function' &&
        typeof v['adminClient'] === 'object' && v['adminClient'] !== null &&
        typeof v['saveResponse'] === 'function'
    );
}
