import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenerateContributionButton } from './GenerateContributionButton';
import type {
  ApiError,
  DialecticStage,
  DialecticContribution,
  DialecticProject,
  DialecticSession,
  DialecticStateValues,
  SelectedModels,
  StageProgressDetail,
  UnifiedProjectProgress,
  StageDAGProgressDialogProps,
  UseStartContributionGenerationReturn,
} from '@paynless/types';
import {
  initializeMockDialecticState,
  getDialecticStoreState,
  mockResumePausedNsfJobs,
  selectUnifiedProjectProgress,
  setDialecticStateValues,
} from '@/mocks/dialecticStore.mock';
import { selectActiveChatWalletInfo } from '@/mocks/walletStore.mock';
import { selectIsStageReadyForSessionIteration } from '@paynless/store';

const mockUseStartContributionGeneration = vi.fn<[], UseStartContributionGenerationReturn>();

vi.mock('@/hooks/useStartContributionGeneration', () => ({
  useStartContributionGeneration: () => mockUseStartContributionGeneration(),
}));

const mockThesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  display_name: 'Proposal',
  description: 'Initial hypothesis generation',
  default_system_prompt_id: 'prompt-1',
  created_at: new Date().toISOString(),
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  minimum_balance: 200000,
};

const oneSelectedModel: SelectedModels[] = [{ id: 'model-1', displayName: 'Model 1' }];

function createMockProject(
  projectId: string,
  sessions: DialecticSession[] = [],
  stages: DialecticStage[] = [mockThesisStage]
): DialecticProject {
  return {
    id: projectId,
    user_id: `user-${projectId}`,
    project_name: `${projectId} Name`,
    initial_user_prompt: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_sessions: sessions,
    dialectic_domains: { name: 'Domain 1' },
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    initial_prompt_resource_id: null,
    selected_domain_id: `domain-${projectId}`,
    selected_domain_overlay_id: null,
    repo_url: null,
    dialectic_process_templates: {
      name: 'Process Template 1',
      created_at: new Date().toISOString(),
      description: 'Description 1',
      id: 'process-template-1',
      starting_stage_id: 'stage-1',
      stages,
    },
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
  };
}

function createMockSession(
  sessionId: string,
  projectId: string,
  iteration: number,
  contributions: DialecticContribution[] = []
): DialecticSession {
  return {
    id: sessionId,
    project_id: projectId,
    session_description: `Session ${sessionId}`,
    user_input_reference_url: null,
    iteration_count: iteration,
    selected_models: [],
    status: 'active',
    associated_chat_id: null,
    current_stage_id: mockThesisStage.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_contributions: contributions,
    dialectic_session_models: [],
    viewing_stage_id: 'stage-1',
  };
}

function buildUnifiedProgress(thesisStageStatus: 'paused_nsf' | 'not_started' | 'in_progress' | 'completed'): UnifiedProjectProgress {
  const thesisDetail: StageProgressDetail = {
    stageSlug: 'thesis',
    totalSteps: 2,
    completedSteps: 0,
    totalDocuments: 0,
    completedDocuments: 0,
    failedSteps: 0,
    stagePercentage: 0,
    stepsDetail: [],
    stageStatus: thesisStageStatus,
  };
  return {
    totalStages: 1,
    completedStages: 0,
    currentStageSlug: 'thesis',
    overallPercentage: 0,
    currentStage: mockThesisStage,
    projectStatus: thesisStageStatus,
    hydrationReady: true,
    stageDetails: [thesisDetail],
  };
}

function getDefaultHookReturn(
  overrides: Partial<UseStartContributionGenerationReturn> = {}
): UseStartContributionGenerationReturn {
  const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
  return {
    startContributionGeneration: vi.fn().mockResolvedValue({ success: true }),
    isDisabled: false,
    isResumeMode: false,
    isSessionGenerating: false,
    isWalletReady: true,
    isStageReady: true,
    balanceMeetsThreshold: true,
    areAnyModelsSelected: true,
    hasPausedNsfJobs: false,
    hasPausedUserJobs: false,
    isPauseMode: false,
    pauseGeneration: vi.fn().mockResolvedValue(undefined),
    didGenerationFail: false,
    contributionsForStageAndIterationExist: false,
    showBalanceCallout: false,
    viewingStage: mockThesisStage,
    activeSession: defaultSession,
    stageCeiling: 200000,
    projectCeiling: 400000,
    stageBalanceShortfall: null,
    isCostEstimateKnown: true,
    isCostEstimateLoading: false,
    showCostEstimateBlocked: false,
    costCeilingError: null,
    showStageCostEstimate: true,
    isViewingAheadOfCurrentStage: false,
    viewingAheadReason: null,
    ...overrides,
  };
}

vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');

  const selectViewingStage = (state: DialecticStateValues): DialecticStage | null => {
    const { currentProjectDetail, viewingStageSlug } = state;
    if (!currentProjectDetail?.dialectic_process_templates?.stages || !viewingStageSlug) return null;
    return currentProjectDetail.dialectic_process_templates.stages.find((s: DialecticStage) => s.slug === viewingStageSlug) ?? null;
  };

  const useAiStore = (selector: (state: { continueUntilComplete: boolean; newChatContext: string | null }) => unknown) =>
    selector({ continueUntilComplete: false, newChatContext: 'personal' });

  return {
    ...mockStoreExports,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    useAiStore,
    initialDialecticStateValues: actualPaynlessStore.initialDialecticStateValues,
    initialWalletStateValues: actualPaynlessStore.initialWalletStateValues,
    selectSessionById: actualPaynlessStore.selectSessionById,
    selectSelectedModels: actualPaynlessStore.selectSelectedModels,
    selectViewingStage,
    selectIsStageReadyForSessionIteration: vi.fn(),
    selectUnifiedProjectProgress: mockStoreExports.selectUnifiedProjectProgress,
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./StageDAGProgressDialog', async () => {
  const React = await import('react');
  const mockImpl = vi.fn((props: StageDAGProgressDialogProps) =>
    props.open
      ? React.createElement('div', {
          'data-testid': 'stage-dag-progress-dialog',
          'data-stage-slug': props.stageSlug,
          'data-session-id': props.sessionId,
          'data-iteration-number': String(props.iterationNumber),
        })
      : null
  );
  return { StageDAGProgressDialog: mockImpl };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    ),
  });
}

