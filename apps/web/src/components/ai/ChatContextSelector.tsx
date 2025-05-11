'use client';

import React from 'react';
import type { Organization } from '@paynless/types';
import { useOrganizationStore } from '@paynless/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ChatContextSelectorProps {
  currentContextId: string | null;
  onContextChange: (contextId: string | null) => void;
  className?: string;
}

const PERSONAL_CONTEXT_ID = '__personal__'; // Internal constant for personal context value

export const ChatContextSelector: React.FC<ChatContextSelectorProps> = ({
  currentContextId,
  onContextChange,
  className,
}) => {
  const { userOrganizations, isLoading } = useOrganizationStore(state => ({
    userOrganizations: state.userOrganizations,
    isLoading: state.isLoading,
  }));

  const handleValueChange = (value: string) => {
    if (value === PERSONAL_CONTEXT_ID) {
      onContextChange(null);
    } else {
      onContextChange(value);
    }
  };

  const selectedValue = currentContextId === null ? PERSONAL_CONTEXT_ID : currentContextId;

  const getDisplayName = () => {
    if (isLoading) return 'Loading contexts...';
    if (currentContextId === null) return 'Personal';
    const selectedOrg = userOrganizations?.find(org => org.id === currentContextId);
    return selectedOrg?.name || 'Select context'; // Fallback if org not found
  };

  return (
    <Select
      value={selectedValue}
      onValueChange={handleValueChange}
      disabled={isLoading}
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
        {userOrganizations?.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; 