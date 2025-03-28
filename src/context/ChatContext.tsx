// Path: src/context/ChatContext.tsx
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
  conversationId: null,
};

export const ChatContext = createContext<ChatContextType>(initialState);

// Define specific storage keys
const PENDING_MESSAGE_KEY = 'pendingChatMessage';
const PENDING_PROMPT_KEY = 'pendingSystemPrompt';
const NAVIGATION_TYPE_KEY = 'chatNavigationType';
const CHAT_MESSAGES_KEY = 'chatMessages';
const CONVERSATION_ID_KEY = 'currentConversationId';

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('default');
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  const { user, isOnline } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const previousPathRef = useRef<string>('');
  const retryTimeoutRef = useRef<number | null>(null);
  const sendMessageRef = useRef<((message: string, systemPromptName?: string) => Promise<void>) | null>(null);
  const retryMessageRef = useRef<{ message: string; systemPromptName: string } | null>(null);
  const previousUserStateRef = useRef<boolean>(!!user);

  // Function to generate a new conversation ID
  const generateConversationId = useCallback(() => {
    // Use crypto.randomUUID() if available, otherwise fallback to a simple UUID generator
    const newId = crypto.randomUUID ? crypto.randomUUID() : 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    return newId;
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    
    // Generate a new conversation ID when starting a fresh chat
    const newId = generateConversationId();
    setConversationId(newId);
    localStorage.setItem(CONVERSATION_ID_KEY, newId);
    
    // Clear saved chat messages from localStorage
    localStorage.removeItem(CHAT_MESSAGES_KEY);
    
    logger.info('Chat cleared, new conversation ID generated:', newId);
  }, [generateConversationId]);

  // Function to save current chat to localStorage
  const saveChatToLocalStorage = useCallback((chatMessages: ChatMessage[]) => {
    try {
      localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(chatMessages));
    } catch (err) {
      logger.error('Error saving chat to localStorage:', err);
    }
  }, []);

  // Function to load chat from localStorage
  const loadChatFromLocalStorage = useCallback(() => {
    try {
      const savedChat = localStorage.getItem(CHAT_MESSAGES_KEY);
      if (savedChat) {
        const parsedChat = JSON.parse(savedChat);
        if (Array.isArray(parsedChat) && parsedChat.length > 0) {
          logger.info('Loaded saved chat from localStorage');
          return parsedChat as ChatMessage[];
        }
      }
    } catch (err) {
      logger.error('Error loading chat from localStorage:', err);
    }
    return null;
  }, []);
  
  // Load saved messages and conversation ID on initial mount
  useEffect(() => {
    // Load conversation ID first
    const savedConversationId = localStorage.getItem(CONVERSATION_ID_KEY);
    if (savedConversationId) {
      setConversationId(savedConversationId);
      logger.info('Loaded existing conversation ID:', savedConversationId);
    } else {
      // If no existing conversation ID, generate a new one
      const newId = generateConversationId();
      setConversationId(newId);
      localStorage.setItem(CONVERSATION_ID_KEY, newId);
      logger.info('Generated new conversation ID:', newId);
    }
    
    // Then load saved messages
    const savedMessages = loadChatFromLocalStorage();
    if (savedMessages) {
      setMessages(savedMessages);
    }
  }, [loadChatFromLocalStorage, generateConversationId]);
  
  // Add useEffect to fetch system prompts
  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const prompts = await getSystemPrompts();
        setSystemPrompts(prompts);
        
        // If we have a saved preferred prompt and it exists in the fetched prompts,
        // use it as the selected prompt
        const savedPrompt = localStorage.getItem(PENDING_PROMPT_KEY);
        if (savedPrompt && prompts.some(p => p.name === savedPrompt)) {
          setSelectedPrompt(savedPrompt);
        }
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
  
  // Auto retry mechanism for failed messages
  const scheduleRetry = useCallback((message: string, systemPromptName: string) => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
    }
    
    retryMessageRef.current = { message, systemPromptName };
    
    // Retry after 3 seconds
    retryTimeoutRef.current = window.setTimeout(() => {
      if (user && isOnline && sendMessageRef.current && retryMessageRef.current) {
        logger.info('Attempting to retry failed message');
        sendMessageRef.current(retryMessageRef.current.message, retryMessageRef.current.systemPromptName);
      }
    }, 3000);
  }, [user, isOnline]);
  
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
    
    // If there's no conversationId yet, create one
    if (!conversationId) {
      const newId = generateConversationId();
      setConversationId(newId);
      localStorage.setItem(CONVERSATION_ID_KEY, newId);
      logger.info('Generated new conversation ID during send message:', newId);
    }
    
    // Add user message immediately for better UX
    const userMessage: ChatMessage = { role: 'user', content: message };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Save the updated messages to localStorage
    saveChatToLocalStorage(updatedMessages);
    
    try {
      // Filter messages to only include user and assistant for the API call
      const previousMessages = messages.filter(msg => msg.role !== 'system');
      
      const { messages: responseMessages } = await sendChatMessage(
        message,
        previousMessages,
        systemPromptName,
        conversationId // Pass the conversationId to the chat service
      );
      
      // Update with complete message history from the response
      setMessages(responseMessages);
      
      // Save the response messages to localStorage
      saveChatToLocalStorage(responseMessages);
      
      logger.info('Message sent successfully with conversation ID:', conversationId);
    } catch (err) {
      logger.error('Error sending message:', err);
      setError(err as Error);
      
      // If the error is an auth error, schedule a retry after user logs in again
      if ((err as Error).message.includes('session') || (err as Error).message.includes('sign in')) {
        scheduleRetry(message, systemPromptName);
      }
      
      // Keep the user message but add an error indicator
      const errorMessage: ChatMessage = { 
        role: 'assistant', 
        content: `Error: ${(err as Error).message || 'There was a problem sending your message. Please try again.'}` 
      };
      const messagesWithError = [...updatedMessages, errorMessage];
      setMessages(messagesWithError);
      
      // Save even the error state to localStorage to preserve context
      saveChatToLocalStorage(messagesWithError);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline, messages, selectedPrompt, conversationId, generateConversationId, prepareAuthNavigation, saveChatToLocalStorage, scheduleRetry]);
  
  // Store sendMessage in ref
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  
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
  
  // Detect user sign in/out changes and handle conversation ID appropriately
  useEffect(() => {
    // Check if user state has changed from logged in to logged out
    const wasLoggedIn = previousUserStateRef.current;
    const isLoggedIn = !!user;
    
    // Update the ref to the current state for the next check
    previousUserStateRef.current = isLoggedIn;
    
    // Only take action if the user has signed out (was logged in, now is not)
    if (wasLoggedIn && !isLoggedIn) {
      // User signed out, generate a new conversation ID for next session
      const newId = generateConversationId();
      setConversationId(newId);
      localStorage.setItem(CONVERSATION_ID_KEY, newId);
      logger.info('User signed out, generated new conversation ID:', newId);
      
      // Clear messages when user signs out
      setMessages([]);
      localStorage.removeItem(CHAT_MESSAGES_KEY);
    }
  }, [user, generateConversationId]);
  
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
  }, [location.pathname, clearChat]);

  // Function to handle navigation to auth pages
  const navigateToAuth = useCallback((path: string = '/signin') => {
    // Mark this as part of auth flow to prevent chat clearing
    localStorage.setItem(NAVIGATION_TYPE_KEY, 'auth-flow');
    navigate(path);
  }, [navigate]);
    
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
    conversationId,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};