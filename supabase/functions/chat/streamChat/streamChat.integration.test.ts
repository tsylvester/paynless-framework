import { assertEquals } from "jsr:@std/assert@0.225.3";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { debitTokens } from "../../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { constructMessageHistory } from "../constructMessageHistory/constructMessageHistory.ts";
import { findOrCreateChat } from "../findOrCreateChat.ts";
import { StreamChat } from "./StreamChat.ts";
import { StreamChatDeps } from "./streamChat.interface.ts";
import {
  buildStreamChatHappyPathParams,
  buildStreamChatHappyPathPayload,
} from "./streamChat.mock.ts";

function buildStreamChatDepsForIntegration(
  logger: MockLogger,
  adminWallet: StreamChatDeps["adminTokenWalletService"],
): StreamChatDeps {
  return {
    logger,
    adminTokenWalletService: adminWallet,
    countTokens,
    debitTokens,
    createErrorResponse,
    findOrCreateChat,
    constructMessageHistory,
    getMaxOutputTokens,
  };
}

Deno.test({
  name:
    "integration: debitTokens and StreamChat — recordTransaction runs on mocked IAdminTokenWalletService",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamChatDeps = buildStreamChatDepsForIntegration(
    logger,
    adminMock.instance,
  );
  try {
    const outcome = await StreamChat(
      deps,
      buildStreamChatHappyPathParams(),
      buildStreamChatHappyPathPayload(),
    );
    assertEquals(outcome instanceof Response, true);
    if (!(outcome instanceof Response)) {
      return;
    }
    await outcome.text();
    assertEquals(adminMock.stubs.recordTransaction.calls.length >= 1, true);
  } finally {
    adminMock.clearStubs();
  }
});

Deno.test({
  name:
    "integration: consumer-shaped wiring builds StreamChatDeps and invokes StreamChat for SSE",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamChatDeps = buildStreamChatDepsForIntegration(
    logger,
    adminMock.instance,
  );
  try {
    const outcome = await StreamChat(
      deps,
      buildStreamChatHappyPathParams(),
      buildStreamChatHappyPathPayload(),
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
