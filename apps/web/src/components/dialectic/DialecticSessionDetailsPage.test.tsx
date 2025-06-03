import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import { 
    DialecticProject, 
    DialecticSession, 
    DialecticContribution, 
    ApiError, 
    DialecticStateValues, 
} from '@paynless/types';

// Mock react-router-dom
const mockUseParams = vi.fn();
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useParams: () => mockUseParams(),
}));

// Mock store
const mockFetchProjectDetails = vi.fn();
let mockProjectDetail: DialecticProject | null = null;
let mockIsLoadingProjectDetail = false;
let mockProjectDetailError: ApiError | null = null;

// Define an interface for the parts of the store module we are using/mocking
interface MockStoreModule {
  selectCurrentProjectDetail: (state: DialecticStateValues) => DialecticProject | null;
  selectIsLoadingProjectDetail: (state: DialecticStateValues) => boolean;
  selectProjectDetailError: (state: DialecticStateValues) => ApiError | null;
  useDialecticStore: (selector: (state: DialecticStateValues) => DialecticStateValues) => DialecticStateValues; // Simplified for mock
  // Add other selectors or actions if they are directly imported by the component under test
}

vi.mock('@paynless/store', async (importOriginal) => {
  const actualStore = await importOriginal() as MockStoreModule; // Cast to the defined interface
  return {
    // Provide the actual selectors from the original module so they can be imported by the component
    selectCurrentProjectDetail: actualStore.selectCurrentProjectDetail,
    selectIsLoadingProjectDetail: actualStore.selectIsLoadingProjectDetail,
    selectProjectDetailError: actualStore.selectProjectDetailError,
    // Add any other named exports from '@paynless/store' that DialecticSessionDetailsPage.tsx
    // might import. For now, these cover the imports shown in DialecticSessionDetailsPage.tsx.

    // Mock useDialecticStore
    useDialecticStore: vi.fn((selectorOrActionAccessor) => {
      // This mockState should align with DialecticStateValues for the actual selectors to work.
      const mockState: Partial<DialecticStateValues> = { // Use Partial for easier mock state construction
        currentProjectDetail: mockProjectDetail,
        isLoadingProjectDetail: mockIsLoadingProjectDetail,
        projectDetailError: mockProjectDetailError,
        // fetchDialecticProjectDetails is accessed via (s) => s.fetchDialecticProjectDetails
        // So, it should be part of the state passed to the accessor function.
        // The DialecticStateValues doesn't include actions, DialecticStore type does.
        // For selectors, only state values are needed. For action accessors, actions are needed.
        // Let's adjust mockState to be closer to DialecticStateValues and handle actions separately if needed.
      };
      
      // The selectorOrActionAccessor could be an action like (s: DialecticStore) => s.fetchDialecticProjectDetails
      // or a selector like selectCurrentProjectDetail.
      // Our mock useDialecticStore needs to provide the necessary structure for both.
      // The actual selectors will operate on mockState. Action accessors also operate on a state-like object.
      
      const fullMockStateForSelector = {
        ...mockState,
        // Add any other required DialecticStateValues fields here with default/mock values
        // For now, currentProjectDetail, isLoadingProjectDetail, projectDetailError are the ones used by selectors.
        // Add other state values that actual selectors might need from DialecticStateValues
        availableDomainTags: [],
        isLoadingDomainTags: false,
        domainTagsError: null,
        selectedDomainTag: null,
        projects: [],
        isLoadingProjects: false,
        projectsError: null,
        modelCatalog: [],
        isLoadingModelCatalog: false,
        modelCatalogError: null,
        isCreatingProject: false,
        createProjectError: null,
        isStartingSession: false,
        startSessionError: null,
        contributionContentCache: {},
      } as DialecticStateValues;

      const mockStoreActions = {
        fetchDialecticProjectDetails: mockFetchProjectDetails,
        // ... other actions if needed by the component
      };

      const stateForAccessor = { ...fullMockStateForSelector, ...mockStoreActions };

      if (typeof selectorOrActionAccessor === 'function') {
        // This will execute the actual selector (e.g., selectCurrentProjectDetail) against our fullMockStateForSelector,
        // or an action accessor like (s) => s.fetchDialecticProjectDetails against stateForAccessor.
        return selectorOrActionAccessor(stateForAccessor);
      }
      return stateForAccessor; 
    }),
  };
});

