import { WalletStateValues } from './walletStore'; // Adjust path as needed
import { TokenWalletTransaction, ApiError, TokenWallet, WalletDecisionOutcome, ActiveChatWalletInfo } from '@paynless/types';
import { 
  isWalletDecisionLoading,
  isWalletDecisionError,
  isUserConsentRequired,
  isUserConsentRefused,
  isOrgWalletUnavailableByPolicy,
} from '@paynless/utils';

// Re-export or define types if they are used by selectors and not part of WalletStateValues directly
// For example, if selectors return complex objects not directly from state.

export const selectPersonalWalletBalance = (state: WalletStateValues): string | null => {
  return state.personalWallet?.balance ?? null;
};

export const selectWalletTransactions = (state: WalletStateValues): TokenWalletTransaction[] => {
  return state.transactionHistory;
};

export const selectOrganizationWalletBalance = (state: WalletStateValues, organizationId: string): string => {
  return state.organizationWallets[organizationId]?.balance || '0';
};

export const selectIsLoadingPersonalWallet = (state: WalletStateValues): boolean => {
  return state.isLoadingPersonalWallet;
};

export const selectPersonalWalletError = (state: WalletStateValues): ApiError | null => {
  return state.personalWalletError;
};

export const selectIsLoadingOrgWallet = (state: WalletStateValues, organizationId: string): boolean => {
  return state.isLoadingOrgWallet[organizationId] || false;
};

export const selectOrgWalletError = (state: WalletStateValues, organizationId: string): ApiError | null => {
  return state.orgWalletErrors[organizationId] || null;
};

export const selectPersonalWallet = (state: WalletStateValues): TokenWallet | null => {
  return state.personalWallet;
};

export const selectOrganizationWallet = (state: WalletStateValues, organizationId: string): TokenWallet | null => {
  return state.organizationWallets[organizationId] || null;
};

export const selectCurrentChatWalletDecision = (state: WalletStateValues): WalletDecisionOutcome | null => {
  return state.currentChatWalletDecision;
};

export const selectActiveChatWalletInfo = (
  state: WalletStateValues,
  newChatContext: string | null | undefined,
): ActiveChatWalletInfo => {
  const decision = state.currentChatWalletDecision;

  // Only explicit loading decisions are treated as loading; null will use context-based logic below
  if (isWalletDecisionLoading(decision)) {
    return {
      status: 'loading',
      type: null,
      walletId: null,
      orgId: null,
      balance: null,
      message: 'Determining wallet policy and consent...',
      isLoadingPrimaryWallet: true,
    };
  }

  // Handle error outcomes from the decision logic itself
  if (isWalletDecisionError(decision)) {
    return {
      status: 'error',
      type: null,
      walletId: null,
      orgId: null,
      balance: null,
      message: decision.message || 'An error occurred in wallet determination.',
      isLoadingPrimaryWallet: false,
    };
  }
  
  // Handle consent-related blocking outcomes
  if (isUserConsentRequired(decision)) {
    return {
      status: 'consent_required',
      type: 'personal', // Implies personal would be used if consent given
      walletId: state.personalWallet?.walletId || null,
      orgId: decision.orgId,
      balance: state.personalWallet?.balance || null, // Show personal balance as context
      message: `Consent required to use your personal tokens for this organization (${decision.orgId}).`,
      isLoadingPrimaryWallet: state.isLoadingPersonalWallet,
    };
  }

  if (isUserConsentRefused(decision)) {
    return {
      status: 'consent_refused',
      type: 'personal', // Context is personal wallet usage was refused
      walletId: state.personalWallet?.walletId || null,
      orgId: decision.orgId,
      balance: state.personalWallet?.balance || null,
      message: `Chat disabled. You declined to use personal tokens for this organization (${decision.orgId}).`,
      isLoadingPrimaryWallet: state.isLoadingPersonalWallet,
    };
  }
  
  // Handle policy-based unavailability where organization tokens are specified but org wallet itself is not yet implemented/funded
  if (isOrgWalletUnavailableByPolicy(decision)) {
    return {
      status: 'policy_org_wallet_unavailable',
      type: 'organization',
      walletId: null, // Org wallet ID might not be known or relevant if unavailable
      orgId: decision.orgId,
      balance: null,
      message: `This organization (${decision.orgId}) uses its own tokens, but the organization wallet is not yet available or funded. Chat is disabled.`,
      isLoadingPrimaryWallet: state.isLoadingOrgWallet[decision.orgId] || false, // Check if we are trying to load it
    };
  }

  // Determine active info based on provided chat context to ensure reactivity.
  // If context is personal or not specified, prefer personal wallet info; otherwise prefer organization wallet info.
  const isPersonalContext = !newChatContext || newChatContext === 'personal';

  if (isPersonalContext) {
    const personalWallet = state.personalWallet;
    const isLoading = state.isLoadingPersonalWallet;
    const error = state.personalWalletError;
    return {
      status: isLoading ? 'loading' : error ? 'error' : 'ok',
      type: 'personal',
      walletId: personalWallet?.walletId || null,
      orgId: null,
      balance: personalWallet?.balance || null,
      message: error ? error.message : isLoading ? 'Loading personal wallet...' : undefined,
      isLoadingPrimaryWallet: isLoading,
    };
  }

  // Organization context
  {
    const orgId = newChatContext;
    const orgWallet = orgId ? state.organizationWallets[orgId] : null;
    const isLoading = orgId ? (state.isLoadingOrgWallet[orgId] || false) : false;
    const error = orgId ? (state.orgWalletErrors[orgId] || null) : null;
    return {
      status: isLoading ? 'loading' : error ? 'error' : 'ok',
      type: 'organization',
      walletId: orgWallet?.walletId || null,
      orgId: orgId || null,
      balance: orgWallet?.balance || null,
      message: error ? error.message : isLoading && orgId ? `Loading wallet for ${orgId}...` : undefined,
      isLoadingPrimaryWallet: isLoading,
    };
  }

}; 