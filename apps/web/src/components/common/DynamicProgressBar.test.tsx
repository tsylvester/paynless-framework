import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicProgressBar } from './DynamicProgressBar';
import { setDialecticStateValues, resetDialecticStoreMock } from '../../mocks/dialecticStore.mock';

// Redirect any imports from the actual store to our controlled mock
vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

describe('DynamicProgressBar', () => {
  const sessionId = 'test-session-1';

  beforeEach(() => {
    // Reset the entire mock store to its initial state before each test
    resetDialecticStoreMock();
  });

  it('should render null when no progress data is available for the session', () => {
    const { container } = render(<DynamicProgressBar sessionId={sessionId} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render null if total_steps is 0 to avoid division by zero', () => {
    // Set the state using the helper from the mock file
    setDialecticStateValues({
      sessionProgress: {
        [sessionId]: {
          current_step: 0,
          total_steps: 0,
          message: 'Initializing...',
        },
      },
    });

    const { container } = render(<DynamicProgressBar sessionId={sessionId} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render the progress bar with the correct message and percentage', () => {
    const message = 'Processing step 3 of 15';
    setDialecticStateValues({
      sessionProgress: {
        [sessionId]: {
          current_step: 3,
          total_steps: 15,
          message: message,
        },
      },
    });

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();

    const progressBar = screen.getByRole('progressbar');
    const progressBarIndicator = progressBar.querySelector('[data-slot="progress-indicator"]');
    expect(progressBarIndicator).toBeInTheDocument();
    expect(progressBarIndicator).toHaveStyle({ transform: 'translateX(-80%)' });
  });

  it('should correctly display 100% when current_step equals total_steps', () => {
    const message = 'All steps completed!';
    setDialecticStateValues({
      sessionProgress: {
        [sessionId]: {
          current_step: 10,
          total_steps: 10,
          message: message,
        },
      },
    });

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    const progressBar = screen.getByRole('progressbar');
    const progressBarIndicator = progressBar.querySelector('[data-slot="progress-indicator"]');
    expect(progressBarIndicator).toBeInTheDocument();
    expect(progressBarIndicator).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  it('should not display anything for a different, unrelated session ID', () => {
    const message = 'Active session progress';
    setDialecticStateValues({
      sessionProgress: {
        [sessionId]: {
          current_step: 5,
          total_steps: 10,
          message: message,
        },
      },
    });

    const { container } = render(<DynamicProgressBar sessionId="unrelated-session-id" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('should clamp the progress at 100% if current_step exceeds total_steps', () => {
    const message = 'Unexpected state: 12 of 10';
    setDialecticStateValues({
      sessionProgress: { [sessionId]: { current_step: 12, total_steps: 10, message },
      },
    });

    render(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    const progressBar = screen.getByRole('progressbar');
    const progressBarIndicator = progressBar.querySelector('[data-slot="progress-indicator"]');
    expect(progressBarIndicator).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  it('should apply the passed className to the root element', () => {
    setDialecticStateValues({
      sessionProgress: {
        [sessionId]: { current_step: 1, total_steps: 2, message: 'Test' },
      },
    });

    const { container } = render(
      <DynamicProgressBar sessionId={sessionId} className="my-custom-class" />
    );

    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('should react to store updates and render progress dynamically', () => {
    const { rerender } = render(<DynamicProgressBar sessionId={sessionId} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    act(() => {
        setDialecticStateValues({
          sessionProgress: {
            [sessionId]: { current_step: 4, total_steps: 10, message: 'Updated' },
          },
        });
    });
    
    rerender(<DynamicProgressBar sessionId={sessionId} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  describe('Default Messages', () => {
    it('should show "Initializing..." if message is missing and step is 0', () => {
      setDialecticStateValues({
        sessionProgress: { [sessionId]: { current_step: 0, total_steps: 10, message: '' } },
      });
      render(<DynamicProgressBar sessionId={sessionId} />);
      expect(screen.getByText('Initializing...')).toBeInTheDocument();
    });

    it('should show "Finalizing..." if message is missing and step is >= total_steps', () => {
      setDialecticStateValues({
        sessionProgress: { [sessionId]: { current_step: 10, total_steps: 10, message: '' } },
      });
      render(<DynamicProgressBar sessionId={sessionId} />);
      expect(screen.getByText('Finalizing...')).toBeInTheDocument();
    });

    it('should show "Processing..." with fraction if message is missing and in progress', () => {
      setDialecticStateValues({
        sessionProgress: { [sessionId]: { current_step: 5, total_steps: 10, message: '' } },
      });
      render(<DynamicProgressBar sessionId={sessionId} />);
      expect(screen.getByText('Processing... (5/10)')).toBeInTheDocument();
    });
  });
});
