import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { User, Check, CheckCheck } from 'lucide-react';
import { Conversation } from '../../types/message.types';
import { useAuth } from '../../hooks/useAuth';

interface ConversationsListProps {
  conversations: Conversation[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function ConversationsList({ conversations, isLoading, hasMore, onLoadMore }: ConversationsListProps) {
  const { user } = useAuth();
  const location = useLocation();
  
  if (isLoading && (!conversations || conversations.length === 0)) {
    return (
      <div className="py-4">
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }
  
  if (!conversations || conversations.length === 0) {
    return (
      <div className="py-4 text-center text-gray-500">
        <p>No conversations yet.</p>
        <p className="text-sm mt-1">Start messaging someone to begin a conversation!</p>
      </div>
    );
  }
  
  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case 'read':
        return <CheckCheck className="h-4 w-4 text-blue-500" />;
      case 'delivered':
        return <Check className="h-4 w-4 text-gray-500" />;
      default:
        return <Check className="h-4 w-4 text-gray-400" />;
    }
  };
  
  const getOtherParticipant = (conversation: Conversation) => {
    if (!user) return '';
    const otherParticipantId = conversation.participants.find(id => id !== user.id);
    return otherParticipantId || '';
  };
  
  return (
    <div className="space-y-1">
      {conversations.map((conversation) => {
        const otherParticipantId = getOtherParticipant(conversation);
        const isActive = location.pathname === `/messages/${conversation.id}`;
        
        return (
          <Link
            key={conversation.id}
            to={`/messages/${conversation.id}`}
            className={`block px-4 py-3 rounded-lg ${
              isActive 
                ? 'bg-indigo-50 border-l-4 border-indigo-500' 
                : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="relative flex-shrink-0">
                <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-6 w-6 text-gray-500" />
                </div>
                {conversation.unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                    {conversation.unreadCount}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {otherParticipantId || 'Unknown User'}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {conversation.lastMessage ? 
                      formatDistanceToNow(new Date(conversation.lastMessage.createdAt), { addSuffix: true }) : 
                      formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {conversation.lastMessage && (
                  <div className="flex items-center mt-1">
                    <p className="text-sm text-gray-600 truncate flex-1">
                      {conversation.lastMessage.senderId === user?.id && (
                        <span className="font-medium text-gray-700 mr-1">You:</span>
                      )}
                      {conversation.lastMessage.content}
                    </p>
                    {conversation.lastMessage.senderId === user?.id && (
                      <div className="ml-2 flex-shrink-0">
                        {getMessageStatusIcon(conversation.lastMessage.status)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
      
      {hasMore && (
        <div className="text-center pt-2 pb-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className={`px-4 py-2 text-sm text-indigo-600 hover:text-indigo-800 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Loading...' : 'Load more conversations'}
          </button>
        </div>
      )}
    </div>
  );
}