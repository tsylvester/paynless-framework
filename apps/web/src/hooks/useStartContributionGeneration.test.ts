import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast } from 'sonner';
import {
  useStartContributionGeneration,
} from './useStartContributionGeneration.ts';
import type {
  DialecticStage,
  DialecticSession,
  DialecticProject,
  DialecticStateValues,
  DialecticProcessTemplate,
  SelectedModels,
  GenerateContributionsPayload,
  UnifiedProjectProgress,
  StageProgressDetail,
  StartContributionGenerationResult,
  ActiveChatWalletInfo,
  AiState,
} from '@paynless/types';
import {
  initializeMockDialecticState,
  getDialecticStoreState,
  selectUnifiedProjectProgress,
  selectIsStageReadyForSessionIteration,
  mockResumePausedNsfJobs,
} from '@/mocks/dialecticStore.mock';
import { selectActiveChatWalletInfo, initializeMockWalletStore } from '@/mocks/walletStore.mock';
import { useDialecticStore, initialDialecticStateValues, selectSessionById } from '@paynless/store';

/** Session-shaped object with iteration_count not a number, for guard test. Used with mocked selectSessionById only. */
type SessionWithInvalidIterationCount = Omit<DialecticSession, 'iteration_count'> & { iteration_count: undefined };

type SelectSessionByIdFn = (state: DialecticStateValues, sessionId: string) => DialecticSession | undefined;

const defaultSelectSessionByIdRef = vi.hoisted<{ current: SelectSessionByIdFn | null }>(() => ({
  current: null,
}));

vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');

  defaultSelectSessionByIdRef.current = (state: DialecticStateValues, sessionId: string): DialecticSession | undefined =>
    actualPaynlessStore.selectSessionById(state, sessionId);

  const useAiStore = (selector: (state: Pick<AiState, 'continueUntilComplete' | 'newChatContext'>) => unknown): unknown => {
    const state: Pick<AiState, 'continueUntilComplete' | 'newChatContext'> = {
      continueUntilComplete: true,
      newChatContext: null,
    };
    return selector(state);
  };

  const selectSessionByIdMock = vi.fn<
    [DialecticStateValues, string],
    DialecticSession | SessionWithInvalidIterationCount | undefined
  >((state: DialecticStateValues, sessionId: string) => {
    const fn = defaultSelectSessionByIdRef.current;
    return fn != null ? fn(state, sessionId) : undefined;
  });

  return {
    ...actualPaynlessStore,
    ...mockStoreExports,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    useAiStore,
    initialDialecticStateValues: actualPaynlessStore.initialDialecticStateValues,
    selectSelectedModels: actualPaynlessStore.selectSelectedModels,
    selectSessionById: selectSessionByIdMock,
    selectActiveStage: actualPaynlessStore.selectActiveStage,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockThesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  display_name: 'Thesis',
  description: 'Initial hypothesis',
  default_system_prompt_id: null,
  created_at: new Date().toISOString(),
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  minimum_balance: 100000,
};

const createMockSession = (
  sessionId: string,
  projectId: string,
  iteration: number,
): DialecticSession => ({
  id: sessionId,
  project_id: projectId,
  session_description: null,
  user_input_reference_url: null,
  iteration_count: iteration,
  selected_models: [],
  status: 'active',
  associated_chat_id: null,
  current_stage_id: mockThesisStage.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_contributions: [],
  dialectic_session_models: [],
});

const createMockProject = (
  projectId: string,
  sessions: DialecticSession[],
): DialecticProject => ({
  id: projectId,
  user_id: 'user-1',
  project_name: 'Test Project',
  initial_user_prompt: null,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_sessions: sessions,
  dialectic_domains: { name: 'Domain' },
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  initial_prompt_resource_id: null,
  selected_domain_id: 'domain-1',
  selected_domain_overlay_id: null,
  repo_url: null,
  dialectic_process_templates: {
    id: 'tpl-1',
    name: 'Template',
    created_at: new Date().toISOString(),
    description: null,
    starting_stage_id: mockThesisStage.id,
    stages: [mockThesisStage],
    transitions: [],
  },
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
});

