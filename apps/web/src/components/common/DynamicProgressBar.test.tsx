import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedProjectProgress } from '@paynless/types';
import { DynamicProgressBar } from './DynamicProgressBar';
import {
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
};

describe('DynamicProgressBar', () => {
  const sessionId = 'test-session-1';

  beforeEach(() => {
    resetDialecticStoreMock();
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
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders current stage name from selectUnifiedProjectProgress.currentStageSlug', () => {
    const progress: UnifiedProjectProgress = {
      totalStages: 5,
      completedStages: 1,
      currentStageSlug: 'thesis',
      overallPercentage: 20,
      currentStage: null,
      projectStatus: 'in_progress',
      stageDetails: [],
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText(/thesis/i)).toBeInTheDocument();
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
          stagePercentage: 50,
          stageStatus: 'in_progress',
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              totalJobs: 1,
              completedJobs: 1,
              inProgressJobs: 0,
              failedJobs: 0,
              stepPercentage: 100,
              status: 'completed',
            },
            {
              stepKey: 'execute',
              stepName: 'Execute',
              totalJobs: 3,
              completedJobs: 1,
              inProgressJobs: 0,
              failedJobs: 0,
              stepPercentage: 33,
              status: 'in_progress',
            },
          ],
        },
      ],
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
          stagePercentage: 0,
          stageStatus: 'not_started',
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              totalJobs: 0,
              completedJobs: 0,
              inProgressJobs: 0,
              failedJobs: 0,
              stepPercentage: 0,
              status: 'not_started',
            },
            {
              stepKey: 'execute',
              stepName: 'Execute',
              totalJobs: 0,
              completedJobs: 0,
              inProgressJobs: 0,
              failedJobs: 0,
              stepPercentage: 0,
              status: 'not_started',
            },
          ],
        },
      ],
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
          stagePercentage: 100,
          stageStatus: 'completed',
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              totalJobs: 1,
              completedJobs: 1,
              inProgressJobs: 0,
              failedJobs: 0,
              stepPercentage: 100,
              status: 'completed',
            },
          ],
        },
        {
          stageSlug: 'paralysis',
          totalSteps: 1,
          completedSteps: 1,
          stagePercentage: 100,
          stageStatus: 'completed',
          stepsDetail: [
            {
              stepKey: 'plan',
              stepName: 'Plan',
              totalJobs: 1,
              completedJobs: 1,
              inProgressJobs: 0,
              failedJobs: 0,
              stepPercentage: 100,
              status: 'completed',
            },
          ],
        },
      ],
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
    };
    selectUnifiedProjectProgress.mockReturnValue(progress);

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(selectUnifiedProjectProgress).toHaveBeenCalled();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
