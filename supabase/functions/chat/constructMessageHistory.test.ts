import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { constructMessageHistory } from "./constructMessageHistory.ts";
import { createMockSupabaseClient, MockSupabaseClientSetup } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts";
import { ChatApiRequest } from "../_shared/types.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";

Deno.test("constructMessageHistory: should start with system prompt if provided", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user");
    const systemPrompt = "You are a helpful assistant.";
    
    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        null, // existingChatId
        "New user message", // newUserMessageContent
        systemPrompt,
        null, // rewindFromMessageId
        [], // selectedMessages
        logger
    );

    // Assert
    assertEquals(history.length, 2);
    assertEquals(history[0], { role: 'system', content: systemPrompt });
    assertEquals(history[1], { role: 'user', content: "New user message" });
});

Deno.test("constructMessageHistory: should use selectedMessages as primary history source", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user");

    const selectedMessages: ChatApiRequest['selectedMessages'] = [
        { role: 'user', content: 'Previous user message' },
        { role: 'assistant', content: 'Previous assistant response' },
    ];
    
    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        "existing-chat-id", // An existing chat ID is provided...
        "New user message",
        "System prompt",
        null, // rewindFromMessageId
        selectedMessages, // ...but selectedMessages should take priority
        logger
    );

    // Assert
    assertEquals(history.length, 4); // System + 2 selected + new user message
    assertEquals(history[0].role, 'system');
    assertEquals(history[1], selectedMessages[0]);
    assertEquals(history[2], selectedMessages[1]);
    assertEquals(history[3].role, 'user');
    const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies('chat_messages')?.select;
    assertEquals(selectSpy, undefined, "SupabaseClient.select should not have been called when selectedMessages are present");
});

Deno.test("constructMessageHistory: should fetch from DB if no selectedMessages and an existingChatId is present", async () => {
    // Arrange
    const mockDbMessages = [
        { role: 'user', content: 'DB Message 1' },
        { role: 'assistant', content: 'DB Message 2' },
    ];
    const mockSupabase = createMockSupabaseClient("test-user", {
        genericMockResults: {
            chat_messages: {
                select: { data: mockDbMessages, error: null },
            },
        },
    });

    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        "existing-chat-id",
        "New user message",
        null, // no system prompt
        null, // no rewind
        [], // no selected messages
        logger
    );

    // Assert
    assertEquals(history.length, 3); // 2 from DB + new user message
    assertEquals(history[0], mockDbMessages[0]);
    assertEquals(history[1], mockDbMessages[1]);
    assertEquals(history[2].role, 'user');
});

Deno.test("constructMessageHistory: should handle DB error gracefully", async () => {
    // Arrange
    const dbError = new Error("Database connection failed");
    const mockSupabase = createMockSupabaseClient("test-user", {
        genericMockResults: {
            chat_messages: {
                select: { data: null, error: dbError },
            },
        },
    });

    // Act
    const { history, historyFetchError } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        "existing-chat-id",
        "New user message",
        "System prompt",
        null,
        [],
        logger
    );

    // Assert
    assertExists(historyFetchError);
    assertEquals(historyFetchError, dbError);
    assertEquals(history.length, 2, "History should still contain system and user messages on DB error");
    assertEquals(history[0].role, 'system');
    assertEquals(history[1].role, 'user');
});


Deno.test("constructMessageHistory: should create minimal history for a new chat", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user");

    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        null, // No existing chat
        "First user message",
        null, // No system prompt
        null, 
        [],
        logger
    );

    // Assert
    assertEquals(history.length, 1);
    assertEquals(history[0], { role: 'user', content: "First user message" });
    const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies('chat_messages')?.select;
    assertEquals(selectSpy, undefined, "DB should not be queried for a new chat");
});

Deno.test("constructMessageHistory: should not fetch DB history on rewind path", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user");

    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        "existing-chat-id", 
        "User message after rewind",
        "System prompt",
        "message-to-rewind-from", // Rewind is active
        [],
        logger
    );

    // Assert
    assertEquals(history.length, 2);
    assertEquals(history[0].role, 'system');
    assertEquals(history[1].role, 'user');
    const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies('chat_messages')?.select;
    assertEquals(selectSpy, undefined, "DB should not be queried on a rewind path");
});

Deno.test("constructMessageHistory: POST (New Chat) with selectedMessages and system prompt (DB) should use them", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user");
    const selectedHistory: ChatApiRequest['selectedMessages'] = [
        { role: 'user', content: 'Previous user message from selection' },
        { role: 'assistant', content: 'Previous assistant response from selection' },
    ];
    const systemPrompt = 'Test system prompt';
    const newUserMessage = "New user question based on selection";

    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        null,
        newUserMessage,
        systemPrompt,
        null,
        selectedHistory,
        logger
    );

    // Assert
    assertEquals(history.length, 4);
    assertEquals(history[0], { role: 'system', content: systemPrompt });
    assertEquals(history[1], { role: 'user', content: selectedHistory[0].content });
    assertEquals(history[2], { role: 'assistant', content: selectedHistory[1].content });
    assertEquals(history[3], { role: 'user', content: newUserMessage });
});

Deno.test("constructMessageHistory: POST (New Chat) with selectedMessages and NO system_prompt_id", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user");
    const selectedHistory: ChatApiRequest['selectedMessages'] = [
        { role: 'user', content: 'Only selected user message' },
        { role: 'assistant', content: 'Only selected assistant response' },
    ];
    const newUserMessage = "New question, no explicit system prompt";

    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        null,
        newUserMessage,
        null,
        null,
        selectedHistory,
        logger
    );

    // Assert
    assertEquals(history.length, 3);
    assertEquals(history[0], { role: 'user', content: selectedHistory[0].content });
    assertEquals(history[1], { role: 'assistant', content: selectedHistory[1].content });
    assertEquals(history[2], { role: 'user', content: newUserMessage });
});

Deno.test("constructMessageHistory: POST (Existing Chat) with selectedMessages should IGNORE DB history", async () => {
    // Arrange
    const mockSupabase = createMockSupabaseClient("test-user", {
        genericMockResults: {
            chat_messages: {
                select: { data: [{ role: 'user', content: 'VERY OLD DB MESSAGE' }], error: null },
            },
        },
    });
    const selectedHistory: ChatApiRequest['selectedMessages'] = [
        { role: 'user', content: 'Selected user message for existing chat' },
        { role: 'assistant', content: 'Selected assistant response for existing chat' },
    ];
    const systemPrompt = 'Test system prompt';
    const newUserMessage = "New question for existing chat, using selection";

    // Act
    const { history } = await constructMessageHistory(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        "existing-chat-id",
        newUserMessage,
        systemPrompt,
        null,
        selectedHistory,
        logger
    );

    // Assert
    assertEquals(history.length, 4);
    assertEquals(history[0], { role: 'system', content: systemPrompt });
    assertEquals(history[1], { role: 'user', content: selectedHistory[0].content });
    assertEquals(history[2], { role: 'assistant', content: selectedHistory[1].content });
    assertEquals(history[3], { role: 'user', content: newUserMessage });
    const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies('chat_messages')?.select;
    assertEquals(selectSpy, undefined);
});

