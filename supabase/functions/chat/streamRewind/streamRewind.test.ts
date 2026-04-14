import { assertEquals } from "jsr:@std/assert@0.225.3";
import {
  StreamRewindPayload,
  StreamRewindReturn,
} from "./streamRewind.interface.ts";
import {
  buildContractStreamRewindPayloadWithoutChatId,
  buildStreamRewindDepsInsufficientBalance,
  buildStreamRewindHappyPathParams,
  buildStreamRewindHappyPathPayload,
  buildStreamRewindUnitDepsWithFreshAdmin,
} from "./streamRewind.mock.ts";
import { StreamRewind } from "./streamRewind.ts";

Deno.test({
  name:
    "StreamRewind returns SSE Response with chat_start, content_chunk, and chat_complete on happy rewind path",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const { deps, admin } = buildStreamRewindUnitDepsWithFreshAdmin();
  const payload: StreamRewindPayload = buildStreamRewindHappyPathPayload();
  assertEquals(payload.req instanceof Request, true);
  assertEquals(
    payload.req.headers.get("Origin"),
    "http://localhost:5173",
  );
  const outcome: StreamRewindReturn = await StreamRewind(
    deps,
    buildStreamRewindHappyPathParams(),
    payload,
  );
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
  assertEquals(admin.stubs.recordTransaction.calls.length >= 1, true);
});

Deno.test({
  name:
    "StreamRewind performs DEBIT_USAGE then CREDIT_ADJUSTMENT when perform_chat_rewind RPC fails after debit",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const { deps, admin } = buildStreamRewindUnitDepsWithFreshAdmin();
  const payload: StreamRewindPayload = buildStreamRewindHappyPathPayload();
  assertEquals(payload.req instanceof Request, true);
  assertEquals(
    payload.req.headers.get("Origin"),
    "http://localhost:5173",
  );
  const outcome: StreamRewindReturn = await StreamRewind(
    deps,
    buildStreamRewindHappyPathParams({ rpcFails: true }),
    payload,
  );
  assertEquals(outcome instanceof Response || outcome instanceof Error, true);
  assertEquals(outcome instanceof Response, true);
  if (outcome instanceof Response) {
    const body: string = await outcome.text();
    assertEquals(body.includes('"type":"error"'), true);
  }
  assertEquals(admin.stubs.recordTransaction.calls.length, 2);
  assertEquals(admin.stubs.recordTransaction.calls[0].args[0].type, "DEBIT_USAGE");
  assertEquals(
    admin.stubs.recordTransaction.calls[1].args[0].type,
    "CREDIT_ADJUSTMENT",
  );
});

Deno.test(
  "StreamRewind returns 400 when chatId is missing from requestBody",
  async () => {
    const { deps } = buildStreamRewindUnitDepsWithFreshAdmin();
    const payload: StreamRewindPayload =
      buildContractStreamRewindPayloadWithoutChatId();
    assertEquals(payload.req instanceof Request, true);
    assertEquals(
      payload.req.headers.get("Origin"),
      "http://localhost:5173",
    );
    const outcome: StreamRewindReturn = await StreamRewind(
      deps,
      buildStreamRewindHappyPathParams(),
      payload,
    );
    assertEquals(outcome instanceof Response || outcome instanceof Error, true);
    assertEquals(outcome instanceof Response, true);
    if (outcome instanceof Response) {
      assertEquals(outcome.status, 400);
    }
  },
);

Deno.test({
  name: "StreamRewind surfaces adapter failure as SSE error event",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const { deps } = buildStreamRewindUnitDepsWithFreshAdmin();
  const payload: StreamRewindPayload = buildStreamRewindHappyPathPayload();
  assertEquals(payload.req instanceof Request, true);
  assertEquals(
    payload.req.headers.get("Origin"),
    "http://localhost:5173",
  );
  const outcome: StreamRewindReturn = await StreamRewind(
    deps,
    buildStreamRewindHappyPathParams({ adapterThrows: true }),
    payload,
  );
  assertEquals(outcome instanceof Response || outcome instanceof Error, true);
  assertEquals(outcome instanceof Response, true);
  if (outcome instanceof Response) {
    const contentType: string | null = outcome.headers.get("Content-Type");
    assertEquals(
      contentType !== null && contentType.includes("text/event-stream"),
      true,
    );
    const body: string = await outcome.text();
    assertEquals(body.includes('"type":"error"'), true);
  }
});

Deno.test(
  "StreamRewind returns 402 when the user cannot afford output tokens",
  async () => {
    const payload: StreamRewindPayload = buildStreamRewindHappyPathPayload();
    assertEquals(payload.req instanceof Request, true);
    assertEquals(
      payload.req.headers.get("Origin"),
      "http://localhost:5173",
    );
    const outcome: StreamRewindReturn = await StreamRewind(
      buildStreamRewindDepsInsufficientBalance(),
      buildStreamRewindHappyPathParams(),
      payload,
    );
    assertEquals(outcome instanceof Response || outcome instanceof Error, true);
    assertEquals(outcome instanceof Response, true);
    if (outcome instanceof Response) {
      assertEquals(outcome.status, 402);
    }
  },
);
