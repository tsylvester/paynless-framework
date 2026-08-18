import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { BoundDebitTokens } from "../../_shared/utils/debitTokens.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { debitForResponse } from "./debitForResponse.ts";
import {
  isDebitForResponseSuccessReturn,
  isDebitForResponseErrorReturn,
  isDebitForResponseWalletReadError,
  isDebitForResponseWalletNotFoundError,
  isDebitForResponseWalletCurrencyError,
  isDebitForResponseWalletBalanceError,
  isDebitForResponseTokenUsageError,
} from "./debitForResponse.guard.ts";
import {
  buildDebitForResponseDeps,
  buildDebitForResponseParams,
  buildDebitForResponsePayload,
} from "./debitForResponse.mock.ts";
import { buildDebitTokensSuccess, buildDebitTokensError } from "../../_shared/utils/debitTokens.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import {
  buildUnifiedAIResponse,
  buildTokenWalletRow,
  invalidateTokenWalletRow,
} from "../../_shared/dialectic.mock.ts";

/**
 * Contract: the wallet is read by the params' id, which differs from every other identifier in the arrangement.
 * Arrange: params with walletId "wallet-target-1" (distinct from jobId and projectOwnerUserId); mock client
 *   configured to return a valid wallet row for token_wallets select; deps with a debit that succeeds.
 * Act:     debitForResponse over the valid arrangement.
 * Assert:  the token_wallets query's eq filter on wallet_id is params.walletId.
 */
Deno.test("wallet is read by the params' id", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow({ wallet_id: "wallet-target-1" })], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    jobId: "job-distinct-1",
    walletId: "wallet-target-1",
    projectOwnerUserId: "owner-distinct-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  await debitForResponse(deps, params, payload);

  // Assert
  const walletBuilder = client.getLatestBuilder("token_wallets");
  const state = walletBuilder?.getQueryBuilderState();
  const walletIdFilter = state?.filters.find((f) => f.column === "wallet_id" && f.type === "eq");
  assertEquals(walletIdFilter?.value, "wallet-target-1");
});

/**
 * Contract: a read returning a driver error returns the error arm whose error passes
 *   isDebitForResponseWalletReadError, carries that message, and whose retriable is true;
 *   the debit was never invoked.
 * Arrange: mock client configured to return a driver error for token_wallets select;
 *   deps with a spied debit that would succeed.
 * Act:     debitForResponse over the driver-error arrangement.
 * Assert:  error arm; error is WalletReadError; error.message carries the driver message; retriable is true;
 *   debit was never invoked.
 */
Deno.test("read failed — driver error returns WalletReadError retriable true, no debit", async () => {
  // Arrange
  const driverMessage = "connection refused";
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [], error: new Error(driverMessage) },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseErrorReturn(result));
  if (isDebitForResponseErrorReturn(result)) {
    assert(isDebitForResponseWalletReadError(result.error));
    assertEquals(result.error.message.includes(driverMessage), true);
    assertEquals(result.retriable, true);
  }
  assertEquals(debitSpy.calls.length, 0);
});

/**
 * Contract: a read returning no row returns the error arm whose error passes
 *   isDebitForResponseWalletNotFoundError, with retriable false and no debit invoked.
 * Arrange: mock client configured to return empty data for token_wallets select;
 *   deps with a spied debit that would succeed.
 * Act:     debitForResponse over the no-row arrangement.
 * Assert:  error arm; error is WalletNotFoundError; retriable is false; debit was never invoked.
 */
Deno.test("wallet absent — no row returns WalletNotFoundError retriable false, no debit", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseErrorReturn(result));
  if (isDebitForResponseErrorReturn(result)) {
    assert(isDebitForResponseWalletNotFoundError(result.error));
    assertEquals(result.retriable, false);
  }
  assertEquals(debitSpy.calls.length, 0);
});

