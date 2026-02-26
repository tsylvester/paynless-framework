import { SystemPrompt } from './ai.types';
import type { ApiError, ApiResponse } from './api.types';
import type { Database } from '@paynless/db-types';

// Define UpdateProjectDomainPayload before its use in DialecticApiClient
export interface UpdateProjectDomainPayload {
  projectId: string;
  selectedDomainId: string;
}

export type DialecticStage = Database['public']['Tables']['dialectic_stages']['Row'];

export type DialecticStageTransition = Database['public']['Tables']['dialectic_stage_transitions']['Row'];

export type DialecticProcessTemplate = Database['public']['Tables']['dialectic_process_templates']['Row'] & {
  stages?: DialecticStage[];
  transitions?: DialecticStageTransition[];
};

export type DialecticProjectRow = Database['public']['Tables']['dialectic_projects']['Row']

export type DialecticSessionRow = Database['public']['Tables']['dialectic_sessions']['Row']

export type DialecticContributionRow = Database['public']['Tables']['dialectic_contributions']['Row']

export type DialecticJobRow = Database['public']['Tables']['dialectic_generation_jobs']['Row']

// New type for contribution generation status
  export type ContributionGenerationStatus = 'idle' | 'initiating' | 'generating' | 'failed' | 'retrying' | 'pending';

export const contributionStatuses = ['pending', 'generating', 'retrying', 'failed', 'completed', 'continuing'];
export type ContributionStatus = typeof contributionStatuses[number];
export function isContributionStatus(status: unknown): status is ContributionStatus {
  return typeof status === 'string' && contributionStatuses.includes(status);
}

export interface DialecticProject {
    id: string;
    user_id: string;
    project_name: string;
    initial_user_prompt?: string | null; // This will be empty if initial_prompt_resource_id is set
    initial_prompt_resource_id?: string | null; // FK to dialectic_contributions.id
    selected_domain_id: string;
    dialectic_domains: { name: string } | null;
    selected_domain_overlay_id: string | null;
    repo_url: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    dialectic_sessions?: DialecticSession[];
    resources?: DialecticProjectResource[];
    process_template_id?: string | null;
    dialectic_process_templates: DialecticProcessTemplate | null;
    isLoadingProcessTemplate: boolean;
    processTemplateError: ApiError | null;

    // States for generating contributions
    // isGeneratingContributions: boolean; // Replaced by contributionGenerationStatus
    contributionGenerationStatus: ContributionGenerationStatus; // New
    generateContributionsError: ApiError | null;

    // States for submitting stage responses (as per plan 1.5.6.4)
    isSubmittingStageResponses: boolean; 
    submitStageResponsesError: ApiError | null;

    // States for saving contribution edits (as per plan 1.5.6.5)
    isSavingContributionEdit: boolean;
    saveContributionEditError: ApiError | null;
}

export interface CreateProjectPayload {
    projectName: string;
    initialUserPrompt?: string | null;
    selectedDomainId: string;
    selectedDomainOverlayId?: string | null;
    promptTemplateId?: string | null;
    promptFile?: File | null;
}

export interface DeleteProjectPayload {
  projectId: string;
}

// Ensure this interface is defined and exported
export interface GetContributionContentSignedUrlPayload {
  contributionId: string;
}

export interface GetContributionContentDataPayload {
  contributionId: string;
}

export interface GetContributionContentDataResponse {
  content: string;
  mimeType: string;
  sizeBytes: number | null;
  fileName: string | null;
}

export interface StartSessionPayload {
  projectId: string;
  sessionDescription?: string | null;
  selectedModels: SelectedModels[];
  originatingChatId?: string | null;
  stageSlug?: string;
}

export interface UpdateSessionModelsPayload {
  sessionId: string;
  selectedModels: SelectedModels[];
}

/** Same shape as backend dialectic-service DialecticSession.selected_models elements. */
export interface SelectedModels {
  id: string;
  displayName: string;
} 

export interface DialecticSession {
  id: string;
  project_id: string;
  session_description: string | null;
  user_input_reference_url: string | null;
  iteration_count: number;
  selected_models: SelectedModels[];
  status: string | null;
  associated_chat_id: string | null;
  current_stage_id: string | null;
  created_at: string;
  updated_at: string;

  dialectic_session_models?: DialecticSessionModel[];
  dialectic_contributions?: DialecticContribution[];
  feedback?: DialecticFeedback[];
}

// Added GetSessionDetailsResponse interface
export interface GetSessionDetailsResponse {
  session: DialecticSession;
  currentStageDetails: DialecticStage | null;
  activeSeedPrompt: AssembledPrompt | null;
}

export interface DialecticSessionModel {
    id: string;
    session_id: string;
    model_id: string;
    model_role: string | null;
    created_at: string;
    ai_provider?: AIModelCatalogEntry;
}

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

export interface PromptTemplateVariable {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'json_string_array'; // json_string_array for things like a list of file paths
  required: boolean;
}

// Alias for the direct database row type
export type SystemPromptsRow = Database['public']['Tables']['system_prompts']['Row'];

