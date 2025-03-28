import React, { useState, FormEvent } from 'react';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';
import { Send } from 'lucide-react';
const ChatInput: React.FC = () => {
  const [inputMessage, setInputMessage] = useState('');
  const { sendMessage, isLoading, selectedPrompt, systemPrompts, navigateToAuth, setSelectedPrompt } = useChat();
  const { user, isOnline } = useAuth();

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
    
    // Send the message
    await sendMessage(message, selectedPrompt);
    setInputMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <textarea
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder="Ask me anything..."
          rows={3}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={isLoading || !isOnline}
        />
        
        <button
          type="submit"
          className="absolute right-3 bottom-3 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          disabled={isLoading || !inputMessage.trim() || !isOnline}
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
              </option>
            ))}
          </select>
        </div>
      )}
    </form>
  );
};

export default ChatInput;

