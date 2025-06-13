import { SystemPrompt } from './ai.types';
import type { ApiError, ApiResponse } from './api.types';
import type { Database } from '@paynless/db-types';

// Define UpdateProjectDomainTagPayload before its use in DialecticApiClient
export interface UpdateProjectDomainTagPayload {
  projectId: string;
  selectedDomainTag: string | null; // This will store the ID of the domain_specific_prompt_overlays record
}

export interface DialecticProject {
    id: string;
    user_id: string;
    project_name: string;
    initial_user_prompt?: string | null; // This will be empty if initial_prompt_resource_id is set
    initial_prompt_resource_id?: string | null; // FK to dialectic_contributions.id
    selected_domain_overlay_id: string | null;
    selected_domain_tag: string | null;
    repo_url: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    dialectic_sessions?: DialecticSession[];
    resources?: DialecticProjectResource[];
}

export interface CreateProjectPayload {
    projectName: string;
    initialUserPrompt?: string | null;
    selectedDomainTag?: string | null;
    selectedDomainOverlayId?: string | null;
    promptTemplateId?: string | null;
    promptFile?: File | null;
}

export interface DeleteProjectPayload {
  projectId: string;
}

export interface GetContributionContentSignedUrlPayload {
  contributionId: string;
}

export interface StartSessionPayload {
    projectId: string;
    sessionDescription?: string | null;
    selectedModelCatalogIds: string[];
    originatingChatId?: string | null;
    stageAssociation: DialecticStage;
    selectedDomainOverlayId?: string | null;
    promptTemplateId?: string | null;
    maxIterations?: number;
}

export interface DialecticSession {
    id: string;
    project_id: string;
    session_description: string | null;
    current_stage_seed_prompt: string | null;
    iteration_count: number;
    status: string;
    associated_chat_id: string | null;

    active_thesis_prompt_template_id: string | null;
    active_antithesis_prompt_template_id: string | null;
    active_synthesis_prompt_template_id: string | null;
    active_parenthesis_prompt_template_id: string | null;
    active_paralysis_prompt_template_id: string | null;
    
    formal_debate_structure_id: string | null;
    max_iterations: number;
    current_iteration: number;
    convergence_status: string | null;
    preferred_model_for_stage: Record<string, string> | null;
    
    created_at: string;
    updated_at: string;

    dialectic_session_models?: DialecticSessionModel[];
    dialectic_contributions?: DialecticContribution[];
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

export interface DomainTagDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainTag: string;
  description: string | null;
  stageAssociation: string | null;
}

// Define the new DialecticStage enum
export enum DialecticStage {
  THESIS = 'thesis',
  ANTITHESIS = 'antithesis',
  SYNTHESIS = 'synthesis',
  PARENTHESIS = 'parenthesis',
  PARALYSIS = 'paralysis',
}

export interface DialecticStateValues {
  availableDomainTags: { data: DomainTagDescriptor[] } | DomainTagDescriptor[];
  isLoadingDomainTags: boolean;
  domainTagsError: ApiError | null;
  selectedDomainTag: string | null;

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
  isStartNewSessionModalOpen: boolean;
  selectedModelIds: string[];

  // New state for initial prompt file content
  initialPromptFileContent: GetProjectResourceContentResponse | null;
  isLoadingInitialPromptFileContent: boolean;
  initialPromptFileContentError: ApiError | null;

  // States for generating contributions
  isGeneratingContributions: boolean;
  generateContributionsError: ApiError | null;

  // States for submitting stage responses (as per plan 1.5.6.4)
  isSubmittingStageResponses: boolean; 
  submitStageResponsesError: ApiError | null;

  // States for saving contribution edits (as per plan 1.5.6.5)
  isSavingContributionEdit: boolean;
  saveContributionEditError: ApiError | null;

  // New context states
  activeContextProjectId: string | null;
  activeContextSessionId: string | null;
  activeContextStageSlug: DialecticStage | null;
}

