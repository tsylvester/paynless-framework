import React, { useEffect } from 'react';
import { useAiStore, useAnalyticsStore, selectCurrentChatSessionTokenUsage } from '@paynless/store';

export const ChatTokenUsageDisplay: React.FC = () => {
  // Use the imported selector function directly with the useAiStore hook
  const usage = useAiStore(selectCurrentChatSessionTokenUsage);
  const trackEvent = useAnalyticsStore(state => state.track);
  const currentChatId = useAiStore(state => state.currentChatId); // Get currentChatId at the top level

  useEffect(() => {
    if (usage && usage.overallTotalTokens > 0 && currentChatId) { // ensure currentChatId is also available
      // Basic details, can be expanded
      const eventDetails = {
        // userTokens: usage.userTokens, // Removed as it will be 0 and is covered by assistantPromptTokens
        assistantPromptTokens: usage.assistantPromptTokens,
        assistantCompletionTokens: usage.assistantCompletionTokens,
        assistantTotalTokens: usage.assistantTotalTokens,
        overallTotalTokens: usage.overallTotalTokens,
        chatId: currentChatId, // Use the variable from the top-level hook call
      };
      trackEvent('token_usage_displayed', eventDetails);
    }
    // Trigger only when overallTotalTokens changes to avoid re-triggering on every render
    // or when other parts of usage object change but total remains 0 then >0.
  }, [usage?.overallTotalTokens, usage?.assistantPromptTokens, usage?.assistantCompletionTokens, trackEvent, currentChatId]); // Adjusted dependencies

  // Handle cases where usage might initially be null or not fully populated if the selector
  // could return null before a chat is active or if no messages exist.
  // The selector is now designed to return an object with zeros in such cases.
  // So, a direct null check on `usage` might not be needed if selector guarantees an object.
  // Let's assume the selector always returns the defined object structure.

  return (
    <div className="p-2 text-xs text-muted-foreground" data-testid="chat-token-usage-display">
      <h4 className="font-semibold mb-1 text-left">Session Usage:</h4>
      <div className="flex justify-between items-center">
        <span className="text-left">AI Prompt:</span>
        <span className="font-mono text-right">{usage.assistantPromptTokens}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-left">AI Completion:</span>
        <span className="font-mono text-right">{usage.assistantCompletionTokens}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-left">AI Total:</span>
        <span className="font-mono text-right">{usage.assistantTotalTokens}</span>
      </div>
      <div className="mt-1 flex justify-between items-center">
        <span className="font-medium text-left">Session Total:</span>
        <span className="font-mono font-medium text-right">{usage.overallTotalTokens}</span>
      </div>
    </div>
  );
}; 