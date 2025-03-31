import { BaseApiClient } from './base.api';
import { ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';
import { Message, Conversation } from '../../types/messaging.types';

/**
 * API client for messaging features
 */
export class MessageApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('messaging');
  }
  
  /**
   * Send a message to another user
   */
  async sendMessage(conversationId: string, content: string): Promise<ApiResponse<Message>> {
    try {
      logger.info('Sending message', { conversationId });
      return await this.baseClient.post<Message>(`/conversations/${conversationId}/messages`, { content });
    } catch (error) {
      logger.error('Error sending message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      });
      
      return {
        error: {
          code: 'message_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get conversations for the current user
   */
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    try {
      logger.info('Fetching conversations');
      return await this.baseClient.get<Conversation[]>('/conversations');
    } catch (error) {
      logger.error('Error fetching conversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'message_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get messages for a specific conversation
   */
  async getMessages(conversationId: string): Promise<ApiResponse<Message[]>> {
    try {
      logger.info('Fetching messages', { conversationId });
      return await this.baseClient.get<Message[]>(`/conversations/${conversationId}/messages`);
    } catch (error) {
      logger.error('Error fetching messages', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      });
      
      return {
        error: {
          code: 'message_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async markMessagesAsRead(conversationId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Marking messages as read', { conversationId });
      return await this.baseClient.post<void>(`/conversations/${conversationId}/read`);
    } catch (error) {
      logger.error('Error marking messages as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      });
      
      return {
        error: {
          code: 'message_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export singleton instance
export const messageApiClient = new MessageApiClient();