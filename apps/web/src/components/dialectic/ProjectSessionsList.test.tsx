import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom'; // For Link component
import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject, DialecticSession } from '@paynless/types';

import { ProjectSessionsList } from './ProjectSessionsList';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
    // Mock selectors used by ProjectSessionsList
    selectCurrentProjectId: vi.fn(state => state.currentProjectDetail?.id),
    selectCurrentProjectSessions: vi.fn(state => state.currentProjectDetail?.dialectic_sessions || []),
    selectCurrentProjectDetail: vi.fn(state => state.currentProjectDetail),
  };
});

// Mock react-router-dom's Link component
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: vi.fn(({ to, children, ...rest }) => <a href={to as string} {...rest}>{children}</a>),
  };
});

const createMockStoreState = (overrides: Partial<DialecticStore> = {}) => {
  const baseState = {
    ...initialDialecticStateValues,
    currentProjectDetail: null, // This will be primary for ProjectSessionsList
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    availableDomains: [],
    isLoadingDomains: false,
    domainsError: null,
    selectedDomainId: null,
    fetchAvailableDomains: vi.fn(),
    setSelectedDomainId: vi.fn(),
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
    setStartNewSessionModalOpen: vi.fn(),
    isStartNewSessionModalOpen: false,
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    updateDialecticProjectInitialPrompt: vi.fn(),
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
    ...overrides,
  };
  return baseState as any;
};

const mockOnStartNewSession = vi.fn();

