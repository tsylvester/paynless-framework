// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.provides.ts
// Public surface for enqueueRenderJob — consumers should import from this module only.

export { enqueueRenderJob } from "./enqueueRenderJob.ts";
export type {
  EnqueueRenderJobDeps,
  EnqueueRenderJobErrorReturn,
  EnqueueRenderJobFn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobReturn,
  EnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.interface.ts";
export {
  isEnqueueRenderJobDeps,
  isEnqueueRenderJobErrorReturn,
  isEnqueueRenderJobParams,
  isEnqueueRenderJobPayload,
  isEnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.interface.guards.ts";
export type { EnqueueRenderJobMockCall } from "./enqueueRenderJob.mock.ts";
export { createEnqueueRenderJobMock } from "./enqueueRenderJob.mock.ts";
