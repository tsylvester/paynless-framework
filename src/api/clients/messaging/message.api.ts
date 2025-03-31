import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { 
  Message, 
  MessagesResponse,
  MessageStatus,
  SendMessageRequest,
  UpdateMessageStatusRequest
} from '../../../types/message.types';

/**
 * API client for message-related operations
 */
export class MessageApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('messaging');
  }
  
  /**
   * Send a message to another user
   */
  async sendMessage(request: SendMessageRequest): Promise<ApiResponse<Message>> {
    try {
      logger.info('Sending message', { recipientId: request.recipientId });
      return await this.baseClient.post<Message>('/messages', request);
    } catch (error) {
      logger.error('Error sending message', {
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
  async getMessages(conversationId: string, cursor?: string, limit: number = 50): Promise<ApiResponse<MessagesResponse>> {
    try {
      logger.info('Getting messages', { conversationId, cursor, limit });
      return await this.baseClient.get<MessagesResponse>(`/conversations/${conversationId}/messages`, {
        params: { cursor, limit: limit.toString() },
      });
    } catch (error) {
      logger.error('Error getting messages', {
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
      logger.info('Updating message status', { 
        messageIds: request.messageIds.length,
        status: request.status,
      });
      return await this.baseClient.put<void>('/messages/status', request);
    } catch (error) {
      logger.error('Error updating message status', {
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