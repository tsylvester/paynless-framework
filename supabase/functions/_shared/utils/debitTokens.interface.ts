import type { ILogger } from "../types.ts";
import { IAdminTokenWalletService } from "../services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import type { TokenWallet } from "../types/tokenWallet.types.ts";
import type { AiModelExtendedConfig, TokenUsage } from "../types.ts";
import type { ChatMessageRow } from "../types.ts";

export interface DebitTokensDeps {
    logger: ILogger;
    tokenWalletService: IAdminTokenWalletService;
}

export interface DebitTokensParams {
    wallet: TokenWallet;
    tokenUsage: TokenUsage | null;
    modelConfig: AiModelExtendedConfig;
    userId: string;
    chatId?: string;
    relatedEntityId: string;
    databaseOperation: () => Promise<{ userMessage: ChatMessageRow, assistantMessage: ChatMessageRow }>;
}

export interface DebitTokensPayload {}

export type DebitTokensReturn = DebitTokensSuccess | DebitTokensError;

export type DebitTokensError = {
    error: Error;
    retriable: boolean;
};

export type DebitTokensSuccess = {
    result: {
        userMessage: ChatMessageRow;
        assistantMessage: ChatMessageRow;
    };
    transactionRecordedSuccessfully: true;
};

export type DebitTokens = (
    deps: DebitTokensDeps,
    params: DebitTokensParams,
    payload: DebitTokensPayload
) => Promise<DebitTokensReturn>;
