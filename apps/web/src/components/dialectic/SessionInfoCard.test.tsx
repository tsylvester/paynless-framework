import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionInfoCard } from './SessionInfoCard';
import { DialecticSession, DialecticStage, DialecticProjectResource, DialecticProject, DialecticStateValues } from '@paynless/types';
import {
  initializeMockDialecticState,
  getDialecticStoreState,
  // We will rely on vi.mock below to provide useDialecticStore and other selectors
} from '@/mocks/dialecticStore.mock';

// Explicitly mock the @paynless/store to use our mock implementation
vi.mock('@paynless/store', async () => {
  // Import all exports from the mock file.
  // This ensures that useDialecticStore, selectIsStageReadyForSessionIteration, etc.,
  // used by the component will come from our mock.
  const dialecticMockModule = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  // const aiMockModule = await vi.importActual<typeof import('@/mocks/aiStore.mock.ts')>('@/mocks/aiStore.mock.ts');

  return {
    ...dialecticMockModule,
    // ...aiMockModule,
    // Ensure the hook names are exported as they are used in the application code
    useDialecticStore: dialecticMockModule.mockedUseDialecticStoreHookLogic,
    // useAiStore: aiMockModule.mockedUseAiStoreHookLogic, // No longer needed here as AIModelSelector is mocked
    selectIsStageReadyForSessionIteration: dialecticMockModule.selectIsStageReadyForSessionIteration, // Make sure this is exported if SessionInfoCard uses it directly
    // Add any other specific exports from @paynless/store that are directly used by SessionInfoCard
  };
});

vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));

