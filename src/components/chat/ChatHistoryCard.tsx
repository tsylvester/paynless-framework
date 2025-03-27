import React from 'react';
import { UserEvent } from '../../types/chat.types';
import { Clock, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ChatHistoryCardProps {
  event: UserEvent;
}

const ChatHistoryCard: React.FC<ChatHistoryCardProps> = ({ event }) => {
  // Format the created_at time to a readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Get a snippet of the conversation
  const getPromptSnippet = (description: string) => {
    return description.length > 100 ? `${description.substring(0, 97)}...` : description;
  };

  return (
    <Link 
      to={`/history/${event.event_id}`}
      className="block border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200 bg-white overflow-hidden"
    >
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center">
          <MessageSquare size={16} className="text-blue-600 mr-2" />
          <span className="font-medium text-gray-800">Chat Session</span>
        </div>
        <div className="flex items-center text-sm text-gray-500">
          <Clock size={14} className="mr-1" />
          <span>{formatDate(event.created_at)}</span>
        </div>
      </div>
      
      <div className="p-4">
        <p className="text-gray-800 font-medium mb-2">
          {getPromptSnippet(event.event_description)}
        </p>
        
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">
            System prompt: {event.event_details.systemPromptName || 'default'}
          </span>
          <span className="text-sm text-blue-600">View →</span>
        </div>
      </div>
    </Link>
  );
};

export default ChatHistoryCard;