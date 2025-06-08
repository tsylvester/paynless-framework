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
} from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';


export const initialDialecticStateValues: DialecticStateValues = {
  availableDomainTags: [],
  isLoadingDomainTags: false,
  domainTagsError: null,
  selectedDomainTag: null,

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
        const descriptors = response.data || [];
        logger.info('[DialecticStore] Successfully fetched domain tags:', { descriptors });
        set({
          availableDomainTags: descriptors,
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

  setSelectedDomainOverlayId: (id: string | null) => {
    logger.info(`[DialecticStore] Setting selected domain overlay ID to: ${id}`);
    set({ selectedDomainOverlayId: id });
  },

  setSelectedStageAssociation: (stage: DialecticStage | null) => {
    logger.info(`[DialecticStore] Setting selected stage association to: ${stage}`);
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
      selectedStageAssociation: stageAssociation, 
    });
    logger.info(`[DialecticStore] Fetching available domain overlays for stage: ${stageAssociation}`);
    try {
      const response = await api.dialectic().listAvailableDomainOverlays({ stageAssociation: stageAssociation as string });

      if (response.error) {
        logger.error('[DialecticStore] Error fetching domain overlays:', { stageAssociation, errorDetails: response.error });
        set({
          availableDomainOverlays: [],
          isLoadingDomainOverlays: false,
          domainOverlaysError: response.error,
        });
      } else {
        const descriptors = response.data || []; 
        logger.info('[DialecticStore] Raw descriptors received from API:', { descriptors }); 
        logger.info('[DialecticStore] Successfully fetched domain overlays:', { stageAssociation, count: descriptors.length });
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
      logger.error('[DialecticStore] Network error fetching domain overlays:', { stageAssociation, errorDetails: networkError });
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
        set({
          currentProjectDetail: response.data || null,
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

  createDialecticProject: async (payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>> => {
    set({ isCreatingProject: true, createProjectError: null });
    const { selectedDomainOverlayId } = get(); // Get values from store state

    // Construct the final payload for the API call,
    // ensuring projectName and initialUserPrompt are from the input payload,
    // and selectedDomainTag and selected_domain_overlay_id are from the store's state.
    const payloadForApi: CreateProjectPayload = {
      ...payload, // Spreads projectName, initialUserPrompt, and any other fields from incoming payload
      selected_domain_overlay_id: selectedDomainOverlayId, // Correctly uses store's selectedDomainOverlayId
      selectedDomainTag: get().selectedDomainTag, // Add selectedDomainTag from the store
    };

    logger.info('[DialecticStore] Creating dialectic project...', { projectPayload: payloadForApi });
    try {
      const response = await api.dialectic().createProject(payloadForApi);
      
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

  startDialecticSession: async (payload: StartSessionPayload): Promise<ApiResponse<DialecticSession>> => {
    set({ isStartingSession: true, startSessionError: null });
    logger.info('[DialecticStore] Starting dialectic session...', { sessionPayload: payload });
    try {
      const response = await api.dialectic().startSession(payload);
      if (response.error) {
        logger.error('[DialecticStore] Error starting session:', { errorDetails: response.error });
        set({ isStartingSession: false, startSessionError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully started session:', { sessionDetails: response.data });
        set({ isStartingSession: false, startSessionError: null });
        // After starting a session, we might want to refetch the specific project details
        // or the list of projects if the session creation affects their status or adds a session entry.
        if (response.data?.project_id) {
          await get().fetchDialecticProjectDetails(response.data.project_id);
        } else {
          await get().fetchDialecticProjects(); // Fallback to refreshing all projects
        }
      }
      return response;
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

  exportDialecticProject: async (projectId: string, projectName = 'project_export'): Promise<ApiResponse<{ export_url: string }>> => {
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
        
        if (response.data?.export_url) {
          const exportUrl = response.data.export_url;
          try {
            const url = new URL(exportUrl);
            const pathSegments = url.pathname.split('/');
            // Use the actual filename from the URL if available, otherwise use the provided projectName or default
            const suggestedFilename = pathSegments.pop() || `${projectName.replace(/\s+/g, '_')}.zip`;

            const link = document.createElement('a');
            link.href = exportUrl;
            link.setAttribute('download', suggestedFilename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            logger.info(`[DialecticStore] Download initiated for project ${projectId} as ${suggestedFilename}`);
          } catch (downloadError) {
            logger.error('[DialecticStore] Failed to initiate download from export URL:', { projectId, exportUrl, downloadError });
            // Optionally set an error state specific to the download initiation failing
            // For example: set({ exportProjectError: { message: 'Failed to start download.', code: 'DOWNLOAD_INITIATION_FAILED'} });
          }
        } else {
          logger.warn('[DialecticStore] Export successful but no export_url received in response data.');
          // set({ exportProjectError: { message: 'Export completed, but no download link was provided.', code: 'MISSING_EXPORT_URL'} });
        }
      }
      return response;
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while exporting project',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error exporting project:', { projectId, errorDetails: networkError });
      set({ isExportingProject: false, exportProjectError: networkError });
      return { error: networkError, status: 0 };
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
      logger.info(`[DialecticStore] Setting multiplicity for model ${modelId} to ${count}. New selectedModelIds:`, newSelectedIds);
      return { selectedModelIds: newSelectedIds };
    });
  },

  resetSelectedModelId: () => {
    logger.info(`[DialecticStore] Resetting selectedModelIds.`);
    set({ selectedModelIds: [] });
  },
}));

export const getDialecticStoreInitialState = (): DialecticStateValues => ({ ...initialDialecticStateValues }); 