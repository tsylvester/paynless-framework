import { create } from 'zustand';
import { vi } from 'vitest';
import type { aiStore } from '@paynless/store'; // Assuming AiState is the type name

// Define a baseline state for AI, similar to the one in Home.test.tsx
const baselineAiState: Partial<aiStore> = {
  availableProviders: [],
  currentChatMessages: [],
  currentChatId: null,
  isLoadingAiResponse: false,
  aiError: null,
};

export const createMockAiStore = (initialState?: Partial<aiStore>) => {
  // Merge baseline with provided initial state
  const mergedInitialState = { ...baselineAiState, ...initialState };

  return create<aiStore>((set) => ({
    // State properties
    availableProviders: mergedInitialState.availableProviders,
    currentChatMessages: mergedInitialState.currentChatMessages,
    currentChatId: mergedInitialState.currentChatId,
    isLoadingAiResponse: mergedInitialState.isLoadingAiResponse,
    aiError: mergedInitialState.aiError,
    
    // Actions - mocked
    loadAiConfig: vi.fn(),
    sendMessage: vi.fn(),
    startNewChat: vi.fn(),
    clearAiError: vi.fn(),
    selectChat: vi.fn(), // Add other actions if they exist in the real store
    deleteChat: vi.fn(), 
    loadHistoryList: vi.fn(),
  }));
}; 