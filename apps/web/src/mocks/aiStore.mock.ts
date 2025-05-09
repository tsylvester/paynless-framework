import { vi } from 'vitest';
import type { AiState, AiActions, Chat, ChatMessage, AiProvider, SystemPrompt } from '@paynless/types';

// Define the shape of our mock AiStore's state and actions
type MockAiStoreType = AiState & AiActions;

// Spy for the deleteChat action, to be used by tests
export const mockDeleteChatSpy = vi.fn();

const initialAiState: MockAiStoreType = {
  availableProviders: [],
  availablePrompts: [],
  chatsByContext: { personal: undefined, orgs: {} },
  messagesByChatId: {},
  currentChatId: null,
  isLoadingAiResponse: false,
  isConfigLoading: false,
  isLoadingHistoryByContext: { personal: false, orgs: {} },
  historyErrorByContext: { personal: null, orgs: {} },
  isDetailsLoading: false,
  newChatContext: null,
  rewindTargetMessageId: null,
  aiError: null,
  // AiActions
  loadAiConfig: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(null),
  loadChatHistory: vi.fn().mockResolvedValue(undefined),
  loadChatDetails: vi.fn().mockResolvedValue(undefined),
  startNewChat: vi.fn(),
  clearAiError: vi.fn(),
  checkAndReplayPendingChatAction: vi.fn().mockResolvedValue(undefined),
  deleteChat: mockDeleteChatSpy.mockResolvedValue(undefined), // Use the exported spy
  prepareRewind: vi.fn(),
  cancelRewindPreparation: vi.fn(),
};

let internalMockAiState: MockAiStoreType = { ...initialAiState };

const internalMockAiGetState = (): MockAiStoreType => internalMockAiState;

export const mockedUseAiStoreHookLogic = <TResult>(
  selector?: (state: MockAiStoreType) => TResult
): TResult | MockAiStoreType => {
  const state = internalMockAiGetState();
  return selector ? selector(state) : state;
};

(mockedUseAiStoreHookLogic as any).getState = internalMockAiGetState;

// --- Helper Functions for Test Setup ---
export const mockSetAiState = (partialState: Partial<AiState>) => {
  internalMockAiState = { ...internalMockAiState, ...partialState };
};

// Specific setter for overriding the deleteChat mock if needed for a particular test,
// though using the spy is generally preferred for assertions.
export const mockOverrideDeleteChat = (mockFn: typeof mockDeleteChatSpy) => {
  internalMockAiState.deleteChat = mockFn;
};

// --- Reset Function ---
export const resetAiStoreMock = () => {
  mockDeleteChatSpy.mockClear().mockResolvedValue(undefined); // Reset the spy
  internalMockAiState = { ...initialAiState, deleteChat: mockDeleteChatSpy }; // Ensure spy is re-assigned
}; 