import { create } from 'zustand';
import type { 
  ApiError, 
  ApiResponse, 
  DialecticProject, 
  CreateProjectPayload, 
  DialecticStateValues, 
  DialecticStore, 
  StartSessionPayload,
  DialecticSession,
  UpdateProjectInitialPromptPayload,
  DialecticStage,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SaveContributionEditPayload,
  DialecticContribution,
  DialecticDomain,
  UpdateSessionModelsPayload,
  GenerateContributionsPayload,
  GenerateContributionsResponse,
} from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';


export const initialDialecticStateValues: DialecticStateValues = {

  domains: [],
  isLoadingDomains: false,
  domainsError: null,
  selectedDomain: null,

  // New initial state for Domain Overlays
  selectedStageAssociation: null,
  availableDomainOverlays: [],
  isLoadingDomainOverlays: false,
  domainOverlaysError: null,
  selectedDomainOverlayId: null,
  // End new initial state for Domain Overlays

  projects: [],
  isLoadingProjects: false,
  projectsError: null,

  currentProjectDetail: null,
  isLoadingProjectDetail: false,
  projectDetailError: null,

  modelCatalog: [],
  isLoadingModelCatalog: false,
  modelCatalogError: null,

  isCreatingProject: false,
  createProjectError: null,
  isStartingSession: false,
  startSessionError: null,

  contributionContentCache: {},

  allSystemPrompts: [],

  // Project cloning states
  isCloningProject: false,
  cloneProjectError: null,

  // Project exporting states
  isExportingProject: false,
  exportProjectError: null,

  // Added for IPS update
  isUpdatingProjectPrompt: false,
  isUploadingProjectResource: false,
  uploadProjectResourceError: null,
  selectedModelIds: [],

  // Cache for initial prompt file content, mapping resourceId to its state
  initialPromptContentCache: {},

  // New state for process templates
  currentProcessTemplate: null,
  isLoadingProcessTemplate: false,
  processTemplateError: null,

  // States for generating contributions
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,

  isSubmittingStageResponses: false,
  submitStageResponsesError: null,

  isSavingContributionEdit: false,
  saveContributionEditError: null,

  activeContextProjectId: null,
  activeContextSessionId: null,
  activeContextStage: null,

  // New initial states for single session fetching
  activeSessionDetail: null,
  isLoadingActiveSessionDetail: false,
  activeSessionDetailError: null,

  // States for updating session models
  isUpdatingSessionModels: false,
  updateSessionModelsError: null,

  // ADDED: Initial states for fetching feedback file content
  currentFeedbackFileContent: null,
  isFetchingFeedbackFileContent: false,
  fetchFeedbackFileContentError: null,

  activeDialecticWalletId: null,
};

