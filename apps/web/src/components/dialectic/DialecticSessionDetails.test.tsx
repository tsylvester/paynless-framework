import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticSessionDetails } from './DialecticSessionDetails';
import {
  DialecticProject,
  DialecticSession,
  DialecticContribution,
  DialecticStage,
} from '@paynless/types';
import { 
  initializeMockDialecticState, 
  getDialecticStoreState,
} from '@/mocks/dialecticStore.mock';

// Mock react-router-dom
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => mockUseParams(),
  };
});

// Mock the store at the top level to use our centralized mock
vi.mock('@paynless/store', () => import('@/mocks/dialecticStore.mock'));

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

const createMockContribution = (id: string, stage: DialecticStage, session_model_id: string): DialecticContribution => ({
  id,
  session_id: mockSessionId,
  user_id: 'user-xyz',
  iteration_number: 1,
  content_storage_bucket: 'bucket',
  content_storage_path: `path/${id}.md`,
  content_mime_type: 'text/markdown',
  content_size_bytes: 100,
  raw_response_storage_path: `path/${id}.json`,
  tokens_used_input: 10,
  tokens_used_output: 20,
  processing_time_ms: 1000,
  citations: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  model_id: session_model_id,
  model_name: 'GPT-4',
  prompt_template_id_used: 'tpl-thesis-1',
  stage: stage,
  seed_prompt_url: 'https://example.com/seed-prompt',
  edit_version: 1,
  is_latest_edit: true,
  original_model_contribution_id: null,
  target_contribution_id: null,
  error: null,
});

const mockThesisStage: DialecticStage = {
  id: 'stage-thesis',
  display_name: 'Thesis',
  slug: 'thesis',
  created_at: new Date().toISOString(),
  default_system_prompt_id: 'sys-prompt-thesis',
  description: 'Thesis stage',
  expected_output_artifacts: [],
  input_artifact_rules: [],
};

const mockAntithesisStage: DialecticStage = {
  id: 'stage-antithesis',
  display_name: 'Antithesis',
  slug: 'antithesis',
  created_at: new Date().toISOString(),
  default_system_prompt_id: 'sys-prompt-antithesis',
  description: 'Antithesis stage',
  expected_output_artifacts: [],
  input_artifact_rules: [],
};

const mockSession: DialecticSession = {
  id: mockSessionId,
  user_input_reference_url: 'https://example.com/user-input',
  selected_model_catalog_ids: ['cat-gpt4', 'cat-claude3opus'],
  project_id: mockProjectId,
  session_description: 'Test Session Description',
  iteration_count: 1,
  status: 'thesis_complete',
  convergence_status: 'pending',
  associated_chat_id: 'chat-123',
  current_stage_id: 'stage-thesis',
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
    createMockContribution('contrib-1', mockThesisStage, 'sm-1'),
    createMockContribution('contrib-2', mockThesisStage, 'sm-2'),
    createMockContribution('contrib-3', mockAntithesisStage, 'sm-1'),
  ],
};

const mockFullProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-xyz',
  project_name: 'Test Project',
  initial_user_prompt: 'Initial user prompt for the project.',
  initial_prompt_resource_id: null,
  selected_domain_id: 'dom-123',
  domain_name: 'Software Development',
  selected_domain_overlay_id: null,
  repo_url: null,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_sessions: [mockSession],
};

describe('DialecticSessionDetails', () => {
  beforeEach(() => {
    // Reset the mock store and params before each test for perfect isolation
    initializeMockDialecticState();
    vi.clearAllMocks();
  });

  it('fetches project details if not loaded or different projectId', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    
    // Case 1: No project loaded
    initializeMockDialecticState({ currentProjectDetail: null });
    render(<DialecticSessionDetails />);
    expect(getDialecticStoreState().fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);

    // Case 2: Different project loaded
    initializeMockDialecticState({ currentProjectDetail: { ...mockFullProject, id: 'other-project' } });
    render(<DialecticSessionDetails />);
    expect(getDialecticStoreState().fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
  });

  it('does not fetch if correct project details are already loaded', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    initializeMockDialecticState({ currentProjectDetail: mockFullProject });
    
    render(<DialecticSessionDetails />);
    expect(getDialecticStoreState().fetchDialecticProjectDetails).not.toHaveBeenCalled();
  });

  it('renders loading state', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    initializeMockDialecticState({ isLoadingProjectDetail: true, currentProjectDetail: null });

    const { container } = render(<DialecticSessionDetails />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    initializeMockDialecticState({ 
      projectDetailError: { code: 'FETCH_ERROR', message: 'Failed to fetch' },
      isLoadingProjectDetail: false,
      currentProjectDetail: null,
    });

    render(<DialecticSessionDetails />);
    expect(screen.getByText('Error Fetching Project Details')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders message if project not found after loading', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    initializeMockDialecticState({ currentProjectDetail: null, isLoadingProjectDetail: false });

    render(<DialecticSessionDetails />);
    expect(screen.getByText('Project details not found or not loaded yet.')).toBeInTheDocument();
  });

  it('renders message if session not found in project', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: 'non-existent-session' });
    initializeMockDialecticState({ currentProjectDetail: mockFullProject });

    render(<DialecticSessionDetails />);
    expect(screen.getByText('Session not found in this project.')).toBeInTheDocument();
  });

  it('renders session details and contributions correctly', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    initializeMockDialecticState({ currentProjectDetail: mockFullProject });

    render(<DialecticSessionDetails />);

    expect(screen.getByText(`Session: ${mockSession.session_description}`)).toBeInTheDocument();
    expect(screen.getByText(/Status: thesis_complete | Iteration: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Convergence: pending/)).toBeInTheDocument();

    // Check for contributions grouped by stage
    expect(screen.getByRole('heading', { name: /^Thesis$/i })).toBeInTheDocument();
    expect(screen.getByTestId('contribution-card-contrib-1')).toBeInTheDocument();
    expect(screen.getByTestId('contribution-card-contrib-2')).toBeInTheDocument();
    
    expect(screen.getByRole('heading', { name: /^Antithesis$/i })).toBeInTheDocument();
    expect(screen.getByTestId('contribution-card-contrib-3')).toBeInTheDocument();
  });

  it('renders "No contributions" message if session has no contributions', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    const sessionWithoutContributions = {
      ...mockSession,
      dialectic_contributions: [],
    };
    initializeMockDialecticState({
      currentProjectDetail: {
        ...mockFullProject,
        dialectic_sessions: [sessionWithoutContributions],
      },
    });
    
    render(<DialecticSessionDetails />);
    expect(screen.getByText('No contributions found for this session yet.')).toBeInTheDocument();
  });
}); 