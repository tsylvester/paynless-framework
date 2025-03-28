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
    
    const message = inputMessage.trim();
    if (!message) return;
    
    // If user is not authenticated, prepare for auth flow and return
    if (!user) {
      // The navigateToAuth will prepare the message to be sent after auth
      navigateToAuth('/signin');
      return;
    }
    
    // If user has reached their message limit, don't send
    if (hasReachedLimit) {
      return;
    }
    
    // Send the message
    await sendMessage(message, selectedPrompt);
    setInputMessage('');
  };

  // Determine if this is a free plan
  const isFreePlan = subscription?.subscription_plan_id === 'free';

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <textarea
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder={hasReachedLimit ? "You've reached your daily message limit" : "Ask me anything..."}
          rows={3}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={isLoading || !isOnline || hasReachedLimit}
        />
        
        <button
          type="submit"
          className="absolute right-3 bottom-3 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          disabled={isLoading || !inputMessage.trim() || !isOnline || hasReachedLimit}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
          ) : (
            <Send size={18} />
          )}
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