import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import { 
  useDialecticStore, 
  // DialecticStore, // This type will come from @paynless/types
} from '@paynless/store';
import { 
  DialecticProject, 
  DialecticSession, 
  DialecticContribution, 
  AIModelCatalogEntry, 
  DialecticSessionModel,
  DialecticStore,
} from '@paynless/types';
import { vi, Mock } from 'vitest';
import { mockLocalContributionCache, resetDialecticStoreMocks } from '../mocks/dialecticStore.mock';

// Mock the @paynless/store module
vi.mock('@paynless/store', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>(); // Use Record for general object
  return {
    ...original,
    useDialecticStore: vi.fn(),
    // Selectors are part of the useDialecticStore mock via state, no need to mock them individually here
    // if the component accesses them via useDialecticStore(selector)
  };
});

const mockProjectId = 'project-123';
const mockSessionId = 'session-abc';

const mockModelCatalog: AIModelCatalogEntry[] = [
  { 
    id: 'openai/gpt-4', 
    provider_name: 'OpenAI', 
    model_name: 'GPT-4', 
    api_identifier: 'openai/gpt-4',
    description: 'GPT-4 is a powerful language model that can be used for a variety of tasks.',
    strengths: [],
    weaknesses: [],
    context_window_tokens: 8000, 
    input_token_cost_usd_millionths: 30, 
    output_token_cost_usd_millionths: 60, 
    max_output_tokens: 2000, 
    is_active: true, 
    created_at: '2023-01-01T00:00:00Z', 
    updated_at: '2023-01-01T00:00:00Z',
  },
  { 
    id: 'anthropic/claude-3-opus', 
    provider_name: 'Anthropic', 
    model_name: 'Claude 3 Opus', 
    api_identifier: 'anthropic/claude-3-opus',
    description: 'Claude 3 Opus is a powerful language model.',
    strengths: [],
    weaknesses: [],
    context_window_tokens: 200000, 
    input_token_cost_usd_millionths: 15, 
    output_token_cost_usd_millionths: 75, 
    max_output_tokens: 4000, 
    is_active: true, 
    created_at: '2023-01-01T00:00:00Z', 
    updated_at: '2023-01-01T00:00:00Z',
  },
];

const mockThesisContribution1: DialecticContribution = {
  id: 'contrib-thesis-1',
  session_id: mockSessionId,
  session_model_id: 'sm-1', // Corrected: was model_id, refers to DialecticSessionModel.id
  user_id: 'user-test',
  stage: 'thesis',
  iteration_number: 1,
  actual_prompt_sent: 'Test thesis prompt 1',
  content_storage_bucket: 'dialectic-contributions',
  content_storage_path: 'path/to/thesis1.md',
  content_mime_type: 'text/markdown',
  content_size_bytes: 100,
  raw_response_storage_path: 'path/to/thesis1-raw.json',
  tokens_used_input: 100,
  tokens_used_output: 200,
  processing_time_ms: 1000,
  citations: [],
  parent_contribution_id: null,
  created_at: '2023-01-01T10:00:00Z',
  updated_at: '2023-01-01T10:00:00Z',
};

const mockAntithesisContribution1: DialecticContribution = {
  id: 'contrib-antithesis-1',
  session_id: mockSessionId,
  session_model_id: 'sm-2', // Corrected: was model_id
  user_id: 'user-test',
  stage: 'antithesis',
  iteration_number: 1,
  actual_prompt_sent: 'Test antithesis prompt 1',
  content_storage_bucket: 'dialectic-contributions',
  content_storage_path: 'path/to/antithesis1.md',
  content_mime_type: 'text/markdown',
  content_size_bytes: 120,
  raw_response_storage_path: 'path/to/antithesis1-raw.json',
  tokens_used_input: 150,
  tokens_used_output: 250,
  processing_time_ms: 1200,
  citations: [],
  parent_contribution_id: 'contrib-thesis-1',
  created_at: '2023-01-01T11:00:00Z',
  updated_at: '2023-01-01T11:00:00Z',
};

const mockSessionModels: DialecticSessionModel[] = [
    { id: 'sm-1', session_id: mockSessionId, model_id: 'openai/gpt-4', model_role: null, created_at: '2023-01-01T09:00:00Z' },
    { id: 'sm-2', session_id: mockSessionId, model_id: 'anthropic/claude-3-opus', model_role: null, created_at: '2023-01-01T09:00:00Z' },
];

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session Description',
  status: 'antithesis_complete',
  iteration_count: 1,
  current_stage_seed_prompt: 'Initial seed prompt for thesis',
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
  dialectic_contributions: [mockThesisContribution1, mockAntithesisContribution1], // Assign contributions
  dialectic_session_models: mockSessionModels, // Assign session models
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-test',
  project_name: 'Test Project',
  initial_user_prompt: 'This is the initial user prompt for the project.',
  created_at: '2023-01-01T08:00:00Z',
  updated_at: '2023-01-01T08:00:00Z',
  status: 'active',
  sessions: [mockSession],
  selected_domain_tag: 'software_development',
  repo_url: 'https://github.com/paynless/test-project',
};

