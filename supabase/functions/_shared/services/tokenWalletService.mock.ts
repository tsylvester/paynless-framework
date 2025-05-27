import { stub, type Stub } from 'jsr:@std/testing@0.225.1/mock';
import type { 
    ITokenWalletService, 
    TokenWallet, 
    TokenWalletTransaction,
    TokenWalletTransactionType
} from '../types/tokenWallet.types.ts';

// Define a type for the configuration of mock implementations
export type TokenWalletServiceMethodImplementations = {
  createWallet?: ITokenWalletService['createWallet'];
  getWallet?: ITokenWalletService['getWallet'];
  getWalletForContext?: ITokenWalletService['getWalletForContext'];
  getBalance?: ITokenWalletService['getBalance'];
  recordTransaction?: ITokenWalletService['recordTransaction'];
  checkBalance?: ITokenWalletService['checkBalance'];
  getTransactionHistory?: ITokenWalletService['getTransactionHistory'];
};

const getMockTokenWalletServiceInternalDefaults = (): Required<TokenWalletServiceMethodImplementations> => ({
    createWallet: (_userId?: string, _organizationId?: string): Promise<TokenWallet> => { 
        const now = new Date();
        return Promise.resolve({
            walletId: 'dummy-wallet-id-default',
            userId: _userId || 'dummy-user-default',
            organizationId: _organizationId,
            balance: '1000',
            currency: 'AI_TOKEN',
            createdAt: now,
            updatedAt: now,
        } as TokenWallet);
    },
    getWallet: (_walletId: string): Promise<TokenWallet | null> => { 
        const now = new Date();
        return Promise.resolve({
            walletId: _walletId,
            userId: 'dummy-user-for-' + _walletId + '-default',
            balance: '500',
            currency: 'AI_TOKEN',
            createdAt: now,
            updatedAt: now,
        } as TokenWallet);
    },
    getWalletForContext: (_userId?: string, _organizationId?: string): Promise<TokenWallet | null> => { 
        const now = new Date();
        if (!_userId && !_organizationId) return Promise.resolve(null);
        return Promise.resolve({
            walletId: `dummy-wallet-ctx-${_userId || _organizationId}-default`,
            userId: _userId,
            organizationId: _organizationId,
            balance: '2000',
            currency: 'AI_TOKEN',
            createdAt: now,
            updatedAt: now,
        } as TokenWallet);
    },
    getBalance: (_walletId: string): Promise<string> => { 
        return Promise.resolve('750'); 
    },
    recordTransaction: (params: { walletId: string; type: TokenWalletTransactionType; amount: string; recordedByUserId: string; relatedEntityId?: string; relatedEntityType?: string; notes?: string; }): Promise<TokenWalletTransaction> => { 
        const now = new Date();
        return Promise.resolve({
            transactionId: 'dummy-txn-default-' + Date.now(),
            walletId: params.walletId,
            type: params.type,
            amount: params.amount,
            balanceAfterTxn: '100', // Dummy value
            recordedByUserId: params.recordedByUserId,
            relatedEntityId: params.relatedEntityId,
            relatedEntityType: params.relatedEntityType,
            notes: params.notes,
            timestamp: now,
        } as TokenWalletTransaction);
    },
    checkBalance: (_walletId: string, _amountToSpend: string): Promise<boolean> => { 
        return Promise.resolve(parseFloat(_amountToSpend) <= 1000); // Default logic
    },
    getTransactionHistory: (_walletId: string, _limit?: number, _offset?: number): Promise<TokenWalletTransaction[]> => { 
        return Promise.resolve([]); 
    }
});

export interface MockTokenWalletService {
  instance: ITokenWalletService;
  stubs: {
    createWallet: Stub<ITokenWalletService, Parameters<ITokenWalletService['createWallet']>, ReturnType<ITokenWalletService['createWallet']>>;
    getWallet: Stub<ITokenWalletService, Parameters<ITokenWalletService['getWallet']>, ReturnType<ITokenWalletService['getWallet']>>;
    getWalletForContext: Stub<ITokenWalletService, Parameters<ITokenWalletService['getWalletForContext']>, ReturnType<ITokenWalletService['getWalletForContext']>>;
    getBalance: Stub<ITokenWalletService, Parameters<ITokenWalletService['getBalance']>, ReturnType<ITokenWalletService['getBalance']>>;
    recordTransaction: Stub<ITokenWalletService, Parameters<ITokenWalletService['recordTransaction']>, ReturnType<ITokenWalletService['recordTransaction']>>;
    checkBalance: Stub<ITokenWalletService, Parameters<ITokenWalletService['checkBalance']>, ReturnType<ITokenWalletService['checkBalance']>>;
    getTransactionHistory: Stub<ITokenWalletService, Parameters<ITokenWalletService['getTransactionHistory']>, ReturnType<ITokenWalletService['getTransactionHistory']>>;
  };
  clearStubs: () => void;
}

export function createMockTokenWalletService(
  config: TokenWalletServiceMethodImplementations = {}
): MockTokenWalletService {
  // Get default implementations
  const defaults = getMockTokenWalletServiceInternalDefaults();

  // Create the actual instance. Its methods will initially be the defaults.
  // We will then stub these default methods, and the stubs will use either
  // the user's provided config function (which could be a spy) or the default.
  const mockServiceInstance: ITokenWalletService = {
    createWallet: defaults.createWallet,
    getWallet: defaults.getWallet,
    getWalletForContext: defaults.getWalletForContext,
    getBalance: defaults.getBalance,
    recordTransaction: defaults.recordTransaction,
    checkBalance: defaults.checkBalance,
    getTransactionHistory: defaults.getTransactionHistory,
  };
  
  // Create stubs. The third argument is the fake implementation.
  // This fake implementation will be the user's configured function (if any) or the default.
  const stubs = {
    createWallet: stub(mockServiceInstance, 'createWallet', config.createWallet || defaults.createWallet),
    getWallet: stub(mockServiceInstance, 'getWallet', config.getWallet || defaults.getWallet),
    getWalletForContext: stub(mockServiceInstance, 'getWalletForContext', config.getWalletForContext || defaults.getWalletForContext),
    getBalance: stub(mockServiceInstance, 'getBalance', config.getBalance || defaults.getBalance),
    recordTransaction: stub(mockServiceInstance, 'recordTransaction', config.recordTransaction || defaults.recordTransaction),
    checkBalance: stub(mockServiceInstance, 'checkBalance', config.checkBalance || defaults.checkBalance),
    getTransactionHistory: stub(mockServiceInstance, 'getTransactionHistory', config.getTransactionHistory || defaults.getTransactionHistory),
  };

  const clearStubs = () => {
    (Object.values(stubs) as Stub<any, any[], any>[]).forEach(s => {
      if (s && typeof s.restore === 'function' && !s.restored) {
        s.restore();
      }
    });

    // DO NOT Re-create instance or re-stub here. 
    // The original mockServiceInstance methods are restored by s.restore().
    // If a new set of stubs is needed, createMockTokenWalletService should be called again.
  };

  return {
    instance: mockServiceInstance,
    stubs,
    clearStubs,
  };
} 