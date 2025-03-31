import { BaseApiClient } from '../../clients/base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { Conversation } from '../../../types/messaging.types';

/**
 * API client for conversation-related operations
 */
export class ConversationApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('messaging/conversations');
  }
  
  /**
   * Get conversations for the current user
   */
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    try {
      logger.info('Getting conversations');
      return await this.baseClient.get<Conversation[]>('/');
    } catch (error) {
      logger.error('Error getting conversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'conversation_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async getConversation(conversationId: string): Promise<ApiResponse<Conversation>> {
    try {
      logger.info('Getting conversation', { conversationId });
      return await this.baseClient.get<Conversation>(`/${conversationId}`);
    } catch (error) {
      logger.error('Error getting conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      });
      
      return {
        error: {
          code: 'conversation_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async createConversation(userId: string): Promise<ApiResponse<Conversation>> {
    try {
      logger.info('Creating conversation', { userId });
      return await this.baseClient.post<Conversation>('/', { userId });
    } catch (error) {
      logger.error('Error creating conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'conversation_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}