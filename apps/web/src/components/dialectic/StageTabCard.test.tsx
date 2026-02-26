import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StageTabCard } from './StageTabCard';
import {
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticStateValues,
  DialecticProcessTemplate,
  OutputRequirement,
  SelectedModels,
  StageRunChecklistProps,
  StageRunDocumentDescriptor,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
} from '@paynless/types';
import {
  initialDialecticStateValues,
  initializeMockDialecticState,
  getDialecticStoreState,
  setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';

vi.mock('@/components/dialectic/GenerateContributionButton', () => ({
  GenerateContributionButton: vi.fn(() => <div data-testid="generate-contribution-button-mock"></div>),
}));

vi.mock('@/components/dialectic/AIModelSelector', () => ({
  AIModelSelector: vi.fn(() => <div data-testid="ai-model-selector-mock"></div>),
}));

const mockStages: DialecticStage[] = [
  {
    id: 'stage-1',
    slug: 'hypothesis',
    display_name: 'Hypothesis',
    description: 'Formulate a hypothesis.',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'd-1',
    expected_output_template_ids: [],
    recipe_template_id: null,
    active_recipe_instance_id: null,
  },
  {
    id: 'stage-2',
    slug: 'analysis',
    display_name: 'Analysis',
    description: 'Analyze the results.',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'd-2',
    expected_output_template_ids: [],
    recipe_template_id: null,
    active_recipe_instance_id: null,
  },
];

const mockProcessTemplate: Omit<DialecticProcessTemplate, 'owner_id' | 'is_default' | 'visibility'> = {
  id: 'pt-1',
  name: 'Test Process',
  description: 'A test process template',
  starting_stage_id: 'stage-1',
  stages: mockStages,
  transitions: [],
  created_at: new Date().toISOString(),
};

const defaultSelectedModels: SelectedModels[] = [{ id: 'model-1', displayName: 'Model 1' }];

const mockSession: DialecticSession = {
  id: 'ses-123',
  project_id: 'proj-123',
  session_description: 'Test session',
  iteration_count: 1,
  current_stage_id: 'stage-1',
  status: 'pending_hypothesis',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  selected_models: defaultSelectedModels,
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
  dialectic_process_templates: mockProcessTemplate,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
};

type StageRunProgressEntry = NonNullable<DialecticStateValues['stageRunProgress'][string]>;
type StageRunDocumentStatus = StageRunProgressEntry['documents'][string]['status'];

const createStageRunProgressEntry = (
  documentStatuses: Record<string, StageRunDocumentStatus>,
  stepStatuses: StageRunProgressEntry['stepStatuses'] = {},
  modelIdForDocuments = 'model-1'
): StageRunProgressEntry => {
  const documents: StageRunProgressEntry['documents'] = {};
  const nowIso = new Date().toISOString();
  for (const [documentKey, status] of Object.entries(documentStatuses)) {
    const descriptor: StageRunDocumentDescriptor = {
      status,
      job_id: `job-${documentKey}`,
      latestRenderedResourceId: `${documentKey}.latest`,
      modelId: modelIdForDocuments,
      versionHash: `version-${documentKey}`,
      lastRenderedResourceId: `${documentKey}.resource`,
      lastRenderAtIso: nowIso,
    };
    documents[documentKey] = descriptor;
  }
  return {
    documents,
    stepStatuses,
  };
};

const createRecipeWithMarkdownDocuments = (
  documentKeys: string[],
  stageSlug: string = mockStages[0].slug,
  instanceId: string = 'instance-test'
): DialecticStageRecipe => {
  const steps: DialecticStageRecipeStep[] = documentKeys.map((documentKey, index) => {
    const outputs_required: OutputRequirement[] = [
      {
        document_key: documentKey,
        artifact_class: 'rendered_document',
        file_type: 'markdown',
        template_filename: `${documentKey}.md`,
      },
    ];
    return {
      id: `step-${index + 1}`,
      step_key: `generate_${documentKey}`,
      step_slug: `generate-${documentKey}`,
      step_name: `Generate ${documentKey}`,
      execution_order: index + 1,
      parallel_group: 1,
      branch_key: 'document',
      job_type: 'EXECUTE',
      prompt_type: 'Turn',
      inputs_required: [],
      outputs_required,
      output_type: 'rendered_document',
      granularity_strategy: 'all_to_one',
    };
  });

  return {
    stageSlug,
    instanceId,
    steps,
  };
};

const stageRunChecklistRenderMock = vi.fn((props: StageRunChecklistProps) => props);
const recordedStageRunChecklistProps: StageRunChecklistProps[] = [];

vi.mock('./StageRunChecklist', () => ({
  StageRunChecklist: (props: StageRunChecklistProps) => {
    stageRunChecklistRenderMock(props);
    recordedStageRunChecklistProps.push(props);
    return (
      <button
        type="button"
        data-testid={`mock-stage-run-checklist-${props.modelId}`}
        onClick={() => {
          if (props.modelId !== null) {
            props.onDocumentSelect({
              sessionId: mockSession.id,
              stageSlug: mockStages[0].slug,
              iterationNumber: mockSession.iteration_count,
              modelId: props.modelId,
              documentKey: 'draft_document_outline',
              stepKey: 'draft_document',
            });
          }
        }}
      >
        StageRunChecklist {props.modelId}
      </button>
    );
  },
}));

vi.mock('@paynless/store', async () => {
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const selectSelectedModels = actualPaynlessStore.selectSelectedModels;
  const selectUnifiedProjectProgress = actualPaynlessStore.selectUnifiedProjectProgress;
  return {
    ...mockDialecticStoreUtils,
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
    selectSelectedModels,
    selectUnifiedProjectProgress,
  };
});

describe('StageTabCard', () => {
    const setupStore = (overrides: Partial<DialecticStateValues> = {}) => {
        const initialState: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: mockProject,
            activeContextSessionId: mockSession.id,
            activeStageSlug: mockStages[0].slug,
            activeSessionDetail: mockSession,
            currentProcessTemplate: mockProcessTemplate,
            selectedModels: mockSession.selected_models,
            ...overrides,
        };
        setDialecticStateValues(initialState);
        const storeActions = getDialecticStoreState();
        storeActions.setActiveStage = vi.fn();
        storeActions.setFocusedStageDocument = vi.fn();
        return storeActions;
    };

  beforeEach(() => {
    vi.clearAllMocks();
    stageRunChecklistRenderMock.mockClear();
    recordedStageRunChecklistProps.length = 0;
    initializeMockDialecticState();
  });

  const renderComponent = () => {
    return render(<StageTabCard />);
  };

  it('renders all stage tabs when stages are available', () => {
    setupStore();
    renderComponent();
    const stageList = screen.getByTestId('stage-tab-list');
    expect(within(stageList).getByText('Hypothesis')).toBeInTheDocument();
    expect(within(stageList).getByText('Analysis')).toBeInTheDocument();
  });

  it('renders message when no stages are available', () => {
    setupStore({
        currentProcessTemplate: { ...mockProcessTemplate, stages: [] },
    });
    renderComponent();
    expect(screen.getByText('No stages available for this process.')).toBeInTheDocument();
  });
  
  it('highlights the active stage', () => {
    setupStore({ activeStageSlug: 'analysis' });
    renderComponent();
    
    const activeCard = screen.getByTestId('stage-tab-analysis');
    const inactiveCard = screen.getByTestId('stage-tab-hypothesis');
    
    expect(activeCard).toHaveAttribute('aria-selected', 'true');
    expect(inactiveCard).toHaveAttribute('aria-selected', 'false');
  });

  it('calls setActiveStage when a card is clicked', () => {
    const storeActions = setupStore();
    renderComponent();
    
    const analysisCard = screen.getByTestId('stage-tab-analysis');
    fireEvent.click(analysisCard);
    
    expect(storeActions.setActiveStage).toHaveBeenCalledWith('analysis');
  });

  it('shows Done label when stage is fully complete and not active', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one', 'document-two'], mockStages[0].slug);
    setupStore({
      activeStageSlug: 'analysis',
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'completed',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-card-hypothesis');
    expect(within(hypothesisCard).getByTestId('stage-progress-label-hypothesis')).toHaveTextContent('Done');
    expect(within(hypothesisCard).queryByTestId('stage-progress-count-hypothesis')).toBeNull();
  });

  it('omits Done label when any document is still generating', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one', 'document-two'], mockStages[0].slug);
    setupStore({
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'generating',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-tab-hypothesis');
    expect(within(hypothesisCard).queryByTestId('stage-progress-label-hypothesis')).toBeNull();
    expect(within(hypothesisCard).queryByTestId('stage-progress-count-hypothesis')).toBeNull();
  });

  it('omits Done label when any document has failed', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one', 'document-two'], mockStages[0].slug);
    setupStore({
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'failed',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-tab-hypothesis');
    expect(within(hypothesisCard).queryByTestId('stage-progress-label-hypothesis')).toBeNull();
    expect(within(hypothesisCard).queryByTestId('stage-progress-count-hypothesis')).toBeNull();
  });

  it('does not show Done label when stage has failed documents', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one', 'document-two'], mockStages[0].slug);
    setupStore({
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'failed',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-card-hypothesis');
    expect(within(hypothesisCard).queryByTestId('stage-progress-label-hypothesis')).toBeNull();
  });

  it('renders active stage tab when stage is in progress', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one', 'document-two'], mockStages[0].slug);
    setupStore({
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'generating',
        }),
      },
    });

    renderComponent();

    const hypothesisTab = screen.getByTestId('stage-tab-hypothesis');
    expect(hypothesisTab).toBeInTheDocument();
    expect(hypothesisTab).toHaveAttribute('aria-selected', 'true');
    expect(within(hypothesisTab).queryByTestId('stage-progress-label-hypothesis')).toBeNull();
  });

  it('renders future stage tab without Done label', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one'], mockStages[0].slug);
    setupStore({
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
        }),
      },
    });

    renderComponent();

    const analysisCard = screen.getByTestId('stage-card-analysis');
    expect(analysisCard).toBeInTheDocument();
    expect(within(analysisCard).queryByTestId('stage-progress-label-analysis')).toBeNull();
  });

  it('renders one StageRunChecklist (not one per model) and forwards checklist selections', () => {
    const twoSelectedModels: SelectedModels[] = [
      { id: 'model-1', displayName: 'Model 1' },
      { id: 'model-2', displayName: 'Model 2' },
    ];
    const multiModelSession: DialecticSession = {
      ...mockSession,
      selected_models: twoSelectedModels,
    };

    const focusKeyModel1 = `${multiModelSession.id}:${mockStages[0].slug}:model-1`;

    const storeActions = setupStore({
      activeSessionDetail: multiModelSession,
      selectedModels: twoSelectedModels,
      focusedStageDocument: {
        [focusKeyModel1]: { modelId: 'model-1', documentKey: 'draft_document_outline' },
      },
    });

    renderComponent();

    expect(stageRunChecklistRenderMock).toHaveBeenCalledTimes(1);
    expect(recordedStageRunChecklistProps).toHaveLength(1);
    expect(recordedStageRunChecklistProps[0].modelId).toBe('model-1');

    const stageCard = screen.getByTestId('stage-card-hypothesis');
    const checklistWrapper = within(stageCard).getByTestId('stage-checklist-wrapper-hypothesis');

    expect(within(checklistWrapper).getByTestId('mock-stage-run-checklist-model-1')).toBeInTheDocument();
    expect(within(checklistWrapper).queryByTestId('mock-stage-run-checklist-model-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-stage-run-checklist-model-1'));

    expect(storeActions.setFocusedStageDocument).toHaveBeenCalledWith({
      sessionId: multiModelSession.id,
      stageSlug: mockStages[0].slug,
      iterationNumber: multiModelSession.iteration_count,
      modelId: 'model-1',
      documentKey: 'draft_document_outline',
      stepKey: 'draft_document',
    });
  });

  it('asserts the new relocated checklist container contract', () => {
    const twoSelectedModels: SelectedModels[] = [
      { id: 'model-1', displayName: 'Model 1' },
      { id: 'model-2', displayName: 'Model 2' },
    ];
    const multiModelSession: DialecticSession = {
      ...mockSession,
      selected_models: twoSelectedModels,
    };
    setupStore({
      activeSessionDetail: multiModelSession,
      selectedModels: twoSelectedModels,
    });

    const { container } = renderComponent();
    const stageCard = screen.getByTestId('stage-card-hypothesis');

    // 12.e.iii: Verify the stage column exports spacing classes for independent height
    const rootElement = container.firstChild;
    expect(rootElement).not.toBeNull();
    if (rootElement instanceof HTMLElement) {
      expect(rootElement.classList.contains('self-start')).toBe(true);
    } else {
      throw new Error('rootElement is not an HTMLElement');
    }


    // 12.e.i: Assert the inner checklist wrapper matches outer card width and has hooks
    const checklistWrapper = within(stageCard).getByTestId('stage-checklist-wrapper-hypothesis');
    expect(checklistWrapper).toBeInTheDocument();
    expect(checklistWrapper.classList.contains('w-full')).toBe(true);

    // 12.e.ii: Assert that one StageRunChecklist panel resides directly within the wrapper
    const singleChecklist = within(checklistWrapper).getByTestId('mock-stage-run-checklist-model-1');
    expect(singleChecklist).toBeInTheDocument();
    expect(within(checklistWrapper).queryByTestId('mock-stage-run-checklist-model-2')).not.toBeInTheDocument();

    // Ensure no intermediate accordion is rendered by this component
    const accordions = checklistWrapper.querySelectorAll('[data-testid*="accordion"]');
    expect(accordions.length).toBe(0);
  });

  it('does not display document count but shows Done when complete and not active', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    const recipe = createRecipeWithMarkdownDocuments(['document-one', 'document-two'], mockStages[0].slug);
    setupStore({
      activeStageSlug: 'analysis',
      recipesByStageSlug: {
        [mockStages[0].slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'completed',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-card-hypothesis');
    const countElement = within(hypothesisCard).queryByTestId('stage-progress-count-hypothesis');
    const labelElement = within(hypothesisCard).queryByTestId('stage-progress-label-hypothesis');

    expect(countElement).toBeNull();
    expect(labelElement).toBeInTheDocument();
    expect(labelElement?.textContent).toBe('Done');
  });

  it('does not call setActiveStage from useEffect when activeStageSlug is already set', () => {
    const storeActions = setupStore({ activeStageSlug: 'analysis' });
    renderComponent();
    expect(storeActions.setActiveStage).not.toHaveBeenCalled();
  });

  it('does not re-fire useEffect when activeSessionDetail reference changes but current_stage_id is unchanged', () => {
    const storeActions = setupStore({
      activeStageSlug: null,
      activeSessionDetail: mockSession,
    });
    renderComponent();
    expect(storeActions.setActiveStage).toHaveBeenCalledTimes(1);
    expect(storeActions.setActiveStage).toHaveBeenCalledWith('hypothesis');

    const sessionNewReference: DialecticSession = {
      ...mockSession,
      updated_at: new Date().toISOString(),
    };
    act(() => {
      setDialecticStateValues({
        currentProjectDetail: {
          ...mockProject,
          dialectic_sessions: [sessionNewReference],
        },
      });
    });

    expect(storeActions.setActiveStage).toHaveBeenCalledTimes(1);
  });

  it('sets initial stage on mount when activeStageSlug is null', () => {
    const storeActions = setupStore({
      activeStageSlug: null,
      activeSessionDetail: mockSession,
      currentProcessTemplate: mockProcessTemplate,
    });
    renderComponent();
    expect(storeActions.setActiveStage).toHaveBeenCalledWith('hypothesis');
  });
});