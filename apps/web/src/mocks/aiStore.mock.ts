import { vi, Mock } from 'vitest';
import { act } from '@testing-library/react';
import { initialAiStateValues } from '@paynless/types';
import type { AiStore, AiProvider, SystemPrompt, UserProfile } from '@paynless/types';

export type MockedUseAiStoreHook = (<TResult>(
    selector?: (state: AiStore) => TResult
) => TResult | AiStore) & {
    getState: () => AiStore;
    setState: (newState: Partial<AiStore>) => void;
};

let internalMockAiStoreState: AiStore;

const initializeMockAiState = (): AiStore => ({
    ...initialAiStateValues,
    setNewChatContext: vi.fn(),
    loadAiConfig: vi.fn(),
    sendMessage: vi.fn(),
    loadChatHistory: vi.fn(),
    loadChatDetails: vi.fn(),
    startNewChat: vi.fn(),
    clearAiError: vi.fn(),
    deleteChat: vi.fn(),
    prepareRewind: vi.fn(),
    cancelRewindPreparation: vi.fn(),
    setSelectedProvider: vi.fn(),
    setSelectedPrompt: vi.fn(),
    setContinueUntilComplete: vi.fn(),
    setChatContextHydrated: vi.fn(),
    hydrateChatContext: vi.fn(),
    resetChatContextToDefaults: vi.fn(),
    toggleMessageSelection: vi.fn(),
    selectAllMessages: vi.fn(),
    deselectAllMessages: vi.fn(),
    clearMessageSelections: vi.fn(),
    _addOptimisticUserMessage: vi.fn(),
    _updateChatContextInProfile: vi.fn(),
    _fetchAndStoreUserProfiles: vi.fn(),
    _dangerouslySetStateForTesting: vi.fn(),
    addOptimisticMessageForReplay: vi.fn(),
});

internalMockAiStoreState = initializeMockAiState();

export const internalMockAiStoreGetState = (): AiStore => internalMockAiStoreState;

export function mockedUseAiStoreHookLogic<S>(
    selector?: (state: AiStore) => S
): S | AiStore {
    if (selector) {
        return selector(internalMockAiStoreState);
    }
    return internalMockAiStoreState;
}

mockedUseAiStoreHookLogic.getState = internalMockAiStoreGetState;
mockedUseAiStoreHookLogic.setState = (newState: Partial<AiStore>) => {
    internalMockAiStoreState = {
        ...internalMockAiStoreState,
        ...newState,
    };
};

// --- Export mockSetState directly for easier use in tests ---
export const mockSetState = (updater: Partial<AiStore> | ((state: AiStore) => Partial<AiStore>)) => {
    let newStatePart: Partial<AiStore>;
    if (typeof updater === 'function') {
        newStatePart = updater(internalMockAiStoreState);
    } else {
        newStatePart = updater;
    }
    internalMockAiStoreState = { ...internalMockAiStoreState, ...newStatePart };
};
// --- End export ---

// --- New Exported Getters ---
export const getAiStoreState = (): AiStore => {
    return internalMockAiStoreState;
};

export const getToggleMessageSelectionSpy = (): Mock => {
    // Ensure the function is indeed a mock (it is, by initialization)
    return internalMockAiStoreState.toggleMessageSelection as Mock;
};
// --- End New Exported Getters ---

// Setter utilities for tests to modify parts of the mock state
export const mockSetAvailableProviders = (providers: AiProvider[]) => {
    act(() => {
        mockSetState({ availableProviders: providers });
    });
};

export const mockSetAvailablePrompts = (prompts: SystemPrompt[]) => {
    act(() => {
        mockSetState({ availablePrompts: prompts });
    });
};

export const mockSetChatParticipantProfiles = (profiles: { [userId: string]: UserProfile }) => {
    act(() => {
        mockSetState({ chatParticipantsProfiles: profiles });
    });
};

export const mockSetCurrentChatId = (chatId: string | null) => {
    act(() => {
        mockSetState({ currentChatId: chatId });
    });
};

export const mockSetMessagesByChatId = (messages: AiStore['messagesByChatId']) => {
    act(() => {
        mockSetState({ messagesByChatId: messages });
    });
};

export const mockSetChatsByContext = (chats: AiStore['chatsByContext']) => {
    act(() => {
        mockSetState({ chatsByContext: chats });
    });
};

export const mockSetAiError = (error: string | null) => {
    act(() => {
        mockSetState({ aiError: error });
    });
};

export const mockSetIsLoadingAiResponse = (isLoading: boolean) => {
    act(() => {
        mockSetState({ isLoadingAiResponse: isLoading });
    });
};

// Add setters for other relevant state properties if needed for tests
export const mockSetIsConfigLoading = (isLoading: boolean) => {
    act(() => {
        mockSetState({ isConfigLoading: isLoading });
    });
};

export const mockSetIsDetailsLoading = (isLoading: boolean) => {
    act(() => {
        mockSetState({ isDetailsLoading: isLoading });
    });
};

export const mockSetIsChatContextHydrated = (isHydrated: boolean) => {
    act(() => {
        mockSetState({ isChatContextHydrated: isHydrated });
    });
};

export const resetAiStoreMock = () => {
    // Reset to initial state values and re-mock actions
    internalMockAiStoreState = initializeMockAiState();
    // The vi.fn() calls above ensure mocks are fresh, no need to loop and clear.
};

// The actual mock hook that tests will use.
// It uses the mock implementation and returns slices of the mock state.
export const useAiStore: MockedUseAiStoreHook = mockedUseAiStoreHookLogic; 