// Define PromptTemplate by intersecting the base row type (omitting the generic Json variables_required)
// with a more specific definition for variables_required.
export type PromptTemplate = Omit<SystemPromptsRow, 'variables_required'> & {
  // id, name, prompt_text, description, context, stage_association, version, is_stage_default, is_active, created_at, updated_at are inherited from SystemPromptsRow
  variables_required?: Record<string, PromptTemplateVariable['type']> | PromptTemplateVariable[];
};

// Stage Recipe Contracts (Frontend)
export type RecipeJobType = 'PLAN' | 'EXECUTE' | 'RENDER';
export type RecipePromptType = 'Planner' | 'Turn';
export type RecipeOutputType = 'header_context' | 'assembled_document_json' | 'rendered_document';
export type RecipeGranularity = 'all_to_one' | 'per_source_document' | 'one_to_many' | 'many_to_one';

export interface InputRequirement {
  type: 'seed_prompt' | 'document' | 'header_context' | 'feedback';
  slug: string;
  document_key: string;
  required: boolean;
  multiple?: boolean;
}

export interface InputsRelevanceItem {
  document_key: string;
  slug: string;
  relevance: number;
  type?: 'feedback';
}

export interface OutputRequirement {
  document_key: string;
  artifact_class: 'header_context' | 'assembled_json' | 'rendered_document';
  file_type: 'json' | 'markdown';
  template_filename?: string;
}

export interface DialecticStageRecipeStep {
  id: string;
  step_key: string;
  step_slug: string;
  step_name: string;
  execution_order: number;
  parallel_group?: number | null;
  branch_key?: string | null;
  job_type: RecipeJobType;
  prompt_type: RecipePromptType;
  prompt_template_id?: string | null;
  output_type: RecipeOutputType;
  granularity_strategy: RecipeGranularity;
  inputs_required: InputRequirement[];
  inputs_relevance?: InputsRelevanceItem[];
  outputs_required?: OutputRequirement[];
}

export interface DialecticStageRecipe {
  stageSlug: string;
  instanceId: string;
  steps: DialecticStageRecipeStep[];
}

export interface DomainDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domain_name: string;
  description: string | null;
  stage_association: string | null;
}

export interface DialecticDomain {
  id: string;
  name: string;
  description: string | null;
  parent_domain_id: string | null;
  is_enabled: boolean;
}



export interface DialecticStateValues {
  // New state for Domains
  domains: DialecticDomain[] | null;
  isLoadingDomains: boolean;
  domainsError: ApiError | null;
  selectedDomain: DialecticDomain | null;

  // New state for Domain Overlays
  selectedStageAssociation: DialecticStage | null;
  availableDomainOverlays: DomainOverlayDescriptor[] | null;
  isLoadingDomainOverlays: boolean;
  domainOverlaysError: ApiError | null;
  selectedDomainOverlayId: string | null;
  // End new state for Domain Overlays

  projects: DialecticProject[];
  isLoadingProjects: boolean;
  projectsError: ApiError | null;
  currentProjectDetail: DialecticProject | null;
  isLoadingProjectDetail: boolean;
  projectDetailError: ApiError | null;

  modelCatalog: AIModelCatalogEntry[];
  isLoadingModelCatalog: boolean;
  modelCatalogError: ApiError | null;

  isCreatingProject: boolean;
  createProjectError: ApiError | null;
  isStartingSession: boolean;
  startSessionError: ApiError | null;

  contributionContentCache: { [contributionId: string]: ContributionCacheEntry };

  allSystemPrompts: SystemPrompt[] | null;

  // Project cloning states
  isCloningProject: boolean;
  cloneProjectError: ApiError | null;

  // Project exporting states
  isExportingProject: boolean;
  exportProjectError: ApiError | null;

  isUpdatingProjectPrompt: boolean;
  isUploadingProjectResource: boolean;
  uploadProjectResourceError: ApiError | null;
  /** Single origin from session response (id + displayName); display uses this, not catalog. */
  selectedModels: SelectedModels[] | null | undefined;

  // Cache for initial prompt file content
  initialPromptContentCache: { [resourceId: string]: InitialPromptCacheEntry };

  // New state for process templates
  currentProcessTemplate: DialecticProcessTemplate | null;
  isLoadingProcessTemplate: boolean;
  processTemplateError: ApiError | null;

  // States for generating contributions
  // isGeneratingContributions: boolean; // Replaced by contributionGenerationStatus
  contributionGenerationStatus: ContributionGenerationStatus; // New
  generateContributionsError: ApiError | null;
  generatingSessions: { [sessionId: string]: string[] };

  // States for submitting stage responses (as per plan 1.5.6.4)
  isSubmittingStageResponses: boolean; 
  submitStageResponsesError: ApiError | null;

  // States for saving contribution edits (as per plan 1.5.6.5)
  isSavingContributionEdit: boolean;
  saveContributionEditError: ApiError | null;

  // New context states
  activeContextProjectId: string | null;
  activeContextSessionId: string | null;
  activeContextStage: DialecticStage | null;
  activeStageSlug: string | null;

  // New state for single session details
  activeSessionDetail: DialecticSession | null;
  isLoadingActiveSessionDetail: boolean;
  activeSessionDetailError: ApiError | null;

  // States for updating session models (newly added)
  isUpdatingSessionModels: boolean;
  updateSessionModelsError: ApiError | null;

