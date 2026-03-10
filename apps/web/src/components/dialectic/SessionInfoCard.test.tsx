import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SessionInfoCard } from './SessionInfoCard';
import { DialecticSession, DialecticStage, DialecticProjectResource, DialecticProject, DialecticStateValues, ApiError, AssembledPrompt, UnifiedProjectProgress } from '@paynless/types';
import {
  initializeMockDialecticState,
} from '@/mocks/dialecticStore.mock';
import { resetAiStoreMock } from '@/mocks/aiStore.mock';
import { initializeMockWalletStore } from '@/mocks/walletStore.mock';
import { useDialecticStore } from '@paynless/store';

const { selectUnifiedProjectProgressMock } = vi.hoisted(() => ({
  selectUnifiedProjectProgressMock: vi.fn<
    [DialecticStateValues, string],
    UnifiedProjectProgress
  >(),
}));

vi.mock('@paynless/store', async () => {
  const dialecticMockModule = await vi.importActual<
    typeof import('@/mocks/dialecticStore.mock')
  >('@/mocks/dialecticStore.mock');
  const actualOriginalStoreModule = await vi.importActual<
    typeof import('@paynless/store')
  >('@paynless/store');
  const organizationStoreMockModule = await vi.importActual<typeof import('@/mocks/organizationStore.mock')>('@/mocks/organizationStore.mock');
  const aiStoreMockModule = await vi.importActual<typeof import('@/mocks/aiStore.mock')>('@/mocks/aiStore.mock');
  const walletStoreMockModule = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');
  const typesModule = await vi.importActual<typeof import('@paynless/types')>('@paynless/types');

  selectUnifiedProjectProgressMock.mockImplementation(
    (state: DialecticStateValues, sessionId: string): UnifiedProjectProgress =>
      dialecticMockModule.selectUnifiedProjectProgress(state, sessionId),
  );

  return {
    useDialecticStore: dialecticMockModule.useDialecticStore,
    useOrganizationStore: organizationStoreMockModule.useOrganizationStore,
    useAiStore: aiStoreMockModule.mockedUseAiStoreHookLogic,
    initialAiStateValues: typesModule.initialAiStateValues,
    useWalletStore: walletStoreMockModule.useWalletStore,
    initialWalletStateValues: actualOriginalStoreModule.initialWalletStateValues,
    selectIsStageReadyForSessionIteration: dialecticMockModule.selectIsStageReadyForSessionIteration,
    selectContributionGenerationStatus: actualOriginalStoreModule.selectContributionGenerationStatus,
    selectGenerateContributionsError: actualOriginalStoreModule.selectGenerateContributionsError,
    selectGeneratingSessionsForSession: actualOriginalStoreModule.selectGeneratingSessionsForSession,
    selectUnifiedProjectProgress: selectUnifiedProjectProgressMock,
    selectSelectedModels: dialecticMockModule.selectSelectedModels,
    selectPersonalWallet: walletStoreMockModule.selectPersonalWallet,
    selectIsLoadingPersonalWallet: walletStoreMockModule.selectIsLoadingPersonalWallet,
    selectPersonalWalletError: walletStoreMockModule.selectPersonalWalletError,
    selectActiveStageSlug: actualOriginalStoreModule.selectActiveStageSlug,
    selectSortedStages: actualOriginalStoreModule.selectSortedStages,
  };
});

vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));

vi.mock('../ai/ChatContextSelector', () => ({
  ChatContextSelector: vi.fn(() => <div data-testid="mock-chat-context-selector"></div>),
}));

vi.mock('../ai/WalletSelector', () => ({
  WalletSelector: vi.fn(() => <div data-testid="mock-wallet-selector"></div>),
}));

vi.mock('./AIModelSelector', () => ({
  AIModelSelector: vi.fn(() => <div data-testid="mock-ai-model-selector"></div>),
}));

vi.mock('./GenerateContributionButton', () => ({
  GenerateContributionButton: vi.fn(() => <div data-testid="mock-generate-contribution-button"></div>),
}));

vi.mock('../common/ContinueUntilCompleteToggle', () => ({
  ContinueUntilCompleteToggle: vi.fn(() => <div data-testid="mock-continue-toggle"></div>),
}));

vi.mock('@/components/common/DynamicProgressBar', () => ({
  DynamicProgressBar: vi.fn(({ sessionId }: { sessionId: string }) => (
    <div data-testid="dynamic-progress-bar-mock" data-session-id={sessionId} />
  )),
}));

