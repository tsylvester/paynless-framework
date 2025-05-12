import { vi } from 'vitest';
import { act } from '@testing-library/react';
import { initialAiStateValues, useAiStore as originalUseAiStore } from '@paynless/store';
import type { AiStore, AiProvider, SystemPrompt, UserProfile } from '@paynless/types';

// Hold the current mock state for aiStore
// Initialize with spread of initialAiStateValues and then override actions with vi.fn()
let currentAiMockState: AiStore = {
    ...initialAiStateValues,
    setNewChatContext: vi.fn(),
    loadAiConfig: vi.fn(),
    sendMessage: vi.fn(),
    loadChatHistory: vi.fn(),
    loadChatDetails: vi.fn(),
    startNewChat: vi.fn(),
    clearAiError: vi.fn(),
    checkAndReplayPendingChatAction: vi.fn(),
    deleteChat: vi.fn(),
    prepareRewind: vi.fn(),
    cancelRewindPreparation: vi.fn(),
    setSelectedProvider: vi.fn(),
    setSelectedPrompt: vi.fn(),
    setChatContextHydrated: vi.fn(),
    hydrateChatContext: vi.fn(),
    resetChatContextToDefaults: vi.fn(),
};

const mockSetState = vi.fn((updater) => {
    let newStatePart: Partial<AiStore>;
    if (typeof updater === 'function') {
        newStatePart = updater(currentAiMockState);
    } else {
        newStatePart = updater;
    }
    currentAiMockState = { ...currentAiMockState, ...newStatePart };
}) as unknown as (typeof originalUseAiStore.setState);

const mockGetState = vi.fn(() => currentAiMockState) as unknown as (typeof originalUseAiStore.getState);

// Define the hook implementation
function useAiStoreHookImpl<S>(selector: (state: AiStore) => S): S;
function useAiStoreHookImpl(): AiStore;
function useAiStoreHookImpl<S>(selector?: (state: AiStore) => S) {
    if (selector) {
        try {
            return selector(currentAiMockState);
        } catch (e) {
            // console.error("Error in selector during mock execution:", e); // Optional: uncomment for debugging selectors
            // Fallback to returning undefined or rethrow, depending on desired strictness.
            // For stability in tests that might not perfectly mock all selector paths:
            return undefined as S; 
        }
    }
    return currentAiMockState;
}

// Attach static methods to the implementation
useAiStoreHookImpl.setState = mockSetState;
useAiStoreHookImpl.getState = mockGetState;
useAiStoreHookImpl.subscribe = vi.fn(() => vi.fn()) as typeof originalUseAiStore.subscribe;
useAiStoreHookImpl.destroy = vi.fn() as typeof originalUseAiStore.destroy;

export const mockedUseAiStoreHookLogic = useAiStoreHookImpl as typeof originalUseAiStore;

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
    currentAiMockState = {
        ...initialAiStateValues,
        setNewChatContext: vi.fn(),
        loadAiConfig: vi.fn(),
        sendMessage: vi.fn(),
        loadChatHistory: vi.fn(),
        loadChatDetails: vi.fn(),
        startNewChat: vi.fn(),
        clearAiError: vi.fn(),
        checkAndReplayPendingChatAction: vi.fn(),
        deleteChat: vi.fn(),
        prepareRewind: vi.fn(),
        cancelRewindPreparation: vi.fn(),
        setSelectedProvider: vi.fn(),
        setSelectedPrompt: vi.fn(),
        setChatContextHydrated: vi.fn(),
        hydrateChatContext: vi.fn(),
        resetChatContextToDefaults: vi.fn(),
    };
    // The vi.fn() calls above ensure mocks are fresh, no need to loop and clear.
}; 