  // ADDED: States for fetching feedback file content
  currentFeedbackFileContent: GetProjectResourceContentResponse | null;
  isFetchingFeedbackFileContent: boolean;
  fetchFeedbackFileContentError: ApiError | null;

  activeDialecticWalletId: string | null;

  // Recipe hydration and per-stage-run progress
  recipesByStageSlug: Record<string, DialecticStageRecipe>;
  stageRunProgress: Record<string, StageRunProgressSnapshot>;
  focusedStageDocument: Record<string, FocusedStageDocumentState | null>;
  stageDocumentContent: Record<string, StageDocumentContentState>;
  stageDocumentVersions: Record<string, StageDocumentVersionInfo>;
  stageDocumentFeedback: Record<string, StageDocumentFeedback[]>;
  isLoadingStageDocumentFeedback: boolean;
  stageDocumentFeedbackError: ApiError | null;
  isSubmittingStageDocumentFeedback: boolean;
  submitStageDocumentFeedbackError: ApiError | null;
	isInitializingFeedbackDraft: boolean;
	initializeFeedbackDraftError: ApiError | null;
  activeSeedPrompt: AssembledPrompt | null;
}

export type StageRunProgressEntry = NonNullable<DialecticStateValues['stageRunProgress'][string]>;
export type StageRunDocuments = StageRunProgressEntry['documents'];
export type StageRunDocumentEntry = StageRunDocuments[string];
export type DocumentStatus = StageRunDocumentEntry['status'];

export type StageRunDocumentStatus =
  | 'idle'
  | 'generating'
  | 'retrying'
  | 'failed'
  | 'completed'
  | 'continuing'
  | 'not_started';

export interface StageRenderedDocumentDescriptor {
  descriptorType?: 'rendered';
  status: Exclude<StageRunDocumentStatus, 'not_started'> | 'not_started';
  job_id: string;
  latestRenderedResourceId: string;
  modelId: string;
  versionHash: string;
  lastRenderedResourceId: string;
  lastRenderAtIso: string;
  stepKey?: string;
  error?: ApiError | null;
}

export interface StagePlannedDocumentDescriptor {
  descriptorType: 'planned';
  status: 'not_started';
  stepKey: string;
  modelId: string | null;
}

export type StageRunDocumentDescriptor =
  | StageRenderedDocumentDescriptor
  | StagePlannedDocumentDescriptor;

export interface StageRenderedDocumentChecklistEntry {
  descriptorType?: 'rendered';
  documentKey: string;
  status: StageRunDocumentStatus;
  jobId: string;
  latestRenderedResourceId: string;
  modelId: string;
  stepKey?: string;
}

export interface StagePlannedDocumentChecklistEntry {
  descriptorType: 'planned';
  documentKey: string;
  status: 'not_started';
  jobId: null;
  latestRenderedResourceId: null;
  modelId: string | null;
  stepKey: string;
}

export type StageDocumentChecklistEntry =
  | StageRenderedDocumentChecklistEntry
  | StagePlannedDocumentChecklistEntry;

export interface StageDocumentCompositeKey {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  modelId: string;
  documentKey: string;
}

export interface StageDocumentVersionInfo {
  resourceId: string;
  versionHash: string;
  updatedAt: string;
}

export interface StageDocumentContentState {
  baselineMarkdown: string;
  currentDraftMarkdown: string;
  isDirty: boolean;
  isLoading: boolean;
  error: ApiError | null;
  lastBaselineVersion: StageDocumentVersionInfo | null;
  pendingDiff: string | null;
  lastAppliedVersionHash: string | null;
  sourceContributionId: string | null;
  feedbackDraftMarkdown: string | undefined;
  feedbackIsDirty: boolean;
  resourceType: string | null;
}

/**
 * Separator used in stageRunProgress.documents keys.
 * Key format: `${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`.
 * One document key can have N descriptors (one per model).
 */
export const STAGE_RUN_DOCUMENT_KEY_SEPARATOR = ':';

/**
 * Key for stageRunProgress.documents. Format: documentKey + STAGE_RUN_DOCUMENT_KEY_SEPARATOR + modelId.
 * Enables multiple descriptors per document key (one per model).
 */
export type StageRunDocumentKey = string;

/** Parsed parts of a StageRunDocumentKey (documentKey + separator + modelId). */
export interface StageRunDocumentKeyParts {
  documentKey: string;
  modelId: string;
}

export interface JobProgressEntry {
  totalJobs: number;
  completedJobs: number;
  inProgressJobs: number;
  failedJobs: number;
  modelJobStatuses?: Record<string, 'pending' | 'in_progress' | 'completed' | 'failed'>;
}

export type StepJobProgress = Record<string, JobProgressEntry>;

export interface StageRunProgressSnapshot {
  stepStatuses: Record<string, 'not_started' | 'in_progress' | 'waiting_for_children' | 'completed' | 'failed'>;
  /** Keyed by StageRunDocumentKey (documentKey:modelId). One document key can have N descriptors. */
  documents: Record<StageRunDocumentKey, StageRunDocumentDescriptor>;
  jobProgress: StepJobProgress;
}

export type UnifiedProjectStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