const mockAssembledPrompt: AssembledPrompt = {
  promptContent: 'This is the seed prompt content from the store.',
  source_prompt_resource_id: 'res-seed-prompt',
};

const mockProjectId = 'proj-123';
const mockSessionId = 'sess-abc';
const mockStageSlug = 'thesis';
const mockIterationNumber = 1;

const mockStage: DialecticStage = {
    id: 's1',
    slug: mockStageSlug,
    display_name: 'Thesis',
    description: 'A stage for initial ideas.',
    default_system_prompt_id: 'p1',
    expected_output_template_ids: [],
    recipe_template_id: null,
    active_recipe_instance_id: null,
    created_at: 'now',
    minimum_balance: 0,
}

const createMockSeedPromptResource = (
    projectId: string, 
    sessionId: string, 
    stageSlug: string, 
    iteration: number,
    resourceId: string = 'res-seed-prompt'
): DialecticProjectResource => ({
    id: resourceId,
    project_id: projectId,
    storage_path: `projects/${projectId}/resources/seed_prompt_${stageSlug}_${iteration}.md`,
    resource_description: JSON.stringify({
        type: 'seed_prompt',
        session_id: sessionId,
        stage_slug: stageSlug,
        iteration: iteration
    }),
    file_name: `seed_prompt_${stageSlug}_${iteration}.md`,
    mime_type: 'text/markdown',
    size_bytes: 100,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
});

const iterationUserPromptResource: DialecticProjectResource = createMockSeedPromptResource(
    mockProjectId, 
    mockSessionId, 
    mockStageSlug, 
    mockIterationNumber, 
    'res-user-prompt'
);

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session Detailed Description',
  status: 'active',
  iteration_count: mockIterationNumber,
  current_stage_id: mockStage.id, 
  created_at: '2023-01-01T00:00:00.000Z',
  updated_at: '2023-01-01T00:00:00.000Z',
  user_input_reference_url: null,
  selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
  associated_chat_id: null,
  dialectic_contributions: [],
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  project_name: 'Test Project Name',
  dialectic_sessions: [mockSession],
  resources: [iterationUserPromptResource],
  created_at: '2023-01-01T00:00:00.000Z',
  updated_at: '2023-01-01T00:00:00.000Z',
  user_id: 'user-123',
  initial_user_prompt: 'Initial prompt',
  selected_domain_id: 'domain-1',
  process_template_id: 'pt-1',
  dialectic_domains: { name: 'Software' },
  selected_domain_overlay_id: null,
  repo_url: 'https://github.com/test/test',
  status: 'active',
  dialectic_process_templates: {
    id: 'pt-1',
    name: 'Standard Process',
    description: 'A standard dialectic process.',
    starting_stage_id: mockStage.id,
    created_at: 'now',
  },
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
};

const mockProjectWithStages: DialecticProject = {
  ...mockProject,
  dialectic_process_templates: {
    ...mockProject.dialectic_process_templates!,
    stages: [mockStage],
    transitions: [],
  },
};

const mockUnifiedProgressWithBar: UnifiedProjectProgress = {
  totalStages: 1,
  completedStages: 0,
  currentStageSlug: mockStageSlug,
  overallPercentage: 0,
  currentStage: mockStage,
  projectStatus: 'not_started',
  hydrationReady: true,
  stageDetails: [],
};

const setupMockStore = (
    initialStateOverrides: Partial<DialecticStateValues> = {}
) => {
  const activeSessionInStore = initialStateOverrides.activeSessionDetail !== undefined
    ? initialStateOverrides.activeSessionDetail
    : mockSession;

  const finalStateToInitialize: Partial<DialecticStateValues> = {
    activeContextStage: mockStage,
    initialPromptContentCache: {},
    activeSessionDetail: activeSessionInStore,
    activeContextSessionId: activeSessionInStore?.id || null,
    activeContextProjectId: mockProject.id,
    currentProjectDetail: mockProject,
    ...initialStateOverrides,
  };

  initializeMockDialecticState(finalStateToInitialize);
  useDialecticStore.setState({
    fetchInitialPromptContent: vi.fn(),
  });
};

