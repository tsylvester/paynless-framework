import React, { useState, useEffect } from 'react';
import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import { useChat } from '../../hooks/useChat';

const ChatContainer: React.FC = () => {
  const { messages, isLoading, error, clearChat, sendMessage } = useChat();
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const handleRetry = () => {
    if (retryMessage) {
      sendMessage(retryMessage);
      setRetryMessage(null);
    }
  };

  // Set retry message when there's an error
  useEffect(() => {
    if (error && messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        setRetryMessage(lastUserMessage.content);
      }
    }
  }, [error, messages]);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
      <div className="border-b border-gray-200 p-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Chat with AI</h2>
        
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-sm text-gray-600 hover:text-red-600"
          >
            Clear Chat
          </button>
        )}
      </div>
      
      <div className="h-[400px] overflow-y-auto">
        <ChatHistory messages={messages} isLoading={isLoading} />
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 mx-4 my-2 rounded-md">
          <p>{error.message}</p>
          {retryMessage && (
            <button 
              onClick={handleRetry}
              className="mt-2 text-sm bg-red-100 px-3 py-1 rounded-md hover:bg-red-200"
            >
              Retry Last Message
            </button>
          )}
        </div>
      )}
      
      <div className="border-t border-gray-200 p-4">
        <ChatInput />
      </div>
    </div>
  );
};

export default ChatContainer;