import React, { createContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatMessage, ChatContextType, SystemPrompt } from '../types/chat.types';
import { sendChatMessage, getSystemPrompts } from '../services/chatService';
import { useAuth } from '../hooks/useAuth';
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
  navigateToAuth: () => {}, 
};

export const ChatContext = createContext<ChatContextType>(initialState);

// Define specific storage keys
const PENDING_MESSAGE_KEY = 'pendingChatMessage';
const PENDING_PROMPT_KEY = 'pendingSystemPrompt';
const NAVIGATION_TYPE_KEY = 'chatNavigationType';

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('default');
  
  const { user, isOnline } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const previousPathRef = useRef<string>('');
  
  // Add useEffect to fetch system prompts
  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const prompts = await getSystemPrompts();
        setSystemPrompts(prompts);
      } catch (err) {
        logger.error('Error fetching system prompts:', err);
      }
    };
    fetchPrompts();
  }, []);
  
  // Function to prepare for auth flow navigation
  const prepareAuthNavigation = useCallback((message: string, systemPromptName: string = selectedPrompt) => {
    localStorage.setItem(PENDING_MESSAGE_KEY, message);
    localStorage.setItem(PENDING_PROMPT_KEY, systemPromptName);
    localStorage.setItem(NAVIGATION_TYPE_KEY, 'auth-flow');
  }, [selectedPrompt]);
  
  // Updated sendMessage function wrapped in useCallback
  const sendMessage = useCallback(async (message: string, systemPromptName: string = selectedPrompt) => {
    if (!message.trim()) return;
    
    if (!isOnline) {
      setError(new Error('Cannot send messages while offline. Please check your internet connection.'));
      return;
    }
    
    // If user is not authenticated, prepare for auth flow and return
    if (!user) {
      prepareAuthNavigation(message, systemPromptName);
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
      
      const { messages: updatedMessages } = await sendChatMessage(
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
  }, [user, isOnline, messages, selectedPrompt, prepareAuthNavigation]);
  
  // Load any pending message on auth success
  useEffect(() => {
    if (user) {
      const navigationType = localStorage.getItem(NAVIGATION_TYPE_KEY);
      const pendingMessage = localStorage.getItem(PENDING_MESSAGE_KEY);
      const pendingPrompt = localStorage.getItem(PENDING_PROMPT_KEY);
      
      // Only process pending message if navigation type indicates auth flow
      if (navigationType === 'auth-flow' && pendingMessage) {
        logger.info('Processing pending message after authentication');
        
        // Use the stored prompt or fallback to default
        const promptToUse = pendingPrompt || selectedPrompt;
        
        // Send the pending message
        sendMessage(pendingMessage, promptToUse);
        
        // Clear the pending state
        localStorage.removeItem(PENDING_MESSAGE_KEY);
        localStorage.removeItem(PENDING_PROMPT_KEY);
        localStorage.removeItem(NAVIGATION_TYPE_KEY);
      }
    }
  }, [user, selectedPrompt, sendMessage]);
  
  // Path change detection for chat clearing
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Define which routes should preserve chat history
    const chatRoutes = ['/', '/home'];
    const isCurrentChatRoute = chatRoutes.some(route => currentPath === route);
    const isPreviousChatRoute = chatRoutes.some(route => previousPathRef.current === route);
    
    // Check if we're moving away from a chat route to a non-chat route
    if (isPreviousChatRoute && !isCurrentChatRoute) {
      const navigationType = localStorage.getItem(NAVIGATION_TYPE_KEY);
      
      // Only clear if it's not part of the auth flow
      if (navigationType !== 'auth-flow') {
        logger.debug(`Navigated away from chat page to ${currentPath}, clearing chat`);
        clearChat();
      }
    }
    
    // Update previous path reference
    previousPathRef.current = currentPath;
  }, [location.pathname]);
  
  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

    // Function to handle navigation to auth pages
    const navigateToAuth = (path: string = '/signin') => {
      // Mark this as part of auth flow to prevent chat clearing
      localStorage.setItem(NAVIGATION_TYPE_KEY, 'auth-flow');
      navigate(path);
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
      navigateToAuth, // Expose this function for components
    };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};