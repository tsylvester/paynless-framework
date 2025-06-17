import { vi } from 'vitest';
import type {
  DialecticStateValues,
  DialecticStore,
  DialecticProject,
  ApiResponse,
  DialecticSession,
  DialecticProjectResource,
  DialecticStage,
  ApiError,
  DialecticDomain,
  DialecticContribution,
  DialecticActions,
  DomainOverlayDescriptor,
  DialecticProcessTemplate,
  GenerateContributionsResponse,
  SubmitStageResponsesResponse,
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
  isGeneratingContributions: false,
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
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
    fetchAIModelCatalog: vi.fn().mockResolvedValue(undefined as void),
    fetchContributionContent: vi.fn().mockResolvedValue(undefined as void),
    uploadProjectResourceFile: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticProjectResource>),
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
    resetSubmitStageResponsesError: vi.fn(() => { (newState as DialecticStateValues).submitStageResponsesError = null; }),
    saveContributionEdit: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 } as ApiResponse<DialecticContribution>),
    resetSaveContributionEditError: vi.fn(() => { (newState as DialecticStateValues).saveContributionEditError = null; }),
    setActiveContextProjectId: vi.fn((id: string | null) => { (newState as DialecticStateValues).activeContextProjectId = id; }),
    setActiveContextSessionId: vi.fn((id: string | null) => { (newState as DialecticStateValues).activeContextSessionId = id; }),
    setActiveContextStage: vi.fn((stage: DialecticStage | null) => { (newState as DialecticStateValues).activeContextStage = stage; }),
    setActiveDialecticContext: vi.fn((context: { projectId: string | null; sessionId: string | null; stage: DialecticStage | null }) => {
      (newState as DialecticStateValues).activeContextProjectId = context.projectId;
      (newState as DialecticStateValues).activeContextSessionId = context.sessionId;
      (newState as DialecticStateValues).activeContextStage = context.stage;
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
  for (const key in newValues) {
    if (Object.prototype.hasOwnProperty.call(newValues, key)) {
      (internalMockDialecticStoreState as unknown as Record<string, unknown>)[key] = (newValues as unknown as Record<string, unknown>)[key];
    }
  }
};

// Legacy initialize function for tests - now primarily uses setDialecticStateValues
// This will reset the state and apply partial new state if provided.
export const initializeMockDialecticState = (initialState?: Partial<DialecticStateValues>) => {
  internalMockDialecticStoreState = initializeInternalDialecticStoreState(); // Full reset
  if (initialState) {
    setDialecticStateValues(initialState);
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

// Keep selectOverlay mock if it's a standalone mock not part of the store state directly
export const selectOverlay = vi.fn();

// Add missing selectors
export const selectDomains = (state: DialecticStore): DialecticDomain[] | null => state.domains;
export const selectCurrentProjectDetail = (state: DialecticStore): DialecticProject | null => state.currentProjectDetail;
export const selectIsStartingSession = (state: DialecticStore): boolean => state.isStartingSession;
export const selectStartSessionError = (state: DialecticStore): ApiError | null => state.startSessionError;
export const selectSelectedDomainOverlayId = (state: DialecticStore): string | null => state.selectedDomainOverlayId;
export const selectAvailableDomainOverlays = (state: DialecticStore): DomainOverlayDescriptor[] | null => state.availableDomainOverlays;
export const selectSelectedDomain = (state: DialecticStore): DialecticDomain | null => state.selectedDomain;
export const selectSelectedStageAssociation = (state: DialecticStore): DialecticStage | null => state.selectedStageAssociation;
export const selectSelectedModelIds = (state: DialecticStore): string[] => state.selectedModelIds;
export const selectIsLoadingModelCatalog = (state: DialecticStore): boolean => state.isLoadingModelCatalog;
export const selectActiveContextSessionId = (state: DialecticStore): string | null => state.activeContextSessionId;
export const selectActiveContextStage = (state: DialecticStore): DialecticStage | null => state.activeContextStage;
export const selectIsLoadingProjectDetail = (state: DialecticStore): boolean => state.isLoadingProjectDetail;
export const selectProjectDetailError = (state: DialecticStore): ApiError | null => state.projectDetailError;
export const selectCurrentProcessTemplate = (state: DialecticStore): DialecticProcessTemplate | null => state.currentProcessTemplate;
export const selectIsLoadingProcessTemplate = (state: DialecticStore): boolean => state.isLoadingProcessTemplate;

export const selectContributionById = (state: DialecticStore, contributionId: string): DialecticContribution | undefined => {
  const project = state.currentProjectDetail;
  if (!project || !project.dialectic_sessions) return undefined;

  for (const session of project.dialectic_sessions) {
    const contribution = session.dialectic_contributions?.find(c => c.id === contributionId);
    if (contribution) {
      return contribution;
    }
  }
  return undefined;
};
