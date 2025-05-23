import { WalletStateValues } from './walletStore'; // Adjust path as needed
import { TokenWalletTransaction, ApiError, TokenWallet } from '@paynless/types';

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