// Mock the AIModelSelector component
vi.mock('@/components/dialectic/AIModelSelector', () => ({
  AIModelSelector: vi.fn(() => <div data-testid="ai-model-selector-mock">AIModelSelectorMock</div>),
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
  selected_model_catalog_ids: [],
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
};

const setupMockStore = (
    initialStateOverrides: Partial<DialecticStateValues> = {},
    isStageReadyTestCondition?: boolean
) => {
  let resourcesForTest: DialecticProjectResource[] = mockProject.resources ? [...mockProject.resources] : [];
  
  if (isStageReadyTestCondition === true) {
    const seedPrompt = createMockSeedPromptResource(
        mockProjectId,
        mockSessionId,
        mockStageSlug,
        mockIterationNumber
    );
    if (!resourcesForTest.find(r => r.id === seedPrompt.id)) {
        resourcesForTest.push(seedPrompt);
    }
  } else if (isStageReadyTestCondition === false) {
     resourcesForTest = resourcesForTest.filter(r => {
        try {
            const desc = JSON.parse(r.resource_description || '{}');
            return !(
                desc.type === 'seed_prompt' &&
                desc.session_id === mockSessionId &&
                desc.stage_slug === mockStageSlug &&
                desc.iteration === mockIterationNumber
            );
        } catch (e) {
            return true;
        }
    });
  }

  // Base state incorporating calculated resources and default stage
  const baseEffectiveState: Partial<DialecticStateValues> = {
    activeContextStage: mockStage,
    initialPromptContentCache: {},
  };
  
  // Determine the currentProjectDetail
  let effectiveProjectDetail: DialecticProject | null;
  if (initialStateOverrides.currentProjectDetail === null) {
    effectiveProjectDetail = null; // Respect explicit null override
  } else {
    // Start with mockProject, apply overrides from initialStateOverrides.currentProjectDetail,
    // but crucially ensure 'resources' comes from the calculated 'resourcesForTest'.
    effectiveProjectDetail = {
      ...mockProject, // Base project properties
      ...(initialStateOverrides.currentProjectDetail || {}), // Apply specific project overrides from test (e.g., project_name)
      resources: resourcesForTest, // Always use the calculated resourcesForTest
    };
  }

  // Combine base, overrides, and then set the definitive project and stage
  const finalStateToInitialize: Partial<DialecticStateValues> = {
    ...baseEffectiveState, // Start with defaults for stage, cache
    ...initialStateOverrides, // Apply all other overrides from the specific test (e.g., initialPromptContentCache)
    currentProjectDetail: effectiveProjectDetail, // Set the carefully constructed project detail
    // Ensure activeContextStage is from override if present, else default from baseEffectiveState (mockStage)
    activeContextStage: initialStateOverrides.activeContextStage !== undefined
                        ? initialStateOverrides.activeContextStage
                        : baseEffectiveState.activeContextStage,
  };

  initializeMockDialecticState(finalStateToInitialize);
};

describe('SessionInfoCard', () => {

  const renderComponent = (sessionToRender: DialecticSession | undefined) => {
    return render(<SessionInfoCard session={sessionToRender} />);
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
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
    }, true);

    const storeStateBeforeRender = getDialecticStoreState();
    console.log('TEST_DIAGNOSTIC: currentProjectDetail before render (basic info test):', JSON.stringify(storeStateBeforeRender.currentProjectDetail?.project_name, null, 2));
    console.log('TEST_DIAGNOSTIC: resources before render (basic info test):', JSON.stringify(storeStateBeforeRender.currentProjectDetail?.resources?.map(r=>r.id), null, 2));
    if (!storeStateBeforeRender.currentProjectDetail) {
      console.error('TEST_DIAGNOSTIC_ERROR: currentProjectDetail is NULL in store right before renderComponent (basic info test)!');
    }
    if (!storeStateBeforeRender.activeContextStage) {
      console.error('TEST_DIAGNOSTIC_ERROR: activeContextStage is NULL in store right before renderComponent (basic info test)!');
    }

    renderComponent(mockSession);
    
    await screen.findByText(new RegExp(mockSession.session_description!), {}, { timeout: 3000 });

    expect(screen.getByText(new RegExp(`Iteration: ${mockSession.iteration_count}`))).toBeInTheDocument();
    
    expect(screen.getByText(new RegExp(mockSession.status!, 'i'))).toBeInTheDocument();

    expect(screen.queryByText('Loading Session Information...')).toBeNull();
    
    await screen.findByText('Mock prompt content for basic info', {}, { timeout: 3000 });
  });

  it('displays loading state for iteration user prompt initially when stage is ready', async () => {
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { isLoading: true, content: '', error: null }
      },
    }, true);
    renderComponent(mockSession);
    await waitFor(() => {
      expect(screen.getByTestId('iteration-prompt-loading')).toBeInTheDocument();
    });
  });
  
  it('fetches iteration user prompt content on mount if stage is ready and content not available', async () => {
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { content: '', isLoading: false, error: null }
      }
    }, true);
    const { fetchInitialPromptContent } = getDialecticStoreState();
    renderComponent(mockSession);
    await waitFor(() => {
      expect(fetchInitialPromptContent).toHaveBeenCalledWith(iterationUserPromptResource.id);
    });
  });

  it('renders iteration user prompt content once loaded when stage is ready', async () => {
    const promptContent = 'This is the initial user prompt.';
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { content: promptContent, isLoading: false, error: null }
      },
    }, true);

    renderComponent(mockSession);

    await waitFor(() => {
      const markdownMock = screen.getByTestId('markdown-renderer-mock');
      expect(markdownMock).toBeInTheDocument();
      expect(markdownMock).toHaveTextContent(promptContent);
    });
  });

  it('displays error state if iteration user prompt content fetching fails when stage is ready', async () => {
    const error = { code: 'FETCH_FAILED', message: 'Failed to load iteration prompt', name: 'FetchError', stack: 'stack' };
    setupMockStore({
      initialPromptContentCache: {
        [iterationUserPromptResource.id]: { error: error, isLoading: false, content: '' }
      },
    }, true);
    renderComponent(mockSession);

    await waitFor(() => {
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });

  it('does not attempt to render prompt if session is undefined', () => {
    setupMockStore({ }, true);
    renderComponent(undefined);
    expect(screen.getByText('Loading Session Information...')).toBeInTheDocument();
    const { fetchInitialPromptContent } = getDialecticStoreState();
    expect(fetchInitialPromptContent).not.toHaveBeenCalled();
  });

  it('does not attempt to fetch prompt if project is not found in store', () => {
    setupMockStore({ currentProjectDetail: null, activeContextStage: mockStage }, true);
    renderComponent(mockSession);
    const { fetchInitialPromptContent } = getDialecticStoreState();
    expect(fetchInitialPromptContent).not.toHaveBeenCalled();
  });
  
  it('does not attempt to fetch prompt if activeStage is not found in store', () => {
    setupMockStore({ currentProjectDetail: mockProject, activeContextStage: null }, true);
    renderComponent(mockSession);
    const { fetchInitialPromptContent } = getDialecticStoreState();
    expect(fetchInitialPromptContent).not.toHaveBeenCalled();
  });

  describe('Stage Readiness UI Logic (Plan 2.B.3.1)', () => {
    it('shows warning and hides prompt if active stage is NOT ready', async () => {
      setupMockStore({ }, false);
      renderComponent(mockSession);

      await waitFor(() => {
        expect(screen.getByText('Stage Not Ready')).toBeInTheDocument();
        expect(screen.getByText(/Please complete prior stages or ensure the seed prompt for this stage and iteration is available./)).toBeInTheDocument();
        expect(screen.queryByTestId('markdown-renderer-mock')).toBeNull();
        expect(screen.queryByTestId('iteration-prompt-loading')).toBeNull();
      });
    });

    it('shows prompt and NO warning if active stage IS ready', async () => {
      const promptContent = "Ready stage prompt content";
      setupMockStore({
        initialPromptContentCache: {
          [iterationUserPromptResource.id]: { content: promptContent, isLoading: false, error: null }
        }
      }, true);
      renderComponent(mockSession);

      await waitFor(() => {
        expect(screen.queryByText('Stage Not Ready')).toBeNull();
        const markdownMock = screen.getByTestId('markdown-renderer-mock');
        expect(markdownMock).toBeInTheDocument();
        expect(markdownMock).toHaveTextContent(promptContent);
      });
    });

    it('does not fetch prompt content if active stage is NOT ready', () => {
      setupMockStore({ }, false);
      
      const { fetchInitialPromptContent } = getDialecticStoreState();
      renderComponent(mockSession);

      expect(fetchInitialPromptContent).not.toHaveBeenCalled();
    });

    it('still shows basic session info like description even if stage is not ready', async () => {
        setupMockStore({
            currentProjectDetail: { ...mockProject, project_name: 'Project For Not Ready Stage' },
        }, false);

        renderComponent(mockSession);

        await waitFor(() => {
            expect(screen.getByText(new RegExp(mockSession.session_description!))).toBeInTheDocument();
            expect(screen.getByText(new RegExp(`Iteration: ${mockSession.iteration_count}`))).toBeInTheDocument();
            expect(screen.getByText(new RegExp(mockSession.status!, 'i'))).toBeInTheDocument();
            expect(screen.getByText('Stage Not Ready')).toBeInTheDocument();
            expect(screen.queryByText('Loading Session Information...')).toBeNull();
        });
    });
  });
}); 