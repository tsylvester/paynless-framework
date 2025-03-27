import React from 'react';
import { ChatMessage as ChatMessageType } from '../../types/chat.types';
import ChatMessage from './ChatMessage';

interface ChatHistoryProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, isLoading = false }) => {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10 text-gray-500">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col space-y-2 p-4">
      {messages
        .filter(msg => msg.role !== 'system') // Don't show system messages
        .map((message, index) => (
          <ChatMessage key={index} message={message} />
        ))}
      
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="animate-pulse flex space-x-2">
            <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
            <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
            <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatHistory;