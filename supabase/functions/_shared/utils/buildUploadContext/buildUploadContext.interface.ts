import type { ContributionType } from "../../../dialectic-service/dialectic.interface.ts";
import type { Json } from "../../../types_db.ts";
import type {
  CanonicalPathParams,
  ModelContributionFileTypes,
} from "../../types/file_manager.types.ts";

/**
 * Model id and display name for contribution metadata (from provider resolution).
 */
export interface BuildUploadContextProviderDetails {
  id: string;
  name: string;
}

/**
 * Token usage and timing slice from the unified AI response.
 */
export interface BuildUploadContextAiResponseSlice {
  inputTokens?: number;
  outputTokens?: number;
  processingTimeMs?: number;
}

/**
 * Pre-resolved inputs for assembling `ModelContributionUploadContext` (EMCAS ~1325–1360).
 * Validation, sourceGroup extraction, and DB work stay at the call site.
 */
export interface BuildUploadContextParams {
  projectId: string;
  storageFileType: ModelContributionFileTypes;
  sessionId: string;
  iterationNumber: number;
  modelSlug: string;
  attemptCount: number;
  restOfCanonicalPathParams: Omit<CanonicalPathParams, "contributionType">;
  documentKey: string;
  contributionType: ContributionType | undefined;
  isContinuationForStorage: boolean;
  continuationCount: number | undefined;
  sourceGroupFragment: string | undefined;
  contentForStorage: string;
  projectOwnerUserId: string;
  description: string;
  providerDetails: BuildUploadContextProviderDetails;
  aiResponse: BuildUploadContextAiResponseSlice;
  sourcePromptResourceId: string | undefined;
  targetContributionId: string | undefined;
  documentRelationships: Json | null;
  isIntermediate: boolean | undefined;
}