/**
 * Contract: a row whose currency is not 'AI_TOKEN' returns the error arm whose error passes
 *   isDebitForResponseWalletCurrencyError, with retriable false and no debit invoked.
 * Arrange: mock client configured to return a wallet row with currency 'USD' and a valid balance;
 *   deps with a spied debit that would succeed.
 * Act:     debitForResponse over the wrong-currency arrangement.
 * Assert:  error arm; error is WalletCurrencyError; retriable is false; debit was never invoked.
 */
Deno.test("wrong currency — returns WalletCurrencyError retriable false, no debit", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow({ currency: "USD" })], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseErrorReturn(result));
  if (isDebitForResponseErrorReturn(result)) {
    assert(isDebitForResponseWalletCurrencyError(result.error));
    assertEquals(result.retriable, false);
  }
  assertEquals(debitSpy.calls.length, 0);
});

/**
 * Contract: a row whose balance is null returns the error arm whose error passes
 *   isDebitForResponseWalletBalanceError, with retriable false and no debit invoked.
 * Arrange: mock client configured to return a wallet row with balance null (via invalidator) and
 *   currency 'AI_TOKEN'; deps with a spied debit that would succeed.
 * Act:     debitForResponse over the null-balance arrangement.
 * Assert:  error arm; error is WalletBalanceError; retriable is false; debit was never invoked.
 */
Deno.test("null balance — returns WalletBalanceError retriable false, no debit", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: async () => {
          const invalid: unknown = invalidateTokenWalletRow({ balance: null });
          if (typeof invalid === "object" && invalid !== null) {
            return { data: [invalid], error: null };
          }
          return { data: null, error: null };
        },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseErrorReturn(result));
  if (isDebitForResponseErrorReturn(result)) {
    assert(isDebitForResponseWalletBalanceError(result.error));
    assertEquals(result.retriable, false);
  }
  assertEquals(debitSpy.calls.length, 0);
});

/**
 * Contract: a row whose user_id is set and organization_id is null yields a wallet carrying userId
 *   and no organizationId key, and the mirrored row yields the mirrored wallet — asserted on the
 *   object handed to the debit.
 * Arrange: two sub-cases — (a) user_id set, organization_id null; (b) organization_id set, user_id null.
 *   deps with a spied debit that succeeds.
 * Act:     debitForResponse over each arrangement.
 * Assert:  (a) wallet has userId, no organizationId key; (b) wallet has organizationId, no userId key.
 */
Deno.test("wallet composition — userId set yields userId only, mirrored yields organizationId only", async () => {
  // Arrange — case (a): user_id set, organization_id null
  {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        token_wallets: {
          select: { data: [buildTokenWalletRow({ user_id: "owner-1", organization_id: null })], error: null },
        },
      },
    });
    const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
    const debitSpy = spy(debitTokensFn);
    const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
    const params = buildDebitForResponseParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      walletId: "wallet-target-1",
    });
    const payload = buildDebitForResponsePayload();

    // Act
    await debitForResponse(deps, params, payload);

    // Assert
    const wallet = debitSpy.calls[0].args[0].wallet;
    assertEquals(wallet.userId, "owner-1");
    assertEquals("organizationId" in wallet, false);
  }

  // Arrange — case (b): organization_id set, user_id null
  {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        token_wallets: {
          select: { data: [buildTokenWalletRow({ user_id: null, organization_id: "org-1" })], error: null },
        },
      },
    });
    const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
    const debitSpy = spy(debitTokensFn);
    const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
    const params = buildDebitForResponseParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      walletId: "wallet-target-1",
    });
    const payload = buildDebitForResponsePayload();

    // Act
    await debitForResponse(deps, params, payload);

    // Assert
    const wallet = debitSpy.calls[0].args[0].wallet;
    assertEquals(wallet.organizationId, "org-1");
    assertEquals("userId" in wallet, false);
  }
});

