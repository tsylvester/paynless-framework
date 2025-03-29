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
    logger.debug('Using system prompt name:', systemPromptName);
    
    // Get the system prompt from the database
    const { data: systemPromptData, error: systemPromptError } = await supabase
      .from('system_prompts')
      .select('content')
      .eq('name', systemPromptName)
      .eq('is_active', true)
      .single();
    
    logger.debug('System prompt query result:', { data: systemPromptData, error: systemPromptError });
    
    if (systemPromptError) {
      logger.error('Error fetching system prompt:', systemPromptError);
      // If we can't find the specified prompt, use a fallback
      const fallbackPrompt = "You are a helpful AI assistant. Answer questions concisely and accurately.";
      logger.info('Using fallback system prompt');
      
      // Create the system message with fallback
      const systemMessage: ChatMessage = {
        role: 'system',
        content: fallbackPrompt
      };
      
      // If no prompt provided, use the system prompt as the user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: prompt || fallbackPrompt
      };
      
      // Prepare messages array with system prompt first, then previous messages, then current prompt
      const messages = [
        systemMessage,
        ...previousMessages.filter(msg => msg.role !== 'system'), // Remove any existing system messages
        userMessage
      ];
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          prompt: userMessage.content,
          systemPromptName,
          previousMessages: messages,
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
        messages: data.messages
      };
    }
    
    // Create the system message with the fetched prompt content
    const systemMessage: ChatMessage = {
      role: 'system',
      content: systemPromptData.content // Use the actual content from the database
    };
    
    logger.debug('Created system message with content:', systemMessage.content);
    
    // If no prompt provided, use the system prompt as the user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt || systemPromptData.content
    };
    
    // Prepare messages array with system prompt first, then previous messages, then current prompt
    const messages = [
      systemMessage,
      ...previousMessages.filter(msg => msg.role !== 'system'), // Remove any existing system messages
      userMessage
    ];
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({
        prompt: userMessage.content,
        systemPromptName,
        previousMessages: messages,
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
      messages: data.messages
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