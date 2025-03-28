// Path: src/services/chatService.ts
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { ChatMessage, SystemPrompt, UserEvent } from '../types/chat.types';
import { withRetry } from '../utils/retry';
import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

/**
 * Sends a chat message to the OpenAI API via Supabase Edge Function
 * Maintains conversation continuity by passing and receiving the conversation ID
 */
export const sendChatMessage = async (
  prompt: string, 
  previousMessages: ChatMessage[] = [],
  systemPromptName: string = 'default',
  conversationId: string | null = null
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
    
    // Use retry pattern for better resilience
    const response = await withRetry(
      async () => {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({
            prompt,
            systemPromptName,
            previousMessages,
            conversationId, // Pass the conversation ID to the edge function
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response' }));
          logger.error('Error response from chat function:', errorData);
          throw new Error(errorData.error || 'Failed to send message');
        }
        
        return res.json();
      },
      { maxRetries: 2, initialDelay: 500 }
    );
    
    // Even if event storage fails in the edge function, we'll still have the chat response
    return response;
  } catch (error) {
    logger.error('Error in sendChatMessage:', error);
    
    // Enhance the error message for the user
    const enhancedError = error instanceof Error ? error : new Error('Unknown error sending message');
    if (error instanceof Error) {
      if (error.message.includes('authentication') || error.message.includes('authenticated')) {
        enhancedError.message = 'Your session has expired. Please sign in again.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        enhancedError.message = 'Network error. Please check your connection and try again.';
      }
    }
    
    throw enhancedError;
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
    // Return a default prompt as fallback
    return [{
      prompt_id: 'default',
      name: 'default',
      description: 'Default system prompt for general conversations',
      content: 'You are a helpful AI assistant. Answer questions concisely and accurately.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
      tag: 'general'
    }];
  }
};

/**
 * Fetches user's chat history
 */
export const getUserChatHistory = async (limit: number = 10): Promise<UserEvent[]> => {
  try {
    // First check if the user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    
    if (!sessionData.session) {
      logger.warn('Trying to get chat history without authentication');
      return [];
    }
    
    const { data, error } = await withRetry(
      async () => {
        const response = await supabase
          .from('user_events')
          .select('*')
          .eq('event_type', 'chat')
          .order('created_at', { ascending: false })
          .limit(limit);
        return response as PostgrestResponse<UserEvent[]>;
      },
      { maxRetries: 2 }
    );
    
    if (error) {
      logger.error('Error fetching user chat history:', error);
      throw error;
    }
    
    return ((data as unknown) as UserEvent[]) || [];
  } catch (error) {
    logger.error('Error in getUserChatHistory:', error);
    // Return empty array instead of throwing to improve resilience
    return [];
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