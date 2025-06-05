import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject, DialecticSession, ApiError } from '@paynless/store';
import { DialecticProjectDetailsPage } from './DialecticProjectDetailsPage';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
    selectCurrentProjectId: vi.fn(state => state.currentProjectDetail?.id),
    selectCurrentProjectInitialPrompt: vi.fn(state => state.currentProjectDetail?.initial_user_prompt),
    selectCurrentProjectSessions: vi.fn(state => state.currentProjectDetail?.sessions || []),
    selectIsStartNewSessionModalOpen: vi.fn(state => state.isStartNewSessionModalOpen),
  };
});

// Mock useParams from react-router-dom
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: vi.fn(),
    Link: vi.fn(({ to, children }) => <a href={to as string}>{children}</a>),
    useNavigate: vi.fn(() => vi.fn()),
  };
});

// Mock child components to simplify page testing and avoid their internal logic/API calls
vi.mock('@/components/dialectic/EditableInitialProblemStatement', () => ({
  EditableInitialProblemStatement: vi.fn(() => <div data-testid="editable-initial-problem-statement-mock"></div>),
}));

vi.mock('@/components/dialectic/ProjectSessionsList', () => ({
  ProjectSessionsList: vi.fn(({ onStartNewSession }) => (
    <div data-testid="project-sessions-list-mock">
      <button onClick={onStartNewSession}>Trigger Session Modal From List</button>
    </div>
  )),
}));

vi.mock('@/components/dialectic/StartDialecticSessionModal', () => ({
  StartDialecticSessionModal: vi.fn(() => <div data-testid="start-dialectic-session-modal-mock"></div>),
}));

const mockFetchDialecticProjectDetails = vi.fn();
const mockSetStartNewSessionModalOpen = vi.fn();

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  const baseState = {
    ...initialDialecticStateValues,
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    availableDomainTags: { data: [] },
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    currentProjectDetail: null,
    isLoadingProjectDetail: false,
    projectDetailError: null,
    fetchDialecticProjectDetails: mockFetchDialecticProjectDetails,
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    fetchAIModelCatalog: vi.fn(),
    isCreatingProject: false,
    createProjectError: null,
    createDialecticProject: vi.fn(),
    isStartingSession: false,
    startSessionError: null,
    startDialecticSession: vi.fn(),
    contributionContentCache: {},
    fetchContributionContent: vi.fn(),
    setStartNewSessionModalOpen: mockSetStartNewSessionModalOpen,
    isStartNewSessionModalOpen: false,
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    updateDialecticProjectInitialPrompt: vi.fn(),
    uploadProjectResourceFile: vi.fn(),
    isUpdatingProjectPrompt: false,
    isUploadingProjectResource: false,
    uploadProjectResourceError: null,
    allSystemPrompts: null,
    isCloningProject: false,
    cloneProjectError: null,
    isExportingProject: false,
    exportProjectError: null,
    exportDialecticProject: vi.fn(),
    cloneDialecticProject: vi.fn(),
    deleteDialecticProject: vi.fn(),
    selectedStageAssociation: null,
    availableDomainOverlays: null,
    isLoadingDomainOverlays: false,
    domainOverlaysError: null,
    selectedDomainOverlayId: null,
    setSelectedStageAssociation: vi.fn(),
    fetchAvailableDomainOverlays: vi.fn(),
    setSelectedDomainOverlayId: vi.fn(),
    _resetForTesting: vi.fn(),
  };
  return { ...baseState, ...overrides } as DialecticStore;
};

const renderWithRouter = (ui: React.ReactElement, { route = '/', path = '/', initialEntries = [route] } = {}) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </MemoryRouter>
  );
};

