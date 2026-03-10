import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenerateContributionButton } from './GenerateContributionButton';
import type {
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
    didGenerationFail: false,
    contributionsForStageAndIterationExist: false,
    showBalanceCallout: false,
    activeStage: mockThesisStage,
    activeSession: defaultSession,
    stageThreshold: mockThesisStage.minimum_balance,
    ...overrides,
  };
}

vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');

  const selectActiveStage = (state: DialecticStateValues): DialecticStage | null => {
    const { currentProjectDetail, activeStageSlug } = state;
    if (!currentProjectDetail?.dialectic_process_templates?.stages || !activeStageSlug) return null;
    return currentProjectDetail.dialectic_process_templates.stages.find((s: DialecticStage) => s.slug === activeStageSlug) ?? null;
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
    selectActiveStage,
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
      activeStageSlug: 'thesis',
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

  it('when activeWalletInfo.balance is below stage minimum_balance and active stage is NOT paused_nsf, button is disabled and shows "Insufficient Balance"', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isDisabled: true, balanceMeetsThreshold: false })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent(/Insufficient Balance/i);
  });

  it('when balance is below threshold, balance callout is present with minimum tokens and stage name and links to /subscription', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ showBalanceCallout: true, balanceMeetsThreshold: false })
    );
    renderWithRouter(<GenerateContributionButton />);
    const callout = screen.getByTestId('generate-button-balance-callout');
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent(/Minimum.*200,000.*token balance.*Proposal/i);
    const link = callout.querySelector('a[href="/subscription"]');
    expect(link).toBeInTheDocument();
  });

  it('when balance is below threshold and stage is paused_nsf, balance callout is present and links to /subscription', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ showBalanceCallout: true, balanceMeetsThreshold: false, hasPausedNsfJobs: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    const callout = screen.getByTestId('generate-button-balance-callout');
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent(/Minimum.*200,000.*token balance.*Proposal/i);
    const link = callout.querySelector('a[href="/subscription"]');
    expect(link).toBeInTheDocument();
  });

  it('when balance meets threshold, balance callout is not present', () => {
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('generate-button-balance-callout')).not.toBeInTheDocument();
  });

  it('when activeWalletInfo.balance meets threshold and active stage is NOT paused_nsf, button is enabled and shows "Generate {displayName}"', () => {
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Generate Proposal/i })).toBeInTheDocument();
  });

  it('when active stage stageStatus is paused_nsf and balance is below threshold, button is disabled and shows "Resume" so user knows they are resuming', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isDisabled: true, hasPausedNsfJobs: true, balanceMeetsThreshold: false })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent(/Resume Proposal/i);
  });

  it('when active stage stageStatus is paused_nsf and balance meets threshold, button is enabled and shows "Resume {displayName}"', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isResumeMode: true, hasPausedNsfJobs: true, balanceMeetsThreshold: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Resume Proposal/i })).toBeInTheDocument();
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
    expect(screen.queryByTestId('stage-dag-progress-dialog')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Resume Proposal/i });
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeInTheDocument();
    });
  });

  it('button state priority: isSessionGenerating overrides paused_nsf and balance', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isSessionGenerating: true, isDisabled: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent(/Generating.../i);
  });
});
