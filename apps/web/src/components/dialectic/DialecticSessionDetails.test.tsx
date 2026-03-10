import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticSessionDetails } from './DialecticSessionDetails';
import {
  DialecticProject,
  DialecticSession,
  DialecticContribution,
  DialecticStage,
  DialecticProcessTemplate,
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
vi.mock('@paynless/store', async () => {
  const mockStoreActual = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>(
    '@/mocks/dialecticStore.mock'
  );
  return {
    ...mockStoreActual,
    // Ensure all named exports from the mock file are available here.
    // If specific selectors are still problematic, they can be explicitly returned:
    // selectCurrentProjectDetail: mockStoreActual.selectCurrentProjectDetail,
    // etc.
  };
});

// Mock child components
vi.mock('./SessionInfoCard', () => ({
  SessionInfoCard: vi.fn(() => <div data-testid="mock-session-info-card">Mock SessionInfoCard</div>),
}));

vi.mock('./StageTabCard', () => ({
  StageTabCard: () => <div data-testid="mock-stage-tab-card" />,
}));

vi.mock('./SessionContributionsDisplayCard', () => ({
  SessionContributionsDisplayCard: vi.fn(() => (
    <div data-testid="mock-session-contributions-display-card">Mock SessionContributionsDisplayCard</div>
  )),
}));

// Mock GeneratedContributionCard which is the actual component being rendered
vi.mock('./GeneratedContributionCard', () => ({
  GeneratedContributionCard: vi.fn(({ contributionId }) => (
    <div data-testid={`generated-contribution-card-${contributionId}`}>
      Generated Contribution: {contributionId}
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
  stage: stage.slug,
  seed_prompt_url: 'https://example.com/seed-prompt',
  edit_version: 1,
  is_latest_edit: true,
  original_model_contribution_id: null,
  target_contribution_id: null,
  error: null,
  contribution_type: 'generated',
  file_name: 'file.md',
  storage_bucket: 'bucket',
  storage_path: `path/${id}.md`,
  size_bytes: 100,
  mime_type: 'text/markdown',
});

const mockThesisStage: DialecticStage = {
  id: 'stage-thesis',
  display_name: 'Thesis',
  slug: 'thesis',
  created_at: new Date().toISOString(),
  default_system_prompt_id: 'sys-prompt-thesis',
  description: 'Thesis stage',
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const mockAntithesisStage: DialecticStage = {
  id: 'stage-antithesis',
  display_name: 'Antithesis',
  slug: 'antithesis',
  created_at: new Date().toISOString(),
  default_system_prompt_id: 'sys-prompt-antithesis',
  description: 'Antithesis stage',
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const mockProcessTemplate: DialecticProcessTemplate = {
  id: 'proc-tpl-1',
  name: 'Standard Dialectic',
  description: 'A standard Thesis-Antithesis process',
  created_at: new Date().toISOString(),
  stages: [mockThesisStage, mockAntithesisStage],
  transitions: [
    {
      id: 'trans-1',
      process_template_id: 'proc-tpl-1',
      source_stage_id: mockThesisStage.id,
      target_stage_id: mockAntithesisStage.id,
      created_at: new Date().toISOString(),   
      condition_description: 'From Thesis to Antithesis',
    }
  ],
  starting_stage_id: mockThesisStage.id,
};

const mockSession: DialecticSession = {
  id: mockSessionId,
  user_input_reference_url: 'https://example.com/user-input',
  selected_model_ids: ['cat-gpt4', 'cat-claude3opus'],
  project_id: mockProjectId,
  session_description: 'Test Session Description',
  iteration_count: 1,
  status: 'thesis_complete',
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
  selected_domain_overlay_id: null,
  repo_url: null,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_sessions: [mockSession],
  dialectic_domains: {name: 'Software Development'},
  dialectic_process_templates: {
    id: 'proc-tpl-1',
    name: 'Standard Dialectic',
    description: 'A standard Thesis-Antithesis process',
    created_at: new Date().toISOString(),
    stages: [mockThesisStage, mockAntithesisStage],
    starting_stage_id: mockThesisStage.id,
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

describe('DialecticSessionDetails', () => {
  beforeEach(() => {
    // Reset the mock store and params before each test for perfect isolation
    initializeMockDialecticState();
    vi.clearAllMocks();
  });

  it('fetches project details if not loaded or different projectId', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    
    // Case 1: No project loaded
    initializeMockDialecticState({ currentProjectDetail: null, isLoadingProjectDetail: false, projectDetailError: null });
    render(<DialecticSessionDetails />);
    expect(getDialecticStoreState().fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
    vi.mocked(getDialecticStoreState().fetchDialecticProjectDetails).mockClear();

    // Case 2: Different project loaded
    initializeMockDialecticState({ currentProjectDetail: { ...mockFullProject, id: 'other-project' }, isLoadingProjectDetail: false, projectDetailError: null });
    render(<DialecticSessionDetails />);
    expect(getDialecticStoreState().fetchDialecticProjectDetails).toHaveBeenCalledWith(mockProjectId);
  });

  it('does not fetch if correct project details are already loaded', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    
    initializeMockDialecticState({ currentProjectDetail: mockFullProject, isLoadingProjectDetail: false, projectDetailError: null });

    render(<DialecticSessionDetails />);
    expect(getDialecticStoreState().fetchDialecticProjectDetails).not.toHaveBeenCalled();
  });

  it('renders loading state', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });

    initializeMockDialecticState({ isLoadingProjectDetail: true, currentProjectDetail: null, projectDetailError: null });

    const { container } = render(<DialecticSessionDetails />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    const mockError = { code: 'FETCH_ERROR', message: 'Failed to fetch' };
    
    initializeMockDialecticState({ projectDetailError: mockError, isLoadingProjectDetail: false, currentProjectDetail: null });

    render(<DialecticSessionDetails />);
    expect(screen.getByText('Error Fetching Project Details')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders message if project not found after loading', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });

    initializeMockDialecticState({ currentProjectDetail: null, isLoadingProjectDetail: false, projectDetailError: null });

    render(<DialecticSessionDetails />);
    expect(screen.getByText('Project details not found or not loaded yet.')).toBeInTheDocument();
  });

  it('renders message if session not found in project', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: 'non-existent-session' });

    initializeMockDialecticState({ currentProjectDetail: mockFullProject, isLoadingProjectDetail: false, projectDetailError: null });

    render(<DialecticSessionDetails />);
    expect(screen.getByText('Session not found in this project.')).toBeInTheDocument();
  });

  it('renders session details and contributions correctly', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });

    initializeMockDialecticState({
      currentProjectDetail: mockFullProject,
      isLoadingProjectDetail: false,
      projectDetailError: null,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockThesisStage, 
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
    });

    render(<DialecticSessionDetails />);

    // Verify mocked child components are rendered
    expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-stage-tab-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-session-contributions-display-card')).toBeInTheDocument();
  });

  it('positions stage and document panels inside dedicated layout regions', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });

    initializeMockDialecticState({
      currentProjectDetail: mockFullProject,
      isLoadingProjectDetail: false,
      projectDetailError: null,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockThesisStage,
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
    });

    render(<DialecticSessionDetails />);

    const layoutRoot = screen.getByTestId('dialectic-session-details-layout');
    expect(layoutRoot.className).toContain('grid');

    const stageColumn = screen.getByTestId('dialectic-session-stage-column');
    expect(stageColumn).toBeInTheDocument();
    expect(stageColumn).toContainElement(screen.getByTestId('mock-stage-tab-card'));

    const documentColumn = screen.getByTestId('dialectic-session-document-column');
    expect(documentColumn).toBeInTheDocument();
    expect(documentColumn).toContainElement(
      screen.getByTestId('mock-session-contributions-display-card'),
    );
  });

  it('does NOT render SessionContributionsDisplayCard if activeContextStage is null', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    initializeMockDialecticState({
      currentProjectDetail: mockFullProject,
      isLoadingProjectDetail: false,
      projectDetailError: null,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: null, // Explicitly null
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
    });

    render(<DialecticSessionDetails />);
    expect(screen.queryByTestId('mock-session-contributions-display-card')).not.toBeInTheDocument();
  });

  it('renders the document workspace even when legacy contribution data is absent', () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    const sessionWithoutContributions = {
      ...mockSession,
      dialectic_contributions: [],
    };
    const projectWithEmptySession = {
        ...mockFullProject,
        dialectic_sessions: [sessionWithoutContributions],
    };

    initializeMockDialecticState({
      currentProjectDetail: projectWithEmptySession,
      isLoadingProjectDetail: false,
      projectDetailError: null,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockThesisStage,
      activeSessionDetail: { ...mockSession, dialectic_contributions: [] },
    });

    render(<DialecticSessionDetails />);
    const documentColumn = screen.getByTestId('dialectic-session-document-column');
    expect(documentColumn).toBeInTheDocument();
    expect(screen.getByTestId('mock-session-contributions-display-card')).toBeInTheDocument();
  });
}); 