import { useEffect, useCallback } from 'react';
import { useWalletStore, useAiStore } from '@paynless/store';
import type { WalletDecisionOutcome } from '@paynless/types';
import { logger } from '@paynless/utils';

interface UseChatWalletDecisionReturn {
  isLoadingConsent: boolean;
  effectiveOutcome: WalletDecisionOutcome;
  isConsentModalOpen: boolean;
  openConsentModal: () => void;
  closeConsentModal: () => void;
  orgIdForModal: string | null;
  resetOrgTokenConsent: (orgId: string) => void;
}

export const useChatWalletDecision = (): UseChatWalletDecisionReturn => {
  logger.debug('[useChatWalletDecision] Hook executing/re-evaluating.');

  const {
    determineChatWallet,
    userOrgTokenConsent,
    clearUserOrgTokenConsent,
    isConsentModalOpen,
    openConsentModal,
    closeConsentModal,
  } = useWalletStore(state => ({
    determineChatWallet: state.determineChatWallet,
    userOrgTokenConsent: state.userOrgTokenConsent,
    clearUserOrgTokenConsent: state.clearUserOrgTokenConsent,
    isConsentModalOpen: state.isConsentModalOpen,
    openConsentModal: state.openConsentModal,
    closeConsentModal: state.closeConsentModal,
  }));

  const newChatContextOrgId = useAiStore(state => state.newChatContext);
  logger.debug('[useChatWalletDecision] newChatContextOrgId', { newChatContextOrgId });
  logger.debug('[useChatWalletDecision] Current userOrgTokenConsent state from store', { consentState: JSON.parse(JSON.stringify(userOrgTokenConsent)) });

  const resetOrgTokenConsent = useCallback((orgIdToReset: string) => {
    logger.info('[useChatWalletDecision] resetOrgTokenConsent called', { orgId: orgIdToReset });
    clearUserOrgTokenConsent(orgIdToReset);
  }, [clearUserOrgTokenConsent]);

  const calculatedOutcome = determineChatWallet(newChatContextOrgId);

  const isLoadingConsent = calculatedOutcome.outcome === 'loading';

  const effectiveOutcome: WalletDecisionOutcome = calculatedOutcome;

  logger.debug('[useChatWalletDecision] Final results', { effectiveOutcome, isLoadingConsent });

  return {
    isLoadingConsent,
    effectiveOutcome,
    isConsentModalOpen,
    openConsentModal,
    closeConsentModal,
    orgIdForModal: newChatContextOrgId,
    resetOrgTokenConsent,
  };
}; 