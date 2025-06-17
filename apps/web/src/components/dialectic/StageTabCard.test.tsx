import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
} from '@paynless/types';
import { useDialecticStore } from '@paynless/store';
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
    file_type: 'text/markdown',
    file_size: 123,
    storage_path: 'path/to/seed.md',
    created_at: 'now',
    updated_at: 'now'
};

describe('StageTabCard', () => {

  const setupStore = (session: DialecticSession | undefined, project: DialecticProject | undefined, activeStage: DialecticStage | null, isGenerating = false, generateError: ApiError | null = null, contributionCache: Record<string, ContributionCacheEntry> = {}, overrides?: Partial<DialecticStateValues>) => {
    const state: Partial<DialecticStore> = {
      activeContextProjectId: project?.id ?? null,
      activeContextSessionId: session?.id ?? null,
      activeContextStageSlug: activeStage,
      currentProjectDetail: project,
      isGeneratingContributions: isGenerating,
      generateContributionsError: generateError,
      contributionContentCache: contributionCache,
      ...overrides,
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

  const renderComponent = (stage: DialecticStage, isActive: boolean, overrides?: Partial<DialecticStateValues>) => {
    setupStore(mockSession, mockProject, stage, false, null, {}, overrides);
    render(<StageTabCard stage={stage} isActiveStage={isActive} />);
  };

  it('renders display name and reflects active state', () => {
    renderComponent(mockStage, true);
    const card = screen.getByTestId(`stage-tab-${mockStage.slug}`);
    expect(card).toHaveClass('border-primary');
    expect(screen.getByText(mockStage.display_name)).toBeInTheDocument();
  });

  it('reflects inactive state', () => {
    renderComponent(mockStage, false);
    const card = screen.getByTestId(`stage-tab-${mockStage.slug}`);
    expect(card).not.toHaveClass('border-primary');
  });

  it('calls setActiveDialecticContext from the store when clicked', () => {
    renderComponent(mockStage, true);
    fireEvent.click(screen.getByTestId(`stage-tab-${mockStage.slug}`));
    expect(getDialecticStoreState().setActiveDialecticContext).toHaveBeenCalledWith({ projectId: mockProject.id, sessionId: mockSession.id, stage: mockStage });
  });

  describe('Context Unavailable Message', () => {
    it('shows context unavailable if session is missing', () => {
        renderComponent(mockStage, true, { activeContextSessionId: undefined });
        expect(screen.getByText('Context unavailable')).toBeInTheDocument();
    });
  });

  describe('Generate Contributions Button', () => {
    it('is visible and enabled if card is active and seed prompt exists', async () => {
      renderComponent(mockStage, true, {
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
      renderComponent(mockStage, true, {
        currentProjectDetail: {
          ...mockProject,
          resources: [mockSeedPromptResource]
        },
        initialPromptContentCache: {
          [mockSeedPromptResource.id]: { isLoading: true }
        }
      });
      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeDisabled();
      });
    });

    it('is visible but disabled if seed prompt does not exist', async () => {
      renderComponent(mockStage, true, {
        currentProjectDetail: {
          ...mockProject,
          resources: []
        },
        initialPromptContentCache: {}
      });
      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: `Generate ${mockStage.display_name}` });
        expect(generateButton).toBeInTheDocument();
        expect(generateButton).toBeDisabled();
      });
    });

    it('is not visible if stage card is not active', () => {
      renderComponent(mockStage, false);
      const generateButton = screen.queryByRole('button', { name: /Generate/ });
      expect(generateButton).not.toBeInTheDocument();
    });

    it('dispatches generateContributions action with correct payload on click', async () => {
      renderComponent(mockStage, true, {
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
        stage: mockStage,
        iteration: 1,
        content: 'some contribution',
        created_at: 'now',
        model_id: 'm-1',
        parent_contribution_id: null,
        is_pinned: false,
        project_id: mockProject.id
      };

      const sessionWithContributions = { ...mockSession, dialectic_contributions: [contribution] };
      renderComponent(mockStage, true, {
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
}); 