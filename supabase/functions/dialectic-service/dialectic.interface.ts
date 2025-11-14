import { type ChatMessage, type ILogger } from '../_shared/types.ts';
import type { Database, Json, Tables } from '../types_db.ts';
import {
  downloadFromStorage,
} from '../_shared/supabase_storage_utils.ts';
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { Logger } from '../_shared/logger.ts';
import type { 
  IFileManager, 
  CanonicalPathParams, 
  ModelContributionFileTypes,
  FileType
} from '../_shared/types/file_manager.types.ts';
import { getExtensionFromMimeType } from '../_shared/path_utils.ts';
import type { DeleteStorageResult, DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type {
  FinishReason,
  FactoryDependencies,
  AiProviderAdapterInstance,
  AiProviderAdapter
} from '../_shared/types.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import type { IIndexingService, IEmbeddingClient } from '../_shared/services/indexing_service.interface.ts';
import type { IRagService } from '../_shared/services/rag_service.interface.ts';
import type { Messages, AiModelExtendedConfig, ChatApiRequest } from '../_shared/types.ts';
import type { CountTokensDeps, CountableChatPayload } from '../_shared/types/tokenizer.types.ts';
import type { IPromptAssembler, AssembledPrompt } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import type { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import type { debitTokens } from '../chat/debitTokens.ts';
import { ICompressionStrategy } from '../_shared/utils/vector_utils.ts';
import type { ServiceError } from "../_shared/types.ts";
import type { IDocumentRenderer } from '../_shared/services/document_renderer.interface.ts';
import type { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';

export type DialecticStageRecipeEdge = Database['public']['Tables']['dialectic_stage_recipe_edges']['Row'];
export type DialecticStageRecipeInstance = Database['public']['Tables']['dialectic_stage_recipe_instances']['Row'];

// Explicit function type definitions for worker processors (no implementation imports)
export type ProcessSimpleJobFn = (
  dbClient: SupabaseClient<Database>,
  job: DialecticJobRow & { payload: DialecticExecuteJobPayload },
  projectOwnerUserId: string,
  deps: IDialecticJobDeps,
  authToken: string,
) => Promise<void>;

export type ProcessComplexJobFn = (
  dbClient: SupabaseClient<Database>,
  job: DialecticJobRow & { payload: DialecticPlanJobPayload },
  projectOwnerUserId: string,
  deps: IDialecticJobDeps,
  authToken: string,
) => Promise<void>;

export type ProcessRenderJobFn = (
  dbClient: SupabaseClient<Database>,
  job: DialecticJobRow,
  projectOwnerUserId: string,
  deps: IDialecticJobDeps,
  authToken: string,
) => Promise<void>;

export type PlanComplexStageFn = (
  dbClient: SupabaseClient<Database>,
  parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
  deps: IDialecticJobDeps,
  recipeStep: DialecticRecipeStep,
  authToken: string,
) => Promise<DialecticJobRow[]>;

export interface IJobProcessors {
  processSimpleJob: ProcessSimpleJobFn;
  processComplexJob: ProcessComplexJobFn;
  planComplexStage: PlanComplexStageFn;
  processRenderJob: ProcessRenderJobFn;
}

export interface IRenderJobDeps {
  documentRenderer: IDocumentRenderer;
  logger: ILogger;
  downloadFromStorage: DownloadFromStorageFn;
  fileManager: IFileManager;
  notificationService: NotificationServiceType;
}

export type JobType = 'PLAN' | 'EXECUTE' | 'RENDER';
export const JobTypes: readonly JobType[] = ['PLAN', 'EXECUTE', 'RENDER'];
export type PromptType = 'Seed' | 'Planner' | 'Turn' | 'Continuation';
export const PromptTypes: readonly PromptType[] = ['Seed', 'Planner', 'Turn', 'Continuation'];

export type GranularityStrategy =
  | 'per_source_document'
  | 'pairwise_by_origin'
  | 'per_source_group'
  | 'all_to_one'
  | 'per_source_document_by_lineage'
  | 'per_model';
export const GranularityStrategies: readonly GranularityStrategy[] = [
  'per_source_document',
  'pairwise_by_origin',
  'per_source_group',
  'all_to_one',
  'per_source_document_by_lineage',
  'per_model'
];

export type DialecticRecipeTemplateStep =
  & Omit<
    Tables<'dialectic_recipe_template_steps'>,
    'job_type' | 'prompt_type' | 'granularity_strategy' | 'inputs_required' | 'inputs_relevance' | 'outputs_required' | 'output_type'
  >
  & {
    job_type: JobType;
    prompt_type: PromptType;
    granularity_strategy: GranularityStrategy;
    inputs_required: InputRule[];
    inputs_relevance: RelevanceRule[];
    outputs_required: OutputRule;
    output_type: ModelContributionFileTypes;
  };

export type DialecticStageRecipeStep =
  & Omit<
    Tables<'dialectic_stage_recipe_steps'>,
    'job_type' | 'prompt_type' | 'granularity_strategy' | 'inputs_required' | 'inputs_relevance' | 'outputs_required' | 'output_type'
  >
  & {
    job_type: JobType;
    prompt_type: PromptType;
    granularity_strategy: GranularityStrategy;
    inputs_required: InputRule[];
    inputs_relevance: RelevanceRule[];
    outputs_required: OutputRule;
    output_type: FileType;
  };

// DTOs for Stage Recipe responses (instance-first; template-ready)
// Normalized view tailored for frontend consumption; avoids leaking DB-only columns.
export interface StageRecipeStepDto {
  id: string;
  step_key: string;
  step_slug: string;
  step_name: string;
  execution_order: number;
  parallel_group?: number | null;
  branch_key?: BranchKey | null;
  job_type: JobType;
  prompt_type: PromptType;
  prompt_template_id?: string | null;
  output_type: OutputType; // Mapped from ModelContributionFileTypes
  granularity_strategy: GranularityStrategy;
  inputs_required: InputRule[];
  inputs_relevance?: RelevanceRule[];
  outputs_required?: OutputRule[];
}

export interface StageRecipeResponse {
  stageSlug: string;
  instanceId: string;
  steps: StageRecipeStepDto[];
}

// Reserved for future template responses (CoW DAG support without refactor)
export interface TemplateRecipeStepDto extends StageRecipeStepDto {}

export type SeedPromptRecipeStep = {
  prompt_type: 'Seed';
  step_number: 1; 
  step_name: 'Assemble Seed Prompt'; 
  granularity_strategy?: null;
  branch_key?: null;
  parallel_group?: null;
  output_type?: 'seed_prompt';
  description?: 'Assemble the seed prompt for the session.';
  inputs_required?: [];
  outputs_required?: [];
  inputs_relevance?: [];
  prompt_template_id?: null;
  job_type?: null;
};

export type DialecticRecipeStep = DialecticRecipeTemplateStep | DialecticStageRecipeStep | SeedPromptRecipeStep;

export type StageWithRecipeSteps = {
  dialectic_stage: Tables<'dialectic_stages'>;
  dialectic_stage_recipe_instances: Tables<'dialectic_stage_recipe_instances'>;
  dialectic_stage_recipe_steps: DialecticStageRecipeStep[];
};

export type DatabaseRecipeSteps = Tables<'dialectic_stages'> & {
  dialectic_stage_recipe_instances: (Tables<'dialectic_stage_recipe_instances'> & {
    dialectic_stage_recipe_steps: Tables<'dialectic_stage_recipe_steps'>[];
  })[];
};

export type DialecticProjectRow = Database['public']['Tables']['dialectic_projects']['Row'];
export type DialecticProjectInsert = Database['public']['Tables']['dialectic_projects']['Insert'];
export type DialecticProjectResourceRow = Database['public']['Tables']['dialectic_project_resources']['Row']; // For typing original resources
export type DialecticSessionInsert = Database['public']['Tables']['dialectic_sessions']['Insert'];
export type DialecticContributionRow = Database['public']['Tables']['dialectic_contributions']['Row'];
export type DialecticJobRow = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
export type DialecticMemoryRow = Database['public']['Tables']['dialectic_memory']['Row'];
export type DialecticFeedbackRow = Database['public']['Tables']['dialectic_feedback']['Row'];

export type StorageError = {
  message: string;
  error?: string;
  statusCode?: string;
};

export type SystemInstruction = string;
export type Prompt = string;

export interface AIModelCatalogEntry {
    id: string;
    provider_name: string;
    model_name: string;
    api_identifier: string;
    description: string | null;
    strengths: string[] | null;
    weaknesses: string[] | null;
    context_window_tokens: number | null;
    input_token_cost_usd_millionths: number | null;
    output_token_cost_usd_millionths: number | null;
    supports_image_input?: boolean;
    supports_video_input?: boolean;
    supports_audio_input?: boolean;
    max_output_tokens: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// Defines the structured contribution object used within the service and for API responses,
// aligning with packages/types/src/dialectic.types.ts

//This type needs to be reset to be a row from the database
export interface DialecticContribution {
  id: string;
  session_id: string;
  user_id: string | null;
  stage: string | null;
  iteration_number: number;
  model_id: string | null;
  model_name: string | null;
  prompt_template_id_used: string | null;
  seed_prompt_url: string | null;
  edit_version: number;
  is_latest_edit: boolean;
  original_model_contribution_id: string | null;
  raw_response_storage_path: string | null;
  target_contribution_id: string | null;
  tokens_used_input: number | null;
  tokens_used_output: number | null;
  processing_time_ms: number | null;
  error: string | null;
  citations: { text: string; url?: string }[] | null;
  created_at: string;
  updated_at: string;
  contribution_type: ContributionType | null;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
}

export type ContributionType =
  | 'thesis'
  | 'antithesis'
  | 'synthesis'
  | 'parenthesis'
  | 'paralysis'
  | 'pairwise_synthesis_chunk'
  | 'reduced_synthesis'
  | 'rag_context_summary';


export interface DialecticSessionModel {
    id: string;
    session_id: string;
    model_id: string;
    model_role: string | null;
    created_at: string;
    ai_provider?: AIModelCatalogEntry;
}

//This type needs to be reset to be a row from the database
export interface DialecticSession {
  id: string;
  project_id: string;
  session_description: string | null;
  user_input_reference_url: string | null;
  iteration_count: number;
  selected_model_ids: string[] | null;
  status: string | null;
  associated_chat_id: string | null;
  current_stage_id: string | null;
  created_at: string;
  updated_at: string;
}

export type DialecticProcessTemplate = Database['public']['Tables']['dialectic_process_templates']['Row'];

//This type needs to be reset to be a row from the database
export interface DialecticProject {
    id: string;
    user_id: string;
    project_name: string;
    initial_user_prompt: string;
    initial_prompt_resource_id?: string | null;
    selected_domain_id: string;
    domain_name?: string; // Will be populated by JOINs
    domain_description?: string; // Will be populated by JOINs
    process_template?: DialecticProcessTemplate | null;
    selected_domain_overlay_id?: string | null;
    repo_url: Json | null;
    status: string;
    created_at: string;
    updated_at: string;
    dialectic_sessions?: DialecticSession[];
}

// --- END: Redefined types ---

// --- START: Discriminated Union for Type-Safe Service Requests ---
// Define each action as a type with a literal `action` and a specific `payload`.
// This allows TypeScript to infer the payload type based on the action string.

// Actions with NO payload
type ListProjectsAction = { action: 'listProjects' };
type ListAvailableDomainsAction = { action: 'listAvailableDomains', payload?: { stageAssociation?: string } }; // Optional payload
type ListDomainsAction = { action: 'listDomains' };

// Actions WITH a payload
type UpdateProjectDomainAction = { action: 'updateProjectDomain', payload: UpdateProjectDomainPayload };
type GetProjectDetailsAction = { action: 'getProjectDetails', payload: GetProjectDetailsPayload };
type StartSessionAction = { action: 'startSession', payload: StartSessionPayload };
type GenerateContributionsAction = { action: 'generateContributions', payload: GenerateContributionsPayload };
type GetContributionContentDataAction = { action: 'getContributionContentData', payload: GetContributionContentDataPayload };
type DeleteProjectAction = { action: 'deleteProject', payload: DeleteProjectPayload };
type CloneProjectAction = { action: 'cloneProject', payload: CloneProjectPayload };
type ExportProjectAction = { action: 'exportProject', payload: ExportProjectPayload };
type GetProjectResourceContentAction = { action: 'getProjectResourceContent', payload: GetProjectResourceContentPayload };
type SaveContributionEditAction = { action: 'saveContributionEdit', payload: SaveContributionEditPayload };
type SubmitStageResponsesAction = { action: 'submitStageResponses', payload: SubmitStageResponsesPayload };
type ListAvailableDomainOverlaysAction = { action: 'listAvailableDomainOverlays', payload: ListAvailableDomainOverlaysPayload };
type FetchProcessTemplateAction = { action: 'fetchProcessTemplate', payload: FetchProcessTemplatePayload };
type UpdateSessionModelsAction = { action: 'updateSessionModels', payload: UpdateSessionModelsPayload };

// Define new payload and action for getSessionDetails
export interface GetSessionDetailsPayload { // Export if it might be used externally, otherwise keep as local type
  sessionId: string;
}
type GetSessionDetailsAction = { action: 'getSessionDetails', payload: GetSessionDetailsPayload };

export interface GetStageRecipePayload {
  stageSlug: string;
}
type GetStageRecipeAction = { action: 'getStageRecipe', payload: GetStageRecipePayload };

export interface ListStageDocumentsPayload {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  userId: string;
  projectId: string;
}
type ListStageDocumentsAction = {
  action: 'listStageDocuments';
  payload: ListStageDocumentsPayload;
};

// The main union type for all possible JSON requests to the service.
export type DialecticServiceRequest =
  | ListProjectsAction
  | ListAvailableDomainsAction
  | ListDomainsAction
  | UpdateProjectDomainAction
  | GetProjectDetailsAction
  | StartSessionAction
  | GenerateContributionsAction
  | GetContributionContentDataAction
  | DeleteProjectAction
  | CloneProjectAction
  | ExportProjectAction
  | GetProjectResourceContentAction
  | SaveContributionEditAction
  | SubmitStageResponsesAction
  | ListAvailableDomainOverlaysAction
  | FetchProcessTemplateAction
  | UpdateSessionModelsAction
  | GetSessionDetailsAction
  | GetStageRecipeAction
  | ListStageDocumentsAction
  | SubmitStageDocumentFeedbackAction;

// --- END: Discriminated Union ---

export interface SubmitStageDocumentFeedbackPayload {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  documentKey: string;
  modelId: string;
  feedbackContent: string;
  userId: string;
  projectId: string;
  feedbackId?: string;
  feedbackType: string;
}
type SubmitStageDocumentFeedbackAction = {
  action: 'submitStageDocumentFeedback';
  payload: SubmitStageDocumentFeedbackPayload;
};

// --- START: DTOs for listStageDocuments ---

export interface StageDocumentDescriptorDto {
  documentKey: string;
  modelId: string;
  lastRenderedResourceId: string | null;
}

export interface ListStageDocumentsResponse {
  documents: StageDocumentDescriptorDto[];
}

// --- END: DTOs for listStageDocuments ---

export interface CreateProjectPayload {
  projectName: string;
  initialUserPrompt: string;
  selectedDomainId: string;
  selected_domain_overlay_id?: string | null;
}

export interface UpdateProjectDomainPayload {
  projectId: string;
  selectedDomainId: string;
}

export interface UpdateProjectDomainSuccessData {
  id: string;
  project_name: string;
  selected_domain_id: string;
  updated_at: string;
}

export interface GetProjectDetailsPayload { 
  projectId: string;
}

export interface GetContributionContentDataPayload {
  contributionId: string;
}

export interface DeleteProjectPayload {
  projectId: string;
}

export interface CloneProjectPayload {
  projectId: string;
  newProjectName?: string;
}

export interface ExportProjectPayload {
  projectId: string;
}

export interface StartSessionPayload {
  projectId: string;
  sessionDescription?: string | null;
  selectedModelIds: string[];
  originatingChatId?: string | null;
  stageSlug?: string;
}

export interface UpdateSessionModelsPayload {
  sessionId: string;
  selectedModelIds: string[];
}

export type StartSessionSuccessResponse = DialecticSession & {
  seedPrompt: AssembledPrompt;
};

export interface CallUnifiedAIModelOptions {
  walletId?: string;
  customParameters?: {
    historyMessages?: ChatMessage[]; 
    max_tokens_to_generate?: number;
  };
  currentStageSystemPromptId?: string | null; 
}

export interface UnifiedAIResponse {
  content: string | null;
  error?: string | null;
  errorCode?: string | null; // e.g., 'MODEL_QUOTA_EXCEEDED', 'API_ERROR', 'TIMEOUT'
  inputTokens?: number;
  outputTokens?: number;
  tokenUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number } | null;
  processingTimeMs?: number;
  contentType?: string; // Added to specify the MIME type of the content
  rawProviderResponse?: Record<string, unknown>; 
  finish_reason?: FinishReason;
}

export interface CallModelDependencies {
  fetch?: typeof fetch;
  isTest?: boolean;
}

export type DialecticStage = Database['public']['Tables']['dialectic_stages']['Row'];

export interface ModelProcessingResult {
  modelId: string;
  status: 'completed' | 'failed' | 'needs_continuation';
  attempts: number;
  contributionId?: string;
  error?: string;
}

export interface JobResultsWithModelProcessing {
    modelProcessingResults: ModelProcessingResult[];
}

export interface GenerateContributionsDeps {
  callUnifiedAIModel?: (
    chatApiRequest: ChatApiRequest,
    userAuthToken: string, 
    dependencies?: CallModelDependencies,
  ) => Promise<UnifiedAIResponse>;
  downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>;
  getExtensionFromMimeType: typeof getExtensionFromMimeType;
  logger: ILogger;
  randomUUID: () => string;
  fileManager: IFileManager;
  deleteFromStorage: (bucket: string, paths: string[]) => Promise<DeleteStorageResult>;
}
export interface GenerateContributionsPayload {
  sessionId: string;
  projectId: string;
  stageSlug?: DialecticStage['slug'];
  iterationNumber?: number;
  chatId?: string | null;
  walletId: string;
  continueUntilComplete?: boolean;
  maxRetries?: number;
  continuation_count?: number;
  target_contribution_id?: string;
  user_jwt?: string;
  is_test_job?: boolean;
}

/**
 * Defines the canonical structure for the "Header Context"
 * produced by a PLANNER job. This object provides the shared context
 * for all subsequent document generation jobs within a stage.
 */
export interface SystemMaterials {
  progress_update?: string; // This is optional and a remnant of the old monolithic stage generation feature where we had to tell the model what documents they'd already generated.
  stage_rationale: string;
  executive_summary: string; // This is the primary means of the agent communicating its intent to itself through different documents, to keep the generation aligned across documents.
  input_artifacts_summary: string; // This is how we detail what artifacts the agent will use to generate the documents.
  // Optional, for model self-correction and introspection
  diversity_rubric?: { [key: string]: string }; // This is how the agent is directed to decide whether to use standard or non-standard approaches.
  quality_standards?: string[]; // These are quality standards that the agent should follow when generating the documents.
  validation_checkpoint?: string[]; // This is how the agent self-evaluates whether it's generated what it's been asked to generate. 
  decision_criteria?: string[]; // This is the standard the agent uses to decide which approach to take as defined by the rubric.
  milestones?: string[]; // This is the list of milestones the agent will use to track its progress.
  dependency_rules?: string[]; // This is the list of dependency rules the agent will use to determine which documents to generate.
  status_preservation_rules?: { [key: string]: string }; // This is the list of status preservation rules the agent will use to determine which documents to generate.
  generation_limits?: { max_steps: number }; // This is the maximum number of steps the agent will take to generate the documents.
  document_order?: string[]; // This is the order in which the agent will generate the documents.
  current_document?: string; // This is the current document the agent is working on.
  iteration_metadata?: { iteration_number: number }; // This is the iteration number the agent is working on.
  exhaustiveness_requirement?: string; // This is the exhaustiveness requirement the agent will use to determine which documents to generate.
  technical_requirements_outline_inputs?: { subsystems: string[] }; // This is the list of subsystems the agent will use to generate the documents.
}

export enum BranchKey {

  // Thesis
  business_case = 'business_case',
  feature_spec = 'feature_spec',
  technical_approach = 'technical_approach',
  success_metrics = 'success_metrics',

  // Antithesis
  business_case_critique = 'business_case_critique',
  technical_feasibility_assessment = 'technical_feasibility_assessment',
  risk_register = 'risk_register',
  non_functional_requirements = 'non_functional_requirements',
  dependency_map = 'dependency_map',
  comparison_vector = 'comparison_vector',

  // Synthesis
  synthesis_pairwise_business_case = 'synthesis_pairwise_business_case',
  synthesis_pairwise_feature_spec = 'synthesis_pairwise_feature_spec',
  synthesis_pairwise_technical_approach = 'synthesis_pairwise_technical_approach',
  synthesis_pairwise_success_metrics = 'synthesis_pairwise_success_metrics',
  synthesis_document_business_case = 'synthesis_document_business_case',
  synthesis_document_feature_spec = 'synthesis_document_feature_spec',
  synthesis_document_technical_approach = 'synthesis_document_technical_approach',
  synthesis_document_success_metrics = 'synthesis_document_success_metrics',
  product_requirements = 'product_requirements',
  system_architecture = 'system_architecture',
  tech_stack = 'tech_stack',

  // Parenthesis
  technical_requirements = 'technical_requirements',
  master_plan = 'master_plan',
  milestone_schema = 'milestone_schema',

  // Paralysis
  actionable_checklist = 'actionable_checklist',
  updated_master_plan = 'updated_master_plan',
  advisor_recommendations = 'advisor_recommendations',
}

export enum OutputType {
  RenderedDocument = 'RenderedDocument',
  HeaderContext = 'HeaderContext',
  AssembledDocumentJson = 'AssembledDocumentJson',
}

/**
 * Tracks the progress of a multi-step job.
 */
export interface DialecticStepPlannerMetadata {
    recipe_template_id?: string;
    recipe_step_id?: string;
    stage_slug?: string;
    description?: string;
    dependencies?: readonly string[];
    parallel_successors?: readonly string[];
    [key: string]: unknown;
}

/**
 * The base payload containing information common to all job types.
 */
export interface DialecticBaseJobPayload extends Omit<GenerateContributionsPayload, 'selectedModelIds' | 'chatId'> {
    model_id: string; // Individual model ID for this specific job
}

/**
 * The payload for a simple, single-call job.
 */
export interface DialecticSimpleJobPayload extends DialecticBaseJobPayload {
    job_type?: 'simple';
}

/**
 * The payload for a parent job that plans steps based on a recipe.
 */
export interface DialecticPlanJobPayload extends DialecticBaseJobPayload {
    job_type: JobType;
}

/**
 * Defines the possible roles a related document can have in a relationship.
 * This extends the ContributionType to also include abstract roles.
 */
export type RelationshipRole = ContributionType | 'source_group';

/**
 * Defines the structured relationships between documents as a flexible,
 * type-safe dictionary where the key is the role the related document plays.
 */
export type DocumentRelationships = {
  [key in RelationshipRole]?: string | null;
};

/**
 * The payload for a child job that executes a single model call.
 */
export interface DialecticExecuteJobPayload extends DialecticBaseJobPayload {
    job_type: 'execute';
    prompt_template_id: string;
    output_type: ModelContributionFileTypes; // The type of artifact this job will produce
    canonicalPathParams: CanonicalPathParams; // The new formal contract for path context
    inputs: {
        // Key-value store for resource_ids needed by the prompt
        [key: string]: string | string[];
    };
    document_key?: string | null;
    branch_key?: string | null;
    parallel_group?: number | null;
    planner_metadata?: DialecticStepPlannerMetadata | null;
    document_relationships?: DocumentRelationships | null;
    isIntermediate?: boolean;
    user_jwt?: string;
}

export interface DialecticRenderJobPayload extends DialecticBaseJobPayload {
    job_type: 'RENDER';
    documentIdentity: string;
    documentKey: FileType;
    sourceContributionId: string;
}

// Update the main union type
export type DialecticJobPayload =
    | DialecticSimpleJobPayload // Assuming this exists for non-complex jobs
    | DialecticPlanJobPayload
    | DialecticExecuteJobPayload

export interface PromptConstructionPayload {
  systemInstruction?: SystemInstruction;
  conversationHistory: Messages[];
  resourceDocuments: SourceDocument[];
  currentUserPrompt: Prompt;
  source_prompt_resource_id?: string;
}

export interface GenerateContributionsSuccessResponse {
  sessionId: string;
  projectId: string;
  stage: string;
  iteration: number;
  status: string;
  successfulContributions: DialecticContribution[];
  failedAttempts: FailedAttemptError[];
}

export interface FailedAttemptError {
  modelId: string;
  modelName?: string;
  providerName?: string | null;
  error: string;
  details?: string;
  code?: string;
  inputTokens?: number;
  outputTokens?: number;
  processingTimeMs?: number;
  api_identifier: string;   
}

export interface SelectedAiProvider {
  id: string;                 
  provider: string | null;
  name: string;
  api_identifier: string;   
}

export interface ResourceDescription {
  type: 'seed_prompt' | string; // Allow other string types for extensibility
  session_id: string;
  stage_slug: string;
  iteration: number;
}

export function isResourceDescription(obj: unknown): obj is ResourceDescription {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'type' in obj && typeof obj.type === 'string' &&
    'session_id' in obj && typeof obj.session_id === 'string' &&
    'stage_slug' in obj && typeof obj.stage_slug === 'string' &&
    'iteration' in obj && typeof obj.iteration === 'number'
  );
}

export interface ContributionWithNestedOwner {
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_name: string | null;
  dialectic_sessions: {
    project_id: string | null;
    dialectic_projects: {
      user_id: string | null;
    } | null;
  } | null;
}

// --- START: Added for Project Resource Upload (1.0.B) ---
export interface DialecticProjectResource {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  resource_description: string | null;
  status: "active" | "inactive" | "archived" | "error";
  created_at: string;
  updated_at: string;
  embeddings_status?: "pending" | "completed" | "failed" | "in-progress";
  last_embedded_at?: string | null;
  checksum?: string | null;
  processing_status?: "pending" | "completed" | "failed" | "in-progress";
  processing_error?: string | null;
  metadata?: Record<string, unknown> | null; // For any other structured data
}

// --- END: Added for Project Resource Upload (1.0.B) ---

export interface DomainOverlayDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainId: string;
  description: string | null;
  stageAssociation: string; // Corresponds to system_prompts.stage_association
  overlay_values: Record<string, unknown> | string | null;
}

export interface ListAvailableDomainOverlaysPayload {
  stageAssociation: string;
}


export interface GetContributionContentSignedUrlPayload {
  contributionId: string;
}

export interface CloneProjectSuccessResponse {
  id: string;
  project_name: string;
  created_at: string;
}

export interface ExportProjectSuccessResponse {
  export_url: string;
}

export interface GetProjectResourceContentPayload {
  resourceId: string;
  fileName?: string;
}

export interface GetProjectResourceContentResponse {
  fileName: string;
  mimeType: string;
  content: string;
}

// Added for 1.2.Y.2
export interface SaveContributionEditPayload {
  originalContributionIdToEdit: string;
  editedContentText: string;
  // session_id is implied by the originalContributionIdToEdit and will be fetched
}

// Updated DialecticFeedback to match the new file-based schema
export interface DialecticFeedback {
  id: string;
  session_id: string;
  project_id: string; // Added
  user_id: string;
  stage_slug: string; // Added
  iteration_number: number; // Added
  storage_bucket: string; // Added
  storage_path: string; // Added
  file_name: string; // Added
  mime_type: string; // Added
  size_bytes: number; // Added
  feedback_type: string; // Kept, ensure it's used for the file's purpose type
  resource_description?: Json | null; // Added, replaces feedback_value_structured
  created_at: string;
  updated_at: string;
  // contribution_id: string | null; // Removed
  // feedback_value_text: string | null; // Removed
  // feedback_value_structured: Record<string, unknown> | null; // Removed, replaced by resource_description
}

export interface SubmitStageResponseItem {
  originalContributionId: string;
  responseText: string;
  rating?: number;
}

export interface SubmitStageResponsesPayload { 
  sessionId: string;
  projectId: string;
  stageSlug: DialecticStage['slug'];
  currentIterationNumber: number;
  responses: SubmitStageResponseItem[];
  userStageFeedback?: { 
    content: string; 
    feedbackType: string; 
    resourceDescription?: Json | null; 
  };
}

export interface SubmitStageResponsesResponse {
  message: string;
  updatedSession: DialecticSession;
}

// Add new types for handling artifact assembly rules
export interface BaseArtifactSourceRule {
  purpose?: string;
  required?: boolean;
  multiple?: boolean;
  section_header?: string;
}

export interface StageSpecificArtifactSourceRule extends BaseArtifactSourceRule {
  type: 'contribution' | 'feedback';
  stage_slug: string;
}

export interface InitialPromptArtifactSourceRule extends BaseArtifactSourceRule {
  type: 'initial_project_prompt';
  stage_slug?: undefined; // Explicitly undefined or can be omitted
}

export type ArtifactSourceRule = StageSpecificArtifactSourceRule | InitialPromptArtifactSourceRule;

export interface InputArtifactRules {
  sources: ArtifactSourceRule[];
}

// Local response type definition to align with DB schema, avoiding interface mismatches.
export interface SubmitStageResponsesDependencies {
    downloadFromStorage: typeof downloadFromStorage;
    logger: ILogger;
    fileManager: IFileManager;
    promptAssembler?: IPromptAssembler;
    indexingService: IIndexingService;
    embeddingClient: IEmbeddingClient;
}

export type DialecticStageTransition = Database['public']['Tables']['dialectic_stage_transitions']['Row'];

export interface FetchProcessTemplatePayload {
  templateId: string;
}

export type UploadAndRegisterResourceFn = (
  dbClient: SupabaseClient,
  user: User,
  logger: Logger,
  projectId: string,
  fileContent: Blob,
  fileName: string,
  mimeType: string,
  resourceDescription: string,
) => Promise<{
  data?: DialecticProjectResource;
  error?: { message: string; details?: string; status: number };
}>;

export type UploadContext = {
  pathContext: {
    projectId: string;
    sessionId: string;
    stageSlug: string;
    iterationNumber: number;
    fileType: string;
    originalFileName: string;
  };
};

export interface GetContributionContentDataResponse {
  content: string;
  mimeType: string;
  sizeBytes: number | null;
  fileName: string | null;
}

// Added GetSessionDetailsResponse interface
export interface GetSessionDetailsResponse {
  session: DialecticSession;
  currentStageDetails: DialecticStage | null;
  activeSeedPrompt: AssembledPrompt | null;
}

export interface ProgressReporting {
  message_template: string;
}

export interface DialecticServiceError {
  message: string;
  details?: string;
  status?: number;
}

export interface DialecticServiceResponse<T> {
  data?: T;
  error?: DialecticServiceError;
}

export type SeedPromptData = {
  content: string;
  fullPath: string;
  bucket: string;
  path: string;
  fileName: string;
};
export interface ModelProcessingResult {
  modelId: string;
  status: 'completed' | 'failed' | 'needs_continuation';
  attempts: number;
  contributionId?: string;
  error?: string;
}

export interface IContinueJobDeps {
  logger: ILogger;
}

export interface IContinueJobResult {
    enqueued: boolean;
    error?: Error;
}

export type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export type SourceDocument = Omit<DialecticContributionRow, 'document_relationships'> & { 
  content: string;
  document_relationships?: DocumentRelationships | null;
  attempt_count?: number; // The attempt_count of the source document itself, derived from its filename
  document_key?: string; 
  type?: string;
  stage_slug?: string;
};

export type SourceFeedback = Omit<DialecticFeedback, 'resource_description'> & { 
  content: string;
  document_relationships?: DocumentRelationships | null;
  attempt_count?: number; // The attempt_count of the source document itself, derived from its filename
};

export interface ExecuteModelCallAndSaveParams {
  dbClient: SupabaseClient<Database>;
  deps: IDialecticJobDeps;
  authToken: string;
  job: DialecticJobRow;
  projectOwnerUserId: string;
  providerDetails: SelectedAiProvider;
  promptConstructionPayload: PromptConstructionPayload;
  sessionData: DialecticSession;
  compressionStrategy: ICompressionStrategy;
  inputsRelevance?: RelevanceRule[];
  inputsRequired?: InputRule[];
}
export interface IDialecticJobDeps extends GenerateContributionsDeps {
  getSeedPromptForStage: (
    dbClient: SupabaseClient<Database>,
    projectId: string,
    sessionId: string,
    stageSlug: string,
    iterationNumber: number,
    downloadFromStorage: GenerateContributionsDeps['downloadFromStorage']
  ) => Promise<SeedPromptData>;
  continueJob: (
    deps: IContinueJobDeps,
    dbClient: SupabaseClient<Database>,
    job: DialecticJobRow,
    aiResponse: UnifiedAIResponse,
    savedContribution: DialecticContributionRow,
    projectOwnerUserId: string,
  ) => Promise<IContinueJobResult>;
  retryJob: (
    deps: { logger: ILogger, notificationService: NotificationServiceType },
    dbClient: SupabaseClient<Database>,
    job: DialecticJobRow,
    currentAttempt: number,
    failedContributionAttempts: FailedAttemptError[],
    projectOwnerUserId: string
  ) => Promise<{ error?: Error }>;
  notificationService: NotificationServiceType;
  executeModelCallAndSave: (params: ExecuteModelCallAndSaveParams) => Promise<void>;
  // Properties from the former IPlanComplexJobDeps
        planComplexStage?: PlanComplexStageFn;
  getGranularityPlanner?: (strategyId: string) => GranularityPlannerFn | undefined;
  ragService?: IRagService;
  countTokens?: (deps: CountTokensDeps, payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number;
  getAiProviderConfig?: (dbClient: SupabaseClient<Database>, modelId: string) => Promise<AiModelExtendedConfig>;
  indexingService?: IIndexingService;
  embeddingClient?: IEmbeddingClient;
  promptAssembler?: IPromptAssembler;
  getAiProviderAdapter?: (deps: FactoryDependencies) => AiProviderAdapterInstance | null;
  tokenWalletService?: ITokenWalletService;
  documentRenderer: IDocumentRenderer;
  debitTokens?: typeof debitTokens;
}
export type RecipeStep = {
    step_name: string;
    description: string;
    granularity_strategy: string;
    inputs_required: { type: string; stage_slug?: string }[];
    output_type: string;
    job_type_to_create: 'plan' | 'execute';
    prompt_template_name: string;
}

export type GranularityPlannerFn = (
    sourceDocs: SourceDocument[],
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    recipeStep: DialecticRecipeStep,
    authToken: string,
) => DialecticExecuteJobPayload[];

export type GranularityStrategyMap = Map<string, GranularityPlannerFn>;

/**
 * Describes a single step within a multi-step job recipe, aligning with the
 * `dialectic_recipe_template_steps` and `dialectic_stage_recipe_steps` table schemas.
 */

/**
 * Defines the structure for an item in the `inputs_required` JSONB array, specifying one
 * required input artifact for a recipe step.
 */
export interface InputRule {
    /** The type of artifact to be used as an input. */
    type: 'document' | 'feedback' | 'header_context' | 'seed_prompt' | 'project_resource';
    /** The slug of the stage from which to draw the artifact (e.g., 'thesis'). */
    slug: string;
    /** The specific key of the document to use. */
    document_key?: FileType;
    /** Whether this input is mandatory for the step to proceed. */
    required?: boolean;
    /** Whether multiple artifacts of this type can be provided. */
    multiple?: boolean;
    /** A markdown header to prepend before this artifact's content in the assembled prompt. */
    section_header?: string;
}

/**
 * Defines the structure for an item in the `inputs_relevance` JSONB array, used to
 * prioritize artifacts during RAG (Retrieval-Augmented Generation).
 */
export interface RelevanceRule {
    /** The key of the document to which this relevance score applies. */
    document_key: FileType;
    /** The type of the document (e.g., 'document', 'feedback'). */
    type?: string;
    /** A normalized float from 0.0 to 1.0 indicating the priority of this artifact. */
    relevance: number;
    slug?: string;
}

export interface HeaderContextArtifact {
    type: 'header_context';
    document_key: 'header_context';
    artifact_class: 'header_context';
    file_type: 'json';
}

export interface ReviewMetadata {
  proposal_identifier: {
    lineage_key: string;
    source_model_slug: string;
  };
  proposal_summary: string;
  review_focus: string[];
  user_constraints: string[];
  normalization_guidance: {
    scoring_scale: string;
    required_dimensions: string[];
  };
}

export interface ContextForDocument {
    document_key: FileType;
    content_to_include: Record<string, unknown> | Record<string, unknown>[];
}

export interface RenderedDocumentArtifact {
    artifact_class: 'rendered_document';
    file_type: 'markdown' | 'json';
    document_key: FileType;
    template_filename: string;
    content_to_include?: Record<string, unknown> | Record<string, unknown>[];
    lineage_key?: string;
    source_model_slug?: string;
}


export type AssembledJsonArtifact = {
    artifact_class: 'assembled_document_json' | 'assembled_json';
    document_key: FileType;
    lineage_key?: string;
    source_model_slug?: string;
} & ({
    fields: string[];
    template_filename?: never;
    content_to_include?: never;
    file_type?: never;
} | {
    fields?: never;
    template_filename: string;
    content_to_include: Record<string, unknown> | Record<string, unknown>[];
    file_type: 'json';
});


/**
 * Defines the structure for an item in the `outputs_required` JSONB array, describing
 * an artifact that is expected to be generated by a recipe step.
 */
export interface OutputRule {
    system_materials?: SystemMaterials;
    header_context_artifact?: HeaderContextArtifact;
    context_for_documents?: ContextForDocument[];
    documents?: (RenderedDocumentArtifact | AssembledJsonArtifact)[];
    assembled_json?: AssembledJsonArtifact[];
    files_to_generate?: {
      from_document_key: string;
      template_filename: string;
    }[];
    review_metadata?: ReviewMetadata;
}

export interface StartSessionDeps {
  logger: ILogger;
  fileManager: IFileManager;
  promptAssembler: IPromptAssembler;
  randomUUID: () => string;
  getAiProviderAdapter: (deps: FactoryDependencies) => AiProviderAdapterInstance | null;
}

export type ExportProjectSuccess = {
	status: 200;
	data: {
		export_url: string;
		file_name: string;
	};
  error?: undefined;
};

export type ExportProjectFailure = {
	error: ServiceError;
  data?: undefined;
};

export type ExportProjectResponse = ExportProjectSuccess | ExportProjectFailure;

export type JobInsert = {
  payload: {
      model_id: string;
      selectedModelIds?: string[];
      [key: string]: unknown;
  };
  [key: string]: unknown;
};

// A more specific type guard for the job insert payload with the new recipe-aware fields.
export type PlanJobInsert = JobInsert & {
  payload: {
      job_type: JobType;
  }
}
export interface StartSessionDeps {
  logger: ILogger;
  fileManager: IFileManager;
  promptAssembler: IPromptAssembler;
  randomUUID: () => string;
  getAiProviderAdapter: (deps: FactoryDependencies) => AiProviderAdapterInstance | null;
  providerMap?: Record<string, AiProviderAdapter>;
  embeddingApiKey?: string;
}
