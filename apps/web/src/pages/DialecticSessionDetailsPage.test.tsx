import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { DialecticSessionDetailsPage } from './DialecticSessionDetailsPage';
import {
  setDialecticStateValues,
  resetDialecticStoreMock,
  mockActivateProjectAndSessionContextForDeepLink,
  selectSelectedModels,
  getDialecticStoreActionMock,
} from '../mocks/dialecticStore.mock';
import type {
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticProcessTemplate,
  ApiError,
  DialecticStore,
  SelectedModels,
} from '@paynless/types';

// Import the type for the DialecticStore to correctly type the state in the mock
// Use the centralized mock for the store, and now import the selectors
vi.mock('@paynless/store', async () => {
  const actualMock = await import('../mocks/dialecticStore.mock');
  return {
    ...actualMock,
  };
});

// Mock useParams and useNavigate
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useNavigate: vi.fn(),
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
vi.mock('../components/common/DynamicProgressBar', () => ({
  DynamicProgressBar: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="dynamic-progress-bar-mock" data-session-id={sessionId} />
  ),
}));

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
  selected_models: [],
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
  selected_models: [],
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

const sessionPagePath = '/dialectic/:projectId/session/:sessionId';

const renderWithRouter = (
  {
    route = `/dialectic/${mockProjectId}/session/${mockSessionId}`,
    path = sessionPagePath,
    locationState,
  }: { route?: string; path?: string; locationState?: { autoStartGeneration?: boolean } } = {},
) => {
  const initialEntries = locationState !== undefined
    ? [{ pathname: route, state: locationState }]
    : [route];
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path={path} element={<DialecticSessionDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('DialecticSessionDetailsPage', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    resetDialecticStoreMock();
    mockUseParams.mockClear();
    mockActivateProjectAndSessionContextForDeepLink.mockClear();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
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

  describe('auto-start generation effect', () => {
    const fullContextState = {
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      activeSessionDetail: mockSession,
      currentProjectDetail: mockProject,
      currentProcessTemplate: mockProcessTemplate,
      activeStageSlug: mockStages[0].slug,
      isLoadingActiveSessionDetail: false,
      activeSessionDetailError: null,
    };

    const defaultModels: SelectedModels[] = [{ id: 'model-1', displayName: 'Model One' }];

    it('fires autoStartGeneration when location.state.autoStartGeneration is true and all context is loaded', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue(defaultModels);

      renderWithRouter({ locationState: { autoStartGeneration: true } });

      await waitFor(() => {
        expect(getDialecticStoreActionMock('autoStartGeneration')).toHaveBeenCalledTimes(1);
      });
      expect(mockNavigate).toHaveBeenCalledWith(
        `/dialectic/${mockProjectId}/session/${mockSessionId}`,
        { replace: true, state: {} },
      );
    });

    it('does NOT fire autoStartGeneration when location.state.autoStartGeneration is absent', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue(defaultModels);

      renderWithRouter({});

      await waitFor(() => {
        expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
      });
      expect(getDialecticStoreActionMock('autoStartGeneration')).not.toHaveBeenCalled();
    });

    it('does NOT fire autoStartGeneration when location.state.autoStartGeneration is false', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue(defaultModels);

      renderWithRouter({ locationState: { autoStartGeneration: false } });

      await waitFor(() => {
        expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
      });
      expect(getDialecticStoreActionMock('autoStartGeneration')).not.toHaveBeenCalled();
    });

    it('fires autoStartGeneration exactly once (ref guard prevents repeat calls)', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue(defaultModels);

      renderWithRouter({ locationState: { autoStartGeneration: true } });

      await waitFor(() => {
        expect(getDialecticStoreActionMock('autoStartGeneration')).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          `/dialectic/${mockProjectId}/session/${mockSessionId}`,
          { replace: true, state: {} },
        );
      });
      expect(getDialecticStoreActionMock('autoStartGeneration')).toHaveBeenCalledTimes(1);
    });

    it('calls navigate with replace true and cleared state after auto-start attempt', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue(defaultModels);

      renderWithRouter({ locationState: { autoStartGeneration: true } });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          `/dialectic/${mockProjectId}/session/${mockSessionId}`,
          { replace: true, state: {} },
        );
      });
    });

    it('page remains functional after auto-start failure (session detail and Generate surface available)', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue(defaultModels);
      vi.mocked(getDialecticStoreActionMock('autoStartGeneration')).mockRejectedValueOnce(new Error('Generation failed'));

      renderWithRouter({ locationState: { autoStartGeneration: true } });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          `/dialectic/${mockProjectId}/session/${mockSessionId}`,
          { replace: true, state: {} },
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mock-stage-tab-card')).toBeInTheDocument();
      expect(screen.getByTestId('mock-session-contributions-display-card')).toBeInTheDocument();
    });

    it('does NOT fire autoStartGeneration when context is not yet loaded (selectedModels empty)', async () => {
      mockUseParams.mockReturnValue({ projectId: mockProjectId, sessionId: mockSessionId });
      setDialecticStateValues(fullContextState);
      selectSelectedModels.mockReturnValue([]);

      renderWithRouter({ locationState: { autoStartGeneration: true } });

      await waitFor(() => {
        expect(screen.getByTestId('mock-session-info-card')).toBeInTheDocument();
      });
      expect(getDialecticStoreActionMock('autoStartGeneration')).not.toHaveBeenCalled();
    });
  });
}); 