// Mock ContributionCard
vi.mock('./ContributionCard', () => ({
  ContributionCard: vi.fn(({ title, contributionId }) => (
    <div data-testid={`contribution-card-${contributionId}`} data-title={title}>
      Contribution: {title} (ID: {contributionId})
    </div>
  )),
}));

const mockProjectId = 'proj-123';
const mockSessionId = 'sess-abc';

const createMockContribution = (id: string, stage: string, session_model_id: string): DialecticContribution => ({
  id,
  session_id: mockSessionId,
  session_model_id,
  user_id: 'user-xyz',
  stage,
  iteration_number: 1,
  actual_prompt_sent: `Prompt for ${stage}`,
  content_storage_bucket: 'bucket',
  content_storage_path: `path/${id}.md`,
  content_mime_type: 'text/markdown',
  content_size_bytes: 100,
  raw_response_storage_path: `path/${id}.json`,
  tokens_used_input: 10,
  tokens_used_output: 20,
  processing_time_ms: 1000,
  citations: null,
  parent_contribution_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session Description',
  current_stage_seed_prompt: 'Initial seed prompt for the current stage.',
  iteration_count: 1,
  status: 'thesis_complete',
  associated_chat_id: 'chat-123',
  active_thesis_prompt_template_id: 'tpl-thesis-1',
  active_antithesis_prompt_template_id: 'tpl-antithesis-1',
  active_synthesis_prompt_template_id: null,
  active_parenthesis_prompt_template_id: null,
  active_paralysis_prompt_template_id: null,
  formal_debate_structure_id: null,
  max_iterations: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_session_models: [
    { 
      id: 'sm-1', 
      session_id: mockSessionId, 
      model_id: 'gpt-4', 
      model_role: 'generator', 
      created_at: new Date().toISOString(), 
      ai_provider: { 
        id: 'cat-gpt4', 
        provider_name: 'OpenAI', 
        model_name: 'GPT-4', 
        api_identifier: 'gpt-4', 
        description: 'OpenAI GPT-4 model',
        strengths: ['reasoning', 'creativity'],
        weaknesses: ['cost'],
        context_window_tokens: 8192,
        input_token_cost_usd_millionths: 30,
        output_token_cost_usd_millionths: 60,
        max_output_tokens: 4096,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } 
    },
    { 
      id: 'sm-2', 
      session_id: mockSessionId, 
      model_id: 'claude-3', 
      model_role: 'critiquer', 
      created_at: new Date().toISOString(), 
      ai_provider: { 
        id: 'cat-claude3opus', 
        provider_name: 'Anthropic', 
        model_name: 'Claude 3 Opus', 
        api_identifier: 'claude-3-opus-20240229',
        description: 'Anthropic Claude 3 Opus model',
        strengths: ['analysis', 'long context'],
        weaknesses: ['availability'],
        context_window_tokens: 200000,
        input_token_cost_usd_millionths: 15,
        output_token_cost_usd_millionths: 75,
        max_output_tokens: 4096,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } 
    },
  ],
  dialectic_contributions: [
    createMockContribution('contrib-1', 'thesis', 'sm-1'),
    createMockContribution('contrib-2', 'thesis', 'sm-2'),
    createMockContribution('contrib-3', 'antithesis', 'sm-1'),
  ],
  convergence_status: 'pending',
};

const mockFullProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-xyz',
  project_name: 'Test Project',
  initial_user_prompt: 'Initial user prompt for the project.',
  selected_domain_tag: 'software_development',
  repo_url: null,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  sessions: [mockSession],
};


