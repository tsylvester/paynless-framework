import { ChatMessage } from "../_shared/types.ts"; 
import type { Database } from "../types_db.ts";
// Removed problematic import: import type { DialecticProject as PackageDialecticProject, ... } from "../../../../packages/types/src/dialectic.types.ts";

// --- START: Redefined types based on packages/types/src/dialectic.types.ts ---
// These are simplified here for the backend interface. 
// The backend will construct data matching the richer frontend types from packages/types.

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
    model_id: string | null;
    model_name: string | null;
    user_id: string | null; // Note: Not directly in dialectic_contributions table; added from context.
    stage: string;
    iteration_number: number;
    actual_prompt_sent: string | null;
    
    content_storage_bucket: string | null; // Aligns with packages/types nullability
    content_storage_path: string | null;   // Aligns with packages/types nullability
    content_mime_type: string | null;    // Aligns with packages/types nullability
    content_size_bytes: number | null;

    raw_response_storage_path: string | null;

    tokens_used_input: number | null;
    tokens_used_output: number | null;
    processing_time_ms: number | null;

    citations: { text: string; url?: string }[] | null; // Specific typing for citations

    parent_contribution_id: string | null; // Renamed from DB's target_contribution_id for packages/types alignment
    created_at: string;
    updated_at: string;

    edit_version: number;
    is_latest_edit: boolean;
    original_model_contribution_id: string | null;
    error: string | null;
    contribution_type: string | null;
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

export interface DialecticProject {
    id: string;
    user_id: string;
    project_name: string;
    initial_user_prompt: string;
    initial_prompt_resource_id?: string | null;
    selected_domain_tag: string | null;
    selected_domain_overlay_id?: string | null;
    repo_url: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    sessions?: DialecticSession[];
}

// --- END: Redefined types ---

export interface DialecticServiceRequest {
    action: string;
    payload?: Record<string, unknown>; 
}

export interface CreateProjectPayload {
  projectName: string;
  initialUserPrompt: string;
  selectedDomainTag?: string | null;
  selected_domain_overlay_id?: string | null;
}

export interface UpdateProjectDomainTagPayload {
  projectId: string;
  domainTag: string | null;
}

export interface UpdateProjectDomainTagSuccessData {
  id: string;
  project_name: string;
  selected_domain_tag: string | null;
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
  stageAssociation: DialecticStage;
  selectedDomainOverlayId?: string | null;
  promptTemplateId?: string | null;
  maxIterations?: number;
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

export interface GenerateStageContributionsPayload {
  sessionId: string;
  stage: string;
}

export interface GenerateStageContributionsSuccessResponse {
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

export interface SelectedAiProvider {
  id: string;                 
  provider: string | null;
  name: string;
  api_identifier: string;   
}

export interface ContributionWithNestedOwner {
  content_storage_bucket: string | null;
  content_storage_path: string | null;
  content_mime_type: string | null;
  content_size_bytes: number | null;
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

export interface UploadProjectResourceFilePayload {
  projectId: string;
  fileName: string; // Original file name
  fileType: string; // MIME type
  resourceDescription?: string | null;
  // The actual file will be part of FormData, not this JSON payload
}

export interface UploadProjectResourceFileSuccessResponse {
  message: string;
  resource: DialecticProjectResource;
}
// --- END: Added for Project Resource Upload (1.0.B) ---

export interface DomainOverlayDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainTag: string;
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
}

export interface CloneProjectSuccessResponse {
}

export interface ExportProjectPayload {
}

export interface ExportProjectSuccessResponse {
  export_url: string;
}

export enum DialecticStage {
  THESIS = 'thesis',
  ANTITHESIS = 'antithesis',
  SYNTHESIS = 'synthesis',
  PARENTHESIS = 'parenthesis',
  PARALYSIS = 'paralysis',
}

export interface GetProjectResourceContentPayload {
  resourceId: string;
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

// DialecticContribution is used as the success response for SaveContributionEdit

// Ensure this is the end of the file or before any other specific type groupings if necessary

// Add other service-specific interfaces here if needed in the future

// Added for submitStageResponsesAndPrepareNextSeed
export interface DialecticFeedback {
  id: string;
  session_id: string;
  contribution_id: string; // The ID of the contribution this feedback is for
  user_id: string;
  feedback_value_text: string | null;
  feedback_value_rating: number | null;
  feedback_type: string; // e.g., 'refinement', 'critique', 'rating', 'note_for_next_stage'
  created_at: string;
  updated_at: string;
}

export interface SubmitStageResponseItem {
  originalContributionId: string;
  responseText: string;
  rating?: number;
}

export interface SubmitStageResponsesPayload {
  sessionId: string;
  currentStageSlug: DialecticStage;
  currentIterationNumber: number;
  responses: SubmitStageResponseItem[];
  userConsolidatedNote?: string; // An overall note from the user for this stage's feedback
}

export interface SubmitStageResponsesResponse {
  message: string;
  updatedSession: DialecticSession;
  feedbackRecords: DialecticFeedback[];
  nextStageSeedPromptPath: string;
}
