import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { getSupabaseClient } from '../../../utils/supabase';
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
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/messages`);
  }
  
  /**
   * Send a message to another user
   */
  async sendMessage(request: SendMessageRequest): Promise<ApiResponse<Message>> {
    try {
      logger.info('Sending message', { recipientId: request.recipientId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.post<Message>('/', request);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      // Check if a conversation already exists between these users
      const participantsArray = [userId, request.recipientId].sort();
      
      const { data: existingConversation } = await this.supabase
        .from('conversations')
        .select('id')
        .contains('participants', participantsArray)
        .maybeSingle();
      
      let conversationId = existingConversation?.id;
      
      // If no conversation exists, create one
      if (!conversationId) {
        const { data: newConversation, error: conversationError } = await this.supabase
          .from('conversations')
          .insert([
            {
              participants: participantsArray,
            },
          ])
          .select()
          .single();
        
        if (conversationError) {
          return {
            error: {
              code: 'message_error',
              message: conversationError.message,
              details: conversationError,
            },
            status: 400,
          };
        }
        
        conversationId = newConversation.id;
      }
      
      // Send the message
      const { data, error } = await this.supabase
        .from('direct_messages')
        .insert([
          {
            conversation_id: conversationId,
            sender_id: userId,
            recipient_id: request.recipientId,
            content: request.content,
            status: MessageStatus.SENT,
          },
        ])
        .select()
        .single();
      
      if (error) {
        return {
          error: {
            code: 'message_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          id: data.id,
          senderId: data.sender_id,
          recipientId: data.recipient_id,
          content: data.content,
          status: data.status as MessageStatus,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          conversationId: data.conversation_id,
        },
        status: 201,
      };
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
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<MessagesResponse>(`/conversations/${conversationId}`, {
          params: { cursor, limit: limit.toString() },
        });
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      // Check if the user is a participant in this conversation
      const { data: conversationData, error: convError } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .contains('participants', [userId])
        .single();
      
      if (convError || !conversationData) {
        return {
          error: {
            code: 'messages_error',
            message: 'Conversation not found or you are not a participant',
            details: convError,
          },
          status: 404,
        };
      }
      
      // Build the query for messages in this conversation
      let query = this.supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit + 1); // Get one extra to determine if there are more
      
      // Apply cursor if provided
      if (cursor) {
        query = query.lt('created_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return {
          error: {
            code: 'messages_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Check if there are more results
      const hasMore = data.length > limit;
      const messages = data.slice(0, limit).map(item => ({
        id: item.id,
        senderId: item.sender_id,
        recipientId: item.recipient_id,
        content: item.content,
        status: item.status as MessageStatus,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        conversationId: item.conversation_id,
      }));
      
      // Mark messages as delivered if they are sent to this user
      const messagesToUpdate = messages
        .filter(msg => msg.recipientId === userId && msg.status === MessageStatus.SENT)
        .map(msg => msg.id);
      
      if (messagesToUpdate.length > 0) {
        await this.supabase
          .from('direct_messages')
          .update({ status: MessageStatus.DELIVERED, updated_at: new Date().toISOString() })
          .in('id', messagesToUpdate);
        
        // Update the status of messages in the response
        messages.forEach(msg => {
          if (messagesToUpdate.includes(msg.id)) {
            msg.status = MessageStatus.DELIVERED;
          }
        });
      }
      
      // Get the next cursor from the last item
      const nextCursor = hasMore && messages.length > 0
        ? messages[messages.length - 1].createdAt
        : undefined;
      
      return {
        data: {
          messages,
          pagination: {
            hasMore,
            nextCursor,
          },
        },
        status: 200,
      };
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
      
      // Try the API endpoint first
      try {
        return await this.baseClient.put<void>('/status', request);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      const { error } = await this.supabase
        .from('direct_messages')
        .update({ 
          status: request.status, 
          updated_at: new Date().toISOString(),
        })
        .in('id', request.messageIds)
        .eq('recipient_id', userId);
      
      if (error) {
        return {
          error: {
            code: 'message_status_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        status: 200,
      };
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