export interface StepProgressDetail {
  stepKey: string;
  stepName: string;
  totalJobs: number;
  completedJobs: number;
  inProgressJobs: number;
  failedJobs: number;
  stepPercentage: number;
  status: UnifiedProjectStatus;
}

export interface StageProgressDetail {
  stageSlug: string;
  totalSteps: number;
  completedSteps: number;
  stagePercentage: number;
  stepsDetail: StepProgressDetail[];
  stageStatus: UnifiedProjectStatus;
}

export interface UnifiedProjectProgress {
  totalStages: number;
  completedStages: number;
  currentStageSlug: string | null;
  overallPercentage: number;
  currentStage: DialecticStage | null;
  projectStatus: UnifiedProjectStatus;
  stageDetails: StageProgressDetail[];
}

export interface InitialPromptCacheEntry {
  content?: string;
  fileName?: string;
  isLoading: boolean;
  error?: ApiError | null;
}

export interface ContributionCacheEntry {
  content?: string;
  isLoading: boolean;
  error?: ApiError | null;
  mimeType?: string;
  sizeBytes?: number | null;
  fileName?: string | null;
}

export interface FocusedStageDocumentState {
  modelId: string;
  documentKey: string;
}


export interface SetFocusedStageDocumentPayload {
  sessionId: string;
  stageSlug: string;
  modelId: string;
  documentKey: string;
  stepKey: string;
  iterationNumber: number;
}

export type StageDocumentSelectionHandler = (
  payload: SetFocusedStageDocumentPayload,
) => void;

export type StageDocumentEntry = StageDocumentChecklistEntry;

export interface StageRunChecklistProps {
  focusedStageDocumentMap?: Record<string, FocusedStageDocumentState | null>;
  onDocumentSelect: StageDocumentSelectionHandler;
  modelId: string | null;
}

export interface ClearFocusedStageDocumentPayload {
  sessionId: string;
  stageSlug: string;
  modelId: string;
}

export interface DialecticActions {
  fetchDomains: () => Promise<void>;
  setSelectedDomain: (domain: DialecticDomain | null) => void;
  fetchAvailableDomainOverlays: (stageAssociation: DialecticStage) => Promise<void>;
  setSelectedStageAssociation: (stage: DialecticStage | null) => void;
  setSelectedDomainOverlayId: (overlayId: string | null) => void;
  
  fetchDialecticProjects: () => Promise<void>;
  fetchDialecticProjectDetails: (projectId: string) => Promise<void>;
  createDialecticProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProjectRow>>;
  startDialecticSession: (payload: StartSessionPayload) => Promise<ApiResponse<StartSessionSuccessResponse>>;
  updateSessionModels: (payload: UpdateSessionModelsPayload) => Promise<ApiResponse<DialecticSession>>;
  fetchAIModelCatalog: () => Promise<void>;

  fetchContributionContent: (contributionId: string) => Promise<void>;

  resetCreateProjectError: () => void;
  resetProjectDetailsError: () => void;

  // New actions
  deleteDialecticProject: (projectId: string) => Promise<ApiResponse<void>>;
  cloneDialecticProject: (projectId: string) => Promise<ApiResponse<DialecticProject>>;
  exportDialecticProject: (projectId: string) => Promise<ApiResponse<ExportProjectResponse>>;
  updateDialecticProjectInitialPrompt: (payload: UpdateProjectInitialPromptPayload) => Promise<ApiResponse<DialecticProjectRow>>;
  setSelectedModels: (models: SelectedModels[]) => void;
  setModelMultiplicity: (model: SelectedModels, count: number) => void;
  resetSelectedModels: () => void;

  // New action for fetching process templates
  fetchProcessTemplate: (templateId: string) => Promise<void>;

  // New action for fetching initial prompt file content
  fetchInitialPromptContent: (resourceId: string) => Promise<void>;

  beginStageDocumentEdit: (key: StageDocumentCompositeKey, initialDraftMarkdown: string) => void;
  updateStageDocumentDraft: (key: StageDocumentCompositeKey, draftMarkdown: string) => void;
  updateStageDocumentFeedbackDraft: (key: StageDocumentCompositeKey, feedbackMarkdown: string) => void;
  flushStageDocumentDraft: (key: StageDocumentCompositeKey) => void;
  clearStageDocumentDraft: (key: StageDocumentCompositeKey) => void;
  fetchStageDocumentContent: (key: StageDocumentCompositeKey, resourceId: string) => Promise<void>;

  hydrateStageProgress: (payload: ListStageDocumentsPayload) => Promise<void>;
  hydrateAllStageProgress: (payload: GetAllStageProgressPayload) => Promise<void>;

  fetchStageDocumentFeedback: (key: StageDocumentCompositeKey) => Promise<void>;
  submitStageDocumentFeedback: (payload: SubmitStageDocumentFeedbackPayload) => Promise<ApiResponse<{ success: boolean }>>;
  resetSubmitStageDocumentFeedbackError: () => void;
  initializeFeedbackDraft: (key: StageDocumentCompositeKey) => Promise<void>;

  // Action for generating contributions
  generateContributions: (payload: GenerateContributionsPayload) => Promise<ApiResponse<GenerateContributionsResponse>>;
  
