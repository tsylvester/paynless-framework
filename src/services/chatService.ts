import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { ChatMessage, SystemPrompt, UserEvent } from '../types/chat.types';

/**
 * Sends a chat message to the OpenAI API via Supabase Edge Function
 */
export const sendChatMessage = async (
  prompt: string, 
  previousMessages: ChatMessage[] = [],
  systemPromptName: string = 'default'
): Promise<{ response: string; messages: ChatMessage[] }> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    
    if (!sessionData.session) {
      throw new Error('User must be authenticated to use chat');
    }
    
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        prompt,
        systemPromptName,
        previousMessages,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Error sending chat message:', errorData);
      throw new Error(errorData.error || 'Failed to send message');
    }
    
    const data = await response.json();
    return data;
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
    const { data, error } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('is_active', true);
    
    if (error) {
      logger.error('Error fetching system prompts:', error);
      throw error;
    }
    
    return data || [];
  } catch (error) {
    logger.error('Error in getSystemPrompts:', error);
    throw error;
  }
};

/**
 * Fetches user's chat history
 */
export const getUserChatHistory = async (limit: number = 10): Promise<UserEvent[]> => {
  try {
    const { data, error } = await supabase
      .from('user_events')
      .select('*')
      .eq('event_type', 'chat')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      logger.error('Error fetching user chat history:', error);
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
    const { data, error } = await supabase
      .from('user_events')
      .select('*')
      .eq('event_id', eventId)
      .single();
    
    if (error) {
      logger.error('Error fetching chat event:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    logger.error('Error in getChatEventById:', error);
    throw error;
  }
};