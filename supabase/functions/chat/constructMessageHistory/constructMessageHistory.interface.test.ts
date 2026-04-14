import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { logger } from "../../_shared/logger.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ChatApiRequest, ChatMessageRole } from "../../_shared/types.ts";
import { Database } from "../../types_db.ts";
import {
  ConstructMessageHistory,
  ConstructMessageHistoryDeps,
  ConstructMessageHistoryError,
  ConstructMessageHistoryParams,
  ConstructMessageHistoryPayload,
  ConstructMessageHistoryReturn,
  ConstructMessageHistorySuccess,
} from "./constructMessageHistory.interface.ts";

Deno.test(
  "Contract: ConstructMessageHistoryDeps has logger and supabaseClient shapes",
  () => {
    const mockSupabase: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("construct-message-history-contract");
    const deps: ConstructMessageHistoryDeps = {
      logger,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    };

    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.logger.warn, "function");
    assertEquals(typeof deps.logger.error, "function");
    assertEquals(typeof deps.supabaseClient.from, "function");
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryParams accepts string ids and null rewind",
  () => {
    const params: ConstructMessageHistoryParams = {
      existingChatId: "chat-contract-1",
      system_prompt_text: "system text",
      rewindFromMessageId: null,
    };

    assertEquals(typeof params.existingChatId, "string");
    assertEquals(typeof params.system_prompt_text, "string");
    assertEquals(params.rewindFromMessageId, null);
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryParams accepts null chat and prompt with rewind id",
  () => {
    const params: ConstructMessageHistoryParams = {
      existingChatId: null,
      system_prompt_text: null,
      rewindFromMessageId: "msg-rewind-contract",
    };

    assertEquals(params.existingChatId, null);
    assertEquals(params.system_prompt_text, null);
    assertEquals(typeof params.rewindFromMessageId, "string");
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryPayload accepts selectedMessages array",
  () => {
    const selectedMessages: ChatApiRequest["selectedMessages"] = [
      { role: "user", content: "prior" },
      { role: "assistant", content: "reply" },
    ];
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "next",
      selectedMessages,
    };

    assertEquals(typeof payload.newUserMessageContent, "string");
    assertEquals(Array.isArray(payload.selectedMessages), true);
    if (payload.selectedMessages !== undefined) {
      assertEquals(payload.selectedMessages.length, 2);
      assertEquals(typeof payload.selectedMessages[0].role, "string");
      assertEquals(typeof payload.selectedMessages[0].content, "string");
    }
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryPayload accepts undefined selectedMessages",
  () => {
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "solo",
      selectedMessages: undefined,
    };

    assertEquals(typeof payload.newUserMessageContent, "string");
    assertEquals(payload.selectedMessages, undefined);
  },
);

Deno.test(
  "Contract: ConstructMessageHistorySuccess has history with ChatMessageRole entries",
  () => {
    const role: ChatMessageRole = "user";
    const value: ConstructMessageHistorySuccess = {
      history: [{ role, content: "hello" }],
    };

    assertEquals(value.history.length, 1);
    assertEquals(value.history[0].role, "user");
    assertEquals(typeof value.history[0].content, "string");
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryError has history and historyFetchError",
  () => {
    const fetchErr: Error = new Error("fetch failed");
    const value: ConstructMessageHistoryError = {
      history: [{ role: "system", content: "s" }],
      historyFetchError: fetchErr,
    };

    assertEquals(value.history.length, 1);
    assertEquals(value.historyFetchError instanceof Error, true);
    assertEquals(value.historyFetchError.message, "fetch failed");
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryReturn accepts ConstructMessageHistorySuccess",
  () => {
    const value: ConstructMessageHistoryReturn = {
      history: [{ role: "user", content: "u" }],
    };

    assertEquals("history" in value, true);
    assertEquals("historyFetchError" in value, false);
  },
);

Deno.test(
  "Contract: ConstructMessageHistoryReturn accepts ConstructMessageHistoryError",
  () => {
    const value: ConstructMessageHistoryReturn = {
      history: [],
      historyFetchError: new Error("e"),
    };

    assertEquals("historyFetchError" in value, true);
    assertEquals(value.historyFetchError instanceof Error, true);
  },
);

Deno.test(
  "Contract: ConstructMessageHistory matches (deps, params, payload) => Promise<return>",
  async () => {
    const impl: ConstructMessageHistory = async (_deps, _params, _payload) => {
      const out: ConstructMessageHistorySuccess = {
        history: [{ role: "user", content: "x" }],
      };
      return out;
    };

    const mockSupabase: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("construct-message-history-contract-fn");
    const deps: ConstructMessageHistoryDeps = {
      logger,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    };
    const params: ConstructMessageHistoryParams = {
      existingChatId: null,
      system_prompt_text: null,
      rewindFromMessageId: null,
    };
    const payload: ConstructMessageHistoryPayload = {
      newUserMessageContent: "m",
      selectedMessages: undefined,
    };

    const result: ConstructMessageHistoryReturn = await impl(
      deps,
      params,
      payload,
    );

    assertEquals(result.history.length, 1);
    assertEquals(result.history[0].role, "user");
  },
);
