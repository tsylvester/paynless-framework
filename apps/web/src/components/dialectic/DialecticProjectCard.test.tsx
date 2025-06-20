import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DialecticProjectCard } from './DialecticProjectCard';
import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticProject, DialecticStore, DialecticDomain } from '@paynless/types';

// Mock @paynless/store
const mockDeleteDialecticProject = vi.fn();
const mockCloneDialecticProject = vi.fn();
const mockExportDialecticProject = vi.fn(); // New action
const mockFetchDialecticProjects = vi.fn();

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
  };
});

// Mock react-router-dom for Link components used internally
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        Link: vi.fn(({ to, children, ...props }) => <a href={to as string} {...props}>{children}</a>),
    };
});

// Define an extended type for the mock project to include user details for testing display logic
// This simulates the data structure the card now expects on its project prop.
interface MockDialecticProjectWithUserDetails extends DialecticProject {
  user_first_name?: string | null;
  user_last_name?: string | null;
  user_email?: string | null;
}

const baseMockProject: MockDialecticProjectWithUserDetails = {
  id: 'proj-123',
  user_id: 'user-abc',
  project_name: 'Test Project Alpha',
  initial_user_prompt: 'This is the initial prompt for the test project. It might be a bit long to see if clamping works.',
  created_at: new Date('2023-10-26T10:00:00.000Z').toISOString(),
  updated_at: new Date('2023-10-26T11:00:00.000Z').toISOString(),
  status: 'active',
  selected_domain_id: 'domain-general',
  dialectic_domains: { name: 'General' },
  selected_domain_overlay_id: null,
  repo_url: null,
  // User details are now part of the base mock project for tests
  user_first_name: 'DefaultFirstName', // Provide some defaults
  user_last_name: 'DefaultLastName',
  user_email: 'default@example.com',
  dialectic_process_templates: null,
};

// Removed mockSelectUserDetailsById

const createMockStore = (projectOverrides?: Partial<MockDialecticProjectWithUserDetails>): DialecticStore => {
  const project = { ...baseMockProject, ...projectOverrides };
  const domains: DialecticDomain[] = [{ id: 'domain-general', name: 'General', description: '', parent_domain_id: null }];
  return {
    ...initialDialecticStateValues,
    deleteDialecticProject: mockDeleteDialecticProject,
    cloneDialecticProject: mockCloneDialecticProject,
    exportDialecticProject: mockExportDialecticProject,
    fetchDialecticProjects: mockFetchDialecticProjects,
    projects: [project],
    isLoadingProjects: false,
    projectsError: null,
    currentProjectDetail: project as DialecticProject,
    domains: domains,
    isLoadingDomains: false,
    domainsError: null,
    selectedDomain: domains[0],
    fetchDomains: vi.fn(),
    setSelectedDomain: vi.fn(),
    selectedStageAssociation: null,
    availableDomainOverlays: [],
    isLoadingDomainOverlays: false,
    domainOverlaysError: null,
    selectedDomainOverlayId: null,
    setSelectedStageAssociation: vi.fn(),
    fetchAvailableDomainOverlays: vi.fn(),
    setSelectedDomainOverlayId: vi.fn(),
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
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    allSystemPrompts: [],
    updateDialecticProjectInitialPrompt: vi.fn(),
    setStartNewSessionModalOpen: vi.fn(),
    setModelMultiplicity: vi.fn(),
    resetSelectedModelId: vi.fn(),
    fetchInitialPromptContent: vi.fn(),
    generateContributions: vi.fn(),
    submitStageResponses: vi.fn(),
    resetSubmitStageResponsesError: vi.fn(),
    saveContributionEdit: vi.fn(),
    resetSaveContributionEditError: vi.fn(),
    setActiveContextProjectId: vi.fn(),
    setActiveContextSessionId: vi.fn(),
    setActiveContextStageSlug: vi.fn(),
    setActiveDialecticContext: vi.fn(),
    _resetForTesting: vi.fn(),
  } as unknown as DialecticStore;
};

