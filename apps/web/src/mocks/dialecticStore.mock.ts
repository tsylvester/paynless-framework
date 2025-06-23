import { vi, type Mock } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type {
  DialecticStateValues,
  DialecticStore,
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticDomain,
  DialecticActions,
  ApiError,
  DialecticFeedback,
  ContributionGenerationStatus,
  DialecticProcessTemplate,
} from '@paynless/types';

// ---- START: Define ALL controllable selectors as top-level vi.fn() mocks ----
// These are kept if tests rely on setting their return values directly at a global level.
// However, preferring selectors that operate on the store's state is generally better.
export const selectIsStageReadyForSessionIteration = vi.fn<[DialecticStateValues, string, string, string, number], boolean>().mockReturnValue(false);
export const selectFeedbackForStageIteration = vi.fn<[DialecticStateValues, string, string, string, number], DialecticFeedback[] | null>().mockReturnValue(null);

// Changed to actual selectors
export const selectIsLoadingProjectDetail = (state: DialecticStateValues): boolean => state.isLoadingProjectDetail;
export const selectCurrentProjectDetail = (state: DialecticStateValues): DialecticProject | null => state.currentProjectDetail;
export const selectProjectDetailError = (state: DialecticStateValues): ApiError | null => state.projectDetailError;
export const selectContributionGenerationStatus = (state: DialecticStateValues): ContributionGenerationStatus => state.contributionGenerationStatus;
export const selectGenerateContributionsError = (state: DialecticStateValues): ApiError | null => state.generateContributionsError;

export const selectActiveContextStage = (state: DialecticStateValues): DialecticStage | null => state.activeContextStage;
export const selectSelectedModelIds = vi.fn<[DialecticStateValues], string[]>().mockReturnValue([]);
export const selectActiveContextProjectId = (state: DialecticStateValues): string | null => state.activeContextProjectId;
export const selectActiveContextSessionId = (state: DialecticStateValues): string | null => state.activeContextSessionId;
export const selectCurrentProcessTemplate = (state: DialecticStateValues): DialecticProcessTemplate | null => state.currentProcessTemplate;
export const selectOverlay = vi.fn();
// ---- END: Controllable selectors ----

// Define and export the mock for the new thunk
export const mockActivateProjectAndSessionContextForDeepLink = vi.fn().mockResolvedValue(undefined as void);
export const mockFetchAndSetCurrentSessionDetails = vi.fn().mockResolvedValue(undefined as void);

// Mock Session (used in some action mocks)
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

// 1. Define initial state values
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
  activeSessionDetail: null,
  isLoadingActiveSessionDetail: false,
  activeSessionDetailError: null,
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