export interface ContributionCacheEntry {
  signedUrl?: string;
  expiry?: number;
  content?: string;
  isLoading: boolean;
  error?: string;
  mimeType?: string;
  sizeBytes?: number | null;
}

export interface DialecticActions {
  fetchAvailableDomainTags: () => Promise<void>;
  setSelectedDomainTag: (tag: string | null) => void;
  fetchAvailableDomainOverlays: (stageAssociation: DialecticStage) => Promise<void>;
  setSelectedStageAssociation: (stage: DialecticStage | null) => void;
  setSelectedDomainOverlayId: (overlayId: string | null) => void;
  
  fetchDialecticProjects: () => Promise<void>;
  fetchDialecticProjectDetails: (projectId: string) => Promise<void>;
  createDialecticProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;
  startDialecticSession: (payload: StartSessionPayload) => Promise<ApiResponse<DialecticSession>>;
  fetchAIModelCatalog: () => Promise<void>;

  fetchContributionContent: (contributionId: string) => Promise<void>;

  uploadProjectResourceFile: (payload: UploadProjectResourceFilePayload) => Promise<ApiResponse<DialecticProjectResource>>;

  resetCreateProjectError: () => void;
  resetProjectDetailsError: () => void;

  // New actions
  deleteDialecticProject: (projectId: string) => Promise<ApiResponse<void>>;
  cloneDialecticProject: (projectId: string) => Promise<ApiResponse<DialecticProject>>;
  exportDialecticProject: (projectId: string) => Promise<ApiResponse<{ export_url: string }>>;
  updateDialecticProjectInitialPrompt: (payload: UpdateProjectInitialPromptPayload) => Promise<ApiResponse<DialecticProject>>;
  setStartNewSessionModalOpen: (isOpen: boolean) => void;
  setModelMultiplicity: (modelId: string, count: number) => void;
  resetSelectedModelId: () => void;

  // New action for fetching initial prompt file content
  fetchInitialPromptContent: (resourceIdOrPath: string) => Promise<void>; // Updated to accept path too

  // Action for generating contributions
  generateContributions: (payload: { sessionId: string; projectId: string; stageSlug: DialecticStage; iterationNumber: number; }) => Promise<ApiResponse<{ message: string; contributions?: DialecticContribution[] }>>;
  
  // Actions for submitting stage responses and preparing next seed (plan 1.2.Y / 1.5.6.4)
  submitStageResponses: (payload: SubmitStageResponsesPayload) => Promise<ApiResponse<SubmitStageResponsesResponse>>; // Assuming types from plan
  resetSubmitStageResponsesError: () => void; // Added for plan

  // Actions for saving contribution edits (plan 1.2.Y / 1.5.6.5)
  saveContributionEdit: (payload: SaveContributionEditPayload) => Promise<ApiResponse<DialecticContribution>>; // Assuming types from plan
  resetSaveContributionEditError: () => void; // Added for plan

  // New context actions
  setActiveContextProjectId: (id: string | null) => void;
  setActiveContextSessionId: (id: string | null) => void;
  setActiveContextStageSlug: (slug: DialecticStage | null) => void;
  setActiveDialecticContext: (context: { projectId: string | null; sessionId: string | null; stageSlug: DialecticStage | null }) => void;

  _resetForTesting?: () => void;
}

export type DialecticStore = DialecticStateValues & DialecticActions;

export interface DialecticContribution {
    id: string;
    session_id: string;
    user_id: string | null;
    stage: string;
    iteration_number: number;
    model_id: string | null;
    model_name: string | null;
    prompt_template_id_used: string | null;
    seed_prompt_url: string | null;
    content_storage_bucket: string | null;
    content_storage_path: string | null;
    content_mime_type: string | null;
    content_size_bytes: number | null;
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
}

