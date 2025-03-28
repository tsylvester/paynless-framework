import React, { useState } from 'react';
import { UserEvent } from '../../types/chat.types';
import { Clock, MessageSquare, Trash2, X, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { deleteChatEvent } from '../../services/chatService';
import { logger } from '../../utils/logger';

interface ChatHistoryCardProps {
  event: UserEvent;
  onDelete?: (eventId: string) => void;
}

const ChatHistoryCard: React.FC<ChatHistoryCardProps> = ({ event, onDelete }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation to chat details
    e.stopPropagation(); // Prevent event bubbling
    setShowDeleteConfirm(true);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    setError(null);

    try {
      const success = await deleteChatEvent(event.event_id);
      if (success) {
        logger.info(`Chat ${event.event_id} deleted successfully`);
        setShowDeleteConfirm(false);
        // Notify parent component about deletion
        if (onDelete) {
          onDelete(event.event_id);
        }
      } else {
        setError('Failed to delete chat history');
      }
    } catch (err) {
      logger.error('Error deleting chat history:', err);
      setError('An error occurred while deleting the chat');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="block border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200 bg-white overflow-hidden relative">
      {/* Delete button (visible when not in delete confirmation mode) */}
      {!showDeleteConfirm && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full z-10"
          aria-label="Delete conversation"
        >
          <Trash2 size={16} />
        </button>
      )}

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white bg-opacity-95 flex flex-col items-center justify-center p-4 z-20">
          <AlertTriangle className="text-amber-500 mb-2" size={24} />
          <h3 className="text-lg font-medium mb-1">Delete this conversation?</h3>
          <p className="text-sm text-gray-600 mb-4 text-center">
            This action cannot be undone.
          </p>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-2 rounded-md mb-3 text-sm w-full text-center">
              {error}
            </div>
          )}
          
          <div className="flex space-x-3">
            <button
              onClick={handleCancelDelete}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Card content - wrapped in Link for navigation when not deleting */}
      <Link 
        to={`/history/${event.event_id}`}
        className="block"
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
    </div>
  );
};

export default ChatHistoryCard;