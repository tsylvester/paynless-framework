import { render, screen, waitFor } from '@testing-library/react';
import { SessionInfoCard } from './SessionInfoCard';
import { DialecticProject, DialecticSession, DialecticStateValues } from '@paynless/types';
import { vi } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock'; // Import initialize and getter

// Mock the store using the pattern from other working tests
vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  return {
    ...actualStoreModule,
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
  };
});

// Mock child components and utilities
vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));

const mockProjectId = 'proj-123';
const mockSessionId = 'sess-abc';
const mockIterationNumber = 2;

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session Detailed Description',
  iteration_count: 5, // Overall iterations in the session config
  current_iteration: mockIterationNumber, // The current iteration we are in
  status: 'pending_antithesis',
  // ... other required session fields
  current_stage_seed_prompt: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/0_seed_inputs/user_prompt.md`, // This is the path
  active_thesis_prompt_template_id: 'tpl-thesis-1',
  active_antithesis_prompt_template_id: 'tpl-antithesis-1',
  created_at: '2023-01-01T09:00:00Z',
  updated_at: '2023-01-01T11:05:00Z',
  associated_chat_id: 'chat-xyz',
  active_synthesis_prompt_template_id: 'tpl-synthesis-1',
  active_paralysis_prompt_template_id: 'tpl-paralysis-1',
  active_parenthesis_prompt_template_id: 'tpl-parenthesis-1',
  formal_debate_structure_id: null,
  convergence_status: null,
  max_iterations: 10,
  dialectic_contributions: [],
  dialectic_session_models: [],
   preferred_model_for_stage: {},
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-test',
  project_name: 'Test Project Name',
  initial_user_prompt: 'This is the main project prompt.', // Project's initial prompt
  dialectic_sessions: [mockSession],
  // ... other required project fields
  selected_domain_overlay_id: null,
  selected_domain_tag: null,
  repo_url: null,
  status: 'active',
  created_at: '2023-01-01T08:00:00Z',
  updated_at: '2023-01-01T08:00:00Z',
};

const iterationUserPromptPath = `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/0_seed_inputs/user_prompt.md`;
const mockIterationUserPromptContent = "# Iteration Specific Prompt\nThis is the user prompt for iteration 2.";

describe('SessionInfoCard', () => {
  // Helper function to initialize the store with specific states
  const setupStore = (overrides?: Partial<DialecticStateValues>) => {
    const defaultState: DialecticStateValues = {
      currentProjectDetail: mockProject,
      contributionContentCache: {},
      isLoadingInitialPromptFileContent: false,
      initialPromptFileContentError: null,
      // Ensure all other necessary minimal state values are here if not covered by initializeMockDialecticState defaults
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      projects: [mockProject],
      // ...any other defaults from your initialDialecticStateValues in the mock file...
      availableDomainTags: [],
      isLoadingDomainTags: false,
      domainTagsError: null,
      selectedDomainTag: null,
      selectedStageAssociation: null,
      availableDomainOverlays: [],
      isLoadingDomainOverlays: false,
      domainOverlaysError: null,
      selectedDomainOverlayId: null,
      isLoadingProjects: false,
      projectsError: null,
      isLoadingProjectDetail: false,
      projectDetailError: null,
      modelCatalog: [],
      isLoadingModelCatalog: false,
      modelCatalogError: null,
      isCreatingProject: false,
      createProjectError: null,
      isStartingSession: false,
      startSessionError: null,
      allSystemPrompts: [],
      isCloningProject: false,
      cloneProjectError: null,
      isExportingProject: false,
      exportProjectError: null,
      isUpdatingProjectPrompt: false,
      isUploadingProjectResource: false,
      uploadProjectResourceError: null,
      isStartNewSessionModalOpen: false,
      selectedModelIds: [],
      initialPromptFileContent: null, // this is for a different feature
      activeContextStageSlug: null,
      isGeneratingContributions: false,
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
    };
    initializeMockDialecticState({ ...defaultState, ...overrides });
  };

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
    setupStore(); // Setup with default store state
  });

  const renderComponent = () => 
    render(<SessionInfoCard />);

  it('renders basic session information correctly', () => {
    renderComponent();
    expect(screen.getByText(mockSession.session_description!)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Iteration: ${mockSession.current_iteration}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(mockSession.status, 'i'))).toBeInTheDocument();
    // Also check project name as context, using a regex to handle whitespace
    expect(screen.getByText(new RegExp(`Project:\\s*${mockProject.project_name}`))).toBeInTheDocument();
  });

  it('displays loading state for iteration user prompt initially', () => {
    setupStore({ 
      contributionContentCache: {
        [iterationUserPromptPath]: { isLoading: true, content: undefined, error: undefined, mimeType: undefined } 
      }
    });
    renderComponent();
    expect(screen.getByTestId('iteration-prompt-loading')).toBeInTheDocument();
  });

  it('fetches iteration user prompt content on mount if not available and session has seed prompt path', async () => {
    // Ensure the specific session in the project has current_stage_seed_prompt
    const projectWithSeedPromptPath = {
      ...mockProject,
      dialectic_sessions: [{ ...mockSession, current_stage_seed_prompt: iterationUserPromptPath }]
    };
    setupStore({ currentProjectDetail: projectWithSeedPromptPath, contributionContentCache: {} });
    
    renderComponent();
    const store = getDialecticStoreState();

    await waitFor(() => {
      // The component should call fetchInitialPromptContent with the path from the session
      expect(store.fetchInitialPromptContent).toHaveBeenCalledWith(iterationUserPromptPath);
    });
  });

  it('renders iteration user prompt content once loaded', async () => {
    setupStore({
      contributionContentCache: {
        [iterationUserPromptPath]: { 
          content: mockIterationUserPromptContent, 
          isLoading: false, 
          error: undefined,
          mimeType: 'text/markdown' 
        }
      }
    });
    renderComponent();
    
    await waitFor(() => {
      const markdownMock = screen.getByTestId('markdown-renderer-mock');
      expect(markdownMock).toBeInTheDocument();
      expect(markdownMock).toHaveTextContent("# Iteration Specific Prompt This is the user prompt for iteration 2.");
    });
  });

  it('displays error state if iteration user prompt content fetching fails', async () => {
    const errorMessage = 'Failed to load iteration prompt';
    setupStore({
      contributionContentCache: {
        [iterationUserPromptPath]: { 
          content: undefined,
          error: errorMessage, 
          isLoading: false,
          mimeType: undefined
        }
      }
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });
  
  it('does not attempt to render prompt if session or project is not found', () => {
    setupStore({ currentProjectDetail: null, activeContextProjectId: null }); // Project not found by making detail null
    renderComponent();
    expect(screen.queryByTestId('markdown-renderer-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('iteration-prompt-loading')).not.toBeInTheDocument();
    
    // Test for session not found by setting up a project but making activeContextSessionId point to a non-existent session
    // The component finds the session via project.dialectic_sessions.find(s => s.id === sessionIdFromStore)
    // So, to simulate session not found, we either make sessionIdFromStore be something not in mockProject.dialectic_sessions,
    // or provide a mockProject with no sessions or no matching session.
    setupStore({ 
      currentProjectDetail: { ...mockProject, dialectic_sessions: [mockSession] }, // mockProject has mockSession
      activeContextProjectId: mockProjectId, // Active project is mockProject
      activeContextSessionId: 'non-existent-session-id' // Active session ID does not match mockSession.id
    });
    // render(<SessionInfoCard projectId={mockProjectId} sessionId="non-existent-session" />); // Old direct render with props
    render(<SessionInfoCard />); // New direct render without props
    expect(screen.queryByTestId('markdown-renderer-mock')).not.toBeInTheDocument();
    // Check for "Loading Session Information..." or similar, as the session object would be undefined
    // The component has a specific loading state if !project || !session
    expect(screen.getByText('Loading Session Information...')).toBeInTheDocument(); 
  });

  it('shows placeholder if iteration user prompt content is empty but loaded', async () => {
    setupStore({
      contributionContentCache: {
        [iterationUserPromptPath]: {
          content: '', // Empty content
          isLoading: false,
          error: undefined,
          mimeType: 'text/markdown'
        }
      }
    });
    renderComponent();

    await waitFor(() => {
      // Assuming MarkdownRenderer handles empty content gracefully or a placeholder is shown
      expect(screen.getByText(/No specific prompt was set for this iteration./i)).toBeInTheDocument();
    });
  });
}); 