describe('SessionInfoCard', () => {
  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <SessionInfoCard />
      </MemoryRouter>
    );
  };

  const openSeedPromptViaDropdown = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    const seedPromptItem = await screen.findByRole('menuitem', {
      name: /show seed prompt|hide seed prompt/i,
    });
    await user.click(seedPromptItem);
  };

  describe('New: with activeSeedPrompt from store', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
    });

    it('renders the prompt content directly from activeSeedPrompt', async () => {
      setupMockStore({
        activeSeedPrompt: mockAssembledPrompt,
        isLoadingActiveSessionDetail: false,
      });

      renderComponent();
      await openSeedPromptViaDropdown();

      const markdownRenderer = await screen.findByTestId('markdown-renderer-mock');
      expect(markdownRenderer).toHaveTextContent(mockAssembledPrompt.promptContent);
      expect(screen.queryByTestId('iteration-prompt-loading')).toBeNull();
      expect(screen.queryByText('Error Loading Prompt')).toBeNull();
    });

    it('shows loading state based on session loading, not separate prompt fetch', async () => {
        setupMockStore({
            currentProjectDetail: mockProject,
            activeSessionDetail: null, // Simulate session loading
            isLoadingActiveSessionDetail: true,
            activeSeedPrompt: null
        });

        const { container } = renderComponent();

        expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    });


    it('displays a message when activeSeedPrompt is null and session is loaded', async () => {
      setupMockStore({
        activeSeedPrompt: null,
        isLoadingActiveSessionDetail: false,
      });

      renderComponent();
      await openSeedPromptViaDropdown();

      expect(await screen.findByText('No seed prompt available for this session.')).toBeInTheDocument();
    });

    it('does not call fetchInitialPromptContent', async () => {
      const mockFetch = vi.fn();
      setupMockStore({
        activeSeedPrompt: mockAssembledPrompt,
        isLoadingActiveSessionDetail: false,
      });
      useDialecticStore.setState({ fetchInitialPromptContent: mockFetch });

      renderComponent();
      await openSeedPromptViaDropdown();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });


  describe('when data is loaded', () => {
    beforeEach(() => {
      // Clear mocks and reset stores before each test in this block
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
    });

    it('renders basic session information correctly when stage is ready', async () => {
      setupMockStore(
        {
          currentProjectDetail: mockProjectWithStages,
          activeContextStage: mockStage,
          contributionGenerationStatus: 'idle',
          generateContributionsError: null,
          activeSeedPrompt: {
            ...mockAssembledPrompt,
            promptContent: 'Mock prompt content',
          },
        }
      );
      renderComponent();
      await openSeedPromptViaDropdown();

      const cardTitleElement = await screen.findByTestId(`session-info-title-${mockSession.id}`);
      expect(cardTitleElement).toBeInTheDocument();
      expect(cardTitleElement).toHaveTextContent(new RegExp(mockSession.session_description!));
      expect(screen.getByText(/Iteration\s+1/)).toBeInTheDocument();

      expect(screen.queryByText('Loading Session Information...')).toBeNull();
    });

    it('displays "no prompt" message when no seed prompt is available', async () => {
      setupMockStore({
        currentProjectDetail: mockProject,
        activeSeedPrompt: null,
      });

      renderComponent();
      await openSeedPromptViaDropdown();

      expect(
        await screen.findByText('No seed prompt available for this session.'),
      ).toBeInTheDocument();
    });

    it('when generating, does not display duplicate Generating contributions... indicator', () => {
      setupMockStore({
        currentProjectDetail: mockProjectWithStages,
        generatingSessions: { [mockSessionId]: ['job-1'] },
      });
      renderComponent();
      expect(screen.queryByTestId('generating-contributions-indicator')).toBeNull();
      expect(screen.queryByText(/Generating contributions, please wait.../i)).toBeNull();
    });

    it('when generating, displays DynamicProgressBar as single progress display', () => {
      selectUnifiedProjectProgressMock.mockReturnValue(mockUnifiedProgressWithBar);
      setupMockStore({
        currentProjectDetail: mockProjectWithStages,
        generatingSessions: { [mockSessionId]: ['job-1', 'job-2'] },
      });
      renderComponent();
      expect(screen.getByTestId('dynamic-progress-bar-mock')).toBeInTheDocument();
    });
    it('hides the spinner and displays generation error when a failure is recorded', () => {
      const error: ApiError = { message: 'Planner failure', code: 'MODEL_FAILURE' };
      setupMockStore({
        generatingSessions: { [mockSessionId]: ['job-1', 'job-2'] },
        generateContributionsError: error,
      });
      renderComponent();
      expect(screen.queryByTestId('generating-contributions-indicator')).toBeNull();
      const errorAlert = screen.getByTestId('generate-contributions-error');
      expect(errorAlert).toBeInTheDocument();
      expect(within(errorAlert).getByText('Error Generating Contributions')).toBeInTheDocument();
      expect(within(errorAlert).getByText(error.message)).toBeInTheDocument();
    });

    it('displays generation error if error is present', () => {
      const error: ApiError = { message: 'Generation failed hard', code: 'GEN_FAIL' };
      setupMockStore(
        { generateContributionsError: error },
      );
      renderComponent();
      const errorAlert = screen.getByTestId('generate-contributions-error');
      expect(errorAlert).toBeInTheDocument();
      expect(within(errorAlert).getByText('Error Generating Contributions')).toBeInTheDocument();
      expect(within(errorAlert).getByText(error.message)).toBeInTheDocument();
    });

    it('does not display generation error or indicator if not generating and no error', () => {
      setupMockStore({ generatingSessions: {} });
      renderComponent();
      expect(screen.queryByTestId('generating-contributions-indicator')).toBeNull();
      expect(screen.queryByTestId('generate-contributions-error')).toBeNull();
    });
  });

  describe('SSOT progress indicators (SessionInfoCard)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
      selectUnifiedProjectProgressMock.mockReturnValue(mockUnifiedProgressWithBar);
    });

    it('displays single unified progress indicator from SSOT', () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      renderComponent();
      expect(screen.getByTestId('dynamic-progress-bar-mock')).toBeInTheDocument();
      expect(screen.queryByTestId('generating-contributions-indicator')).toBeNull();
    });

    it('session title and iteration badge are shown when project is loaded', () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      renderComponent();
      expect(screen.getByTestId(`session-info-title-${mockSession.id}`)).toHaveTextContent(
        mockSession.session_description!,
      );
      expect(screen.getByText(/Iteration\s+1/)).toBeInTheDocument();
    });

    it('removes duplicate Generating contributions... indicator when progress bar is active', () => {
      setupMockStore({
        currentProjectDetail: mockProjectWithStages,
        generatingSessions: { [mockSessionId]: ['job-1'] },
      });
      renderComponent();
      expect(screen.queryByTestId('generating-contributions-indicator')).toBeNull();
      expect(screen.queryByText(/Generating contributions, please wait.../i)).toBeNull();
      expect(screen.getByTestId('dynamic-progress-bar-mock')).toBeInTheDocument();
    });

    it('progress bar is visible when unified progress has stages', () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      renderComponent();
      expect(screen.getByTestId('dynamic-progress-bar-mock')).toBeInTheDocument();
    });
  });

  describe('when data is not loaded', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
    });

    it('renders loading state if session is undefined', () => {
      setupMockStore({ currentProjectDetail: mockProject, activeSessionDetail: null });
      const { container } = renderComponent();
      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    });

    it('renders loading state if project is undefined', () => {
      setupMockStore({ currentProjectDetail: null });
      const { container } = renderComponent();
      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    });
  });

  describe('Step 6.b: Export Final button is never displayed', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
    });

    it('does not render "Export Final" button even when isFinalStageInProcess is true', async () => {
      // Step 6.b.i: Create a test case that mocks store state with isFinalStageInProcess set to true
      // by setting up a project with process template transitions where the current stage has no outgoing transitions
      const finalStage: DialecticStage = {
        id: 'final-stage-id',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Final synthesis stage',
        default_system_prompt_id: 'p1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: 'now',
        minimum_balance: 0,
      };

      const projectWithFinalStage: DialecticProject = {
        ...mockProject,
        dialectic_process_templates: {
          ...mockProject.dialectic_process_templates!,
          transitions: [
            // Include transitions that do NOT have source_stage_id === finalStage.id
            // This makes finalStage the final stage (no outgoing transitions)
            {
              source_stage_id: 'thesis-stage-id',
              target_stage_id: 'antithesis-stage-id',
              condition_description: null,
              created_at: 'now',
              id: 'transition-1',
              process_template_id: 'pt-1',
            },
            {
              source_stage_id: 'antithesis-stage-id',
              target_stage_id: finalStage.id,
              condition_description: null,
              created_at: 'now',
              id: 'transition-2',
              process_template_id: 'pt-1',
            },
            // No transition where source_stage_id === finalStage.id
          ],
        },
      };

      // Step 6.b.ii: Mock project to be non-null and render SessionInfoCard
      setupMockStore({
        currentProjectDetail: projectWithFinalStage,
        activeContextStage: finalStage,
        activeSessionDetail: {
          ...mockSession,
          current_stage_id: finalStage.id,
        },
      });

      renderComponent();

      // Step 6.b.iii: Assert that the "Export Final" button is NOT rendered,
      // even when isFinalStageInProcess is true
      expect(screen.queryByText('Export Final')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /export final/i })).not.toBeInTheDocument();

      // Step 6.b.iv: Assert that Export is available via the More actions dropdown
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /more actions/i }));
      const exportAction = await screen.findByText('Export Project');
      expect(exportAction).toBeInTheDocument();
      expect(exportAction).not.toHaveTextContent('Export Final');
    });
  });

  describe('Step 6.e: Always-visible Export button is rendered in all stages', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
    });

    it('renders Export button in final stage (isFinalStageInProcess is true)', async () => {
      // Step 6.e.i: Create test case for final stage
      const finalStage: DialecticStage = {
        id: 'final-stage-id',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Final synthesis stage',
        default_system_prompt_id: 'p1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: 'now',
        minimum_balance: 0,
      };

      const projectWithFinalStage: DialecticProject = {
        ...mockProject,
        dialectic_process_templates: {
          ...mockProject.dialectic_process_templates!,
          transitions: [
            {
              source_stage_id: 'thesis-stage-id',
              target_stage_id: 'antithesis-stage-id',
              condition_description: null,
              created_at: 'now',
              id: 'transition-1',
              process_template_id: 'pt-1',
            },
            {
              source_stage_id: 'antithesis-stage-id',
              target_stage_id: finalStage.id,
              condition_description: null,
              created_at: 'now',
              id: 'transition-2',
              process_template_id: 'pt-1',
            },
            // No transition where source_stage_id === finalStage.id
          ],
        },
      };

      setupMockStore({
        currentProjectDetail: projectWithFinalStage,
        activeContextStage: finalStage,
        activeSessionDetail: {
          ...mockSession,
          current_stage_id: finalStage.id,
        },
      });

      renderComponent();

      // Step 6.e.ii: Assert that Export is available via the More actions dropdown
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /more actions/i }));
      const exportAction = await screen.findByText('Export Project');
      expect(exportAction).toBeInTheDocument();
      expect(exportAction).not.toHaveTextContent('Export Final');
    });

    it('renders Export button in non-final stage (isFinalStageInProcess is false)', async () => {
      // Step 6.e.i: Create test case for non-final stage
      const nonFinalStage: DialecticStage = {
        id: 'thesis-stage-id',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Non-final thesis stage',
        default_system_prompt_id: 'p1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: 'now',
        minimum_balance: 0,
      };

      const projectWithNonFinalStage: DialecticProject = {
        ...mockProject,
        dialectic_process_templates: {
          ...mockProject.dialectic_process_templates!,
          transitions: [
            {
              source_stage_id: nonFinalStage.id,
              target_stage_id: 'antithesis-stage-id',
              condition_description: null,
              created_at: 'now',
              id: 'transition-1',
              process_template_id: 'pt-1',
            },
            {
              source_stage_id: 'antithesis-stage-id',
              target_stage_id: 'synthesis-stage-id',
              condition_description: null,
              created_at: 'now',
              id: 'transition-2',
              process_template_id: 'pt-1',
            },
          ],
        },
      };

      setupMockStore({
        currentProjectDetail: projectWithNonFinalStage,
        activeContextStage: nonFinalStage,
        activeSessionDetail: {
          ...mockSession,
          current_stage_id: nonFinalStage.id,
        },
      });

      renderComponent();

      // Step 6.e.ii: Assert that Export is available via the More actions dropdown
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /more actions/i }));
      const exportAction = await screen.findByText('Export Project');
      expect(exportAction).toBeInTheDocument();
      expect(exportAction).not.toHaveTextContent('Export Final');
    });
  });

  describe('2-row toolbar consolidation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetAiStoreMock();
      initializeMockWalletStore();
      selectUnifiedProjectProgressMock.mockReturnValue(mockUnifiedProgressWithBar);
    });

    it('Row 1 renders Back button, session name, iteration badge, and ... dropdown in a single flex row', () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      renderComponent();

      const backButton = screen.getByRole('button', { name: /back/i });
      const title = screen.getByTestId(`session-info-title-${mockSession.id}`);
      const iterationBadge = screen.getByText(/Iteration\s+1/);
      const moreActionsButton = screen.getByRole('button', { name: /more actions/i });

      expect(backButton).toBeInTheDocument();
      expect(title).toBeInTheDocument();
      expect(iterationBadge).toBeInTheDocument();
      expect(moreActionsButton).toBeInTheDocument();

      const row1 = backButton.closest('.flex');
      expect(row1).toBeInTheDocument();
      expect(row1).toContainElement(title);
      expect(row1).toContainElement(iterationBadge);
      expect(row1).toContainElement(moreActionsButton);
    });

    it('Row 2 renders Model Selector popover, Wallet Selector, and DynamicProgressBar in a single flex row', () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      renderComponent();

      const modelSelectorTrigger = screen.getByRole('button', { name: /select models|(\d+) model/i });
      const walletSelector = screen.getByTestId('mock-wallet-selector');
      const progressBar = screen.getByTestId('dynamic-progress-bar-mock');

      expect(modelSelectorTrigger).toBeInTheDocument();
      expect(walletSelector).toBeInTheDocument();
      expect(progressBar).toBeInTheDocument();

      const row2 = progressBar.closest('.flex');
      expect(row2).toBeInTheDocument();
      expect(row2).toContainElement(modelSelectorTrigger);
      expect(row2).toContainElement(walletSelector);
    });

    it('... dropdown contains Export, Continue Until Complete, and Show/Hide Seed Prompt toggle', async () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      renderComponent();

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /more actions/i }));

      expect(await screen.findByText('Export Project')).toBeInTheDocument();
      expect(screen.getByTestId('mock-continue-toggle')).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: /show seed prompt|hide seed prompt/i })
      ).toBeInTheDocument();
    });

    it('clicking seed prompt dropdown item toggles the collapsible seed prompt section', async () => {
      setupMockStore({
        currentProjectDetail: mockProjectWithStages,
        activeSeedPrompt: mockAssembledPrompt,
      });
      renderComponent();

      const user = userEvent.setup();
      expect(screen.queryByTestId('markdown-renderer-mock')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /more actions/i }));
      const seedPromptItem = await screen.findByRole('menuitem', {
        name: /show seed prompt|hide seed prompt/i,
      });
      await user.click(seedPromptItem);

      expect(await screen.findByTestId('markdown-renderer-mock')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent(
        mockAssembledPrompt.promptContent
      );

      await user.click(screen.getByRole('button', { name: /more actions/i }));
      const hideItem = await screen.findByRole('menuitem', { name: /hide seed prompt/i });
      await user.click(hideItem);

      expect(screen.queryByTestId('markdown-renderer-mock')).not.toBeInTheDocument();
    });

    it('header has sufficient left padding to clear the app sidebar trigger (pl-14 or equivalent)', () => {
      setupMockStore({ currentProjectDetail: mockProjectWithStages });
      const { container } = renderComponent();

      const headerWrapper = container.querySelector('[aria-labelledby]');
      expect(headerWrapper).toBeInTheDocument();
      expect(headerWrapper?.className).toMatch(/pl-14/);
    });

    it('error alert for generateContributionsError still renders when error is present', () => {
      const error: ApiError = { message: 'Toolbar consolidation test error', code: 'TEST_ERR' };
      setupMockStore({
        currentProjectDetail: mockProjectWithStages,
        generateContributionsError: error,
      });
      renderComponent();

      const errorAlert = screen.getByTestId('generate-contributions-error');
      expect(errorAlert).toBeInTheDocument();
      expect(within(errorAlert).getByText('Error Generating Contributions')).toBeInTheDocument();
      expect(within(errorAlert).getByText(error.message)).toBeInTheDocument();
    });

    it('seed prompt collapsible section still renders below the rows when toggled open', async () => {
      setupMockStore({
        currentProjectDetail: mockProjectWithStages,
        activeSeedPrompt: mockAssembledPrompt,
      });
      renderComponent();

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /more actions/i }));
      const seedPromptItem = await screen.findByRole('menuitem', {
        name: /show seed prompt|hide seed prompt/i,
      });
      await user.click(seedPromptItem);

      const seedSection = await screen.findByTestId('markdown-renderer-mock');
      expect(seedSection).toBeInTheDocument();
      expect(seedSection.closest('.rounded-lg')).toBeInTheDocument();
    });
  });
}); 