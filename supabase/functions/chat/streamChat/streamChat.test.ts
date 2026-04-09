import { assertEquals } from "jsr:@std/assert@0.225.3";
import { StreamChat } from "./StreamChat.ts";
import {
  StreamChatDeps,
  StreamChatError,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
} from "./streamChat.interface.ts";
import {
  buildContractStreamChatDeps,
  buildStreamChatDepsInsufficientBalance,
  buildStreamChatDepsTokenLimitExceeded,
  buildStreamChatHappyPathParams,
  buildStreamChatHappyPathPayload,
} from "./streamChat.mock.ts";

Deno.test({
  name: "StreamChat returns SSE Response with chat_start, content_chunk, and chat_complete",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const deps: StreamChatDeps = buildContractStreamChatDeps();
  const params: StreamChatParams = buildStreamChatHappyPathParams();
  const payload: StreamChatPayload = buildStreamChatHappyPathPayload();
  const outcome: StreamChatReturn = await StreamChat(deps, params, payload);
  assertEquals(outcome instanceof Response || outcome instanceof Error, true);
  assertEquals(outcome instanceof Response, true);
  if (outcome instanceof Response) {
    const contentType: string | null = outcome.headers.get("Content-Type");
    assertEquals(
      contentType !== null && contentType.includes("text/event-stream"),
      true,
    );
    const body: string = await outcome.text();
    assertEquals(body.includes('"type":"chat_start"'), true);
    assertEquals(body.includes('"type":"content_chunk"'), true);
    assertEquals(body.includes('"type":"chat_complete"'), true);
  }
});

Deno.test({ name: "StreamChat returns StreamChatError when adapter sendMessage throws",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const deps: StreamChatDeps = buildContractStreamChatDeps();
  const params: StreamChatParams = buildStreamChatHappyPathParams({
    adapterThrows: true,
  });
  const payload: StreamChatPayload = buildStreamChatHappyPathPayload();
  const outcome: StreamChatReturn = await StreamChat(deps, params, payload);
  assertEquals(outcome instanceof Response || outcome instanceof Error, true);
  assertEquals(outcome instanceof Error, true);
  if (outcome instanceof Error) {
    const err: StreamChatError = outcome;
    assertEquals(err.message, "unit test adapter failure");
  }
});

Deno.test( "StreamChat returns StreamChatError when the user cannot afford output tokens",
  async () => {
    const deps: StreamChatDeps = buildStreamChatDepsInsufficientBalance();
    const params: StreamChatParams = buildStreamChatHappyPathParams();
    const payload: StreamChatPayload = buildStreamChatHappyPathPayload();
    const outcome: StreamChatReturn = await StreamChat(deps, params, payload);
    assertEquals(outcome instanceof Response || outcome instanceof Error, true);
    assertEquals(outcome instanceof Error, true);
    if (outcome instanceof Error) {
      const err: StreamChatError = outcome;
      assertEquals(
        err.message,
        "Insufficient token balance for this streaming request.",
      );
    }
  },
);

Deno.test(
  "StreamChat returns StreamChatError when estimated prompt tokens exceed provider max input",
  async () => {
    const deps: StreamChatDeps = buildStreamChatDepsTokenLimitExceeded();
    const params: StreamChatParams = buildStreamChatHappyPathParams();
    const payload: StreamChatPayload = buildStreamChatHappyPathPayload();
    const outcome: StreamChatReturn = await StreamChat(deps, params, payload);
    assertEquals(outcome instanceof Response || outcome instanceof Error, true);
    assertEquals(outcome instanceof Error, true);
    if (outcome instanceof Error) {
      const err: StreamChatError = outcome;
      assertEquals(
        err.message,
        "Your message is too long for streaming. Maximum: 100 tokens, actual: 999999 tokens.",
      );
    }
  },
);
