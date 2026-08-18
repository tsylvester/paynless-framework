import type { DebitForResponseFn } from "./debitForResponse.interface.ts";
import {
  DebitForResponseWalletReadError,
  DebitForResponseWalletNotFoundError,
  DebitForResponseWalletCurrencyError,
  DebitForResponseWalletBalanceError,
  DebitForResponseTokenUsageError,
} from "./debitForResponse.interface.ts";
import type { DebitTokensParams, DebitTokensPayload } from "../../_shared/utils/debitTokens.interface.ts";
import { isDebitTokensError, isDebitTokensSuccess } from "../../_shared/utils/debitTokens.guard.ts";
import type { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import type { ChatMessageRow } from "../../_shared/types.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isTokenUsage } from "../../_shared/utils/type-guards/type_guards.chat.ts";

export const debitForResponse: DebitForResponseFn = async (deps, params, payload) => {
  // Wallet read — same explicit column list as the source block.
  const { data: walletRow, error: walletError } = await params.dbClient
    .from('token_wallets')
    .select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at')
    .eq('wallet_id', params.walletId)
    .single();

  // Four wallet branches — each condition returns its own typed error.
  // A driver error is an Error instance; a no-row PostgREST result yields a PostgresError plain object.
  if (walletError !== null && walletError instanceof Error) {
    return {
      error: new DebitForResponseWalletReadError({ walletId: params.walletId, driverMessage: walletError.message }),
      retriable: true,
    };
  }
  if (walletRow === null) {
    return {
      error: new DebitForResponseWalletNotFoundError({ walletId: params.walletId }),
      retriable: false,
    };
  }
  if (walletRow.currency !== 'AI_TOKEN') {
    return {
      error: new DebitForResponseWalletCurrencyError({ walletId: params.walletId, currency: walletRow.currency }),
      retriable: false,
    };
  }
  if (walletRow.balance === null) {
    return {
      error: new DebitForResponseWalletBalanceError({ walletId: params.walletId }),
      retriable: false,
    };
  }

  // Wallet composition — branch on null per optional member; no ternary defaults.
  let composedWallet: TokenWallet;
  if (walletRow.user_id !== null && walletRow.organization_id !== null) {
    composedWallet = {
      walletId: walletRow.wallet_id,
      userId: walletRow.user_id,
      organizationId: walletRow.organization_id,
      balance: walletRow.balance.toString(),
      currency: 'AI_TOKEN',
      createdAt: new Date(walletRow.created_at),
      updatedAt: new Date(walletRow.updated_at),
    };
  } else if (walletRow.user_id !== null) {
    composedWallet = {
      walletId: walletRow.wallet_id,
      userId: walletRow.user_id,
      balance: walletRow.balance.toString(),
      currency: 'AI_TOKEN',
      createdAt: new Date(walletRow.created_at),
      updatedAt: new Date(walletRow.updated_at),
    };
  } else if (walletRow.organization_id !== null) {
    composedWallet = {
      walletId: walletRow.wallet_id,
      organizationId: walletRow.organization_id,
      balance: walletRow.balance.toString(),
      currency: 'AI_TOKEN',
      createdAt: new Date(walletRow.created_at),
      updatedAt: new Date(walletRow.updated_at),
    };
  } else {
    composedWallet = {
      walletId: walletRow.wallet_id,
      balance: walletRow.balance.toString(),
      currency: 'AI_TOKEN',
      createdAt: new Date(walletRow.created_at),
      updatedAt: new Date(walletRow.updated_at),
    };
  }

  // Usage resolution — narrow via isTokenUsage; the assembler declares a weaker shape.
  // The local's type references the debit's declared field type rather than minting the union inline.
  let resolvedUsage: DebitTokensParams['tokenUsage'];
  const rawUsage: unknown = payload.aiResponse.tokenUsage;
  if (rawUsage === null || rawUsage === undefined) {
    resolvedUsage = null;
  } else if (isTokenUsage(rawUsage)) {
    resolvedUsage = rawUsage;
  } else {
    return {
      error: new DebitForResponseTokenUsageError({ jobId: params.jobId }),
      retriable: false,
    };
  }

  // Content resolution — two stated outcomes; no fallback expression.
  let resolvedContent: string;
  if (payload.aiResponse.content === null) {
    resolvedContent = '';
  } else {
    resolvedContent = payload.aiResponse.content;
  }

  // Serialized usage — round-trip through JSON, gated by isJson.
  // The local's type references the chat message row's declared field type rather than minting the union inline.
  let serializedUsage: ChatMessageRow['token_usage'];
  if (resolvedUsage === null) {
    serializedUsage = null;
  } else {
    const usageSerialized: string = JSON.stringify(resolvedUsage);
    const usageParsed: unknown = JSON.parse(usageSerialized);
    if (isJson(usageParsed)) {
      serializedUsage = usageParsed;
    } else {
      serializedUsage = null;
    }
  }

  // Database operation closure and debit — chatId omitted from DebitTokensParams.
  const nowIso: string = new Date().toISOString();
  const debitParams: DebitTokensParams = {
    wallet: composedWallet,
    tokenUsage: resolvedUsage,
    modelConfig: params.modelConfig,
    userId: params.projectOwnerUserId,
    relatedEntityId: params.jobId,
    databaseOperation: async () => {
      const userMessageId: string = crypto.randomUUID();
      const userMessage: ChatMessageRow = {
        id: userMessageId,
        chat_id: null,
        user_id: params.projectOwnerUserId,
        role: 'user',
        content: '[dialectic_execute_job]',
        is_active_in_thread: true,
        ai_provider_id: params.providerRow.id,
        system_prompt_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        error_type: null,
        response_to_message_id: null,
        token_usage: null,
      };
      const assistantMessage: ChatMessageRow = {
        id: crypto.randomUUID(),
        chat_id: null,
        role: 'assistant',
        content: resolvedContent,
        ai_provider_id: params.providerRow.id,
        system_prompt_id: null,
        token_usage: serializedUsage,
        is_active_in_thread: true,
        error_type: null,
        response_to_message_id: userMessageId,
        created_at: nowIso,
        updated_at: nowIso,
        user_id: params.projectOwnerUserId,
      };
      return { userMessage, assistantMessage };
    },
  };
  const debitPayload: DebitTokensPayload = {};
  const debitResult = await deps.debitTokens(debitParams, debitPayload);

  // Two debit branches — error propagated unchanged; success returns the success arm.
  if (isDebitTokensError(debitResult)) {
    return {
      error: debitResult.error,
      retriable: debitResult.retriable,
    };
  }
  if (isDebitTokensSuccess(debitResult)) {
    return { debited: true };
  }
  const exhaustive: never = debitResult;
  return exhaustive;
};
