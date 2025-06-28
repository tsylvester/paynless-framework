import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useAiStore } from '@paynless/store';
import { logger } from '@paynless/utils';

export interface MessageSelectionCheckboxProps {
  messageId: string;
  chatId: string | null; // chatId can be null initially
  // We will rely on the store's default selection logic (true if not present)
  // So, initialIsSelected might not be strictly necessary if the store handles it.
}

export const MessageSelectionCheckbox: React.FC<MessageSelectionCheckboxProps> = ({
  messageId,
  chatId,
}) => {
  const { selectedMessagesMap, toggleMessageSelection } = useAiStore(state => ({
    selectedMessagesMap: state.selectedMessagesMap,
    toggleMessageSelection: state.toggleMessageSelection,
  }));

  // Determine isSelected based on the store's state
  // Default to true if not in map, or if chatId is null (should ideally not happen for a rendered message)
  const isSelected = React.useMemo(() => {
    if (!chatId || !selectedMessagesMap || !selectedMessagesMap[chatId]) {
      // logger.debug(`[MessageSelectionCheckbox] Defaulting to true (chatId: ${chatId}, messageId: ${messageId}, map undefined)`);
      return true; 
    }
    const selectionStatus = selectedMessagesMap[chatId][messageId];
    // logger.debug(`[MessageSelectionCheckbox] Selection status for chatId: ${chatId}, messageId: ${messageId} is ${selectionStatus}`);
    return selectionStatus !== undefined ? selectionStatus : true;
  }, [selectedMessagesMap, chatId, messageId]);

  const handleCheckboxChange = () => {
    if (chatId) {
      // logger.debug(`[MessageSelectionCheckbox] Toggling selection for chatId: ${chatId}, messageId: ${messageId}`);
      toggleMessageSelection(chatId, messageId);
    } else {
      logger.warn(`[MessageSelectionCheckbox] Cannot toggle selection: chatId is null for messageId: ${messageId}`);
    }
  };

  if (!chatId) {
    // Optionally render nothing or a disabled checkbox if chatId is not available,
    // though this scenario should ideally be prevented by the parent component.
    // logger.warn(`[MessageSelectionCheckbox] Rendering null because chatId is null for messageId: ${messageId}`);
    return null; 
  }

  return (
    <Checkbox
      id={`select-message-${messageId}`}
      checked={isSelected}
      onCheckedChange={handleCheckboxChange}
      aria-label="Select message"
      data-testid={`message-selection-checkbox-${messageId}`}
      className="border-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=unchecked]:bg-neutral-800 dark:data-[state=unchecked]:border-neutral-600"
    />
  );
}; 