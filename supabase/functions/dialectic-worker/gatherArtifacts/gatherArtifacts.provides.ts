// supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.provides.ts
// Public surface for gatherArtifacts — consumers should import from this module only.

export { gatherArtifacts } from "./gatherArtifacts.ts";
export type {
  GatherArtifactsDeps,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsFn,
  GatherArtifactsSuccessReturn,
  GatherArtifactsErrorReturn,
  GatherArtifactsReturn,
  BoundGatherArtifactsFn,
} from "./gatherArtifacts.interface.ts";
export {
  isGatherArtifactsDeps,
  isGatherArtifactsParams,
  isGatherArtifactsPayload,
  isGatherArtifactsSuccessReturn,
  isGatherArtifactsErrorReturn,
} from "./gatherArtifacts.guard.ts";
export type {
  GatherArtifactsMockCall,
  CreateGatherArtifactsMockOptions,
  GatherArtifactsDepsOverrides,
} from "./gatherArtifacts.mock.ts";
export {
  buildGatherArtifactsDeps,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildDocumentRule,
  buildFeedbackRule,
  buildSeedPromptRule,
  buildProjectResourceRule,
  buildHeaderContextRule,
  buildDialecticProjectResourceRow,
  buildDialecticFeedbackRow,
  buildDialecticContributionRow,
  buildGatherArtifact,
  buildGatherArtifactsSuccessReturn,
  buildGatherArtifactsErrorReturn,
  buildSelectResult,
  buildSelectHandler,
  createGatherArtifactsMock,
} from "./gatherArtifacts.mock.ts";
