import { vi } from 'vitest';
import type {
  DialecticStateValues,
  DialecticStore,
  DialecticProject,
  ApiResponse,
  DialecticSession,
  DialecticStage,
  DialecticDomain,
  DialecticContribution,
  DialecticActions,
  GenerateContributionsResponse,
  SubmitStageResponsesResponse,
  ApiError
} from '@paynless/types';

const mockSession: DialecticSession = {
  id: 'ses-1',
  project_id: 'proj-1',
  session_description: 'Mock Session',
  user_input_reference_url: null,
  iteration_count: 1,
  selected_model_catalog_ids: [],
  status: 'active',
  associated_chat_id: null,
  current_stage_id: 'stage-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_contributions: [],
  dialectic_session_models: [],
};

// 1. Define initial state values locally
const initialDialecticStateValues: DialecticStateValues = {
  domains: [],
  isLoadingDomains: false,
  domainsError: null,
  selectedDomain: null,
  selectedStageAssociation: null,
  availableDomainOverlays: [],
  isLoadingDomainOverlays: false,
  domainOverlaysError: null,
  selectedDomainOverlayId: null,
  projects: [],
  isLoadingProjects: false,
  projectsError: null,
  currentProjectDetail: null,
  isLoadingProjectDetail: false,
  projectDetailError: null,
  currentProcessTemplate: null,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  modelCatalog: [],
  isLoadingModelCatalog: false,
  modelCatalogError: null,
  isCreatingProject: false,
  createProjectError: null,
  isStartingSession: false,
  startSessionError: null,
  contributionContentCache: {},
  allSystemPrompts: [],
  isCloningProject: false,
  cloneProjectError: null,
  isExportingProject: false,
  exportProjectError: null,
  isUpdatingProjectPrompt: false,
  isUploadingProjectResource: false,
  uploadProjectResourceError: null,
  selectedModelIds: [],
  initialPromptContentCache: {},
  activeContextProjectId: null,
  activeContextSessionId: null,
  activeContextStage: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
  isUpdatingSessionModels: false,
  updateSessionModelsError: null,
  currentFeedbackFileContent: null,
  isFetchingFeedbackFileContent: false,
  fetchFeedbackFileContentError: null,
};

// 2. Define the internal state variable
let internalMockDialecticStoreState: DialecticStore;

// 3. Create the initialization function
const initializeInternalDialecticStoreState = (): DialecticStore => {
  const newState: DialecticStore = {
    ...initialDialecticStateValues,

    // Actions
    fetchDomains: vi.fn().mockResolvedValue(undefined as void),
    setSelectedDomain: vi.fn((domain: DialecticDomain | null) => { (newState as DialecticStateValues).selectedDomain = domain; }),
    fetchAvailableDomainOverlays: vi.fn().mockResolvedValue(undefined as void),
    setSelectedStageAssociation: vi.fn((stage: DialecticStage | null) => { (newState as DialecticStateValues).selectedStageAssociation = stage; }),
    setSelectedDomainOverlayId: vi.fn((id: string | null) => { (newState as DialecticStateValues).selectedDomainOverlayId = id; }),
    fetchDialecticProjects: vi.fn().mockResolvedValue(undefined as void),
    fetchDialecticProjectDetails: vi.fn().mockResolvedValue(undefined as void),
    fetchProcessTemplate: vi.fn().mockResolvedValue(undefined as void),
    createDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticProject>),
    startDialecticSession: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticSession>),
    updateSessionModels: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticSession>),
    fetchAIModelCatalog: vi.fn().mockResolvedValue(undefined as void),
    fetchContributionContent: vi.fn().mockResolvedValue(undefined as void),
    resetCreateProjectError: vi.fn(() => { (newState as DialecticStateValues).createProjectError = null; }),
    resetProjectDetailsError: vi.fn(() => { (newState as DialecticStateValues).projectDetailError = null; }),
    deleteDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<void>),
    cloneDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticProject>),
    exportDialecticProject: vi.fn().mockResolvedValue({ data: { export_url: '' }, error: undefined, status: 200 } as ApiResponse<{ export_url: string }>),
    updateDialecticProjectInitialPrompt: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticProject>),
    setSelectedModelIds: vi.fn((ids: string[]) => { (newState as DialecticStateValues).selectedModelIds = ids; }),
    setModelMultiplicity: vi.fn((modelId: string, count: number) => {
      const currentSelectedIds = (newState as DialecticStateValues).selectedModelIds || [];
      const filteredIds = currentSelectedIds.filter((id) => id !== modelId);
      const newSelectedIds = [...filteredIds];
      for (let i = 0; i < count; i++) {
        newSelectedIds.push(modelId);
      }
      (newState as DialecticStateValues).selectedModelIds = newSelectedIds;
    }),
    resetSelectedModelId: vi.fn(() => { (newState as DialecticStateValues).selectedModelIds = []; }),
    fetchInitialPromptContent: vi.fn().mockResolvedValue(undefined as void),
    generateContributions: vi.fn().mockResolvedValue({ data: { message: 'ok', contributions: [] }, error: undefined, status: 200 } as ApiResponse<GenerateContributionsResponse>),
    submitStageResponses: vi.fn().mockResolvedValue({ data: { message: 'ok', userFeedbackStoragePath: '/path', nextStageSeedPromptStoragePath: '/path', updatedSession: mockSession }, error: undefined, status: 200 } as ApiResponse<SubmitStageResponsesResponse>),
    setSubmittingStageResponses: vi.fn((isLoading: boolean) => { (newState as DialecticStateValues).isSubmittingStageResponses = isLoading; }),
    setSubmitStageResponsesError: vi.fn((error: ApiError | null) => { (newState as DialecticStateValues).submitStageResponsesError = error; }),
    resetSubmitStageResponsesError: vi.fn(() => { (newState as DialecticStateValues).submitStageResponsesError = null; }),
    saveContributionEdit: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticContribution>),
    setSavingContributionEdit: vi.fn((isLoading: boolean) => { (newState as DialecticStateValues).isSavingContributionEdit = isLoading; }),
    setSaveContributionEditError: vi.fn((error: ApiError | null) => { (newState as DialecticStateValues).saveContributionEditError = error; }),
    resetSaveContributionEditError: vi.fn(() => { (newState as DialecticStateValues).saveContributionEditError = null; }),
    setActiveContextProjectId: vi.fn((id: string | null) => { (newState as DialecticStateValues).activeContextProjectId = id; }),
    setActiveContextSessionId: vi.fn((id: string | null) => { (newState as DialecticStateValues).activeContextSessionId = id; }),
    setActiveContextStage: vi.fn((stage: DialecticStage | null) => { (newState as DialecticStateValues).activeContextStage = stage; }),
    setActiveDialecticContext: vi.fn((context: { projectId: string | null; sessionId: string | null; stage: DialecticStage | null }) => {
      (newState as DialecticStateValues).activeContextProjectId = context.projectId;
      (newState as DialecticStateValues).activeContextSessionId = context.sessionId;
      (newState as DialecticStateValues).activeContextStage = context.stage;
    }),
    fetchFeedbackFileContent: vi.fn().mockResolvedValue(undefined as void),
    resetFetchFeedbackFileContentError: vi.fn(() => { (newState as DialecticStateValues).fetchFeedbackFileContentError = null; }),
    clearCurrentFeedbackFileContent: vi.fn(),
    reset: vi.fn(() => { 
      Object.assign(internalMockDialecticStoreState, initializeInternalDialecticStoreState());
    }),
    _resetForTesting: vi.fn(() => { internalMockDialecticStoreState = initializeInternalDialecticStoreState(); }),
  };
  return newState;
};

// 4. Initialize the state at module level
internalMockDialecticStoreState = initializeInternalDialecticStoreState();

// 5. Getter for the current state
export const getDialecticStoreState = (): DialecticStore => internalMockDialecticStoreState;

// 6. Mock Hook Logic
export const mockedUseDialecticStoreHookLogic = <TResult,>(
  selector?: (state: DialecticStore) => TResult,
): TResult | DialecticStore => {
  const state = getDialecticStoreState();
  return selector ? selector(state) : state;
};
(mockedUseDialecticStoreHookLogic as unknown as Record<string, unknown>)['getState'] = getDialecticStoreState;
(mockedUseDialecticStoreHookLogic as unknown as Record<string, unknown>)['setState'] = (
    newValues: Partial<DialecticStore> | ((state: DialecticStore) => Partial<DialecticStore>),
    replace = false,
  ) => {
    const state = getDialecticStoreState();
    const resolvedNewValues = typeof newValues === 'function' ? newValues(state) : newValues;
  
    if (replace) {
      // For replacement, we'd need a more complex implementation to reset to initial + apply new values,
      // but for most test cases, merging is sufficient.
      Object.assign(internalMockDialecticStoreState, { ...initialDialecticStateValues, ...resolvedNewValues });
    } else {
      Object.assign(internalMockDialecticStoreState, resolvedNewValues);
    }
};