// 2. Helper function to create a new mock store instance
const createActualMockStore = (initialOverrides?: Partial<DialecticStateValues>): StoreApi<DialecticStore> => {
  return createStore<DialecticStore>((set, get) => ({
    ...initialDialecticStateValues,
    ...(initialOverrides || {}),

    // Actions - implemented using vi.fn() and using `set` for state changes
    fetchDomains: vi.fn().mockResolvedValue(undefined),
    setSelectedDomain: vi.fn((domain: DialecticDomain | null) => set({ selectedDomain: domain })),
    fetchAvailableDomainOverlays: vi.fn().mockResolvedValue(undefined),
    setSelectedStageAssociation: vi.fn((stage: DialecticStage | null) => set({ selectedStageAssociation: stage })),
    setSelectedDomainOverlayId: vi.fn((id: string | null) => set({ selectedDomainOverlayId: id })),
    fetchDialecticProjects: vi.fn().mockResolvedValue(undefined),
    fetchDialecticProjectDetails: vi.fn().mockResolvedValue(undefined), // Tests might override this to use `set`
    fetchProcessTemplate: vi.fn().mockResolvedValue(undefined),
    createDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
    startDialecticSession: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
    updateSessionModels: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
    fetchAIModelCatalog: vi.fn().mockResolvedValue(undefined),
    fetchContributionContent: vi.fn().mockImplementation(async (contributionId: string) => {
        // This is a base mock. Tests should provide specific implementations if needed,
        // especially for updating contributionContentCache via `set`.
        // For example: set(state => ({ contributionContentCache: { ...state.contributionContentCache, [contributionId]: { isLoading: false, content: '...', error: null, mimeType: 'text/markdown' } } }));
        return { data: { content: `Default mock content for ${contributionId}`, mimeType: 'text/markdown'}, error: null };
    }),
    resetCreateProjectError: vi.fn(() => set({ createProjectError: null })),
    resetProjectDetailsError: vi.fn(() => set({ projectDetailError: null })),
    deleteDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
    cloneDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
    exportDialecticProject: vi.fn().mockResolvedValue({ data: { export_url: '' }, error: undefined, status: 200 }),
    updateDialecticProjectInitialPrompt: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
    setSelectedModelIds: vi.fn((ids: string[]) => set({ selectedModelIds: ids })),
    setModelMultiplicity: vi.fn((modelId: string, count: number) => {
      const currentSelectedIds = get().selectedModelIds || [];
      const filteredIds = currentSelectedIds.filter((id) => id !== modelId);
      const newSelectedIds = [...filteredIds];
      for (let i = 0; i < count; i++) {
        newSelectedIds.push(modelId);
      }
      set({ selectedModelIds: newSelectedIds });
    }),
    resetSelectedModelId: vi.fn(() => set({ selectedModelIds: [] })),
    fetchInitialPromptContent: vi.fn().mockResolvedValue(undefined),
    generateContributions: vi.fn().mockResolvedValue({ data: { message: 'ok', contributions: [] }, error: undefined, status: 200 }),
    submitStageResponses: vi.fn().mockResolvedValue({ data: { message: 'ok', userFeedbackStoragePath: '/path', nextStageSeedPromptStoragePath: '/path', updatedSession: mockSession }, error: undefined, status: 200 }),
    setSubmittingStageResponses: vi.fn((isLoading: boolean) => set({ isSubmittingStageResponses: isLoading })),
    setSubmitStageResponsesError: vi.fn((error: ApiError | null) => set({ submitStageResponsesError: error })),
    resetSubmitStageResponsesError: vi.fn(() => set({ submitStageResponsesError: null })),
    saveContributionEdit: vi.fn().mockImplementation(async (params) => {
        // Base mock. Tests may override.
        // Example of setting loading state: set({ isSavingContributionEdit: true });
        // After "async" work: set({ isSavingContributionEdit: false });
        return { data: ({ id: params.originalContributionIdToEdit, ...params }), error: null, status: 200 };
    }),
    setSavingContributionEdit: vi.fn((isLoading: boolean) => set({ isSavingContributionEdit: isLoading })),
    setSaveContributionEditError: vi.fn((error: ApiError | null) => set({ saveContributionEditError: error })),
    resetSaveContributionEditError: vi.fn(() => set({ saveContributionEditError: null })),
    setActiveContextProjectId: vi.fn((id: string | null) => set({ activeContextProjectId: id })),
    setActiveContextSessionId: vi.fn((id: string | null) => set({ activeContextSessionId: id })),
    setActiveContextStage: vi.fn((stage: DialecticStage | null) => set({ activeContextStage: stage })),
    setActiveDialecticContext: vi.fn((context: { projectId: string | null; sessionId: string | null; stage: DialecticStage | null }) => {
      set({
        activeContextProjectId: context.projectId,
        activeContextSessionId: context.sessionId,
        activeContextStage: context.stage,
      });
    }),
    fetchFeedbackFileContent: vi.fn().mockResolvedValue(undefined),
    resetFetchFeedbackFileContentError: vi.fn(() => set({ fetchFeedbackFileContentError: null })),
    clearCurrentFeedbackFileContent: vi.fn(() => set({ currentFeedbackFileContent: null })),
    reset: vi.fn(() => {
      // Resets state values to initial, action mocks remain the same vi.fn() instances
      // but their call history etc. would be affected by a new store instance if we fully re-created.
      // For a simple state reset:
      set(initialDialecticStateValues);
      // If full action mock reset is needed, initializeMockDialecticState should be called.
    }),
    _resetForTesting: vi.fn(() => {
      // This is primarily handled by initializeMockDialecticState creating a new store.
      // Calling reset here will reset the values of the *current* store instance.
      get().reset();
    }),
    activateProjectAndSessionContextForDeepLink: mockActivateProjectAndSessionContextForDeepLink,
    fetchAndSetCurrentSessionDetails: mockFetchAndSetCurrentSessionDetails,
  }));
};

// 3. Initialize the store at module level
let actualMockStore = createActualMockStore();

// 4. Getter for the current state (primarily for test assertions if needed outside the hook)
export const getDialecticStoreState = (): DialecticStore => actualMockStore.getState();