/**
 * Contract: a response carrying a full token usage yields a debit call whose tokenUsage is those
 *   three counts as independent literals; a response carrying none yields null.
 * Arrange: two sub-cases — (a) aiResponse with tokenUsage { 10, 20, 30 }; (b) aiResponse with tokenUsage null.
 *   deps with a spied debit that succeeds.
 * Act:     debitForResponse over each arrangement.
 * Assert:  (a) debit params' tokenUsage is { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
 *   (b) debit params' tokenUsage is null.
 */
Deno.test("usage relayed — full usage passes three counts, none passes null", async () => {
  // Arrange — case (a): full token usage
  {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        token_wallets: {
          select: { data: [buildTokenWalletRow()], error: null },
        },
      },
    });
    const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
    const debitSpy = spy(debitTokensFn);
    const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
    const params = buildDebitForResponseParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      walletId: "wallet-target-1",
    });
    const payload = buildDebitForResponsePayload({
      aiResponse: buildUnifiedAIResponse({
        tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });

    // Act
    await debitForResponse(deps, params, payload);

    // Assert
    assertEquals(debitSpy.calls[0].args[0].tokenUsage, { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
  }

  // Arrange — case (b): no token usage
  {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        token_wallets: {
          select: { data: [buildTokenWalletRow()], error: null },
        },
      },
    });
    const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
    const debitSpy = spy(debitTokensFn);
    const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
    const params = buildDebitForResponseParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      walletId: "wallet-target-1",
    });
    const payload = buildDebitForResponsePayload({
      aiResponse: buildUnifiedAIResponse({ tokenUsage: null }),
    });

    // Act
    await debitForResponse(deps, params, payload);

    // Assert
    assertEquals(debitSpy.calls[0].args[0].tokenUsage, null);
  }
});

/**
 * Contract: a response whose tokenUsage is present but fails isTokenUsage returns the error arm
 *   whose error passes isDebitForResponseTokenUsageError, with no debit invoked.
 * Arrange: mock client returning a valid wallet; payload with aiResponse whose tokenUsage is present
 *   but missing total_tokens (valid UnifiedAIResponseTokenUsage, invalid TokenUsage); deps with a
 *   spied debit that would succeed.
 * Act:     debitForResponse over the malformed-usage arrangement.
 * Assert:  error arm; error is TokenUsageError; retriable is false; debit was never invoked.
 */
Deno.test("usage malformed — present but failing isTokenUsage returns TokenUsageError, no debit", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow()], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
    jobId: "job-distinct-1",
  });
  const payload = buildDebitForResponsePayload({
    aiResponse: buildUnifiedAIResponse({
      tokenUsage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
  });

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseErrorReturn(result));
  if (isDebitForResponseErrorReturn(result)) {
    assert(isDebitForResponseTokenUsageError(result.error));
    assertEquals(result.retriable, false);
  }
  assertEquals(debitSpy.calls.length, 0);
});

/**
 * Contract: a response carrying content yields an assistant message whose content is that string;
 *   a response whose content is null yields an assistant message whose content is the empty string
 *   and still reaches the debit — the case that proves an unbilled empty response is impossible.
 * Arrange: two sub-cases — (a) aiResponse with content "real content"; (b) aiResponse with content null.
 *   deps with a spied debit that calls databaseOperation and relays the result.
 * Act:     debitForResponse over each arrangement.
 * Assert:  (a) assistant message content is "real content"; (b) assistant message content is "".
 */
