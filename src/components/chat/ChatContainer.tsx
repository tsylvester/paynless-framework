import React from 'react';
import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import { useChat } from '../../context/ChatContext';

interface ChatContainerProps {
  onSubmitWithoutAuth?: (message: string) => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({ onSubmitWithoutAuth }) => {
  const { messages, isLoading, error, clearChat } = useChat();

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
          {error.message}
        </div>
      )}
      
      <div className="border-t border-gray-200 p-4">
        <ChatInput onSubmitWithoutAuth={onSubmitWithoutAuth} />
      </div>
    </div>
  );
};

export default ChatContainer;