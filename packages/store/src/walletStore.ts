import { create, StoreApi } from 'zustand';
import {
  TokenWallet,
  TokenWalletTransaction,
  ApiError,
  PurchaseRequest,
  PaymentInitiationResult,
  WalletDecisionOutcome,
  // Ensure org_token_usage_policy_enum is available if directly used, or rely on Organization type
} from '@paynless/types';
import { api } from '@paynless/api'; // Uncommented for action implementation
import { useOrganizationStore } from './organizationStore'; // For accessing organization details
import { useAiStore } from './aiStore'; // For newChatContext
import { logger } from '@paynless/utils'; // Added for logging

export interface WalletStateValues {
  personalWallet: TokenWallet | null;
  organizationWallets: { [orgId: string]: TokenWallet | null };
  transactionHistory: TokenWalletTransaction[];
  isLoadingPersonalWallet: boolean;
  isLoadingOrgWallet: { [orgId: string]: boolean };
  isLoadingHistory: boolean;
  isLoadingPurchase: boolean;
  personalWalletError: ApiError | null;
  orgWalletErrors: { [orgId: string]: ApiError | null };
  purchaseError: ApiError | null;
  userOrgTokenConsent: { [orgId: string]: boolean | null };
}

export interface WalletActions {
  loadPersonalWallet: () => Promise<void>;
  loadOrganizationWallet: (organizationId: string) => Promise<void>;
  getOrLoadOrganizationWallet: (organizationId: string) => Promise<TokenWallet | null>;
  loadTransactionHistory: (
    organizationId?: string | null,
    limit?: number,
    offset?: number
  ) => Promise<void>;
  initiatePurchase: (request: PurchaseRequest) => Promise<PaymentInitiationResult | null>;
  _resetForTesting: () => void; // For test cleanup
  determineChatWallet: () => WalletDecisionOutcome; // Kept here as it uses get() internally
  setUserOrgTokenConsent: (orgId: string, consent: boolean) => void;
  loadUserOrgTokenConsent: (orgId: string) => void;
  clearUserOrgTokenConsent: (orgId: string) => void;
}

export type WalletStore = WalletStateValues & WalletActions;

export const initialWalletStateValues: WalletStateValues = {
  personalWallet: null,
  organizationWallets: {},
  transactionHistory: [],
  isLoadingPersonalWallet: false,
  isLoadingOrgWallet: {},
  isLoadingHistory: false,
  isLoadingPurchase: false,
  personalWalletError: null,
  orgWalletErrors: {},
  purchaseError: null,
  userOrgTokenConsent: {},
};

const USER_ORG_TOKEN_CONSENT_KEY_PREFIX = 'user_org_token_consent_';

