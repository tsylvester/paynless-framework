import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom'; // Import useNavigate

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject } from '@paynless/store';
import { DialecticProjectsPage } from './DialecticProjectsPage';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
    // Add all selectors used by the component here, mocking their implementation if necessary
    // For now, we will assume some basic selectors for projects list, loading, and error states
    // These will be refined as the component is implemented
  };
});

// Mock react-router-dom for navigation (e.g., Link component)
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        Link: vi.fn(({ to, children }) => <a href={to as string}>{children}</a>),
        useNavigate: vi.fn(), // Mock useNavigate at the top level
    };
});

const mockFetchDialecticProjects = vi.fn();
const mockNavigate = vi.fn(); // Keep a reference to a new mock function for each test run

const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
  return {
    ...initialDialecticStateValues, // Start with all initial values
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: mockFetchDialecticProjects,
    // Ensure all other actions and states from DialecticStore are here or mocked if used
    // This helps prevent "property X does not exist on type" errors in tests
    availableDomainTags: [],
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    currentProjectDetail: null,
    isLoadingProjectDetail: false,
    projectDetailError: null,
    fetchDialecticProjectDetails: vi.fn(),
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
    ...overrides,
  } as DialecticStore;
};

describe('DialecticProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mock store implementation for each test
    const mockStore = createMockStoreState({});
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
  });

  it('should render loading state initially and call fetchDialecticProjects', () => {
    const mockStore = createMockStoreState({ isLoadingProjects: true });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <DialecticProjectsPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Loading projects.../i)).toBeInTheDocument();
    expect(mockFetchDialecticProjects).toHaveBeenCalledTimes(1);
  });

  it('should render error state if projectsError is present', () => {
    const error = { message: 'Failed to fetch projects' } as ApiError;
    const mockStore = createMockStoreState({ projectsError: error, isLoadingProjects: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <DialecticProjectsPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Error loading projects:/i)).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
    expect(mockFetchDialecticProjects).toHaveBeenCalledTimes(1); // Still called on mount
  });

  it('should display "No projects found" when projects array is empty and not loading', () => {
    const mockStore = createMockStoreState({ projects: [], isLoadingProjects: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <DialecticProjectsPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/No projects found./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create New Project/i })).toBeInTheDocument();
  });

  it('should render a list of projects and a "Create New Project" button', () => {
    const mockProjects: DialecticProject[] = [
      { id: 'proj-1', userId: 'user-1', projectName: 'Project Alpha', initialUserPrompt: 'Prompt A', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active', selectedDomainTag: null, userDomainOverlayValues: null, dialecticSessions: [] },
      { id: 'proj-2', userId: 'user-1', projectName: 'Project Beta', initialUserPrompt: 'Prompt B', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active', selectedDomainTag: 'test-tag', userDomainOverlayValues: null, dialecticSessions: [] },
    ];
    const mockStore = createMockStoreState({ projects: mockProjects, isLoadingProjects: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <DialecticProjectsPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    // Check for links to project details (href will be placeholder for now)
    // Example: expect(screen.getByRole('link', { name: /Project Alpha/i })).toHaveAttribute('href', '/dialectic/proj-1');
    expect(screen.getByRole('button', { name: /Create New Project/i })).toBeInTheDocument();
  });

   it('navigates to the create project page when "Create New Project" is clicked', async () => {
    const mockStore = createMockStoreState({ projects: [], isLoadingProjects: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    
    // Configure the top-level mock for this specific test case
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    render(
      <MemoryRouter>
        <DialecticProjectsPage />
      </MemoryRouter>
    );

    const createButton = screen.getByRole('button', { name: /Create New Project/i });
    fireEvent.click(createButton); // Simulate the click
    
    expect(mockNavigate).toHaveBeenCalledWith('/dialectic/new'); // Assert navigation
  });

});

// Define ApiError type locally if not easily importable for tests
interface ApiError {
  message: string;
  details?: any;
  statusCode?: number;
} 