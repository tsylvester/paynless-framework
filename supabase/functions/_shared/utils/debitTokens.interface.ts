import type { ILogger } from "../types.ts";
import type { ITokenWalletService } from "../types/tokenWallet.types.ts";
import type { TokenWallet } from "../types/tokenWallet.types.ts";
import type { AiModelExtendedConfig, TokenUsage } from "../types.ts";
import type { ChatMessageInsert } from "../types.ts";

export interface DebitTokensDeps {
    logger: ILogger;
    tokenWalletService: ITokenWalletService;
}

export interface DebitTokensParams {
    wallet: TokenWallet;
    tokenUsage: TokenUsage | null;
    modelConfig: AiModelExtendedConfig;
    userId: string;
    chatId?: string;
    relatedEntityId: string;
    databaseOperation: () => Promise<{ userMessage: ChatMessageInsert, assistantMessage: ChatMessageInsert }>;
}

export interface DebitTokensPayload {}

export type DebitTokensReturn = DebitTokensSuccess | DebitTokensError;

export type DebitTokensError = {
    error: Error;
    retriable: boolean;
};

export type DebitTokensSuccess = {
    result: {
        userMessage: ChatMessageInsert;
        assistantMessage: ChatMessageInsert;
    };
    transactionRecordedSuccessfully: true;
};

export type DebitTokens = (
    deps: DebitTokensDeps,
    params: DebitTokensParams,
    payload: DebitTokensPayload
) => Promise<DebitTokensReturn>;
