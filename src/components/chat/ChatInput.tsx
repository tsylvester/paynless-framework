import React, { useState, FormEvent, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { Send, Lock } from 'lucide-react';
import UsageIndicator from '../subscription/UsageIndicator';

const ChatInput: React.FC = () => {
  const [inputMessage, setInputMessage] = useState('');
  const { sendMessage, isLoading, selectedPrompt, systemPrompts, navigateToAuth, setSelectedPrompt } = useChat();
  const { user, isOnline } = useAuth();
  const { subscription, isSubscriptionFeatureEnabled } = useSubscription();

  // Check if user has hit message limit
  const [hasReachedLimit, setHasReachedLimit] = useState(false);

  // Check message limits on mount and when subscription changes
  useEffect(() => {
    const checkMessageLimits = async () => {
      if (!user || !subscription) return;
      
      // Free users have message limits
      if (subscription.subscription_plan_id === 'free') {
        const limits = subscription.plan.subscription_limits || {};
        if (typeof limits.messages_per_day === 'number') {
          // The actual check is done in the UsageIndicator component
          // This just determines if we should show the upgrade button
          setHasReachedLimit(false);
        }
      } else {
        setHasReachedLimit(false);
      }
    };
    
    checkMessageLimits();
  }, [user, subscription]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // Send the message (empty string is allowed)
    await sendMessage(inputMessage, selectedPrompt);
    
    // Clear the input after sending
    setInputMessage('');
  };

  const isFreePlan = subscription?.subscription_plan_id === 'free';

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading || !isOnline}
        />
        <button
          type="submit"
          disabled={isLoading || !isOnline}
          className={`p-2 rounded-lg ${
            isLoading || !isOnline
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
        >
          <Send size={20} />
        </button>
      </div>

      {!isOnline && (
        <div className="mt-2 text-amber-600 text-sm">
          You are offline. Please reconnect to send messages.
        </div>
      )}

      {/* Free plan usage indicator */}
      {isFreePlan && user && (
        <UsageIndicator 
          usageType="messages_per_day" 
          label="messages" 
        />
      )}
      
      {systemPrompts.length > 0 && (
        <div className="mt-2 flex items-center text-sm">
          <span className="text-gray-600 mr-2">Using:</span>
          <select
            className="text-sm border border-gray-300 rounded-md p-1 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedPrompt}
            onChange={(e) => setSelectedPrompt(e.target.value)}
            disabled={isLoading}
          >
            {systemPrompts.map((prompt) => (
              <option key={prompt.prompt_id} value={prompt.name}>
                {prompt.name} - {prompt.description}
                {!isFreePlan && prompt.tag === 'premium' && ' (Premium)'}
              </option>
            ))}
          </select>
          
          {isFreePlan && (
            <div className="ml-2 flex items-center text-xs text-gray-500">
              <Lock size={12} className="mr-1" />
              <a href="/subscription" className="text-blue-600 hover:underline">
                Upgrade for more features
              </a>
            </div>
          )}
        </div>
      )}
    </form>
  );
};

export default ChatInput;