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
  UploadProjectResourceFilePayload,
  DialecticProjectResource,
  UpdateProjectInitialPromptPayload,
  DialecticStage,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SaveContributionEditPayload,
  DialecticContribution,
  DialecticDomain,
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
  isStartNewSessionModalOpen: false,
  selectedModelIds: [],

  // Cache for initial prompt file content, mapping resourceId to its state
  initialPromptContentCache: {},

  // New state for process templates
  currentProcessTemplate: null,
  isLoadingProcessTemplate: false,
  processTemplateError: null,

  // States for generating contributions
  isGeneratingContributions: false,
  generateContributionsError: null,

  isSubmittingStageResponses: false,
  submitStageResponsesError: null,

  isSavingContributionEdit: false,
  saveContributionEditError: null,

  activeContextProjectId: null,
  activeContextSessionId: null,
  activeContextStageSlug: null,
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
    logger.info(`[DialecticStore] Setting selected domain to: ${domain}`);
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
          }));
        }
        
        set({
          currentProjectDetail: projectData || null,
          isLoadingProjectDetail: false,
          projectDetailError: null,
        });
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
    logger.info(`[DialecticStore] Fetching process template with ID: ${templateId}`);
    try {
      const response = await api.dialectic().fetchProcessTemplate({ templateId });
      if (response.error) {
        logger.error('[DialecticStore] Error fetching process template:', { templateId, errorDetails: response.error });
        set({ currentProcessTemplate: null, isLoadingProcessTemplate: false, processTemplateError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully fetched process template:', { templateId, template: response.data });
        set({
          currentProcessTemplate: response.data || null,
          isLoadingProcessTemplate: false,
          processTemplateError: null,
        });
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

    const now = Date.now();

    // 1. Check cache for valid, non-expired content
    if (entry && entry.content && entry.expiry && entry.expiry > now) {
      logger.info(`[DialecticStore] Content for ${contributionId} found in cache and is valid.`);
      // Optionally update isLoading to false if it was stuck on true from a previous failed attempt
      if (entry.isLoading) {
        set(state => ({
          contributionContentCache: {
            ...state.contributionContentCache,
            [contributionId]: { ...entry, isLoading: false }
          }
        }));
      }
      return; // Content already available and fresh
    }

    // 2. Update cache to isLoading: true, clear previous error for this specific entry
    set(state => ({
      contributionContentCache: {
        ...state.contributionContentCache,
        [contributionId]: { 
          ...(entry || {}), // Spread existing entry or empty object
          isLoading: true, 
          error: undefined, // Clear previous error on new attempt
        }
      }
    }));

    let signedUrlToUse: string | undefined = undefined;
    let mimeTypeToUse: string | undefined = undefined;
    let sizeBytesToUse: number | null | undefined = undefined;
    let expiryToUse: number | undefined = undefined;

    // 3. Fetch Signed URL if not in cache or expired
    if (entry && entry.signedUrl && entry.expiry && entry.expiry > now) {
      logger.info(`[DialecticStore] Using cached signed URL for ${contributionId}.`);
      signedUrlToUse = entry.signedUrl;
      mimeTypeToUse = entry.mimeType;
      sizeBytesToUse = entry.sizeBytes;
      expiryToUse = entry.expiry;
    } else {
      logger.info(`[DialecticStore] Fetching new signed URL for ${contributionId}.`);
      try {
        const response = await api.dialectic().getContributionContentSignedUrl(contributionId);
        if (response.error || !response.data) {
          const errMsg = response.error?.message || 'Failed to get signed URL, no data returned.';
          logger.error('[DialecticStore] Error fetching signed URL:', { contributionId, error: errMsg });
          set(state => ({
            contributionContentCache: {
              ...state.contributionContentCache,
              [contributionId]: { ...state.contributionContentCache[contributionId], isLoading: false, error: errMsg }
            }
          }));
          return;
        }

        signedUrlToUse = response.data.signedUrl;
        mimeTypeToUse = response.data.mimeType;
        sizeBytesToUse = response.data.sizeBytes;
        // Expires in 15 mins from generation, set our cache for 14 mins for safety
        const expiresInMilliseconds = 14 * 60 * 1000; 
        expiryToUse = Date.now() + expiresInMilliseconds;

        set(state => ({
          contributionContentCache: {
            ...state.contributionContentCache,
            [contributionId]: {
              ...state.contributionContentCache[contributionId],
              signedUrl: signedUrlToUse,
              mimeType: mimeTypeToUse,
              sizeBytes: sizeBytesToUse,
              expiry: expiryToUse,
              // isLoading remains true, error cleared by initial set above
            }
          }
        }));
      } catch (e: unknown) {
        const networkErrorMsg = e instanceof Error ? e.message : 'Network error fetching signed URL';
        logger.error('[DialecticStore] Network error fetching signed URL:', { contributionId, error: networkErrorMsg });
        set(state => ({
          contributionContentCache: {
            ...state.contributionContentCache,
            [contributionId]: { ...state.contributionContentCache[contributionId], isLoading: false, error: networkErrorMsg }
          }
        }));
        return;
      }
    }

    // 4. Fetch Actual Content if we have a valid signed URL
    if (!signedUrlToUse) {
      // This case should ideally be caught by earlier error handling when fetching URL
      logger.error(`[DialecticStore] No signed URL available for ${contributionId} after attempting fetch. Should not happen.`);
      if (!get().contributionContentCache[contributionId]?.error) { // Avoid overwriting specific error from URL fetch
         set(state => ({
            contributionContentCache: {
              ...state.contributionContentCache,
              [contributionId]: { ...state.contributionContentCache[contributionId], isLoading: false, error: 'Internal error: Signed URL was not obtained.' }
            }
          }));
      }
      return;
    }

    logger.info(`[DialecticStore] Fetching content from signed URL for ${contributionId}`);
    try {
      const contentResponse = await fetch(signedUrlToUse);
      if (!contentResponse.ok) {
        const fetchErrorMsg = `Failed to fetch content: ${contentResponse.status} ${contentResponse.statusText}`;
        logger.error('[DialecticStore] Error fetching content from signed URL:', { contributionId, status: contentResponse.status, statusText: contentResponse.statusText });
        set(state => ({
          contributionContentCache: {
            ...state.contributionContentCache,
            [contributionId]: { ...state.contributionContentCache[contributionId], isLoading: false, error: fetchErrorMsg }
          }
        }));
        return;
      }

      // Assuming text content for now. Could check mimeTypeToUse for other types later.
      const content = await contentResponse.text();
      logger.info(`[DialecticStore] Successfully fetched content for ${contributionId}`);
      set(state => ({
        contributionContentCache: {
          ...state.contributionContentCache,
          [contributionId]: {
            ...state.contributionContentCache[contributionId],
            content: content,
            isLoading: false,
            error: undefined, // Clear error on success
          }
        }
      }));

    } catch (e: unknown) {
      const contentFetchErrorMsg = e instanceof Error ? e.message : 'Network error fetching content from signed URL';
      logger.error('[DialecticStore] Network error fetching content:', { contributionId, error: contentFetchErrorMsg });
      set(state => ({
        contributionContentCache: {
          ...state.contributionContentCache,
          [contributionId]: { ...state.contributionContentCache[contributionId], isLoading: false, error: contentFetchErrorMsg }
        }
      }));
    }
  },

  uploadProjectResourceFile: async (payload: UploadProjectResourceFilePayload): Promise<ApiResponse<DialecticProjectResource>> => {
    set({ isUploadingProjectResource: true, uploadProjectResourceError: null });
    logger.info('[DialecticStore] Uploading project resource file...', { projectId: payload.projectId, fileName: payload.fileName });
    try {
      // Pass the payload object directly, ensuring all its properties (like file, fileName, fileSizeBytes, fileType)
      // are correctly received by the API client method, which now expects a single object.
      const response = await api.dialectic().uploadProjectResourceFile(payload);

      if (response.error) {
        logger.error('[DialecticStore] Error uploading project resource file:', { errorDetails: response.error });
        set({ isUploadingProjectResource: false, uploadProjectResourceError: response.error });
        return { data: undefined, error: response.error, status: response.status || 0 };
      }
      logger.info('[DialecticStore] Successfully uploaded project resource file', { resource: response.data });
      // Optionally update project details if the resource is linked there
      set(state => ({
        isUploadingProjectResource: false,
        currentProjectDetail: state.currentProjectDetail && state.currentProjectDetail.id === response.data?.project_id
          ? { 
              ...state.currentProjectDetail,
              resources: [...(state.currentProjectDetail.resources || []), response.data!]
            }
          : state.currentProjectDetail,
      }));
      return response;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const networkError: ApiError = { message: errMsg, code: 'NETWORK_ERROR' };
      logger.error('[DialecticStore] Network error uploading project resource file:', { errorDetails: networkError });
      set({ isUploadingProjectResource: false, uploadProjectResourceError: networkError });
      return { data: undefined, error: networkError, status: 0 };
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

  setStartNewSessionModalOpen: (isOpen: boolean) => {
    logger.info(`[DialecticStore] Setting StartNewSessionModal open state to: ${isOpen}`);
    set({ isStartNewSessionModalOpen: isOpen });
  },

  setModelMultiplicity: (modelId: string, count: number) => {
    set((state) => {
      const currentSelectedIds = state.selectedModelIds || [];
      // Filter out all occurrences of the current modelId
      const filteredIds = currentSelectedIds.filter((id) => id !== modelId);
      // Add the modelId 'count' times
      const newSelectedIds = [...filteredIds];
      for (let i = 0; i < count; i++) {
        newSelectedIds.push(modelId);
      }
      logger.info(`[DialecticStore] Setting multiplicity for model ${modelId} to ${count}.`, { newSelectedModelIds: newSelectedIds });
      return { selectedModelIds: newSelectedIds };
    });
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
          [resourceId]: { isLoading: false, error: networkError },
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

  generateContributions: async (payload: { sessionId: string; projectId: string; stageSlug: DialecticStage['slug']; iterationNumber: number; }) => {
    set({ isGeneratingContributions: true, generateContributionsError: null });
    logger.info('[DialecticStore] Generating contributions...', { sessionId: payload.sessionId, stageSlug: payload.stageSlug, iteration: payload.iterationNumber });
    try {
      // Ensure the API client method api.dialectic().generateContributions also expects this full payload.
      // If not, the API client layer might need adjustment, or we adapt the payload here.
      // Assuming the API client is updated or can handle this payload structure.
      const response = await api.dialectic().generateContributions(payload);
      if (response.error) {
        logger.error('[DialecticStore] Error generating contributions:', { errorDetails: response.error, sessionId: payload.sessionId });
        set({ isGeneratingContributions: false, generateContributionsError: response.error });
        return { error: response.error, status: response.status, data: undefined };
      } else {
        logger.info('[DialecticStore] Successfully generated contributions:', { responseData: response.data, sessionId: payload.sessionId });
        set({ isGeneratingContributions: false, generateContributionsError: null });
        
        // Refetch project details to update UI with new contributions and session status
        logger.info(`[DialecticStore] Contributions generated for session ${payload.sessionId}. Refetching project details for project ${payload.projectId}.`);
        await get().fetchDialecticProjectDetails(payload.projectId);
        
        return { data: response.data, status: response.status };
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while generating contributions',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error generating contributions:', { errorDetails: networkError, sessionId: payload.sessionId });
      set({ isGeneratingContributions: false, generateContributionsError: networkError });
      return { error: networkError, status: 0, data: undefined };
    }
  },

  setSubmittingStageResponses: (isSubmitting: boolean) => set({ isSubmittingStageResponses: isSubmitting }),
  setSubmitStageResponsesError: (error: ApiError | null) => set({ submitStageResponsesError: error }),

  setSavingContributionEdit: (isSaving: boolean) => set({ isSavingContributionEdit: isSaving }),
  setSaveContributionEditError: (error: ApiError | null) => set({ saveContributionEditError: error }),

  setActiveContextProjectId: (id) => set({ activeContextProjectId: id }),
  setActiveContextSessionId: (id) => set({ activeContextSessionId: id }),
  setActiveContextStageSlug: (slug) => set({ activeContextStageSlug: slug }),
  setActiveDialecticContext: (context) => set({
    activeContextProjectId: context.projectId,
    activeContextSessionId: context.sessionId,
    activeContextStageSlug: context.stageSlug,
  }),

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
        
        // On success, refetch project details to get the most up-to-date state including the new session status and any new artifacts.
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

        // Also update the content cache with the edited content immediately
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
                // Other fields like signedUrl will be populated on next fetchContributionContent if needed
              }
            }
          }));
        }
        
        // Refetch project details to get the most up-to-date contribution list
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
}));

export const getDialecticStoreInitialState = (): DialecticStateValues => ({ ...initialDialecticStateValues }); 