export const useWalletStore = create<WalletStore>((set, get) => ({
  ...initialWalletStateValues,

  setUserOrgTokenConsent: (orgId: string, consent: boolean) => {
    try {
      localStorage.setItem(`${USER_ORG_TOKEN_CONSENT_KEY_PREFIX}${orgId}`, JSON.stringify(consent));
    } catch (e) {
      console.error("Failed to save consent to localStorage", e);
    }
    set(state => ({
      userOrgTokenConsent: { ...state.userOrgTokenConsent, [orgId]: consent },
    }));
  },

  loadUserOrgTokenConsent: (orgId: string) => {
    let consentValue: boolean | null = null;
    try {
      const storedConsent = localStorage.getItem(`${USER_ORG_TOKEN_CONSENT_KEY_PREFIX}${orgId}`);
      if (storedConsent !== null) {
        consentValue = JSON.parse(storedConsent) as boolean;
      }
    } catch (e) {
      console.error("Failed to load consent from localStorage", e);
      // consentValue remains null
    }
    set(state => ({
      userOrgTokenConsent: { ...state.userOrgTokenConsent, [orgId]: consentValue },
    }));
  },

  clearUserOrgTokenConsent: (orgId: string) => {
    try {
      localStorage.removeItem(`${USER_ORG_TOKEN_CONSENT_KEY_PREFIX}${orgId}`);
    } catch (e) {
      console.error("Failed to remove consent from localStorage", e);
    }
    set(state => ({
      userOrgTokenConsent: { ...state.userOrgTokenConsent, [orgId]: null },
    }));
  },

  determineChatWallet: (): WalletDecisionOutcome => {
    logger.debug('[walletStore.determineChatWallet] Determining chat wallet...');
    const newChatContextOrgId = useAiStore.getState().newChatContext;
    
    const orgStoreState = useOrganizationStore.getState();
    const relevantOrgDetails = newChatContextOrgId ? orgStoreState.userOrganizations.find(org => org.id === newChatContextOrgId) : null;
    const currentConsentState = get().userOrgTokenConsent;

    logger.debug('[walletStore.determineChatWallet] Inputs:', {
      newChatContextOrgId,
      relevantOrgDetailsId: relevantOrgDetails?.id,
      relevantOrgNameFromDetails: relevantOrgDetails?.name,
      relevantOrgTokenPolicy: relevantOrgDetails?.token_usage_policy,
      isOrgStoreLoading: orgStoreState.isLoading, // General loading state of orgStore
      isCurrentOrgInStoreLoading: orgStoreState.currentOrganizationId === newChatContextOrgId && orgStoreState.isLoading,
      currentConsentStateForOrg: newChatContextOrgId ? currentConsentState[newChatContextOrgId] : 'N/A',
    });

    if (!newChatContextOrgId) {
      logger.debug('[walletStore.determineChatWallet] Outcome: use_personal_wallet (no org context)');
      return { outcome: 'use_personal_wallet' };
    }

    // If we have an org context, check if the specific details for THAT org are available and loaded.
    if (!relevantOrgDetails) {
        // If the orgStore is currently loading AND its currentOrganizationId has already been updated to our newChatContextOrgId,
        // then we are truly waiting for these specific details to populate.
        if (orgStoreState.currentOrganizationId === newChatContextOrgId && orgStoreState.isLoading) {
            logger.debug('[walletStore.determineChatWallet] Outcome: loading (orgStore currentOrganizationId matches newChatContextOrgId and orgStore is loading)', { orgId: newChatContextOrgId });
            return { outcome: 'loading' };
        }
        // Otherwise, the details are simply not found in the loaded userOrganizations list.
        // This could mean they haven't been fetched yet, or there's a mismatch.
        logger.warn('[walletStore.determineChatWallet] Relevant org details for newChatContextOrgId not found in userOrganizations. Outcome: error.', { orgId: newChatContextOrgId });
        return { outcome: 'error', message: `Organization details for ${newChatContextOrgId} are not available in the current list.` };
    }
    
    // At this point, relevantOrgDetails should be populated for the newChatContextOrgId.
    const orgTokenPolicy = relevantOrgDetails.token_usage_policy || 'member_tokens'; // Default to 'member_tokens' if null or undefined
    logger.debug('[walletStore.determineChatWallet] Org token policy for orgId:' + newChatContextOrgId + ' is ' + orgTokenPolicy);

    if (orgTokenPolicy === 'organization_tokens') {
      logger.debug('[walletStore.determineChatWallet] Outcome: org_wallet_not_available_policy_org (org policy is org_tokens)', { orgId: newChatContextOrgId });
      return { outcome: 'org_wallet_not_available_policy_org', orgId: newChatContextOrgId };
    }

    if (orgTokenPolicy === 'member_tokens') {
      const consentForOrg = currentConsentState[newChatContextOrgId];
      logger.debug('[walletStore.determineChatWallet] Org policy is member_tokens. Consent state for org:' + newChatContextOrgId + ' is ' + consentForOrg);
      
      if (consentForOrg === undefined) {
        logger.debug('[walletStore.determineChatWallet] Consent for org is undefined. Outcome: user_consent_required (pending load)', { orgId: newChatContextOrgId });
        return { outcome: 'user_consent_required', orgId: newChatContextOrgId }; 
      }
      
      if (consentForOrg === true) {
        logger.debug('[walletStore.determineChatWallet] Consent is true. Outcome: use_personal_wallet_for_org', { orgId: newChatContextOrgId });
        return { outcome: 'use_personal_wallet_for_org', orgId: newChatContextOrgId };
      } else if (consentForOrg === false) {
        logger.debug('[walletStore.determineChatWallet] Consent is false. Outcome: user_consent_refused', { orgId: newChatContextOrgId });
        return { outcome: 'user_consent_refused', orgId: newChatContextOrgId };
      } else { // consentForOrg is null
        logger.debug('[walletStore.determineChatWallet] Consent is null. Outcome: user_consent_required', { orgId: newChatContextOrgId });
        return { outcome: 'user_consent_required', orgId: newChatContextOrgId };
      }
    }
    
    // This path should ideally not be reached if policy is defaulted and all policies are handled.
    // However, to be safe, if somehow an unknown policy still gets through:
    if (orgTokenPolicy !== 'member_tokens' && orgTokenPolicy !== 'organization_tokens') {
      logger.error('[walletStore.determineChatWallet] Outcome: error (unexpected token usage policy after defaulting)', { orgTokenPolicy, orgId: newChatContextOrgId });
      return { outcome: 'error', message: `Unexpected token usage policy for ${newChatContextOrgId}: ${orgTokenPolicy}` };
    }

    // Fallback if logic somehow doesn't return earlier. This indicates a logic flaw.
    logger.error('[walletStore.determineChatWallet] Outcome: error (unhandled case in logic)', { orgId: newChatContextOrgId, orgTokenPolicy });
    return { outcome: 'error', message: `Unhandled wallet determination case for org ${newChatContextOrgId}.` };
  },

  loadPersonalWallet: async () => {
    set({ isLoadingPersonalWallet: true, personalWalletError: null });
    console.log('[WalletStore loadPersonalWallet] Initiating fetch');
    try {
      const response = await api.wallet().getWalletInfo(null);
      console.log('[WalletStore loadPersonalWallet] API response received:', response);

      if (response.error) {
        const errorToSet: ApiError = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || 'Failed to fetch personal wallet', code: 'UNKNOWN_API_ERROR' }; 
        console.log('[WalletStore loadPersonalWallet] Setting error state:', errorToSet);
        set({ isLoadingPersonalWallet: false, personalWalletError: errorToSet, personalWallet: null });
      } else {
        const walletData = response.data;
        console.log('[WalletStore loadPersonalWallet] API success. response.data:', walletData);
        
        const walletToSet = walletData && typeof walletData === 'object' && 'walletId' in walletData ? walletData : null;
        console.log('[WalletStore loadPersonalWallet] Wallet object being set to store:', walletToSet);

        set({
          isLoadingPersonalWallet: false,
          personalWallet: walletToSet,
          personalWalletError: null,
        });
        console.log('[WalletStore loadPersonalWallet] State SET with personal wallet. personalWallet?.balance should now be:', walletToSet?.balance);
      }
    } catch (error: unknown) {
      const networkError: ApiError = { message: error instanceof Error ? error.message : 'An unknown network error occurred', code: 'NETWORK_ERROR' };
      console.log('[WalletStore loadPersonalWallet] Setting catch error state:', networkError, error);
      set({
        personalWalletError: networkError,
        isLoadingPersonalWallet: false,
        personalWallet: null,
      });
    }
  },

  loadOrganizationWallet: async (organizationId: string) => {
    set(state => ({
      isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [organizationId]: true },
      orgWalletErrors: { ...state.orgWalletErrors, [organizationId]: null },
    }));
    console.log('[WalletStore loadOrganizationWallet] Initiating fetch for org:', organizationId);
    try {
      const response = await api.wallet().getWalletInfo(organizationId);
      console.log('[WalletStore loadOrganizationWallet] API response received for org:', organizationId, response);

      if (response.error) {
        const errorToSet: ApiError = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || `Failed to fetch wallet for org ${organizationId}`, code: 'UNKNOWN_API_ERROR' }; 
        console.log('[WalletStore loadOrganizationWallet] Setting error state for org:', organizationId, errorToSet);
        set(state => ({
          isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [organizationId]: false },
          orgWalletErrors: { ...state.orgWalletErrors, [organizationId]: errorToSet },
          organizationWallets: { ...state.organizationWallets, [organizationId]: null },
        }));
      } else {
        const walletData = response.data;
        console.log('[WalletStore loadOrganizationWallet] API success for org:', organizationId, 'response.data:', walletData);
        
        const walletToSet = walletData && typeof walletData === 'object' && 'walletId' in walletData ? walletData : null;
        console.log('[WalletStore loadOrganizationWallet] Wallet object being set to store for org:', organizationId, walletToSet);

        set(state => ({
          isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [organizationId]: false },
          organizationWallets: { ...state.organizationWallets, [organizationId]: walletToSet },
          orgWalletErrors: { ...state.orgWalletErrors, [organizationId]: null },
        }));
        console.log('[WalletStore loadOrganizationWallet] State SET for org wallet:', organizationId, 'balance:', walletToSet?.balance);
      }
    } catch (error: unknown) {
      const networkError: ApiError = { message: error instanceof Error ? error.message : 'An unknown network error occurred', code: 'NETWORK_ERROR' };
      console.log('[WalletStore loadOrganizationWallet] Setting catch error state for org:', organizationId, networkError, error);
      set(state => ({
        orgWalletErrors: { ...state.orgWalletErrors, [organizationId]: networkError },
        isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [organizationId]: false },
        organizationWallets: { ...state.organizationWallets, [organizationId]: null },
      }));
    }
  },

  getOrLoadOrganizationWallet: async (organizationId: string): Promise<TokenWallet | null> => {
    const { organizationWallets, isLoadingOrgWallet } = get();
    const existingWallet = organizationWallets[organizationId];

    if (existingWallet) {
      return existingWallet;
    }

    // If it's already loading, don't trigger another load, but callers might need to subscribe to changes.
    // For simplicity here, we re-trigger load. A more sophisticated approach might involve a promise cache.
    if (isLoadingOrgWallet[organizationId]) {
      // Optionally, instead of reloading, we could return a promise that resolves when the current load finishes.
      // For now, we proceed to load, which is idempotent if multiple calls happen.
      // Or, simply return null and let UI observe isLoadingOrgWallet[organizationId]
      console.log(`[WalletStore getOrLoadOrganizationWallet] Wallet for org ${organizationId} is already loading.`);
      // Depending on desired behavior, you might await a loading promise or just return null.
      // To ensure it loads if called, we can proceed to call loadOrganizationWallet.
    }

    console.log(`[WalletStore getOrLoadOrganizationWallet] Wallet for org ${organizationId} not found or not loading, fetching now.`);
    await get().loadOrganizationWallet(organizationId); // Call the actual loading action
    // After loading, the state will be updated, so we get the fresh state.
    // Note: This means the function resolves *after* the load attempt.
    return get().organizationWallets[organizationId] || null;
  },

  loadTransactionHistory: async (
    organizationId?: string | null,
    limit?: number,
    offset?: number
  ) => {
    set({ isLoadingHistory: true, personalWalletError: null, transactionHistory: [] });
    try {
      const response = await api.wallet().getWalletTransactionHistory(organizationId, limit, offset);

      if (response.error) {
        const errorToSet: ApiError = 
          response.error && typeof response.error.message === 'string' && typeof response.error.code === 'string'
          ? response.error
          : { message: String(response.error) || 'Failed to fetch transaction history', code: 'UNKNOWN_API_ERROR' }; 
        set({ personalWalletError: errorToSet, isLoadingHistory: false, transactionHistory: [] });
        return;
      }

      if (response.data === null || response.data === undefined) {
        set({
          transactionHistory: [],
          personalWalletError: { message: 'Failed to fetch transaction history: No data returned', code: 'NOT_FOUND' } as ApiError,
          isLoadingHistory: false,
        });
        return;
      }
      // Ensure data is an array, even if it's empty, it's a valid response.
      set({ transactionHistory: response.data || [], isLoadingHistory: false, personalWalletError: null });
    } catch (error: unknown) {
      set({
        personalWalletError: { message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching history', code: 'NETWORK_ERROR' } as ApiError,
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
        const errorToSet: ApiError = 
          response.error && typeof response.error.message === 'string' 
          ? response.error 
          : { message: String(response.error) || 'Failed to initiate purchase due to API error', code: 'UNKNOWN_API_ERROR' }; 
        set({ purchaseError: errorToSet, isLoadingPurchase: false });
        return null; // Return null as PaymentInitiationResult is not available
      }

      // Case 2: API call was successful, but response.data is unexpectedly null or undefined
      if (response.data === null || response.data === undefined) {
        set({
          purchaseError: { message: 'Failed to initiate purchase: No initiation data returned from API', code: 'NO_DATA_FROM_API' } as ApiError,
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
          } as ApiError,
          isLoadingPurchase: false,
        });
        return initiationResult; // Still return the result, as it might contain useful info like transactionId
      }
      
      // Payment initiation was successful according to the gateway
      set({ isLoadingPurchase: false, purchaseError: null });
      return initiationResult; // Return the successful PaymentInitiationResult

    } catch (error: unknown) { // Catch errors from the api.wallet().initiateTokenPurchase() call itself
      set({
        purchaseError: { message: error instanceof Error ? error.message : 'An unknown network error occurred during purchase initiation', code: 'NETWORK_CATCH_ERROR' } as ApiError,
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