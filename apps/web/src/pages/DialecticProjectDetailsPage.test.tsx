import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  };
});

// Mock useParams from react-router-dom
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: vi.fn(),
    Link: vi.fn(({ to, children }) => <a href={to as string}>{children}</a>), // Mock Link for session links
  };
});

const mockFetchDialecticProjectDetails = vi.fn();
// Mock for opening the StartNewSessionModal - to be implemented later
const mockOpenStartSessionModal = vi.fn(); 

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  return {
    ...initialDialecticStateValues,
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    availableDomainTags: [],
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
    _resetForTesting: vi.fn(),
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    // Mock any functions related to modal visibility if controlled by the store
    // For now, assume modal opening is a local state or direct function call
    ...overrides,
  } as DialecticStore;
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
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
  });

  it('calls fetchDialecticProjectDetails with projectId on mount and shows loading', () => {
    const mockStore = createMockStoreState({ isLoadingProjectDetail: true });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, { 
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId' 
    });

    expect(mockFetchDialecticProjectDetails).toHaveBeenCalledWith(testProjectId);
    expect(screen.getByText(/Loading project details.../i)).toBeInTheDocument();
  });

  it('displays error message if projectDetailError is present', () => {
    const error = { message: 'Failed to load project' } as ApiError;
    const mockStore = createMockStoreState({ projectDetailError: error, isLoadingProjectDetail: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });
    expect(screen.getByText(/Error loading project details:/i)).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });

  it('displays "Project not found" if no projectDetail and not loading/error', () => {
    const mockStore = createMockStoreState({ currentProjectDetail: null, isLoadingProjectDetail: false, projectDetailError: null });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });
    expect(screen.getByText(/Project not found/i)).toBeInTheDocument();
  });

  it('displays project details, sessions, and "Start New Session" button', () => {
    const mockSessions: DialecticSession[] = [
      { id: 'session-1', projectId: testProjectId, sessionDescription: 'Session Alpha', currentStageSeedPrompt: '', iterationCount: 1, status: 'thesis_complete', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dialecticSessionModels: [], associatedChatId: null },
      { id: 'session-2', projectId: testProjectId, sessionDescription: 'Session Beta', currentStageSeedPrompt: '', iterationCount: 1, status: 'pending_thesis', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dialecticSessionModels: [], associatedChatId: null },
    ];
    const mockProject: DialecticProject = {
      id: testProjectId, userId: 'user-1', projectName: 'Detailed Project', initialUserPrompt: 'A detailed prompt.',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active', 
      selectedDomainTag: 'generic', userDomainOverlayValues: null, dialecticSessions: mockSessions
    };
    const mockStore = createMockStoreState({ currentProjectDetail: mockProject, isLoadingProjectDetail: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });

    expect(screen.getByRole('heading', { name: /Detailed Project/i })).toBeInTheDocument();
    expect(screen.getByText('A detailed prompt.')).toBeInTheDocument();
    expect(screen.getByText(/Session Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/Session Beta/i)).toBeInTheDocument();
    // Check for links to session details (placeholder href for now)
    // expect(screen.getByRole('link', { name: /Session Alpha/i })).toHaveAttribute('href', `/dialectic/${testProjectId}/session/session-1`);
    expect(screen.getByRole('button', { name: /Start New Session/i })).toBeInTheDocument();
  });

  it('opens StartNewSessionModal when "Start New Session" button is clicked', async () => {
    // This test will be more concrete when the modal and its trigger are implemented
    // For now, we'll assume the button exists and might call a function to open a modal
    const mockProject: DialecticProject = { 
        id: testProjectId, userId: 'user-1', projectName: 'Test Project', initialUserPrompt: 'Test',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active', 
        selectedDomainTag: null, userDomainOverlayValues: null, dialecticSessions: [] 
    };
    const mockStore = createMockStoreState({ currentProjectDetail: mockProject, isLoadingProjectDetail: false });
    // If modal opening is handled via store state:
    // mockStore.isStartSessionModalOpen = false; 
    // mockStore.openStartSessionModal = mockOpenStartSessionModal;
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    renderWithRouter(<DialecticProjectDetailsPage />, {
        route: `/dialectic/${testProjectId}`,
        path: '/dialectic/:projectId'
    });

    const startSessionButton = screen.getByRole('button', { name: /Start New Session/i });
    // fireEvent.click(startSessionButton); // or userEvent.click()
    // await waitFor(() => expect(mockOpenStartSessionModal).toHaveBeenCalled()); // or check for modal content
    expect(startSessionButton).toBeInTheDocument(); // Basic assertion for now
  });
}); 