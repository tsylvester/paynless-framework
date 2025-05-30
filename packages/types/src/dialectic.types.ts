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
}

export interface CreateProjectPayload {
    projectName: string;
    initialUserPrompt: string;
    selectedDomainTag?: string | null;
}

export interface DialecticStateValues {
  availableDomainTags: string[];
  isLoadingDomainTags: boolean;
  domainTagsError: ApiError | null;
  selectedDomainTag: string | null;

  projects: DialecticProject[];
  isLoadingProjects: boolean;
  projectsError: ApiError | null;

  isCreatingProject: boolean;
  createProjectError: ApiError | null;
  contributionContentCache: { [contributionId: string]: ContributionCacheEntry };
}

export interface ContributionCacheEntry {
  signedUrl?: string;
  expiry?: number; // Store expiry timestamp (e.g., Date.now() + expiresInMilliseconds)
  content?: string; // The actual fetched content
  isLoading: boolean;
  error?: string; // Error message string
  mimeType?: string;
  sizeBytes?: number | null;
}

export interface DialecticActions {
  fetchAvailableDomainTags: () => Promise<void>;
  setSelectedDomainTag: (tag: string | null) => void;
  
  fetchDialecticProjects: () => Promise<void>;
  createDialecticProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;
  fetchContributionContent: (contributionId: string) => Promise<void>;

  _resetForTesting?: () => void;
}

export type DialecticStore = DialecticStateValues & DialecticActions;

// Define DialecticContribution interface
export interface DialecticContribution {
    id: string;
    session_id: string;
    user_id: string | null; // Can be null if system-generated and not directly tied to a user action
    stage: string; // e.g., 'thesis', 'antithesis', 'synthesis', 'parenthesis', 'paralysis'
    model_id: string | null; // The ID of the AI model provider used, e.g., "openai/gpt-4"
    actual_prompt_sent: string | null; // The exact prompt sent to the AI
    
    // Fields for content stored in Supabase Storage
    content_storage_bucket: string | null;
    content_storage_path: string | null;
    content_mime_type: string | null; // e.g., 'text/markdown', 'application/json'
    content_size_bytes: number | null;

    // Optional: If raw provider response is also stored
    raw_response_storage_path: string | null;

    // Token usage and cost
    tokens_used_input: number | null;
    tokens_used_output: number | null;
    cost_usd: number | null;

    parent_contribution_id: string | null; // For linking critiques to theses, etc.
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
}

// --- API Client Interface ---
export interface DialecticApiClient {
  listAvailableDomainTags: () => Promise<ApiResponse<string[]>>;
  createProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;
  listProjects: () => Promise<ApiResponse<DialecticProject[]>>;
  getContributionContentSignedUrl: (contributionId: string) => Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>;
  // Add other methods as they are defined, e.g., getProject, updateProject, deleteProject
}

// Define the response type for getContributionContentSignedUrl
export interface ContributionContentSignedUrlResponse {
    signedUrl: string;
    mimeType: string;
    sizeBytes: number | null;
}