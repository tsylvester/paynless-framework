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
  currentStageSlug: null,
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

  it('renders correct percentage from selectUnifiedProjectProgress.overallPercentage', () => {
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

  it('displays current stage name in message', () => {
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

  it('reacts to store updates and renders progress dynamically', () => {
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
});
