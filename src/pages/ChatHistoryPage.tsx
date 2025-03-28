import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getUserChatHistory } from '../services/chatService';
import { UserEvent } from '../types/chat.types';
import ChatHistoryCard from '../components/chat/ChatHistoryCard';
import { History, Search, AlertTriangle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';

const ChatHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [chatHistory, setChatHistory] = useState<UserEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect if not authenticated
    if (!user) {
      navigate('/signin');
      return;
    }

    fetchChatHistory();
  }, [user, navigate]);

  const fetchChatHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const history = await getUserChatHistory(50); // Get up to 50 recent chats
      setChatHistory(history);
    } catch (err) {
      logger.error('Error fetching chat history:', err);
      setError('Failed to load chat history. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChat = (eventId: string) => {
    // Update local state to remove the deleted chat
    setChatHistory(prev => prev.filter(chat => chat.event_id !== eventId));
    // Show a success message
    setTimeout(() => {
      const successElement = document.getElementById('delete-success');
      if (successElement) {
        successElement.classList.remove('hidden');
        setTimeout(() => {
          successElement.classList.add('hidden');
        }, 3000);
      }
    }, 100);
  };

  const filteredHistory = searchTerm
    ? chatHistory.filter(chat => 
        chat.event_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (chat.event_details?.prompt?.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : chatHistory;

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center">
            <History className="mr-3 h-7 w-7 text-blue-600" />
            Chat History
          </h1>
          <p className="text-gray-600 mt-2">
            View and search through your past conversations
          </p>
        </header>

        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search your conversations..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-10 w-10 border-t-2 border-b-2 border-blue-600 rounded-full"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => fetchChatHistory()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600 text-lg">
              {searchTerm ? 'No conversations match your search' : 'No conversation history yet'}
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Start a New Chat
            </button>
          </div>
        ) : (
          <>
            {/* Success notification for deleted chats */}
            <div id="delete-success" className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-md hidden transition-opacity duration-300 z-50">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Chat deleted successfully</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredHistory.map(chat => (
                <ChatHistoryCard 
                  key={chat.event_id} 
                  event={chat} 
                  onDelete={handleDeleteChat}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryPage;