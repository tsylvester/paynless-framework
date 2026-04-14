import { assertEquals } from "jsr:@std/assert@0.225.3";
import { logger } from "../../_shared/logger.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ChatMessageRole } from "../../_shared/types.ts";
import {
  isConstructMessageHistoryDeps,
  isConstructMessageHistoryError,
  isConstructMessageHistoryParams,
  isConstructMessageHistoryPayload,
  isConstructMessageHistoryReturn,
  isConstructMessageHistorySuccess,
} from "./constructMessageHistory.guard.ts";

Deno.test(
  "isConstructMessageHistoryDeps returns true for deps with logger and supabaseClient",
  () => {
    const mockSupabase: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("construct-message-history-guard");
    assertEquals(
      isConstructMessageHistoryDeps({
        logger,
        supabaseClient: mockSupabase.client,
      }),
      true,
    );
  },
);

Deno.test("isConstructMessageHistoryDeps returns false for null", () => {
  assertEquals(isConstructMessageHistoryDeps(null), false);
});

Deno.test("isConstructMessageHistoryDeps returns false for empty object", () => {
  assertEquals(isConstructMessageHistoryDeps({}), false);
});

Deno.test(
  "isConstructMessageHistoryDeps returns false when logger is missing",
  () => {
    const mockSupabase: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("construct-message-history-guard-no-logger");
    assertEquals(
      isConstructMessageHistoryDeps({ supabaseClient: mockSupabase.client }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryDeps returns false when supabaseClient is missing",
  () => {
    assertEquals(isConstructMessageHistoryDeps({ logger }), false);
  },
);

Deno.test(
  "isConstructMessageHistoryDeps returns false when value is not a non-null object record",
  () => {
    assertEquals(isConstructMessageHistoryDeps(0), false);
  },
);

Deno.test(
  "isConstructMessageHistoryParams returns true for string chat, string prompt, null rewind",
  () => {
    assertEquals(
      isConstructMessageHistoryParams({
        existingChatId: "chat-guard-1",
        system_prompt_text: "prompt",
        rewindFromMessageId: null,
      }),
      true,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryParams returns true for null chat, null prompt, string rewind",
  () => {
    assertEquals(
      isConstructMessageHistoryParams({
        existingChatId: null,
        system_prompt_text: null,
        rewindFromMessageId: "msg-rewind-guard",
      }),
      true,
    );
  },
);

Deno.test("isConstructMessageHistoryParams returns false for null", () => {
  assertEquals(isConstructMessageHistoryParams(null), false);
});

Deno.test("isConstructMessageHistoryParams returns false for empty object", () => {
  assertEquals(isConstructMessageHistoryParams({}), false);
});

Deno.test(
  "isConstructMessageHistoryParams returns false when existingChatId has wrong type",
  () => {
    assertEquals(
      isConstructMessageHistoryParams({
        existingChatId: 1,
        system_prompt_text: null,
        rewindFromMessageId: null,
      }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryParams returns false when system_prompt_text has wrong type",
  () => {
    assertEquals(
      isConstructMessageHistoryParams({
        existingChatId: null,
        system_prompt_text: 2,
        rewindFromMessageId: null,
      }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryParams returns false when rewindFromMessageId has wrong type",
  () => {
    assertEquals(
      isConstructMessageHistoryParams({
        existingChatId: null,
        system_prompt_text: null,
        rewindFromMessageId: true,
      }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryPayload returns true with selectedMessages undefined",
  () => {
    assertEquals(
      isConstructMessageHistoryPayload({
        newUserMessageContent: "hello",
        selectedMessages: undefined,
      }),
      true,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryPayload returns true with selectedMessages array",
  () => {
    assertEquals(
      isConstructMessageHistoryPayload({
        newUserMessageContent: "hello",
        selectedMessages: [{ role: "user", content: "prior" }],
      }),
      true,
    );
  },
);

Deno.test("isConstructMessageHistoryPayload returns false for null", () => {
  assertEquals(isConstructMessageHistoryPayload(null), false);
});

Deno.test("isConstructMessageHistoryPayload returns false for empty object", () => {
  assertEquals(isConstructMessageHistoryPayload({}), false);
});

Deno.test(
  "isConstructMessageHistoryPayload returns false when newUserMessageContent is missing",
  () => {
    assertEquals(
      isConstructMessageHistoryPayload({ selectedMessages: undefined }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryPayload returns false when newUserMessageContent has wrong type",
  () => {
    assertEquals(
      isConstructMessageHistoryPayload({
        newUserMessageContent: 1,
        selectedMessages: undefined,
      }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistorySuccess returns true for history with ChatMessageRole entries",
  () => {
    const role: ChatMessageRole = "assistant";
    assertEquals(
      isConstructMessageHistorySuccess({
        history: [{ role, content: "body" }],
      }),
      true,
    );
  },
);

Deno.test("isConstructMessageHistorySuccess returns false for null", () => {
  assertEquals(isConstructMessageHistorySuccess(null), false);
});

Deno.test("isConstructMessageHistorySuccess returns false for empty object", () => {
  assertEquals(isConstructMessageHistorySuccess({}), false);
});

Deno.test(
  "isConstructMessageHistorySuccess returns false when history is missing",
  () => {
    assertEquals(isConstructMessageHistorySuccess({ notHistory: [] }), false);
  },
);

Deno.test(
  "isConstructMessageHistoryError returns true for history and historyFetchError",
  () => {
    assertEquals(
      isConstructMessageHistoryError({
        history: [{ role: "system", content: "s" }],
        historyFetchError: new Error("fetch"),
      }),
      true,
    );
  },
);

Deno.test("isConstructMessageHistoryError returns false for null", () => {
  assertEquals(isConstructMessageHistoryError(null), false);
});

Deno.test("isConstructMessageHistoryError returns false for empty object", () => {
  assertEquals(isConstructMessageHistoryError({}), false);
});

Deno.test(
  "isConstructMessageHistoryError returns false when historyFetchError is missing",
  () => {
    assertEquals(
      isConstructMessageHistoryError({
        history: [],
      }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryError returns false when historyFetchError is not an Error",
  () => {
    assertEquals(
      isConstructMessageHistoryError({
        history: [],
        historyFetchError: "not an error",
      }),
      false,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryReturn returns true for ConstructMessageHistorySuccess shape",
  () => {
    const role: ChatMessageRole = "user";
    assertEquals(
      isConstructMessageHistoryReturn({
        history: [{ role, content: "u" }],
      }),
      true,
    );
  },
);

Deno.test(
  "isConstructMessageHistoryReturn returns true for ConstructMessageHistoryError shape",
  () => {
    assertEquals(
      isConstructMessageHistoryReturn({
        history: [],
        historyFetchError: new Error("r"),
      }),
      true,
    );
  },
);

Deno.test("isConstructMessageHistoryReturn returns false for null", () => {
  assertEquals(isConstructMessageHistoryReturn(null), false);
});

Deno.test("isConstructMessageHistoryReturn returns false for empty object", () => {
  assertEquals(isConstructMessageHistoryReturn({}), false);
});
