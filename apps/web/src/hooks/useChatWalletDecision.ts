import { useEffect, useState, useCallback } from 'react';
import { useWalletStore, useOrganizationStore, useAiStore } from '@paynless/store';
import type { WalletDecisionOutcome, Organization } from '@paynless/types';
import { logger } from '@paynless/utils';

const getConsentKey = (orgId: string) => `user_org_token_consent_${orgId}`;

interface UseChatWalletDecisionReturn extends WalletDecisionOutcome {
  giveConsent: () => void;
  refuseConsent: () => void;
  resetConsent: () => void; // To allow changing mind
  isLoadingConsent: boolean;
  effectiveOutcome: WalletDecisionOutcome;
}

export const useChatWalletDecision = (): UseChatWalletDecisionReturn => {
  const determineChatWalletSelector = useWalletStore(state => state.determineChatWallet);
  const newChatContextOrgId = useAiStore(state => state.newChatContext);
  // Re-evaluate when newChatContextOrgId, or org details relevant to it, change.
  const organizationDetails = useOrganizationStore(state => 
    state.currentOrganizationId === newChatContextOrgId ? state.currentOrganizationDetails : null
  );
  const isOrgDetailsLoading = useOrganizationStore(state => state.currentOrganizationId === newChatContextOrgId && state.isLoading);

  const [consentStatus, setConsentStatus] = useState<boolean | null>(null); // null: not asked, true: given, false: refused
  const [isLoadingConsent, setIsLoadingConsent] = useState<boolean>(true);

  // Load consent from localStorage when component mounts or orgId changes
  useEffect(() => {
    if (newChatContextOrgId) {
      setIsLoadingConsent(true);
      try {
        const storedConsent = localStorage.getItem(getConsentKey(newChatContextOrgId));
        if (storedConsent === 'true') {
          setConsentStatus(true);
        } else if (storedConsent === 'false') {
          setConsentStatus(false);
        } else {
          setConsentStatus(null); // Not yet determined or explicitly cleared
        }
      } catch (error) {
        logger.error('[useChatWalletDecision] Error reading consent from localStorage', { error, orgId: newChatContextOrgId });
        setConsentStatus(null); // Default to needing to ask if error
      }
      setIsLoadingConsent(false);
    } else {
      setConsentStatus(null); // No org context, no consent needed/stored this way
      setIsLoadingConsent(false);
    }
  }, [newChatContextOrgId]);

  const initialDecision = determineChatWalletSelector();

  const giveConsent = useCallback(() => {
    if (newChatContextOrgId) {
      try {
        localStorage.setItem(getConsentKey(newChatContextOrgId), 'true');
        setConsentStatus(true);
      } catch (error) {
        logger.error('[useChatWalletDecision] Error saving consent to localStorage', { error, orgId: newChatContextOrgId });
        // Potentially notify user of error
      }
    }
  }, [newChatContextOrgId]);

  const refuseConsent = useCallback(() => {
    if (newChatContextOrgId) {
      try {
        localStorage.setItem(getConsentKey(newChatContextOrgId), 'false');
        setConsentStatus(false);
      } catch (error) {
        logger.error('[useChatWalletDecision] Error saving refusal to localStorage', { error, orgId: newChatContextOrgId });
      }
    }
  }, [newChatContextOrgId]);

  const resetConsent = useCallback(() => {
    if (newChatContextOrgId) {
      try {
        localStorage.removeItem(getConsentKey(newChatContextOrgId));
        setConsentStatus(null);
      } catch (error) {
        logger.error('[useChatWalletDecision] Error resetting consent in localStorage', { error, orgId: newChatContextOrgId });
      }
    }
  }, [newChatContextOrgId]);

  // Determine effective outcome based on consent
  let effectiveOutcome: WalletDecisionOutcome = initialDecision;
  if (initialDecision.outcome === 'user_consent_required' && newChatContextOrgId) {
    if (isLoadingConsent) {
        effectiveOutcome = { outcome: 'loading' }; // Show loading while consent is checked
    } else if (consentStatus === true) {
        effectiveOutcome = { outcome: 'use_personal_wallet_for_org', orgId: newChatContextOrgId };
    } else if (consentStatus === false) {
        effectiveOutcome = { outcome: 'user_consent_refused', orgId: newChatContextOrgId };
    } 
    // If consentStatus is null, initialDecision { outcome: 'user_consent_required' } remains, prompting UI to ask.
  }

  // This ensures the hook re-evaluates if relevant parts of the store that `determineChatWalletSelector` depends on change.
  // The dependencies are: newChatContext, currentOrganizationDetails (for the context org), and isLoading (for that org).
  // The selector itself is stable, but its internal `getState()` calls will get fresh values upon re-render if these trigger it.
  // By including `organizationDetails` and `isOrgDetailsLoading` (which are reactive to currentOrganizationId and specific org data)
  // in this hook's dependencies, we ensure re-evaluation when those specific pieces of data change.
  useEffect(() => {
    // This effect is just to make sure the hook re-runs when these dependencies change.
    // The actual logic is driven by the selector and consent state.
  }, [initialDecision, consentStatus, isLoadingConsent, organizationDetails, isOrgDetailsLoading, newChatContextOrgId]);

  return {
    ...initialDecision, // returns the initial decision from selector (e.g., 'user_consent_required')
    giveConsent,
    refuseConsent,
    resetConsent,
    isLoadingConsent,
    effectiveOutcome, // returns the outcome after consent logic is applied
  };
}; 