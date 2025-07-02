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
    // The value is now either 'personal' or an org ID, which is exactly what the store expects.
    setNewChatContext(value);
    logger.info(`[ChatContextSelector] Context selected for new chat: ${value}`);
  };

  // The value from the store is already 'personal' or an org ID.
  const currentSelectedValueInStore = newChatContext || 'personal';


  const getDisplayName = () => {
    if (isOrgLoading) return 'Loading contexts...';
    // Use newChatContext from the store for display
    if (newChatContext === 'personal') return 'Personal';
    const selectedOrg = userOrganizations?.find(org => org.id === newChatContext);
    return selectedOrg?.name || 'Select context'; // Fallback if org not found
  };

  return (
    <Select
      value={currentSelectedValueInStore}
      onValueChange={handleValueChange}
      disabled={disabled || isOrgLoading} // Use passed disabled prop
    >
      <SelectTrigger className={cn("w-auto", className)}>
        <SelectValue placeholder="Select context">
          {getDisplayName()} 
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background/90 backdrop-blur-md border-border">
        <SelectItem key="personal" value="personal">
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