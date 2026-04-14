import { assertEquals } from "jsr:@std/assert@0.225.3";
import {
  buildContractPrepareChatContextDeps,
  buildContractPrepareChatContextSuccess,
} from "./prepareChatContext.mock.ts";
import {
  isPrepareChatContextDeps,
  isPrepareChatContextError,
  isPrepareChatContextSuccess,
} from "./prepareChatContext.guard.ts";

Deno.test(
  "isPrepareChatContextDeps returns true for valid deps with logger, userTokenWalletService, getAiProviderAdapter, supabaseClient",
  () => {
    assertEquals(
      isPrepareChatContextDeps(buildContractPrepareChatContextDeps()),
      true,
    );
  },
);

Deno.test("isPrepareChatContextDeps returns false for null", () => {
  assertEquals(isPrepareChatContextDeps(null), false);
});

Deno.test("isPrepareChatContextDeps returns false for empty object", () => {
  assertEquals(isPrepareChatContextDeps({}), false);
});

Deno.test(
  "isPrepareChatContextDeps returns false when userTokenWalletService is missing",
  () => {
    const full = buildContractPrepareChatContextDeps();
    const withoutUserWallet = {
      logger: full.logger,
      getAiProviderAdapter: full.getAiProviderAdapter,
      supabaseClient: full.supabaseClient,
    };
    assertEquals(isPrepareChatContextDeps(withoutUserWallet), false);
  },
);

Deno.test(
  "isPrepareChatContextDeps returns false when getAiProviderAdapter is missing",
  () => {
    const full = buildContractPrepareChatContextDeps();
    const withoutAdapter = {
      logger: full.logger,
      userTokenWalletService: full.userTokenWalletService,
      supabaseClient: full.supabaseClient,
    };
    assertEquals(isPrepareChatContextDeps(withoutAdapter), false);
  },
);

Deno.test(
  "isPrepareChatContextSuccess returns true for object with wallet, aiProviderAdapter, modelConfig, apiKey, providerApiIdentifier",
  () => {
    assertEquals(
      isPrepareChatContextSuccess(buildContractPrepareChatContextSuccess()),
      true,
    );
  },
);

Deno.test("isPrepareChatContextSuccess returns false for null", () => {
  assertEquals(isPrepareChatContextSuccess(null), false);
});

Deno.test("isPrepareChatContextSuccess returns false for empty object", () => {
  assertEquals(isPrepareChatContextSuccess({}), false);
});

Deno.test(
  "isPrepareChatContextSuccess returns false when apiKey is missing",
  () => {
    const full = buildContractPrepareChatContextSuccess();
    const withoutApiKey = {
      wallet: full.wallet,
      aiProviderAdapter: full.aiProviderAdapter,
      modelConfig: full.modelConfig,
      actualSystemPromptText: full.actualSystemPromptText,
      finalSystemPromptIdForDb: full.finalSystemPromptIdForDb,
      providerApiIdentifier: full.providerApiIdentifier,
    };
    assertEquals(isPrepareChatContextSuccess(withoutApiKey), false);
  },
);

Deno.test(
  "isPrepareChatContextError returns true for object with error.message and error.status",
  () => {
    assertEquals(
      isPrepareChatContextError({
        error: {
          message: "prepare-chat-context-guard-error-message",
          status: 400,
        },
      }),
      true,
    );
  },
);

Deno.test("isPrepareChatContextError returns false for null", () => {
  assertEquals(isPrepareChatContextError(null), false);
});

Deno.test("isPrepareChatContextError returns false for empty object", () => {
  assertEquals(isPrepareChatContextError({}), false);
});

Deno.test(
  "isPrepareChatContextError returns false when error.status is missing",
  () => {
    assertEquals(
      isPrepareChatContextError({
        error: {
          message: "prepare-chat-context-guard-error-no-status",
        },
      }),
      false,
    );
  },
);
