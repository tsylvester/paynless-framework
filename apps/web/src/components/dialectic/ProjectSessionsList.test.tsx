import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom'; // For Link component
// import { useDialecticStore } from '@paynless/store'; // Will be mocked, so direct import is not used here
import type { DialecticSession, DialecticStore, DialecticProject } from '@paynless/types'; // Ensured DialecticProject is imported
import { ViewSessionButton } from './controls/ViewSessionButton';
import { ProjectSessionsList } from './ProjectSessionsList';
import {
  setDialecticStateValues,
  resetDialecticStoreMock,
  // getDialecticStoreState // If needed for direct state inspection
} from '@/mocks/dialecticStore.mock'; // Adjust path as necessary

// Mock @paynless/store to use our mock implementation
vi.mock('@paynless/store', async () => {
  const actual = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  return {
    ...actual, // Exports initializeMockDialecticState, setDialecticStateValues, etc.
    useDialecticStore: actual.useDialecticStore, // The mock hook
    // Mock selectors used by ProjectSessionsList if they are not part of the store mock already
    // If these selectors are directly from the store's state, the mock handles them.
    // If they are complex selectors, they might need individual mocks or ensure the mock store state covers their needs.
    selectCurrentProjectId: vi.fn((state: DialecticStore) => state.currentProjectDetail?.id),
    selectCurrentProjectSessions: vi.fn((state: DialecticStore) => state.currentProjectDetail?.dialectic_sessions || []),
    selectCurrentProjectDetail: vi.fn((state: DialecticStore) => state.currentProjectDetail),
  };
});

// Mock react-router-dom's Link component (remains useful if other internal links are present)
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: vi.fn(({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>),
    useNavigate: () => vi.fn(), // Mock useNavigate as ViewSessionButton uses it
  };
});

// Mock the ViewSessionButton
vi.mock('./controls/ViewSessionButton', () => ({
  ViewSessionButton: vi.fn(({ projectId, sessionId, children }) => (
    <button data-testid={`view-session-button-${sessionId}`} data-projectid={projectId}>
      {children || `View Session ${sessionId}`}
    </button>
  )),
}));


const mockOnStartNewSession = vi.fn();

