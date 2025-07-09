import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { useAiStore } from '@paynless/store';
import { ContinueUntilCompleteToggle } from './ContinueUntilCompleteToggle';

// Mock the entire store
vi.mock('@paynless/store', () => ({
  useAiStore: vi.fn(),
}));

describe('ContinueUntilCompleteToggle', () => {
  const setContinueUntilComplete = vi.fn();
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should render the toggle and label', () => {
    (useAiStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<ContinueUntilCompleteToggle />);

    expect(screen.getByLabelText(/Continue until complete/i)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('should reflect the `continueUntilComplete` state from the store (when false)', () => {
    (useAiStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        continueUntilComplete: false,
        setContinueUntilComplete,
      };
      return selector(state);
    });

    render(<ContinueUntilCompleteToggle />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).not.toBeChecked();
  });

  it('should reflect the `continueUntilComplete` state from the store (when true)', () => {
    (useAiStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        continueUntilComplete: true,
        setContinueUntilComplete,
      };
      return selector(state);
    });

    render(<ContinueUntilCompleteToggle />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeChecked();
  });

  it('should call `setContinueUntilComplete` action with true when toggled on', () => {
    (useAiStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        const state = {
          continueUntilComplete: false,
          setContinueUntilComplete,
        };
        return selector(state);
      });

    render(<ContinueUntilCompleteToggle />);
    const switchElement = screen.getByRole('switch');
    
    fireEvent.click(switchElement);
    
    expect(setContinueUntilComplete).toHaveBeenCalledTimes(1);
    expect(setContinueUntilComplete).toHaveBeenCalledWith(true);
  });

  it('should call `setContinueUntilComplete` action with false when toggled off', () => {
    (useAiStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        const state = {
          continueUntilComplete: true,
          setContinueUntilComplete,
        };
        return selector(state);
      });
  
      render(<ContinueUntilCompleteToggle />);
      const switchElement = screen.getByRole('switch');
      
      fireEvent.click(switchElement);
      
      expect(setContinueUntilComplete).toHaveBeenCalledTimes(1);
      expect(setContinueUntilComplete).toHaveBeenCalledWith(false);
    });
}); 