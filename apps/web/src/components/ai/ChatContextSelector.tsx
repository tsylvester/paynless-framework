'use client';

import React from 'react';
import type { Organization } from '@paynless/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ChatContextSelectorProps {
  organizations: Organization[];
  currentContextId: string | null;
  onContextChange: (contextId: string | null) => void;
  isLoading: boolean;
  className?: string;
}

const PERSONAL_CONTEXT_ID = '__personal__'; // Internal constant for personal context value

export const ChatContextSelector: React.FC<ChatContextSelectorProps> = ({
  organizations,
  currentContextId,
  onContextChange,
  isLoading,
  className,
}) => {
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
    const selectedOrg = organizations.find(org => org.id === currentContextId);
    return selectedOrg?.name || 'Select context'; // Fallback if org not found
  };

  return (
    <Select
      value={selectedValue}
      onValueChange={handleValueChange}
      disabled={isLoading}
    >
      <SelectTrigger className={cn("w-full min-w-[180px]", className)}>
        <SelectValue placeholder="Select context">
          {getDisplayName()} 
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background/90 backdrop-blur-md border-border">
        <SelectItem key={PERSONAL_CONTEXT_ID} value={PERSONAL_CONTEXT_ID}>
          Personal
        </SelectItem>
        {organizations.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; 