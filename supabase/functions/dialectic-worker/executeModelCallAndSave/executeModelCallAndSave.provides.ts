// Public surface for executeModelCallAndSave: types, implementation, guards, mocks.

export type {
  BoundExecuteModelCallAndSaveFn,
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveErrorReturn,
  ExecuteModelCallAndSaveFn,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
  ExecuteModelCallAndSaveReturn,
  ExecuteModelCallAndSaveSuccessReturn,
} from './executeModelCallAndSave.interface.ts';

export { executeModelCallAndSave } from './executeModelCallAndSave.ts';

export {
  isExecuteModelCallAndSaveDeps,
  isExecuteModelCallAndSaveErrorReturn,
  isExecuteModelCallAndSaveParams,
  isExecuteModelCallAndSavePayload,
  isExecuteModelCallAndSaveSuccessReturn,
} from './executeModelCallAndSave.interface.guard.ts';

export type {
  AiModelExtendedConfigOverrides,
  AiProvidersRowOverrides,
  ChatApiRequestOverrides,
  ChatMessageInsertOverrides,
  CreateMockDebitTokensFnParams,
  CreateMockDebitTokensOverrides,
  CreateMockDialecticContributionRowOverrides,
  CreateMockExecuteModelCallAndSaveParamsOptions,
  CreateMockFileManagerForEmcasOptions,
  DialecticJobRowOverrides,
  DialecticSessionRowOverrides,
  ExecuteModelCallAndSaveDepsOverrides,
  ExecuteModelCallAndSaveParamsOverrides,
  ExecuteModelCallAndSavePayloadOverrides,
  FactoryDependenciesOverrides,
  MockAiProviderAdapterOverrides,
  MockEmcasStreamParams,
} from './executeModelCallAndSave.mock.ts';

export {
  createMockAiModelExtendedConfig,
  createMockAiProviderAdapterInstance,
  createMockAiProvidersRow,
  createMockChatApiRequest,
  createMockChatMessageInsert,
  createMockDebitTokensFn,
  createMockDebitTokensSuccessFn,
  createMockDialecticContributionRow,
  createMockDialecticSessionRow,
  createMockEmcasAiAdapterHarness,
  createMockEmcasGetAiProviderAdapter,
  createMockExecuteModelCallAndSaveDeps,
  createMockExecuteModelCallAndSaveParams,
  createMockExecuteModelCallAndSavePayload,
  createMockFactoryDependencies,
  createMockFileManagerForEmcas,
  createMockJob,
  createMockSendMessageStreamFromParams,
  mockEmcasDefaultStreamTokenUsage,
  mockFullProviderConfig,
  mockSessionRow,
  testPayload,
  testPayloadContinuation,
  testPayloadDocumentArtifact,
} from './executeModelCallAndSave.mock.ts';
