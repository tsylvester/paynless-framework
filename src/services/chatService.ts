// Path: src/services/chatService.ts
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { ChatMessage, SystemPrompt, UserEvent, ChatSession, ChatParticipant } from '../types/chat.types';
import { withRetry } from '../utils/retry';
import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

/**
 * Prepares messages array with system prompt and user message
 */
const prepareMessages = (
  systemPrompt: string,
  previousMessages: ChatMessage[],
  userPrompt: string,
  userId?: string,
  userName?: string
): ChatMessage[] => {
  const systemMessage: ChatMessage = {
    role: 'system',
    content: systemPrompt,
    timestamp: new Date().toISOString()
  };
  
  const userMessage: ChatMessage = {
    role: 'user',
    content: userPrompt || systemPrompt,
    userId,
    userName,
    timestamp: new Date().toISOString()
  };
  
  return [
    systemMessage,
    ...previousMessages.filter(msg => msg.role !== 'system'),
    userMessage
  ];
};

/**
 * Creates a new chat session
 */
export const createChatSession = async (participants: ChatParticipant[]): Promise<ChatSession> => {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      throw new Error('User must be authenticated to create chat session');
    }

    const newSession: ChatSession = {
      sessionId: crypto.randomUUID(),
      participants,
      createdBy: sessionData.session.user.id,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true
    };

    const { error } = await supabase
      .from('chat_sessions')
      .insert(newSession);

    if (error) throw error;
    return newSession;
  } catch (error) {
    logger.error('Error creating chat session:', error);
    throw error;
  }
};

/**
 * Sends a chat message to the OpenAI API via Supabase Edge Function
 * Maintains conversation continuity by passing and receiving the conversation ID
 */
export const sendChatMessage = async (
  prompt: string, 
  previousMessages: ChatMessage[] = [],
  systemPromptName: string = 'default',
  conversationId: string | null = null,
  userId?: string,
  userName?: string
): Promise<{ response: string; messages: ChatMessage[] }> => {
  try {
    // First, ensure we have a valid session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      logger.error('Session error in sendChatMessage:', sessionError);
      throw new Error('User must be authenticated to use chat');
    }
    
    const apiUrl = `${import.meta.env.VITE_SUPABASE_DATABASE_URL}/functions/v1/chat`;
    
    logger.debug('Sending chat with conversation ID:', conversationId);
    logger.debug('Using system prompt name:', systemPromptName);
    
    // Get the system prompt from the database
    const { data: systemPromptData, error: systemPromptError } = await supabase
      .from('system_prompts')
      .select('content')
      .eq('name', systemPromptName)
      .eq('is_active', true)
      .single();
    
    if (systemPromptError) {
      logger.error('Error fetching system prompt:', systemPromptError);
      throw new Error('Failed to fetch system prompt');
    }
    
    // Prepare messages array with user information
    const messages = prepareMessages(
      systemPromptData.content, 
      previousMessages, 
      prompt,
      userId || sessionData.session.user.id,
      userName || sessionData.session.user.user_metadata?.full_name
    );
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({
        prompt: messages[messages.length - 1].content,
        systemPromptName,
        previousMessages: messages.slice(0, -1),
        conversationId
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send message');
    }
    
    const data = await response.json();
    return {
      response: data.response,
      messages: [...messages, { 
        role: 'assistant', 
        content: data.response,
        timestamp: new Date().toISOString()
      }]
    };
  } catch (error) {
    logger.error('Error in sendChatMessage:', error);
    throw error;
  }
};

/**
 * Fetches available system prompts
 */
export const getSystemPrompts = async (): Promise<SystemPrompt[]> => {
  try {
    const { data, error } = await withRetry(
      async () => {
        const response = await supabase
          .from('system_prompts')
          .select('*')
          .eq('is_active', true);
        return response as PostgrestResponse<SystemPrompt[]>;
      },
      { maxRetries: 2 }
    );
    
    if (error) {
      logger.error('Error fetching system prompts:', error);
      throw error;
    }
    
    return ((data as unknown) as SystemPrompt[]) || [];
  } catch (error) {
    logger.error('Error in getSystemPrompts:', error);
    throw error;
  }
};

/**
 * Fetches chat history for the current user
 */
export const getUserChatHistory = async (): Promise<UserEvent[]> => {
  try {
    // First, ensure we have a valid session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      logger.error('Session error in getUserChatHistory:', sessionError);
      throw new Error('User must be authenticated to view chat history');
    }
    
    // Get chat events for the current user
    const { data, error } = await supabase
      .from('user_events')
      .select('*')
      .eq('event_type', 'chat')
      .eq('user_id', sessionData.session.user.id) // Add user ID filter
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error('Error fetching chat history:', error);
      throw error;
    }
    
    return data || [];
  } catch (error) {
    logger.error('Error in getUserChatHistory:', error);
    throw error;
  }
};

/**
 * Gets a specific chat event by ID
 */
export const getChatEventById = async (eventId: string): Promise<UserEvent | null> => {
  try {
    // First check if the user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    
    if (!sessionData.session) {
      logger.warn('Trying to get chat event without authentication');
      return null;
    }
    
    const { data, error } = await withRetry(
      async () => {
        const response = await supabase
          .from('user_events')
          .select('*')
          .eq('event_id', eventId)
          .single();
        return response as PostgrestSingleResponse<UserEvent>;
      },
      { maxRetries: 2 }
    );
    
    if (error) {
      logger.error('Error fetching chat event:', error);
      throw error;
    }
    
    return data || null;
  } catch (error) {
    logger.error('Error in getChatEventById:', error);
    return null;
  }
};

/**
 * Deletes a chat event by ID
 */
export const deleteChatEvent = async (eventId: string): Promise<boolean> => {
  try {
    // First check if the user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    
    if (!sessionData.session) {
      logger.warn('Trying to delete chat event without authentication');
      return false;
    }
    
    const { error } = await withRetry(
      async () => {
        return await supabase
          .from('user_events')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', sessionData.session?.user.id); // Ensure user can only delete their own events
      },
      { maxRetries: 2 }
    );
    
    if (error) {
      logger.error('Error deleting chat event:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    logger.error('Error in deleteChatEvent:', error);
    return false;
  }
};