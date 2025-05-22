import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, MockInstance } from 'vitest';
import { ChatAffordabilityIndicator } from './ChatAffordabilityIndicator';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useChatWalletDecision } from '@/hooks/useChatWalletDecision';

// Mock the hooks
vi.mock('@/hooks/useTokenEstimator');
vi.mock('@/hooks/useAIChatAffordabilityStatus');
vi.mock('@/hooks/useChatWalletDecision');

const mockedUseTokenEstimator = useTokenEstimator as unknown as MockInstance<[string], number>;
const mockedUseAIChatAffordabilityStatus = useAIChatAffordabilityStatus as unknown as MockInstance<
  [number],
  { canAffordNext: boolean; lowBalanceWarning: boolean; currentBalance: string; estimatedNextCost: number }
>;
const mockedUseChatWalletDecision = useChatWalletDecision as unknown as MockInstance<[], { 
  effectiveOutcome: { outcome: string; message?: string }; 
  giveConsent: () => void; 
  refuseConsent: () => void; 
  isLoadingConsent: boolean; 
  resetConsent: () => void; 
}>;

describe('ChatAffordabilityIndicator', () => {
  let mockOnAffordabilityChange: (canAfford: boolean, reason?: string) => void;

  beforeEach(() => {
    mockOnAffordabilityChange = vi.fn();
    mockedUseTokenEstimator.mockReset();
    mockedUseAIChatAffordabilityStatus.mockReset();
    mockedUseChatWalletDecision.mockReset();

    // Default mock for useChatWalletDecision to simplify tests
    mockedUseChatWalletDecision.mockReturnValue({
      effectiveOutcome: { outcome: 'use_personal_wallet' },
      giveConsent: vi.fn(),
      refuseConsent: vi.fn(),
      isLoadingConsent: false,
      resetConsent: vi.fn(),
    });
  });

  it('Scenario 1: Sufficient Balance, No Warning', () => {
    mockedUseTokenEstimator.mockReturnValue(100);
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true,
      lowBalanceWarning: false,
      currentBalance: '500',
      estimatedNextCost: 100,
    });

    render(
      <ChatAffordabilityIndicator
        textInput="test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(screen.queryByText(/Token balance is low/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Insufficient balance for this message/i)).not.toBeInTheDocument();
    expect(mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).toHaveBeenCalledWith(true, "");
  });

  it('Scenario 2: Sufficient Balance, Low Balance Warning', () => {
    mockedUseTokenEstimator.mockReturnValue(100);
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true,
      lowBalanceWarning: true,
      currentBalance: '120',
      estimatedNextCost: 100,
    });

    render(
      <ChatAffordabilityIndicator
        textInput="test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(screen.getByText(/Token balance is low/i)).toBeInTheDocument();
    expect(screen.queryByText(/Insufficient balance for this message/i)).not.toBeInTheDocument();
    expect(mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).toHaveBeenCalledWith(true, "");
  });

  it('Scenario 3: Insufficient Balance', () => {
    mockedUseTokenEstimator.mockReturnValue(100);
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: false,
      lowBalanceWarning: true,
      currentBalance: '50',
      estimatedNextCost: 100,
    });

    render(
      <ChatAffordabilityIndicator
        textInput="test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(screen.queryByText(/Token balance is low/i)).not.toBeInTheDocument(); // Insufficient implies low, but specific msg takes precedence
    expect(screen.getByText(/Insufficient balance for this message/i)).toBeInTheDocument();
    expect(mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).toHaveBeenCalledWith(false, "");
  });

  it('Scenario 4: Input Text Changes, leading to different affordability', () => {
    // Initial render: affordable
    mockedUseTokenEstimator.mockReturnValueOnce(10);
    mockedUseAIChatAffordabilityStatus.mockReturnValueOnce({
      canAffordNext: true,
      lowBalanceWarning: false,
      currentBalance: '500',
      estimatedNextCost: 10,
    });

    const { rerender } = render(
      <ChatAffordabilityIndicator
        textInput="hello"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).toHaveBeenCalledWith(true, "");
    expect(screen.queryByText(/Insufficient balance/i)).not.toBeInTheDocument();
    (mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).mockClear(); // Clear for next assertion

    // Rerender with new text: unaffordable
    mockedUseTokenEstimator.mockReturnValueOnce(200);
    mockedUseAIChatAffordabilityStatus.mockReturnValueOnce({
      canAffordNext: false,
      lowBalanceWarning: true,
      currentBalance: '150',
      estimatedNextCost: 200,
    });

    rerender(
      <ChatAffordabilityIndicator
        textInput="hello world this is a long message"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    
    expect(mockedUseTokenEstimator).toHaveBeenCalledWith("hello world this is a long message");
    expect(mockedUseAIChatAffordabilityStatus).toHaveBeenCalledWith(200);
    expect(screen.getByText(/Insufficient balance for this message/i)).toBeInTheDocument();
    expect(mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).toHaveBeenCalledWith(false, "");
  });

  it('Scenario 5: Zero Estimated Tokens', () => {
    mockedUseTokenEstimator.mockReturnValue(0);
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true,
      lowBalanceWarning: false,
      currentBalance: '100',
      estimatedNextCost: 0,
    });

    render(
      <ChatAffordabilityIndicator
        textInput=""
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(screen.queryByText(/Token balance is low/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Insufficient balance for this message/i)).not.toBeInTheDocument();
    expect(mockOnAffordabilityChange as unknown as MockInstance<[boolean, (string | undefined)?], void>).toHaveBeenCalledWith(true, "");
  });
}); 