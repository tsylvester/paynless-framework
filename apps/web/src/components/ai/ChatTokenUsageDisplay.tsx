import React, { useEffect } from 'react';
import { useAiStore, useAnalyticsStore } from '@paynless/store';

export const ChatTokenUsageDisplay: React.FC = () => {
  // Use the selector from the store instance, consistent with how it was added to AiActions
  const usage = useAiStore(state => state.selectCurrentChatSessionTokenUsage());
  const trackEvent = useAnalyticsStore(state => state.track);

  useEffect(() => {
    if (usage && usage.overallTotalTokens > 0) {
      // Basic details, can be expanded
      const eventDetails = {
        userTokens: usage.userTokens,
        assistantPromptTokens: usage.assistantPromptTokens,
        assistantCompletionTokens: usage.assistantCompletionTokens,
        assistantTotalTokens: usage.assistantTotalTokens,
        overallTotalTokens: usage.overallTotalTokens,
        chatId: useAiStore().getState().currentChatId, // Get currentChatId for context
      };
      trackEvent('token_usage_displayed', eventDetails);
    }
    // Trigger only when overallTotalTokens changes to avoid re-triggering on every render
    // or when other parts of usage object change but total remains 0 then >0.
  }, [usage?.overallTotalTokens, trackEvent]);

  // Handle cases where usage might initially be null or not fully populated if the selector
  // could return null before a chat is active or if no messages exist.
  // The selector is now designed to return an object with zeros in such cases.
  // So, a direct null check on `usage` might not be needed if selector guarantees an object.
  // Let's assume the selector always returns the defined object structure.

  return (
    <div className="p-2 border-t border-border text-xs text-muted-foreground" data-testid="chat-token-usage-display">
      <h4 className="font-semibold mb-1">Session Usage:</h4>
      <div>User: {usage.userTokens}</div>
      <div>AI Prompt: {usage.assistantPromptTokens}</div>
      <div>AI Completion: {usage.assistantCompletionTokens}</div>
      <div>AI Total: {usage.assistantTotalTokens}</div>
      <div className="mt-1 font-medium">Session Total: {usage.overallTotalTokens}</div>
    </div>
  );
}; 