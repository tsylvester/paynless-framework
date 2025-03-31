import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { ConversationsList } from '../../components/messaging/ConversationsList';
import { socialService } from '../../services/social/index';
import { Conversation } from '../../types/message.types';
import { logger } from '../../utils/logger';
import { Loader, Search, PlusCircle } from 'lucide-react';

export function MessagingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Load conversations
  const loadConversations = async (shouldReset = false) => {
    try {
      const fetchCursor = shouldReset ? undefined : cursor;
      if (shouldReset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const conversationsResult = await socialService.getConversations(fetchCursor);
      
      if (conversationsResult) {
        if (shouldReset) {
          setConversations(conversationsResult.conversations || []);
        } else {
          setConversations(prevConversations => [...prevConversations, ...(conversationsResult.conversations || [])]);
        }
        
        setCursor(conversationsResult.pagination?.nextCursor);
        setHasMore(conversationsResult.pagination?.hasMore || false);
      } else {
        setError('Failed to load conversations. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error loading conversations', {
        error: errorMessage,
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };
  
  // Load conversations on initial render
  useEffect(() => {
    loadConversations(true);
  }, []);
  
  // Check for userId in query params to start a new conversation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const userId = params.get('userId');
    
    if (userId) {
      // Navigate to a new conversation with this user
      // In a real app, you'd check if a conversation already exists
      // For now, we'll simulate starting a new conversation
      const startNewConversation = async () => {
        try {
          // Send a placeholder message to create the conversation
          const message = await socialService.sendMessage(userId, 'Hello!');
          
          if (message) {
            // Navigate to the conversation
            navigate(`/messages/${message.conversationId}`, { replace: true });
          }
        } catch (error) {
          logger.error('Error starting new conversation', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId,
          });
          setError('Failed to start conversation. Please try again.');
        }
      };
      
      startNewConversation();
    }
  }, [location, navigate]);
  
  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="flex flex-col md:flex-row h-[calc(100vh-12rem)]">
            {/* Conversations sidebar */}
            <div className="w-full md:w-80 border-r border-gray-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-200">
                <h1 className="text-xl font-bold text-gray-900">Messages</h1>
                
                <div className="mt-2 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>
              
              <div className="overflow-y-auto flex-1">
                {error && (
                  <div className="p-4 text-sm text-red-600 bg-red-50">
                    {error}
                  </div>
                )}
                
                <ConversationsList
                  conversations={conversations}
                  isLoading={isLoading}
                  hasMore={hasMore}
                  onLoadMore={() => loadConversations()}
                />
              </div>
              
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    // In a real app, this would open a modal to select a user
                    // For demo purposes, we'll just show an alert
                    alert('This would open a user selection modal in a real app');
                  }}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  New Message
                </button>
              </div>
            </div>
            
            {/* Empty state or selected conversation */}
            <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
              <div className="text-center p-8">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Select a conversation
                </h3>
                <p className="text-gray-500 max-w-md">
                  Choose a conversation from the list or start a new one to begin messaging.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}