import { useEffect, useState, useCallback } from 'react';
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

  const determineChatWallet = useWalletStore(state => state.determineChatWallet);
  const userOrgTokenConsent = useWalletStore(state => state.userOrgTokenConsent);
  const { 
    clearUserOrgTokenConsent,
    setCurrentChatWalletDecision,
  } = useWalletStore.getState();
  
  const newChatContextOrgId = useAiStore(state => state.newChatContext);
  logger.debug('[useChatWalletDecision] newChatContextOrgId', { newChatContextOrgId });
  logger.debug('[useChatWalletDecision] Current userOrgTokenConsent state from store', { consentState: JSON.parse(JSON.stringify(userOrgTokenConsent)) });

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  const openConsentModal = useCallback(() => {
    logger.info('[useChatWalletDecision] openConsentModal called', { newChatContextOrgId });
    if (newChatContextOrgId) {
      setIsConsentModalOpen(true);
    }
  }, [newChatContextOrgId]);

  const closeConsentModal = useCallback(() => {
    logger.info('[useChatWalletDecision] closeConsentModal called.');
    setIsConsentModalOpen(false);
  }, []);

  const resetOrgTokenConsent = useCallback((orgIdToReset: string) => {
    logger.info('[useChatWalletDecision] resetOrgTokenConsent called', { orgId: orgIdToReset });
    clearUserOrgTokenConsent(orgIdToReset);
  }, [clearUserOrgTokenConsent]);

  const calculatedOutcome = determineChatWallet();

  const isLoadingConsent = calculatedOutcome.outcome === 'loading';
  
  const effectiveOutcome: WalletDecisionOutcome = calculatedOutcome;

  useEffect(() => {
    logger.debug('[useChatWalletDecision] useEffect for setCurrentChatWalletDecision. Current effectiveOutcome:', effectiveOutcome);
    setCurrentChatWalletDecision(effectiveOutcome);
  }, [effectiveOutcome, setCurrentChatWalletDecision]);

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