import { assertEquals } from "jsr:@std/assert@0.225.3";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { debitTokens } from "../../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { StreamRewind } from "./streamRewind.ts";
import { StreamRewindDeps } from "./streamRewind.interface.ts";
import {
  buildStreamRewindHappyPathParams,
  buildStreamRewindHappyPathPayload,
} from "./streamRewind.mock.ts";

function buildStreamRewindDepsForIntegration(
  logger: MockLogger,
  adminWallet: StreamRewindDeps["adminTokenWalletService"],
): StreamRewindDeps {
  return {
    logger,
    adminTokenWalletService: adminWallet,
    countTokens,
    debitTokens,
    createErrorResponse,
    getMaxOutputTokens,
  };
}

function sseEventTypesFromBody(body: string): string[] {
  const types: string[] = [];
  const blocks: string[] = body.split("\n\n").filter((b) => b.length > 0);
  for (const block of blocks) {
    const trimmed: string = block.trim();
    if (!trimmed.startsWith("data: ")) {
      continue;
    }
    const jsonText: string = trimmed.slice("data: ".length);
    const parsed: unknown = JSON.parse(jsonText);
    if (typeof parsed !== "object" || parsed === null) {
      continue;
    }
    if (!("type" in parsed)) {
      continue;
    }
    const typeVal: unknown = Reflect.get(parsed, "type");
    if (typeof typeVal !== "string") {
      continue;
    }
    types.push(typeVal);
  }
  return types;
}

Deno.test({
  name:
    "integration: real debitTokens with mocked IAdminTokenWalletService records DEBIT_USAGE with expected wallet and positive amount via StreamRewind",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamRewindDeps = buildStreamRewindDepsForIntegration(
    logger,
    adminMock.instance,
  );
  const params = buildStreamRewindHappyPathParams();
  const payload = buildStreamRewindHappyPathPayload();
  try {
    const outcome = await StreamRewind(deps, params, payload);
    assertEquals(outcome instanceof Response, true);
    if (!(outcome instanceof Response)) {
      return;
    }
    await outcome.text();
    assertEquals(adminMock.stubs.recordTransaction.calls.length >= 1, true);
    const first = adminMock.stubs.recordTransaction.calls[0].args[0];
    assertEquals(first.type, "DEBIT_USAGE");
    assertEquals(first.walletId, params.wallet.walletId);
    assertEquals(first.relatedEntityType, "chat_message");
    const debited: number = Number.parseInt(first.amount, 10);
    assertEquals(debited > 0, true);
  } finally {
    adminMock.clearStubs();
  }
});

Deno.test({
  name:
    "integration: consumer-shaped StreamRewindDeps (StreamRequest-style wiring) invokes StreamRewind and yields text/event-stream",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamRewindDeps = {
    logger,
    adminTokenWalletService: adminMock.instance,
    countTokens,
    debitTokens,
    createErrorResponse,
    getMaxOutputTokens,
  };
  try {
    const outcome = await StreamRewind(
      deps,
      buildStreamRewindHappyPathParams(),
      buildStreamRewindHappyPathPayload(),
    );
    assertEquals(outcome instanceof Response, true);
    if (!(outcome instanceof Response)) {
      return;
    }
    const contentType: string | null = outcome.headers.get("Content-Type");
    assertEquals(
      contentType !== null && contentType.includes("text/event-stream"),
      true,
    );
  } finally {
    adminMock.clearStubs();
  }
});

Deno.test({
  name:
    "integration: StreamRewind SSE body emits chat_start then content_chunk then chat_complete in order",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamRewindDeps = buildStreamRewindDepsForIntegration(
    logger,
    adminMock.instance,
  );
  try {
    const outcome = await StreamRewind(
      deps,
      buildStreamRewindHappyPathParams(),
      buildStreamRewindHappyPathPayload(),
    );
    assertEquals(outcome instanceof Response, true);
    if (!(outcome instanceof Response)) {
      return;
    }
    const body: string = await outcome.text();
    const types: string[] = sseEventTypesFromBody(body);
    assertEquals(types.length >= 3, true);
    assertEquals(types[0], "chat_start");
    assertEquals(types[types.length - 1], "chat_complete");
    const firstChunkIndex: number = types.indexOf("content_chunk");
    assertEquals(firstChunkIndex > 0, true);
    assertEquals(firstChunkIndex < types.length - 1, true);
  } finally {
    adminMock.clearStubs();
  }
});