  // Actions for submitting stage responses and preparing next seed (plan 1.2.Y / 1.5.6.4)
  setSubmittingStageResponses: (isSubmitting: boolean) => void;
  setSubmitStageResponsesError: (error: ApiError | null) => void;
  submitStageResponses: (payload: SubmitStageResponsesPayload) => Promise<ApiResponse<SubmitStageResponsesResponse>>;
  resetSubmitStageResponsesError: () => void;

  // Actions for saving contribution edits (plan 1.2.Y / 1.5.6.5)
  setSavingContributionEdit: (isSaving: boolean) => void;
  setSaveContributionEditError: (error: ApiError | null) => void;
  saveContributionEdit: (payload: SaveContributionEditPayload) => Promise<ApiResponse<SaveContributionEditSuccessResponse>>;
  resetSaveContributionEditError: () => void;

  // New context actions
  setActiveContextProjectId: (id: string | null) => void;
  setActiveContextSessionId: (id: string | null) => void;
  setActiveContextStage: (stage: DialecticStage | null) => void;
  setActiveDialecticContext: (context: { projectId: string | null; sessionId: string | null; stage: DialecticStage | null }) => void;
  setActiveStage: (slug: string | null) => void;
  setFocusedStageDocument: (payload: SetFocusedStageDocumentPayload) => void;
  clearFocusedStageDocument: (payload: ClearFocusedStageDocumentPayload) => void;

  // ADDED: Actions for fetching feedback file content
  fetchFeedbackFileContent: (payload: { projectId: string; storagePath: string }) => Promise<void>;
  resetFetchFeedbackFileContentError: () => void;
  clearCurrentFeedbackFileContent: () => void;

  // New actions for fetching and setting single session context
  fetchAndSetCurrentSessionDetails: (sessionId: string) => Promise<void>;
  activateProjectAndSessionContextForDeepLink: (projectId: string, sessionId: string) => Promise<void>;

  setActiveDialecticWalletId: (walletId: string | null) => void;

  _resetForTesting?: () => void;
  // Internal handler for completion events from notificationStore
  _handleGenerationCompleteEvent?: (data: { sessionId: string; projectId: string; [key: string]: unknown }) => void;
  // NEW: Internal handler for all dialectic lifecycle events from notificationStore
  _handleDialecticLifecycleEvent?: (payload: DialecticLifecycleEvent) => void;

  // Private handlers for individual lifecycle events
  _handleContributionGenerationStarted: (event: ContributionGenerationStartedPayload) => void;
  _handleDialecticContributionStarted: (event: DialecticContributionStartedPayload) => void;
  _handleContributionGenerationRetrying: (event: ContributionGenerationRetryingPayload) => void;
  _handleDialecticContributionReceived: (event: DialecticContributionReceivedPayload) => void;
  _handleContributionGenerationFailed: (event: ContributionGenerationFailedPayload) => void;
  _handleContributionGenerationComplete: (event: ContributionGenerationCompletePayload) => void;
  _handleContributionGenerationContinued: (event: ContributionGenerationContinuedPayload) => void;
  _handlePlannerStarted: (event: PlannerStartedPayload) => void;
  _handlePlannerCompleted: (event: PlannerCompletedPayload) => void;
  _handleDocumentStarted: (event: DocumentStartedPayload) => void;
  _handleDocumentChunkCompleted: (event: DocumentChunkCompletedPayload) => void;
  _handleDocumentCompleted: (event: DocumentCompletedPayload) => void;
  _handleRenderStarted: (event: RenderStartedPayload) => void;
  _handleRenderCompleted: (event: RenderCompletedPayload) => void;
  _handleJobFailed: (event: JobFailedPayload) => void;
  
  
  reset: () => void;

  // Recipe hydration and per-stage-run progress
  fetchStageRecipe: (stageSlug: string) => Promise<void>;
  ensureRecipeForActiveStage: (sessionId: string, stageSlug: string, iterationNumber: number) => Promise<void>;
}

export type DialecticStore = DialecticStateValues & DialecticActions;

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
  // Make error an object to store more details
  error: ApiError | null;
  citations: { text: string; url?: string }[] | null;
  created_at: string;
  updated_at: string;
  contribution_type: string | null;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  status?: ContributionStatus; // Client-side status for placeholders
  job_id?: string | null; // ID of the generation job that created this contribution
}

// Contribution types used across Dialectic features (copied from Edge/Deno definitions)
export type ContributionType =
  | 'thesis'
  | 'antithesis'
  | 'synthesis'
  | 'parenthesis'
  | 'paralysis'
  | 'pairwise_synthesis_chunk'
  | 'reduced_synthesis'
  | 'rag_context_summary';
  
export type DialecticNotificationTypes = 
  | 'contribution_generation_started'
  | 'dialectic_contribution_started'
  | 'contribution_generation_retrying'
  | 'dialectic_contribution_received'
  | 'contribution_generation_failed'
  | 'contribution_generation_complete'
  | 'contribution_generation_continued'
  | 'planner_started'
  | 'planner_completed'
  | 'document_started'
  | 'document_chunk_completed'
  | 'document_completed'
  | 'execute_started'
  | 'execute_chunk_completed'
  | 'execute_completed'
  | 'render_started'
  | 'render_chunk_completed'
  | 'render_completed'
  | 'job_failed';

