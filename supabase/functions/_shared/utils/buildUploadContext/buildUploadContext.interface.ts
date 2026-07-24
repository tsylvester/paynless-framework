import type { ContributionType } from "../../../dialectic-service/dialectic.interface.ts";
import type { Json } from "../../../types_db.ts";
import type {
  CanonicalPathParams,
  ModelContributionFileTypes,
  FileType,
  CompressionSourceType,
  DialecticStageSlug,
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

/**
 * Pre-resolved inputs for assembling `ResourceUploadContext` (COMPRESS jobs).
 * Every identity field is sourced 1:1 from `DialecticCompressJobPayload`.
 */
export interface BuildUploadContextResourceParams {
  /** Project UUID from the COMPRESS job payload. */
  projectId: string;
  /** Which compressed artifact this context targets: raw JSON or rendered Markdown. */
  storageFileType: FileType.CompressedContext | FileType.CompressedContextRawJson;
  /** Session UUID from the COMPRESS job payload. */
  sessionId: string;
  /** Iteration number from the COMPRESS job payload. */
  iterationNumber: number;
  /** Stage slug for path construction (e.g., 'thesis', 'synthesis'). */
  stageSlug: DialecticStageSlug;
  /** The compression target's document key / file type (e.g., FileType.business_case). */
  targetKey: ModelContributionFileTypes;
  /** The victim's source discriminator: 'contribution' | 'resource' | 'feedback' | 'history'. */
  sourceType: CompressionSourceType;
  /** Required when sourceType is 'contribution' or 'resource'; undefined otherwise. */
  documentKey: FileType | undefined;
  /** Required when sourceType is 'feedback' or 'history'; undefined otherwise. */
  sourceId: string | undefined;
  /** Map-reduce chunk index (1-based); undefined when not a chunked job. */
  chunkIndex: number | undefined;
  /** Map-reduce chunk total; undefined when not a chunked job. */
  chunkTotal: number | undefined;
  /** The compressed content to persist (JSON string or rendered Markdown). */
  contentForStorage: string;
  /** The project owner's user UUID for storage registration. */
  projectOwnerUserId: string;
  /** Human-readable description for the resource record. */
  description: string;
}
