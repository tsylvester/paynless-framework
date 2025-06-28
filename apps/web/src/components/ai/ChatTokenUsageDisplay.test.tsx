import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatTokenUsageDisplay } from './ChatTokenUsageDisplay';
import { useAiStore, useAnalyticsStore, AnalyticsStoreState } from '@paynless/store'; 
import { AiStore, ChatSessionTokenUsageDetails } from '@paynless/types';
import { vi, MockInstance } from 'vitest';

// Define a type for the selector function used by useAiStore
type AiStoreSelector<T> = (state: AiStore) => T;
type AnalyticsStoreSelector<T> = (state: AnalyticsStoreState) => T; // Use AnalyticsStoreState

// Mock the @paynless/store module
vi.mock('@paynless/store', async (importOriginal) => {
  const originalModule = await importOriginal() as Record<string, unknown>;
  return {
    ...originalModule,
    useAiStore: vi.fn(), 
    useAnalyticsStore: vi.fn(), // Simplified mock, detailed implementation in beforeEach
  };
});

// After vi.mock, useAiStore and useAnalyticsStore from this module are the mock functions
const mockedUseAiStore = useAiStore as unknown as MockInstance<any, any>;
const mockedUseAnalyticsStore = useAnalyticsStore as unknown as MockInstance<any, any>;

