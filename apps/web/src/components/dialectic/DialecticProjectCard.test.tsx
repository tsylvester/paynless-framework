import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DialecticProjectCard } from './DialecticProjectCard';
import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticProject, DialecticStore, DialecticDomain } from '@paynless/types';

// Mock ViewProjectButton by defining the mock directly in the factory function
vi.mock('./ViewProjectButton', () => ({
  ViewProjectButton: vi.fn(
    (props: { projectId: string; projectName?: string; children?: React.ReactNode; variant?: string; className?: string }) => (
      <button
        data-testid="view-project-button-mock"
        data-project-id={props.projectId}
        // Use children as the primary source for display text, fallback to projectName
        data-project-name={props.children?.toString() || props.projectName}
        data-variant={props.variant}
        className={props.className}
      >
        {props.children || props.projectName}
      </button>
    )
  ),
}));

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

// Define a base mock project to be used in tests
// Ensure this matches the expected structure, removing isLoadingContributions
const baseMockProject: DialecticProject = { // Or MockDialecticProjectWithUserDetails if that's the precise type
  id: 'project-id-123',
  project_name: 'Test Project Name',
  created_at: '2023-10-26T11:00:00.000Z',
  updated_at: '2023-01-01T12:00:00.000Z',
  user_id: 'user-id-abc',
  dialectic_domains: { name: 'Technology' },
  selected_domain_id: 'domain-tech-id',
  selected_domain_overlay_id: null,
  repo_url: null,
  status: 'active',
  initial_user_prompt: 'Test initial prompt.',
  initial_prompt_resource_id: null,
  dialectic_process_templates: {
    created_at: '2023-01-01T12:00:00.000Z',
    description: 'Test process template description',
    id: 'process-template-id-123',
    name: 'Test Process Template',
    starting_stage_id: 'stage-id-123',
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
    it('should render project name as a button via ViewProjectButton', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      // Find the button by its role and text content
      const titleButton = screen.getByRole('button', { name: baseMockProject.project_name });
      expect(titleButton).toBeInTheDocument();
      // Check that it's our mock and received the correct projectId
      expect(titleButton).toHaveAttribute('data-testid', 'view-project-button-mock');
      expect(titleButton).toHaveAttribute('data-project-id', baseMockProject.id);
      expect(titleButton).toHaveAttribute('data-project-name', baseMockProject.project_name);
    });

    it('should render project ID as a button via ViewProjectButton if project name is missing', () => {
      // Use empty string for project_name for "missing name" scenario
      const projectWithoutName: DialecticProject = { ...baseMockProject, project_name: '' };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithoutName} />
        </MemoryRouter>
      );
      // Find the button by its role and text content (project.id)
      // project.id should be used as name when project_name is empty
      const titleButton = screen.getByRole('button', { name: projectWithoutName.id });
      expect(titleButton).toBeInTheDocument();
      // Check that it's our mock and received the correct projectId and display name
      expect(titleButton).toHaveAttribute('data-testid', 'view-project-button-mock');
      expect(titleButton).toHaveAttribute('data-project-id', projectWithoutName.id);
      expect(titleButton).toHaveAttribute('data-project-name', projectWithoutName.id);
    });

    it('should render the formatted creation date', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      // Expected format: October 26, 2023, 05:00 AM
      expect(screen.getByText(/Created: .*October 26, 2023/i)).toBeInTheDocument();
      expect(screen.getByText(/06:00 AM/i)).toBeInTheDocument();
    });

    it('should render the initial user prompt (clamped)', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      // The full prompt is 'This is the initial prompt for the test project. It might be a bit long to see if clamping works.'
      // The component uses line-clamp-3, so we check for the presence of the text, not exact match.
      expect(screen.getByText(baseMockProject.initial_user_prompt!)).toBeInTheDocument();
      // Check if the text element has the line-clamp class
      expect(screen.getByText(baseMockProject.initial_user_prompt!)).toHaveClass('line-clamp-3');
    });

    it('should render the "View Project" button in the footer via ViewProjectButton', () => {
      render(
        <MemoryRouter>
          <DialecticProjectCard project={baseMockProject} />
        </MemoryRouter>
      );
      // Find the button by its role and text content
      const viewButton = screen.getByRole('button', { name: 'View Project' });
      expect(viewButton).toBeInTheDocument();
      // Check that it's our mock and received the correct projectId and display text
      expect(viewButton).toHaveAttribute('data-testid', 'view-project-button-mock');
      expect(viewButton).toHaveAttribute('data-project-id', baseMockProject.id);
      // The explicit child "View Project" should be the name
      expect(viewButton).toHaveAttribute('data-project-name', 'View Project');
    });

    it('should render the domain name when available', () => {
      const projectWithDomain = { ...baseMockProject, dialectic_domains: { name: 'Software Development' } };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithDomain} />
        </MemoryRouter>
      );
      expect(screen.getByText('Software Development')).toBeInTheDocument();
    });

    it('should not render a domain badge if dialectic_domains.name is an empty string', () => {
      const projectWithEmptyDomainName = { ...baseMockProject, dialectic_domains: { name: '' } };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithEmptyDomainName} />
        </MemoryRouter>
      );
      // Check that no badge component (which often has role='status') is rendered.
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('should not render a domain badge if dialectic_domains is null', () => {
      const projectWithNullDomain = { ...baseMockProject, dialectic_domains: null };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithNullDomain} />
        </MemoryRouter>
      );
      // Check that no badge component (which often has role='status') is rendered.
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('should render domain badges if domains exist', () => {
      const projectWithMultipleDomains = {
        ...baseMockProject,
        dialectic_domains: { name: 'Technology' }, // Ensure this matches the expected text and structure
      };
      render(
        <MemoryRouter>
          <DialecticProjectCard project={projectWithMultipleDomains} />
        </MemoryRouter>
      );
      // baseMockProject has dialectic_domains: { name: 'Technology' }
      expect(screen.getByText(projectWithMultipleDomains.dialectic_domains!.name)).toBeInTheDocument();
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