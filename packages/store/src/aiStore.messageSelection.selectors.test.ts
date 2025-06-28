import { describe, it, expect, beforeEach } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
import { selectSelectedChatMessages } from './aiStore.selectors';
import type { ChatMessage, AiState } from '@paynless/types';
import { act } from '@testing-library/react';

// Helper to reset AiStore to initial state with optional overrides
const resetAiStore = (initialOverrides: Partial<AiState> = {}) => {
    act(() => {
        useAiStore.setState(
            {
                ...initialAiStateValues,
                selectedMessagesMap: {}, // Ensure this is explicitly reset for selector tests
                messagesByChatId: {},   // Ensure this is explicitly reset
                ...initialOverrides,
            },
            // false, or simply omit, to merge rather than replace
        );
    });
};

const mockMessage = (
    chatId: string,
    id: string,
    content = 'Test message',
    role: 'user' | 'assistant' = 'user',
    isActiveInThread = true,
    isSelected?: boolean // Used for setting up selectedMessagesMap, not part of ChatMessage type
): ChatMessage => ({
    id,
    chat_id: chatId,
    content,
    role,
    timestamp: new Date().toISOString(),
    user_id: role === 'user' ? 'test-user' : undefined,
    is_active_in_thread: isActiveInThread,
    // isSelected is not part of the actual ChatMessage type
    // it's used here to help set up the selectedMessagesMap for tests
});


describe('selectSelectedChatMessages selector', () => {
    const chatId1 = 'chat-1';
    const msg1 = mockMessage(chatId1, 'msg-1', 'Hello');
    const msg2 = mockMessage(chatId1, 'msg-2', 'How are you?');
    const msg3Inactive = mockMessage(chatId1, 'msg-3', 'I am inactive', 'user', false);
    const msg4 = mockMessage(chatId1, 'msg-4', 'I am fine');

    beforeEach(() => {
        resetAiStore();
    });

    it('should return an empty array if currentChatId is null', () => {
        resetAiStore({ currentChatId: null, messagesByChatId: { [chatId1]: [msg1] } });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([]);
    });

    it('should return an empty array if messages for currentChatId are empty or undefined', () => {
        resetAiStore({ currentChatId: chatId1, messagesByChatId: {} });
        let selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([]);

        resetAiStore({ currentChatId: chatId1, messagesByChatId: { [chatId1]: [] } });
        selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([]);
    });

    it('should return all active messages if selectedMessagesMap is empty for the current chat (default to selected)', () => {
        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msg1, msg2, msg3Inactive] },
            selectedMessagesMap: {},
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([msg1, msg2]); // msg3Inactive should be filtered out
    });

    it('should return all active messages if selectedMessagesMap has no entry for currentChatId (default to selected)', () => {
        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msg1, msg2, msg3Inactive] },
            selectedMessagesMap: { 'other-chat': { 'some-msg': true } }, // map exists, but not for chatId1
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([msg1, msg2]);
    });
    
    it('should default to selected for active messages not present in selectedMessagesMap[currentChatId]', () => {
        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msg1, msg2, msg4] }, // msg1, msg2, msg4 are active
            selectedMessagesMap: {
                [chatId1]: {
                    [msg1.id]: false, // msg1 explicitly deselected
                    // msg2 is missing, should default to true
                    // msg4 is missing, should default to true
                },
            },
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        // msg2 and msg4 should be selected by default
        expect(selected).toEqual(expect.arrayContaining([msg2, msg4]));
        expect(selected).not.toContain(msg1);
        expect(selected.length).toBe(2);
    });

    it('should return only messages explicitly marked true in selectedMessagesMap, respecting defaults for others', () => {
        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msg1, msg2, msg4, msg3Inactive] },
            selectedMessagesMap: {
                [chatId1]: {
                    [msg1.id]: true,
                    [msg2.id]: false,
                    // msg4 is not in map, defaults to true
                    [msg3Inactive.id]: true, // inactive, should not be selected
                },
            },
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual(expect.arrayContaining([msg1, msg4]));
        expect(selected).not.toContain(msg2);
        expect(selected).not.toContain(msg3Inactive);
        expect(selected.length).toBe(2);
    });
    
    it('should correctly filter out messages explicitly marked false in selectedMessagesMap', () => {
        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msg1, msg2, msg4] }, // All active
            selectedMessagesMap: {
                [chatId1]: {
                    [msg1.id]: true,
                    [msg2.id]: false, // msg2 is false
                    [msg4.id]: true,
                },
            },
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([msg1, msg4]);
        expect(selected).not.toContain(msg2);
    });

    it('should only return active messages (is_active_in_thread: true or undefined)', () => {
        const msgActiveUndefined = { ...msg1, is_active_in_thread: undefined }; // should be treated as active
        const msgInactiveExplicit = { ...msg2, is_active_in_thread: false };
        const msgActiveExplicit = { ...msg4, is_active_in_thread: true };

        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msgActiveUndefined, msgInactiveExplicit, msgActiveExplicit] },
            selectedMessagesMap: { // All notionally "selected" to isolate is_active_in_thread behavior
                [chatId1]: {
                    [msgActiveUndefined.id]: true,
                    [msgInactiveExplicit.id]: true,
                    [msgActiveExplicit.id]: true,
                },
            },
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual(expect.arrayContaining([msgActiveUndefined, msgActiveExplicit]));
        expect(selected).not.toContain(msgInactiveExplicit);
        expect(selected.length).toBe(2);
    });

    it('should not select an inactive message even if explicitly marked true in selectedMessagesMap', () => {
        resetAiStore({
            currentChatId: chatId1,
            messagesByChatId: { [chatId1]: [msg1, msg3Inactive, msg4] }, // msg1, msg4 active; msg3Inactive is not
            selectedMessagesMap: {
                [chatId1]: {
                    [msg1.id]: true,
                    [msg3Inactive.id]: true, // Explicitly selected but inactive
                    [msg4.id]: true,
                },
            },
        });
        const selected = selectSelectedChatMessages(useAiStore.getState());
        expect(selected).toEqual([msg1, msg4]);
        expect(selected).not.toContain(msg3Inactive);
    });
}); 