describe('DialecticProjectCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default store setup for each test
    const mockStore = createMockStore();
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
  });

  describe('Basic Rendering', () => {
    it('should render project name as a link', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      const projectLink = screen.getByRole('link', { name: baseMockProject.project_name });
      expect(projectLink).toBeInTheDocument();
      expect(projectLink).toHaveAttribute('href', `/dialectic/${baseMockProject.id}`);
    });

    it('should render project ID as a link if project name is missing', () => {
      const projectWithoutName = { ...baseMockProject, project_name: '' };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithoutName} />
        </MemoryRouter>
      );
      const projectLink = screen.getByRole('link', { name: baseMockProject.id });
      expect(projectLink).toBeInTheDocument();
      expect(projectLink).toHaveAttribute('href', `/dialectic/${baseMockProject.id}`);
    });

    it('should render the formatted creation date', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      // Expected format: October 26, 2023, 05:00 AM
      expect(screen.getByText(/Created: .*October 26, 2023/i)).toBeInTheDocument();
      expect(screen.getByText(/05:00 AM/i)).toBeInTheDocument();
    });

    it('should render the initial user prompt (clamped)', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      // The full prompt is 'This is the initial prompt for the test project. It might be a bit long to see if clamping works.'
      // The component uses line-clamp-3, so we check for the presence of the text, not exact match.
      expect(screen.getByText(baseMockProject.initial_user_prompt)).toBeInTheDocument();
      // Check if the text element has the line-clamp class
      expect(screen.getByText(baseMockProject.initial_user_prompt)).toHaveClass('line-clamp-3');
    });

    it('should render the "View Project" button as a link', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      const viewProjectButton = screen.getByRole('link', { name: /View Project/i });
      expect(viewProjectButton).toBeInTheDocument();
      expect(viewProjectButton).toHaveAttribute('href', `/dialectic/${baseMockProject.id}`);
    });

    it('should render the domain name when available', () => {
      const projectWithDomain = { ...baseMockProject, domain_name: 'Software Development' };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDomain} />
        </MemoryRouter>
      );
      expect(screen.getByText('Software Development')).toBeInTheDocument();
    });

    it('should not render a domain badge if domain name is an empty string', () => {
      const projectWithoutDomain = { ...baseMockProject, domain_name: '' };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithoutDomain} />
        </MemoryRouter>
      );
      expect(screen.queryByText(baseMockProject.dialectic_domains.name)).not.toBeInTheDocument();
    });
  });

  describe('User Display Logic ("By:" field)', () => {
    it('should display "firstName lastName" if both are available', () => {
      const mockStore = createMockStore({
        user_first_name: 'Testy',
        user_last_name: 'McTestface',
        user_email: 'testy@example.com', // email still relevant for other fallbacks
      });
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
      const projectWithDetails = mockStore.projects[0] as MockDialecticProjectWithUserDetails;

      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDetails} />
        </MemoryRouter>
      );
      expect(screen.getByText(/By: Testy McTestface/i)).toBeInTheDocument();
    });

    it('should display only "firstName" if lastName is missing', () => {
      const mockStore = createMockStore({
        user_first_name: 'Testy',
        user_last_name: null,
        user_email: 'testy@example.com',
      });
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
      const projectWithDetails = mockStore.projects[0] as MockDialecticProjectWithUserDetails;

      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDetails} />
        </MemoryRouter>
      );
      expect(screen.getByText(/By: Testy/i)).toBeInTheDocument();
      expect(screen.queryByText(/McTestface/i)).not.toBeInTheDocument();
    });

    it('should display only "lastName" if firstName is missing', () => {
      const mockStore = createMockStore({
        user_first_name: null,
        user_last_name: 'McTestface',
        user_email: 'testy@example.com',
      });
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
      const projectWithDetails = mockStore.projects[0] as MockDialecticProjectWithUserDetails;

      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDetails} />
        </MemoryRouter>
      );
      expect(screen.getByText(/By: McTestface/i)).toBeInTheDocument();
      expect(screen.queryByText(/Testy/i)).not.toBeInTheDocument();
    });

    it('should display "email" if firstName and lastName are missing', () => {
      const mockStore = createMockStore({
        user_first_name: null,
        user_last_name: null,
        user_email: 'onlyemail@example.com',
      });
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
      const projectWithDetails = mockStore.projects[0] as MockDialecticProjectWithUserDetails;

      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDetails} />
        </MemoryRouter>
      );
      expect(screen.getByText(`By: ${projectWithDetails.user_email}`)).toBeInTheDocument();
    });

    it('should display "user_id" if no name or email is available', () => {
      const mockStore = createMockStore({
        user_first_name: null,
        user_last_name: null,
        user_email: null,
      });
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
      const projectWithDetails = mockStore.projects[0] as MockDialecticProjectWithUserDetails;

      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDetails} />
        </MemoryRouter>
      );
      expect(screen.getByText(`By: ${projectWithDetails.user_id}`)).toBeInTheDocument();
    });
  });

  describe('Action Button Interactions', () => {
    it('should render the Export Project button', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /Export project/i })).toBeInTheDocument();
    });

    it('should render the Clone project button', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /Clone project/i })).toBeInTheDocument();
    });

    it('should render the Delete project button', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /Delete project/i })).toBeInTheDocument();
    });

    it('should show delete confirmation dialog and call deleteDialecticProject when Delete button is clicked and confirmed', async () => {
      const mockStore = createMockStore();
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      const deleteIconButton = screen.getByRole('button', { name: /Delete project/i });
      fireEvent.click(deleteIconButton);

      // Check if AlertDialog is visible
      expect(await screen.findByText('Are you sure?')).toBeInTheDocument(); // AlertDialogTitle
      expect(screen.getByText(/This action cannot be undone/i)).toBeInTheDocument(); // AlertDialogDescription

      // Click the actual delete button in the dialog
      const confirmDeleteButton = screen.getByRole('button', { name: 'Delete' }); // Default name for AlertDialogAction
      fireEvent.click(confirmDeleteButton);

      expect(mockDeleteDialecticProject).toHaveBeenCalledWith(baseMockProject.id);
    });

    it('should call cloneDialecticProject when Clone button is clicked', () => {
      const mockStore = createMockStore();
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      const cloneButton = screen.getByRole('button', { name: /Clone project/i });
      fireEvent.click(cloneButton);
      expect(mockCloneDialecticProject).toHaveBeenCalledWith(baseMockProject.id);
    });

    it('should call exportDialecticProject when Export Project button is clicked', () => {
      const mockStore = createMockStore();
      vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));

      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      const exportButton = screen.getByRole('button', { name: /Export project/i });
      fireEvent.click(exportButton);
      expect(mockExportDialecticProject).toHaveBeenCalledWith(baseMockProject.id);
    });
  });

  describe('User Actions', () => {
    it('should open dropdown menu on button click', async () => {
      // ... existing code ...
    });
  });
}); 