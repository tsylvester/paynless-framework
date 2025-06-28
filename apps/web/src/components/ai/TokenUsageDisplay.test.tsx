import { render, screen } from '@testing-library/react';
import { TokenUsageDisplay, TokenUsageDisplayProps } from './TokenUsageDisplay';
import type { TokenUsage } from '@paynless/types';

describe('TokenUsageDisplay', () => {
  const renderComponent = (props: TokenUsageDisplayProps) => {
    return render(<TokenUsageDisplay {...props} />);
  };

  it('should render token usage like "P:{promptTokens} / C:{completionTokens}" with valid data', () => {
    const mockTokenUsage: TokenUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
    renderComponent({ tokenUsage: mockTokenUsage });
    expect(screen.getByTestId('token-usage-display')).toBeInTheDocument();
    expect(screen.getByText('P:10 / C:20')).toBeInTheDocument();
  });

  it('should render correctly when prompt tokens are 0', () => {
    const mockTokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 25, totalTokens: 25 };
    renderComponent({ tokenUsage: mockTokenUsage });
    expect(screen.getByText('P:0 / C:25')).toBeInTheDocument();
  });

  it('should render correctly when completion tokens are 0', () => {
    const mockTokenUsage: TokenUsage = { promptTokens: 15, completionTokens: 0, totalTokens: 15 };
    renderComponent({ tokenUsage: mockTokenUsage });
    expect(screen.getByText('P:15 / C:0')).toBeInTheDocument();
  });

  it('should render nothing if tokenUsage prop is null', () => {
    const { container } = renderComponent({ tokenUsage: null });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('token-usage-display')).not.toBeInTheDocument();
  });

  it('should render nothing if tokenUsage.promptTokens is undefined', () => {
    const mockTokenUsage: Partial<TokenUsage> = { completionTokens: 20, totalTokens: 20 };
    const { container } = renderComponent({ tokenUsage: mockTokenUsage as TokenUsage });
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing if tokenUsage.completionTokens is undefined', () => {
    const mockTokenUsage: Partial<TokenUsage> = { promptTokens: 10, totalTokens: 10 };
    const { container } = renderComponent({ tokenUsage: mockTokenUsage as TokenUsage });
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing if tokenUsage is an empty object', () => {
    const mockTokenUsage = {}; // This is a valid JS object, component should handle it gracefully.
    const { container } = renderComponent({ tokenUsage: mockTokenUsage as TokenUsage });
    expect(container.firstChild).toBeNull();
  });

  // Consider if we need to test for non-numeric values if type safety isn't enough.
  // For now, assuming TokenUsage type enforces numbers for prompt & completion.
}); 