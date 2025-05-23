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
    loadUserOrgTokenConsent,
    clearUserOrgTokenConsent 
  } = useWalletStore.getState();
  
  const newChatContextOrgId = useAiStore(state => state.newChatContext);
  logger.debug('[useChatWalletDecision] newChatContextOrgId', { newChatContextOrgId });
  logger.debug('[useChatWalletDecision] Current userOrgTokenConsent state from store', { consentState: JSON.parse(JSON.stringify(userOrgTokenConsent)) });

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  useEffect(() => {
    logger.debug('[useChatWalletDecision] useEffect for loading consent running', { newChatContextOrgId });
    if (newChatContextOrgId && userOrgTokenConsent[newChatContextOrgId] === undefined) {
      logger.info('[useChatWalletDecision] Consent for org is undefined. Calling loadUserOrgTokenConsent', { orgId: newChatContextOrgId });
      loadUserOrgTokenConsent(newChatContextOrgId);
    } else if (newChatContextOrgId) {
      logger.debug('[useChatWalletDecision] Consent for org is already defined in store', { orgId: newChatContextOrgId, consent: userOrgTokenConsent[newChatContextOrgId] });
    }
  }, [newChatContextOrgId, userOrgTokenConsent, loadUserOrgTokenConsent]);

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

  const latestUserOrgTokenConsent = useWalletStore(state => state.userOrgTokenConsent);
  const initialDecision = determineChatWallet();
  logger.debug('[useChatWalletDecision] initialDecision from determineChatWallet', { initialDecision });
  logger.debug('[useChatWalletDecision] latestUserOrgTokenConsent from store for outcome calc', { consentState: JSON.parse(JSON.stringify(latestUserOrgTokenConsent)) });

  let effectiveOutcome: WalletDecisionOutcome = initialDecision;
  let isLoadingConsent = false;

  if (newChatContextOrgId && initialDecision.outcome === 'user_consent_required') {
    logger.debug('[useChatWalletDecision] initialDecision is user_consent_required', { orgId: newChatContextOrgId });
    const consentForCurrentOrg = latestUserOrgTokenConsent[newChatContextOrgId];
    logger.debug('[useChatWalletDecision] consentForCurrentOrg from latestUserOrgTokenConsent', { consentForCurrentOrg });
    if (consentForCurrentOrg === undefined) {
      logger.debug('[useChatWalletDecision] consentForCurrentOrg is undefined. Setting isLoadingConsent = true, outcome = loading.');
      isLoadingConsent = true;
      effectiveOutcome = { outcome: 'loading' }; 
    } else if (consentForCurrentOrg === true) {
      logger.debug('[useChatWalletDecision] consentForCurrentOrg is true. Setting outcome = use_personal_wallet_for_org.');
      effectiveOutcome = { outcome: 'use_personal_wallet_for_org', orgId: newChatContextOrgId };
    } else if (consentForCurrentOrg === false) {
      logger.debug('[useChatWalletDecision] consentForCurrentOrg is false. Setting outcome = user_consent_refused.');
      effectiveOutcome = { outcome: 'user_consent_refused', orgId: newChatContextOrgId };
    } else {
      logger.debug('[useChatWalletDecision] consentForCurrentOrg is null (or other). initialDecision outcome remains user_consent_required.');
    }
  } else {
    logger.debug('[useChatWalletDecision] initialDecision is NOT user_consent_required or no newChatContextOrgId. Initial decision stands or other logic applies.', { initialDecisionOutcome: initialDecision.outcome, newChatContextOrgId });
  }
  
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