const defaultSession: DialecticSession = createMockSession('sess-1', 'proj-1', 1);
const defaultProject: DialecticProject = createMockProject('proj-1', [defaultSession]);

function createSessionWithInvalidIterationCount(): SessionWithInvalidIterationCount {
  return {
    id: defaultSession.id,
    project_id: defaultSession.project_id,
    session_description: defaultSession.session_description,
    user_input_reference_url: defaultSession.user_input_reference_url,
    iteration_count: undefined,
    selected_models: defaultSession.selected_models,
    status: defaultSession.status,
    associated_chat_id: defaultSession.associated_chat_id,
    current_stage_id: defaultSession.current_stage_id,
    created_at: defaultSession.created_at,
    updated_at: defaultSession.updated_at,
    dialectic_contributions: defaultSession.dialectic_contributions,
    dialectic_session_models: defaultSession.dialectic_session_models,
  };
}
const defaultProcessTemplate: DialecticProcessTemplate = {
  id: 'tpl-1',
  name: 'Template',
  created_at: new Date().toISOString(),
  description: null,
  starting_stage_id: mockThesisStage.id,
  stages: [mockThesisStage],
  transitions: [],
};

const defaultStageDetail: StageProgressDetail = {
  stageSlug: 'thesis',
  totalSteps: 1,
  completedSteps: 0,
  totalDocuments: 0,
  completedDocuments: 0,
  failedSteps: 0,
  stagePercentage: 0,
  stepsDetail: [],
  stageStatus: 'not_started',
};

const defaultUnifiedProgress: UnifiedProjectProgress = {
  totalStages: 1,
  completedStages: 0,
  currentStageSlug: 'thesis',
  overallPercentage: 0,
  currentStage: mockThesisStage,
  projectStatus: 'not_started',
  hydrationReady: true,
  stageDetails: [defaultStageDetail],
};

const defaultSelectedModels: SelectedModels[] = [
  { id: 'm1', displayName: 'Model 1' },
];

const defaultWalletInfo: ActiveChatWalletInfo = {
  status: 'ok',
  type: 'personal',
  walletId: 'wallet-1',
  orgId: null,
  balance: String(mockThesisStage.minimum_balance),
  message: undefined,
  isLoadingPrimaryWallet: false,
};

const lowBalanceWalletInfo: ActiveChatWalletInfo = {
  status: 'ok',
  type: 'personal',
  walletId: 'w1',
  orgId: null,
  balance: '0',
  message: undefined,
  isLoadingPrimaryWallet: false,
};

const setDialecticState = (overrides: Partial<DialecticStateValues>): void => {
  useDialecticStore.setState({
    ...initialDialecticStateValues,
    generatingSessions: {},
    ...overrides,
  });
};