Deno.test("content recorded — string passes through, null becomes empty string, both reach debit", async () => {
  // Arrange — case (a): content is a string
  {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        token_wallets: {
          select: { data: [buildTokenWalletRow()], error: null },
        },
      },
    });
    const debitTokensFn: BoundDebitTokens = async (dp) => {
      const opResult = await dp.databaseOperation();
      return {
        result: {
          userMessage: opResult.userMessage,
          assistantMessage: opResult.assistantMessage,
        },
        transactionRecordedSuccessfully: true,
      };
    };
    const debitSpy = spy(debitTokensFn);
    const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
    const params = buildDebitForResponseParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      walletId: "wallet-target-1",
    });
    const payload = buildDebitForResponsePayload({
      aiResponse: buildUnifiedAIResponse({ content: "real content" }),
    });

    // Act
    await debitForResponse(deps, params, payload);

    // Assert
    const messages = await debitSpy.calls[0].args[0].databaseOperation();
    assertEquals(messages.assistantMessage.content, "real content");
  }

  // Arrange — case (b): content is null
  {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        token_wallets: {
          select: { data: [buildTokenWalletRow()], error: null },
        },
      },
    });
    const debitTokensFn: BoundDebitTokens = async (dp) => {
      const opResult = await dp.databaseOperation();
      return {
        result: {
          userMessage: opResult.userMessage,
          assistantMessage: opResult.assistantMessage,
        },
        transactionRecordedSuccessfully: true,
      };
    };
    const debitSpy = spy(debitTokensFn);
    const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
    const params = buildDebitForResponseParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      walletId: "wallet-target-1",
    });
    const payload = buildDebitForResponsePayload({
      aiResponse: buildUnifiedAIResponse({ content: null }),
    });

    // Act
    await debitForResponse(deps, params, payload);

    // Assert
    const messages = await debitSpy.calls[0].args[0].databaseOperation();
    assertEquals(messages.assistantMessage.content, "");
  }
});

/**
 * Contract: the assistant message's response_to_message_id equals the user message's id, both messages
 *   carry ai_provider_id from the provider row and user_id from the owner id, and all four date members
 *   carry one identical value.
 * Arrange: mock client returning a valid wallet; deps with a spied debit that calls databaseOperation
 *   and relays the result.
 * Act:     debitForResponse over the valid arrangement.
 * Assert:  assistant.response_to_message_id equals user.id; both ai_provider_id equal providerRow.id;
 *   both user_id equal projectOwnerUserId; user.created_at == user.updated_at == assistant.created_at == assistant.updated_at.
 */
Deno.test("message linkage — assistant response_to equals user id, shared provider, owner, and timestamp", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow()], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async (dp) => {
    const opResult = await dp.databaseOperation();
    return {
      result: {
        userMessage: opResult.userMessage,
        assistantMessage: opResult.assistantMessage,
      },
      transactionRecordedSuccessfully: true,
    };
  };
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const providerRow = buildMockProvider();
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
    projectOwnerUserId: "owner-distinct-1",
    providerRow,
  });
  const payload = buildDebitForResponsePayload();

  // Act
  await debitForResponse(deps, params, payload);

  // Assert
  const messages = await debitSpy.calls[0].args[0].databaseOperation();
  assertEquals(messages.assistantMessage.response_to_message_id, messages.userMessage.id);
  assertEquals(messages.userMessage.ai_provider_id, providerRow.id);
  assertEquals(messages.assistantMessage.ai_provider_id, providerRow.id);
  assertEquals(messages.userMessage.user_id, "owner-distinct-1");
  assertEquals(messages.assistantMessage.user_id, "owner-distinct-1");
  assertEquals(messages.userMessage.created_at, messages.userMessage.updated_at);
  assertEquals(messages.assistantMessage.created_at, messages.userMessage.created_at);
  assertEquals(messages.assistantMessage.updated_at, messages.userMessage.created_at);
});

/**
 * Contract: relatedEntityId is params.jobId, modelConfig is params.modelConfig, userId is
 *   params.projectOwnerUserId, and the params object carries no chatId key.
 * Arrange: mock client returning a valid wallet; deps with a spied debit that succeeds.
 * Act:     debitForResponse over the valid arrangement.
 * Assert:  debit params' relatedEntityId is params.jobId; modelConfig is params.modelConfig;
 *   userId is params.projectOwnerUserId; no chatId key in debit params.
 */
