import { vi } from 'vitest';
import type { AiState, IAiStateService } from '@paynless/types';

// Define argument types for clarity if complex
type SetAiStateArgs = [stateOrFn: AiState | Partial<AiState> | ((state: AiState) => AiState | Partial<AiState>)];
type AddOptimisticUserMessageArgs = [messageContent: string, explicitChatId?: string | null | undefined];
type AddOptimisticUserMessageReturn = { tempId: string; chatIdUsed: string; createdTimestamp: string };

// Create the actual mock function instances
const getAiStateMock = vi.fn<[], AiState>();
const setAiStateMock = vi.fn<SetAiStateArgs, void>();
const addOptimisticUserMessageMock = vi.fn<AddOptimisticUserMessageArgs, AddOptimisticUserMessageReturn>();

export const mockAiStateService: IAiStateService = {
  getAiState: (...args: []) => getAiStateMock(...args),
  setAiState: (...args: SetAiStateArgs) => setAiStateMock(...args),
  addOptimisticUserMessage: (...args: AddOptimisticUserMessageArgs) => addOptimisticUserMessageMock(...args),
  // Add other methods if they become necessary for handleSendMessage tests
};

export const resetMockAiStateService = () => {
  getAiStateMock.mockReset();
  setAiStateMock.mockReset();
  addOptimisticUserMessageMock.mockReset();
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
