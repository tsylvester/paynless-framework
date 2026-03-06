import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  UnifiedProjectProgress,
  DialecticStage,
  DialecticProcessTemplate,
} from '@paynless/types';
import { DynamicProgressBar } from './DynamicProgressBar';
import {
  initializeMockDialecticState,
  resetDialecticStoreMock,
  selectUnifiedProjectProgress,
} from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

const defaultProgress: UnifiedProjectProgress = {
  totalStages: 0,
  completedStages: 0,
  currentStageSlug: 'thesis',
  overallPercentage: 0,
  currentStage: null,
  projectStatus: 'not_started',
  stageDetails: [],
  hydrationReady: true,
};

const defaultStages: DialecticStage[] = [
  { id: '1', display_name: 'Thesis', slug: 'thesis', created_at: '', default_system_prompt_id: null, description: null, expected_output_template_ids: [], recipe_template_id: null, active_recipe_instance_id: null, minimum_balance: 0 },
  { id: '2', display_name: 'Antithesis', slug: 'antithesis', created_at: '', default_system_prompt_id: null, description: null, expected_output_template_ids: [], recipe_template_id: null, active_recipe_instance_id: null, minimum_balance: 0 },
  { id: '3', display_name: 'Synthesis', slug: 'synthesis', created_at: '', default_system_prompt_id: null, description: null, expected_output_template_ids: [], recipe_template_id: null, active_recipe_instance_id: null, minimum_balance: 0 },
  { id: '4', display_name: 'Paralysis', slug: 'paralysis', created_at: '', default_system_prompt_id: null, description: null, expected_output_template_ids: [], recipe_template_id: null, active_recipe_instance_id: null, minimum_balance: 0 },
];
const defaultProcessTemplate: DialecticProcessTemplate = {
  id: 'p1',
  name: 'Test Process',
  starting_stage_id: null,
  stages: defaultStages,
  transitions: [],
  created_at: '',
  description: null,
};

describe('DynamicProgressBar', () => {
  const sessionId = 'test-session-1';

  beforeEach(() => {
    resetDialecticStoreMock();
    initializeMockDialecticState({ currentProcessTemplate: defaultProcessTemplate });
    selectUnifiedProjectProgress.mockReturnValue(defaultProgress);
  });

  it('renders 0% progress bar for new project', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 0,
      currentStageSlug: 'thesis',
      overallPercentage: 0,
      currentStage: null,
      projectStatus: 'not_started',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders overall percentage from selectUnifiedProjectProgress.overallPercentage', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 2,
      currentStageSlug: 'synthesis',
      overallPercentage: 40,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders current stage display_name in progress bar label', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 1,
      currentStageSlug: 'thesis',
      overallPercentage: 20,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText(/Stage 1\/5: Thesis/)).toBeInTheDocument();
  });

  it('displays step detail (stage X/Y)', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 2,
      currentStageSlug: 'synthesis',
      overallPercentage: 40,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText(/2/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('applies the passed className to the root element', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 2,
      currentStageSlug: 'thesis',
      overallPercentage: 50,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    const { container } = render(
      <DynamicProgressBar sessionId={sessionId} className="my-custom-class" />
    );

    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('updates in real-time as selector output changes (job notifications processed)', () => {
    selectUnifiedProjectProgress.mockReturnValue(defaultProgress);

    const { rerender } = render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('0%')).toBeInTheDocument();

    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 2,
      currentStageSlug: 'thesis',
      overallPercentage: 40,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };

    act(() => {
      selectUnifiedProjectProgress.mockReturnValue(progress);
    });

    rerender(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders step progress as completedJobs/totalJobs for current stage steps', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 2,
      completedStages: 0,
      currentStageSlug: 'thesis',
      overallPercentage: 25,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [
        {
          stageSlug: 'thesis',
          totalSteps: 2,
          completedSteps: 1,
          failedSteps: 0,
          stagePercentage: 50,
          stageStatus: 'in_progress',
          totalDocuments: 0,
          completedDocuments: 0,
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              status: 'completed',
            },
            {
              stepKey: 'execute',
              stepName: 'Execute',
              status: 'in_progress',
            },
          ],
        },
      ],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders 0% when jobProgress is empty (no jobs started)', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 2,
      completedStages: 0,
      currentStageSlug: 'thesis',
      overallPercentage: 0,
      currentStage: null,
      projectStatus: 'not_started',
      stageDetails: [
        {
          stageSlug: 'thesis',
          totalSteps: 2,
          completedSteps: 0,
          failedSteps: 0,
          stagePercentage: 0,
          stageStatus: 'not_started',
          totalDocuments: 0,
          completedDocuments: 0,
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              status: 'not_started',
            },
            {
              stepKey: 'execute',
              stepName: 'Execute',
              status: 'not_started',
            },
          ],
        },
      ],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders 100% when all jobs completed for all stages', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 2,
      completedStages: 2,
      currentStageSlug: 'paralysis',
      overallPercentage: 100,
      currentStage: null,
      projectStatus: 'completed',
      stageDetails: [
        {
          stageSlug: 'thesis',
          totalSteps: 1,
          completedSteps: 1,
          failedSteps: 0,
          stagePercentage: 100,
          stageStatus: 'completed',
          totalDocuments: 0,
          completedDocuments: 0,
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              status: 'completed',
            },
          ],
        },
        {
          stageSlug: 'paralysis',
          totalSteps: 1,
          completedSteps: 1,
          failedSteps: 0,
          stagePercentage: 100,
          stageStatus: 'completed',
          totalDocuments: 0,
          completedDocuments: 0,
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              status: 'completed',
            },
          ],
        },
      ],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('does not reference selectedModels', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 1,
      completedStages: 0,
      currentStageSlug: 'thesis',
      overallPercentage: 0,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(selectUnifiedProjectProgress).toHaveBeenCalled();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows stage display_name in progress bar label when stage is in sorted stages', () => {
    const stage: DialecticStage = {
      id: '1',
      display_name: 'Review',
      slug: 'antithesis',
      created_at: '',
      default_system_prompt_id: null,
      description: null,
      expected_output_template_ids: [],
      recipe_template_id: null,
      active_recipe_instance_id: null,
      minimum_balance: 0,
    };
    const processTemplate: DialecticProcessTemplate = {
      id: 'p1',
      name: 'Test Process',
      starting_stage_id: null,
      stages: [stage],
      transitions: [],
      created_at: '',
      description: null,
    };
    initializeMockDialecticState({ currentProcessTemplate: processTemplate });

    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 2,
      currentStageSlug: 'antithesis',
      overallPercentage: 40,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
      hydrationReady: true,
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText(/Stage 2\/5: Review/)).toBeInTheDocument();
  });

});