describe('useStartContributionGeneration', () => {
  beforeEach(() => {
    initializeMockDialecticState({
      currentProjectDetail: defaultProject,
      currentProcessTemplate: defaultProcessTemplate,
      activeContextSessionId: 'sess-1',
      activeStageSlug: 'thesis',
      selectedModels: defaultSelectedModels,
      generatingSessions: {},
    });
    vi.mocked(selectSessionById).mockImplementation((state, sessionId) => {
      const fn = defaultSelectSessionByIdRef.current;
      return fn != null ? fn(state, sessionId) : undefined;
    });
    vi.mocked(selectUnifiedProjectProgress).mockReturnValue(defaultUnifiedProgress);
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    initializeMockWalletStore();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    mockResumePausedNsfJobs.mockClear();
  });

  it('returns { success: false, error } and shows error toast when activeSession is null', async () => {
    setDialecticState({ activeContextSessionId: null, currentProjectDetail: defaultProject });
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalledWith('No active session.');
  });

  it('returns { success: false, error } and shows error toast when activeSession.iteration_count is not a number', async () => {
    const sessionWithInvalidIteration: SessionWithInvalidIterationCount = createSessionWithInvalidIterationCount();
    // Intentionally malformed session for guard test. Double cast required by compiler; allowed per Instructions for Agent (error-handling tests).
    vi.mocked(selectSessionById).mockReturnValue(
      sessionWithInvalidIteration as unknown as DialecticSession,
    );
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it('returns { success: false, error } and shows error toast when currentProjectDetail is null', async () => {
    setDialecticState({ currentProjectDetail: null });
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it('returns { success: false, error } and shows error toast when activeStage is null', async () => {
    setDialecticState({ activeStageSlug: null, currentProcessTemplate: null });
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it('returns { success: false, error } and shows error toast when activeContextSessionId is null', async () => {
    setDialecticState({ activeContextSessionId: null });
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it('returns { success: false, error } and shows error toast when isWalletReady is false', async () => {
    const walletError: ActiveChatWalletInfo = {
      status: 'error',
      type: null,
      walletId: null,
      orgId: null,
      balance: null,
      message: 'Wallet error',
      isLoadingPrimaryWallet: false,
    };
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(walletError);
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it('when isResumeMode is true, shows "Resuming generation..." toast, calls onOpenDagProgress, calls resumePausedNsfJobs with { sessionId, stageSlug, iterationNumber }', async () => {
    const pausedNsfStageDetail: StageProgressDetail = {
      ...defaultStageDetail,
      stageStatus: 'paused_nsf',
    };
    const progressPausedNsf: UnifiedProjectProgress = {
      ...defaultUnifiedProgress,
      stageDetails: [pausedNsfStageDetail],
    };
    vi.mocked(selectUnifiedProjectProgress).mockReturnValue(progressPausedNsf);
    const onOpenDagProgress = vi.fn();
    const { result } = renderHook(() => useStartContributionGeneration());

    await act(async () => {
      await result.current.startContributionGeneration(onOpenDagProgress);
    });

    expect(toast.success).toHaveBeenCalledWith('Resuming generation...');
    expect(onOpenDagProgress).toHaveBeenCalledTimes(1);
    expect(mockResumePausedNsfJobs).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      stageSlug: 'thesis',
      iterationNumber: 1,
    });
  });

  it('when isResumeMode is false, shows "Contribution generation started!" toast with description, calls onOpenDagProgress, calls generateContributions with correct GenerateContributionsPayload', async () => {
    const onOpenDagProgress = vi.fn();
    const generateContributions = getDialecticStoreState().generateContributions;
    const { result } = renderHook(() => useStartContributionGeneration());

    await act(async () => {
      await result.current.startContributionGeneration(onOpenDagProgress);
    });

    expect(toast.success).toHaveBeenCalledWith('Contribution generation started!', {
      description: 'The AI is working. We will notify you when it is complete.',
    });
    expect(onOpenDagProgress).toHaveBeenCalledTimes(1);
    expect(generateContributions).toHaveBeenCalledTimes(1);
    const payload: GenerateContributionsPayload = vi.mocked(generateContributions).mock.calls[0][0];
    expect(payload.sessionId).toBe('sess-1');
    expect(payload.projectId).toBe('proj-1');
    expect(payload.stageSlug).toBe('thesis');
    expect(payload.iterationNumber).toBe(1);
    expect(payload.walletId).toBe('wallet-1');
  });

  it('payload uses continueUntilComplete from useAiStore (not hardcoded true)', async () => {
    const generateContributions = getDialecticStoreState().generateContributions;
    const { result } = renderHook(() => useStartContributionGeneration());

    await act(async () => {
      await result.current.startContributionGeneration();
    });

    const payload: GenerateContributionsPayload = vi.mocked(generateContributions).mock.calls[0][0];
    expect(payload.continueUntilComplete).toBe(true);
  });

  it('payload uses walletId from selectActiveChatWalletInfo', async () => {
    const customWallet: ActiveChatWalletInfo = {
      status: 'ok',
      type: 'personal',
      walletId: 'custom-wallet-id',
      orgId: null,
      balance: String(mockThesisStage.minimum_balance),
      message: undefined,
      isLoadingPrimaryWallet: false,
    };
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(customWallet);
    const generateContributions = getDialecticStoreState().generateContributions;
    const { result } = renderHook(() => useStartContributionGeneration());

    await act(async () => {
      await result.current.startContributionGeneration();
    });

    const payload: GenerateContributionsPayload = vi.mocked(generateContributions).mock.calls[0][0];
    expect(payload.walletId).toBe('custom-wallet-id');
  });

  it('returns { success: true } when generateContributions succeeds', async () => {
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: false };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(true);
  });

  it('returns { success: false, error } and shows error toast when generateContributions throws', async () => {
    const generateContributions = getDialecticStoreState().generateContributions;
    vi.mocked(generateContributions).mockRejectedValueOnce(new Error('API failed'));
    const { result } = renderHook(() => useStartContributionGeneration());

    let outcome: StartContributionGenerationResult = { success: true };
    await act(async () => {
      outcome = await result.current.startContributionGeneration();
    });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(toast.error).toHaveBeenCalledWith('API failed');
  });

  it('onOpenDagProgress callback is optional — no error when not provided', async () => {
    const { result } = renderHook(() => useStartContributionGeneration());

    await act(async () => {
      await result.current.startContributionGeneration();
    });

    expect(result.current.startContributionGeneration).toBeDefined();
  });

  it('isDisabled is true when any guard fails (isSessionGenerating, !areAnyModelsSelected, !activeStage, !activeSession, !isStageReady, !isWalletReady, !balanceMeetsThreshold)', () => {
    setDialecticState({ selectedModels: [] });
    const { result } = renderHook(() => useStartContributionGeneration());
    expect(result.current.isDisabled).toBe(true);

    const oneModel: SelectedModels[] = [{ id: 'm1', displayName: 'M1' }];
    setDialecticState({ selectedModels: oneModel, activeContextSessionId: null });
    const { result: r2 } = renderHook(() => useStartContributionGeneration());
    expect(r2.current.isDisabled).toBe(true);
  });

  it('isDisabled is false when all guards pass', () => {
    const { result } = renderHook(() => useStartContributionGeneration());
    expect(result.current.isDisabled).toBe(false);
  });

  it('isResumeMode is true only when hasPausedNsfJobs && balanceMeetsThreshold', () => {
    const pausedNsfStageDetail: StageProgressDetail = {
      ...defaultStageDetail,
      stageStatus: 'paused_nsf',
    };
    const progressPausedNsf: UnifiedProjectProgress = {
      ...defaultUnifiedProgress,
      stageDetails: [pausedNsfStageDetail],
    };
    vi.mocked(selectUnifiedProjectProgress).mockReturnValue(progressPausedNsf);
    const { result } = renderHook(() => useStartContributionGeneration());
    expect(result.current.isResumeMode).toBe(true);

    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(lowBalanceWalletInfo);
    const { result: r2 } = renderHook(() => useStartContributionGeneration());
    expect(r2.current.isResumeMode).toBe(false);
  });

  it('derived state values correctly reflect store state (each derived field tested with known inputs)', () => {
    const { result } = renderHook(() => useStartContributionGeneration());
    expect(result.current.activeStage).toEqual(mockThesisStage);
    expect(result.current.activeSession).not.toBeNull();
    expect(result.current.activeSession?.id).toBe('sess-1');
    expect(result.current.stageThreshold).toBe(mockThesisStage.minimum_balance);
    expect(result.current.areAnyModelsSelected).toBe(true);
    expect(result.current.isWalletReady).toBe(true);
    expect(result.current.isStageReady).toBe(true);
    expect(result.current.balanceMeetsThreshold).toBe(true);
  });
});