describe('ChatTokenUsageDisplay', () => {
  const mockSelectCurrentChatSessionTokenUsage = vi.fn<[], ChatSessionTokenUsageDetails>();
  const mockGetAiState = vi.fn(); 
  const mockAnalyticsTrack = vi.fn(); // Renamed for clarity

  beforeEach(() => {
    vi.clearAllMocks(); 
    mockAnalyticsTrack.mockClear(); // Clear previous calls for the track mock

    mockedUseAnalyticsStore.mockImplementation(
      (selector?: AnalyticsStoreSelector<unknown>) => {
        const mockAnalyticsState: Partial<AnalyticsStoreState> = { 
          track: mockAnalyticsTrack, // Provide the track mock
        };
        if (typeof selector === 'function') {
          return selector(mockAnalyticsState as AnalyticsStoreState); 
        }
        return { 
            ...mockAnalyticsState,
        };
      }
    );

    // Reset AiStore mock to a default state for each test
    // Individual tests can override mockGetAiState if they need specific currentChatId for analytics event
    mockGetAiState.mockReturnValue({
      currentChatId: 'default-test-chat-id', 
    });

    mockedUseAiStore.mockImplementation(
      (selector?: AiStoreSelector<unknown>) => {
        
        // This is the object that represents the "state" argument in useAiStore(state => ...)
        // It needs to have all properties that any selector passed to useAiStore might access.
        const stateArgumentForSelectorCallback: Partial<AiStore> = { 
          selectCurrentChatSessionTokenUsage: mockSelectCurrentChatSessionTokenUsage,
          // Make currentChatId available on this state object if a selector ever needs it directly
          // e.g., useAiStore(state => state.currentChatId)
          currentChatId: mockGetAiState().currentChatId, // Pass through from mockGetAiState
          // Any other AiState properties should be added if selectors need them.
        };

        if (typeof selector === 'function') {
          // When useAiStore is used with a selector, call the selector with our crafted state.
          return selector(stateArgumentForSelectorCallback as AiStore);
        }
        
        // When useAiStore is called as useAiStore() to get the instance for store.getState().
        return {
          getState: mockGetAiState, 
        };
      }
    );
    
    mockSelectCurrentChatSessionTokenUsage.mockReset(); 
  });

  it('should display "Loading..." or nothing if token usage data is not yet available (e.g. selector returns undefined/initial state)', () => {
    mockSelectCurrentChatSessionTokenUsage.mockReturnValueOnce({ 
        userTokens: 0, assistantPromptTokens: 0, assistantCompletionTokens: 0, assistantTotalTokens: 0, overallTotalTokens: 0 
    });
    // Explicitly set chat ID for this test if analytics were to be called, though it won't be for 0 tokens
    mockGetAiState.mockReturnValue({ currentChatId: 'loading-chat-id' }); 
    render(<ChatTokenUsageDisplay />);
    expect(screen.queryByText(/Session Usage/i)).toBeInTheDocument();
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('should correctly render user, assistant, and total token counts and call trackEvent', () => {
    const mockUsage = {
      userTokens: 50,
      assistantPromptTokens: 100,
      assistantCompletionTokens: 150,
      assistantTotalTokens: 250,
      overallTotalTokens: 300,
    };
    mockSelectCurrentChatSessionTokenUsage.mockReturnValueOnce(mockUsage);
    // Set currentChatId specifically for this test's analytics assertion
    mockGetAiState.mockReturnValue({ currentChatId: 'chat123' }); 

    render(<ChatTokenUsageDisplay />);

    expect(screen.queryByText(/User: 50/i)).not.toBeInTheDocument();
    expect(screen.getByText("AI Prompt:")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("AI Completion:")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("AI Total:")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("Session Total:")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('token_usage_displayed', {
        assistantPromptTokens: 100,
        assistantCompletionTokens: 150,
        assistantTotalTokens: 250,
        overallTotalTokens: 300,
        chatId: 'chat123', 
      });
  });

  it('should display 0 for all counts if token usage is all zeros and not call trackEvent', () => {
    const zeroUsage = { userTokens: 0, assistantPromptTokens: 0, assistantCompletionTokens: 0, assistantTotalTokens: 0, overallTotalTokens: 0 };
    mockSelectCurrentChatSessionTokenUsage.mockReturnValueOnce(zeroUsage);
    // Explicitly set chat ID for this test if analytics were to be called
    mockGetAiState.mockReturnValue({ currentChatId: 'zero-usage-chat-id' }); 
    render(<ChatTokenUsageDisplay />);

    expect(screen.queryByText(/User: 0/i)).not.toBeInTheDocument();
    expect(screen.getByText("AI Prompt:")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(3); // AI Prompt, AI Completion, AI Total can be 0
    expect(screen.getByText("AI Completion:")).toBeInTheDocument();
    expect(screen.getByText("AI Total:")).toBeInTheDocument();
    expect(screen.getByText("Session Total:")).toBeInTheDocument();
    // Check the session total "0" specifically.
    const sessionTotalLabel = screen.getByText("Session Total:");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sessionTotalValue = sessionTotalLabel.parentElement!.querySelector('.font-mono');
    expect(sessionTotalValue).toHaveTextContent("0");
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('should handle partial data gracefully and call trackEvent if overall > 0', () => {
    const partialUsage = { userTokens: 75, assistantPromptTokens: 0, assistantCompletionTokens: 0, assistantTotalTokens: 0, overallTotalTokens: 75 };
    mockSelectCurrentChatSessionTokenUsage.mockReturnValueOnce(partialUsage);
    // Set currentChatId specifically for this test's analytics assertion
    mockGetAiState.mockReturnValue({ currentChatId: 'chat456' });

    render(<ChatTokenUsageDisplay />);

    expect(screen.queryByText(/User: 75/i)).not.toBeInTheDocument();
    expect(screen.getByText("AI Prompt:")).toBeInTheDocument();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(screen.getByText("AI Prompt:").parentElement!.querySelector("span.font-mono")).toHaveTextContent("0");

    expect(screen.getByText("AI Completion:")).toBeInTheDocument();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(screen.getByText("AI Completion:").parentElement!.querySelector("span.font-mono")).toHaveTextContent("0");
    
    expect(screen.getByText("AI Total:")).toBeInTheDocument();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(screen.getByText("AI Total:").parentElement!.querySelector("span.font-mono")).toHaveTextContent("0");

    expect(screen.getByText("Session Total:")).toBeInTheDocument();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(screen.getByText("Session Total:").parentElement!.querySelector("span.font-mono")).toHaveTextContent("75");

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('token_usage_displayed', {
        assistantPromptTokens: 0,
        assistantCompletionTokens: 0,
        assistantTotalTokens: 0,
        overallTotalTokens: 75,
        chatId: 'chat456',
      });
  });
}); 