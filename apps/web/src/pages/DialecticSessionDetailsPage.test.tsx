import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import { setDialecticState, resetDialecticStoreMock, getDialecticStoreState, mockActivateProjectAndSessionContextForDeepLink } from '../mocks/dialecticStore.mock';
import type {
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticProcessTemplate,
  ApiError,
} from '@paynless/types';

// Use the centralized mock for the store
vi.mock('@paynless/store', () => import('../mocks/dialecticStore.mock'));

// Mock useParams
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
  };
});

// Mock child components
vi.mock('../components/dialectic/SessionInfoCard', () => ({ SessionInfoCard: ({ session }: { session: DialecticSession }) => <div data-testid="mock-session-info-card">{session?.session_description}</div> }));
vi.mock('../components/dialectic/StageTabCard', () => ({
  StageTabCard: ({ stage, isActiveStage }: { stage: DialecticStage; isActiveStage: boolean }) => (
    <div data-testid={`mock-stage-tab-card-${stage.slug}`} data-active={String(isActiveStage)}>
      {stage.display_name}
    </div>
  ),
}));
vi.mock('../components/dialectic/SessionContributionsDisplayCard', () => ({ SessionContributionsDisplayCard: () => <div data-testid="mock-session-contributions-display-card" /> }));

// Define Mocks
const mockProjectId = 'project-123';
const mockSessionId = 'session-abc';
const mockOtherProjectId = 'project-789';
const mockOtherSessionId = 'session-xyz';

const mockStages: DialecticStage[] = [
    { id: 'stage-1', slug: 'hypothesis', display_name: 'Hypothesis', description: 'desc', created_at: 'now', default_system_prompt_id: 'p1', input_artifact_rules: {}, expected_output_artifacts: {}},
    { id: 'stage-2', slug: 'antithesis', display_name: 'Antithesis', description: 'desc', created_at: 'now', default_system_prompt_id: 'p1', input_artifact_rules: {}, expected_output_artifacts: {}},
];

const mockProcessTemplate: DialecticProcessTemplate = {
  id: 'pt-1',
  name: 'Standard Dialectic',
  description: 'A standard process',
  created_at: 'now',
  stages: mockStages,
  starting_stage_id: 'stage-1',
};

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  session_description: 'Test Session Description',
  current_stage_id: mockStages[0].id,
  iteration_count: 1,
  created_at: '2023-01-01T09:00:00Z',
  updated_at: '2023-01-01T11:05:00Z',
  status: 'active',
  associated_chat_id: null,
  user_input_reference_url: null,
  selected_model_catalog_ids: [],
};

const mockOtherSession: DialecticSession = {
  id: mockOtherSessionId,
  project_id: mockProjectId,
  session_description: 'Other Test Session',
  current_stage_id: mockStages[1].id,
  iteration_count: 1,
  created_at: '2023-01-02T09:00:00Z',
  updated_at: '2023-01-02T11:05:00Z',
  status: 'active',
  associated_chat_id: null,
  user_input_reference_url: null,
  selected_model_catalog_ids: [],
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  user_id: 'user-test',
  project_name: 'Test Project',
  initial_user_prompt: 'This is the initial user prompt.',
  created_at: '2023-01-01T08:00:00Z',
  updated_at: '2023-01-01T08:00:00Z',
  dialectic_sessions: [mockSession, mockOtherSession],
  repo_url: null,
  selected_domain_id: 'domain-1',
  dialectic_domains: { name: 'Software Development' },
  selected_domain_overlay_id: 'overlay-1',
  status: 'active',
  process_template_id: 'pt-1',
  dialectic_process_templates: mockProcessTemplate,
};

const renderWithRouter = (
  {
    route = `/dialectic/${mockProjectId}/session/${mockSessionId}`,
    path = '/dialectic/:projectId/session/:sessionId',
  }: { route?: string; path?: string; } = {},
) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={<DialecticSessionDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('DialecticSessionDetailsPage', () => {
  beforeEach(() => {
    resetDialecticStoreMock();
    mockUseParams.mockClear();
    mockActivateProjectAndSessionContextForDeepLink.mockClear();
  });

  it('Scenario 1: should call activateProjectAndSessionContextForDeepLink when no relevant context is set', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticState({
      activeContextProjectId: null,
      activeContextSessionId: null,
      activeSessionDetail: null,
      fetchDialecticProjectDetails: vi.fn(),
    });
    
    renderWithRouter({});

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(mockProjectId, mockSessionId);
    });
  });

  it('Scenario 2: should call activateProjectAndSessionContextForDeepLink when project context matches but session context differs', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticState({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockOtherSessionId,
      activeSessionDetail: mockOtherSession,
      currentProjectDetail: mockProject,
      fetchDialecticProjectDetails: vi.fn(),
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(mockProjectId, mockSessionId);
    });
  });
  
  it('Scenario 2b: should call activateProjectAndSessionContextForDeepLink when project and session ID in context match, but activeSessionDetail is null', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticState({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: null,
      currentProjectDetail: mockProject,
      fetchDialecticProjectDetails: vi.fn(),
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(mockProjectId, mockSessionId);
    });
  });

  it('Scenario 3: should NOT call activateProjectAndSessionContextForDeepLink if context is already aligned and session details are present', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticState({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockStages[0],
      fetchDialecticProjectDetails: vi.fn(),
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
    });
    expect(mockActivateProjectAndSessionContextForDeepLink).not.toHaveBeenCalled();
  });

  it('Scenario 4: should render correctly using store-derived context after hydration', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticState({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockStages[0],
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: null,
      fetchDialecticProjectDetails: vi.fn(),
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByTestId('mock-session-info-card')).toHaveTextContent(mockSession.session_description);
    });
    
    const hypothesisTab = screen.getByTestId('mock-stage-tab-card-hypothesis');
    expect(hypothesisTab).toHaveAttribute('data-active', 'true');
    expect(hypothesisTab).toHaveTextContent(mockStages[0].display_name);

    const antithesisTab = screen.getByTestId('mock-stage-tab-card-antithesis');
    expect(antithesisTab).toHaveAttribute('data-active', 'false');

    expect(screen.getByTestId('mock-session-contributions-display-card')).toBeInTheDocument();
  });

  it('Scenario 5: should display loading UI when isLoadingActiveSessionDetail is true', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticState({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: null,
      isLoadingActiveSessionDetail: true,
      currentProjectDetail: null,
      fetchDialecticProjectDetails: vi.fn(),
    });

    renderWithRouter({});
    await waitFor(() => {
        expect(screen.queryByText(/Loading session details.../i) || screen.queryByTestId('loading-skeleton')).toBeTruthy();
    });
  });

  it('Scenario 6: should display error UI when activeSessionDetailError is present', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    const mockError: ApiError = { message: 'Failed to fetch session details', code: 'FETCH_ERROR' };
    setDialecticState({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: null,
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: mockError,
      currentProjectDetail: null,
      fetchDialecticProjectDetails: vi.fn(),
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByText(mockError.message)).toBeInTheDocument();
    });
  });
}); 