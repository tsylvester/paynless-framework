// supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts
// Public surface for enqueueCompressJobs — consumers should import from this module only.

export { enqueueCompressJobs } from "./enqueueCompressJobs.ts";
export { CompressJobEnqueueError, CompressJobValidationError } from "./enqueueCompressJobs.interface.ts";
export type {
  BoundenqueueCompressJobsFn,
  DialecticCompressJobPayload,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsFn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsReturn,
  enqueueCompressJobsSuccessReturn,
} from "./enqueueCompressJobs.interface.ts";
export {
  isDialecticCompressJobPayload,
  isenqueueCompressJobsDeps,
  isenqueueCompressJobsErrorReturn,
  isenqueueCompressJobsParams,
  isenqueueCompressJobsPayload,
  isenqueueCompressJobsSuccessReturn,
} from "./enqueueCompressJobs.guard.ts";
export type {
  CompressJobEnqueueErrorOverrides,
  CompressJobValidationErrorOverrides,
  DialecticCompressJobPayloadOverrides,
  enqueueCompressJobsDepsOverrides,
  enqueueCompressJobsErrorReturnOverrides,
  enqueueCompressJobsParamsOverrides,
  enqueueCompressJobsPayloadOverrides,
  enqueueCompressJobsSuccessReturnOverrides,
} from "./enqueueCompressJobs.mock.ts";
export {
  buildCompressJobEnqueueError,
  buildCompressJobValidationError,
  buildDialecticCompressJobPayload,
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsErrorReturn,
  buildenqueueCompressJobsParams,
  buildenqueueCompressJobsPayload,
  buildenqueueCompressJobsSuccessReturn,
  mockBoundenqueueCompressJobsFn,
  mockEnqueueCompressJobsFn,
} from "./enqueueCompressJobs.mock.ts";
