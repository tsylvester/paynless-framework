import React from 'react';
import { ChatMessage as ChatMessageType } from '../../types/chat.types';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div 
      className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div 
        className={`flex items-start max-w-3xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      >
        <div 
          className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-blue-100 ml-2' : 'bg-gray-100 mr-2'
          }`}
        >
          {isUser ? (
            <User size={16} className="text-blue-600" />
          ) : (
            <Bot size={16} className="text-gray-600" />
          )}
        </div>
        
        <div 
          className={`rounded-lg px-4 py-2 ${
            isUser 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="markdown prose">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;