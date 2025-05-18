import { create, StoreApi } from 'zustand';
import {
  TokenWallet,
  TokenWalletTransaction,
  ApiError as ApiErrorType,
  PurchaseRequest,
  PaymentInitiationResult,
} from '@paynless/types';
import { api } from '@paynless/api'; // Uncommented for action implementation

export interface WalletStateValues {
  currentWallet: TokenWallet | null;
  transactionHistory: TokenWalletTransaction[];
  isLoadingWallet: boolean;
  isLoadingHistory: boolean;
  isLoadingPurchase: boolean;
  walletError: ApiErrorType | null;
  purchaseError: ApiErrorType | null;
}

export interface WalletActions {
  loadWallet: (organizationId?: string | null) => Promise<void>;
  loadTransactionHistory: (
    organizationId?: string | null,
    limit?: number,
    offset?: number
  ) => Promise<void>;
  initiatePurchase: (request: PurchaseRequest) => Promise<PaymentInitiationResult | null>;
  _resetForTesting: () => void; // For test cleanup
}

export interface WalletSelectors {
  selectCurrentWalletBalance: () => string;
  selectWalletTransactions: () => TokenWalletTransaction[];
}

export type WalletStore = WalletStateValues & WalletActions & WalletSelectors;

export const initialWalletStateValues: WalletStateValues = {
  currentWallet: null,
  transactionHistory: [],
  isLoadingWallet: false,
  isLoadingHistory: false,
  isLoadingPurchase: false,
  walletError: null,
  purchaseError: null,
};

export const useWalletStore = create<WalletStore>((set, get) => ({
  ...initialWalletStateValues,

  selectCurrentWalletBalance: () => {
    const { currentWallet } = get();
    return currentWallet?.balance || '0';
  },

  selectWalletTransactions: () => {
    return get().transactionHistory;
  },

  loadWallet: async (organizationId?: string | null) => {
    set({ isLoadingWallet: true, walletError: null });
    try {
      const response = await api.wallet().getWalletInfo(organizationId);

      if (response.error) {
        const errorToSet: ApiErrorType = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || 'Failed to fetch wallet', code: 'UNKNOWN_API_ERROR' }; 
        set({ currentWallet: null, walletError: errorToSet, isLoadingWallet: false });
        return;
      }

      if (response.data === null || response.data === undefined) {
        set({
          currentWallet: null,
          walletError: { message: 'Failed to fetch wallet: No data returned', code: 'NOT_FOUND' },
          isLoadingWallet: false,
        });
        return;
      }

      set({ currentWallet: response.data, isLoadingWallet: false, walletError: null });
    } catch (error: any) {
      set({
        walletError: { message: error?.message || 'An unknown network error occurred', code: 'NETWORK_ERROR' },
        isLoadingWallet: false,
        currentWallet: null,
      });
    }
  },

  loadTransactionHistory: async (
    organizationId?: string | null,
    limit?: number,
    offset?: number
  ) => {
    set({ isLoadingHistory: true, walletError: null, transactionHistory: [] }); // Reset history on new load
    try {
      const response = await api.wallet().getWalletTransactionHistory(organizationId, limit, offset);

      if (response.error) {
        const errorToSet: ApiErrorType = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || 'Failed to fetch transaction history', code: 'UNKNOWN_API_ERROR' }; 
        set({ walletError: errorToSet, isLoadingHistory: false, transactionHistory: [] });
        return;
      }

      if (response.data === null || response.data === undefined) {
        set({
          transactionHistory: [],
          walletError: { message: 'Failed to fetch transaction history: No data returned', code: 'NOT_FOUND' },
          isLoadingHistory: false,
        });
        return;
      }
      // Ensure data is an array, even if it's empty, it's a valid response.
      set({ transactionHistory: response.data || [], isLoadingHistory: false, walletError: null });
    } catch (error: any) {
      set({
        walletError: { message: error?.message || 'An unknown network error occurred while fetching history', code: 'NETWORK_ERROR' },
        isLoadingHistory: false,
        transactionHistory: [],
      });
    }
  },

  initiatePurchase: async (request: PurchaseRequest) => {
    set({ isLoadingPurchase: true, purchaseError: null });
    try {
      const response = await api.wallet().initiateTokenPurchase(request);

      if (response.error) {
        const errorToSet: ApiErrorType = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || 'Failed to initiate purchase', code: 'UNKNOWN_API_ERROR' }; 
        set({ purchaseError: errorToSet, isLoadingPurchase: false });
        return null;
      }

      if (response.data === null || response.data === undefined) {
        set({
          purchaseError: { message: 'Failed to initiate purchase: No initiation data returned', code: 'NO_DATA' },
          isLoadingPurchase: false,
        });
        return null;
      }
      
      set({ isLoadingPurchase: false, purchaseError: null });
      return response.data; // This is PaymentInitiationResult
    } catch (error: any) {
      set({
        purchaseError: { message: error?.message || 'An unknown network error occurred during purchase initiation', code: 'NETWORK_ERROR' },
        isLoadingPurchase: false,
      });
      return null;
    }
  },

  _resetForTesting: () => {
    set(initialWalletStateValues);
  }
}));

// Utility to get initial state for testing, if needed outside the store itself for setup.
// This is different from the _resetForTesting method which acts on an existing store instance.
export const getWalletStoreInitialState = (): WalletStateValues => ({ ...initialWalletStateValues });

// Expose the store api for testing (e.g., for useWalletStore.setState mentioned in tests)
// This is not typically done for application code but can be useful for tests.
export const walletStoreApi: StoreApi<WalletStore> = useWalletStore; 