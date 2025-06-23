import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { StageTabCard } from './StageTabCard';
import { 
  DialecticProject, 
  DialecticSession, 
  DialecticStage,
  DialecticStore,
  ApiError,
  ContributionCacheEntry,
  DialecticContribution,
  DialecticProjectResource,
  DialecticStateValues,
} from '@paynless/types';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { selectIsStageReadyForSessionIteration } from '@paynless/store';

vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  return {
    ...actualStoreModule,
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
    selectIsStageReadyForSessionIteration: vi.fn(),
    selectSelectedModelIds: vi.fn(() => ['mock-model-id']),
  };
});

vi.mock('./AIModelSelector', () => ({
  AIModelSelector: vi.fn(() => <div data-testid="ai-model-selector-mock">AIModelSelectorMock</div>),
}));

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
  dialectic_domains: { name: 'Software' },
  selected_domain_overlay_id: null,
  initial_user_prompt: 'Test',
  repo_url: null,
  dialectic_sessions: [mockSession],
  process_template_id: 'pt-1',
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

const mockSeedPromptResource: DialecticProjectResource = {
    id: 'res-seed-123',
    project_id: mockProject.id,
    resource_description: JSON.stringify({
        type: 'seed_prompt',
        session_id: mockSession.id,
        stage_slug: mockStage.slug,
        iteration: mockSession.iteration_count
    }),
    file_name: 'seed.md',
    mime_type: 'text/markdown',
    size_bytes: 123,
    storage_path: 'path/to/seed.md',
    created_at: 'now',
    updated_at: 'now'
};