export interface DialecticApiClient {
  listAvailableDomainTags(): Promise<ApiResponse<{ data: DomainTagDescriptor[] }>>;
  listAvailableDomainOverlays(payload: { stageAssociation: string }): Promise<ApiResponse<DomainOverlayDescriptor[]>>;
  createProject(payload: FormData): Promise<ApiResponse<DialecticProject>>;
  listProjects(): Promise<ApiResponse<DialecticProject[]>>;
  getProjectDetails(projectId: string): Promise<ApiResponse<DialecticProject>>;
  startSession(payload: StartSessionPayload): Promise<ApiResponse<DialecticSession>>;
  listModelCatalog(): Promise<ApiResponse<AIModelCatalogEntry[]>>;
  getContributionContentSignedUrl(contributionId: string): Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>;

  uploadProjectResourceFile(payload: UploadProjectResourceFilePayload): Promise<ApiResponse<DialecticProjectResource>>;

  updateProjectDomainTag(payload: UpdateProjectDomainTagPayload): Promise<ApiResponse<DialecticProject>>;

  generateContributions(payload: GenerateContributionsPayload): Promise<ApiResponse<GenerateContributionsResponse>>;

  deleteProject(payload: DeleteProjectPayload): Promise<ApiResponse<void>>;

  cloneProject(payload: { projectId: string }): Promise<ApiResponse<DialecticProject>>;
  exportProject(payload: { projectId: string }): Promise<ApiResponse<{ export_url: string }>>;

  updateDialecticProjectInitialPrompt(payload: UpdateProjectInitialPromptPayload): Promise<ApiResponse<DialecticProject>>;

  submitStageResponses(payload: SubmitStageResponsesPayload): Promise<ApiResponse<SubmitStageResponsesResponse>>;
  updateContributionContent(payload: SaveContributionEditPayload): Promise<ApiResponse<DialecticContribution>>;

  getIterationInitialPromptContent(payload: GetIterationInitialPromptPayload): Promise<ApiResponse<IterationInitialPromptData>>;

  getProjectResourceContent(payload: GetProjectResourceContentPayload): Promise<ApiResponse<GetProjectResourceContentResponse>>;
}

export interface GenerateContributionsPayload {
  sessionId: string;
  projectId: string;
  stageSlug: DialecticStage;
  iterationNumber: number;
}

export interface GenerateContributionsResponse {
  message: string;
  contributions?: DialecticContribution[];
}

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

export interface UploadProjectResourceFilePayload {
    projectId: string;
    file: File;
    fileName: string;
    fileSizeBytes: number;
    fileType: string;
    resourceDescription?: string;
}

export interface DomainOverlayDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainTag: string;
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
  action: 'listAvailableDomainTags';
  payload?: undefined;
} | {
  action: 'listAvailableDomainOverlays';
  payload: { stageAssociation: string };
} | {
  action: 'getContributionContentSignedUrl';
  payload: GetContributionContentSignedUrlPayload;
} | {
  action: 'uploadProjectResourceFile';
  payload: FormData; 
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
  action: 'updateProjectDomainTag';
  payload: UpdateProjectDomainTagPayload;
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
  action: 'updateContributionContent';
  payload: SaveContributionEditPayload;
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
  resourceId: string;
}

export interface GetProjectResourceContentResponse {
  fileName: string;
  mimeType: string;
  content: string;
}

// Add new payload/response types if they are not already defined from the plan for submitStageResponses and saveContributionEdit
// These are placeholders from the plan, ensure they exist or are defined if not already in this file
export interface SubmitStageResponsesPayload { 
    sessionId: string;
    projectId: string;
    stageSlug: DialecticStage;
    currentIterationNumber: number;
    responses: UserResponseInput[];
}
  
export interface SubmitStageResponsesResponse { 
    userFeedbackStoragePath: string;
    nextStageSeedPromptStoragePath: string;
    updatedSession: DialecticSession;
    message?: string;
}

export interface SaveContributionEditPayload { 
    originalContributionIdToEdit: string;
    editedContentText: string;
    projectId: string;
    sessionId: string;
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

export interface UserResponseInput { 
  originalModelContributionId: string; 
  responseText: string;
}

// END: New type definitions