Deno.test("debit params — relatedEntityId is jobId, modelConfig and userId are params', no chatId", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow()], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const modelConfig = buildExtendedModelConfig();
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    jobId: "job-distinct-1",
    walletId: "wallet-target-1",
    projectOwnerUserId: "owner-distinct-1",
    modelConfig,
  });
  const payload = buildDebitForResponsePayload();

  // Act
  await debitForResponse(deps, params, payload);

  // Assert
  const dp = debitSpy.calls[0].args[0];
  assertEquals(dp.relatedEntityId, "job-distinct-1");
  assertEquals(dp.modelConfig, modelConfig);
  assertEquals(dp.userId, "owner-distinct-1");
  assertEquals("chatId" in dp, false);
});

/**
 * Contract: a debitTokens returning its error arm returns this module's error arm carrying that
 *   exact error instance and its retriable unchanged, proving propagation rather than re-wrapping.
 * Arrange: mock client returning a valid wallet; deps with a spied debit that returns a specific error.
 * Act:     debitForResponse over the debit-failed arrangement.
 * Assert:  error arm; error is the exact same instance; retriable is the debit's retriable.
 */
Deno.test("debit failed — error arm carries the exact error instance and its retriable unchanged", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow()], error: null },
      },
    },
  });
  const debitError = new Error("downstream debit failure");
  const debitTokensFn: BoundDebitTokens = async () =>
    buildDebitTokensError({ error: debitError, retriable: true });
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseErrorReturn(result));
  if (isDebitForResponseErrorReturn(result)) {
    assertEquals(result.error, debitError);
    assertEquals(result.retriable, true);
  }
});

/**
 * Contract: a debitTokens returning its success arm returns the success arm.
 * Arrange: mock client returning a valid wallet; deps with a spied debit that returns success.
 * Act:     debitForResponse over the debit-succeeded arrangement.
 * Assert:  success arm.
 */
Deno.test("debit succeeded — success arm", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow()], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    walletId: "wallet-target-1",
  });
  const payload = buildDebitForResponsePayload();

  // Act
  const result = await debitForResponse(deps, params, payload);

  // Assert
  assert(isDebitForResponseSuccessReturn(result));
});

/**
 * Contract: neither the params object nor the payload object is mutated by any path.
 * Arrange: params with distinct values; payload with content and tokenUsage;
 *   mock client returning a valid wallet; deps with a spied debit that succeeds.
 * Act:     debitForResponse over the purity-test arrangement.
 * Assert:  params members unchanged; payload members unchanged.
 */
Deno.test("purity — params and payload are not mutated", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      token_wallets: {
        select: { data: [buildTokenWalletRow()], error: null },
      },
    },
  });
  const debitTokensFn: BoundDebitTokens = async () => buildDebitTokensSuccess();
  const debitSpy = spy(debitTokensFn);
  const deps = buildDebitForResponseDeps({ debitTokens: debitSpy });
  const params = buildDebitForResponseParams({
    dbClient: client as unknown as SupabaseClient<Database>,
    jobId: "job-distinct-1",
    walletId: "wallet-target-1",
    projectOwnerUserId: "owner-distinct-1",
  });
  const payload = buildDebitForResponsePayload({
    aiResponse: buildUnifiedAIResponse({
      content: "purity test",
      tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
  });
  const paramsSnapshot = {
    jobId: params.jobId,
    walletId: params.walletId,
    projectOwnerUserId: params.projectOwnerUserId,
  };
  const payloadSnapshot = {
    content: payload.aiResponse.content,
    tokenUsage: payload.aiResponse.tokenUsage,
  };

  // Act
  await debitForResponse(deps, params, payload);

  // Assert
  assertEquals(params.jobId, paramsSnapshot.jobId);
  assertEquals(params.walletId, paramsSnapshot.walletId);
  assertEquals(params.projectOwnerUserId, paramsSnapshot.projectOwnerUserId);
  assertEquals(payload.aiResponse.content, payloadSnapshot.content);
  assertEquals(payload.aiResponse.tokenUsage, payloadSnapshot.tokenUsage);
});
