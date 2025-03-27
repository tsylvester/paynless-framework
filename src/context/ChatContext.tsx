import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { ChatMessage, ChatContextType, SystemPrompt } from '../types/chat.types';
import { sendChatMessage, getSystemPrompts } from '../services/chatService';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';

const initialState: ChatContextType = {
  messages: [],
  isLoading: false,
  error: null,
  sendMessage: async () => {},
  clearChat: () => {},
  systemPrompts: [],
  selectedPrompt: 'default',
  setSelectedPrompt: () => {},
};

export const ChatContext = createContext<ChatContextType>(initialState);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('default');
  
  const { user, isOnline } = useAuth();

  // Fetch available system prompts
  useEffect(() => {
    const fetchSystemPrompts = async () => {
      try {
        const prompts = await getSystemPrompts();
        setSystemPrompts(prompts);
      } catch (err) {
        logger.error('Error fetching system prompts:', err);
      }
    };

    fetchSystemPrompts();
  }, [user]);

  const sendMessage = async (message: string, systemPromptName: string = selectedPrompt) => {
    if (!message.trim()) return;
    
    if (!isOnline) {
      setError(new Error('Cannot send messages while offline. Please check your internet connection.'));
      return;
    }
    
    if (!user) {
      setError(new Error('You must be signed in to use the chat feature.'));
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    // Add user message immediately for better UX
    const userMessage: ChatMessage = { role: 'user', content: message };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    try {
      // Filter messages to only include user and assistant for the API call
      const previousMessages = messages.filter(msg => msg.role !== 'system');
      
      const { response, messages: updatedMessages } = await sendChatMessage(
        message,
        previousMessages,
        systemPromptName
      );
      
      // Update with complete message history from the response
      setMessages(updatedMessages);
      
      logger.info('Message sent successfully');
    } catch (err) {
      logger.error('Error sending message:', err);
      setError(err as Error);
      
      // Keep the user message but add an error indicator
      const errorMessage: ChatMessage = { 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request. Please try again later.' 
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const value = {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    systemPrompts,
    selectedPrompt,
    setSelectedPrompt,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  
  return context;
};