// 5. Mock Hook Logic using useStore
export function useDialecticStore(): DialecticStore;
export function useDialecticStore<TResult>(selector: (state: DialecticStore) => TResult): TResult;
export function useDialecticStore<TResult>(selector?: (state: DialecticStore) => TResult): TResult | DialecticStore {
  // useStore from Zustand handles undefined selector by returning the whole state.
  // The selector type needs to be compatible.
  return useStore(actualMockStore, selector as (state: DialecticStore) => TResult);
}

// Attach getState and setState to the useDialecticStore hook, similar to Zustand's store API
Object.assign(useDialecticStore, {
  getState: () => actualMockStore.getState(),
  setState: (
    partial: Partial<DialecticStore> | ((state: DialecticStore) => Partial<DialecticStore>),
  ) => {
    actualMockStore.setState(partial); // Zustand's setState merges by default
  },
  // Helper to get all action mocks (useful for `expect(getActions().someAction).toHaveBeenCalled()`)
  getActions: (): DialecticActions => {
    const currentState = actualMockStore.getState();
    const actions: Partial<DialecticActions> = {};
    const stateValueKeys = new Set(Object.keys(initialDialecticStateValues));

    for (const key in currentState) {
      if (Object.prototype.hasOwnProperty.call(currentState, key) && !stateValueKeys.has(key)) {
        const potentialAction = (currentState as unknown as Record<string, unknown>)[key];
        if (typeof potentialAction === 'function') {
          (actions as Record<string, unknown>)[key] = potentialAction;
        }
      }
    }
    return actions as DialecticActions;
  }
});


// 6. State Helper for tests to directly set state values (merges with existing state)
export const setDialecticStateValues = (newValues: Partial<DialecticStateValues>) => {
  actualMockStore.setState(newValues);
};

// 7. Function to re-initialize or update the mock store state for tests
export const initializeMockDialecticState = (initialStateOverrides?: Partial<DialecticStateValues>) => {
  // Create a new store instance. This effectively resets all state and action mocks to their vi.fn() definitions.
  actualMockStore = createActualMockStore(initialStateOverrides);

  // If tests also rely on global selector mocks, reset them here.
  // Ensure that selectors converted to actual functions are NOT reset as vi.fn()
  selectIsStageReadyForSessionIteration.mockClear().mockReturnValue(false);
  selectFeedbackForStageIteration.mockClear().mockReturnValue(null);
  selectSelectedModelIds.mockClear().mockReturnValue([]);
  selectOverlay.mockClear();

  // Resetting specific action mocks (ensure all relevant actions are included if needed for global mock state)
  mockActivateProjectAndSessionContextForDeepLink.mockClear();
  mockFetchAndSetCurrentSessionDetails.mockClear();
};

// 8. Reset Function for tests (full reset)
export const resetDialecticStoreMock = () => {
  initializeMockDialecticState(); // This creates a new store with fresh state and action mocks

  // Clear any top-level thunk mocks that are not part of the store's state
  mockActivateProjectAndSessionContextForDeepLink.mockClear();
  mockFetchAndSetCurrentSessionDetails.mockClear();
  // Global selectors are reset within initializeMockDialecticState
};

// 9. Utility to get specific action mocks from the current store instance
// This is more robust than getActions() if you need a specific, typed action mock.
export const getDialecticStoreActionMock = <K extends keyof DialecticActions>(actionName: K): Mock => {
    const action = actualMockStore.getState()[actionName];
    if (typeof action === 'function' && '_isMockFunction' in action) {
        return action as unknown as Mock;
    }
    throw new Error(`Action ${String(actionName)} is not a mock function in the store.`);
};

// Helper to access ALL actions, including those that are not vi.fn() if any (though they should be)
// This is similar to the one attached to the hook but can be used independently.
export const getDialecticStoreActions = (): DialecticActions => {
  const currentState = actualMockStore.getState();
  const actionsOnly: Partial<DialecticActions> = {};
  const stateKeys = Object.keys(initialDialecticStateValues); // Array of strings

  for (const key in currentState) { // key is string
    if (Object.prototype.hasOwnProperty.call(currentState, key)) {
      // Ensure key is not a state key and the value is a function
      if (!(stateKeys).includes(key) && typeof (currentState as unknown as Record<string, unknown>)[key] === 'function') {
        (actionsOnly as Record<string, unknown>)[key] = (currentState as unknown as Record<string, unknown>)[key];
      }
    }
  }
  return actionsOnly as DialecticActions;
};
