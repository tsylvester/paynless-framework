import React, { useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Message } from '../../types/message.types';
import { useAuth } from '../../hooks/useAuth';

interface MessagesListProps {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function MessagesList({ messages, isLoading, hasMore, onLoadMore }: MessagesListProps) {
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages come in
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  if (isLoading && messages.length === 0) {
    return (
      <div className="py-4">
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-gray-200 rounded w-3/4 ml-auto"></div>
          <div className="h-10 bg-gray-200 rounded w-2/3"></div>
          <div className="h-10 bg-gray-200 rounded w-1/2 ml-auto"></div>
        </div>
      </div>
    );
  }
  
  if (messages.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        <p>No messages yet.</p>
        <p className="text-sm mt-1">Start the conversation by sending a message!</p>
      </div>
    );
  }
  
  // Group messages by date
  const groupedMessages: { [date: string]: Message[] } = {};
  messages.forEach(message => {
    const date = new Date(message.createdAt).toLocaleDateString();
    if (!groupedMessages[date]) {
      groupedMessages[date] = [];
    }
    groupedMessages[date].push(message);
  });
  
  // Sort dates in ascending order (oldest first)
  const sortedDates = Object.keys(groupedMessages).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  );
  
  return (
    <div className="flex flex-col space-y-4">
      {hasMore && (
        <div className="text-center py-2">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className={`px-4 py-2 text-sm text-indigo-600 hover:text-indigo-800 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Loading...' : 'Load more messages'}
          </button>
        </div>
      )}
      
      {sortedDates.map(date => (
        <div key={date} className="space-y-3">
          <div className="text-center">
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
              {new Date(date).toLocaleDateString() === new Date().toLocaleDateString()
                ? 'Today'
                : date}
            </span>
          </div>
          
          {groupedMessages[date].map(message => {
            const isCurrentUser = message.senderId === user?.id;
            return (
              <div 
                key={message.id} 
                className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-lg ${
                    isCurrentUser
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-gray-200 text-gray-800 rounded-bl-none'
                  }`}
                >
                  <p>{message.content}</p>
                  <div className={`text-xs mt-1 ${isCurrentUser ? 'text-indigo-200' : 'text-gray-500'}`}>
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      
      <div ref={messagesEndRef} />
    </div>
  );
}