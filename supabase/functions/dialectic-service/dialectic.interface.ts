import { type ChatMessage, type ILogger } from '../_shared/types.ts';
import type { Database, Json } from '../types_db.ts';
import {
  downloadFromStorage,
} from '../_shared/supabase_storage_utils.ts';
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { Logger } from '../_shared/logger.ts';
import type { IFileManager } from '../_shared/types/file_manager.types.ts';


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

// Defines the raw structure from the database
export type DialecticContributionSql = Database['public']['Tables']['dialectic_contributions']['Row'];

// Defines the structured contribution object used within the service and for API responses,
// aligning with packages/types/src/dialectic.types.ts
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
  contribution_type: string | null;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
}


export interface DialecticSessionModel {
    id: string;
    session_id: string;
    model_id: string;
    model_role: string | null;
    created_at: string;
    ai_provider?: AIModelCatalogEntry;
}

export interface DialecticSession {
  id: string;
  project_id: string;
  session_description: string | null;
  user_input_reference_url: string | null;
  iteration_count: number;
  selected_model_catalog_ids: string[] | null;
  status: string | null;
  associated_chat_id: string | null;
  current_stage_id: string | null;
  created_at: string;
  updated_at: string;
}

export type DialecticProcessTemplate = Database['public']['Tables']['dialectic_process_templates']['Row'];

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
    sessions?: DialecticSession[];
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
type GetContributionContentDataAction = { action: 'getContributionContentData', payload: GetContributionContentSignedUrlPayload };
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
  | GetSessionDetailsAction; // Add the new action to the union

// --- END: Discriminated Union ---

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

export interface StartSessionPayload {
  projectId: string;
  sessionDescription?: string | null;
  selectedModelCatalogIds: string[];
  originatingChatId?: string | null;
  stageSlug?: string;
}

export interface UpdateSessionModelsPayload {
  sessionId: string;
  selectedModelCatalogIds: string[];
}

export type StartSessionSuccessResponse = DialecticSession;

export interface CallUnifiedAIModelOptions {
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
}

export type DialecticStage = Database['public']['Tables']['dialectic_stages']['Row'];

export interface GenerateContributionsPayload {
  sessionId: string;
  projectId: string;
  stageSlug?: DialecticStage['slug'];
  iterationNumber?: number;
  chatId?: string | null;
  selectedModelCatalogIds: string[];
  walletId?: string;
}

export interface GenerateContributionsSuccessResponse {
  message: string;
  sessionId: string;
  status: string; 
  contributions: DialecticContribution[]; 
  errors?: { 
    modelId: string; 
    modelName?: string; 
    providerName?: string | null;
    message: string;
    details?: string;
  }[];
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
}

export interface SelectedAiProvider {
  id: string;                 
  provider: string | null;
  name: string;
  api_identifier: string;   
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


export interface DeleteProjectPayload {
  projectId: string;
}

export interface GetContributionContentSignedUrlPayload {
  contributionId: string;
}

export interface CloneProjectPayload {
  projectId: string;
  newProjectName?: string;
}

export interface CloneProjectSuccessResponse {
  id: string;
  project_name: string;
  created_at: string;
}

export interface ExportProjectPayload {
  projectId: string;
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
  resource_description?: Record<string, unknown> | null; // Added, replaces feedback_value_structured
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
    resourceDescription?: Record<string, unknown>; 
  };
}

export interface SubmitStageResponsesResponse {
  message: string;
  updatedSession: DialecticSession;
  feedbackRecords: DialecticFeedback[];
  nextStageSeedPromptPath: string | null;
}

// Add new types for handling artifact assembly rules
export interface ArtifactSourceRule {
  type: 'contribution' | 'feedback';
  stage_slug: string;
}

export interface InputArtifactRules {
  sources: ArtifactSourceRule[];
}

// Local response type definition to align with DB schema, avoiding interface mismatches.
export interface SubmitStageResponsesDependencies {
    downloadFromStorage: typeof downloadFromStorage;
    logger: ILogger;
    fileManager: IFileManager;
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
}