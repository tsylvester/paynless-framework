import React from 'react';
import { Button } from '@/components/ui/button';
import { useAiStore } from '@paynless/store';

export const MessageSelectionControls: React.FC = () => {
  const { selectAllMessages, deselectAllMessages, currentChatId } = useAiStore(state => ({
    selectAllMessages: state.selectAllMessages,
    deselectAllMessages: state.deselectAllMessages,
    currentChatId: state.currentChatId,
  }));

  const handleSelectAll = () => {
    if (currentChatId) {
      selectAllMessages(currentChatId);
    }
  };

  const handleDeselectAll = () => {
    if (currentChatId) {
      deselectAllMessages(currentChatId);
    }
  };

  // Disable buttons if there is no current chat ID
  const isDisabled = !currentChatId;

  return (
    <div className="flex space-x-2">
      <Button variant="outline" size="sm" onClick={handleSelectAll} aria-label="Select all messages" disabled={isDisabled}>
        Select All
      </Button>
      <Button variant="outline" size="sm" onClick={handleDeselectAll} aria-label="Deselect all messages" disabled={isDisabled}>
        Deselect All
      </Button>
    </div>
  );
}; 