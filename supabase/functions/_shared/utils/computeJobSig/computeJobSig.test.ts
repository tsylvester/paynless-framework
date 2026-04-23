import { assertEquals, assert } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { createComputeJobSig } from './computeJobSig.ts';
import type { ComputeJobSig } from './computeJobSig.interface.ts';
import { mockComputeJobSigSecret } from './computeJobSig.mock.ts';

Deno.test('createComputeJobSig: returns a ComputeJobSig function', async () => {
    const fn: ComputeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
    assertEquals(typeof fn, 'function');
});

Deno.test('createComputeJobSig: returned function resolves to a non-empty lowercase hex string', async () => {
    const fn: ComputeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
    const result: string = await fn('job-1', 'user-1', '2024-01-01T00:00:00Z');
    assert(result.length > 0, 'signature must be non-empty');
    assert(/^[0-9a-f]+$/.test(result), 'signature must be lowercase hex');
});

Deno.test('createComputeJobSig: produces consistent output for same inputs', async () => {
    const fn: ComputeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
    const r1: string = await fn('job-1', 'user-1', '2024-01-01T00:00:00Z');
    const r2: string = await fn('job-1', 'user-1', '2024-01-01T00:00:00Z');
    assertEquals(r1, r2);
});

Deno.test('createComputeJobSig: different job_id produces different signature', async () => {
    const fn: ComputeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
    const r1: string = await fn('job-A', 'user-1', '2024-01-01T00:00:00Z');
    const r2: string = await fn('job-B', 'user-1', '2024-01-01T00:00:00Z');
    assert(r1 !== r2, 'different job_id must produce different signatures');
});

Deno.test('createComputeJobSig: different user_id produces different signature', async () => {
    const fn: ComputeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
    const r1: string = await fn('job-1', 'user-A', '2024-01-01T00:00:00Z');
    const r2: string = await fn('job-1', 'user-B', '2024-01-01T00:00:00Z');
    assert(r1 !== r2, 'different user_id must produce different signatures');
});

Deno.test('createComputeJobSig: different created_at produces different signature', async () => {
    const fn: ComputeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
    const r1: string = await fn('job-1', 'user-1', '2024-01-01T00:00:00Z');
    const r2: string = await fn('job-1', 'user-1', '2025-06-15T12:00:00Z');
    assert(r1 !== r2, 'different created_at must produce different signatures');
});

Deno.test('createComputeJobSig: different secrets produce different signatures for same inputs', async () => {
    const fn1: ComputeJobSig = await createComputeJobSig('secret-one');
    const fn2: ComputeJobSig = await createComputeJobSig('secret-two');
    const r1: string = await fn1('job-1', 'user-1', '2024-01-01T00:00:00Z');
    const r2: string = await fn2('job-1', 'user-1', '2024-01-01T00:00:00Z');
    assert(r1 !== r2, 'different secrets must produce different signatures');
});

Deno.test('createComputeJobSig: signs the message job_id:user_id:created_at with HMAC-SHA256', async () => {
    const secret: string = 'golden-path-secret';
    const jobId: string = 'job-abc-123';
    const userId: string = 'user-xyz-456';
    const createdAt: string = '2024-03-15T12:00:00.000Z';

    const keyMaterial: Uint8Array = new TextEncoder().encode(secret);
    const key: CryptoKey = await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const message: Uint8Array = new TextEncoder().encode(`${jobId}:${userId}:${createdAt}`);
    const sigBuffer: ArrayBuffer = await crypto.subtle.sign('HMAC', key, message);
    const expected: string = Array.from(new Uint8Array(sigBuffer))
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');

    const fn: ComputeJobSig = await createComputeJobSig(secret);
    const actual: string = await fn(jobId, userId, createdAt);
    assertEquals(actual, expected);
});
