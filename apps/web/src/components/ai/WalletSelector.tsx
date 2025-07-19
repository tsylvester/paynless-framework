import React, { useEffect } from 'react';
import { useChatWalletDecision } from '@/hooks/useChatWalletDecision';
import {
  useWalletStore,
  selectPersonalWallet,
  selectIsLoadingPersonalWallet,
  selectPersonalWalletError,
  selectOrganizationWallet,
  selectIsLoadingOrgWallet,
  selectOrgWalletError,
  useOrganizationStore,
} from '@paynless/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logger } from '@paynless/utils';

// Utility function to format balance with K/M/B shorthand
const formatBalance = (balanceString: string | undefined | null): string => {
    if (balanceString === null || balanceString === undefined) return 'N/A';
    const balance = parseFloat(balanceString);
    if (isNaN(balance)) return 'N/A';

    if (balance >= 1_000_000_000) {
        return (balance / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (balance >= 1_000_000) {
        return (balance / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (balance >= 1_000) {
        return (balance / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return String(Math.floor(balance)); // Use Math.floor to handle potential decimals in smaller numbers
};

// Define props if any are needed in the future, for now, it might be prop-less
export interface WalletSelectorProps {}

export const WalletSelector: React.FC<WalletSelectorProps> = () => {
  const { 
    effectiveOutcome, 
    openConsentModal, 
    orgIdForModal, // This is newChatContextOrgId from the hook
    resetOrgTokenConsent, // Use this for setting consent to null
  } = useChatWalletDecision();

  const { setUserOrgTokenConsent, getOrLoadOrganizationWallet } = useWalletStore.getState();

  // Personal Wallet Data
  const { personalWallet, personalWalletBalance } = useWalletStore(state => ({
    personalWallet: selectPersonalWallet(state),
    personalWalletBalance: state.personalWallet?.balance ?? null,
  }));

  const isLoadingPersonalWallet = useWalletStore(selectIsLoadingPersonalWallet);
  const personalWalletError = useWalletStore(selectPersonalWalletError);

  // Organization Wallet Data & Details
  // orgIdForModal from useChatWalletDecision is the most reliable source for the current org context
  const currentOrgFromStore = useOrganizationStore(state => 
    orgIdForModal ? state.userOrganizations.find(org => org.id === orgIdForModal) : null
  );
  const orgName = currentOrgFromStore?.name || orgIdForModal;

  const { organizationWallet, organizationWalletBalance } = useWalletStore(state => {
    const wallet = orgIdForModal ? selectOrganizationWallet(state, orgIdForModal) : null;
    return {
      organizationWallet: wallet,
      organizationWalletBalance: wallet?.balance ?? null,
    };
  });
  const isLoadingOrgWallet = useWalletStore(state => 
    orgIdForModal ? selectIsLoadingOrgWallet(state, orgIdForModal) : false
  );
  const orgWalletError = useWalletStore(state => 
    orgIdForModal ? selectOrgWalletError(state, orgIdForModal) : null
  );
  
  useEffect(() => {
    // DEV NOTE: Logging wallets to satisfy linter and confirm availability for future logic.
    if (personalWallet) {
      logger.debug('[WalletSelector] Personal wallet object is available.', { walletId: personalWallet.walletId });
    }
    if (organizationWallet) {
      logger.debug('[WalletSelector] Organization wallet object is available.', { walletId: organizationWallet.walletId });
    }
    if (effectiveOutcome.outcome === 'use_organization_wallet' && orgIdForModal) {
        const storeState = useWalletStore.getState();
        if (!storeState.organizationWallets[orgIdForModal] && !storeState.isLoadingOrgWallet[orgIdForModal]) {
            logger.debug('[WalletSelector] useEffect triggering getOrLoadOrganizationWallet', { orgId: orgIdForModal });
            getOrLoadOrganizationWallet(orgIdForModal);
        }
    }
  }, [effectiveOutcome, orgIdForModal, getOrLoadOrganizationWallet, personalWallet, organizationWallet]);

  let triggerTitle: string = 'Wallet:';
  let triggerContentText: string = 'Loading...';
  const actionItems: { key: string; label: string; actionKey: string }[] = [];

  if (effectiveOutcome.outcome === 'loading') {
    triggerContentText = 'Loading...';
  } else if (effectiveOutcome.outcome === 'error') {
    triggerTitle = 'Error:';
    triggerContentText = effectiveOutcome.message || 'An error occurred.';
  } else if (effectiveOutcome.outcome === 'use_personal_wallet') {
    triggerTitle = 'Personal:';
    if (isLoadingPersonalWallet) triggerContentText = 'Loading...';
    else if (personalWalletError) triggerContentText = personalWalletError.message || 'Error';
    else triggerContentText = formatBalance(personalWalletBalance);
  } else if (effectiveOutcome.outcome === 'use_personal_wallet_for_org' && orgIdForModal && orgName) {
    triggerTitle = `Personal:`;
    if (isLoadingPersonalWallet) triggerContentText = 'Loading...';
    else if (personalWalletError) triggerContentText = personalWalletError.message || 'Error';
    else triggerContentText = formatBalance(personalWalletBalance);
    actionItems.push({ key: "stop_using", label: `Stop using for ${orgName}`, actionKey: "action:stop_using" });
  } else if (effectiveOutcome.outcome === 'use_organization_wallet' && orgIdForModal && orgName) {
    triggerTitle = `${orgName}:`;
    if (isLoadingOrgWallet) triggerContentText = 'Loading...';
    else if (orgWalletError) triggerContentText = orgWalletError.message || 'Error';
    else triggerContentText = formatBalance(organizationWalletBalance);
    // No actions currently if org wallet is primary and in use
  } else if (effectiveOutcome.outcome === 'user_consent_required' && orgIdForModal && orgName) {
    triggerTitle = `Consent Required:`;
    triggerContentText = `Use Personal for ${orgName}?`;
    actionItems.push({ key: "review_consent", label: `Review Consent for ${orgName}`, actionKey: "action:review_consent" });
  } else if (effectiveOutcome.outcome === 'user_consent_refused' && orgIdForModal && orgName) {
    triggerTitle = `Consent Refused:`;
    triggerContentText = `Personal for ${orgName}`;
    actionItems.push({ key: "allow_using", label: `Allow using Personal Wallet for ${orgName}`, actionKey: "action:allow_using" });
  } else if (effectiveOutcome.outcome === 'org_wallet_not_available_policy_org' && orgIdForModal && orgName) {
    triggerTitle = `${orgName}:`;
    triggerContentText = 'Unavailable (Policy)';
    // No actions currently for this state
  } else if (effectiveOutcome.outcome === 'org_wallet_not_available_policy_member' && orgIdForModal && orgName) {
    triggerTitle = `${orgName}:`;
    triggerContentText = 'Unavailable (Policy allows members)';
    actionItems.push({ key: "review_consent_fallback", label: `Review Consent for ${orgName}`, actionKey: "action:review_consent_fallback" });
  } else {
    triggerTitle = 'Status:';
    triggerContentText = effectiveOutcome.outcome; // Fallback for any unhandled or generic outcomes
  }

  const handleAction = (selectedActionKey: string) => {
    if (!orgIdForModal && selectedActionKey !== 'action:review_consent' && selectedActionKey !== 'action:review_consent_fallback') {
      // Most actions require an orgId
      return;
    }
    switch (selectedActionKey) {
      case 'action:stop_using':
        if (orgIdForModal) setUserOrgTokenConsent(orgIdForModal, false);
        break;
      case 'action:allow_using':
        if (orgIdForModal) resetOrgTokenConsent(orgIdForModal);
        break;
      case 'action:review_consent':
      case 'action:review_consent_fallback':
        openConsentModal();
        break;
      default:
        logger.warn('[WalletSelector] Unknown action key:', { selectedActionKey });
    }
  };

  const hasActions = actionItems.length > 0;

  // Common display content for both SelectTrigger and the static div
  const displayContent = (
    <div className="flex flex-row items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
      <span className="text-sm">{triggerTitle}</span> 
      <span className="text-sm font-medium">{triggerContentText}</span>
    </div>
  );

  if (!hasActions) {
    // Render a static div styled like SelectTrigger when no actions are available
    return (
      <div className="flex flex-row items-center justify-between gap-1 rounded-md px-3 py-2 shadow-sm h-10 truncate border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-default opacity-70">
        {displayContent}
        {/* No chevron, as it's not interactive */}
      </div>
    );
  }

  // If we are here, hasActions is true.
  return (
    <Select 
      onValueChange={handleAction} 
    >
      <SelectTrigger 
        className="flex flex-row items-center justify-between gap-1 rounded-md px-3 py-2 shadow-sm h-10"
      >
        {/* For use_personal_wallet_for_org, render content directly. Otherwise, use placeholder for other interactive states. */}
        {effectiveOutcome.outcome === 'use_personal_wallet_for_org' ? (
          displayContent
        ) : (
          <SelectValue placeholder={displayContent} />
        )}
      </SelectTrigger>
      <SelectContent className="bg-background/90 backdrop-blur-md border-border">
        {actionItems.map(item => (
          <SelectItem key={item.key} value={item.actionKey}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; 