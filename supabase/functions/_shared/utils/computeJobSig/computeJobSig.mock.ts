import type { ComputeJobSig } from './computeJobSig.interface.ts';

export const mockComputeJobSigSecret: string = 'mock-hmac-secret-32-chars-xxxxxxx';

export const mockComputeJobSig: ComputeJobSig = async (
    _jobId: string,
    _userId: string,
    _createdAt: string,
): Promise<string> => 'mock-sig';

export const mockComputeJobSigThrows: ComputeJobSig = async (
    _jobId: string,
    _userId: string,
    _createdAt: string,
): Promise<string> => {
    throw new Error('mock-compute-job-sig-error');
};

export function mockCreateComputeJobSig(
    _secretOverride?: string,
): () => Promise<ComputeJobSig> {
    return async (): Promise<ComputeJobSig> => mockComputeJobSig;
}
