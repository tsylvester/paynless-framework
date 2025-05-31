import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject, CreateProjectPayload, ApiError } from '@paynless/store';
import { CreateDialecticProjectPage } from './CreateDialecticProjectPage';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
  };
});

// Mock react-router-dom for navigation
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

const mockCreateDialecticProject = vi.fn();
const mockNavigate = vi.fn();
const mockResetCreateProjectError = vi.fn();

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
    fetchDialecticProjectDetails: vi.fn(),
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    fetchAIModelCatalog: vi.fn(),
    isCreatingProject: false,
    createProjectError: null,
    createDialecticProject: mockCreateDialecticProject,
    isStartingSession: false,
    startSessionError: null,
    startDialecticSession: vi.fn(),
    contributionContentCache: {},
    fetchContributionContent: vi.fn(),
    _resetForTesting: vi.fn(),
    resetCreateProjectError: mockResetCreateProjectError,
    resetProjectDetailsError: vi.fn(),
    ...overrides,
  } as DialecticStore;
};

describe('CreateDialecticProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    const mockStore = createMockStoreState({});
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
  });

  it('renders form fields for project name and initial prompt', () => {
    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/Project Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Initial User Prompt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
  });

  it('calls createDialecticProject with form data on submit and navigates on success', async () => {
    const user = userEvent.setup();
    const mockSuccessfulProject: DialecticProject = {
      id: 'new-proj-123', userId: 'user-1', projectName: 'New Test Project', initialUserPrompt: 'This is a test prompt.', 
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'active', 
      selectedDomainTag: null, userDomainOverlayValues: null, dialecticSessions: []
    };
    mockCreateDialecticProject.mockResolvedValueOnce({ success: true, data: mockSuccessfulProject, error: null });
    
    const mockStore = createMockStoreState({ isCreatingProject: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Project Name/i), mockSuccessfulProject.projectName);
    await user.type(screen.getByLabelText(/Initial User Prompt/i), mockSuccessfulProject.initialUserPrompt);
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockCreateDialecticProject).toHaveBeenCalledWith({
        projectName: mockSuccessfulProject.projectName,
        initialUserPrompt: mockSuccessfulProject.initialUserPrompt,
        selectedDomainTag: null, // Assuming DomainSelector integration later or default null
      } as CreateProjectPayload);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${mockSuccessfulProject.id}`);
    });
  });

  it('displays loading state when isCreatingProject is true', () => {
    const mockStore = createMockStoreState({ isCreatingProject: true });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Creating Project.../i })).toBeDisabled();
    // Or check for a specific loader component
  });

  it('displays error message if createProjectError is present', async () => {
    const user = userEvent.setup();
    const error = { message: 'Failed to create project' } as ApiError;
    mockCreateDialecticProject.mockResolvedValueOnce({ success: false, data: null, error });
    const mockStore = createMockStoreState({ createProjectError: error, isCreatingProject: false });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );

    // Simulate form submission to trigger the error display path
    await user.type(screen.getByLabelText(/Project Name/i), 'Test');
    await user.type(screen.getByLabelText(/Initial User Prompt/i), 'Test prompt');
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
        expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });
}); 