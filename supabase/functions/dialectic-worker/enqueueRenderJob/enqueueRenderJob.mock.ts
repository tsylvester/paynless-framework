// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.mock.ts

import type {
  EnqueueRenderJobDeps,
  EnqueueRenderJobFn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobReturn,
  EnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.interface.ts";

export type EnqueueRenderJobMockCall = {
  deps: EnqueueRenderJobDeps;
  params: EnqueueRenderJobParams;
  payload: EnqueueRenderJobPayload;
};

/**
 * Factory for a test double of {@link EnqueueRenderJobFn}: records each invocation
 * and returns a configured result, delegates to an optional handler, or defaults
 * to a skipped render (`renderJobId: null`).
 */
export function createEnqueueRenderJobMock(options?: {
  result?: EnqueueRenderJobReturn;
  handler?: EnqueueRenderJobFn;
}): {
  enqueueRenderJob: EnqueueRenderJobFn;
  calls: EnqueueRenderJobMockCall[];
} {
  const calls: EnqueueRenderJobMockCall[] = [];

  const enqueueRenderJob: EnqueueRenderJobFn = async (
    deps: EnqueueRenderJobDeps,
    params: EnqueueRenderJobParams,
    payload: EnqueueRenderJobPayload,
  ): Promise<EnqueueRenderJobReturn> => {
    calls.push({ deps, params, payload });
    if (options?.handler !== undefined) {
      return await options.handler(deps, params, payload);
    }
    if (options?.result !== undefined) {
      return options.result;
    }
    const fallback: EnqueueRenderJobSuccessReturn = { renderJobId: null };
    return fallback;
  };

  return { enqueueRenderJob, calls };
}
