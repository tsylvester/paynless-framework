// supabase/functions/dialectic-worker/saveResponse/saveResponse.provides.ts
// Public surface for saveResponse — consumers should import from this module only.

export { saveResponse } from "./saveResponse.ts";
export type {
  NodeTokenUsage,
  SaveResponseDeps,
  SaveResponseErrorReturn,
  SaveResponseFn,
  SaveResponseParams,
  SaveResponsePayload,
  SaveResponseRequestBody,
  SaveResponseReturn,
  SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";
export {
  isSaveResponseDeps,
  isSaveResponseErrorReturn,
  isSaveResponseParams,
  isSaveResponsePayload,
  isSaveResponseRequestBody,
  isSaveResponseSuccessReturn,
} from "./saveResponse.guard.ts";
export {
  createMockContributionRow,
  createMockDialecticExecuteJobPayload,
  createMockFileManager,
  createMockJobRow,
  createMockSaveResponseDeps,
  createMockSaveResponseErrorReturn,
  createMockSaveResponseParams,
  createMockSaveResponsePayload,
  createMockSaveResponseParamsWithQueuedJob,
  createMockSaveResponseSuccessReturn,
  createSaveResponseParamsForInterfaceContract,
  createValidHeaderContext,
  saveResponseTestPayload,
  saveResponseTestPayloadDocumentArtifact,
} from "./saveResponse.mock.ts";
export type {
  AiProviderRowOverrides,
  ContributionRowOverrides,
  CreateMockFileManagerOptions,
  CreateMockSaveResponseParamsOptions,
  DialecticExecuteJobPayloadOverrides,
  JobRowOverrides,
  SaveResponseDepsOverrides,
  SaveResponseErrorReturnOverrides,
  SaveResponseParamsOverrides,
  SaveResponsePayloadOverrides,
  SaveResponseSuccessReturnOverrides,
} from "./saveResponse.mock.ts";
