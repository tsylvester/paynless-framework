import { assertEquals } from "jsr:@std/assert@0.225.3";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflightRequest,
} from "../_shared/cors-headers.ts";
import { createMockAdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { ChatDeps } from "./index.interface.ts";
import { isChatDeps } from "./index.guard.ts";
import {
  buildContractStreamRequestDeps,
  createMockStreamRequest,
} from "./streamRequest/streamRequest.mock.ts";

Deno.test(
  "isChatDeps returns true when value matches ChatDeps shape",
  () => {
    const streamRequestDeps = buildContractStreamRequestDeps();
    const mockAdminWallet = createMockAdminTokenWalletService();
    const mockUserWallet = createMockUserTokenWalletService();
    const deps: ChatDeps = {
      logger: streamRequestDeps.logger,
      adminTokenWalletService: mockAdminWallet.instance,
      userTokenWalletService: mockUserWallet.instance,
      streamRequest: createMockStreamRequest(),
      handleCorsPreflightRequest,
      createSuccessResponse,
      createErrorResponse,
      prepareChatContext: streamRequestDeps.prepareChatContext,
      countTokens: streamRequestDeps.countTokens,
      debitTokens: streamRequestDeps.debitTokens,
      getMaxOutputTokens: streamRequestDeps.getMaxOutputTokens,
      findOrCreateChat: streamRequestDeps.findOrCreateChat,
      constructMessageHistory: streamRequestDeps.constructMessageHistory,
      getAiProviderAdapter: streamRequestDeps.getAiProviderAdapter,
    };
    assertEquals(isChatDeps(deps), true);
  },
);

Deno.test("isChatDeps returns false for null", () => {
  assertEquals(isChatDeps(null), false);
});

Deno.test("isChatDeps returns false for empty object", () => {
  assertEquals(isChatDeps({}), false);
});

Deno.test(
  "isChatDeps returns false when adminTokenWalletService key is absent",
  () => {
    const streamRequestDeps = buildContractStreamRequestDeps();
    const mockUserWallet = createMockUserTokenWalletService();
    const missingAdmin = {
      logger: streamRequestDeps.logger,
      userTokenWalletService: mockUserWallet.instance,
      streamRequest: createMockStreamRequest(),
      handleCorsPreflightRequest,
      createSuccessResponse,
      createErrorResponse,
      prepareChatContext: streamRequestDeps.prepareChatContext,
      countTokens: streamRequestDeps.countTokens,
      debitTokens: streamRequestDeps.debitTokens,
      getMaxOutputTokens: streamRequestDeps.getMaxOutputTokens,
      findOrCreateChat: streamRequestDeps.findOrCreateChat,
      constructMessageHistory: streamRequestDeps.constructMessageHistory,
      getAiProviderAdapter: streamRequestDeps.getAiProviderAdapter,
    };
    assertEquals(isChatDeps(missingAdmin), false);
  },
);

Deno.test("isChatDeps returns false when streamRequest key is absent", () => {
  const streamRequestDeps = buildContractStreamRequestDeps();
  const mockAdminWallet = createMockAdminTokenWalletService();
  const mockUserWallet = createMockUserTokenWalletService();
  const missingStreamRequest = {
    logger: streamRequestDeps.logger,
    adminTokenWalletService: mockAdminWallet.instance,
    userTokenWalletService: mockUserWallet.instance,
    handleCorsPreflightRequest,
    createSuccessResponse,
    createErrorResponse,
    prepareChatContext: streamRequestDeps.prepareChatContext,
    countTokens: streamRequestDeps.countTokens,
    debitTokens: streamRequestDeps.debitTokens,
    getMaxOutputTokens: streamRequestDeps.getMaxOutputTokens,
    findOrCreateChat: streamRequestDeps.findOrCreateChat,
    constructMessageHistory: streamRequestDeps.constructMessageHistory,
    getAiProviderAdapter: streamRequestDeps.getAiProviderAdapter,
  };
  assertEquals(isChatDeps(missingStreamRequest), false);
});
