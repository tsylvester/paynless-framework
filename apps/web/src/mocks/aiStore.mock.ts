import { vi } from 'vitest';
import type { AiState, AiActions, Chat, ChatMessage, AiProvider, SystemPrompt } from '@paynless/types';

// Define the shape of our mock AiStore's state and actions
type MockAiStoreType = AiState & AiActions;

// Spies for actions, to be used by tests
export const mockDeleteChatSpy = vi.fn();
export const mockLoadChatDetailsSpy = vi.fn(); // Added spy for loadChatDetails

// --- Mock data for availablePrompts ---
let currentMockAvailablePrompts: SystemPrompt[] = [];

export const mockSetAvailablePrompts = (prompts: SystemPrompt[]) => {
  currentMockAvailablePrompts = prompts;
  // Also update the internal mock state if it holds a copy
  internalMockAiState = { ...internalMockAiState, availablePrompts: currentMockAvailablePrompts };
};

export const mockAvailablePrompts = (): SystemPrompt[] => currentMockAvailablePrompts;
// --- End mock data for availablePrompts ---

const initialAiState: MockAiStoreType = {
  availableProviders: [],
  availablePrompts: [], // This will be dynamically updated by mockSetAvailablePrompts via internalMockAiState
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
  loadChatDetails: mockLoadChatDetailsSpy.mockResolvedValue(undefined), // Use the exported spy
  startNewChat: vi.fn(),
  clearAiError: vi.fn(),
  checkAndReplayPendingChatAction: vi.fn().mockResolvedValue(undefined),
  deleteChat: mockDeleteChatSpy.mockResolvedValue(undefined), // Use the exported spy
  prepareRewind: vi.fn(),
  cancelRewindPreparation: vi.fn(),
};

let internalMockAiState: MockAiStoreType = { ...initialAiState, availablePrompts: mockAvailablePrompts() };

// Export this function so it can be used by other mock factories
export const internalMockAiGetState = (): MockAiStoreType => internalMockAiState;

export const mockedUseAiStoreHookLogic = <TResult>(
  selector?: (state: MockAiStoreType) => TResult
): TResult | MockAiStoreType => {
  // Update internalMockAiState to reflect the latest from mockAvailablePrompts if selector needs it
  // This ensures that if a selector directly accesses availablePrompts, it gets the latest version.
  // However, the primary way ChatItem.test.tsx will get it is via the vi.mock factory modification.
  internalMockAiState.availablePrompts = mockAvailablePrompts(); 
  const state = internalMockAiGetState();
  return selector ? selector(state) : state;
};

(mockedUseAiStoreHookLogic as any).getState = internalMockAiGetState;

// --- Helper Functions for Test Setup ---
export const mockSetAiState = (partialState: Partial<AiState>) => {
  internalMockAiState = { ...internalMockAiState, ...partialState };
  // If availablePrompts is part of partialState, ensure currentMockAvailablePrompts is also updated.
  if (partialState.availablePrompts) {
    currentMockAvailablePrompts = partialState.availablePrompts;
  }
};

export const mockOverrideDeleteChat = (mockFn: typeof mockDeleteChatSpy) => {
  internalMockAiState.deleteChat = mockFn;
};

// --- Reset Function ---
export const resetAiStoreMock = () => {
  mockDeleteChatSpy.mockClear().mockResolvedValue(undefined);
  mockLoadChatDetailsSpy.mockClear().mockResolvedValue(undefined); // Reset the new spy
  mockSetAvailablePrompts([]); // Reset available prompts to empty array
  
  // Re-initialize internalMockAiState, ensuring spies and dynamic getters are correctly assigned
  internalMockAiState = {
    ...initialAiState,
    availablePrompts: mockAvailablePrompts(), // Use getter
    deleteChat: mockDeleteChatSpy,
    loadChatDetails: mockLoadChatDetailsSpy,
  };
}; 