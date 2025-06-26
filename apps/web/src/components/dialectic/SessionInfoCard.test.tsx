import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { SessionInfoCard } from './SessionInfoCard';
import { DialecticSession, DialecticStage, DialecticProjectResource, DialecticProject, DialecticStateValues, ApiError } from '@paynless/types';
import {
  initializeMockDialecticState,
} from '@/mocks/dialecticStore.mock';
import { resetAiStoreMock } from '@/mocks/aiStore.mock';
import { initializeMockWalletStore } from '@/mocks/walletStore.mock';
import { 
  selectIsStageReadyForSessionIteration, 
  useDialecticStore
} from '@paynless/store';

// Explicitly mock the @paynless/store to use our mock implementation
vi.mock('@paynless/store', async () => {
  const dialecticMockModule = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualOriginalStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const organizationStoreMockModule = await vi.importActual<typeof import('@/mocks/organizationStore.mock')>('@/mocks/organizationStore.mock');
  const aiStoreMockModule = await vi.importActual<typeof import('@/mocks/aiStore.mock')>('@/mocks/aiStore.mock');
  const walletStoreMockModule = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');
  
  return {
    useDialecticStore: dialecticMockModule.useDialecticStore,
    useOrganizationStore: organizationStoreMockModule.useOrganizationStore,
    useAiStore: aiStoreMockModule.mockedUseAiStoreHookLogic,
    initialAiStateValues: actualOriginalStoreModule.initialAiStateValues,
    useWalletStore: walletStoreMockModule.useWalletStore,
    initialWalletStateValues: actualOriginalStoreModule.initialWalletStateValues,
    selectIsStageReadyForSessionIteration: vi.fn(),
    selectContributionGenerationStatus: actualOriginalStoreModule.selectContributionGenerationStatus,
    selectGenerateContributionsError: actualOriginalStoreModule.selectGenerateContributionsError,
    selectPersonalWallet: walletStoreMockModule.selectPersonalWallet,
    selectIsLoadingPersonalWallet: walletStoreMockModule.selectIsLoadingPersonalWallet,
    selectPersonalWalletError: walletStoreMockModule.selectPersonalWalletError,
  };
});

vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));

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
    input_artifact_rules: {},
    expected_output_artifacts: {},
    created_at: 'now',
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
  selected_model_ids: [],
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