export interface ContributionGenerationStartedPayload {
  // This is the overall contribution generation for the entire session stage. 
  type: 'contribution_generation_started';
  sessionId: string;
  modelId: string;
  iterationNumber: number;
  job_id: string;
}

export interface DialecticContributionStartedPayload {
  // This is the individual contribution generation for a specific model. 
  type: 'dialectic_contribution_started';
  sessionId: string;
  modelId: string;
  iterationNumber: number;
  job_id: string;
}

export interface ContributionGenerationRetryingPayload {
  // This is the individual contribution generation for a specific model. 
  type: 'contribution_generation_retrying';
  sessionId: string;
  modelId: string;
  iterationNumber: number;
  job_id: string;
  error?: string;
}

export interface DialecticContributionReceivedPayload {
  // This is the individual contribution generation for a specific model. 
  type: 'dialectic_contribution_received';
  sessionId: string;
  contribution: DialecticContribution;
  job_id: string;
  is_continuing: boolean;
}

export interface ContributionGenerationFailedPayload {
  // This is a specific model failing for all of its retries.  
  type: 'contribution_generation_failed';
  sessionId: string;
  job_id?: string; // The specific job that failed, if applicable
  modelId?: string; // The specific model that failed, if applicable
  error?: ApiError;
}

export interface ContributionGenerationContinuedPayload {
  // This is a specific model that is continuing its generation because its internal stop reason was not "stop". 
  // The most common continuation reasons are "max_tokens_reached" and "length". 
  type: 'contribution_generation_continued';
  sessionId: string;
  contribution: DialecticContribution;
  projectId: string;
  modelId: string;
  continuationNumber: number;
  job_id: string;
}

export interface ContributionGenerationCompletePayload {
  // This is a specific model that has completed its generation. 
  type: 'contribution_generation_complete';
  sessionId: string;
  projectId: string;
}

export interface DocumentLifecyclePayload {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  job_id: string;
  document_key: string;
  modelId: string;
  step_key?: string;
  latestRenderedResourceId?: string | null;
}

/** Base fields required for progress tracking. PLAN events use this only (no modelId, no document_key). */
export interface JobNotificationBase {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  job_id: string;
  step_key: string;
}

export interface PlannerStartedPayload extends DocumentLifecyclePayload {
  type: 'planner_started';
}

export interface PlannerCompletedPayload extends JobNotificationBase {
  type: 'planner_completed';
}

export interface DocumentStartedPayload extends DocumentLifecyclePayload {
  type: 'document_started';
}

export interface DocumentChunkCompletedPayload extends DocumentLifecyclePayload {
  type: 'document_chunk_completed';
  isFinalChunk?: boolean;
  continuationNumber?: number;
}

export interface DocumentCompletedPayload extends DocumentLifecyclePayload {
  type: 'document_completed';
}

/** EXECUTE job payload: modelId required, document_key optional. */
export interface ExecutePayload extends JobNotificationBase {
  modelId: string;
  document_key?: string;
}

export interface ExecuteStartedPayload extends ExecutePayload {
  type: 'execute_started';
}

export interface ExecuteChunkCompletedPayload extends ExecutePayload {
  type: 'execute_chunk_completed';
  isFinalChunk?: boolean;
  continuationNumber?: number;
}

export interface ExecuteCompletedPayload extends ExecutePayload {
  type: 'execute_completed';
  latestRenderedResourceId?: string | null;
}

/** RENDER job payload: modelId and document_key required. */
export interface RenderPayload extends JobNotificationBase {
  modelId: string;
  document_key: string;
}

export interface RenderStartedPayload extends RenderPayload {
  type: 'render_started';
}

export interface RenderChunkCompletedPayload extends RenderPayload {
  type: 'render_chunk_completed';
}

export interface RenderCompletedPayload extends DocumentLifecyclePayload {
  type: 'render_completed';
  latestRenderedResourceId: string;
}

export interface JobFailedPayload extends DocumentLifecyclePayload {
  type: 'job_failed';
  error: ApiError;
}

export type DialecticLifecycleEvent = 
ContributionGenerationStartedPayload 
| DialecticContributionStartedPayload 
| ContributionGenerationRetryingPayload 
| DialecticContributionReceivedPayload 
| ContributionGenerationFailedPayload 
| ContributionGenerationContinuedPayload
| ContributionGenerationCompletePayload
| PlannerStartedPayload
| PlannerCompletedPayload
| DocumentStartedPayload
| DocumentChunkCompletedPayload
| DocumentCompletedPayload
| ExecuteStartedPayload
| ExecuteChunkCompletedPayload
| ExecuteCompletedPayload
| RenderStartedPayload
| RenderChunkCompletedPayload
| RenderCompletedPayload
| JobFailedPayload;