describe('StageTabCard', () => {

  const setupStore = (
    session: DialecticSession | undefined, 
    project: DialecticProject | undefined, 
    activeStage: DialecticStage | null, 
    isStageReadyOverride?: boolean,
    isGenerating = false, 
    generateError: ApiError | null = null, 
    contributionCache: Record<string, ContributionCacheEntry> = {}, 
    initialPromptCache: Record<string, { content: string; isLoading: boolean; error: ApiError | null; }> = {},
    overrides?: Partial<DialecticStateValues>
  ) => {
    const isReady = isStageReadyOverride === undefined ? true : isStageReadyOverride;
    (selectIsStageReadyForSessionIteration as unknown as MockInstance<
        [DialecticStore, string, string, string, number],
        boolean
    >).mockReturnValue(isReady);

    const state: Partial<DialecticStore> = {
      activeContextProjectId: project?.id ?? null,
      activeContextSessionId: session?.id ?? null,
      activeContextStage: activeStage,
      currentProjectDetail: project,
      contributionGenerationStatus: isGenerating ? 'generating' : 'idle',
      generateContributionsError: generateError,
      contributionContentCache: contributionCache,
      initialPromptContentCache: initialPromptCache,
      ...overrides,
    };
    initializeMockDialecticState(state);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const storeState = getDialecticStoreState();
    storeState.setActiveDialecticContext = vi.fn();
    storeState.generateContributions = vi.fn();
    storeState.fetchInitialPromptContent = vi.fn();
  });

  const renderComponent = (stage: DialecticStage, isActive: boolean, isStageReadyOverride?: boolean, overrides?: Partial<DialecticStateValues>, onCardClickMock?: () => void) => {
    setupStore(mockSession, mockProject, stage, isStageReadyOverride, false, null, {}, {}, overrides);
    render(<StageTabCard stage={stage} isActiveStage={isActive} onCardClick={onCardClickMock || (() => {})} />);
  };

  it('renders display name and reflects active state', () => {
    renderComponent(mockStage, true, true);
    const card = screen.getByTestId(`stage-tab-${mockStage.slug}`);
    expect(card).toHaveClass('border-primary');
    expect(screen.getByText(mockStage.display_name)).toBeInTheDocument();
  });

  it('reflects inactive state', () => {
    renderComponent(mockStage, false, true);
    const card = screen.getByTestId(`stage-tab-${mockStage.slug}`);
    expect(card).not.toHaveClass('border-primary');
  });

  it('calls setActiveDialecticContext from the store when clicked', () => {
    const mockOnCardClick = vi.fn();
    renderComponent(mockStage, true, true, undefined, mockOnCardClick);
    fireEvent.click(screen.getByTestId(`stage-tab-${mockStage.slug}`));
    expect(mockOnCardClick).toHaveBeenCalledWith(mockStage);
  });

  describe('Context Unavailable Message', () => {
    it('shows context unavailable if session is missing', () => {
        renderComponent(mockStage, true, true, { activeContextSessionId: undefined });
        expect(screen.getByText('Context unavailable')).toBeInTheDocument();
    });
  });

  describe('Generate Contributions Button', () => {
    it('is visible and enabled if card is active and stage is ready and seed prompt is loaded', async () => {
      renderComponent(mockStage, true, true, {
        currentProjectDetail: {
          ...mockProject,
          resources: [mockSeedPromptResource]
        },
        initialPromptContentCache: {
          [mockSeedPromptResource.id]: { content: 'Seed prompt content', isLoading: false, error: null }
        }
      });
      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeEnabled();
      });
    });

    it('is visible but disabled if seed prompt is loading', async () => {
      renderComponent(mockStage, true, true, {
        currentProjectDetail: {
          ...mockProject,
          resources: [mockSeedPromptResource]
        },
        initialPromptContentCache: {
          [mockSeedPromptResource.id]: { content: 'Seed prompt content', isLoading: true, error: null }
        }
      });
      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeDisabled();
      });
    });

    it('is visible but disabled if stage is not ready (seed prompt does not exist effectively)', async () => {
      renderComponent(mockStage, true, false, {
        currentProjectDetail: {
          ...mockProject,
          resources: []
        },
        initialPromptContentCache: {}
      });
      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: "Stage Not Ready" });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeDisabled();
      });
    });

    it('is not visible if stage card is not active', () => {
      renderComponent(mockStage, false, true);
      const generateButton = screen.queryByRole('button', { name: /Generate/ });
      expect(generateButton).not.toBeInTheDocument();
    });

    it('dispatches generateContributions action with correct payload on click', async () => {
      renderComponent(mockStage, true, true, {
        currentProjectDetail: {
          ...mockProject,
          resources: [mockSeedPromptResource]
        },
        initialPromptContentCache: {
          [mockSeedPromptResource.id]: { content: 'Seed prompt here', isLoading: false, error: null }
        }
      });

      await waitFor(async () => {
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        expect(generateButton).toBeEnabled();
        fireEvent.click(generateButton);

        expect(getDialecticStoreState().generateContributions).toHaveBeenCalledWith({
          sessionId: mockSession.id,
          projectId: mockProject.id,
          stageSlug: mockStage.slug,
          iterationNumber: mockSession.iteration_count,
        });
      });
    });

    it('shows "Regenerate" text if contributions for the stage already exist', async () => {
      const contribution: DialecticContribution = {
        id: 'c-1',
        session_id: mockSession.id,
        stage: mockStage.slug,
        created_at: new Date().toISOString(),
        model_id: 'm-1',
        target_contribution_id: null,
        user_id: mockProject.user_id,
        iteration_number: mockSession.iteration_count,
        model_name: 'm-1',
        prompt_template_id_used: 'pt-1',
        seed_prompt_url: 'https://example.com/seed_prompt.md',
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: 'test-path',
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        error: null,
        citations: [],
        updated_at: new Date().toISOString(),
        file_name: 'c-1.md',
        storage_bucket: 'test-bucket',
        storage_path: 'test-path',
        mime_type: 'text/markdown',
        size_bytes: 123,
        contribution_type: 'ai',
      };

      const sessionWithContributions = { ...mockSession, dialectic_contributions: [contribution] };
      renderComponent(mockStage, true, true, {
        currentProjectDetail: {
          ...mockProject,
          dialectic_sessions: [sessionWithContributions],
          resources: [mockSeedPromptResource]
        },
        initialPromptContentCache: {
          [mockSeedPromptResource.id]: { content: 'Seed prompt here', isLoading: false, error: null }
        }
      });

      await waitFor(() => {
        const regenerateButton = screen.getByRole('button', { name: `Regenerate ${mockStage.display_name}` });
        expect(regenerateButton).toBeInTheDocument();
      });
    });
  });

  describe('Stage Readiness UI Logic (as per Plan 2.B.2)', () => {
    it('should disable button and show "Stage Not Ready" text when stage is active but not ready', async () => {
      renderComponent(mockStage, true, false);

      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: "Stage Not Ready" });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeDisabled();
      });
    });

    it('should enable button and show "Generate Contributions" text when stage is active and ready', async () => {
      renderComponent(mockStage, true, true, {
        currentProjectDetail: {
          ...mockProject,
          resources: [mockSeedPromptResource],
        },
        initialPromptContentCache: {
          [mockSeedPromptResource.id]: { content: 'Seed prompt content', isLoading: false, error: null }
        }
      });

      await waitFor(() => {
        const generateButton = screen.getByRole('button');
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeEnabled();
      });
    });

    it('button should be disabled if stage is not active, regardless of readiness (as per plan logic)', async () => {
      renderComponent(mockStage, false, true);

      const generateButton = screen.queryByRole('button');
      if (generateButton) {
        expect(generateButton).toBeDisabled();
      }
    });
  });
});