import { render, screen, fireEvent } from '@testing-library/react';
import { StageTabCard } from './StageTabCard';
import { 
  DialecticProject, 
  DialecticSession, 
  DialecticStage,
  DialecticStore,
  ApiError,
  ContributionCacheEntry,
  DialecticContribution,
} from '@paynless/types';
import { vi } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  return {
    ...actualStoreModule,
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
  };
});

const mockStage: DialecticStage = {
    id: 'stage-id-hypothesis',
    display_name: 'Hypothesis',
    slug: 'hypothesis',
    description: 'Generate initial ideas.',
    created_at: new Date().toISOString(),
    default_system_prompt_id: null,
    expected_output_artifacts: null,
    input_artifact_rules: null,
};

const anotherMockStage: DialecticStage = {
  id: 'stage-id-antithesis',
  display_name: 'Antithesis',
  slug: 'antithesis',
  description: 'Critique initial ideas.',
  created_at: new Date().toISOString(),
  default_system_prompt_id: null,
  expected_output_artifacts: null,
  input_artifact_rules: null,
};

const mockSession: DialecticSession = {
  id: 'ses-123',
  project_id: 'proj-123',
  session_description: 'Test session',
  iteration_count: 1,
  current_stage_id: mockStage.id,
  status: 'pending_hypothesis',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  selected_model_catalog_ids: ['model-1'],
  user_input_reference_url: null,
  associated_chat_id: null,
  dialectic_contributions: [],
};

const mockProject: DialecticProject = {
  id: 'proj-123',
  user_id: 'user-123',
  project_name: 'Test Project',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  selected_domain_id: 'domain-1',
  domain_name: 'Software',
  selected_domain_overlay_id: null,
  initial_user_prompt: 'Test',
  repo_url: null,
  dialectic_sessions: [mockSession],
  process_template_id: 'pt-1',
};

describe('StageTabCard', () => {

  const setupStore = (session: DialecticSession | undefined, project: DialecticProject | undefined, activeStage: DialecticStage | null, isGenerating = false, generateError: ApiError | null = null, contributionCache: Record<string, ContributionCacheEntry> = {}) => {
    const state: Partial<DialecticStore> = {
      activeContextProjectId: project?.id ?? null,
      activeContextSessionId: session?.id ?? null,
      activeContextStageSlug: activeStage,
      currentProjectDetail: project,
      isGeneratingContributions: isGenerating,
      generateContributionsError: generateError,
      contributionContentCache: contributionCache,
    };
    initializeMockDialecticState(state);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mocks for actions on the store state
    const storeState = getDialecticStoreState();
    storeState.setActiveDialecticContext = vi.fn();
    storeState.generateContributions = vi.fn();
    storeState.fetchInitialPromptContent = vi.fn();
  });

  const renderComponent = (stage: DialecticStage, isActive: boolean) => {
    return render(
        <StageTabCard
            stage={stage}
            isActiveStage={isActive}
        />,
    );
  };

  it('renders display name and reflects active state', () => {
    setupStore(mockSession, mockProject, mockStage);
    renderComponent(mockStage, true);
    expect(screen.getByText(mockStage.display_name)).toBeInTheDocument();
    expect(screen.getByTestId(`stage-tab-${mockStage.slug}`)).toHaveClass('border-primary');
  });

  it('reflects inactive state', () => {
    setupStore(mockSession, mockProject, anotherMockStage);
    renderComponent(mockStage, false);
    expect(screen.getByText(mockStage.display_name)).toBeInTheDocument();
    expect(screen.getByTestId(`stage-tab-${mockStage.slug}`)).not.toHaveClass('border-primary');
  });

  it('calls setActiveDialecticContext from the store when clicked', () => {
    setupStore(mockSession, mockProject, mockStage);
    const setActiveCtxFn = getDialecticStoreState().setActiveDialecticContext;

    renderComponent(mockStage, true);
    fireEvent.click(screen.getByTestId(`stage-tab-${mockStage.slug}`));
    expect(setActiveCtxFn).toHaveBeenCalledWith({ projectId: mockProject.id, sessionId: mockSession.id, stageSlug: mockStage });
  });

  describe('Context Unavailable Message', () => {
    it('shows context unavailable if session is missing', () => {
        setupStore(undefined, mockProject, mockStage);
        renderComponent(mockStage, true);
        expect(screen.getByText(/Context unavailable/i)).toBeInTheDocument();
    });
  });

  describe('Generate Contributions Button', () => {
    const seedPromptPath = `projects/${mockProject.id}/sessions/${mockSession.id}/iteration_1/${mockStage.slug}/seed_prompt.md`;
    
    it('is visible and enabled if card is active and seed prompt exists', () => {
      const cacheWithSeed = { [seedPromptPath]: { content: 'seed', isLoading: false } };
      setupStore(mockSession, mockProject, mockStage, false, null, cacheWithSeed);
      renderComponent(mockStage, true);
      const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
      expect(generateButton).toBeInTheDocument();
      expect(generateButton).toBeEnabled();
    });

    it('is visible but disabled if seed prompt is loading', () => {
        const cacheWithLoadingSeed = { [seedPromptPath]: { content: undefined, isLoading: true } };
        setupStore(mockSession, mockProject, mockStage, false, null, cacheWithLoadingSeed);
        renderComponent(mockStage, true);
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeDisabled();
    });

    it('is visible but disabled if seed prompt does not exist', () => {
      setupStore(mockSession, mockProject, mockStage);
      renderComponent(mockStage, true);
      const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
      expect(generateButton).toBeInTheDocument();
      expect(generateButton).toBeDisabled();
    });

    it('is not visible if stage card is not active', () => {
      const cacheWithSeed = { [seedPromptPath]: { content: 'seed', isLoading: false } };
      setupStore(mockSession, mockProject, mockStage, false, null, cacheWithSeed);
      renderComponent(mockStage, false);
      expect(screen.queryByRole('button', { name: `Generate ${mockStage.display_name}` })).not.toBeInTheDocument();
    });

    it('dispatches generateContributions action with correct payload on click', () => {
        const cacheWithSeed = { [seedPromptPath]: { content: 'seed', isLoading: false } };
        setupStore(mockSession, mockProject, mockStage, false, null, cacheWithSeed);
        const generateFn = getDialecticStoreState().generateContributions;

        renderComponent(mockStage, true);
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        fireEvent.click(generateButton);

        expect(generateFn).toHaveBeenCalledWith({
            sessionId: mockSession.id,
            projectId: mockProject.id,
            stageSlug: mockStage.slug,
            iterationNumber: mockSession.iteration_count,
        });
    });

    it('shows "Regenerate" text if contributions for the stage already exist', () => {
        const contribution = { stage: { id: mockStage.id } } as unknown as DialecticContribution;
        const sessionWithContributions = { ...mockSession, dialectic_contributions: [contribution] };
        const projectWithContributionSession = { ...mockProject, dialectic_sessions: [sessionWithContributions] };
        const cacheWithSeed = { [seedPromptPath]: { content: 'seed', isLoading: false } };
        setupStore(sessionWithContributions, projectWithContributionSession, mockStage, false, null, cacheWithSeed);

        renderComponent(mockStage, true);
        const regenerateButton = screen.getByRole('button', { name: `Regenerate ${mockStage.display_name}` });
        expect(regenerateButton).toBeInTheDocument();
    });

  });
}); 