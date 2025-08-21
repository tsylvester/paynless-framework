import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { createMockTokenWalletService, MockTokenWalletService } from "../_shared/services/tokenWalletService.mock.ts";
import { logger } from "../_shared/logger.ts";
import { debitTokens, DebitTokensDeps, DebitTokensParams } from './debitTokens.ts';
import { TokenWallet, ITokenWalletService } from "../_shared/types/tokenWallet.types.ts";
import { AiModelExtendedConfig, TokenUsage } from "../_shared/types.ts";

Deno.test('debitTokens: happy path - debit and db operation succeed', async () => {
    // Arrange
    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };
    
    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };
    const expectedResult = { data: 'DB operation successful' };
    const dbOperation = spy(() => Promise.resolve(expectedResult));

    const params: DebitTokensParams<typeof expectedResult> = {
        wallet,
        tokenUsage,
        modelConfig,
        userId: 'test-user',
        chatId: 'test-chat',
        databaseOperation: dbOperation,
        relatedEntityId: 'test-related-entity-id',
    };

    // Act
    const result = await debitTokens(deps, params);

    // Assert
    assertEquals(result, expectedResult);
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 1);
    assertEquals(dbOperation.calls.length, 1);
});

Deno.test('debitTokens: debit fails for insufficient funds', async () => {
    // Arrange
    const mockTokenWalletService = createMockTokenWalletService({
        recordTransaction: () => Promise.reject(new Error('Insufficient funds')),
    });
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };
    
    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    const tokenUsage: TokenUsage = { prompt_tokens: 1000, completion_tokens: 2000, total_tokens: 3000 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };
    const dbOperation = spy(() => Promise.resolve());

    const params: DebitTokensParams<void> = { 
        wallet, 
        tokenUsage, 
        modelConfig, 
        userId: 'test-user', 
        chatId: 'test-chat', 
        databaseOperation: dbOperation, 
        relatedEntityId: 'test-related-entity-id',
    };

    // Act & Assert
    await assertRejects(
        () => debitTokens(deps, params),
        Error,
        'Insufficient funds'
    );
    assertEquals(dbOperation.calls.length, 0);
});

Deno.test('debitTokens: rollback - debit succeeds, db operation fails', async () => {
    // Arrange
    const mockTokenWalletService = createMockTokenWalletService();
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };

    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };
    const dbError = new Error("DB insert failed");
    const dbOperation = spy(() => Promise.reject(dbError));

    const params: DebitTokensParams<void> = { 
        wallet, 
        tokenUsage, 
        modelConfig, 
        userId: 'test-user', 
        chatId: 'test-chat', 
        databaseOperation: dbOperation, 
        relatedEntityId: 'test-related-entity-id',
    };

    // Act & Assert
    await assertRejects(() => debitTokens(deps, params), Error, "DB insert failed");
    
    assertEquals(dbOperation.calls.length, 1);
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 2);
    
    const firstCall = mockTokenWalletService.stubs.recordTransaction.calls[0].args[0];
    assertEquals(firstCall.type, 'DEBIT_USAGE');

    const secondCall = mockTokenWalletService.stubs.recordTransaction.calls[1].args[0];
    assertEquals(secondCall.type, 'CREDIT_ADJUSTMENT');
    assert(secondCall.notes?.includes("Automatic refund"));
});


Deno.test('debitTokens: zero debit amount skips transaction but runs db op', async () => {
    // Arrange
    const mockTokenWalletService = createMockTokenWalletService();
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };
    
    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    const tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };
    const expectedResult = { data: 'DB op success with zero debit' };
    const dbOperation = spy(() => Promise.resolve(expectedResult));

    const params: DebitTokensParams<typeof expectedResult> = { 
        wallet, 
        tokenUsage, 
        modelConfig, 
        userId: 'test-user', 
        chatId: 'test-chat', 
        databaseOperation: dbOperation, 
        relatedEntityId: 'test-related-entity-id',
    };

    // Act
    const result = await debitTokens(deps, params);

    // Assert
    assertEquals(result, expectedResult);
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0);
    assertEquals(dbOperation.calls.length, 1);
});

Deno.test('debitTokens: handles message insert error from handleNormalPath', async () => {
    // Arrange
    const mockTokenWalletService = createMockTokenWalletService();
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };

    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    // Define token usage that will result in a debit
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };

    const dbError = new Error("Test: Message insert failed");
    const dbOperation = spy(() => Promise.reject(dbError));

    const params: DebitTokensParams<void> = {
        wallet,
        tokenUsage,
        modelConfig,
        userId: 'test-user',
        chatId: 'test-chat',
        databaseOperation: dbOperation,
        relatedEntityId: 'test-related-entity-id',
    };

    // Act & Assert
    await assertRejects(
        () => debitTokens(deps, params),
        Error,
        "Test: Message insert failed"
    );

    // Verify that a refund was issued
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 2);
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[0].args[0].type, 'DEBIT_USAGE');
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[1].args[0].type, 'CREDIT_ADJUSTMENT');
});

Deno.test('debitTokens: returns 500 if recordTransaction (debit) fails', async () => {
    // Arrange
    const debitErrorMessage = "Simulated DB error during token debit";
    const mockTokenWalletService = createMockTokenWalletService({
        recordTransaction: () => Promise.reject(new Error(debitErrorMessage)),
    });
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };

    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };
    const dbOperation = spy(() => Promise.resolve());

    const params: DebitTokensParams<void> = {
        wallet,
        tokenUsage,
        modelConfig,
        userId: 'test-user',
        chatId: 'test-chat',
        databaseOperation: dbOperation,
        relatedEntityId: 'test-related-entity-id',
    };

    // Act & Assert
    await assertRejects(
        () => debitTokens(deps, params),
        Error,
        debitErrorMessage
    );
    assertEquals(dbOperation.calls.length, 0);
});

Deno.test('debitTokens: handles message insert error from handleNormalPath', async () => {
    // Arrange
    const mockTokenWalletService = createMockTokenWalletService();
    const deps: DebitTokensDeps = { logger, tokenWalletService: mockTokenWalletService.instance };

    const wallet: TokenWallet = { walletId: 'test-wallet', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
    // Define token usage that will result in a debit
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig: AiModelExtendedConfig = { 
        api_identifier: 'test-model',
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
        },
    };

    const dbError = new Error("Test: Message insert failed");
    const dbOperation = spy(() => Promise.reject(dbError));

    const params: DebitTokensParams<void> = {
        wallet,
        tokenUsage,
        modelConfig,
        userId: 'test-user',
        chatId: 'test-chat',
        databaseOperation: dbOperation,
        relatedEntityId: 'test-related-entity-id',
    };

    // Act & Assert
    await assertRejects(
        () => debitTokens(deps, params),
        Error,
        "Test: Message insert failed"
    );

    // Verify that a refund was issued
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 2);
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[0].args[0].type, 'DEBIT_USAGE');
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[1].args[0].type, 'CREDIT_ADJUSTMENT');
});









