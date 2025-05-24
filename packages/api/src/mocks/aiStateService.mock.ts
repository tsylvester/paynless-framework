import { vi, type Mock } from 'vitest';
import type { AiState, IAiStateService, ChatMessage } from '@paynless/types';

export const mockAiStateService: IAiStateService = {
  getAiState: vi.fn() as Mock<[], AiState>,
  setAiState: vi.fn() as Mock<[(prevState: AiState) => AiState] | Partial<AiState>, void>,
  addOptimisticUserMessage: vi.fn() as Mock<[string, string | null | undefined], { tempId: string; chatIdUsed: string }>,
  // Add other methods if they become necessary for handleSendMessage tests
};

export const resetMockAiStateService = () => {
  mockAiStateService.getAiState.mockReset();
  mockAiStateService.setAiState.mockReset();
  mockAiStateService.addOptimisticUserMessage.mockReset();
};

// Helper to provide a default AiState structure
export const getDefaultMockAiState = (): AiState => ({
  availableProviders: [],
  availablePrompts: [],
  messagesByChatId: {},
  chatsByContext: { personal: [], orgs: {} },
  currentChatId: null,
  isLoadingAiResponse: false,
  isConfigLoading: false,
  isLoadingHistoryByContext: { personal: false, orgs: {} },
  isDetailsLoading: false,
  newChatContext: null,
  rewindTargetMessageId: null,
  aiError: null,
  historyErrorByContext: { personal: null, orgs: {} },
  selectedProviderId: null,
  selectedPromptId: null,
  selectedMessagesMap: {},
  chatParticipantsProfiles: {},
  pendingAction: null,
});