describe('DialecticSessionDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    mockProjectDetail = null;
    mockIsLoadingProjectDetail = false;
    mockProjectDetailError = null;
  });

  it('fetches project details if not loaded or different projectId', () => {
    mockProjectDetail = null; // Not loaded
    render(<DialecticSessionDetailsPage />);
    expect(mockFetchProjectDetails).toHaveBeenCalledWith(mockProjectId);

    mockFetchProjectDetails.mockClear();
    mockProjectDetail = { ...mockFullProject, id: 'other-proj-id' }; // Different project loaded
    render(<DialecticSessionDetailsPage />);
    expect(mockFetchProjectDetails).toHaveBeenCalledWith(mockProjectId);
  });

  it('does not fetch if correct project details are already loaded', () => {
    mockProjectDetail = mockFullProject;
    render(<DialecticSessionDetailsPage />);
    expect(mockFetchProjectDetails).not.toHaveBeenCalled();
  });

  it('renders loading state', () => {
    mockIsLoadingProjectDetail = true;
    const { container } = render(<DialecticSessionDetailsPage />);
    // Query by a class specific to the Skeleton component, e.g., 'animate-pulse'
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state', () => {
    mockProjectDetailError = { code: 'FETCH_ERROR', message: 'Failed to fetch' };
    render(<DialecticSessionDetailsPage />);
    expect(screen.getByText('Error Fetching Project Details')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders message if project not found after loading', () => {
    mockProjectDetail = null; // Simulates loaded but not found
    mockIsLoadingProjectDetail = false;
    render(<DialecticSessionDetailsPage />);
    expect(screen.getByText('Project details not found or not loaded yet.')).toBeInTheDocument();
  });

  it('renders message if session not found in project', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: 'nonexistent-session-id' });
    mockProjectDetail = mockFullProject;
    render(<DialecticSessionDetailsPage />);
    expect(screen.getByText('Session not found in this project.')).toBeInTheDocument();
  });

  it('renders session details and contributions correctly', () => {
    mockProjectDetail = mockFullProject;
    render(<DialecticSessionDetailsPage />);

    expect(screen.getByText(`Session: ${mockSession.session_description}`)).toBeInTheDocument();
    expect(screen.getByText(/Status: thesis_complete | Iteration: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Convergence: pending/)).toBeInTheDocument();
    expect(screen.getByText('Current Stage Seed Prompt:')).toBeInTheDocument();
    expect(screen.getByText(mockSession.current_stage_seed_prompt!)).toBeInTheDocument();

    // Use getByRole with specific word boundary regex for heading elements
    expect(screen.getByRole('heading', { name: /\bthesis\b/i, level: 2 })).toBeInTheDocument();
    const thesisContrib1 = screen.getByTestId('contribution-card-contrib-1');
    expect(thesisContrib1).toBeInTheDocument();
    expect(thesisContrib1).toHaveAttribute('data-title', 'OpenAI GPT-4');
    const thesisContrib2 = screen.getByTestId('contribution-card-contrib-2');
    expect(thesisContrib2).toBeInTheDocument();
    expect(thesisContrib2).toHaveAttribute('data-title', 'Anthropic Claude 3 Opus');
    
    expect(screen.getByRole('heading', { name: /\bantithesis\b/i, level: 2 })).toBeInTheDocument();
    const antithesisContrib = screen.getByTestId('contribution-card-contrib-3');
    expect(antithesisContrib).toBeInTheDocument();
    expect(antithesisContrib).toHaveAttribute('data-title', 'OpenAI GPT-4');

    // Check that synthesis, parenthesis, paralysis are not rendered if no contributions
    expect(screen.queryByRole('heading', { name: /\bsynthesis\b/i, level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /\bparenthesis\b/i, level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /\bparalysis\b/i, level: 2 })).not.toBeInTheDocument();
  });

  it('renders "No contributions" message if session has no contributions', () => {
    mockProjectDetail = {
      ...mockFullProject,
      sessions: [{ ...mockSession, dialectic_contributions: [] }],
    };
    render(<DialecticSessionDetailsPage />);
    expect(screen.getByText('No contributions found for this session yet.')).toBeInTheDocument();
  });

}); 