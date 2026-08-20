import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger } from "../../_shared/types.ts";
import type {
  AiProvidersRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  CanonicalPathParams,
  ModelContributionFileTypes,
} from "../../_shared/types/file_manager.types.ts";

export interface ResolveContributionIdentityDeps {
  logger: ILogger;
}

export interface ResolveContributionIdentityParams {
  dbClient: SupabaseClient<Database>;
  job: DialecticJobRow;
  providerRow: AiProvidersRow;
  aiResponse: UnifiedAIResponse;
}

export type ResolveContributionIdentityPayload = DialecticExecuteJobPayload;

export interface ResolveContributionIdentitySuccessReturn {
  restOfCanonicalPathParams: CanonicalPathParams;
  storageFileType: ModelContributionFileTypes;
  sourceGroupFragment?: string;
  isContinuationForStorage: boolean;
  targetContributionId?: string;
  description: string;
}

export type ResolveContributionIdentityErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type ResolveContributionIdentityReturn =
  | ResolveContributionIdentitySuccessReturn
  | ResolveContributionIdentityErrorReturn;

export type ResolveContributionIdentityFn = (
  deps: ResolveContributionIdentityDeps,
  params: ResolveContributionIdentityParams,
  payload: ResolveContributionIdentityPayload,
) => Promise<ResolveContributionIdentityReturn>;

export type BoundResolveContributionIdentityFn = (
  params: ResolveContributionIdentityParams,
  payload: ResolveContributionIdentityPayload,
) => Promise<ResolveContributionIdentityReturn>;

export interface DocumentKeyErrorParams {
  jobId: string;
}

export class ResolveContributionIdentityDocumentKeyError extends Error {
  readonly jobId: string;
  constructor(params: DocumentKeyErrorParams) {
    super(`jobId: ${params.jobId}`);
    this.name = "ResolveContributionIdentityDocumentKeyError";
    this.jobId = params.jobId;
  }
}

export interface ProviderIdentifierErrorParams {
  jobId: string;
  providerId: string;
}

export class ResolveContributionIdentityProviderIdentifierError extends Error {
  readonly jobId: string;
  readonly providerId: string;
  constructor(params: ProviderIdentifierErrorParams) {
    super(`jobId: ${params.jobId}, providerId: ${params.providerId}`);
    this.name = "ResolveContributionIdentityProviderIdentifierError";
    this.jobId = params.jobId;
    this.providerId = params.providerId;
  }
}

export interface RelationshipsErrorParams {
  jobId: string;
  targetContributionId: string;
}

export class ResolveContributionIdentityRelationshipsError extends Error {
  readonly jobId: string;
  readonly targetContributionId: string;
  constructor(params: RelationshipsErrorParams) {
    super(
      `jobId: ${params.jobId}, targetContributionId: ${params.targetContributionId}`,
    );
    this.name = "ResolveContributionIdentityRelationshipsError";
    this.jobId = params.jobId;
    this.targetContributionId = params.targetContributionId;
  }
}

export interface ContinuationCountErrorParams {
  jobId: string;
  targetContributionId: string;
}

export class ResolveContributionIdentityContinuationCountError extends Error {
  readonly jobId: string;
  readonly targetContributionId: string;
  constructor(params: ContinuationCountErrorParams) {
    super(
      `jobId: ${params.jobId}, targetContributionId: ${params.targetContributionId}`,
    );
    this.name = "ResolveContributionIdentityContinuationCountError";
    this.jobId = params.jobId;
    this.targetContributionId = params.targetContributionId;
  }
}

export interface RawProviderResponseErrorParams {
  jobId: string;
}

export class ResolveContributionIdentityRawProviderResponseError extends Error {
  readonly jobId: string;
  constructor(params: RawProviderResponseErrorParams) {
    super(`jobId: ${params.jobId}`);
    this.name = "ResolveContributionIdentityRawProviderResponseError";
    this.jobId = params.jobId;
  }
}

export interface SourceGroupErrorParams {
  jobId: string;
  outputType: ModelContributionFileTypes;
}

export class ResolveContributionIdentitySourceGroupError extends Error {
  readonly jobId: string;
  readonly outputType: ModelContributionFileTypes;
  constructor(params: SourceGroupErrorParams) {
    super(`jobId: ${params.jobId}, outputType: ${params.outputType}`);
    this.name = "ResolveContributionIdentitySourceGroupError";
    this.jobId = params.jobId;
    this.outputType = params.outputType;
  }
}

export interface RecipeStepReadErrorParams {
  recipeStepId: string;
  table: string;
  driverMessage: string;
}

export class ResolveContributionIdentityRecipeStepReadError extends Error {
  readonly recipeStepId: string;
  readonly table: string;
  readonly driverMessage: string;
  constructor(params: RecipeStepReadErrorParams) {
    super(
      `recipeStepId: ${params.recipeStepId}, table: ${params.table}, driverMessage: ${params.driverMessage}`,
    );
    this.name = "ResolveContributionIdentityRecipeStepReadError";
    this.recipeStepId = params.recipeStepId;
    this.table = params.table;
    this.driverMessage = params.driverMessage;
  }
}