describe('GenerateContributionButton NSF', () => {
  const sessionId = 'test-session-id';
  const projectId = 'test-project-id';
  const iterationNumber = 1;

  beforeEach(() => {
    initializeMockDialecticState();
    mockResumePausedNsfJobs.mockClear();
    vi.mocked(selectUnifiedProjectProgress).mockClear();
    vi.mocked(selectActiveChatWalletInfo).mockClear();
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);

    const defaultSession = createMockSession(sessionId, projectId, iterationNumber);
    const defaultProject = createMockProject(projectId, [defaultSession]);
    setDialecticStateValues({
      selectedModels: oneSelectedModel,
      currentProjectDetail: defaultProject,
      activeContextSessionId: sessionId,
      viewingStageSlug: 'thesis',
      contributionGenerationStatus: 'idle',
    });

    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'wallet-id',
      orgId: null,
      balance: '300000',
      isLoadingPrimaryWallet: false,
    });

    vi.mocked(selectUnifiedProjectProgress).mockImplementation((_state: DialecticStateValues, sid: string) =>
      sid === sessionId ? buildUnifiedProgress('not_started') : buildUnifiedProgress('not_started')
    );

    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('when stage balance is below stageCeiling and active stage is NOT paused_nsf, button is disabled and shows "Insufficient Balance"', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isDisabled: true,
        isCostEstimateKnown: true,
        balanceMeetsThreshold: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Insufficient Balance/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('when balance is below stageCeiling, balance callout is present with shortfall copy and links to /subscription?tab=top-up', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isCostEstimateKnown: true,
        showCostEstimateBlocked: false,
        stageBalanceShortfall: 50000,
        showBalanceCallout: true,
        balanceMeetsThreshold: false,
        isDisabled: true,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByTestId('generate-button-balance-callout')).toBeDefined();
    expect(screen.getByText(/Insufficient tokens/i)).toBeDefined();
    const topUpLink = screen.getByRole('link', { name: /Top up 50,000/i });
    expect(topUpLink.getAttribute('href')).toBe('/subscription?tab=top-up');
    expect(screen.queryByTestId('generate-button-no-estimate-callout')).toBeNull();
    expect(screen.queryByTestId('generate-button-estimate-error-callout')).toBeNull();
  });

  it('when balance is below stageCeiling and stage is paused_nsf, balance callout is present with shortfall copy and links to /subscription?tab=top-up', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isCostEstimateKnown: true,
        showCostEstimateBlocked: false,
        stageBalanceShortfall: 50000,
        showBalanceCallout: true,
        balanceMeetsThreshold: false,
        hasPausedNsfJobs: true,
        isDisabled: true,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByTestId('generate-button-balance-callout')).toBeDefined();
    expect(screen.getByText(/Insufficient tokens/i)).toBeDefined();
    const topUpLink = screen.getByRole('link', { name: /Top up 50,000/i });
    expect(topUpLink.getAttribute('href')).toBe('/subscription?tab=top-up');
  });

  it('when balance meets threshold, balance callout is not present', () => {
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('generate-button-balance-callout')).toBeNull();
  });

  it('when activeWalletInfo.balance meets stageCeiling and active stage is NOT paused_nsf, button is enabled and shows "Generate {displayName}"', () => {
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Generate Proposal/i })).toBeDefined();
  });

  it('when active stage stageStatus is paused_nsf and balance is below stageCeiling, button is disabled and shows "Insufficient Balance"', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isDisabled: true,
        isCostEstimateKnown: true,
        hasPausedNsfJobs: true,
        balanceMeetsThreshold: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Insufficient Balance/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('when active stage stageStatus is paused_nsf and balance meets threshold, button is enabled and shows "Resume {displayName}"', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isResumeMode: true, hasPausedNsfJobs: true, balanceMeetsThreshold: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Resume Proposal/i })).toBeDefined();
  });

  it('clicking "Resume {displayName}" calls resumePausedNsfJobs with sessionId, stageSlug, iterationNumber and does not call generateContributions', async () => {
    const startContributionGeneration = vi.fn().mockImplementation((cb: (() => void) | undefined) => {
      mockResumePausedNsfJobs({ sessionId, stageSlug: 'thesis', iterationNumber });
      cb?.();
      return Promise.resolve({ success: true });
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isResumeMode: true, hasPausedNsfJobs: true, startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Resume Proposal/i });
    await user.click(button);
    await waitFor(() => {
      expect(mockResumePausedNsfJobs).toHaveBeenCalledTimes(1);
      expect(mockResumePausedNsfJobs).toHaveBeenCalledWith({
        sessionId,
        stageSlug: 'thesis',
        iterationNumber,
      });
    });
    expect(getDialecticStoreState().generateContributions).not.toHaveBeenCalled();
  });

  it('clicking "Generate {displayName}" calls generateContributions and does not call resumePausedNsfJobs', async () => {
    const store = getDialecticStoreState();
    vi.mocked(store.generateContributions).mockResolvedValue({
      data: { job_ids: [], sessionId, projectId, stage: 'thesis', iteration: 1, status: 'generating', successfulContributions: [], failedAttempts: [] },
      status: 202,
    });
    const startContributionGeneration = vi.fn().mockImplementation((cb: (() => void) | undefined) => {
      store.generateContributions({
        sessionId,
        projectId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        walletId: 'wallet-id',
        continueUntilComplete: false,
        idempotencyKey: '123',
      });
      cb?.();
      return Promise.resolve({ success: true });
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Generate Proposal/i });
    await user.click(button);
    await waitFor(() => {
      expect(store.generateContributions).toHaveBeenCalledTimes(1);
    });
    expect(mockResumePausedNsfJobs).not.toHaveBeenCalled();
  });

  it('clicking Resume opens StageDAGProgressDialog so user can monitor resumed generation', async () => {
    const startContributionGeneration = vi.fn().mockImplementation((cb: (() => void) | undefined) => {
      cb?.();
      return Promise.resolve({ success: true });
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isResumeMode: true, hasPausedNsfJobs: true, startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('stage-dag-progress-dialog')).toBeNull();
    const button = screen.getByRole('button', { name: /Resume Proposal/i });
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeDefined();
    });
  });

  it('button state priority: isSessionGenerating overrides paused_nsf and balance', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isSessionGenerating: true, isPauseMode: true, isDisabled: false })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Pause Proposal/i });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('when showStageCostEstimate is true and stageCeiling is 120000, stage cost estimate callout shows formatted ceiling', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        showStageCostEstimate: true,
        stageCeiling: 120000,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByTestId('generate-button-stage-cost-estimate')).toBeDefined();
    expect(screen.getByText(/Estimated cost for this stage/i)).toBeDefined();
    expect(screen.getByText(/120,000/)).toBeDefined();
  });

  it('when projectCeiling exceeds wallet balance, project balance callout is present with shortfall and top-up link', () => {
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'wallet-id',
      orgId: null,
      balance: '300000',
      isLoadingPrimaryWallet: false,
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isCostEstimateKnown: true,
        projectCeiling: 500000,
        balanceMeetsThreshold: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByTestId('generate-button-project-balance-callout')).toBeDefined();
    const topUpLink = screen.getByRole('link', { name: /Top up 200,000/i });
    expect(topUpLink.getAttribute('href')).toBe('/subscription?tab=top-up');
    expect(screen.getByRole('button', { name: /Generate Proposal/i }).hasAttribute('disabled')).toBe(false);
  });

  it('when projectCeiling is null, isCostEstimateKnown is false, or wallet meets projectCeiling, project balance callout is absent', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ projectCeiling: null })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('generate-button-project-balance-callout')).toBeNull();

    const outputCapNotInitializedError: ApiError = {
      code: 'OUTPUT_CAP_NOT_INITIALIZED',
      message: 'Output cap is not initialized in dialectic store.',
    };
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isCostEstimateLoading: false,
        isCostEstimateKnown: false,
        projectCeiling: 500000,
        showCostEstimateBlocked: true,
        costCeilingError: outputCapNotInitializedError,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('generate-button-project-balance-callout')).toBeNull();

    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'wallet-id',
      orgId: null,
      balance: '500000',
      isLoadingPrimaryWallet: false,
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isCostEstimateKnown: true,
        projectCeiling: 500000,
        balanceMeetsThreshold: true,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('generate-button-project-balance-callout')).toBeNull();
  });

  it('when cost estimate failed, button is disabled with "Estimate Failed" and estimate-error callout shows error message', () => {
    const costCeilingError: ApiError = {
      code: 'INVALID_PAYLOAD',
      message: 'Invalid payload',
    };
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isCostEstimateLoading: false,
        isCostEstimateKnown: false,
        showCostEstimateBlocked: true,
        costCeilingError,
        isDisabled: true,
        stageCeiling: null,
        showStageCostEstimate: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Estimate Failed/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('generate-button-estimate-error-callout')).toBeDefined();
    expect(screen.getByText(/Invalid payload/i)).toBeDefined();
    expect(screen.queryByTestId('generate-button-no-estimate-callout')).toBeNull();
    expect(screen.queryByTestId('generate-button-estimate-loading-notice')).toBeNull();
    expect(screen.queryByTestId('generate-button-balance-callout')).toBeNull();
  });

  it('when paused_nsf and cost estimate is blocked, resume control is disabled and click does not invoke startContributionGeneration', async () => {
    const startContributionGeneration = vi.fn().mockResolvedValue({ success: true });
    const outputCapNotInitializedError: ApiError = {
      code: 'OUTPUT_CAP_NOT_INITIALIZED',
      message: 'Output cap is not initialized in dialectic store.',
    };
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        hasPausedNsfJobs: true,
        isCostEstimateLoading: false,
        showCostEstimateBlocked: true,
        isCostEstimateKnown: false,
        costCeilingError: outputCapNotInitializedError,
        isDisabled: true,
        stageCeiling: null,
      })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Estimate Failed/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('generate-button-estimate-error-callout')).toBeDefined();
    expect(screen.getByTestId('generate-button-estimate-error-callout').textContent).toBe(
      outputCapNotInitializedError.message,
    );
    expect(screen.queryByTestId('generate-button-no-estimate-callout')).toBeNull();
    await user.click(button);
    expect(startContributionGeneration).not.toHaveBeenCalled();
  });
});
