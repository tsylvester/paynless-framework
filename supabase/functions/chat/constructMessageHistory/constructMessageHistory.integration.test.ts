import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ChatApiRequest } from "../../_shared/types.ts";
import { Database } from "../../types_db.ts";
import {
  buildStreamChatHappyPathParams,
  buildStreamChatHappyPathPayload,
} from "../streamChat/streamChat.mock.ts";
import { StreamChatParams, StreamChatPayload } from "../streamChat/streamChat.interface.ts";
import { constructMessageHistory } from "./constructMessageHistory.ts";
import {
  ConstructMessageHistoryDeps,
  ConstructMessageHistoryParams,
  ConstructMessageHistoryPayload,
} from "./constructMessageHistory.interface.ts";

Deno.test({
  name:
    "integration: constructMessageHistory with mocked Supabase assembles DB rows and user message",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const dbRows = [
    { role: "user", content: "db user" },
    { role: "assistant", content: "db assistant" },
  ];
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient("construct-message-history-integration-1", {
      genericMockResults: {
        chat_messages: {
          select: { data: dbRows, error: null },
        },
      },
    });
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const logger: MockLogger = new MockLogger();
  const deps: ConstructMessageHistoryDeps = { logger, supabaseClient };
  const params: ConstructMessageHistoryParams = {
    existingChatId: "integration-existing-chat",
    system_prompt_text: null,
    rewindFromMessageId: null,
  };
  const payload: ConstructMessageHistoryPayload = {
    newUserMessageContent: "integration user tail",
    selectedMessages: undefined,
  };

  const result = await constructMessageHistory(deps, params, payload);

  assertEquals("historyFetchError" in result, false);
  assertEquals(result.history.length, 3);
  assertEquals(result.history[0], dbRows[0]);
  assertEquals(result.history[1], dbRows[1]);
  assertEquals(result.history[2], {
    role: "user",
    content: payload.newUserMessageContent,
  });
  const selectSpy =
    mockSetup.spies.getLatestQueryBuilderSpies("chat_messages")?.select;
  assertEquals(selectSpy !== undefined, true);
});

Deno.test({
  name:
    "integration: StreamChat-shaped logger and params yield ConstructMessageHistoryDeps and real constructMessageHistory",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const streamParams: StreamChatParams = buildStreamChatHappyPathParams();
  const streamPayload: StreamChatPayload = buildStreamChatHappyPathPayload();
  const rb: ChatApiRequest = streamPayload.requestBody;

  const historyDeps: ConstructMessageHistoryDeps = {
    logger,
    supabaseClient: streamParams.supabaseClient,
  };
  const historyParams: ConstructMessageHistoryParams = {
    existingChatId: rb.chatId ?? null,
    system_prompt_text: streamParams.actualSystemPromptText,
    rewindFromMessageId: rb.rewindFromMessageId ?? null,
  };
  const historyPayload: ConstructMessageHistoryPayload = {
    newUserMessageContent: rb.message,
    selectedMessages: rb.selectedMessages,
  };

  const result = await constructMessageHistory(
    historyDeps,
    historyParams,
    historyPayload,
  );

  assertEquals("historyFetchError" in result, false);
  assertEquals(result.history.length >= 1, true);
  const last = result.history[result.history.length - 1];
  assertEquals(last.role, "user");
  assertEquals(last.content, rb.message);
});