// Helper to create a fully typed mock store state for each test
const createMockStore = (overrides: Partial<DialecticStore> = {}): DialecticStore => {
  const defaultState: DialecticStore = {
    // DialecticStateValues
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    currentProjectDetail: null,
    isLoadingProjectDetail: false,
    projectDetailError: null,
    modelCatalog: mockModelCatalog, // Default to mockModelCatalog
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    contributionContentCache: { ...mockLocalContributionCache }, // Use a copy
    availableDomainTags: [],
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    isCreatingProject: false,
    createProjectError: null,
    isStartingSession: false,
    startSessionError: null,
    allSystemPrompts: null,

    // DialecticActions (mocked)
    fetchDialecticProjectDetails: vi.fn(),
    fetchContributionContent: vi.fn(),
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    fetchDialecticProjects: vi.fn(),
    fetchAIModelCatalog: vi.fn(),
    createDialecticProject: vi.fn(),
    startDialecticSession: vi.fn(),
    uploadProjectResourceFile: vi.fn(),
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    _resetForTesting: vi.fn(),
    ...overrides,
  };
  return defaultState;
};


describe('DialecticSessionDetailsPage', () => {
  let currentMockStore: DialecticStore;
  // const mockLocalFetchDialecticProjectDetails = vi.fn(); // Action is part of the store
  // const mockLocalFetchContributionContent = vi.fn(); // Action is part of the store

  beforeEach(() => {
    vi.clearAllMocks();
    resetDialecticStoreMocks(); // Resets parts of the shared mock if it mutates global state (like mockLocalContributionCache)
    
    // Initialize a fresh store for each test
    currentMockStore = createMockStore();

    // Configure the mock implementation for useDialecticStore for each test
    // The selector will receive the currentMockStore and pick parts from it.
    (useDialecticStore as unknown as Mock).mockImplementation((selector: (state: DialecticStore) => unknown) => {
      return selector(currentMockStore);
    });
  });

  const renderPage = () => {
    return render(
      <MemoryRouter initialEntries={[`/dialectic/${mockProjectId}/session/${mockSessionId}`]}>
        <Routes>
          <Route path="/dialectic/:projectId/session/:sessionId" element={<DialecticSessionDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('should render loading state initially when project details are not loaded', () => {
    currentMockStore.isLoadingProjectDetail = true;
    // currentMockStore.modelCatalog = mockModelCatalog; // Already set in createMockStore by default

    renderPage();
    // Check for one of the skeleton texts, as the exact overall text might change
    expect(screen.getAllByText((content, element) => {
      if (!element) return false;
      return element.classList.contains('h-8') && element.classList.contains('w-3/4');
    }).length).toBeGreaterThan(0);
    expect(currentMockStore.fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
  });

  it('should render error state if fetching project details fails', () => {
    currentMockStore.projectDetailError = { message: 'Failed to load project', code: 'FETCH_ERROR' };
    // currentMockStore.modelCatalog = mockModelCatalog;

    renderPage();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load project')).toBeInTheDocument();
  });

  it('should render error state if session is not found in project details', () => {
    currentMockStore.currentProjectDetail = { ...mockProject, sessions: [] }; // Project has no sessions
    // currentMockStore.modelCatalog = mockModelCatalog;
    
    renderPage();
    expect(screen.getByText(/Session Not Found/i)).toBeInTheDocument();
    expect(screen.getByText(`The session with ID '${mockSessionId}' was not found in project '${mockProject.project_name}'.`)).toBeInTheDocument();
  });
  
  describe('when project and session data are loaded', () => {
    beforeEach(() => {
      currentMockStore.currentProjectDetail = mockProject;
      currentMockStore.isLoadingProjectDetail = false;
      currentMockStore.projectDetailError = null;
      // currentMockStore.modelCatalog = mockModelCatalog; // Default
      // Pre-fill cache for direct rendering
      currentMockStore.contributionContentCache['contrib-thesis-1'] = { content: 'Thesis content from OpenAI GPT-4', isLoading: false, error: undefined, mimeType: 'text/markdown', signedUrl: 'url1', expiry: Date.now() + 3600000, sizeBytes:100  };
      currentMockStore.contributionContentCache['contrib-antithesis-1'] = { content: 'Antithesis content from Anthropic Claude 3 Opus', isLoading: false, error: undefined, mimeType: 'text/markdown', signedUrl: 'url2', expiry: Date.now() + 3600000, sizeBytes:120 };
      
      renderPage();
    });

    it('should display session description and status', () => {
      expect(screen.getByText(`Session: ${mockSession.session_description!}`)).toBeInTheDocument();
      expect(screen.getByText(mockSession.status)).toBeInTheDocument(); // Badge renders the status text directly
      expect(screen.getByText(mockProject.project_name)).toBeInTheDocument();
    });

    it('should have tabs for Thesis and Antithesis', () => {
      expect(screen.getByRole('tab', { name: /^Thesis \(\d+\)$/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^Antithesis \(\d+\)$/i })).toBeInTheDocument();
    });

    it('should display Thesis contributions', async () => {
      const thesisTab = screen.getByRole('tab', { name: /^Thesis \(\d+\)$/i });
      thesisTab.click();

      await waitFor(() => {
        expect(screen.getByText('OpenAI GPT-4 says:')).toBeInTheDocument();
        expect(screen.getByText('Thesis content from OpenAI GPT-4')).toBeInTheDocument();
      });
      // Content is pre-cached, so fetchContributionContent should not be called for this item after initial load logic (if any)
      // Check if it was called for an item *not* in cache if that's the scenario you want to test.
      // For this test, we assume it might be called once if component logic tries to fetch if not loaded.
      // If it's strictly "load if not isLoading and no content/error", then with pre-cached content, it might not call.
      // Let's assume the component's useEffect will run and see data is there.
    });
    
    it('should display Antithesis contributions', async () => {
      const antithesisTab = screen.getByRole('tab', { name: /^Antithesis \(\d+\)$/i });
      antithesisTab.click();

      // Wait for the "Antithesis Contributions" title to appear and be visible
      const antithesisPanelTitle = await screen.findByText('Antithesis');
      expect(antithesisPanelTitle).toBeVisible();

      // Now that the panel is confirmed visible, check for the specific contribution details
      expect(screen.getByText(/^Anthropic Claude 3 Opus critiques OpenAI GPT-4 \(Contribution ID: contrib-t\.\.\. \)$/i)).toBeInTheDocument();
      expect(screen.getByText('Antithesis content from Anthropic Claude 3 Opus')).toBeInTheDocument();
    });

    // Removed placeholder cost test
  });

  it('should call fetchDialecticProjectDetails if project details are not initially loaded (and not loading)', () => {
    currentMockStore.currentProjectDetail = null;
    currentMockStore.isLoadingProjectDetail = false; 
    currentMockStore.projectDetailError = null;
    // currentMockStore.modelCatalog = mockModelCatalog;

    renderPage();
    expect(currentMockStore.fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
  });
});

// Basic accessibility test placeholder
describe('DialecticSessionDetailsPage Accessibility (Placeholder)', () => {
    // Need to define currentMockStore and renderPage within this scope or pass them
    let currentMockStoreAcc: DialecticStore;
    const renderPageAcc = () => { // Define renderPage for this scope
        return render(
          <MemoryRouter initialEntries={[`/dialectic/${mockProjectId}/session/${mockSessionId}`]}>
            <Routes>
              <Route path="/dialectic/:projectId/session/:sessionId" element={<DialecticSessionDetailsPage />} />
            </Routes>
          </MemoryRouter>
        );
      };

    beforeEach(() => { // Setup mock store for accessibility tests
        vi.clearAllMocks();
        resetDialecticStoreMocks();
        currentMockStoreAcc = createMockStore({
            currentProjectDetail: mockProject,
            isLoadingProjectDetail: false,
            projectDetailError: null,
            modelCatalog: mockModelCatalog,
            contributionContentCache: {
                'contrib-thesis-1': { content: 'Thesis content', isLoading: false, error: undefined, mimeType: 'text/markdown', signedUrl: 'url1', expiry: Date.now() + 3600000, sizeBytes: 100 },
                'contrib-antithesis-1': { content: 'Antithesis content', isLoading: false, error: undefined, mimeType: 'text/markdown', signedUrl: 'url2', expiry: Date.now() + 3600000, sizeBytes: 120 },
            }
        });
        (useDialecticStore as unknown as Mock).mockImplementation((selector: (state: DialecticStore) => unknown) => {
            return selector(currentMockStoreAcc);
          });
    });

    it('should not have automatically detectable accessibility issues (basic check)', async () => {
      const { container } = renderPageAcc();
      expect(container).toBeInTheDocument();
      // Add more meaningful accessibility checks later, e.g., using axe-core
    });
}); 