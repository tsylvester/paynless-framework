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
  DialecticSessionModel,
  DialecticStage,
  DialecticStageTransition,
  DialecticDomainRow,
  DagProgressDto,
  DomainProcessAssociationRow,
  DialecticActions,
  ApiError,
  ApiResponse,
  DialecticFeedback,
  DialecticContribution,
  ContributionGenerationStatus,
  DialecticProcessTemplate,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DomainOverlayDescriptor,
  DialecticProjectResource,
  AssembledPrompt,
  SetFocusedStageDocumentPayload,
  ClearFocusedStageDocumentPayload,
  StageRunProgressEntry,
  StageProgressEntry,
  StageRunProgressSnapshot,
  StageRenderedDocumentDescriptor,
  StagePlannedDocumentDescriptor,
  RenderCompletedPayload,
  DocumentCompletedPayload,
  StageDocumentChecklistEntry,
  StageDocumentCompositeKey,
  StageDocumentContentState,
  StageDocumentVersionInfo,
  ListStageDocumentsPayload,
  GetAllStageProgressPayload,
  GetAllStageProgressResponse,
  EditedDocumentResource,
  SaveContributionEditSuccessResponse,
  SaveContributionEditPayload,
  SubmitStageDocumentFeedbackPayload,
  UnifiedProjectProgress,
  SelectedModels,
  AiProvidersRow,
  AiModelExtendedConfig,
  JobProgressEntry,
  JobProgressDto,
  ContributionCacheEntry,
  FocusedStageDocumentState,
  InitializeMaxOutputTokensResult,
  Json,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import {
  beginStageDocumentEditLogic,
  clearStageDocumentDraftLogic,
  ensureStageDocumentContentLogic,
  type EnsureStageDocumentContentSeed,
  fetchStageDocumentContentLogic,
  flushStageDocumentDraftActionLogic,
  flushStageDocumentDraftLogic,
  flushStageDocumentFeedbackDraftLogic,
  handleRenderCompletedLogic,
  hydrateStageProgressLogic,
  hydrateAllStageProgressLogic,
  initializeFeedbackDraftLogic,
  reapplyDraftToNewBaselineLogic,
  recordStageDocumentDraftLogic,
  recordStageDocumentFeedbackDraftLogic,
  updateStageDocumentDraftLogic,
  upsertStageDocumentVersionLogic,
} from '../../../../packages/store/src/dialecticStore.documents';
import {
  selectDocumentDisplayMetadata,
  selectCanAdvanceStage,
} from '../../../../packages/store/src/dialecticStore.selectors';
import { internalMockAuthStoreGetState } from './authStore.mock';
import { isJson } from '@paynless/utils';
import { api } from '@paynless/api/mocks';

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
export const selectDefaultGenerationModels = vi.fn<[DialecticStateValues], SelectedModels[]>().mockReturnValue([]);
export const selectActiveContextProjectId = (state: DialecticStateValues): string | null => state.activeContextProjectId;
export const selectActiveContextSessionId = (state: DialecticStateValues): string | null => state.activeContextSessionId;
export const selectViewingStageSlug = (state: DialecticStateValues): string | null => state.viewingStageSlug;
export const selectSessionById = (state: DialecticStateValues, sessionId: string): DialecticSession | undefined => state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
export const selectCurrentProcessTemplate = (state: DialecticStateValues): DialecticProcessTemplate | null => state.currentProcessTemplate;
export const selectViewingStage = (state: DialecticStateValues): DialecticStage | null => state.activeViewingStage;
export const selectOverlay = vi.fn();
export const setFocusedStageDocument = vi.fn();
export const submitStageDocumentFeedback = vi.fn();
export const _handleContributionGenerationPausedNsf = vi.fn();

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
  hydrationReady: false,
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
        latestRenderedResourceId: descriptor.latestRenderedResourceId,
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
  hasFailed: boolean;
  failedDocuments: number;
  failedDocumentKeys: string[];
} => {
  const progress = selectStageRunProgress(state, sessionId, stageSlug, iterationNumber);
  if (!progress) {
    return {
      isComplete: false,
      totalDocuments: 0,
      completedDocuments: 0,
      outstandingDocuments: [],
      hasFailed: false,
      failedDocuments: 0,
      failedDocumentKeys: [],
    };
  }

  const documentKeys = Object.keys(progress.documents).filter((key) => {
    if (!modelId) return true;
    const documentDescriptor = progress.documents[key];
    return documentDescriptor && documentDescriptor.modelId === modelId;
  });

  let completedDocuments = 0;
  const outstandingDocuments: string[] = [];
  const failedDocumentKeys: string[] = [];

  for (const documentKey of documentKeys) {
    const descriptor = progress.documents[documentKey];
    if (!descriptor) {
      continue;
    }
    if (descriptor.status === 'completed') {
      completedDocuments += 1;
    } else if (descriptor.status === 'failed') {
      failedDocumentKeys.push(documentKey);
    } else {
      outstandingDocuments.push(documentKey);
    }
  }

  const totalDocuments = documentKeys.length;
  const isComplete = totalDocuments > 0 && completedDocuments === totalDocuments;

  outstandingDocuments.sort();
  failedDocumentKeys.sort();

  return {
    isComplete,
    totalDocuments,
    completedDocuments,
    outstandingDocuments,
    hasFailed: failedDocumentKeys.length > 0,
    failedDocuments: failedDocumentKeys.length,
    failedDocumentKeys,
  };
};

