import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ChatContainer from '../components/chat/ChatContainer';
import { getUserChatHistory } from '../services/chatService';
import ChatHistoryCard from '../components/chat/ChatHistoryCard';
import { UserEvent } from '../types/chat.types';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

const Landing: React.FC = () => {
  const { user } = useAuth();
  const [recentChats, setRecentChats] = useState<UserEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Load recent chats for authenticated users
  useEffect(() => {
    if (user) {
      const loadRecentChats = async () => {
        setIsLoading(true);
        try {
          const chatHistory = await getUserChatHistory(5); // Get 5 most recent chats
          setRecentChats(chatHistory);
        } catch (error) {
          console.error('Error loading recent chats:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadRecentChats();
    }
  }, [user]);

  // Pass the onSubmitWithoutAuth prop to maintain the interface but we don't need to do anything
  // since the ChatInput now handles storing the message in localStorage
  const handleSubmitWithoutAuth = () => {
    // The actual storage of the message is now handled in ChatInput
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <ChatContainer onSubmitWithoutAuth={handleSubmitWithoutAuth} />
        </div>

        {user && (
          <div className="mt-12">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                <MessageSquare className="h-5 w-5 mr-2 text-blue-600" />
                Recent Conversations
              </h2>
              
              <button
                onClick={() => navigate('/history')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View All
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-t-2 border-b-2 border-blue-600 rounded-full"></div>
              </div>
            ) : recentChats.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentChats.map(chat => (
                  <ChatHistoryCard key={chat.event_id} event={chat} />
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <p className="text-gray-600">You don't have any chat history yet.</p>
                <p className="text-gray-500 text-sm mt-2">Start a conversation to see your history here!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Landing;