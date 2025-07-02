import React from 'react';
import { render, screen } from '@testing-library/react';
import { CurrentMessageTokenEstimator, CurrentMessageTokenEstimatorProps } from './CurrentMessageTokenEstimator';
import { useTokenEstimator } from '@/hooks/useTokenEstimator'; // Assuming path
import { vi } from 'vitest';

// Mock the useTokenEstimator hook
vi.mock('@/hooks/useTokenEstimator', () => ({
  useTokenEstimator: vi.fn(),
}));

// Typed mock for the hook
const mockedUseTokenEstimator = useTokenEstimator as vi.MockedFunction<typeof useTokenEstimator>;

describe('CurrentMessageTokenEstimator', () => {
  const defaultTextInput = 'Hello world';

  const renderComponent = (props: Partial<CurrentMessageTokenEstimatorProps> = {}) => {
    const mergedProps: CurrentMessageTokenEstimatorProps = {
      textInput: defaultTextInput,
      ...props,
    };
    return render(<CurrentMessageTokenEstimator {...mergedProps} />);
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockedUseTokenEstimator.mockClear();
  });

  it('should display a loading message when isLoading is true', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 0, isLoading: true });
    renderComponent();
    expect(screen.getByText(/Estimating.../i)).toBeInTheDocument();
  });

  it('should display the estimated token count from useTokenEstimator when not loading', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 10, isLoading: false });
    renderComponent({ textInput: 'Test input' });
    expect(screen.getByText(/Est. tokens: 10/i)).toBeInTheDocument();
  });

  it('should display 0 when useTokenEstimator returns 0 and is not loading', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 0, isLoading: false });
    renderComponent({ textInput: '' });
    expect(screen.getByText(/Est. tokens: 0/i)).toBeInTheDocument();
  });

  it('should update the display when textInput prop changes and hook returns a new value', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 5, isLoading: false }); // Initial value
    const { rerender } = renderComponent({ textInput: 'Initial' });
    expect(screen.getByText(/Est. tokens: 5/i)).toBeInTheDocument();

    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 15, isLoading: false }); // New value for new input
    rerender(<CurrentMessageTokenEstimator textInput="Updated text input longer" />);
    expect(screen.getByText(/Est. tokens: 15/i)).toBeInTheDocument();
  });

  it('should call useTokenEstimator with the provided textInput prop', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 3, isLoading: false });
    const testInput = 'Specific test input';
    renderComponent({ textInput: testInput });
    expect(mockedUseTokenEstimator).toHaveBeenCalledWith(testInput);
  });

  // Optional: Test for a specific class or data-testid if needed for styling/selection
  it('should have a data-testid for easy selection', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 1, isLoading: false });
    renderComponent();
    expect(screen.getByTestId('current-message-token-estimator')).toBeInTheDocument();
  });
}); 