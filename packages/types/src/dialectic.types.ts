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
}

export interface DialecticActions {
  fetchAvailableDomainTags: () => Promise<void>;
  setSelectedDomainTag: (tag: string | null) => void;
  
  fetchDialecticProjects: () => Promise<void>;
  createDialecticProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;

  _resetForTesting?: () => void;
}

export type DialecticStore = DialecticStateValues & DialecticActions;

// --- API Client Interface ---
export interface DialecticApiClient {
  listAvailableDomainTags: () => Promise<ApiResponse<string[]>>;
  createProject: (payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProject>>;
  listProjects: () => Promise<ApiResponse<DialecticProject[]>>;
  // Add other methods as they are defined, e.g., getProject, updateProject, deleteProject
}