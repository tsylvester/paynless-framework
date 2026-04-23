// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.provides.ts
// Public surface for prepareModelJob — consumers should import from this module only.

export { prepareModelJob } from "./prepareModelJob.ts";
export type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
export {
  isPrepareModelJobDeps,
  isPrepareModelJobErrorReturn,
  isPrepareModelJobParams,
  isPrepareModelJobPayload,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.guard.ts";
export type {
  MockPrepareModelJobFnOptions,
  MockPrepareModelJobFnCall,
  mockPrepareModelJobFn,
  mockPrepareModelJobDeps,
  mockPrepareModelJobParams,
  mockPrepareModelJobPayload,
  mockPrepareModelJobSuccessReturn,
  mockPrepareModelJobErrorReturn,
} from "./prepareModelJob.mock.ts";