export interface DialecticFeedback {
  id: string;
  session_id: string;
  project_id: string;
  user_id: string;
  stage_slug: string;
  iteration_number: number;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  feedback_type: string;
  resource_description?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DialecticApiClient {
  fetchStageRecipe(stageSlug: string): Promise<ApiResponse<DialecticStageRecipe>>;
  listAvailableDomains(): Promise<ApiResponse<{ data: DomainDescriptor[] }>>;
  listAvailableDomainOverlays(payload: { stageAssociation: string }): Promise<ApiResponse<DomainOverlayDescriptor[]>>;
  createProject(payload: FormData): Promise<ApiResponse<DialecticProject>>;
  listProjects(): Promise<ApiResponse<DialecticProject[]>>;
  getProjectDetails(projectId: string): Promise<ApiResponse<DialecticProject>>;
  startSession(payload: StartSessionPayload): Promise<ApiResponse<StartSessionSuccessResponse>>;
  updateSessionModels(payload: UpdateSessionModelsPayload): Promise<ApiResponse<DialecticSession>>;
  listModelCatalog(): Promise<ApiResponse<AIModelCatalogEntry[]>>;
  getContributionContentData(contributionId: string): Promise<ApiResponse<GetContributionContentDataResponse | null>>;
  listDomains(): Promise<ApiResponse<DialecticDomain[]>>;
  fetchProcessTemplate(templateId: string): Promise<ApiResponse<DialecticProcessTemplate>>;

  updateProjectDomain(payload: UpdateProjectDomainPayload): Promise<ApiResponse<DialecticProject>>;

  generateContributions(payload: GenerateContributionsPayload): Promise<ApiResponse<GenerateContributionsResponse>>;

  deleteProject(payload: DeleteProjectPayload): Promise<ApiResponse<void>>;

  cloneProject(payload: { projectId: string }): Promise<ApiResponse<DialecticProject>>;
  exportProject(payload: { projectId: string }): Promise<ApiResponse<ExportProjectResponse>>;

  updateDialecticProjectInitialPrompt(payload: UpdateProjectInitialPromptPayload): Promise<ApiResponse<DialecticProject>>;

  submitStageResponses(payload: SubmitStageResponsesPayload): Promise<ApiResponse<SubmitStageResponsesResponse>>;
  saveContributionEdit(payload: SaveContributionEditPayload): Promise<ApiResponse<SaveContributionEditSuccessResponse>>;

  getIterationInitialPromptContent(payload: GetIterationInitialPromptPayload): Promise<ApiResponse<IterationInitialPromptData>>;

  getProjectResourceContent(payload: GetProjectResourceContentPayload): Promise<ApiResponse<GetProjectResourceContentResponse>>;
  getStageDocumentFeedback(payload: GetStageDocumentFeedbackPayload): Promise<ApiResponse<StageDocumentFeedback[]>>;
  submitStageDocumentFeedback(payload: SubmitStageDocumentFeedbackPayload): Promise<ApiResponse<{ success: boolean }>>;
  listStageDocuments(payload: ListStageDocumentsPayload): Promise<ApiResponse<ListStageDocumentsResponse>>;
}


export interface ExportProjectResponse {
  export_url: string;
  file_name: string;
}
export interface GenerateContributionsPayload {
  sessionId: string;
  projectId: string;
  stageSlug: DialecticStage['slug'];
  iterationNumber: number;
  continueUntilComplete: boolean;
  walletId: string;
}

export interface FailedAttemptError {
  modelId: string;
  error: string;
  details?: string;
  code?: string;
}

export interface GenerateContributionsResponse {
  sessionId: string;
  projectId: string;
  stage: string;
  iteration: number;
  status: string;
  job_ids?: string[];
  successfulContributions: DialecticContribution[];
  failedAttempts: FailedAttemptError[];
}

export type ListStageDocumentsResponse = StageDocumentChecklistEntry[];

export interface ListStageDocumentsPayload {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  userId: string;
  projectId: string;
}

export interface GetAllStageProgressPayload {
  sessionId: string;
  iterationNumber: number;
  userId: string;
  projectId: string;
}

export interface StageProgressEntry {
  stageSlug: string;
  documents: StageDocumentChecklistEntry[];
  stepStatuses: Record<string, string>;
  stageStatus: UnifiedProjectStatus;
  jobProgress: StepJobProgress;
}

export type GetAllStageProgressResponse = StageProgressEntry[];

export interface ContributionContentSignedUrlResponse {
    signedUrl: string;
    mimeType: string;
    sizeBytes: number | null;
}

export interface DialecticProjectResource {
    id: string;
    project_id: string;
    file_name: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    resource_description: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Represents a document resource that has been edited, matching the dialectic_project_resources table schema.
 * This type mirrors the database row shape for rendered documents created from user edits.
 */
export interface EditedDocumentResource {
  id: string;
  resource_type: string | null;
  project_id: string;
  session_id: string | null;
  stage_slug: string | null;
  iteration_number: number | null;
  document_key: string | null;
  source_contribution_id: string | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

/**
 * Response type for successful contribution edit saves.
 * Returns the created document resource instead of a contribution object.
 */
export interface SaveContributionEditSuccessResponse {
  resource: EditedDocumentResource;
  sourceContributionId: string;
}

export interface DomainOverlayDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainId: string;
  domainName: string;
  description: string | null;
  stageAssociation: string; // Corresponds to system_prompts.stage_association
  overlay_values: Record<string, unknown> | string | null;
  system_prompt_id?: string | null; // Added for the associated system prompt ID
}

export type DialecticServiceActionPayload = {
  action: 'createProject';
  payload: FormData;
} | {
  action: 'deleteProject';
  payload: DeleteProjectPayload;
} | {
  action: 'startSession';
  payload: StartSessionPayload;
} | {
  action: 'listProjects';
  payload?: undefined; 
} | {
  action: 'getProjectDetails';
  payload: { projectId: string };
} | {
  action: 'listModelCatalog';
  payload?: undefined;
} | {
  action: 'listDomains';
  payload?: undefined;
} | {
  action: 'listAvailableDomainOverlays';
  payload: { stageAssociation: DialecticStage };
} | {
  action: 'getContributionContentData';
  payload: GetContributionContentDataPayload;
} | {
  action: 'fetchProcessTemplate';
  payload: { templateId: string };
} | {
  action: 'generateContributions';
  payload: GenerateContributionsPayload;
} | {
  action: 'cloneProject';
  payload: { projectId: string };
} | {
  action: 'exportProject';
  payload: { projectId: string };
} | {
  action: 'updateProjectDomain';
  payload: UpdateProjectDomainPayload;
} | {
  action: 'updateDialecticProjectInitialPrompt';
  payload: UpdateProjectInitialPromptPayload;
} | {
  action: 'getProjectResourceContent';
  payload: GetProjectResourceContentPayload;
} | {
  action: 'getIterationInitialPromptContent';
  payload: GetIterationInitialPromptPayload;
} | {
  action: 'submitStageResponses';
  payload: SubmitStageResponsesPayload;
} | {
  action: 'saveContributionEdit';
  payload: SaveContributionEditPayload;
} | {
  action: 'updateSessionModels';
  payload: UpdateSessionModelsPayload;
}
| {
  action: 'getStageDocumentFeedback';
  payload: GetStageDocumentFeedbackPayload;
} | {
  action: 'submitStageDocumentFeedback';
  payload: SubmitStageDocumentFeedbackPayload;
}
| {
  action: 'listStageDocuments';
  payload: ListStageDocumentsPayload;
} | {
  action: 'getAllStageProgress';
  payload: GetAllStageProgressPayload;
}

export interface DialecticServiceResponsePayload {
  // ... existing code ...
}

export type UpdateProjectInitialPromptPayload = {
  projectId: string;
  newInitialPrompt: string;
};

export interface DialecticServiceFunctions {
  // ... existing code ...
}

// Added for fetching project resource content
export interface GetProjectResourceContentPayload {
  resourceId?: string; // Make resourceId optional
  projectId?: string;  // Add projectId as optional
  storagePath?: string; // Add storagePath as optional
  // Ensure at least one way to identify the resource is provided by API implementation
}

export interface GetProjectResourceContentResponse {
  fileName: string;
  mimeType: string;
  content: string;
  sourceContributionId: string | null;
  resourceType: string | null;
}

// Add new payload/response types if they are not already defined from the plan for submitStageResponses and saveContributionEdit
// These are placeholders from the plan, ensure they exist or are defined if not already in this file
export interface SubmitStageResponsesPayload { 
  sessionId: string;
  projectId: string;
  stageSlug: DialecticStage['slug'];
  currentIterationNumber: number;
}
  
export interface SubmitStageResponsesResponse { 
    updatedSession: DialecticSession;
    message?: string;
}

export interface SaveContributionEditPayload { 
    originalContributionIdToEdit: string;
    editedContentText: string;
    projectId: string;
    sessionId: string;
    originalModelContributionId: string; 
    responseText: string;
    /**
     * Document key identifier for doc-centric edits. Required; backend returns 400 when missing.
     */
    documentKey: string;
    /**
     * Resource type for dialectic_project_resources. Required; backend returns 400 when missing.
     */
    resourceType: string;
}

// START: New type definitions needed for 1.5.6 UI and 1.2.Y backend enhancements

export interface GetIterationInitialPromptPayload {
  sessionId: string;
  iterationNumber: number;
}

export interface IterationInitialPromptData {
  content: string; 
  mimeType: string; 
  storagePath: string;
}


export interface SubmitStageResponseItem {
  originalContributionId: string;
  responseText: string;
  rating?: number;
}

// END: New type definitions

export interface GetStageDocumentFeedbackPayload {
	sessionId: string;
	stageSlug: string;
	iterationNumber: number;
	modelId: string;
	documentKey: string;
}

export interface StageDocumentFeedback {
	id: string;
	content: string;
	createdAt: string;
}

/**
 * Payload for submitting stage document feedback.
 * Aligned with backend contract (dialectic-service dialectic.interface.ts).
 * Caller must provide identity and context (userId, projectId, feedbackContent, feedbackType).
 */
export interface SubmitStageDocumentFeedbackPayload {
	sessionId: string;
	stageSlug: string;
	iterationNumber: number;
	modelId: string;
	documentKey: string;
	feedbackContent: string;
	userId: string;
	projectId: string;
	feedbackType: string;
	feedbackId?: string;
	sourceContributionId?: string | null;
}

export interface AssembledPrompt {
  promptContent: string;
  source_prompt_resource_id: string;
}

export interface StartSessionSuccessResponse extends DialecticSession {
  seedPrompt: AssembledPrompt;
}