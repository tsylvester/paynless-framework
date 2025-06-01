import type { ApiError, ApiResponse } from './api.types';

export interface DialecticProject {
    id: string;
    user_id: string;
    project_name: string;
    initial_user_prompt: string;
    selected_domain_tag: string | null;
    repo_url: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    sessions?: DialecticSession[]; 
}

export interface CreateProjectPayload {
    projectName: string;
    initialUserPrompt: string;
    selectedDomainTag?: string | null;
}

export interface StartSessionPayload {
    projectId: string;
    selectedModelCatalogIds: string[];
    sessionDescription?: string | null;
    originatingChatId?: string | null;
    thesisPromptTemplateId?: string;
    antithesisPromptTemplateId?: string;
    synthesisPromptTemplateId?: string;
    parenthesisPromptTemplateId?: string;
    paralysisPromptTemplateId?: string;
    formalDebateStructureId?: string | null;
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
    
    formal_debate_structure_id?: string | null;
    max_iterations: number;
    
    created_at: string;
    updated_at: string;

    dialectic_session_models?: DialecticSessionModel[];
    dialectic_contributions?: DialecticContribution[];
    
    convergence_status?: string | null;
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

export interface PromptTemplate {
    id: string;
    name: string;
    prompt_text: string;
    description: string | null;
    stage_association: string | null;
    version: number;
    variables_required: Record<string, string> | null;
    is_stage_default: boolean;
    context: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface DialecticStateValues {
  availableDomainTags: string[];
  isLoadingDomainTags: boolean;
  domainTagsError: ApiError | null;
  selectedDomainTag: string | null;

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
  
  fetchDialecticProjects: () => Promise<void>;
  fetchDialecticProjectDetails: (projectId: string) => Promise<void>;
  createDialecticProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;
  startDialecticSession: (payload: StartSessionPayload) => Promise<ApiResponse<DialecticSession>>;
  fetchAIModelCatalog: () => Promise<void>;

  fetchContributionContent: (contributionId: string) => Promise<void>;

  uploadProjectResourceFile: (payload: UploadProjectResourceFilePayload) => Promise<ApiResponse<DialecticProjectResource>>;

  resetCreateProjectError: () => void;
  resetProjectDetailsError: () => void;

  _resetForTesting?: () => void;
}

export type DialecticStore = DialecticStateValues & DialecticActions;

export interface DialecticContribution {
    id: string;
    session_id: string;
    session_model_id: string;
    user_id: string | null;
    stage: string;
    iteration_number: number;
    actual_prompt_sent: string | null;
    
    content_storage_bucket: string | null;
    content_storage_path: string | null;
    content_mime_type: string | null;
    content_size_bytes: number | null;

    raw_response_storage_path: string | null;

    tokens_used_input: number | null;
    tokens_used_output: number | null;
    cost_usd: number | null;
    processing_time_ms: number | null;

    citations: { text: string; url?: string }[] | null;

    parent_contribution_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface DialecticApiClient {
  listAvailableDomainTags: () => Promise<ApiResponse<string[]>>;
  createProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;
  listProjects: () => Promise<ApiResponse<DialecticProject[]>>;
  getProjectDetails: (projectId: string) => Promise<ApiResponse<DialecticProject>>;
  startSession: (payload: StartSessionPayload) => Promise<ApiResponse<DialecticSession>>;
  listModelCatalog: () => Promise<ApiResponse<AIModelCatalogEntry[]>>;
  getContributionContentSignedUrl: (contributionId: string) => Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>;

  uploadProjectResourceFile: (payload: UploadProjectResourceFilePayload) => Promise<ApiResponse<DialecticProjectResource>>;
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
    fileName: string;
    fileSizeBytes: number;
    fileType: string;
    resourceDescription?: string;
}