describe('DialecticProjectDetailsPage', () => {
  const testProjectId = 'project-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ projectId: testProjectId });
    const mockStore = createMockStoreState({});
    vi.mocked(useDialecticStore).mockImplementation((selectorOrFn) => {
      if (typeof selectorOrFn === 'function') {
        return selectorOrFn(mockStore);
      }
      return mockStore;
    });
  });

  it('calls fetchDialecticProjectDetails with projectId on mount and shows loading skeletons', () => {
    const mockStore = createMockStoreState({ isLoadingProjectDetail: true, currentProjectDetail: null });
    vi.mocked(useDialecticStore).mockImplementation(selector => selector(mockStore));

    const { container } = renderWithRouter(<DialecticProjectDetailsPage />, { 
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId' 
    });

    expect(mockFetchDialecticProjectDetails).toHaveBeenCalledWith(testProjectId);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.length).toBe(4);
  });

  it('displays error message if projectDetailError is present', () => {
    const error = { message: 'Failed to load project' } as ApiError;
    const mockStore = createMockStoreState({ projectDetailError: error, isLoadingProjectDetail: false });
    vi.mocked(useDialecticStore).mockImplementation(selector => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });
    expect(screen.getByRole('heading', { name: /Error Loading Project/i })).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });

  it('displays message if no projectDetail and not loading/error, and projectId does not match', () => {
    const mockStore = createMockStoreState({ 
        currentProjectDetail: { id: 'other-project-id' } as DialecticProject,
        isLoadingProjectDetail: false, 
        projectDetailError: null 
    });
    vi.mocked(useParams).mockReturnValue({ projectId: testProjectId });
    vi.mocked(useDialecticStore).mockImplementation(selector => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });
    expect(screen.getByText(/Loading project data.../i)).toBeInTheDocument();
  });

  it('displays fallback message if no projectDetail and not loading/error, and projectId matches (edge case)', () => {
    const mockStore = createMockStoreState({ 
      currentProjectDetail: null,
      isLoadingProjectDetail: false, 
      projectDetailError: null 
    });
    vi.mocked(useParams).mockReturnValue({ projectId: testProjectId });
    vi.mocked(useDialecticStore).mockImplementation(selector => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });
    expect(screen.getByText(/No project data available. It might be loading or the project ID is invalid./i)).toBeInTheDocument();
  });

  it('displays project details and child component mocks when project data is loaded', () => {
    const mockProject: DialecticProject = {
      id: testProjectId,
      user_id: 'user-1',
      project_name: 'Detailed Project Name',
      initial_user_prompt: 'An initial prompt for the project.',
      selected_domain_overlay_id: null,
      selected_domain_tag: 'generic',
      repo_url: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sessions: [],
      resources: [],
    };
    const mockStore = createMockStoreState({ 
      currentProjectDetail: mockProject, 
      isLoadingProjectDetail: false, 
      projectDetailError: null 
    });
    vi.mocked(useDialecticStore).mockImplementation(selector => selector(mockStore));
    vi.mocked(useParams).mockReturnValue({ projectId: testProjectId });

    const { container } = renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });

    expect(screen.getByRole('heading', { name: /Detailed Project Name/i })).toBeInTheDocument();
    expect(screen.getByTestId('editable-initial-problem-statement-mock')).toBeInTheDocument();
    expect(screen.getByTestId('project-sessions-list-mock')).toBeInTheDocument();
    
    const mainStartSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    expect(mainStartSessionButton).toBeInTheDocument();
  });

  it('calls setStartNewSessionModalOpen with true when "Start New Session" button is clicked', async () => {
    const mockProject: DialecticProject = {
      id: testProjectId, user_id: 'user-1', project_name: 'Test Project', initial_user_prompt: 'Test',
      created_at: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active',
      selected_domain_tag: null, selected_domain_overlay_id: null, repo_url: null, sessions: [], resources: [],
    };
    const mockStore = createMockStoreState({ 
        currentProjectDetail: mockProject, 
        isLoadingProjectDetail: false,
        isStartNewSessionModalOpen: false,
    });
    vi.mocked(useDialecticStore).mockImplementation(selector => selector(mockStore));
    vi.mocked(useParams).mockReturnValue({ projectId: testProjectId });

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });

    const startSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    fireEvent.click(startSessionButton);

    expect(mockSetStartNewSessionModalOpen).toHaveBeenCalledWith(true);
  });
}); 