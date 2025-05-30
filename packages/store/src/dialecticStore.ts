import { create } from 'zustand';
import type { 
  ApiError, 
  ApiResponse, 
  DialecticProject, 
  CreateProjectPayload, 
  DialecticStateValues, 
  DialecticStore, 
  DialecticApiClient // Make sure this is imported if it's used for explicit typing anywhere, though likely inferred
} from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';


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
      // logger.warn('[DialecticStore] listProjects API method not yet implemented. Simulating empty fetch.');
      const response = await api.dialectic().listProjects(); 
      if (response.error) {
        logger.error('[DialecticStore] Error fetching projects:', { errorDetails: response.error });
        set({ projects: [], isLoadingProjects: false, projectsError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully fetched projects:', { projects: response.data });
        set({ projects: response.data || [], isLoadingProjects: false, projectsError: null });
      }
      // set({ projects: [], isLoadingProjects: false, projectsError: null });
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
        await get().fetchDialecticProjects(); 
      }
      return response; 
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while creating project',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error creating project:', { errorDetails: networkError });
      set({ isCreatingProject: false, createProjectError: networkError });
      return { error: networkError, status: 0 }; 
    }
  },

  _resetForTesting: () => {
    set(initialDialecticStateValues);
    logger.info('[DialecticStore] Reset for testing.');
  }
}));

export const getDialecticStoreInitialState = (): DialecticStateValues => ({ ...initialDialecticStateValues }); 