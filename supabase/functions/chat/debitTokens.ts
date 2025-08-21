import { ILogger, TokenUsage } from "../_shared/types.ts";
import { ITokenWalletService, TokenWallet, TokenWalletTransactionType } from "../_shared/types/tokenWallet.types.ts";
import { calculateActualChatCost } from "../_shared/utils/cost_utils.ts";
import { AiModelExtendedConfig } from "../_shared/types.ts";
import { TokenUsageSchema } from "./zodSchema.ts";

export interface DebitTokensDeps {
    logger: ILogger;
    tokenWalletService: ITokenWalletService;
}

export interface DebitTokensParams<T> {
    wallet: TokenWallet;
    tokenUsage: TokenUsage | null;
    modelConfig: AiModelExtendedConfig;
    userId: string;
    chatId?: string;
    relatedEntityId: string;
    databaseOperation: () => Promise<T>;
}

export async function debitTokens<T>(
    { logger, tokenWalletService }: DebitTokensDeps,
    {
        wallet,
        tokenUsage,
        modelConfig,
        userId,
        chatId,
        relatedEntityId,
        databaseOperation,
    }: DebitTokensParams<T>
): Promise<T> {
    let transactionRecordedSuccessfully = false;
    const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(tokenUsage);
    if (!parsedTokenUsage.success) {
        logger.error('Failed to parse token_usage from adapter.', { error: parsedTokenUsage.error, payload: tokenUsage });
        throw new Error('Received invalid token usage data from AI provider.');
    }
    const tokenUsageFromAdapter = parsedTokenUsage.data;
    
    if (!tokenUsageFromAdapter) {
        logger.info('Token usage data is null or invalid; debit calculation and operation will be skipped.');
        return await databaseOperation();
    }
    
    const actualTokensToDebit = calculateActualChatCost(tokenUsageFromAdapter, modelConfig, logger);

    if (actualTokensToDebit > 0) {
        logger.info('Attempting to record token transaction (debit) BEFORE executing database operation.', { 
            walletId: wallet.walletId, 
            actualTokensToDebit,
        });
        try {
            const debitType: TokenWalletTransactionType = 'DEBIT_USAGE';
            const notes = chatId
                ? `Token usage for chat message in chat ${chatId}. Model: ${modelConfig?.api_identifier || 'unknown'}. Input Tokens: ${tokenUsageFromAdapter?.prompt_tokens || 0}, Output Tokens: ${tokenUsageFromAdapter?.completion_tokens || 0}.`
                : `Token usage for headless job (e.g., Dialectic). Model: ${modelConfig?.api_identifier || 'unknown'}. Input Tokens: ${tokenUsageFromAdapter?.prompt_tokens || 0}, Output Tokens: ${tokenUsageFromAdapter?.completion_tokens || 0}.`;

            const transactionData = {
                walletId: wallet.walletId,
                type: debitType,
                amount: String(actualTokensToDebit),
                recordedByUserId: userId,
                idempotencyKey: crypto.randomUUID(),
                relatedEntityId: relatedEntityId,
                relatedEntityType: 'chat_message',
                notes: notes,
            };
            const transaction = await tokenWalletService.recordTransaction(transactionData);
            logger.info('Token transaction recorded (debit) successfully.', { transactionId: transaction.transactionId, walletId: wallet.walletId, amount: actualTokensToDebit });
            transactionRecordedSuccessfully = true;
        } catch (debitError: unknown) {
            const typedDebitError = debitError instanceof Error ? debitError : new Error(String(debitError));
            if (typedDebitError.message.includes('Insufficient funds') || typedDebitError.message.includes('new balance must be a non-negative integer')) {
                logger.warn('Insufficient funds for the actual cost of the AI operation.', { 
                    walletId: wallet.walletId, 
                    debitAmount: actualTokensToDebit,
                    error: typedDebitError.message
                });
                 throw new Error(`Insufficient funds for the actual cost of the AI operation. Your balance was not changed.`);
            }

            logger.error('CRITICAL: Failed to record token debit transaction. The database operation will NOT be attempted.', { 
                error: typedDebitError.message, 
                walletId: wallet.walletId, 
                actualTokensConsumed: actualTokensToDebit
            });
            throw typedDebitError;
        }
    } else {
        logger.warn('Calculated debit amount is zero or less, debit step will be skipped.', { tokenUsageFromAdapter, calculatedAmount: actualTokensToDebit });
        transactionRecordedSuccessfully = true; 
    }

    try {
        const result = await databaseOperation();
        return result;
    } catch (dbError) {
        const typedDbError = dbError instanceof Error ? dbError : new Error(String(dbError));
        logger.error('DATABASE ERROR during operation. This occurred after a successful debit.', {
            error: typedDbError.message,
            chatId: chatId,
            userId,
            tokensDebited: actualTokensToDebit
        });

        if (transactionRecordedSuccessfully && actualTokensToDebit > 0) {
            try {
                const creditType: TokenWalletTransactionType = 'CREDIT_ADJUSTMENT';
                const refundNotes = chatId
                    ? `Automatic refund for failed message persistence in chat ${chatId}. Original debit amount: ${actualTokensToDebit}.`
                    : `Automatic refund for failed message persistence in headless job. Original debit amount: ${actualTokensToDebit}.`;

                const refundTransactionData = {
                    walletId: wallet.walletId,
                    type: creditType,
                    amount: String(actualTokensToDebit),
                    recordedByUserId: userId, 
                    idempotencyKey: crypto.randomUUID(),
                    relatedEntityId: relatedEntityId,
                    relatedEntityType: 'chat_message',
                    notes: refundNotes,
                };
                await tokenWalletService.recordTransaction(refundTransactionData);
                logger.info('Successfully issued refund credit transaction.', {
                    walletId: wallet.walletId,
                    amount: actualTokensToDebit,
                });
            } catch (refundError) {
                logger.error('CRITICAL: FAILED TO ISSUE REFUND after DB persistence error. Wallet balance is likely incorrect.', {
                    walletId: wallet.walletId,
                    amountToRefund: actualTokensToDebit,
                    refundError: refundError instanceof Error ? refundError.message : String(refundError),
                });
            }
        }
        
        // Re-throw the original database error to the caller
        throw typedDbError;
    }
}

