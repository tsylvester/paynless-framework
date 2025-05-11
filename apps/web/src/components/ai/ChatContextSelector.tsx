'use client';

import React from 'react';
import type { Organization } from '@paynless/types';
// import { useOrganizationStore } from '@paynless/store'; // No longer needed directly if context comes from aiStore
import { useAiStore, useOrganizationStore } from '@paynless/store'; // Added useAiStore
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { logger } from '@paynless/utils'; // Added logger for potential debugging

interface ChatContextSelectorProps {
  // currentContextId: string | null; // Removed
  // onContextChange: (contextId: string | null) => void; // Removed
  className?: string;
  disabled?: boolean; // Added disabled prop
}

const PERSONAL_CONTEXT_ID = '__personal__'; // Internal constant for personal context value

export const ChatContextSelector: React.FC<ChatContextSelectorProps> = ({
  className,
  disabled = false, // Added disabled prop
}) => {
  const { userOrganizations, isLoading: isOrgLoading } = useOrganizationStore(state => ({
    userOrganizations: state.userOrganizations,
    isLoading: state.isLoading,
  }));

  const { 
    newChatContext, 
    setNewChatContext,
  } = useAiStore(state => ({
    newChatContext: state.newChatContext,
    setNewChatContext: state.setNewChatContext,
  }));

  const handleValueChange = (value: string) => {
    const newContextId = value === PERSONAL_CONTEXT_ID ? null : value;
    setNewChatContext(newContextId);
    logger.info(`[ChatContextSelector] Context selected for new chat: ${newContextId}`);
  };

  // Ensure selectedChatContextForNewChat is initialized in the store,
  // otherwise, this might be undefined initially.
  // The store should initialize selectedChatContextForNewChat, perhaps to globalCurrentOrgId or null.
  const currentSelectedValueInStore = newChatContext === undefined 
    ? PERSONAL_CONTEXT_ID // Default to personal if undefined in store (should be initialized in store)
    : (newChatContext === null ? PERSONAL_CONTEXT_ID : newChatContext);


  const getDisplayName = () => {
    if (isOrgLoading) return 'Loading contexts...';
    // Use selectedChatContextForNewChat from the store for display
    if (newChatContext === null || newChatContext === undefined) return 'Personal';
    const selectedOrg = userOrganizations?.find(org => org.id === newChatContext);
    return selectedOrg?.name || 'Select context'; // Fallback if org not found
  };

  return (
    <Select
      value={currentSelectedValueInStore}
      onValueChange={handleValueChange}
      disabled={disabled || isOrgLoading} // Use passed disabled prop
    >
      <SelectTrigger className={cn("min-w-[180px]", className)}>
        <SelectValue placeholder="Select context">
          {getDisplayName()} 
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background/90 backdrop-blur-md border-border">
        <SelectItem key={PERSONAL_CONTEXT_ID} value={PERSONAL_CONTEXT_ID}>
          Personal
        </SelectItem>
        {userOrganizations?.map((org: Organization) => ( // Added type for org
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; 