export { selectDocumentDisplayMetadata, selectCanAdvanceStage };

// ---- END: Controllable selectors ----

// Define and export the mock for the new thunk
export const mockActivateProjectAndSessionContextForDeepLink = vi.fn().mockResolvedValue(undefined);
export const mockFetchAndSetCurrentSessionDetails = vi.fn().mockResolvedValue(undefined);

export const mockResumePausedNsfJobs = vi.fn().mockResolvedValue({ data: { resumedCount: 0 }, error: undefined, status: 200 });
export const mockPauseActiveJobs = vi.fn().mockResolvedValue({ data: { pausedCount: 0 }, error: undefined, status: 200 });
export const mockInitializeMaxOutputTokens: Mock<[], InitializeMaxOutputTokensResult> = vi
  .fn<[], InitializeMaxOutputTokensResult>()
  .mockReturnValue({ ok: true });

export const mockFetchAIModelCatalog: Mock<[], Promise<void>> = vi.fn<[], Promise<void>>();

export function mockDialecticDomain(
  overrides: Partial<DialecticDomainRow> = {},
): DialecticDomainRow {
  const base: DialecticDomainRow = {
    id: 'dom-1',
    name: 'Domain 1',
    description: 'Test domain',
    parent_domain_id: null,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

export function mockDomainOverlayDescriptor(
  overrides: Partial<DomainOverlayDescriptor> = {},
): DomainOverlayDescriptor {
  const base: DomainOverlayDescriptor = {
    id: 'ov-1',
    domainId: 'dom-1',
    domainName: 'Domain 1',
    description: 'Overlay description',
    stageAssociation: 'thesis',
    overlay_values: {},
  };
  return { ...base, ...overrides };
}

export function mockDialecticStage(
  overrides: Partial<DialecticStage> = {},
): DialecticStage {
  const base: DialecticStage = {
    id: 'stage-1',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'Initial hypothesis',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'sp-1',
    expected_output_template_ids: [],
    recipe_template_id: null,
    active_recipe_instance_id: null,
    minimum_balance: 100000,
  };
  return { ...base, ...overrides };
}

export function mockDialecticStageTransition(
  overrides: Partial<DialecticStageTransition> = {},
): DialecticStageTransition {
  const base: DialecticStageTransition = {
    id: 't-1',
    process_template_id: 'pt-1',
    source_stage_id: 'stage-1',
    target_stage_id: 'stage-2',
    created_at: new Date().toISOString(),
    condition_description: null,
  };
  return { ...base, ...overrides };
}

export function mockDialecticStageRecipeStep(
  overrides: Partial<DialecticStageRecipeStep> = {},
): DialecticStageRecipeStep {
  const base: DialecticStageRecipeStep = {
    id: 'step-1',
    step_key: 'doc_step',
    step_slug: 'doc-step',
    step_name: 'Doc Step',
    execution_order: 1,
    parallel_group: 1,
    branch_key: 'b1',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    prompt_template_id: null,
    output_type: 'assembled_document_json',
    granularity_strategy: 'per_source_document',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: [
      { document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' },
    ],
  };
  return { ...base, ...overrides };
}

export function mockDialecticStageRecipe(
  overrides: Partial<DialecticStageRecipe> = {},
): DialecticStageRecipe {
  const base: DialecticStageRecipe = {
    stageSlug: 'thesis',
    instanceId: 'inst-1',
    steps: [mockDialecticStageRecipeStep()],
    edges: [],
  };
  return { ...base, ...overrides };
}

export function mockStageRenderedDocumentDescriptor(
  overrides: Partial<StageRenderedDocumentDescriptor> = {},
): StageRenderedDocumentDescriptor {
  const base: StageRenderedDocumentDescriptor = {
    descriptorType: 'rendered',
    status: 'generating',
    job_id: 'job-1',
    latestRenderedResourceId: 'res-1',
    modelId: 'model-1',
    versionHash: 'hash-1',
    lastRenderedResourceId: 'res-1',
    lastRenderAtIso: new Date().toISOString(),
    stepKey: 'doc_step',
    error: null,
  };
  return { ...base, ...overrides };
}

export function mockStagePlannedDocumentDescriptor(
  overrides: Partial<StagePlannedDocumentDescriptor> = {},
): StagePlannedDocumentDescriptor {
  const base: StagePlannedDocumentDescriptor = {
    descriptorType: 'planned',
    status: 'not_started',
    stepKey: 'doc_step',
    modelId: 'model-1',
  };
  return { ...base, ...overrides };
}

export function mockJobProgressDto(
  overrides: Partial<JobProgressDto> = {},
): JobProgressDto {
  const base: JobProgressDto = {
    id: 'job-1',
    status: 'in_progress',
    jobType: 'EXECUTE',
    stepKey: 'doc_step',
    modelId: 'model-1',
    documentKey: 'doc_a',
    parentJobId: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    modelName: 'Model 1',
  };
  return { ...base, ...overrides };
}

export function mockJobProgressEntry(
  overrides: Partial<JobProgressEntry> = {},
): JobProgressEntry {
  const base: JobProgressEntry = {
    totalJobs: 3,
    completedJobs: 2,
    inProgressJobs: 0,
    failedJobs: 0,
  };
  return { ...base, ...overrides };
}

export function mockStageRunProgressSnapshot(
  overrides: Partial<StageRunProgressSnapshot> = {},
): StageRunProgressSnapshot {
  const documentKey = `doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
  const base: StageRunProgressSnapshot = {
    stepStatuses: { doc_step: 'in_progress' },
    documents: {
      [documentKey]: mockStageRenderedDocumentDescriptor(),
    },
    jobProgress: {
      doc_step: mockJobProgressEntry(),
    },
    progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
    jobs: [mockJobProgressDto()],
  };
  return { ...base, ...overrides };
}

export function mockDomainProcessAssociationRow(
  overrides: Partial<DomainProcessAssociationRow> = {},
): DomainProcessAssociationRow {
  const base: DomainProcessAssociationRow = {
    id: 'association-uuid-default',
    domain_id: 'domain-uuid-default',
    process_template_id: 'pt-thesis',
    is_default_for_domain: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T01:00:00.000Z',
  };
  return { ...base, ...overrides };
}

export function mockStageProgressEntry(
  overrides: Partial<StageProgressEntry> = {},
): StageProgressEntry {
  const base: StageProgressEntry = {
    stageSlug: 'thesis',
    status: 'not_started',
    modelCount: 1,
    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
    expectedCount: 0,
    steps: [],
    documents: [],
    jobs: [],
    edges: [],
  };
  return { ...base, ...overrides };
}

export function buildListStageDocumentsPayload(
  overrides: Partial<ListStageDocumentsPayload> = {},
): ListStageDocumentsPayload {
  const base: ListStageDocumentsPayload = {
    sessionId: 'ses-1',
    stageSlug: 'thesis',
    iterationNumber: 1,
    userId: 'user-1',
    projectId: 'proj-1',
  };
  return { ...base, ...overrides };
}

export function buildGetAllStageProgressPayload(
  overrides: Partial<GetAllStageProgressPayload> = {},
): GetAllStageProgressPayload {
  const base: GetAllStageProgressPayload = {
    sessionId: 'ses-1',
    iterationNumber: 1,
    userId: 'user-1',
    projectId: 'proj-1',
  };
  return { ...base, ...overrides };
}

export function buildInitializeMaxOutputTokensResult(
  error?: ApiError,
  skipped?: boolean,
): InitializeMaxOutputTokensResult {
  if (error !== undefined) {
    return { ok: false, error };
  }
  if (skipped === true) {
    return { ok: true, skipped: true };
  }
  return { ok: true };
}

export function mockGetAllStageProgressResponse(
  overrides: Partial<GetAllStageProgressResponse> = {},
): GetAllStageProgressResponse {
  const dagProgress: DagProgressDto = {
    completedStages: 0,
    totalStages: 0,
  };
  const base: GetAllStageProgressResponse = {
    dagProgress,
    stages: [mockStageProgressEntry()],
  };
  return { ...base, ...overrides };
}

export function mockSelectedModel(
  overrides: Partial<SelectedModels> = {},
): SelectedModels {
  const base: SelectedModels = {
    id: 'model-1',
    displayName: 'Model 1',
  };
  return { ...base, ...overrides };
}

export function mockDialecticContribution(
  overrides: Partial<DialecticContribution> = {},
): DialecticContribution {
  const base: DialecticContribution = {
    id: 'contrib-1',
    session_id: 'ses-1',
    user_id: null,
    stage: 'thesis',
    iteration_number: 1,
    model_id: 'model-1',
    model_name: 'Model 1',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: 'business_case',
    file_name: null,
    storage_bucket: null,
    storage_path: null,
    size_bytes: null,
    mime_type: null,
  };
  return { ...base, ...overrides };
}

export function mockDialecticFeedback(
  overrides: Partial<DialecticFeedback> = {},
): DialecticFeedback {
  const base: DialecticFeedback = {
    id: 'fb-1',
    session_id: 'ses-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    stage_slug: 'thesis',
    iteration_number: 1,
    storage_bucket: 'test-bucket',
    storage_path: 'path/to/feedback.md',
    file_name: 'feedback.md',
    mime_type: 'text/markdown',
    size_bytes: 100,
    feedback_type: 'StageReviewSummary_v1',
    resource_description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

export function mockDialecticProjectResource(
  overrides: Partial<DialecticProjectResource> = {},
): DialecticProjectResource {
  const base: DialecticProjectResource = {
    id: 'resource-1',
    project_id: 'proj-1',
    file_name: 'seed_prompt.md',
    storage_path: 'path/to/seed_prompt.md',
    mime_type: 'text/markdown',
    size_bytes: 100,
    resource_description: JSON.stringify({
      type: 'seed_prompt',
      session_id: 'ses-1',
      stage_slug: 'thesis',
      iteration: 1,
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

export function mockAssembledPrompt(
  overrides: Partial<AssembledPrompt> = {},
): AssembledPrompt {
  const base: AssembledPrompt = {
    promptContent: 'Mock seed prompt content',
    source_prompt_resource_id: 'resource-1',
  };
  return { ...base, ...overrides };
}

export function mockDialecticSessionModel(
  overrides: Partial<DialecticSessionModel> = {},
): DialecticSessionModel {
  const base: DialecticSessionModel = {
    id: 'ssm-1',
    session_id: 'ses-1',
    model_id: 'model-1',
    model_role: null,
    created_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

export function mockSession(
  overrides: Partial<DialecticSession> = {},
): DialecticSession {
  const base: DialecticSession = {
    id: 'ses-1',
    project_id: 'proj-1',
    session_description: 'Mock Session',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_models: [mockSelectedModel()],
    status: 'active',
    associated_chat_id: null,
    current_stage_id: 'stage-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_contributions: [],
    dialectic_session_models: [],
    feedback: [],
    viewing_stage_id: 'stage-1',
  };
  return { ...base, ...overrides };
}

export function mockDialecticProcessTemplate(
  overrides: Partial<DialecticProcessTemplate> = {},
): DialecticProcessTemplate {
  const base: DialecticProcessTemplate = {
    id: 'pt-1',
    name: 'Test Template',
    description: 'A test template',
    created_at: new Date().toISOString(),
    starting_stage_id: 'stage-1',
    stages: [
      mockDialecticStage({ id: 'stage-1', slug: 'thesis', display_name: 'Thesis' }),
      mockDialecticStage({ id: 'stage-2', slug: 'antithesis', display_name: 'Antithesis' }),
      mockDialecticStage({ id: 'stage-3', slug: 'synthesis', display_name: 'Synthesis' }),
    ],
    transitions: [
      mockDialecticStageTransition({
        id: 't-1',
        source_stage_id: 'stage-1',
        target_stage_id: 'stage-2',
      }),
      mockDialecticStageTransition({
        id: 't-2',
        source_stage_id: 'stage-2',
        target_stage_id: 'stage-3',
      }),
    ],
  };
  return { ...base, ...overrides };
}

export function mockDialecticProject(
  overrides: Partial<DialecticProject> = {},
): DialecticProject {
  const base: DialecticProject = {
    id: 'proj-1',
    user_id: 'user-1',
    project_name: 'Mock Project',
    initial_user_prompt: 'Initial prompt',
    selected_domain_id: 'dom-1',
    dialectic_domains: { name: 'Domain 1' },
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_sessions: [mockSession()],
    resources: [],
    process_template_id: 'pt-1',
    dialectic_process_templates: mockDialecticProcessTemplate(),
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
  };
  return { ...base, ...overrides };
}

export function mockContributionCacheEntry(
  overrides: Partial<ContributionCacheEntry> = {},
): ContributionCacheEntry {
  const base: ContributionCacheEntry = {
    content: 'Mock contribution content',
    isLoading: false,
    error: null,
    mimeType: 'text/markdown',
    sizeBytes: 100,
    fileName: 'contribution.md',
  };
  return { ...base, ...overrides };
}

export function mockFocusedStageDocumentState(
  overrides: Partial<FocusedStageDocumentState> = {},
): FocusedStageDocumentState {
  const base: FocusedStageDocumentState = {
    modelId: 'model-1',
    documentKey: 'doc_a',
  };
  return { ...base, ...overrides };
}

export function mockStageDocumentContentState(
  overrides: Partial<StageDocumentContentState> = {},
): StageDocumentContentState {
  const base: StageDocumentContentState = {
    baselineMarkdown: '# Baseline',
    currentDraftMarkdown: '# Baseline',
    isDirty: false,
    isLoading: false,
    error: null,
    lastBaselineVersion: null,
    pendingDiff: null,
    lastAppliedVersionHash: null,
    sourceContributionId: null,
    feedbackDraftMarkdown: undefined,
    feedbackIsDirty: false,
    resourceType: 'rendered_document',
  };
  return { ...base, ...overrides };
}

export function mockAiModelConfig(
  overrides: Partial<AiModelExtendedConfig> = {},
): AiModelExtendedConfig {
  const base: AiModelExtendedConfig = {
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    context_window_tokens: 1000,
    hard_cap_output_tokens: 1000,
    provider_max_input_tokens: 1000,
    provider_max_output_tokens: 1000,
    tokenization_strategy: {
      type: 'tiktoken',
      tiktoken_encoding_name: 'cl100k_base',
      is_chatml_model: true,
      api_identifier_for_tokenization: 'model-1',
    },
  };
  return { ...base, ...overrides };
}

export function mockCatalogConfigMissingOutputCap(): Json {
  const config = {
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
    tokenization_strategy: { type: 'tiktoken' },
  };
  if (!isJson(config)) {
    throw new Error('config is not a valid JSON object');
  }
  return config;
}

export function mockAiProvidersRow(
  overrides: Partial<AiProvidersRow> = {},
): AiProvidersRow {

  const config = mockAiModelConfig();
  if(!isJson(config)) {
    throw new Error('config is not a valid JSON object');
  }
  const base: AiProvidersRow = {
    id: 'model-1',
    name: 'Model 1',
    api_identifier: 'model-1',
    provider: 'OpenAI',
    description: 'Model 1',
    is_active: true,
    is_default_generation: false,
    is_default_embedding: false,
    is_enabled: true,
    min_plan_tier_level: 0,
    config: config,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
  return { ...base, ...overrides };
}

export function mockSelectedModelsForCatalog(
    catalog: AiProvidersRow[],
): SelectedModels[] {
  return catalog.map((entry) =>
    mockSelectedModel({ id: entry.id, displayName: entry.name }),
  );
}

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
  activeViewingStage: null,
  activeSessionDetail: null,
  isLoadingActiveSessionDetail: false,
  activeSessionDetailError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  generatingForStageSlug: null,
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
  viewingStageSlug: 'thesis',
  recipesByStageSlug: {},
  dagProgressByRun: {},
  stageRunProgress: {},
  progressHydrationStatus: {},
  focusedStageDocument: {},
  stageDocumentContent: {},
  stageDocumentVersions: {},
  stageDocumentFeedback: {},
  isLoadingStageDocumentFeedback: false,
  stageDocumentFeedbackError: null,
  isSubmittingStageDocumentFeedback: false,
  submitStageDocumentFeedbackError: null,
  activeSeedPrompt: null,
  isInitializingFeedbackDraft: false,
  initializeFeedbackDraftError: null,
  autoStartStep: null,
  isAutoStarting: false,
  autoStartError: null,
  shouldOpenDagProgress: false,
  maxOutputTokens: null,
  outputCapUserCustomized: false,
  selectedDomainProcessAssociation: null,
  isLoadingDomainProcessAssociation: false,
  domainProcessAssociationError: null,
  stageExpectedCountsByRun: {},
  preProjectStageExpectedCounts: null,
  isLoadingStageExpectedCounts: false,
  stageExpectedCountsError: null,
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
        seed: EnsureStageDocumentContentSeed,
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
        sourceContributionId: string | null,
        resourceType: string | null,
      ): void => {
        reapplyDraftToNewBaselineLogic(state, key, newBaseline, newVersion, sourceContributionId, resourceType);
      };

      const initializeOutputCap = async (): Promise<void> => {
        const catalogState: DialecticStateValues = get();
        if (catalogState.modelCatalog.length === 0 && !catalogState.isLoadingModelCatalog) {
          await get().fetchAIModelCatalog();
        }
        const capInitState: DialecticStateValues = get();
        const authState = internalMockAuthStoreGetState();
        const capInitDepsReady: boolean =
          !authState.isLoading
          && authState.userTier !== null
          && !capInitState.isLoadingModelCatalog
          && capInitState.modelCatalog.length > 0
          && !capInitState.outputCapUserCustomized;
        if (!capInitDepsReady) {
          return;
        }
        get().initializeMaxOutputTokens();
      };

      mockFetchAIModelCatalog.mockImplementation(async (): Promise<void> => {
        set({ isLoadingModelCatalog: true, modelCatalogError: null });
        try {
          const response = await api.dialectic().listModelCatalog();
          if (response.error) {
            set({
              modelCatalog: [],
              isLoadingModelCatalog: false,
              modelCatalogError: response.error,
            });
          } else {
            set({
              modelCatalog: response.data || [],
              isLoadingModelCatalog: false,
              modelCatalogError: null,
            });
            await initializeOutputCap();
          }
        } catch (error: unknown) {
          const networkError: ApiError = {
            message:
              error instanceof Error
                ? error.message
                : 'An unknown network error occurred while fetching AI model catalog',
            code: 'NETWORK_ERROR',
          };
          set({
            modelCatalog: [],
            isLoadingModelCatalog: false,
            modelCatalogError: networkError,
          });
        }
      });

      return {
      ...initialDialecticStateValues,
      ...(initialOverrides || {}),
      // Actions - implemented using vi.fn() and using `set` for state changes
      fetchDomains: vi.fn().mockResolvedValue(undefined),
      setSelectedDomain: vi.fn((domain: DialecticDomainRow | null) => set({ selectedDomain: domain })),
      fetchProcessAssociation: vi.fn().mockResolvedValue(undefined),
      fetchStageExpectedCounts: vi.fn().mockResolvedValue(undefined),
      fetchAvailableDomainOverlays: vi.fn().mockResolvedValue(undefined),
      setSelectedStageAssociation: vi.fn((stage: DialecticStage | null) => set({ selectedStageAssociation: stage })),
      setSelectedDomainOverlayId: vi.fn((id: string | null) => set({ selectedDomainOverlayId: id })),
      fetchDialecticProjects: vi.fn().mockResolvedValue(undefined),
      fetchDialecticProjectDetails: vi.fn().mockResolvedValue(undefined), // Tests might override this to use `set`
      fetchProcessTemplate: vi.fn().mockResolvedValue(undefined),
      createDialecticProject: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
      startDialecticSession: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
      updateSessionModels: vi.fn().mockResolvedValue({ data: undefined, error: undefined, status: 200 }),
      fetchAIModelCatalog: mockFetchAIModelCatalog,
      createProjectAndAutoStart: vi.fn().mockResolvedValue({ projectId: '', sessionId: null, hasDefaultModels: false }),
      setShouldOpenDagProgress: vi.fn((open: boolean) => set({ shouldOpenDagProgress: open })),
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
      setMaxOutputTokens: vi.fn((maxTokens: number) =>
        set({ maxOutputTokens: maxTokens, outputCapUserCustomized: true }),
      ),
      initializeMaxOutputTokens: mockInitializeMaxOutputTokens,
      fetchInitialPromptContent: vi.fn().mockResolvedValue(undefined),
      generateContributions: vi.fn().mockResolvedValue({ data: { message: 'ok', contributions: [] }, error: undefined, status: 200 }),
      resumePausedNsfJobs: mockResumePausedNsfJobs,
      pauseActiveJobs: mockPauseActiveJobs,
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

          set((state) => {
            for (const [serializedKey, documentEntry] of Object.entries(state.stageDocumentContent)) {
              const parts = serializedKey.split(':');
              if (parts.length >= 5 && parts[0] === params.sessionId && parts[4] === params.documentKey) {
                documentEntry.sourceContributionId = mockResource.source_contribution_id;
                documentEntry.resourceType = mockResource.resource_type;
                break;
              }
            }
          });
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
        const priorState = get();
        const projectIdChanged: boolean = priorState.activeContextProjectId !== context.projectId;
        const sessionIdChanged: boolean = priorState.activeContextSessionId !== context.sessionId;
        const shouldResetOutputCapState: boolean = projectIdChanged || sessionIdChanged;
        set({
          activeContextProjectId: context.projectId,
          activeContextSessionId: context.sessionId,
          activeContextStage: context.stage,
          ...(context.sessionId === null ? { activeSessionDetail: null, activeSessionDetailError: null } : {}),
          ...(shouldResetOutputCapState
            ? { outputCapUserCustomized: false }
            : {}),
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
      setViewingStage: vi.fn((slug: string | null) => {
        const stages = get().currentProcessTemplate?.stages ?? [];
        const stage = stages.find(s => s.slug === slug) ?? null;
        set({
          activeContextStage: stage,
          viewingStageSlug: slug
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
      _handleContributionGenerationPausedNsf: vi.fn(),
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
      ensureRecipeForViewingStage: vi.fn().mockResolvedValue(undefined),
      fetchStageDocumentFeedback: vi.fn().mockResolvedValue(undefined),
      submitStageDocumentFeedback: vi.fn<[SubmitStageDocumentFeedbackPayload], Promise<ApiResponse<{ success: boolean }>>>()
        .mockImplementation(async (payload: SubmitStageDocumentFeedbackPayload) => {
          const userId = internalMockAuthStoreGetState().user?.id ?? null;
          const storage = typeof window !== 'undefined' ? window.localStorage : null;
          const compositeKey: StageDocumentCompositeKey = {
            sessionId: payload.sessionId,
            stageSlug: payload.stageSlug,
            iterationNumber: payload.iterationNumber,
            modelId: payload.modelId,
            documentKey: payload.documentKey,
          };
          set((state) => {
            flushStageDocumentFeedbackDraftLogic(state, compositeKey, storage, userId);
          });
          return { data: { success: true }, error: undefined, status: 200 };
        }),
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
          const userId = internalMockAuthStoreGetState().user?.id ?? null;
          const storage = typeof window !== 'undefined' ? window.localStorage : null;
          set((state) => {
            recordStageDocumentFeedbackDraftLogic(state, key, feedbackMarkdown, storage, userId);
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
      hydrateStageProgress: vi.fn().mockImplementation(async (payload: ListStageDocumentsPayload) => {
        const progressKey = `${payload.sessionId}:${payload.stageSlug}:${payload.iterationNumber}`;
        set((state) => {
          state.progressHydrationStatus[progressKey] = 'pending';
        });
        try {
          await hydrateStageProgressLogic(set, payload);
          set((state) => {
            state.progressHydrationStatus[progressKey] = 'success';
          });
        } catch (err: unknown) {
          set((state) => {
            state.progressHydrationStatus[progressKey] = 'failed';
          });
          throw err;
        }
      }),
      hydrateAllStageProgress: vi.fn().mockImplementation(async (payload: GetAllStageProgressPayload) => {
        const runKey = `${payload.sessionId}:${payload.iterationNumber}`;
        set((state) => {
          state.progressHydrationStatus[runKey] = 'pending';
        });
        try {
          await hydrateAllStageProgressLogic(set, payload);
          set((state) => {
            state.progressHydrationStatus[runKey] = 'success';
          });
        } catch (err: unknown) {
          set((state) => {
            state.progressHydrationStatus[runKey] = 'failed';
          });
          throw err;
        }
      }),
      setProgressHydrationRunPending: vi.fn().mockImplementation((runKey: string) => {
        set((state) => {
          state.progressHydrationStatus[runKey] = 'pending';
        });
      }),
      resetProgressHydrationStatus: vi.fn().mockImplementation((runKey: string) => {
        set((state) => {
          delete state.progressHydrationStatus[runKey];
        });
      }),
      initializeFeedbackDraft: vi.fn().mockImplementation(
        async (key: StageDocumentCompositeKey) => {
          const userId = internalMockAuthStoreGetState().user?.id ?? null;
          const storage = typeof window !== 'undefined' ? window.localStorage : null;
          await initializeFeedbackDraftLogic(get, set, key, storage, userId);
        },
      ),
      resetSubmitStageDocumentFeedbackError: vi.fn(() => set({ submitStageDocumentFeedbackError: null })),
      regenerateDocument: vi.fn().mockResolvedValue({ data: { jobIds: [] }, error: undefined, status: 200 }),
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
  mockFetchAIModelCatalog.mockClear();
  // Create a new store instance. This effectively resets all state and action mocks to their vi.fn() definitions.
  actualMockStore = createActualMockStore(initialStateOverrides);

  // If tests also rely on global selector mocks, reset them here.
  // Ensure that selectors converted to actual functions are NOT reset as vi.fn()
  selectIsStageReadyForSessionIteration.mockClear().mockReturnValue(false);
  selectFeedbackForStageIteration.mockClear().mockReturnValue(null);
  selectStageHasUnsavedChanges.mockClear().mockReturnValue({ hasUnsavedEdits: false, hasUnsavedFeedback: false });
  selectSelectedModels.mockClear().mockReturnValue([]);
  selectDefaultGenerationModels.mockClear().mockReturnValue([]);
  selectOverlay.mockClear();

  // Resetting specific action mocks (ensure all relevant actions are included if needed for global mock state)
  mockActivateProjectAndSessionContextForDeepLink.mockClear();
  mockFetchAndSetCurrentSessionDetails.mockClear();
  mockInitializeMaxOutputTokens.mockClear().mockReturnValue({ ok: true });
};

// 8. Reset Function for tests (full reset)
export const resetDialecticStoreMock = () => {
  initializeMockDialecticState(); // This creates a new store with fresh state and action mocks

  // Clear any top-level thunk mocks that are not part of the store's state
  mockActivateProjectAndSessionContextForDeepLink.mockClear();
  mockFetchAndSetCurrentSessionDetails.mockClear();
  mockInitializeMaxOutputTokens.mockClear().mockReturnValue({ ok: true });
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
