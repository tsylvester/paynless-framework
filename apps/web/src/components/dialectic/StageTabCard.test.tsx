import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StageTabCard } from './StageTabCard';
import { 
  DialecticProject, 
  DialecticSession, 
  DialecticStage,
  DialecticStateValues,
  DialecticProcessTemplate,
} from '@paynless/types';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';

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

const mockSession: DialecticSession = {
  id: 'ses-123',
  project_id: 'proj-123',
  session_description: 'Test session',
  iteration_count: 1,
  current_stage_id: 'stage-1',
  status: 'pending_hypothesis',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  selected_model_ids: ['model-1'],
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
  dialectic_process_templates: mockProcessTemplate as DialecticProcessTemplate,
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
  stepStatuses: StageRunProgressEntry['stepStatuses'] = {}
): StageRunProgressEntry => {
  const documents: StageRunProgressEntry['documents'] = {};
  for (const [documentKey, status] of Object.entries(documentStatuses)) {
    documents[documentKey] = { status };
  }
  return {
    documents,
    stepStatuses,
  };
};

vi.mock('@paynless/store', async () => {
    const originalModule = await vi.importActual('@paynless/store');
    const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
    
    return {
        ...originalModule,
        useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
    };
});

describe('StageTabCard', () => {
    const setupStore = (overrides: Partial<DialecticStateValues> = {}) => {
        const initialState: DialecticStateValues = {
            ...getDialecticStoreState(),
            currentProjectDetail: mockProject,
            activeContextSessionId: mockSession.id,
            activeStageSlug: mockStages[0].slug,
            currentProcessTemplate: mockProcessTemplate as DialecticProcessTemplate,
            ...overrides,
        };
        initializeMockDialecticState(initialState);
    };

  beforeEach(() => {
    vi.clearAllMocks();
    const storeActions = getDialecticStoreState();
    storeActions.setActiveStage = vi.fn();
  });

  const renderComponent = () => {
    return render(<StageTabCard />);
  };

  it('renders all stage tabs when stages are available', () => {
    setupStore();
    renderComponent();
    expect(screen.getByText('Hypothesis')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('renders message when no stages are available', () => {
    setupStore({
        currentProcessTemplate: { ...mockProcessTemplate, stages: [] } as DialecticProcessTemplate,
    });
    renderComponent();
    expect(screen.getByText('No stages available for this process.')).toBeInTheDocument();
  });
  
  it('highlights the active stage', () => {
    setupStore({ activeStageSlug: 'analysis' });
    renderComponent();
    
    const activeCard = screen.getByTestId('stage-tab-analysis');
    const inactiveCard = screen.getByTestId('stage-tab-hypothesis');
    
    expect(activeCard).toHaveClass('border-primary');
    expect(inactiveCard).not.toHaveClass('border-primary');
  });

  it('calls setActiveStage when a card is clicked', () => {
    setupStore();
    const setActiveStageMock = getDialecticStoreState().setActiveStage;
    renderComponent();
    
    const analysisCard = screen.getByTestId('stage-tab-analysis');
    fireEvent.click(analysisCard);
    
    expect(setActiveStageMock).toHaveBeenCalledWith('analysis');
  });

  it('shows completed label and document totals when all documents are finished', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    setupStore({
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'completed',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-tab-hypothesis');
    expect(within(hypothesisCard).getByText('Completed')).toBeInTheDocument();
    expect(within(hypothesisCard).getByText('2 / 2 documents')).toBeInTheDocument();
  });

  it('omits completed label when any document is still generating', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    setupStore({
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'generating',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-tab-hypothesis');
    expect(within(hypothesisCard).queryByText('Completed')).toBeNull();
    expect(within(hypothesisCard).getByText('1 / 2 documents')).toBeInTheDocument();
  });

  it('omits completed label when any document has failed', () => {
    const progressKey = `${mockSession.id}:${mockStages[0].slug}:${mockSession.iteration_count}`;
    setupStore({
      stageRunProgress: {
        [progressKey]: createStageRunProgressEntry({
          'document-one': 'completed',
          'document-two': 'failed',
        }),
      },
    });

    renderComponent();

    const hypothesisCard = screen.getByTestId('stage-tab-hypothesis');
    expect(within(hypothesisCard).queryByText('Completed')).toBeNull();
    expect(within(hypothesisCard).getByText('1 / 2 documents')).toBeInTheDocument();
  });
});