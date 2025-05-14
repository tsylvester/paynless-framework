import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { 
    ITokenWalletService, 
    TokenWallet, 
    TokenWalletTransaction,
    TokenWalletTransactionType
} from '../types/tokenWallet.types.ts';

// Define a dummy class that implements the interface with placeholder methods
class DummyTokenWalletService implements ITokenWalletService {
    createWallet(_userId?: string, _organizationId?: string): Promise<TokenWallet> { 
        return Promise.resolve({ walletId: 'dummy', userId: _userId, balance: '0', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() } as TokenWallet); 
    }
    getWallet(_walletId: string): Promise<TokenWallet | null> { 
        return Promise.resolve(null); 
    }
    getWalletForContext(_userId?: string, _organizationId?: string): Promise<TokenWallet | null> { 
        return Promise.resolve(null); 
    }
    getBalance(_walletId: string): Promise<string> { 
        return Promise.resolve('0'); 
    }
    recordTransaction(params: { walletId: string; type: TokenWalletTransactionType; amount: string; recordedByUserId: string; relatedEntityId?: string; relatedEntityType?: string; notes?: string; }): Promise<TokenWalletTransaction> { 
        return Promise.resolve({ transactionId: 'dummy-txn', walletId: params.walletId, type: params.type, amount: params.amount, balanceAfterTxn: '0', recordedByUserId: params.recordedByUserId, timestamp: new Date() } as TokenWalletTransaction); 
    }
    checkBalance(_walletId: string, _amountToSpend: string): Promise<boolean> { 
        return Promise.resolve(false); 
    }
    getTransactionHistory(_walletId: string, _limit?: number, _offset?: number): Promise<TokenWalletTransaction[]> { 
        return Promise.resolve([]); 
    }
}

// Define a type for the structure of the mocked service, exposing stubs
export interface MockTokenWalletService extends ITokenWalletService {
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

export function createMockTokenWalletService(): MockTokenWalletService {
  const dummyInstance = new DummyTokenWalletService();
  
  const stubs = {
    createWallet: stub(dummyInstance, 'createWallet'),
    getWallet: stub(dummyInstance, 'getWallet'),
    getWalletForContext: stub(dummyInstance, 'getWalletForContext'),
    getBalance: stub(dummyInstance, 'getBalance'),
    recordTransaction: stub(dummyInstance, 'recordTransaction'),
    checkBalance: stub(dummyInstance, 'checkBalance'),
    getTransactionHistory: stub(dummyInstance, 'getTransactionHistory'),
  };

  const clearStubs = () => {
    stubs.createWallet.restore(); 
    stubs.createWallet = stub(dummyInstance, 'createWallet');

    stubs.getWallet.restore();
    stubs.getWallet = stub(dummyInstance, 'getWallet');

    stubs.getWalletForContext.restore();
    stubs.getWalletForContext = stub(dummyInstance, 'getWalletForContext');
    
    stubs.getBalance.restore();
    stubs.getBalance = stub(dummyInstance, 'getBalance');

    stubs.recordTransaction.restore();
    stubs.recordTransaction = stub(dummyInstance, 'recordTransaction');

    stubs.checkBalance.restore();
    stubs.checkBalance = stub(dummyInstance, 'checkBalance');

    stubs.getTransactionHistory.restore();
    stubs.getTransactionHistory = stub(dummyInstance, 'getTransactionHistory');
  };

  return {
    createWallet: (...args) => stubs.createWallet(...args),
    getWallet: (...args) => stubs.getWallet(...args),
    getWalletForContext: (...args) => stubs.getWalletForContext(...args),
    getBalance: (...args) => stubs.getBalance(...args),
    recordTransaction: (...args) => stubs.recordTransaction(...args),
    checkBalance: (...args) => stubs.checkBalance(...args),
    getTransactionHistory: (...args) => stubs.getTransactionHistory(...args),
    stubs,
    clearStubs,
  };
} 