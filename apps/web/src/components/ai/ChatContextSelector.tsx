'use client';

import React, { useEffect, useMemo } from 'react';
import type { Organization } from '@paynless/types';
import { useAiStore, useOrganizationStore } from '@paynless/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { logger } from '@paynless/utils';
import { useChatWalletDecision } from '@/hooks/useChatWalletDecision';
import { OrgTokenConsentModal } from '@/components/modals/OrgTokenConsentModal';

interface ChatContextSelectorProps {
  className?: string;
  disabled?: boolean;
}

export const ChatContextSelector: React.FC<ChatContextSelectorProps> = ({
  className,
  disabled = false,
}) => {
  const { userOrganizations, isLoading: isOrgLoading } = useOrganizationStore(state => ({
    userOrganizations: state.userOrganizations,
    isLoading: state.isLoading,
  }));

  const { newChatContext, setNewChatContext } = useAiStore(state => ({
    newChatContext: state.newChatContext,
    setNewChatContext: state.setNewChatContext,
  }));

  const {
    effectiveOutcome,
    isConsentModalOpen,
    openConsentModal,
    closeConsentModal,
    orgIdForModal,
    resetOrgTokenConsent,
  } = useChatWalletDecision();

  useEffect(() => {
    if (effectiveOutcome.outcome === 'user_consent_required') {
      openConsentModal();
    }
  }, [effectiveOutcome.outcome, openConsentModal]);

  const orgNameForModal = useMemo(() => {
    if (!orgIdForModal || !userOrganizations) return undefined;
    const org = userOrganizations.find(o => o.id === orgIdForModal);
    return org?.name;
  }, [orgIdForModal, userOrganizations]);

  const isValidContext = useMemo(() => 
    !newChatContext || newChatContext === 'personal' || userOrganizations?.some(org => org.id === newChatContext),
    [newChatContext, userOrganizations]
  );

  const handleValueChange = (value: string) => {
    setNewChatContext(value);
    logger.info(`[ChatContextSelector] Context selected for new chat: ${value}`);
  };

  const currentSelectedValue = isValidContext ? (newChatContext || 'personal') : 'personal';

  return (
    <>
      <div>
        <Select
          value={currentSelectedValue}
          onValueChange={handleValueChange}
          disabled={disabled || isOrgLoading}
        >
          <SelectTrigger className={cn("w-auto", className)}>
            <SelectValue placeholder="Select context" />
          </SelectTrigger>
          <SelectContent className="bg-background/90 backdrop-blur-md border-border">
            <SelectItem key="personal" value="personal">
              Personal
            </SelectItem>
            {userOrganizations?.map((org: Organization) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {effectiveOutcome.outcome === 'user_consent_refused' && orgIdForModal === newChatContext && (
          <div className="text-xs text-red-500 mt-1.5">
            Consent declined.
            <button
              onClick={() => {
                if (orgIdForModal) {
                  resetOrgTokenConsent(orgIdForModal);
                }
              }}
              className="ml-1 underline hover:text-red-700 focus:outline-none"
            >
              Review?
            </button>
          </div>
        )}
      </div>
      {orgIdForModal && (
        <OrgTokenConsentModal
          isOpen={isConsentModalOpen}
          onClose={closeConsentModal}
          orgName={orgNameForModal}
          orgId={orgIdForModal}
        />
      )}
    </>
  );
}; 