describe('ProjectSessionsList', () => {
  const testProjectId = 'proj-session-list-123';

  beforeEach(() => {
    vi.clearAllMocks();
    const defaultMockStore = createMockStoreState({
      currentProjectDetail: {
        id: testProjectId,
        project_name: 'Session List Project',
        initial_user_prompt: 'Prompt',
        user_id: 'user-1',
        selected_domain_id: 'dom-1',
        domain_name: 'Software Development',
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: 'date',
        updated_at: 'date',
        dialectic_sessions: [],
        initial_prompt_resource_id: null,
      } as DialecticProject,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(defaultMockStore));
  });

  it('renders skeleton/loading state if projectIdForLinks is undefined', () => {
    const loadingState = createMockStoreState({ currentProjectDetail: null });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(loadingState));

    render(
      <MemoryRouter>
        <ProjectSessionsList onStartNewSession={mockOnStartNewSession} />
      </MemoryRouter>
    );
    expect(screen.getByText('Sessions').closest('div')?.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('displays "No sessions yet" message and "Start First Session" button when no sessions exist', () => {
    render(
      <MemoryRouter>
        <ProjectSessionsList onStartNewSession={mockOnStartNewSession} />
      </MemoryRouter>
    );
    expect(screen.getByText(/No sessions yet for this project./i)).toBeInTheDocument();
    const startFirstSessionButton = screen.getByRole('button', { name: /Start First Session/i });
    expect(startFirstSessionButton).toBeInTheDocument();
    fireEvent.click(startFirstSessionButton);
    expect(mockOnStartNewSession).toHaveBeenCalledTimes(1);
  });

  const mockSessionsData: DialecticSession[] = [
    {
      id: 'session-1',
      project_id: testProjectId,
      session_description: 'Alpha Session Description',
      iteration_count: 2,
      status: 'synthesis_complete',
      created_at: new Date(2023, 0, 15, 10, 30).toISOString(),
      updated_at: new Date().toISOString(),
      user_input_reference_url: null,
      selected_model_catalog_ids: [],
      associated_chat_id: 'chat-alpha',
      current_stage_id: 'stage-3', // Corresponds to synthesis
      current_stage_seed_prompt: 'Alpha seed prompt',
    } as DialecticSession,
    {
      id: 'session-2',
      project_id: testProjectId,
      session_description: 'Beta Session - No Seed',
      iteration_count: 0,
      status: 'pending_thesis',
      created_at: new Date(2023, 1, 20, 14, 0).toISOString(),
      updated_at: new Date().toISOString(),
      user_input_reference_url: null,
      selected_model_catalog_ids: [],
      associated_chat_id: 'chat-beta',
      current_stage_id: 'stage-1', // Corresponds to thesis
      current_stage_seed_prompt: null,
    } as DialecticSession,
  ];

  it('displays a list of sessions with details and correct links', () => {
    const stateWithSessions = createMockStoreState({
      currentProjectDetail: {
        id: testProjectId,
        project_name: 'Session List Project',
        initial_user_prompt: 'Prompt',
        user_id: 'user-1',
        selected_domain_id: 'dom-1',
        domain_name: 'Software Development',
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: 'date',
        updated_at: 'date',
        dialectic_sessions: mockSessionsData,
        initial_prompt_resource_id: null,
      } as DialecticProject,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(stateWithSessions));

    render(
      <MemoryRouter>
        <ProjectSessionsList onStartNewSession={mockOnStartNewSession} />
      </MemoryRouter>
    );

    // --- Alpha Session ---
    const alphaTitleElement = screen.getByText('Alpha Session Description');
    expect(alphaTitleElement).toBeInTheDocument();
    const alphaCard = alphaTitleElement.closest('div[data-slot="card"]');
    expect(alphaCard).toBeInTheDocument();

    if (alphaCard) {
      const alphaDescriptionDiv = within(alphaCard as HTMLElement).getByText((content, element) => {
        return !!element && element.getAttribute('data-slot') === 'card-description' && (content.includes('Status:') || content.includes('Created:'));
      });
      expect(alphaDescriptionDiv.textContent).toMatch(/Status: synthesis_complete/i);
      expect(alphaDescriptionDiv.textContent).toMatch(/Created: 1\/15\/2023/i);

      // Simpler approach for seed prompt:
      // 1. Get the card-content div within alphaCard.
      // 2. Query for the <p> tag directly within that card-content.
      // 3. Check its textContent.
      const alphaCardContent = (alphaCard as HTMLElement).querySelector('div[data-slot="card-content"]');
      expect(alphaCardContent).toBeInTheDocument(); // Ensure card-content exists

      if (alphaCardContent) {
        const seedPromptParagraph = alphaCardContent.querySelector('p');
        expect(seedPromptParagraph).toBeInTheDocument(); // Ensure the paragraph exists
        if (seedPromptParagraph) {
          expect(seedPromptParagraph.textContent).toMatch(/Last Seed Prompt:\s*Alpha seed prompt/i);
        }
      }
    }
    
    const alphaLink = screen.getByRole('link', { name: 'Alpha Session Description' });
    expect(alphaLink).toHaveAttribute('href', `/dialectic/${testProjectId}/session/session-1`);
    const alphaViewButton = screen.getAllByRole('link', { name: /View Session/i })[0];
    expect(alphaViewButton).toHaveAttribute('href', `/dialectic/${testProjectId}/session/session-1`);

    // --- Beta Session ---
    const betaTitleElement = screen.getByText('Beta Session - No Seed');
    expect(betaTitleElement).toBeInTheDocument();
    const betaCard = betaTitleElement.closest('div[data-slot="card"]');
    expect(betaCard).toBeInTheDocument();

    if (betaCard) {
      const betaDescriptionDiv = within(betaCard as HTMLElement).getByText((content, element) => {
        return !!element && element.getAttribute('data-slot') === 'card-description' && (content.includes('Status:') || content.includes('Created:'));
      });
      expect(betaDescriptionDiv.textContent).toMatch(/Status: pending_thesis/i);
      expect(betaDescriptionDiv.textContent).toMatch(/Created: 2\/20\/2023/i);
      
      const seedPromptInBeta = within(betaCard as HTMLElement).queryByText(/Last Seed Prompt:/i, { exact: false });
      expect(seedPromptInBeta).toBeNull();
    }

    const betaLink = screen.getByRole('link', { name: 'Beta Session - No Seed' });
    expect(betaLink).toHaveAttribute('href', `/dialectic/${testProjectId}/session/session-2`);
    const betaViewButton = screen.getAllByRole('link', { name: /View Session/i })[1];
    expect(betaViewButton).toHaveAttribute('href', `/dialectic/${testProjectId}/session/session-2`);

    expect(screen.queryByRole('button', { name: /Start First Session/i })).toBeNull();
  });
}); 