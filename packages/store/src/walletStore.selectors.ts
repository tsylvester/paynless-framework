import { WalletStateValues } from './walletStore'; // Adjust path as needed
import { TokenWalletTransaction, ApiError, TokenWallet, WalletDecisionOutcome, ActiveChatWalletInfo } from '@paynless/types';

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

export const selectActiveChatWalletInfo = (state: WalletStateValues): ActiveChatWalletInfo => {
  const decision = state.currentChatWalletDecision;

  // Default loading state if decision itself is loading or null
  if (!decision || decision.outcome === 'loading') {
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
  if (decision.outcome === 'error') {
    // TODO: Ensure WalletDecisionOutcome type for 'error' in @paynless/types includes optional orgId: string | null
    const errorDecision = decision as { outcome: 'error'; message: string; orgId?: string | null };
    return {
      status: 'error',
      type: null,
      walletId: null,
      orgId: errorDecision.orgId ?? null, // Use nullish coalescing
      balance: null,
      message: errorDecision.message || 'An error occurred in wallet determination.',
      isLoadingPrimaryWallet: false,
    };
  }
  
  // Handle consent-related blocking outcomes
  if (decision.outcome === 'user_consent_required') {
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

  if (decision.outcome === 'user_consent_refused') {
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
  if (decision.outcome === 'org_wallet_not_available_policy_org') {
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

  // Handle cases where the wallet is determined and should be usable
  if (decision.outcome === 'use_personal_wallet') {
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

  if (decision.outcome === 'use_personal_wallet_for_org' && decision.orgId) {
    const personalWallet = state.personalWallet;
    const isLoading = state.isLoadingPersonalWallet;
    const error = state.personalWalletError;
    return {
      status: isLoading ? 'loading' : error ? 'error' : 'ok',
      type: 'personal',
      walletId: personalWallet?.walletId || null,
      orgId: decision.orgId,
      balance: personalWallet?.balance || null,
      message: error ? error.message : isLoading ? `Loading personal wallet for ${decision.orgId}...` : undefined,
      isLoadingPrimaryWallet: isLoading,
    };
  }

  if (decision.outcome === 'use_organization_wallet' && decision.orgId) {
    const orgWallet = state.organizationWallets[decision.orgId];
    const isLoading = state.isLoadingOrgWallet[decision.orgId] || false;
    const error = state.orgWalletErrors[decision.orgId] || null;
    return {
      status: isLoading ? 'loading' : error ? 'error' : 'ok',
      type: 'organization',
      walletId: orgWallet?.walletId || null,
      orgId: decision.orgId,
      balance: orgWallet?.balance || null,
      message: error ? error.message : isLoading ? `Loading wallet for ${decision.orgId}...` : undefined,
      isLoadingPrimaryWallet: isLoading,
    };
  }
  
  // Fallback for any unhandled decision outcome - should ideally not be reached
  return {
    status: 'error',
    type: null,
    walletId: null,
    orgId: decision.orgId ?? null, // Attempt to get orgId if it exists on unknown type
    balance: null,
    message: `Unhandled wallet decision outcome: ${decision.outcome}. Please check application logic.`,
    isLoadingPrimaryWallet: false,
  };
}; 