const setupMockStore = (
    initialStateOverrides: Partial<DialecticStateValues> = {},
    isStageReadyTestCondition?: boolean,
    activeSessionInStore: DialecticSession | null | undefined = mockSession
) => {
  const isReady = isStageReadyTestCondition === undefined ? true : isStageReadyTestCondition;
  (selectIsStageReadyForSessionIteration as unknown as MockInstance<
    [DialecticStateValues, string, string, string, number],
    boolean
  >).mockReturnValue(isReady);

  const effectiveContextSession = activeSessionInStore !== undefined
                                  ? activeSessionInStore
                                  : (initialStateOverrides.activeSessionDetail !== undefined
                                    ? initialStateOverrides.activeSessionDetail
                                    : mockSession);
  const effectiveContextStage = initialStateOverrides.activeContextStage !== undefined
                                ? initialStateOverrides.activeContextStage
                                : mockStage;

  let preliminaryContextProject = initialStateOverrides.currentProjectDetail === null
                                     ? null
                                     : (initialStateOverrides.currentProjectDetail || mockProject);
  
  // If currentProjectDetail was explicitly set to null, ensure preliminaryContextProject is also null.
  if (Object.prototype.hasOwnProperty.call(initialStateOverrides, 'currentProjectDetail') && initialStateOverrides.currentProjectDetail === null) {
    preliminaryContextProject = null;
  }

  const resourcesOverridden = initialStateOverrides.currentProjectDetail?.resources !== undefined;
  let resourcesForTest: DialecticProjectResource[];

  if (resourcesOverridden) {
    resourcesForTest = [...initialStateOverrides.currentProjectDetail!.resources!];
  } else {
    resourcesForTest = preliminaryContextProject?.resources ? [...preliminaryContextProject.resources] : [];
  }
  
  const findMatchingSeedPrompt = (resList: DialecticProjectResource[]) => {
    if (!effectiveContextSession || !effectiveContextStage) return undefined;
    return resList.find(r => {
      if (!r.resource_description) return false;
      try {
          const desc = JSON.parse(r.resource_description);
          return desc.type === 'seed_prompt' &&
                 desc.session_id === effectiveContextSession.id &&
                 desc.stage_slug === effectiveContextStage.slug &&
                 desc.iteration === effectiveContextSession.iteration_count;
      } catch (e) { return false; }
    });
  };

  if (isStageReadyTestCondition === true) {
    if (!resourcesOverridden && preliminaryContextProject?.id && effectiveContextSession && effectiveContextStage) {
      if (!findMatchingSeedPrompt(resourcesForTest)) {
        const seedPrompt = createMockSeedPromptResource(
            preliminaryContextProject.id, // Use ID from the correct project context
            effectiveContextSession.id,
            effectiveContextStage.slug,
            effectiveContextSession.iteration_count
        );
        resourcesForTest.push(seedPrompt);
      }
    }
  } else if (isStageReadyTestCondition === false) {
     if (effectiveContextSession && effectiveContextStage) {
        resourcesForTest = resourcesForTest.filter(r => {
            if (!r.resource_description) return true;
            try {
                const desc = JSON.parse(r.resource_description || '{}');
                return !(
                    desc.type === 'seed_prompt' &&
                    desc.session_id === effectiveContextSession.id &&
                    desc.stage_slug === effectiveContextStage.slug &&
                    desc.iteration === effectiveContextSession.iteration_count
                );
            } catch (e) {
                return true;
            }
        });
    }
  }

  const baseEffectiveState: Partial<DialecticStateValues> = {
    activeContextStage: mockStage,
    initialPromptContentCache: {},
    activeSessionDetail: effectiveContextSession,
    activeContextSessionId: effectiveContextSession?.id || null,
    activeContextProjectId: mockProject.id,
  };
  
  let effectiveProjectDetail: DialecticProject | null;
  if (initialStateOverrides.currentProjectDetail === null) {
    effectiveProjectDetail = null;
  } else {
    effectiveProjectDetail = {
      ...mockProject, 
      ...(initialStateOverrides.currentProjectDetail || {}),
      resources: resourcesForTest,
    };
  }

  const finalStateToInitialize: Partial<DialecticStateValues> = {
    ...baseEffectiveState,
    ...initialStateOverrides,
    currentProjectDetail: effectiveProjectDetail,
    activeContextStage: initialStateOverrides.activeContextStage !== undefined
                        ? initialStateOverrides.activeContextStage
                        : baseEffectiveState.activeContextStage,
    activeSessionDetail: effectiveContextSession,
    activeContextSessionId: effectiveContextSession?.id || null,
    activeContextProjectId: effectiveProjectDetail ? effectiveProjectDetail.id : null,
  };

  initializeMockDialecticState(finalStateToInitialize);
  useDialecticStore.setState({
    fetchInitialPromptContent: vi.fn(),
  });
};

