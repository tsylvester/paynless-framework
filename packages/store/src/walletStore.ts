import { create, StoreApi } from 'zustand';
import {
  TokenWallet,
  TokenWalletTransaction,
  ApiError as ApiErrorType,
  PurchaseRequest,
  PaymentInitiationResult,
  WalletDecisionOutcome,
  WalletDecisionContext,
  // Ensure org_token_usage_policy_enum is available if directly used, or rely on Organization type
} from '@paynless/types';
import { api } from '@paynless/api'; // Uncommented for action implementation
import { useOrganizationStore } from './organizationStore'; // For accessing organization details
import { useAiStore } from './aiStore'; // For newChatContext
import { useAuthStore } from './authStore'; // For user consent (future)

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
  determineChatWallet: () => WalletDecisionOutcome; // Added new selector
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

  determineChatWallet: (): WalletDecisionOutcome => {
    const newChatContextOrgId = useAiStore.getState().newChatContext;
    const organizationDetails = useOrganizationStore.getState().currentOrganizationDetails;
    const isOrgDetailsLoading = useOrganizationStore.getState().isLoading; // Assuming isLoading refers to current org details

    // TODO: Integrate user consent from authStore or localStorage in a later step
    // const userConsentForOrg = useAuthStore.getState().profile?.org_token_consents?.[newChatContextOrgId ?? ''];

    if (isOrgDetailsLoading && newChatContextOrgId) {
      return { outcome: 'loading' };
    }

    if (!newChatContextOrgId) {
      return { outcome: 'use_personal_wallet' };
    }

    // At this point, newChatContextOrgId is not null
    const orgId = newChatContextOrgId;

    if (!organizationDetails || organizationDetails.id !== orgId) {
      // This can happen if org details are for a different org or not loaded yet for the specific context
      // If isOrgDetailsLoading was false, it means we don't have the details for *this* orgId.
      // This scenario should ideally be handled by ensuring organizationDetails are loaded for newChatContextOrgId.
      // For now, treat as an error or a specific loading state if a fetch is triggered.
      // However, the UI should typically ensure that if newChatContextOrgId is set, its details are loaded or loading.
      return { outcome: 'error', message: `Organization details for ${orgId} not available or not matching context.` };
    }

    const orgTokenPolicy = organizationDetails.token_usage_policy;

    if (orgTokenPolicy === 'organization_tokens') {
      // Phase 1: Org wallets not yet available from walletStore for balance display or debit.
      // So, even if policy is 'organization_tokens', we can't use them yet client-side for debit.
      // The backend will handle the debit correctly if an orgId is passed.
      // For UI (ChatAffordabilityIndicator), this means we can't show org balance.
      // For sendMessage, this means we should inform the user.
      return { outcome: 'org_wallet_not_available_policy_org', orgId };
    }

    if (orgTokenPolicy === 'member_tokens') {
      // Here, we'd check for user consent in a subsequent step.
      // For Phase 1, we'll assume consent or proceed to ask for it.
      // This outcome will trigger the consent flow.
      // For now, let's return a more specific outcome that implies consent is the next step.
      return { outcome: 'user_consent_required', orgId }; 
      // This will be refined to: { outcome: 'use_personal_wallet_for_org', orgId } once consent is given.
    }
    
    // Fallback or unexpected policy value
    return { outcome: 'error', message: `Unexpected token usage policy: ${orgTokenPolicy}` };
  },

  loadWallet: async (organizationId?: string | null) => {
    set({ isLoadingWallet: true, walletError: null });
    console.log('[WalletStore loadWallet] Initiating fetch', { organizationId }); // Log initiation
    try {
      const response = await api.wallet().getWalletInfo(organizationId);
      console.log('[WalletStore loadWallet] API response received:', response); // Log raw API response

      if (response.error) {
        const errorToSet: ApiErrorType = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || 'Failed to fetch wallet', code: 'UNKNOWN_API_ERROR' }; 
        console.log('[WalletStore loadWallet] Setting error state:', errorToSet);
        set({ isLoadingWallet: false, walletError: errorToSet, currentWallet: null });
      } else {
        // response.data is now directly TokenWallet | null, not { data: TokenWallet | null }
        const walletData = response.data;
        console.log('[WalletStore loadWallet] API success. response.data (should be TokenWallet | null):', walletData);
        console.log('[WalletStore loadWallet] Wallet balance from walletData?.balance:', walletData?.balance);
        
        const walletToSet = walletData && typeof walletData === 'object' && 'walletId' in walletData ? walletData : null;
        console.log('[WalletStore loadWallet] Wallet object being set to store:', walletToSet);

        set({
          isLoadingWallet: false,
          currentWallet: walletToSet, // Set the wallet object or null
          walletError: null,
        });
        console.log('[WalletStore loadWallet] State SET with wallet. currentWallet?.balance should now be:', walletToSet?.balance);
      }
    } catch (error: unknown) {
      const networkError = { message: error instanceof Error ? error.message : 'An unknown network error occurred', code: 'NETWORK_ERROR' };
      console.log('[WalletStore loadWallet] Setting catch error state:', networkError, error);
      set({
        walletError: networkError,
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
    } catch (error: unknown) {
      set({
        walletError: { message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching history', code: 'NETWORK_ERROR' },
        isLoadingHistory: false,
        transactionHistory: [],
      });
    }
  },

  initiatePurchase: async (request: PurchaseRequest) => {
    set({ isLoadingPurchase: true, purchaseError: null });
    try {
      const response = await api.wallet().initiateTokenPurchase(request);

      // Case 1: The API call itself failed (e.g., network error, 500 from gateway function before returning PaymentInitiationResult)
      if (response.error) {
        const errorToSet: ApiErrorType = 
          response.error && typeof response.error.message === 'string' // response.error is already ApiErrorType
          ? response.error 
          : { message: String(response.error) || 'Failed to initiate purchase due to API error', code: 'UNKNOWN_API_ERROR' }; 
        set({ purchaseError: errorToSet, isLoadingPurchase: false });
        return null; // Return null as PaymentInitiationResult is not available
      }

      // Case 2: API call was successful, but response.data is unexpectedly null or undefined
      if (response.data === null || response.data === undefined) {
        set({
          purchaseError: { message: 'Failed to initiate purchase: No initiation data returned from API', code: 'NO_DATA_FROM_API' },
          isLoadingPurchase: false,
        });
        return null; // Return null as PaymentInitiationResult is not available
      }

      // Case 3: API call was successful and returned PaymentInitiationResult in response.data
      // Now, check the contents of PaymentInitiationResult
      const initiationResult = response.data;
      if (!initiationResult.success) {
        // Payment initiation failed, use error from initiationResult if available
        set({
          purchaseError: { 
            message: initiationResult.error || 'Payment initiation failed for an unknown reason.', 
            code: 'PAYMENT_INITIATION_FAILED' 
          },
          isLoadingPurchase: false,
        });
        return initiationResult; // Still return the result, as it might contain useful info like transactionId
      }
      
      // Payment initiation was successful according to the gateway
      set({ isLoadingPurchase: false, purchaseError: null });
      return initiationResult; // Return the successful PaymentInitiationResult

    } catch (error: unknown) { // Catch errors from the api.wallet().initiateTokenPurchase() call itself
      set({
        purchaseError: { message: error instanceof Error ? error.message : 'An unknown network error occurred during purchase initiation', code: 'NETWORK_CATCH_ERROR' },
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