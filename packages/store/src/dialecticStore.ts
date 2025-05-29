import { create } from 'zustand';
import type { ApiError, ApiResponse } from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';

// Types copied from @paynless/api for now, centralize later
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

export const initialDialecticStateValues: DialecticStateValues = {
  availableDomainTags: [],
  isLoadingDomainTags: false,
  domainTagsError: null,
  selectedDomainTag: null,

  projects: [],
  isLoadingProjects: false,
  projectsError: null,

  isCreatingProject: false,
  createProjectError: null,
};

export const useDialecticStore = create<DialecticStore>((set, get) => ({
  ...initialDialecticStateValues,

  fetchAvailableDomainTags: async () => {
    set({ isLoadingDomainTags: true, domainTagsError: null });
    logger.info('[DialecticStore] Fetching available domain tags...');
    try {
      const response = await api.dialectic().listAvailableDomainTags();
      
      if (response.error) {
        logger.error('[DialecticStore] Error fetching domain tags:', { errorDetails: response.error });
        set({ availableDomainTags: [], isLoadingDomainTags: false, domainTagsError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully fetched domain tags:', { tags: response.data });
        set({
          availableDomainTags: response.data || [],
          isLoadingDomainTags: false,
          domainTagsError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching domain tags',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching domain tags:', { errorDetails: networkError });
      set({ availableDomainTags: [], isLoadingDomainTags: false, domainTagsError: networkError });
    }
  },

  setSelectedDomainTag: (tag: string | null) => {
    logger.info(`[DialecticStore] Setting selected domain tag to: ${tag}`);
    set({ selectedDomainTag: tag });
  },

  fetchDialecticProjects: async () => {
    set({ isLoadingProjects: true, projectsError: null });
    logger.info('[DialecticStore] Fetching dialectic projects...');
    try {
      // Placeholder for api.dialectic().listProjects() - this method is not yet implemented in the API client as per plan
      // For now, simulate a successful empty fetch or handle as a pending feature
      logger.warn('[DialecticStore] listProjects API method not yet implemented. Simulating empty fetch.');
      // const response = await api.dialectic().listProjects(); 
      // if (response.error) {
      //   logger.error('[DialecticStore] Error fetching projects:', { errorDetails: response.error });
      //   set({ projects: [], isLoadingProjects: false, projectsError: response.error });
      // } else {
      //   logger.info('[DialecticStore] Successfully fetched projects:', { projects: response.data });
      //   set({ projects: response.data || [], isLoadingProjects: false, projectsError: null });
      // }
      // Simulate success with empty array for now:
      set({ projects: [], isLoadingProjects: false, projectsError: null });
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching projects',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching projects:', { errorDetails: networkError });
      set({ projects: [], isLoadingProjects: false, projectsError: networkError });
    }
  },

  createDialecticProject: async (payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>> => {
    set({ isCreatingProject: true, createProjectError: null });
    logger.info('[DialecticStore] Creating dialectic project...', { projectPayload: payload });
    try {
      const response = await api.dialectic().createProject(payload);
      
      if (response.error) {
        logger.error('[DialecticStore] Error creating project:', { errorDetails: response.error });
        set({ isCreatingProject: false, createProjectError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully created project:', { projectDetails: response.data });
        set({ isCreatingProject: false, createProjectError: null });
        // Successfully created, now refetch the list of projects to include the new one.
        // This is simpler than trying to merge the new project into the existing list.
        await get().fetchDialecticProjects(); 
      }
      return response; // Return the full response for UI to handle if needed (e.g., navigation)
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while creating project',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error creating project:', { errorDetails: networkError });
      set({ isCreatingProject: false, createProjectError: networkError });
      return { error: networkError, status: 0 }; // Return error structure
    }
  },

  _resetForTesting: () => {
    set(initialDialecticStateValues);
    logger.info('[DialecticStore] Reset for testing.');
  }
}));

export const getDialecticStoreInitialState = (): DialecticStateValues => ({ ...initialDialecticStateValues }); 