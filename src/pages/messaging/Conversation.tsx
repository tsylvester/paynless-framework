import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { MessagesList } from '../../components/messaging/MessagesList';
import { SendMessageForm } from '../../components/messaging/SendMessageForm';
import { socialService } from '../../services/social/index';
import { Message, Conversation } from '../../types/message.types';
import { logger } from '../../utils/logger';
import { useAuth } from '../../hooks/useAuth';
import { ArrowLeft, User, MoreHorizontal, PhoneCall, Video } from 'lucide-react';

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [recipientId, setRecipientId] = useState<string>('');
  
  // Helper to get the other participant's ID
  const getOtherParticipantId = (conv: Conversation) => {
    if (!user) return '';
    return conv.participants.find(id => id !== user.id) || '';
  };
  
  // Load conversation details
  useEffect(() => {
    const loadConversation = async () => {
      if (!conversationId || !user) return;
      
      try {
        setIsLoading(true);
        
        // Get all conversations (in a real app, we'd have a getConversation endpoint)
        const conversationsResult = await socialService.getConversations();
        
        if (conversationsResult) {
          const foundConversation = conversationsResult.conversations.find(c => c.id === conversationId);
          
          if (foundConversation) {
            setConversation(foundConversation);
            setRecipientId(getOtherParticipantId(foundConversation));
            
            // If there are unread messages, mark them as read
            if (foundConversation.unreadCount > 0) {
              // This would be a call to mark messages as read
              // socialService.markMessagesAsRead(conversationId, user.id);
            }
          } else {
            setError('Conversation not found');
          }
        } else {
          setError('Failed to load conversation. Please try again.');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMessage);
        logger.error('Error loading conversation', {
          error: errorMessage,
          conversationId,
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadConversation();
  }, [conversationId, user]);
  
  // Load messages
  const loadMessages = async (shouldReset = false) => {
    if (!conversationId) return;
    
    try {
      const fetchCursor = shouldReset ? undefined : cursor;
      if (shouldReset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const messagesResult = await socialService.getMessages(conversationId, fetchCursor);
      
      if (messagesResult) {
        // Sort messages by date (most recent last)
        const sortedMessages = [...messagesResult.messages].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        if (shouldReset) {
          setMessages(sortedMessages);
        } else {
          setMessages(prevMessages => {
            // Combine and sort all messages
            const allMessages = [...prevMessages, ...sortedMessages];
            return allMessages.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });
        }
        
        setCursor(messagesResult.pagination.nextCursor);
        setHasMore(messagesResult.pagination.hasMore);
      } else {
        setError('Failed to load messages. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error loading messages', {
        error: errorMessage,
        conversationId,
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };
  
  // Load messages on initial render
  useEffect(() => {
    if (conversationId) {
      loadMessages(true);
    }
  }, [conversationId]);
  
  // Handle message sent
  const handleMessageSent = () => {
    loadMessages(true);
  };
  
  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="flex flex-col h-[calc(100vh-12rem)]">
            {/* Conversation header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center">
                <button
                  onClick={() => navigate('/messages')}
                  className="md:hidden mr-3 text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-6 w-6 text-gray-500" />
                  </div>
                  <div>
                    <h2 className="text-md font-medium text-gray-900">
                      {recipientId || 'Unknown User'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      Active now
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button className="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                  <PhoneCall className="h-5 w-5" />
                </button>
                <button className="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                  <Video className="h-5 w-5" />
                </button>
                <button className="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            {/* Messages area */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                  {error}
                </div>
              )}
              
              <MessagesList
                messages={messages}
                isLoading={isLoading}
                hasMore={hasMore}
                onLoadMore={() => loadMessages()}
              />
            </div>
            
            {/* Message input */}
            {recipientId && (
              <SendMessageForm 
                recipientId={recipientId} 
                onMessageSent={handleMessageSent} 
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}