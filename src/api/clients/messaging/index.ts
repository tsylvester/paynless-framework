import { ConversationApiClient } from './conversation.api';
import { MessageApiClient } from './message.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { 
  Message, 
  Conversation, 
  ConversationsResponse, 
  MessagesResponse,
  SendMessageRequest,
  UpdateMessageStatusRequest
} from '../../../types/message.types';

/**
 * API client for messaging features
 */
export class MessagingApiClient {
  private conversationClient: ConversationApiClient;
  private messageClient: MessageApiClient;
  
  constructor() {
    this.conversationClient = new ConversationApiClient();
    this.messageClient = new MessageApiClient();
  }
  
  /**
   * Send a message to another user
   */
  async sendMessage(request: SendMessageRequest): Promise<ApiResponse<Message>> {
    try {
      return await this.messageClient.sendMessage(request);
    } catch (error) {
      logger.error('Error in MessagingApiClient.sendMessage', {
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
   * Get conversations for the current user
   */
  async getConversations(cursor?: string, limit: number = 20): Promise<ApiResponse<ConversationsResponse>> {
    try {
      return await this.conversationClient.getConversations(cursor, limit);
    } catch (error) {
      logger.error('Error in MessagingApiClient.getConversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'conversations_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get messages for a specific conversation
   */
  async getMessages(conversationId: string, cursor?: string, limit: number = 50): Promise<ApiResponse<MessagesResponse>> {
    try {
      return await this.messageClient.getMessages(conversationId, cursor, limit);
    } catch (error) {
      logger.error('Error in MessagingApiClient.getMessages', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'messages_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Update message status (mark as delivered or read)
   */
  async updateMessageStatus(request: UpdateMessageStatusRequest): Promise<ApiResponse<void>> {
    try {
      return await this.messageClient.updateMessageStatus(request);
    } catch (error) {
      logger.error('Error in MessagingApiClient.updateMessageStatus', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'message_status_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export singleton instance
export const messagingApiClient = new MessagingApiClient();