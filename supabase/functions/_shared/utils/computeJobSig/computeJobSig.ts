import type { ComputeJobSig } from './computeJobSig.interface.ts';

export async function createComputeJobSig(secret: string): Promise<ComputeJobSig> {
    const key: CryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    return async (jobId: string, userId: string, createdAt: string): Promise<string> => {
        const message: Uint8Array = new TextEncoder().encode(`${jobId}:${userId}:${createdAt}`);
        const sigBuffer: ArrayBuffer = await crypto.subtle.sign('HMAC', key, message);
        return Array.from(new Uint8Array(sigBuffer))
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join('');
    };
}