describe('SessionInfoCard', () => {

  const renderComponent = () => {
    return render(<SessionInfoCard />);
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    resetAiStoreMock();
    initializeMockWalletStore();
    setupMockStore({
      currentProjectDetail: mockProject,
      activeContextStage: mockStage,
      contributionGenerationStatus: 'idle', 
      generateContributionsError: null,
    }, 
    true,
    mockSession
    ); 
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders basic session information correctly when stage is ready', async () => {
    setupMockStore({
      currentProjectDetail: { ...mockProject, project_name: 'Test Project For Basic Info' },
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { isLoading: false, content: 'Mock prompt content for basic info', error: null }
      }
    }, 
    true,
    mockSession
    );

    renderComponent();
    
    const cardTitleElement = await screen.findByTestId(`session-info-title-${mockSession.id}`);
    expect(cardTitleElement).toBeInTheDocument();
    expect(cardTitleElement).toHaveTextContent(new RegExp(mockSession.session_description!));
    expect(cardTitleElement).toHaveTextContent(new RegExp(`Iteration: ${mockSession.iteration_count}`));
    expect(cardTitleElement).toHaveTextContent(new RegExp(mockSession.status!, 'i'));

    expect(screen.queryByText('Loading Session Information...')).toBeNull();
    
    await screen.findByText('Mock prompt content for basic info', {}, { timeout: 3000 });
  });

  it('displays loading state for iteration user prompt initially when stage is ready', async () => {
    const specificPromptResourceId = 'res-specific-prompt-loading';
    const specificPromptResource = createMockSeedPromptResource(
      mockProjectId, mockSessionId, mockStageSlug, mockIterationNumber, specificPromptResourceId
    );
    setupMockStore({
      currentProjectDetail: { ...mockProject, resources: [specificPromptResource] },
      initialPromptContentCache: {
        [specificPromptResourceId]: { isLoading: true, content: '', error: null }
      }
    }, 
    true,
    mockSession
    );
    renderComponent();

    expect(screen.getByTestId('iteration-prompt-loading')).toBeInTheDocument();
  });
  
  it('fetches iteration user prompt if not in cache and stage is ready', async () => {
    const mockFetch = vi.fn();
    const specificPromptResourceId = 'res-specific-prompt-fetch';
    const specificPromptResource = createMockSeedPromptResource(
      mockProjectId, mockSessionId, mockStageSlug, mockIterationNumber, specificPromptResourceId
    );
    setupMockStore({
      currentProjectDetail: { ...mockProject, resources: [specificPromptResource] },
      initialPromptContentCache: {},
    }, 
    true, 
    mockSession 
    );
    useDialecticStore.setState({ fetchInitialPromptContent: mockFetch });

    renderComponent();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(specificPromptResource.id);
    });
  });

  it('displays fetched iteration user prompt content when available and stage is ready', async () => {
    const promptContent = "Fetched prompt content.";
    const specificPromptResourceId = 'res-specific-prompt-display';
    const specificPromptResource = createMockSeedPromptResource(
      mockProjectId, mockSessionId, mockStageSlug, mockIterationNumber, specificPromptResourceId
    );
    setupMockStore({
      currentProjectDetail: { ...mockProject, resources: [specificPromptResource] },
      initialPromptContentCache: {
        [specificPromptResourceId]: { isLoading: false, content: promptContent, error: null }
      }
    }, 
    true,
    mockSession
    );
    renderComponent();

    expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent(promptContent);
  });

  it('displays error message if fetching iteration user prompt fails and stage is ready', async () => {
    const error: ApiError = { message: 'Failed to fetch', code: 'FETCH_ERROR' };
    const specificPromptResourceId = 'res-specific-prompt-error';
    const specificPromptResource = createMockSeedPromptResource(
      mockProjectId, mockSessionId, mockStageSlug, mockIterationNumber, specificPromptResourceId
    );
    setupMockStore({
      currentProjectDetail: { ...mockProject, resources: [specificPromptResource] },
      initialPromptContentCache: {
        [specificPromptResourceId]: { isLoading: false, content: '', error: error }
      }
    }, 
    true,
    mockSession
    );
    renderComponent();

    expect(screen.getByText('Error Loading Prompt')).toBeInTheDocument();
  });

  it('renders "Stage Not Ready" message when isStageReady is false', () => {
    setupMockStore(
      { currentProjectDetail: mockProject },
      false,
      mockSession
    );
    renderComponent();

    expect(screen.getByText('Stage Not Ready')).toBeInTheDocument();
  });

  it('renders loading state if session is undefined', () => {
    setupMockStore(
      { currentProjectDetail: mockProject },
      true,
      null
    );
    renderComponent();

    expect(screen.getByText('Loading Session Information...')).toBeInTheDocument();
  });

  it('renders loading state if project is undefined', () => {
    setupMockStore(
      { currentProjectDetail: null },
      true,
      mockSession
    );
    renderComponent();
    expect(screen.getByText('Loading Session Information...')).toBeInTheDocument();
  });

  it('displays generating contributions indicator when status is "initiating"', () => {
    setupMockStore(
      { contributionGenerationStatus: 'initiating' }, 
      true, 
      mockSession
    );
    renderComponent();
    expect(screen.getByTestId('generating-contributions-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Generating contributions, please wait.../i)).toBeInTheDocument();
  });

  it('displays generating contributions indicator when status is "generating"', () => {
    setupMockStore(
      { contributionGenerationStatus: 'generating' },
      true,
      mockSession
      );
    renderComponent();
    expect(screen.getByTestId('generating-contributions-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Generating contributions, please wait.../i)).toBeInTheDocument();
  });

  it('displays generation error if status is "failed" and error is present', () => {
    const error: ApiError = { message: 'Generation failed hard', code: 'GEN_FAIL' };
    setupMockStore(
      { 
        contributionGenerationStatus: 'failed',
        generateContributionsError: error 
      },
      true,
      mockSession
      );
    renderComponent();
    const errorAlert = screen.getByTestId('generate-contributions-error');
    expect(errorAlert).toBeInTheDocument();
    expect(within(errorAlert).getByText('Error Generating Contributions')).toBeInTheDocument();
    expect(within(errorAlert).getByText(error.message)).toBeInTheDocument();
  });

  it('does not display generation error or indicator if status is "idle"', () => {
    setupMockStore(
      { contributionGenerationStatus: 'idle' },
      true,
      mockSession
      );
    renderComponent();
    expect(screen.queryByTestId('generating-contributions-indicator')).toBeNull();
    expect(screen.queryByTestId('generate-contributions-error')).toBeNull();
  });

  it('renders "No specific prompt is configured for this iteration/stage." when iterationUserPromptResourceId is null and stage is ready', () => {
    setupMockStore(
      { 
        currentProjectDetail: { ...mockProject, resources: [] } 
      },
      true,
      mockSession
    );
    renderComponent();
    expect(screen.getByText('No specific prompt is configured for this iteration/stage.')).toBeInTheDocument();
  });

  it('renders "Loading iteration prompt..." if resource ID exists but no cache entry and stage is ready', async () => {
    const specificPromptResourceId = 'res-for-loading-text';
    const specificPromptResource = createMockSeedPromptResource(
      mockProjectId, mockSessionId, mockStageSlug, mockIterationNumber, specificPromptResourceId
    );
    setupMockStore(
      { 
        currentProjectDetail: { ...mockProject, resources: [specificPromptResource] },
        initialPromptContentCache: {}
      },
      true,
      mockSession
    );
    renderComponent();
    expect(await screen.findByText('Loading iteration prompt...', {}, {timeout: 2000})).toBeInTheDocument();
  });


  it('renders "No specific prompt was set for this iteration." if cache entry exists with null content and no error/loading, and stage is ready', () => {
    const specificPromptResourceId = 'res-null-content';
    const specificPromptResource = createMockSeedPromptResource(
      mockProjectId, mockSessionId, mockStageSlug, mockIterationNumber, specificPromptResourceId
    );
    setupMockStore(
      { 
        currentProjectDetail: { ...mockProject, resources: [specificPromptResource] },
        initialPromptContentCache: {
          [specificPromptResourceId]: {isLoading: false, content: '', error: null }
        }
      },
      true,
      mockSession
    );
    renderComponent();
    expect(screen.getByText('No specific prompt was set for this iteration.')).toBeInTheDocument();
  });

}); 