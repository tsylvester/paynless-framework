import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import { setDialecticStateValues, resetDialecticStoreMock, mockActivateProjectAndSessionContextForDeepLink } from '../mocks/dialecticStore.mock';
import type {
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticProcessTemplate,
  ApiError,
  DialecticStore,
} from '@paynless/types';

// Import the type for the DialecticStore to correctly type the state in the mock
// Use the centralized mock for the store, and now import the selectors
vi.mock('@paynless/store', async () => {
  const actualMock = await import('../mocks/dialecticStore.mock');
  return {
    ...actualMock,
  };
});

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
vi.mock('../components/dialectic/SessionInfoCard', async () => {
  // Directly import the hook from our mock implementation
  const { useDialecticStore } = await vi.importActual<typeof import('../mocks/dialecticStore.mock')>('../mocks/dialecticStore.mock');
  
  return {
    SessionInfoCard: () => {
      // Use the store to get the session, similar to the real component
      const session = useDialecticStore((state: DialecticStore) => state.activeSessionDetail);
      return <div data-testid="mock-session-info-card">{session?.session_description}</div>;
    }
  };
});
vi.mock('../components/dialectic/StageTabCard', () => ({
  StageTabCard: () => <div data-testid="mock-stage-tab-card" />,
}));
vi.mock('../components/dialectic/SessionContributionsDisplayCard', () => ({ SessionContributionsDisplayCard: () => <div data-testid="mock-session-contributions-display-card" /> }));

// Define Mocks
const mockProjectId = 'project-123';
const mockSessionId = 'session-abc';
const mockOtherSessionId = 'session-xyz';

const mockStages: DialecticStage[] = [
    { id: 'stage-1', slug: 'hypothesis', display_name: 'Hypothesis', description: 'desc', created_at: 'now', default_system_prompt_id: 'p1', recipe_template_id: 'rt-1', expected_output_template_ids: ['ot-1'], active_recipe_instance_id: null },
    { id: 'stage-2', slug: 'antithesis', display_name: 'Antithesis', description: 'desc', created_at: 'now', default_system_prompt_id: 'p1', recipe_template_id: 'rt-1', expected_output_template_ids: ['ot-1'], active_recipe_instance_id: null },
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
  selected_model_ids: [],
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
  selected_model_ids: [],
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
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
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
    setDialecticStateValues({
      activeContextProjectId: null,
      activeContextSessionId: null,
      activeSessionDetail: null,
    });
    
    renderWithRouter({});

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(mockProjectId, mockSessionId);
    });
  });

  it('Scenario 2: should call activateProjectAndSessionContextForDeepLink when project context matches but session context differs', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockOtherSessionId,
      activeSessionDetail: mockOtherSession,
      currentProjectDetail: mockProject,
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(mockProjectId, mockSessionId);
    });
  });
  
  it('Scenario 2b: should call activateProjectAndSessionContextForDeepLink when project and session ID in context match, but activeSessionDetail is null', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: null,
      currentProjectDetail: mockProject,
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(mockProjectId, mockSessionId);
    });
  });

  it('Scenario 3: should NOT call activateProjectAndSessionContextForDeepLink if context is already aligned and session details are present', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeContextStage: mockStages[0],
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
    });
    expect(mockActivateProjectAndSessionContextForDeepLink).not.toHaveBeenCalled();
  });

  it('Scenario 4: should render correctly using store-derived context after hydration', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeStageSlug: mockStages[0].slug,
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: null,
    });

    renderWithRouter({});

    await waitFor(() => {
      if (mockSession.session_description) {
        expect(screen.getByTestId('mock-session-info-card')).toHaveTextContent(mockSession.session_description);
      } else {
        // Handle the case where session_description is null, if necessary,
        // or assert that the component handles it gracefully.
        // For now, we just ensure the test doesn't crash.
      }
    });
    
    expect(screen.getByTestId('mock-stage-tab-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-session-contributions-display-card')).toBeInTheDocument();
  });

  it('Scenario 5: should display loading UI when isLoadingActiveSessionDetail is true', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: null,
      isLoadingActiveSessionDetail: true,
      currentProjectDetail: null,
    });

    renderWithRouter({});
    await waitFor(() => {
        expect(screen.queryByText(/Loading session details.../i) || screen.queryByTestId('loading-skeleton')).toBeTruthy();
    });
  });

  it('Scenario 6: should display error UI when activeSessionDetailError is present', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    const mockError: ApiError = { message: 'Failed to fetch session details', code: 'FETCH_ERROR' };
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: null,
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: mockError,
      currentProjectDetail: null,
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByText('Error Loading Session')).toBeInTheDocument();
      if (mockError.message) {
        expect(screen.getByText(mockError.message)).toBeInTheDocument();
      }
    });
  });

  it('progress bar reflects activeStageSlug not activeContextStage', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeStageSlug: 'antithesis',
      activeContextStage: mockStages[0],
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: null,
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByTestId('mock-stage-tab-card')).toBeInTheDocument();
    });

    expect(screen.getByText('2/2')).toBeInTheDocument();
    const progressSection = screen.getByText('Progress').closest('.space-y-3');
    expect(progressSection).toHaveTextContent('100% complete');
  });

  it('progress bar does not update when activeContextStage changes but activeStageSlug is constant', async () => {
    mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
    setDialecticStateValues({
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeStageSlug: 'hypothesis',
      activeContextStage: mockStages[0],
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: null,
    });

    renderWithRouter({});

    await waitFor(() => {
      expect(screen.getByText('1/2')).toBeInTheDocument();
    });

    act(() => {
      setDialecticStateValues({ activeContextStage: mockStages[1] });
    });

    expect(screen.getByText('1/2')).toBeInTheDocument();
    const progressSection = screen.getByText('Progress').closest('.space-y-3');
    expect(progressSection).toHaveTextContent('50% complete');
  });
}); 