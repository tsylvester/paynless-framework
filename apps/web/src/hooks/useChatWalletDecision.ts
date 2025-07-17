import { useEffect, useCallback, useMemo } from 'react';
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
    setCurrentChatWalletDecision,
    userOrgTokenConsent,
    clearUserOrgTokenConsent,
    isConsentModalOpen,
    openConsentModal,
    closeConsentModal,
  } = useWalletStore(state => ({
    determineChatWallet: state.determineChatWallet,
    setCurrentChatWalletDecision: state.setCurrentChatWalletDecision,
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

  const calculatedOutcome = useMemo(() => {
    return determineChatWallet(newChatContextOrgId);
  }, [determineChatWallet, newChatContextOrgId, userOrgTokenConsent]);

  // Update the store with the calculated outcome
  useEffect(() => {
    setCurrentChatWalletDecision(calculatedOutcome);
    logger.debug('[useChatWalletDecision] Updated store with calculated outcome', { calculatedOutcome });
  }, [calculatedOutcome, setCurrentChatWalletDecision]);

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