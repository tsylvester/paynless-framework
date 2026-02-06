import { vi, type Mock } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import type {
  DialecticStateValues,
  DialecticStore,
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticDomain,
  DialecticActions,
  ApiError,
  ApiResponse,
  DialecticFeedback,
  ContributionGenerationStatus,
  DialecticProcessTemplate,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  SetFocusedStageDocumentPayload,
  ClearFocusedStageDocumentPayload,
  StageRunProgressEntry,
  RenderCompletedPayload,
  DocumentCompletedPayload,
  StageDocumentChecklistEntry,
  StageDocumentCompositeKey,
  StageDocumentContentState,
  StageDocumentVersionInfo,
  ListStageDocumentsPayload,
  GetAllStageProgressPayload,
  EditedDocumentResource,
  SaveContributionEditSuccessResponse,
  SaveContributionEditPayload,
  SubmitStageDocumentFeedbackPayload,
  UnifiedProjectProgress,
  SelectedModels,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import {
  beginStageDocumentEditLogic,
  clearStageDocumentDraftLogic,
  ensureStageDocumentContentLogic,
  fetchStageDocumentContentLogic,
  flushStageDocumentDraftActionLogic,
  flushStageDocumentDraftLogic,
  handleRenderCompletedLogic,
  hydrateStageProgressLogic,
  hydrateAllStageProgressLogic,
  reapplyDraftToNewBaselineLogic,
  recordStageDocumentDraftLogic,
  recordStageDocumentFeedbackDraftLogic,
  updateStageDocumentDraftLogic,
  upsertStageDocumentVersionLogic,
} from '../../../../packages/store/src/dialecticStore.documents';

// ---- START: Define ALL controllable selectors as top-level vi.fn() mocks ----
// These are kept if tests rely on setting their return values directly at a global level.
// However, preferring selectors that operate on the store's state is generally better.
export const selectIsStageReadyForSessionIteration = vi.fn<[DialecticStateValues, string, string, string, number], boolean>().mockReturnValue(false);
export const selectFeedbackForStageIteration = vi.fn<[DialecticStateValues, string, string, string, number], DialecticFeedback[] | null>().mockReturnValue(null);
export const selectStageHasUnsavedChanges = vi
	.fn<
		[DialecticStateValues, string, string, number],
		{ hasUnsavedEdits: boolean; hasUnsavedFeedback: boolean }
	>()
	.mockReturnValue({ hasUnsavedEdits: false, hasUnsavedFeedback: false });

// Changed to actual selectors
export const selectIsLoadingProjectDetail = (state: DialecticStateValues): boolean => state.isLoadingProjectDetail;
export const selectCurrentProjectDetail = (state: DialecticStateValues): DialecticProject | null => state.currentProjectDetail;
export const selectProjectDetailError = (state: DialecticStateValues): ApiError | null => state.projectDetailError;
export const selectContributionGenerationStatus = (state: DialecticStateValues): ContributionGenerationStatus => state.contributionGenerationStatus;
export const selectGenerateContributionsError = (state: DialecticStateValues): ApiError | null => state.generateContributionsError;

export const selectSortedStages = (state: DialecticStateValues): DialecticStage[] => {
  const { currentProcessTemplate } = state;
  if (!currentProcessTemplate?.stages || !currentProcessTemplate.transitions?.length || !currentProcessTemplate.starting_stage_id) {
    return currentProcessTemplate?.stages || [];
  }

  const { stages, transitions, starting_stage_id } = currentProcessTemplate;
  
  const sortedStageIds: string[] = [];
  const transitionMap = new Map(transitions.map(t => [t.source_stage_id, t.target_stage_id]));

  let currentStageId: string | null | undefined = starting_stage_id;

  while (currentStageId) {
    sortedStageIds.push(currentStageId);
    currentStageId = transitionMap.get(currentStageId);
  }

  const sorted = [...stages].sort((a, b) => {
    const indexA = sortedStageIds.indexOf(a.id);
    const indexB = sortedStageIds.indexOf(b.id);
    
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;

    return indexA - indexB;
  });

  return sorted;
};

export const selectActiveContextStage = (state: DialecticStateValues): DialecticStage | null => state.activeContextStage;
export const selectSelectedModels = vi.fn<[DialecticStateValues], SelectedModels[]>().mockReturnValue([]);
export const selectActiveContextProjectId = (state: DialecticStateValues): string | null => state.activeContextProjectId;
export const selectActiveContextSessionId = (state: DialecticStateValues): string | null => state.activeContextSessionId;
export const selectActiveStageSlug = (state: DialecticStateValues): string | null => state.activeStageSlug;
export const selectSessionById = (state: DialecticStateValues, sessionId: string): DialecticSession | undefined => state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
export const selectCurrentProcessTemplate = (state: DialecticStateValues): DialecticProcessTemplate | null => state.currentProcessTemplate;
export const selectOverlay = vi.fn();
export const setFocusedStageDocument = vi.fn();
export const submitStageDocumentFeedback = vi.fn();

export const selectFocusedStageDocument = (
  state: DialecticStateValues,
  sessionId: string,
  stageSlug: string,
  modelId: string,
): { modelId: string; documentKey: string } | null => {
  const key = `${sessionId}:${stageSlug}:${modelId}`;
  return state.focusedStageDocument?.[key] ?? null;
};

export const selectStageDocumentResource = (
  state: DialecticStateValues,
  sessionId: string,
  stageSlug: string,
  iterationNumber: number,
  modelId: string,
  documentKey: string,
): StageDocumentContentState | undefined => {
  const compositeKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
  return state.stageDocumentContent[compositeKey];
};

const selectRecipeSteps = (
  state: DialecticStateValues,
  stageSlug: string,
): DialecticStageRecipeStep[] => {
  const recipe = state.recipesByStageSlug[stageSlug];
  if (!recipe) {
    return [];
  }
  return recipe.steps;
};

export const selectStageRecipe = (
  state: DialecticStateValues,
  stageSlug: string,
): DialecticStageRecipe | undefined => state.recipesByStageSlug[stageSlug];

export const selectStepList = (
  state: DialecticStateValues,
  stageSlug: string,
): DialecticStageRecipeStep[] => {
  const steps = selectRecipeSteps(state, stageSlug);
  if (steps.length === 0) {
    return steps;
  }
  return [...steps].sort((left, right) => {
    if (left.execution_order === right.execution_order) {
      return left.step_key.localeCompare(right.step_key);
    }
    return left.execution_order - right.execution_order;
  });
};

export const selectValidMarkdownDocumentKeys = vi.fn<[DialecticStateValues, string], Set<string>>().mockReturnValue(new Set<string>());

const defaultUnifiedProgress: UnifiedProjectProgress = {
  totalStages: 0,
  completedStages: 0,
  currentStageSlug: null,
  overallPercentage: 0,
  currentStage: null,
  projectStatus: 'not_started',
  stageDetails: [],
};

export const selectUnifiedProjectProgress: Mock<
  [DialecticStateValues, string],
  UnifiedProjectProgress
> = vi.fn<
  [DialecticStateValues, string],
  UnifiedProjectProgress
>().mockReturnValue(defaultUnifiedProgress);

export const selectStageRunProgress = (
  state: DialecticStateValues,
  sessionId: string,
  stageSlug: string,
  iterationNumber: number,
): StageRunProgressEntry | undefined => {
  const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
  return state.stageRunProgress[progressKey];
};

export const selectStageDocumentChecklist = (
  state: DialecticStateValues,
  progressKey: string,
  modelId: string
): StageDocumentChecklistEntry[] => {
  const progress = state.stageRunProgress[progressKey];
  if (!progress) {
    return [];
  }

  const checklist: StageDocumentChecklistEntry[] = [];
  const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;

  for (const compositeKey of Object.keys(progress.documents)) {
    const descriptor = progress.documents[compositeKey];
    if (!descriptor || descriptor.modelId !== modelId) {
      continue;
    }
    const documentKey = compositeKey.includes(sep)
      ? compositeKey.slice(0, compositeKey.indexOf(sep))
      : compositeKey;

    if (descriptor.descriptorType === 'planned') {
      checklist.push({
        descriptorType: 'planned',
        documentKey,
        status: 'not_started',
        jobId: null,
        latestRenderedResourceId: null,
        modelId: descriptor.modelId,
        stepKey: descriptor.stepKey,
      });
    } else {
      checklist.push({
        descriptorType: 'rendered',
        documentKey,
        status: descriptor.status,
        jobId: descriptor.job_id,
        latestRenderedResourceId: descriptor.latestRenderedResourceId ?? null,
        modelId: descriptor.modelId,
        stepKey: descriptor.stepKey,
      });
    }
  }

  return checklist;
};

export const selectStageProgressSummary = (
  state: DialecticStateValues,
  sessionId: string,
  stageSlug: string,
  iterationNumber: number,
  modelId?: string,
): {
  isComplete: boolean;
  totalDocuments: number;
  completedDocuments: number;
  outstandingDocuments: string[];
} => {
  const progress = selectStageRunProgress(state, sessionId, stageSlug, iterationNumber);
  if (!progress) {
    return {
      isComplete: false,
      totalDocuments: 0,
      completedDocuments: 0,
      outstandingDocuments: [],
    };
  }

  const documentKeys = Object.keys(progress.documents).filter((key) => {
    if (!modelId) return true;
    const documentDescriptor = progress.documents[key];
    return documentDescriptor?.modelId === modelId;
  });

  let completedDocuments = 0;
  const outstandingDocuments: string[] = [];

  for (const documentKey of documentKeys) {
    const descriptor = progress.documents[documentKey];
    if (!descriptor) {
      continue;
    }
    if (descriptor.status === 'completed') {
      completedDocuments += 1;
    } else {
      outstandingDocuments.push(documentKey);
    }
  }

  const totalDocuments = documentKeys.length;
  const isComplete = totalDocuments > 0 && completedDocuments === totalDocuments;

  outstandingDocuments.sort();

  return {
    isComplete,
    totalDocuments,
    completedDocuments,
    outstandingDocuments,
  };
};

// ---- END: Controllable selectors ----

// Define and export the mock for the new thunk
export const mockActivateProjectAndSessionContextForDeepLink = vi.fn().mockResolvedValue(undefined);
export const mockFetchAndSetCurrentSessionDetails = vi.fn().mockResolvedValue(undefined);

// Mock Session (used in some action mocks)
const mockSession: DialecticSession = {
  id: 'ses-1',
  project_id: 'proj-1',
  session_description: 'Mock Session',
  user_input_reference_url: null,
  iteration_count: 1,
  selected_models: [],
  status: 'active',
  associated_chat_id: null,
  current_stage_id: 'stage-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_contributions: [],
  dialectic_session_models: [],
};

// 1. Define initial state values
export const initialDialecticStateValues: DialecticStateValues = {
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
  selectedModels: [],
  initialPromptContentCache: {},
  activeContextProjectId: null,
  activeContextSessionId: null,
  activeContextStage: null,
  activeSessionDetail: null,
  isLoadingActiveSessionDetail: false,
  activeSessionDetailError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  generatingSessions: {},
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
  isUpdatingSessionModels: false,
  updateSessionModelsError: null,
  currentFeedbackFileContent: null,
  isFetchingFeedbackFileContent: false,
  fetchFeedbackFileContentError: null,
  activeDialecticWalletId: null,
  activeStageSlug: 'thesis',
  recipesByStageSlug: {},
  stageRunProgress: {},
  focusedStageDocument: {},
  stageDocumentContent: {},
  stageDocumentVersions: {},
  stageDocumentFeedback: {},
  isLoadingStageDocumentFeedback: false,
  stageDocumentFeedbackError: null,
  isSubmittingStageDocumentFeedback: false,
  submitStageDocumentFeedbackError: null,
  activeSeedPrompt: null,
  stageDocumentResources: {},
};

// 2. Helper function to create a new mock store instance
const createActualMockStore = (initialOverrides?: Partial<DialecticStateValues>): StoreApi<DialecticStore> => {
  return createStore<DialecticStore>()(
    immer((set, get) => {
      /*
      const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
        `${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;
      */

      const upsertStageDocumentVersion = (
        state: Draft<DialecticStateValues>,
        key: StageDocumentCompositeKey,
        info: StageDocumentVersionInfo,
      ): void => {
        upsertStageDocumentVersionLogic(state, key, info);
      };

      const ensureStageDocumentContent = (
        state: Draft<DialecticStateValues>,
        key: StageDocumentCompositeKey,
        seed?: { baselineMarkdown?: string; version?: StageDocumentVersionInfo },
      ): StageDocumentContentState => {
        return ensureStageDocumentContentLogic(state, key, seed);
      };

      const recordStageDocumentDraft = (
        state: Draft<DialecticStateValues>,
        key: StageDocumentCompositeKey,
        draftMarkdown: string,
      ): void => {
        recordStageDocumentDraftLogic(state, key, draftMarkdown);
      };

      const flushStageDocumentDraft = (
        state: Draft<DialecticStateValues>,
        key: StageDocumentCompositeKey,
      ): void => {
        flushStageDocumentDraftLogic(state, key);
      };

      const reapplyDraftToNewBaseline = (
        state: Draft<DialecticStateValues>,
        key: StageDocumentCompositeKey,
        newBaseline: string,
        newVersion: StageDocumentVersionInfo,
      ): void => {
        reapplyDraftToNewBaselineLogic(state, key, newBaseline, newVersion);
      };

      return {
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
      setSelectedModels: vi.fn((models: SelectedModels[]) => set({ selectedModels: models })),
      setModelMultiplicity: vi.fn((model: SelectedModels, count: number) => {
        const currentModels: SelectedModels[] = get().selectedModels || [];
        const otherModels: SelectedModels[] = currentModels.filter((m) => m.id !== model.id);
        const newModels: SelectedModels[] = [...otherModels];
        for (let i = 0; i < count; i++) {
          newModels.push(model);
        }
        set({ selectedModels: newModels });
      }),
      resetSelectedModels: vi.fn(() => set({ selectedModels: [] })),
      fetchInitialPromptContent: vi.fn().mockResolvedValue(undefined),
      generateContributions: vi.fn().mockResolvedValue({ data: { message: 'ok', contributions: [] }, error: undefined, status: 200 }),
      submitStageResponses: vi.fn().mockResolvedValue({ data: { message: 'ok', userFeedbackStoragePath: '/path', nextStageSeedPromptStoragePath: '/path', updatedSession: mockSession }, error: undefined, status: 200 }),
      setSubmittingStageResponses: vi.fn((isLoading: boolean) => set({ isSubmittingStageResponses: isLoading })),
      setSubmitStageResponsesError: vi.fn((error: ApiError | null) => set({ submitStageResponsesError: error })),
      resetSubmitStageResponsesError: vi.fn(() => set({ submitStageResponsesError: null })),
      saveContributionEdit: vi.fn().mockImplementation(async (params: SaveContributionEditPayload) => {
          // Base mock. Tests may override.
          // Simulates document-centric editing flow by updating stageDocumentContent state
          set({ isSavingContributionEdit: true, saveContributionEditError: null });
          
          // Simulate async API call
          await new Promise(resolve => setTimeout(resolve, 0));
          
          // Construct mock resource response matching EditedDocumentResource type
          const mockResource: EditedDocumentResource = {
            id: `resource-${params.originalContributionIdToEdit}`,
            resource_type: params.resourceType ?? 'rendered_document',
            project_id: params.projectId,
            session_id: params.sessionId,
            stage_slug: null, // Mock implementation - tests should override if stage_slug is needed
            iteration_number: null, // Mock implementation - tests should override if iteration_number is needed
            document_key: params.documentKey ?? params.originalModelContributionId,
            source_contribution_id: params.originalContributionIdToEdit,
            storage_bucket: 'dialectic-resources',
            storage_path: `/edited/${params.originalContributionIdToEdit}.md`,
            file_name: `edited-${params.originalContributionIdToEdit}.md`,
            mime_type: 'text/markdown',
            size_bytes: params.editedContentText.length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const mockResponse: SaveContributionEditSuccessResponse = {
            resource: mockResource,
            sourceContributionId: params.originalContributionIdToEdit,
          };

          // Update stageDocumentContent state to simulate document-centric editing
          // This allows component tests to simulate edited documents without real contributions
          // Note: This requires deriving the composite key from params, which may need adjustment
          // based on actual payload structure in component tests
          // For now, tests can override this mock or call setStageDocumentResource directly

          set({ isSavingContributionEdit: false, saveContributionEditError: null });
          return { data: mockResponse, error: null, status: 200 };
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
      setActiveDialecticWalletId: vi.fn((id: string | null) => set({ activeDialecticWalletId: id })),
      setActiveStage: vi.fn((slug: string | null) => {
        const stages = get().currentProcessTemplate?.stages ?? [];
        const stage = stages.find(s => s.slug === slug) ?? null;
        set({
          activeContextStage: stage,
          activeStageSlug: slug
        });
      }),
      setFocusedStageDocument: vi.fn((payload: SetFocusedStageDocumentPayload) => {
        const { sessionId, stageSlug, modelId, documentKey } = payload;
        const key = `${sessionId}:${stageSlug}:${modelId}`;
        set((state) => {
          if (!state.focusedStageDocument) {
            state.focusedStageDocument = {};
          }
          state.focusedStageDocument[key] = { modelId, documentKey };
        });
      }),
      clearFocusedStageDocument: vi.fn((payload: ClearFocusedStageDocumentPayload) => {
        const { sessionId, stageSlug, modelId } = payload;
        const key = `${sessionId}:${stageSlug}:${modelId}`;
        set((state) => {
          const current = state.focusedStageDocument ?? {};
          if (!(key in current)) {
            return;
          }
          current[key] = null;
        });
      }),
      _handleContributionGenerationStarted: vi.fn(),
      _handleDialecticContributionStarted: vi.fn(),
      _handleContributionGenerationRetrying: vi.fn(),
      _handleDialecticContributionReceived: vi.fn(),
      _handleContributionGenerationFailed: vi.fn(),
      _handleContributionGenerationContinued: vi.fn(),
      _handleProgressUpdate: vi.fn(),
      _handleContributionGenerationComplete: vi.fn(),
      _handlePlannerStarted: vi.fn(),
      _handlePlannerCompleted: vi.fn(),
      _handleDocumentStarted: vi.fn(),
      _handleDocumentChunkCompleted: vi.fn(),
      _handleDocumentCompleted: vi.fn<[DocumentCompletedPayload], void>(),
      _handleRenderStarted: vi.fn(),
      _handleRenderCompleted: vi.fn().mockImplementation((event: RenderCompletedPayload) => {
        handleRenderCompletedLogic(get, set, event);
      }),
      _handleJobFailed: vi.fn(),
      fetchStageRecipe: vi.fn().mockResolvedValue(undefined),
      ensureRecipeForActiveStage: vi.fn().mockResolvedValue(undefined),
      fetchStageDocumentFeedback: vi.fn().mockResolvedValue(undefined),
      submitStageDocumentFeedback: vi.fn<[SubmitStageDocumentFeedbackPayload], Promise<ApiResponse<{ success: boolean }>>>()
        .mockResolvedValue({ data: { success: true }, error: undefined, status: 200 }),
      beginStageDocumentEdit: vi.fn().mockImplementation(
        (key: StageDocumentCompositeKey, initialDraftMarkdown: string) => {
            beginStageDocumentEditLogic(
                get,
                set,
                {
                    ensureStageDocumentContent,
                    recordStageDocumentDraft,
                    upsertStageDocumentVersion,
                    reapplyDraftToNewBaseline,
                },
                key,
                initialDraftMarkdown,
            );
        },
      ),
      updateStageDocumentDraft: vi.fn().mockImplementation(
        (key: StageDocumentCompositeKey, draftMarkdown: string) => {
            updateStageDocumentDraftLogic(
                set,
                {
                    ensureStageDocumentContent,
                    recordStageDocumentDraft,
                    upsertStageDocumentVersion,
                    reapplyDraftToNewBaseline,
                },
                key,
                draftMarkdown,
            );
        },
      ),
      updateStageDocumentFeedbackDraft: vi.fn().mockImplementation(
        (key: StageDocumentCompositeKey, feedbackMarkdown: string) => {
          set((state) => {
            recordStageDocumentFeedbackDraftLogic(state, key, feedbackMarkdown);
          });
        },
      ),
      flushStageDocumentDraft: vi.fn().mockImplementation((key: StageDocumentCompositeKey) => {
        flushStageDocumentDraftActionLogic(set, { flushStageDocumentDraft }, key);
      }),
      clearStageDocumentDraft: vi.fn().mockImplementation((key: StageDocumentCompositeKey) => {
        clearStageDocumentDraftLogic(set, key);
      }),
      fetchStageDocumentContent: vi.fn().mockImplementation(
        async (key: StageDocumentCompositeKey, resourceId: string) => {
            await fetchStageDocumentContentLogic(
                set,
                {
                    ensureStageDocumentContent,
                    recordStageDocumentDraft,
                    upsertStageDocumentVersion,
                    reapplyDraftToNewBaseline,
                },
                key,
                resourceId,
            );
        },
      ),
      updateStageDocumentResource: vi.fn().mockImplementation(
        (key: StageDocumentCompositeKey, resource: EditedDocumentResource, editedContentText: string) => {
            const versionInfo: StageDocumentVersionInfo = {
                resourceId: resource.id,
                versionHash: '', // Mock implementation - tests should override if versionHash is needed
                updatedAt: resource.updated_at ?? new Date().toISOString(),
            };
            set((state) => {
                const documentEntry = ensureStageDocumentContent(state, key, {
                    baselineMarkdown: editedContentText,
                    version: versionInfo,
                });
                documentEntry.currentDraftMarkdown = editedContentText;
                documentEntry.isDirty = false;
                documentEntry.isLoading = false;
                documentEntry.error = null;
            });
        },
      ),
      hydrateStageProgress: vi.fn().mockImplementation((payload: ListStageDocumentsPayload) => {
        hydrateStageProgressLogic(set, payload);
      }),
      hydrateAllStageProgress: vi.fn().mockImplementation((payload: GetAllStageProgressPayload) => {
        hydrateAllStageProgressLogic(set, payload);
      }),
      resetSubmitStageDocumentFeedbackError: vi.fn(() => set({ submitStageDocumentFeedbackError: null })),
    };
  }),
);
};

// 3. Initialize the store at module level
let actualMockStore = createActualMockStore();

// 4. Getter for the current state (primarily for test assertions if needed outside the hook)
export const getDialecticStoreState = (): DialecticStore => actualMockStore.getState();

// 5. Mock Hook Logic using useStore
export function useDialecticStore(): DialecticStore;
export function useDialecticStore<TResult>(selector: (state: DialecticStore) => TResult): TResult;
export function useDialecticStore<TResult = DialecticStore>(selector?: (state: DialecticStore) => TResult): TResult | DialecticStore {
  let sel: (state: DialecticStore) => TResult | DialecticStore;
  if (selector !== undefined) {
    sel = selector;
  } else {
    sel = (s: DialecticStore): DialecticStore => s;
  }
  return useStore(actualMockStore, sel);
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
    return actualMockStore.getState();
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
  selectStageHasUnsavedChanges.mockClear().mockReturnValue({ hasUnsavedEdits: false, hasUnsavedFeedback: false });
  selectSelectedModels.mockClear().mockReturnValue([]);
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
export const getDialecticStoreActionMock = <K extends keyof DialecticActions>(actionName: K): DialecticActions[K] => {
    const action = actualMockStore.getState()[actionName];
    if (typeof action === 'function' && '_isMockFunction' in action) {
        return action;
    }
    throw new Error(`Action ${String(actionName)} is not a mock function in the store.`);
};

// Helper to access ALL actions, including those that are not vi.fn() if any (though they should be)
// This is similar to the one attached to the hook but can be used independently.
export const getDialecticStoreActions = (): DialecticActions => {
  return actualMockStore.getState();
};