export const useDialecticStore = create<DialecticStore>((set, get) => ({
  ...initialDialecticStateValues,

  fetchDomains: async () => {
    set({ isLoadingDomains: true, domainsError: null });
    logger.info('[DialecticStore] Fetching dialectic domains...');
    try {
      const response = await api.dialectic().listDomains();
      if (response.error) {
        logger.error('[DialecticStore] Error fetching domains:', { errorDetails: response.error });
        set({ domains: [], isLoadingDomains: false, domainsError: response.error });
      } else {
        const domains = response.data || [];
        logger.info('[DialecticStore] Successfully fetched domains:', { domains });
        set({
          domains,
          isLoadingDomains: false,
          domainsError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching domains',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching domains:', { errorDetails: networkError });
      set({ domains: [], isLoadingDomains: false, domainsError: networkError });
    }
  },

  setSelectedDomain: (domain: DialecticDomain | null) => {
    logger.info('[DialecticStore] Setting selected domain', { domain });
    set({ selectedDomain: domain });
  },

  setSelectedDomainOverlayId: (id: string | null) => {
    logger.info(`[DialecticStore] Setting selected domain overlay ID to: ${id}`);
    set({ selectedDomainOverlayId: id });
  },

  setSelectedStageAssociation: (stage: DialecticStage | null) => {
    logger.info(`[DialecticStore] Setting selected stage association to: ${stage?.slug ?? 'null'}`);
    set({ 
      selectedStageAssociation: stage,
      // When stage selection changes, clear previously fetched overlays and any related errors
      availableDomainOverlays: [], 
      domainOverlaysError: null, 
      isLoadingDomainOverlays: false, // Reset loading state for overlays
    });
  },

  fetchAvailableDomainOverlays: async (stageAssociation: DialecticStage) => {
    set({
      isLoadingDomainOverlays: true,
      domainOverlaysError: null,
      availableDomainOverlays: [],
      selectedStageAssociation: stageAssociation, 
    });
    logger.info(`[DialecticStore] Fetching available domain overlays for stage: ${stageAssociation.slug}`);
    try {
      const response = await api.dialectic().listAvailableDomainOverlays({ stageAssociation: stageAssociation.slug });

      if (response.error) {
        logger.error('[DialecticStore] Error fetching domain overlays:', { stageAssociation: stageAssociation.slug, errorDetails: response.error });
        set({
          availableDomainOverlays: [],
          isLoadingDomainOverlays: false,
          domainOverlaysError: response.error,
        });
      } else {
        const descriptors = response.data || []; 
        logger.info('[DialecticStore] Raw descriptors received from API:', { descriptors }); 
        logger.info('[DialecticStore] Successfully fetched domain overlays:', { stageAssociation: stageAssociation.slug, count: descriptors.length });
        set({
          availableDomainOverlays: descriptors,
          isLoadingDomainOverlays: false,
          domainOverlaysError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching domain overlays',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching domain overlays:', { stageAssociation: stageAssociation.slug, errorDetails: networkError });
      set({
        availableDomainOverlays: [],
        isLoadingDomainOverlays: false,
        domainOverlaysError: networkError,
      });
    }
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
        // response.data is expected to be DialecticProject[] or undefined/null
        const projectsArray = Array.isArray(response.data) 
          ? response.data 
          : []; // Default to empty array if data is not an array (e.g., null/undefined)
        logger.info('[DialecticStore] Successfully fetched projects:', { projects: projectsArray });
        set({ projects: projectsArray, isLoadingProjects: false, projectsError: null });
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

  fetchDialecticProjectDetails: async (projectId: string) => {
    set({ isLoadingProjectDetail: true, projectDetailError: null });
    logger.info(`[DialecticStore] Fetching project details for project ID: ${projectId}`);
    try {
      const response = await api.dialectic().getProjectDetails(projectId);
      if (response.error) {
        logger.error('[DialecticStore] Error fetching project details:', { projectId, errorDetails: response.error });
        set({ currentProjectDetail: null, isLoadingProjectDetail: false, projectDetailError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully fetched project details:', { projectId, project: response.data });
        
        const projectData = response.data;
        if (projectData && projectData.dialectic_sessions) {
          projectData.dialectic_sessions = projectData.dialectic_sessions.map(session => ({
            ...session,
            dialectic_contributions: session.dialectic_contributions || [], // Default to empty array
            feedback: session.feedback || [], // Default to empty array for feedback
          }));
        }
        
        set({
          currentProjectDetail: projectData,
          isLoadingProjectDetail: false,
          projectDetailError: null,
        });
        
        // Set active context and clear selected models
        get().setActiveDialecticContext({ 
          projectId: projectData ? projectData.id : null, 
          sessionId: null, 
          stage: null 
        });
        get().setSelectedModelIds([]);
        
        if (projectData?.process_template_id) {
          logger.info(`[DialecticStore] Project has process template ID. Fetching template...`, { templateId: projectData.process_template_id });
          await get().fetchProcessTemplate(projectData.process_template_id);
        } else {
            logger.warn(`[DialecticStore] Project details fetched, but no process template ID found.`);
        }
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching project details',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching project details:', { projectId, errorDetails: networkError });
      set({ currentProjectDetail: null, isLoadingProjectDetail: false, projectDetailError: networkError });
    }
  },

  fetchProcessTemplate: async (templateId: string) => {
    set({ isLoadingProcessTemplate: true, processTemplateError: null });
    logger.info(`[DialecticStore] Fetching process template...`, { templateId });
    try {
      const response = await api.dialectic().fetchProcessTemplate({ templateId });
      if (response.error) {
        logger.error(`[DialecticStore] Error fetching process template`, { templateId, error: response.error });
        set({ isLoadingProcessTemplate: false, processTemplateError: response.error });
      } else {
        logger.info(`[DialecticStore] Successfully fetched process template`, { templateId, template: response.data });
        set({
          isLoadingProcessTemplate: false,
          currentProcessTemplate: response.data || null,
        });

        const { currentProjectDetail } = get();
        const template = response.data;

        if (!currentProjectDetail || !template?.stages) {
          logger.warn('[DialecticStore] Cannot determine active stage without project details or template stages.');
          return;
        }

        const latestSession = (currentProjectDetail.dialectic_sessions || [])
          .slice() // Create a shallow copy before sorting
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        let stageToSet: DialecticStage | undefined = undefined;

        if (latestSession && latestSession.current_stage_id) {
          // Case: An active session exists. Set stage from the session.
          stageToSet = template.stages.find(s => s.id === latestSession.current_stage_id);
          if (stageToSet) {
            logger.info(`[DialecticStore] Active session found. Setting stage to: ${stageToSet.slug}`);
          } else {
            logger.warn(`[DialecticStore] Could not find stage with ID ${latestSession.current_stage_id} in the template.`);
          }
        } else {
          // Case: No sessions. Use the template's starting stage.
          if (template.starting_stage_id) {
            stageToSet = template.stages.find(s => s.id === template.starting_stage_id);
            if (stageToSet) {
              logger.info(`[DialecticStore] No active session. Setting initial stage to: ${stageToSet.slug}`);
            } else {
               logger.warn(`[DialecticStore] Could not find starting stage with ID ${template.starting_stage_id} in the template.`);
            }
          }
        }

        if (stageToSet) {
          set({ activeContextStage: stageToSet });
        } else if (!get().activeContextStage) {
          // Fallback: if no stage could be determined and none is set, set to the first stage in the template
          const firstStage = template.stages[0];
          if (firstStage) {
            logger.info(`[DialecticStore] Fallback: setting stage to the first available stage: ${firstStage.slug}`);
            set({ activeContextStage: firstStage });
          }
        }
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching the process template',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching process template:', { templateId, errorDetails: networkError });
      set({ currentProcessTemplate: null, isLoadingProcessTemplate: false, processTemplateError: networkError });
    }
  },

  createDialecticProject: async (payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>> => {
    set({ isCreatingProject: true, createProjectError: null });
    logger.info('[DialecticStore] Creating new dialectic project with payload:', { payload });
    
    // The API client now expects FormData
    const formData = new FormData();
    formData.append('action', 'createProject');
    formData.append('projectName', payload.projectName);
    formData.append('selectedDomainId', payload.selectedDomainId);
    
    if (payload.initialUserPrompt) {
        formData.append('initialUserPromptText', payload.initialUserPrompt);
    }
    if (payload.selectedDomainOverlayId) {
        formData.append('selectedDomainOverlayId', payload.selectedDomainOverlayId);
    }
    if (payload.promptFile) {
        formData.append('promptFile', payload.promptFile);
    }

    try {
        const response = await api.dialectic().createProject(formData);

        if (response.error) {
            logger.error('[DialecticStore] Error creating project:', { errorDetails: response.error });
            set({ isCreatingProject: false, createProjectError: response.error });
        } else {
            logger.info('[DialecticStore] Successfully created project:', { project: response.data });
            // Add the new project to the start of the projects list
            set(state => ({
                projects: [response.data as DialecticProject, ...state.projects],
                isCreatingProject: false,
                createProjectError: null,
                currentProjectDetail: response.data as DialecticProject, // Also set as current
            }));
        }
        return response;
    } catch (error: unknown) {
        const networkError: ApiError = {
            message: error instanceof Error ? error.message : 'An unknown network error occurred',
            code: 'NETWORK_ERROR',
        };
        logger.error('[DialecticStore] Network error creating project:', { errorDetails: networkError });
        set({ isCreatingProject: false, createProjectError: networkError });
        return { error: networkError, status: 0 };
    }
  },

  startDialecticSession: async (payload: StartSessionPayload): Promise<ApiResponse<DialecticSession>> => {
    set({ isStartingSession: true, startSessionError: null });
    logger.info('[DialecticStore] Starting dialectic session...', { sessionPayload: payload });
    try {
      const response = await api.dialectic().startSession(payload);
      if (response.error) {
        logger.error('[DialecticStore] Error starting session:', { errorDetails: response.error });
        set({ isStartingSession: false, startSessionError: response.error });
        return { error: response.error, status: response.status };
      } else {
        logger.info('[DialecticStore] Successfully started session:', { sessionDetails: response.data });
        set({ isStartingSession: false, startSessionError: null });
        
        // If session start is successful, refetch project details to get updated session list
        // or refetch the entire project list if project_id is not in the session response
        if (response.data?.project_id) {
          logger.info(`[DialecticStore] Session started for project ${response.data.project_id}. Refetching project details.`);
          await get().fetchDialecticProjectDetails(response.data.project_id);
        } else {
          logger.info('[DialecticStore] Session started, but no project_id in response. Refetching project list.');
          await get().fetchDialecticProjects();
        }
        return { data: response.data, status: response.status };
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while starting session',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error starting session:', { errorDetails: networkError });
      set({ isStartingSession: false, startSessionError: networkError });
      return { error: networkError, status: 0 };
    }
  },

  fetchAIModelCatalog: async () => {
    set({ isLoadingModelCatalog: true, modelCatalogError: null });
    logger.info('[DialecticStore] Fetching AI model catalog...');
    try {
      const response = await api.dialectic().listModelCatalog();
      if (response.error) {
        logger.error('[DialecticStore] Error fetching AI model catalog:', { errorDetails: response.error });
        set({ modelCatalog: [], isLoadingModelCatalog: false, modelCatalogError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully fetched AI model catalog:', { catalog: response.data });
        set({
          modelCatalog: response.data || [],
          isLoadingModelCatalog: false,
          modelCatalogError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching AI model catalog',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching AI model catalog:', { errorDetails: networkError });
      set({ modelCatalog: [], isLoadingModelCatalog: false, modelCatalogError: networkError });
    }
  },

  _resetForTesting: () => {
    set(initialDialecticStateValues);
    logger.info('[DialecticStore] Reset for testing.');
  },

  resetCreateProjectError: () => {
    logger.info('[DialecticStore] Resetting createProjectError.');
    set({ createProjectError: null });
  },

  resetProjectDetailsError: () => {
    logger.info('[DialecticStore] Resetting projectDetailError.');
    set({ projectDetailError: null });
  },

  fetchContributionContent: async (contributionId: string) => {
    const currentCache = get().contributionContentCache;
    const entry = currentCache[contributionId];

    // 1. Check cache for already loaded, non-error content
    if (entry && entry.content && !entry.error) {
      logger.info(`[DialecticStore] Content for ${contributionId} found in cache.`);
      if (entry.isLoading) {
        set(state => ({ 
          contributionContentCache: {
            ...state.contributionContentCache,
            [contributionId]: { ...state.contributionContentCache[contributionId], isLoading: false },
          },
        }));
      }
      return;
    }

    // 2. Set loading state and clear previous error
    logger.info(`[DialecticStore] Fetching content data directly for ${contributionId}.`);
    set(state => {
      const existingEntryForId = state.contributionContentCache[contributionId];
      return {
        contributionContentCache: {
          ...state.contributionContentCache,
          [contributionId]: {
            ...(existingEntryForId || {}),
            isLoading: true,
            error: null, 
            content: undefined, 
          },
        },
      };
    });

    try {
      logger.info(`[DialecticStore] fetchContributionContent: Attempting API call for ${contributionId}`);
      const response = await api.dialectic().getContributionContentData(contributionId);

      if (response.error || !response.data) {
        const errorDetail: ApiError = response.error || {
          message: 'Failed to fetch contribution content, no data returned.',
          code: 'NO_DATA_RETURNED',
        };
        logger.error('[DialecticStore] Error fetching contribution content data directly:', { contributionId, error: errorDetail });
        set(state => ({
          contributionContentCache: {
            ...state.contributionContentCache,
            [contributionId]: {
              ...state.contributionContentCache[contributionId],
              isLoading: false,
              error: errorDetail,
              content: undefined, // Ensure content is undefined on error
            },
          },
        }));
        return;
      }

      // Successfully fetched content
      const { content, mimeType, sizeBytes, fileName } = response.data;
      logger.info(`[DialecticStore] Successfully fetched content data directly for ${contributionId}`, { fileName, mimeType });
      set(state => ({
        contributionContentCache: {
          ...state.contributionContentCache,
          [contributionId]: {
            ...state.contributionContentCache[contributionId], // Preserve other fields if any, though most are set here
            isLoading: false,
            error: null,
            content: content,
            mimeType: mimeType,
            sizeBytes: sizeBytes,
            fileName: fileName,
          },
        },
      }));

    } catch (e: unknown) {
      const networkError: ApiError = {
        message: e instanceof Error ? e.message : 'A network error occurred while fetching contribution content.',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching contribution content data directly:', { contributionId, error: networkError });
      set(state => ({
        contributionContentCache: {
          ...state.contributionContentCache,
          [contributionId]: {
            ...state.contributionContentCache[contributionId], // Preserve other fields if any
            isLoading: false,
            error: networkError,
            content: undefined, // Ensure content is undefined on error
          },
        },
      }));
    }
  },

  deleteDialecticProject: async (projectId: string): Promise<ApiResponse<void>> => {
    // Reset any previous global project error, as this operation is specific.
    // Individual errors for this action will be handled by the component using the returned ApiResponse.
    // However, we should clear the main projectsError if it was related to fetching, 
    // as a successful delete might change the context.
    set({ projectsError: null }); 
    logger.info(`[DialecticStore] Deleting project with ID: ${projectId}`);
    try {
      const response = await api.dialectic().deleteProject({ projectId });
      if (response.error) {
        logger.error('[DialecticStore] Error deleting project:', { projectId, errorDetails: response.error });
        // Set projectsError here so UI can react to a failed delete if needed for global error display
        set({ projectsError: response.error }); 
      } else {
        logger.info('[DialecticStore] Successfully deleted project:', { projectId });
        // Remove the project from the local state
        set(state => ({
          projects: state.projects.filter(p => p.id !== projectId),
          projectsError: null, // Clear error on success
        }));
      }
      return response;
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while deleting project',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error deleting project:', { projectId, errorDetails: networkError });
      set({ projectsError: networkError }); // Set global projects error for network issues
      return { error: networkError, status: 0 };
    }
  },

  cloneDialecticProject: async (projectId: string): Promise<ApiResponse<DialecticProject>> => {
    set({ isCloningProject: true, cloneProjectError: null });
    logger.info(`[DialecticStore] Cloning project with ID: ${projectId}`);
    try {
      const response = await api.dialectic().cloneProject({ projectId });
      if (response.error) {
        logger.error('[DialecticStore] Error cloning project:', { projectId, errorDetails: response.error });
        set({ isCloningProject: false, cloneProjectError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully cloned project:', { originalProjectId: projectId, newProject: response.data });
        set({ isCloningProject: false, cloneProjectError: null });
        await get().fetchDialecticProjects(); // Refetch projects list
      }
      return response;
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while cloning project',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error cloning project:', { projectId, errorDetails: networkError });
      set({ isCloningProject: false, cloneProjectError: networkError });
      return { error: networkError, status: 0 };
    }
  },

  exportDialecticProject: async (projectId: string): Promise<ApiResponse<{ export_url: string }>> => {
    set({ isExportingProject: true, exportProjectError: null });
    logger.info(`[DialecticStore] Exporting project with ID: ${projectId}`);
    try {
      const response = await api.dialectic().exportProject({ projectId });
      if (response.error) {
        logger.error('[DialecticStore] Error exporting project:', { projectId, errorDetails: response.error });
        set({ isExportingProject: false, exportProjectError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully requested project export:', { projectId, exportDetails: response.data });
        set({ isExportingProject: false, exportProjectError: null });
        // Depending on the backend, the export might be a URL to a file or the file itself.
        // The component calling this will handle the response.data.export_url
      }
      return response;
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while exporting project',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error exporting project:', { projectId, errorDetails: networkError });
      set({ isExportingProject: false, exportProjectError: networkError });
      return { error: networkError, status: 503 };
    }
  },

  updateDialecticProjectInitialPrompt: async (payload: UpdateProjectInitialPromptPayload): Promise<ApiResponse<DialecticProject>> => {
    set({ isUpdatingProjectPrompt: true, projectDetailError: null });
    logger.info(`[DialecticStore] Attempting to update initial prompt for project: ${payload.projectId}`);
    try {
      const response = await api.dialectic().updateDialecticProjectInitialPrompt(payload);
      if (response.error || !response.data) {
        const error = response.error || { message: 'No data returned from update initial prompt', code: 'UNKNOWN_ERROR' } as ApiError;
        logger.error('[DialecticStore] Failed to update initial prompt:', { errorDetails: error });
        set({ isUpdatingProjectPrompt: false, projectDetailError: error });
        return { data: undefined, error, status: response.status || 0 };
      }
      logger.info(`[DialecticStore] Successfully updated initial prompt for project: ${response.data.id}`);
      set(state => ({
        isUpdatingProjectPrompt: false,
        projectDetailError: null,
        currentProjectDetail: state.currentProjectDetail && state.currentProjectDetail.id === response.data?.id 
          ? response.data 
          : state.currentProjectDetail,
        projects: state.projects.map(p => p.id === response.data?.id ? response.data! : p),
      }));
      return response;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const networkError: ApiError = { message: errMsg, code: 'NETWORK_ERROR' };
      logger.error('[DialecticStore] Network or unexpected error updating initial prompt:', { errorDetails: networkError });
      set({ isUpdatingProjectPrompt: false, projectDetailError: networkError });
      return { data: undefined, error: networkError, status: 0 };
    }
  },

  updateSessionModels: async (payload: UpdateSessionModelsPayload): Promise<ApiResponse<DialecticSession>> => {
    set({ isUpdatingSessionModels: true, updateSessionModelsError: null });
    logger.info('[DialecticStore] Updating session models...', { payload });
    try {
      const response = await api.dialectic().updateSessionModels(payload);
      if (response.error || !response.data) {
        const error = response.error || { message: 'No data returned from update session models', code: 'UNKNOWN_ERROR' } as ApiError;
        logger.error('[DialecticStore] Error updating session models:', { errorDetails: error, sessionId: payload.sessionId });
        set({ isUpdatingSessionModels: false, updateSessionModelsError: error });
        return { error, status: response.status || 0, data: undefined };
      } else {
        logger.info('[DialecticStore] Successfully updated session models:', { sessionId: payload.sessionId, updatedSession: response.data });
        const updatedSessionFromApi = response.data;
        set(state => {
          let newCurrentProjectDetail = state.currentProjectDetail;
          if (state.currentProjectDetail && state.currentProjectDetail.dialectic_sessions) {
            const sessionIndex = state.currentProjectDetail.dialectic_sessions.findIndex(
              s => s.id === updatedSessionFromApi.id
            );
            if (sessionIndex !== -1) {
              const newSessions = [...state.currentProjectDetail.dialectic_sessions];
              // Merge: keep existing fields, overwrite with new ones from updatedSessionFromApi
              newSessions[sessionIndex] = {
                ...newSessions[sessionIndex],
                ...updatedSessionFromApi,
              };
              newCurrentProjectDetail = {
                ...state.currentProjectDetail,
                dialectic_sessions: newSessions,
              };
            }
          }
          return {
            currentProjectDetail: newCurrentProjectDetail,
            isUpdatingSessionModels: false,
            updateSessionModelsError: null,
          };
        });
        return { data: updatedSessionFromApi, status: response.status || 200 };
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while updating session models',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error updating session models:', { errorDetails: networkError, sessionId: payload.sessionId });
      set({ isUpdatingSessionModels: false, updateSessionModelsError: networkError });
      return { error: networkError, status: 0, data: undefined };
    }
  },

  setSelectedModelIds: (modelIds: string[]) => {
    logger.info('[DialecticStore] Setting selected model IDs.', { modelIds });
    set({ selectedModelIds: modelIds });
    const activeSessionId = get().activeContextSessionId;
    if (activeSessionId) {
      get().updateSessionModels({ sessionId: activeSessionId, selectedModelCatalogIds: modelIds })
        .then(response => {
          if (response.error) {
            logger.error('[DialecticStore] Post-setSelectedModelIds: Failed to update session models on backend', { sessionId: activeSessionId, error: response.error});
            // Optionally set a specific error for this background update failure if UI needs to react
          }
        })
        .catch(err => {
          logger.error('[DialecticStore] Post-setSelectedModelIds: Network error during background session model update', { sessionId: activeSessionId, error: err});
        });
    }
  },

  setModelMultiplicity: (modelId: string, count: number) => {
    let newSelectedIds: string[] = [];
    set((state) => {
      const currentSelectedIds = state.selectedModelIds || [];
      const filteredIds = currentSelectedIds.filter((id) => id !== modelId);
      newSelectedIds = [...filteredIds];
      for (let i = 0; i < count; i++) {
        newSelectedIds.push(modelId);
      }
      logger.info(`[DialecticStore] Setting multiplicity for model ${modelId} to ${count}.`, { newSelectedIds });
      return { selectedModelIds: newSelectedIds };
    });
    const activeSessionId = get().activeContextSessionId;
    if (activeSessionId) {
      get().updateSessionModels({ sessionId: activeSessionId, selectedModelCatalogIds: newSelectedIds })
        .then(response => {
          if (response.error) {
            logger.error('[DialecticStore] Post-setModelMultiplicity: Failed to update session models on backend', { sessionId: activeSessionId, modelId, count, error: response.error});
          }
        })
        .catch(err => {
          logger.error('[DialecticStore] Post-setModelMultiplicity: Network error during background session model update', { sessionId: activeSessionId, modelId, count, error: err});
        });
    }
  },

  resetSelectedModelId: () => {
    logger.info(`[DialecticStore] Resetting selectedModelIds.`);
    set({ selectedModelIds: [] });
  },

  fetchInitialPromptContent: async (resourceId: string) => {
    const cacheEntry = get().initialPromptContentCache[resourceId];

    // Do not fetch if content is already loaded or is currently loading
    if (cacheEntry?.content || cacheEntry?.isLoading) {
      return;
    }

    // Set loading state for this specific resourceId
    set(state => ({
      initialPromptContentCache: {
        ...state.initialPromptContentCache,
        [resourceId]: { ...cacheEntry, isLoading: true, error: null },
      }
    }));

    logger.info(`[DialecticStore] Fetching initial prompt content for resource ID: ${resourceId}`);
    try {
      const response = await api.dialectic().getProjectResourceContent({ resourceId });
      
      if (response.error || !response.data) {
        const error = response.error || { message: 'No data returned while fetching prompt content', code: 'NO_DATA' } as ApiError;
        logger.error('[DialecticStore] Error fetching initial prompt content:', { resourceId, errorDetails: error });
        set(state => ({
          initialPromptContentCache: {
            ...state.initialPromptContentCache,
            [resourceId]: { ...state.initialPromptContentCache[resourceId], isLoading: false, error },
          }
        }));
      } else {
        logger.info('[DialecticStore] Successfully fetched initial prompt content:', { 
          resourceId, 
          fileName: response.data.fileName,
          contentLength: response.data.content?.length 
        });
        set(state => ({
          initialPromptContentCache: {
            ...state.initialPromptContentCache,
            [resourceId]: {
              isLoading: false,
              error: null,
              content: response.data?.content || '',
              fileName: response.data?.fileName || '',
            },
          }
        }));
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching initial prompt content',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching initial prompt content:', { resourceId, errorDetails: networkError });
      set(state => ({
        initialPromptContentCache: {
          ...state.initialPromptContentCache,
          [resourceId]: { isLoading: false, error: networkError, content: '' },
        }
      }));
    }
  },

  reset: () => {
    logger.info(
      '[DialecticStore] Resetting store to initial state', 
      { storeKeys: Object.keys(initialDialecticStateValues) }
    );
    set(initialDialecticStateValues);
  },

  generateContributions: async (payload: GenerateContributionsPayload): Promise<ApiResponse<GenerateContributionsResponse>> => {
    set({ 
      contributionGenerationStatus: 'initiating',
      generateContributionsError: null 
    });
    logger.info('[DialecticStore] Generating contributions...', { payload });
    try {
      set({ contributionGenerationStatus: 'generating' });
      const response = await api.dialectic().generateContributions(payload);
      if (response.error) {
        logger.error('[DialecticStore] Error generating contributions:', { errorDetails: response.error });
        set({
          contributionGenerationStatus: 'failed',
          generateContributionsError: response.error,
        });
        return { error: response.error } as ApiResponse<never>;
      } else {
        logger.info('[DialecticStore] Successfully initiated contribution generation:', { responseData: response.data });
        set({
          contributionGenerationStatus: 'idle',
          generateContributionsError: null,
        });

        await get().fetchDialecticProjectDetails(payload.projectId);
        return { data: response.data } as ApiResponse<GenerateContributionsResponse>;
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while generating contributions',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error generating contributions:', { errorDetails: networkError });
      set({
        contributionGenerationStatus: 'failed',
        generateContributionsError: networkError,
      });
      return { error: networkError } as ApiResponse<never>;
    }
  },

  setSubmittingStageResponses: (isSubmitting: boolean) => set({ isSubmittingStageResponses: isSubmitting }),
  setSubmitStageResponsesError: (error: ApiError | null) => set({ submitStageResponsesError: error }),

  setSavingContributionEdit: (isSaving: boolean) => set({ isSavingContributionEdit: isSaving }),
  setSaveContributionEditError: (error: ApiError | null) => set({ saveContributionEditError: error }),

  setActiveContextProjectId: (id: string | null) => set({ activeContextProjectId: id }),
  setActiveContextSessionId: (id: string | null) => set({ activeContextSessionId: id }),
  setActiveContextStage: (stage: DialecticStage | null) => set({ activeContextStage: stage }),

  setActiveDialecticContext: (context: { projectId: string | null; sessionId: string | null; stage: DialecticStage | null }) => {
    logger.info('[DialecticStore] Setting active dialectic context', { context });
    set({
      activeContextProjectId: context.projectId,
      activeContextSessionId: context.sessionId,
      activeContextStage: context.stage,
    });
  },

  // Add reset actions for submitStageResponsesError and saveContributionEditError
  resetSubmitStageResponsesError: () => set({ submitStageResponsesError: null }),
  resetSaveContributionEditError: () => set({ saveContributionEditError: null }),

  submitStageResponses: async (payload: SubmitStageResponsesPayload): Promise<ApiResponse<SubmitStageResponsesResponse>> => {
    set({ isSubmittingStageResponses: true, submitStageResponsesError: null });
    logger.info('[DialecticStore] Submitting stage responses...', { payload });

    try {
      const response = await api.dialectic().submitStageResponses(payload);

      if (response.error) {
        logger.error('[DialecticStore] Error submitting stage responses:', { error: response.error });
        set({ isSubmittingStageResponses: false, submitStageResponsesError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully submitted stage responses.', { response: response.data });
        set({ isSubmittingStageResponses: false, submitStageResponsesError: null });
        
        logger.info(`[DialecticStore] Stage responses submitted for project ${payload.projectId}. Refetching project details.`);
        await get().fetchDialecticProjectDetails(payload.projectId);
      }
      return response;
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'A network error occurred while submitting responses',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error submitting responses:', { error: networkError });
      set({ isSubmittingStageResponses: false, submitStageResponsesError: networkError });
      return { data: undefined, error: networkError, status: 0 };
    }
  },

  saveContributionEdit: async (payload: SaveContributionEditPayload): Promise<ApiResponse<DialecticContribution>> => {
    set({ isSavingContributionEdit: true, saveContributionEditError: null });
    logger.info('[DialecticStore] Saving contribution edit...', { payload });

    try {
      const response = await api.dialectic().saveContributionEdit(payload);

      if (response.error) {
        logger.error('[DialecticStore] Error saving contribution edit:', { error: response.error });
        set({ isSavingContributionEdit: false, saveContributionEditError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully saved contribution edit.', { newContribution: response.data });
        set({ isSavingContributionEdit: false, saveContributionEditError: null });

        const newContribution = response.data;
        if (newContribution) {
          logger.info(`[DialecticStore] Updating content cache for new contribution version ${newContribution.id}.`);
          set(state => ({
            contributionContentCache: {
              ...state.contributionContentCache,
              [newContribution.id]: {
                content: payload.editedContentText,
                isLoading: false,
                error: undefined,
              }
            }
          }));
        }
        
        logger.info(`[DialecticStore] Contribution edit saved for project ${payload.projectId}. Refetching project details.`);
        await get().fetchDialecticProjectDetails(payload.projectId);
      }
      return response;
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'A network error occurred while saving edit',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error saving edit:', { error: networkError });
      set({ isSavingContributionEdit: false, saveContributionEditError: networkError });
      return { data: undefined, error: networkError, status: 0 };
    }
  },

  fetchAndSetCurrentSessionDetails: async (sessionId: string) => {
    logger.info(`[DialecticStore] Fetching and setting current session details for session ID: ${sessionId}`);
    set({ isLoadingActiveSessionDetail: true, activeSessionDetailError: null });

    try {
      const response = await api.dialectic().getSessionDetails(sessionId); // Expects ApiResponse<GetSessionDetailsResponse>

      if (response.error || !response.data) {
        logger.error('[DialecticStore] Error fetching session details:', { sessionId, errorDetails: response.error });
        set({ 
          activeSessionDetail: null, 
          isLoadingActiveSessionDetail: false, 
          activeSessionDetailError: response.error || { code: 'FETCH_ERROR', message: 'No data returned for session' } 
        });
        return;
      }

      const { session: fetchedSession, currentStageDetails: fetchedStageDetails } = response.data;
      
      logger.info(`[DialecticStore] Successfully fetched session details and stage:`, { sessionId: fetchedSession.id, stage: fetchedStageDetails?.slug, sessionData: fetchedSession });

      set((state) => {
        const updatedProjectDetail = state.currentProjectDetail;
        let sessionWithContributions = fetchedSession; // Default to fetchedSession

        if (updatedProjectDetail && updatedProjectDetail.dialectic_sessions) {
          const sessionIndex = updatedProjectDetail.dialectic_sessions.findIndex(s => s.id === fetchedSession.id);
          if (sessionIndex !== -1) {
            const existingSessionData = updatedProjectDetail.dialectic_sessions[sessionIndex];
            updatedProjectDetail.dialectic_sessions[sessionIndex] = {
              ...fetchedSession,
              dialectic_contributions: fetchedSession.dialectic_contributions || existingSessionData.dialectic_contributions || [],
              feedback: fetchedSession.feedback || existingSessionData.feedback || [],
              dialectic_session_models: fetchedSession.dialectic_session_models || existingSessionData.dialectic_session_models || [],
            };
            // After merging, this is the session we want for activeSessionDetail
            sessionWithContributions = updatedProjectDetail.dialectic_sessions[sessionIndex]; 
          } else {
            // Session not found in current project, add it. 
            // Ensure the pushed session has at least an empty contributions array if not present.
            const sessionToAdd = {
                ...fetchedSession,
                dialectic_contributions: fetchedSession.dialectic_contributions || [],
                feedback: fetchedSession.feedback || [],
                dialectic_session_models: fetchedSession.dialectic_session_models || [],
            };
            updatedProjectDetail.dialectic_sessions.push(sessionToAdd);
            sessionWithContributions = sessionToAdd;
          }
        }

        return {
          isLoadingActiveSessionDetail: false,
          activeSessionDetailError: null,
          activeSessionDetail: sessionWithContributions, // Use the potentially enriched session
          currentProjectDetail: updatedProjectDetail ? { ...updatedProjectDetail } : null,
        };
      });
      
      // Set the active context including the stage
      get().setActiveDialecticContext({
        projectId: fetchedSession.project_id,
        sessionId: fetchedSession.id,
        stage: fetchedStageDetails, // This can be null, setActiveDialecticContext should handle it
      });

      // Set selected models based on the session
      if (fetchedSession.selected_model_catalog_ids) {
        get().setSelectedModelIds(fetchedSession.selected_model_catalog_ids);
      } else {
        get().setSelectedModelIds([]); // Clear if no models are selected for the session
      }

    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching session details',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching session details:', { sessionId, errorDetails: networkError });
      set({ 
        activeSessionDetail: null, 
        isLoadingActiveSessionDetail: false, 
        activeSessionDetailError: networkError 
      });
    }
  },

  activateProjectAndSessionContextForDeepLink: async (projectId: string, sessionId: string) => {
    logger.info(`[DialecticStore] Activating project and session context for deep link. ProjectID: ${projectId}, SessionID: ${sessionId}`);
    const state = get();

    // Condition to fetch project details: 
    // 1. If activeContextProjectId is different from the target projectId.
    // 2. If currentProjectDetail is null (meaning no project is loaded).
    // 3. If currentProjectDetail is loaded but its ID doesn't match the target projectId (consistency check).
    const needsProjectFetch = 
      state.activeContextProjectId !== projectId || 
      !state.currentProjectDetail || 
      state.currentProjectDetail.id !== projectId;

    if (needsProjectFetch) {
      logger.info(`[DialecticStore] Project context differs or not set. Fetching project details for ${projectId} before session.`);
      await state.fetchDialecticProjectDetails(projectId);
      // After project details are fetched, the new state will be available for fetchAndSetCurrentSessionDetails
      // No need to await a second get() here, as fetchDialecticProjectDetails updates the store internally.
    }

    logger.info(`[DialecticStore] Proceeding to fetch session details for ${sessionId}.`);
    await get().fetchAndSetCurrentSessionDetails(sessionId); // Use get() to ensure the latest state if fetchDialecticProjectDetails was called
  },

  // ADDED: Actions for fetching feedback file content
  fetchFeedbackFileContent: async (payload: { projectId: string; storagePath: string }) => {
    set({
      isFetchingFeedbackFileContent: true,
      fetchFeedbackFileContentError: null,
      currentFeedbackFileContent: null, // Clear previous content
    });
    logger.info('[DialecticStore] Fetching feedback file content', payload);
    try {
      const response = await api.dialectic().getProjectResourceContent(payload);
      if (response.error) {
        logger.error('[DialecticStore] Error fetching feedback file content:', { payload, errorDetails: response.error });
        set({ 
          isFetchingFeedbackFileContent: false, 
          fetchFeedbackFileContentError: response.error,
          currentFeedbackFileContent: null,
        });
      } else {
        logger.info('[DialecticStore] Successfully fetched feedback file content:', { payload, data: response.data });
        set({
          currentFeedbackFileContent: response.data || null,
          isFetchingFeedbackFileContent: false,
          fetchFeedbackFileContentError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching feedback file content',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching feedback file content:', { payload, errorDetails: networkError });
      set({ 
        isFetchingFeedbackFileContent: false, 
        fetchFeedbackFileContentError: networkError,
        currentFeedbackFileContent: null,
      });
    }
  },

  resetFetchFeedbackFileContentError: () => {
    logger.info('[DialecticStore] Resetting fetchFeedbackFileContentError');
    set({ fetchFeedbackFileContentError: null });
  },

  clearCurrentFeedbackFileContent: () => {
    logger.info('[DialecticStore] Clearing currentFeedbackFileContent');
    set({ currentFeedbackFileContent: null, isFetchingFeedbackFileContent: false, fetchFeedbackFileContentError: null }); // Also reset loading/error states
  },

  // Add the implementation for setActiveDialecticWalletId
  setActiveDialecticWalletId: (walletId: string | null) => {
    logger.info(`[DialecticStore] Setting active dialectic wallet ID to: ${walletId}`);
    set({ activeDialecticWalletId: walletId });
  },
}));