describe('ProjectSessionsList', () => {
  const testProjectId = 'proj-session-list-123';

  beforeEach(() => {
    vi.clearAllMocks();
    resetDialecticStoreMock(); // Reset the mock store state before each test

    // Default state for most tests, currentProjectDetail has an empty session list
    setDialecticStateValues({
      currentProjectDetail: {
        id: testProjectId,
        project_name: 'Session List Project',
        initial_user_prompt: 'Prompt',
        user_id: 'user-1',
        selected_domain_id: 'dom-1',
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: 'date',
        updated_at: 'date',
        dialectic_sessions: [], // Default to no sessions
        initial_prompt_resource_id: null,
        dialectic_domains: {name: 'Software Development'},
        dialectic_process_templates: null,
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
        // Optional fields 'resources' and 'process_template_id' are omitted, which is fine.
      },
    });
  });

  it('renders skeleton/loading state if currentProjectDetail is null', () => {
    setDialecticStateValues({ currentProjectDetail: null });

    render(
      <MemoryRouter>
        <ProjectSessionsList onStartNewSession={mockOnStartNewSession} />
      </MemoryRouter>
    );
    expect(screen.getByText('Sessions').closest('div')?.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('displays "No sessions yet" message and "Start First Session" button when no sessions exist', () => {
    // beforeEach already sets up a project with no sessions.
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
      current_stage_id: 'stage-3',
      // current_stage_seed_prompt: 'Alpha seed prompt', // Property not in DialecticSession type
    },
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
      current_stage_id: 'stage-1',
      // current_stage_seed_prompt: null, // Property not in DialecticSession type
    },
  ];

  it('displays a list of sessions with ViewSessionButton for each', () => {
    const projectDetailWithSessions: DialecticProject = {
      id: testProjectId,
      project_name: 'Session List Project With Sessions',
      initial_user_prompt: 'Prompt',
      user_id: 'user-1',
      selected_domain_id: 'dom-1',
      dialectic_domains: {name: 'Software Development'},
      dialectic_process_templates: null,
      isLoadingProcessTemplate: false,
      processTemplateError: null,
      contributionGenerationStatus: 'idle',
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
      selected_domain_overlay_id: null,
      repo_url: null,
      status: 'active',
      created_at: 'date',
      updated_at: 'date',
      dialectic_sessions: mockSessionsData,
      initial_prompt_resource_id: null,
    };
    setDialecticStateValues({
      currentProjectDetail: projectDetailWithSessions,
    });

    render(
      <MemoryRouter>
        <ProjectSessionsList onStartNewSession={mockOnStartNewSession} />
      </MemoryRouter>
    );

    // --- Alpha Session ---
    const alphaTitleElement = screen.getByText('Alpha Session Description');
    expect(alphaTitleElement).toBeInTheDocument();
    const alphaCard: HTMLElement | null = alphaTitleElement.closest('div[data-slot="card"]');
    expect(alphaCard).toBeInTheDocument();

    if (alphaCard) {
      const alphaDescriptionDiv: HTMLElement = within(alphaCard).getByText((content, element) => {
        return !!element && element.getAttribute('data-slot') === 'card-description' && (content.includes('Status:') || content.includes('Created:'));
      });
      expect(alphaDescriptionDiv.textContent).toMatch(/Status: synthesis_complete/i);
      // Date assertion needs to match the toLocaleString() format in the component
      expect(alphaDescriptionDiv.textContent).toMatch(/Created: 1\/15\/2023, 10:30:00 AM/i);
    }
    
    // ViewSessionButton is a button, not a link.
    // The test for ViewSessionButton mock below handles checking its props.
    // No direct link with session description text.

    // --- Beta Session ---
    const betaTitleElement = screen.getByText('Beta Session - No Seed');
    expect(betaTitleElement).toBeInTheDocument();
    const betaCard: HTMLElement | null = betaTitleElement.closest('div[data-slot="card"]');
    expect(betaCard).toBeInTheDocument();

    if (betaCard) {
      const betaDescriptionDiv = within(betaCard).getByText((content, element) => {
        return !!element && element.getAttribute('data-slot') === 'card-description' && (content.includes('Status:') || content.includes('Created:'));
      });
      expect(betaDescriptionDiv.textContent).toMatch(/Status: pending_thesis/i);
      // Date assertion needs to match the toLocaleString() format
      expect(betaDescriptionDiv.textContent).toMatch(/Created: 2\/20\/2023, 2:00:00 PM/i);
      
      // Seed prompt is not displayed in the card in the current component implementation
      // const seedPromptInBeta = within(betaCard as HTMLElement).queryByText(/Last Seed Prompt:/i, { exact: false });
      // expect(seedPromptInBeta).toBeNull();
    }

    expect(screen.queryByRole('button', { name: /Start First Session/i })).toBeNull();

    // Verify ViewSessionButton was called correctly for each session
    mockSessionsData.forEach(session => {
        expect(ViewSessionButton).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: testProjectId,
                sessionId: session.id,
                children: expect.stringMatching(/View Session/i) // Children now contains "View Session" text
            }),
            {} // Second argument for React component context (usually empty object)
        );
    });
  });

  it('displays "No sessions yet for this project." message when no sessions exist and project detail is present', () => {
    // beforeEach already sets currentProjectDetail with empty sessions.
    // This test re-affirms that specific scenario.
    const emptyProjectDetail: DialecticProject = {
        id: testProjectId,
        project_name: 'Empty Project Test',
        initial_user_prompt: 'Prompt',
        user_id: 'user-empty',
        selected_domain_id: 'dom-empty',
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: 'date',
        updated_at: 'date',
        dialectic_sessions: [], 
        initial_prompt_resource_id: null,
        dialectic_domains: {name: 'Software Development'},
        dialectic_process_templates: null,
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
    };
    setDialecticStateValues({
        currentProjectDetail: emptyProjectDetail,
    });

    render(
        <MemoryRouter>
            <ProjectSessionsList onStartNewSession={mockOnStartNewSession} />
        </MemoryRouter>
    );
    expect(screen.getByText(/No sessions yet for this project./i)).toBeInTheDocument();
  });
}); 