// 7. Export the mock hook itself and other utilities
export const useDialecticStore = mockedUseDialecticStoreHookLogic;

// 8. State Helper for tests to set values
export const setDialecticStateValues = (newValues: Partial<DialecticStateValues>) => {
  // Directly assign to internalMockDialecticStoreState properties
  // This ensures that the state object identity is maintained if tests hold a reference to it,
  // while still updating its contents.
  Object.assign(internalMockDialecticStoreState, newValues);
};

// Legacy initialize function for tests - now primarily uses setDialecticStateValues
// This will reset the state and apply partial new state if provided.
export const initializeMockDialecticState = (initialStateUpdates?: Partial<DialecticStateValues>) => {
  // 1. Get a fresh, complete initial state structure with all vi.fn() mocks reset
  const freshInitialStateWithMocks = initializeInternalDialecticStoreState();

  // 2. Clear all existing enumerable properties from the current internalMockDialecticStoreState.
  //    This is important to remove any old data while keeping the object reference.
  (Object.keys(internalMockDialecticStoreState) as Array<keyof DialecticStore>).forEach(key => {
    delete internalMockDialecticStoreState[key];
  });

  // 3. Copy all properties (values and mock functions) from the fresh initial state
  //    into the existing internalMockDialecticStoreState object.
  Object.assign(internalMockDialecticStoreState, freshInitialStateWithMocks);

  // 4. Apply any specific updates provided for this particular test initialization
  if (initialStateUpdates) {
    // setDialecticStateValues correctly mutates internalMockDialecticStoreState
    setDialecticStateValues(initialStateUpdates);
  }
};

// Compatibility for tests that used the old setDialecticState
export const setDialecticState = setDialecticStateValues;

// 9. Reset Function for tests
export const resetDialecticStoreMock = () => {
  internalMockDialecticStoreState = initializeInternalDialecticStoreState();
};

// 10. Action Access (for tests that might still use it, now returns the whole state/store object)
export const getDialecticStoreActions = (): DialecticActions => {
  return internalMockDialecticStoreState; // Actions are part of the state object
};

// Selector that needs to be exported for GenerateContributionButton
export const selectSelectedModelIds = (state: DialecticStateValues): string[] => {
  return state.selectedModelIds || [];
};

// Keep selectOverlay mock if it's a standalone mock not part of the store state directly
export const selectOverlay = vi.fn();

// Add the required selector previously missing
export const selectIsStageReadyForSessionIteration = vi.fn<
  [DialecticStateValues, string, string, string, number],
  boolean
>().mockReturnValue(false); // Default to false, tests can override

// Old implementation for reference or potential default mock logic if needed:
// export const selectIsStageReadyForSessionIteration = (
//     state: DialecticStateValues,
//     projectId: string,
//     sessionId: string,
//     stageSlug: string,
//     iterationNumber: number
// ): boolean => {
//     const project = state.currentProjectDetail;

//     if (!project || project.id !== projectId || !project.resources || project.resources.length === 0) {
//         return false;
//     }

//     for (const resource of project.resources) {
//         if (resource.resource_description && typeof resource.resource_description === 'string') {
//             try {
//                 const description = JSON.parse(resource.resource_description);
//                 if (
//                     description.type === 'seed_prompt' &&
//                     description.session_id === sessionId &&
//                     description.stage_slug === stageSlug &&
//                     description.iteration === iterationNumber
//                 ) {
//                     return true;
//                 }
//             } catch (error) {
//                 // Invalid JSON, ignore this resource
//                 // console.warn('Failed to parse resource_description in mock selector:', error, resource.resource_description);
//             }
//         }
//     }
//     return false;
// };

// Add missing selectors required by DialecticProjectDetailsPage.tsx
export const selectCurrentProjectDetail = (state: DialecticStateValues): DialecticProject | null => {
  return state.currentProjectDetail;
};

export const selectIsLoadingProjectDetail = (state: DialecticStateValues): boolean => {
  return state.isLoadingProjectDetail;
};

export const selectProjectDetailError = (state: DialecticStateValues): ApiError | null => {
  return state.projectDetailError;
};

export const selectActiveContextStage = (state: DialecticStateValues): DialecticStage | null => {
  return state.activeContextStage;
};

export const selectActiveContextProjectId = (state: DialecticStateValues): string | null => {
  return state.activeContextProjectId;
};
