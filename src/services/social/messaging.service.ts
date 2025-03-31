import { messagingApiClient } from '../../api/clients/messaging';
import { logger } from '../../utils/logger';
import { 
  Message, 
  ConversationsResponse, 
  MessagesResponse,
  MessageStatus
} from '../../types/message.types';

/**
 * Service for messaging-related functionality
 */
export class MessagingService {
  /**
   * Send a message to another user
   */
  async sendMessage(recipientId: string, content: string): Promise<Message | null> {
    try {
      logger.info('Sending message', { recipientId });
      
      const request = {
        recipientId,
        content,
      };
      
      const response = await messagingApiClient.sendMessage(request);
      
      if (response.error || !response.data) {
        logger.error('Failed to send message', { 
          error: response.error,
          recipientId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error sending message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        recipientId,
      });
      return null;
    }
  }
  
  /**
   * Get conversations for the current user
   */
  async getConversations(cursor?: string, limit: number = 20): Promise<ConversationsResponse | null> {
    try {
      logger.info('Getting conversations', { cursor, limit });
      
      const response = await messagingApiClient.getConversations(cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get conversations', { 
          error: response.error,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error getting conversations', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Get messages for a specific conversation
   */
  async getMessages(conversationId: string, cursor?: string, limit: number = 50): Promise<MessagesResponse | null> {
    try {
      logger.info('Getting messages', { conversationId, cursor, limit });
      
      const response = await messagingApiClient.getMessages(conversationId, cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get messages', { 
          error: response.error,
          conversationId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error getting messages', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      });
      return null;
    }
  }
  
  /**
   * Mark messages as read
   */
  async markMessagesAsRead(messageIds: string[]): Promise<boolean> {
    try {
      if (messageIds.length === 0) return true;
      
      logger.info('Marking messages as read', { count: messageIds.length });
      
      const request = {
        messageIds,
        status: MessageStatus.READ,
      };
      
      const response = await messagingApiClient.updateMessageStatus(request);
      
      if (response.error) {
        logger.error('Failed to mark messages as read', { 
          error: response.error,
          count: messageIds.length,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error marking messages as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        count: messageIds.length,
      });
      return false;
    }
  }
}