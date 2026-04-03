// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.provides.ts
// Public surface for compressPrompt — consumers should import from this module only.

export { compressPrompt } from "./compressPrompt.ts";
export type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptFn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
  CompressPromptSuccessReturn,
} from "./compressPrompt.interface.ts";
export {
  isBoundCompressPromptFn,
  isCompressPromptDeps,
  isCompressPromptErrorReturn,
  isCompressPromptParams,
  isCompressPromptPayload,
  isCompressPromptSuccessReturn,
} from "./compressPrompt.guard.ts";
export {
  buildChatApiRequest,
  buildCompressPromptDeps,
  buildCompressPromptErrorReturn,
  buildCompressPromptParams,
  buildCompressPromptPayload,
  buildCompressPromptSuccessReturn,
  buildBoundCompressPromptFn,
  buildResourceDocument,
  buildTokenizerDeps,
  createCompressPromptMock,
  DbClient,
  describeCompressPromptReturnForTestFailure,
} from "./compressPrompt.mock.ts";
export type {
  CompressPromptDepsOverrides,
  CompressPromptMockCall,
  CompressPromptParamsOverrides,
  CompressPromptPayloadOverrides,
  CreateCompressPromptMockOptions,
} from "./compressPrompt.mock.ts";
