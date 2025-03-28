import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChatEventById } from '../services/chatService';
import { UserEvent, ChatMessage } from '../types/chat.types';
import { useAuth } from '../hooks/useAuth';
import ChatHistory from '../components/chat/ChatHistory';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { logger } from '../utils/logger';

const ChatDetailsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [chatEvent, setChatEvent] = useState<UserEvent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect if not authenticated
    if (!user) {
      navigate('/signin');
      return;
    }

    const fetchChatEvent = async () => {
      if (!eventId) return;

      setIsLoading(true);
      setError(null);
      try {
        const event = await getChatEventById(eventId);
        if (!event) {
          setError('Chat not found');
          return;
        }
        setChatEvent(event);

        // Reconstruct messages from the event details
        const reconstructedMessages: ChatMessage[] = [
          { role: 'user', content: event.event_details.prompt },
          { role: 'assistant', content: event.event_details.response }
        ];

        // If the event has stored messages, use those instead
        if (event.event_details.messages && event.event_details.messages.length > 0) {
          setMessages(event.event_details.messages);
        } else {
          setMessages(reconstructedMessages);
        }
      } catch (err) {
        logger.error('Error fetching chat event:', err);
        setError('Failed to load chat details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchChatEvent();
  }, [eventId, user, navigate]);

  // Format date for display
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-t-2 border-b-2 border-blue-600 rounded-full"></div>
      </div>
    );
  }

  if (error || !chatEvent) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-red-700 mb-2">Error</h2>
          <p className="text-red-600 mb-4">{error || 'Chat not found'}</p>
          <button
            onClick={() => navigate('/history')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to History
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/history')}
            className="flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to History
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <h1 className="text-xl font-bold text-gray-800">Chat Details</h1>
            
            <div className="flex flex-wrap items-center mt-2 text-sm text-gray-600">
              <div className="flex items-center mr-4 mb-2">
                <Calendar className="h-4 w-4 mr-1" />
                <span>{formatDate(chatEvent.created_at)}</span>
              </div>
              
              {chatEvent.event_details.systemPromptName && (
                <div className="flex items-center mb-2">
                  <Tag className="h-4 w-4 mr-1" />
                  <span>System Prompt: {chatEvent.event_details.systemPromptName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <ChatHistory messages={messages} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatDetailsPage;