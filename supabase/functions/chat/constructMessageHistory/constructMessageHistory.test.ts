import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@0.225.3";
import { constructMessageHistory } from "./constructMessageHistory.ts";
import { buildConstructMessageHistoryTestContext } from "./constructMessageHistory.mock.ts";
import {
  ConstructMessageHistoryParams,
  ConstructMessageHistoryPayload,
} from "./constructMessageHistory.interface.ts";

Deno.test(
  "constructMessageHistory: selectedMessages provided prepends system, selected rows, then user message",
  async () => {
    const { deps } = buildConstructMessageHistoryTestContext(
      "construct-message-history-unit-1",
    );
    const systemPrompt: string = "You are a helpful assistant.";
    const params: ConstructMessageHistoryParams = {
      existingChatId: null,
      system_prompt_text: systemPrompt,
      rewindFromMessageId: null,
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "New user message",
      selectedMessages: [
        { role: "user", content: "Previous user message" },
        { role: "assistant", content: "Previous assistant response" },
      ],
    };

    const result = await constructMessageHistory(deps, params, payload);

    assertEquals("historyFetchError" in result, false);
    assertEquals(result.history.length, 4);
    assertEquals(result.history[0], {
      role: "system",
      content: systemPrompt,
    });
    assertEquals(result.history[1], payload.selectedMessages?.[0]);
    assertEquals(result.history[2], payload.selectedMessages?.[1]);
    assertEquals(result.history[3], {
      role: "user",
      content: payload.newUserMessageContent,
    });
  },
);

Deno.test(
  "constructMessageHistory: without selectedMessages and with chatId loads DB history, drops invalid roles, appends user",
  async () => {
    const mockDbMessages = [
      { role: "user", content: "DB Message 1" },
      { role: "invalid", content: "bad" },
      { role: "assistant", content: "DB Message 2" },
    ];
    const { deps, mockSetup } = buildConstructMessageHistoryTestContext(
      "construct-message-history-unit-2",
      {
        genericMockResults: {
          chat_messages: {
            select: { data: mockDbMessages, error: null },
          },
        },
      },
    );
    const params: ConstructMessageHistoryParams = {
      existingChatId: "existing-chat-id",
      system_prompt_text: null,
      rewindFromMessageId: null,
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "New user message",
      selectedMessages: undefined,
    };

    const result = await constructMessageHistory(deps, params, payload);

    assertEquals("historyFetchError" in result, false);
    assertEquals(result.history.length, 3);
    assertEquals(result.history[0], mockDbMessages[0]);
    assertEquals(result.history[1], mockDbMessages[2]);
    assertEquals(result.history[2].role, "user");
    const selectSpy =
      mockSetup.spies.getLatestQueryBuilderSpies("chat_messages")?.select;
    assertExists(selectSpy);
  },
);

Deno.test(
  "constructMessageHistory: DB fetch error returns ConstructMessageHistoryError with partial history",
  async () => {
    const dbError: Error = new Error("Database connection failed");
    const { deps } = buildConstructMessageHistoryTestContext(
      "construct-message-history-unit-3",
      {
        genericMockResults: {
          chat_messages: {
            select: { data: null, error: dbError },
          },
        },
      },
    );
    const systemPrompt: string = "You are a helpful assistant.";
    const params: ConstructMessageHistoryParams = {
      existingChatId: "existing-chat-id",
      system_prompt_text: systemPrompt,
      rewindFromMessageId: null,
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "New user message",
      selectedMessages: undefined,
    };

    const result = await constructMessageHistory(deps, params, payload);

    assertEquals("historyFetchError" in result, true);
    if ("historyFetchError" in result) {
      assertEquals(result.historyFetchError, dbError);
      assertEquals(result.history.length, 2);
      assertEquals(result.history[0].role, "system");
      assertEquals(result.history[1].role, "user");
    }
  },
);

Deno.test(
  "constructMessageHistory: no selectedMessages, no chatId, no rewind yields system prompt then user only",
  async () => {
    const { deps, mockSetup } = buildConstructMessageHistoryTestContext(
      "construct-message-history-unit-4",
    );
    const systemPrompt: string = "You are a helpful assistant.";
    const params: ConstructMessageHistoryParams = {
      existingChatId: null,
      system_prompt_text: systemPrompt,
      rewindFromMessageId: null,
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "First user message",
      selectedMessages: undefined,
    };

    const result = await constructMessageHistory(deps, params, payload);

    assertEquals("historyFetchError" in result, false);
    assertEquals(result.history.length, 2);
    assertEquals(result.history[0], {
      role: "system",
      content: systemPrompt,
    });
    assertEquals(result.history[1], {
      role: "user",
      content: payload.newUserMessageContent,
    });
    const selectSpy =
      mockSetup.spies.getLatestQueryBuilderSpies("chat_messages")?.select;
    assertEquals(selectSpy, undefined);
  },
);

Deno.test(
  "constructMessageHistory: rewindFromMessageId set skips DB fetch and yields system then user",
  async () => {
    const { deps, mockSetup } = buildConstructMessageHistoryTestContext(
      "construct-message-history-unit-5",
    );
    const systemPrompt: string = "You are a helpful assistant.";
    const params: ConstructMessageHistoryParams = {
      existingChatId: "existing-chat-id",
      system_prompt_text: systemPrompt,
      rewindFromMessageId: "message-to-rewind-from",
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "User message after rewind",
      selectedMessages: undefined,
    };

    const result = await constructMessageHistory(deps, params, payload);

    assertEquals("historyFetchError" in result, false);
    assertEquals(result.history.length, 2);
    assertEquals(result.history[0].role, "system");
    assertEquals(result.history[1].role, "user");
    const selectSpy =
      mockSetup.spies.getLatestQueryBuilderSpies("chat_messages")?.select;
    assertEquals(selectSpy, undefined);
  },
);

Deno.test(
  "constructMessageHistory: no system prompt omits system message from history",
  async () => {
    const { deps } = buildConstructMessageHistoryTestContext(
      "construct-message-history-unit-6",
    );
    const params: ConstructMessageHistoryParams = {
      existingChatId: null,
      system_prompt_text: null,
      rewindFromMessageId: null,
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "Only user line",
      selectedMessages: undefined,
    };

    const result = await constructMessageHistory(deps, params, payload);

    assertEquals("historyFetchError" in result, false);
    assertEquals(result.history.length, 1);
    assertEquals(result.history[0], {
      role: "user",
      content: payload.newUserMessageContent,
    });
  },
);
