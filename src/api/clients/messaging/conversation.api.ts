import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { getSupabaseClient } from '../../../utils/supabase';
import { logger } from '../../../utils/logger';
import { 
  ConversationsResponse,
  MessageStatus
} from '../../../types/message.types';

/**
 * API client for conversation-related operations
 */
export class ConversationApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/messages`);
  }
  
  /**
   * Get conversations for the current user
   */
  async getConversations(cursor?: string, limit: number = 20): Promise<ApiResponse<ConversationsResponse>> {
    try {
      logger.info('Getting conversations', { cursor, limit });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<ConversationsResponse>('/conversations', {
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
      
      // Get conversations where the user is a participant
      let query = this.supabase
        .from('conversations')
        .select('*')
        .contains('participants', [userId])
        .order('updated_at', { ascending: false })
        .limit(limit + 1); // Get one extra to determine if there are more
      
      // Apply cursor if provided
      if (cursor) {
        query = query.lt('updated_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return {
          error: {
            code: 'conversations_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Check if there are more results
      const hasMore = data.length > limit;
      const conversationsData = data.slice(0, limit);
      
      // For each conversation, get the last message and unread count
      const conversationsPromises = conversationsData.map(async (conv) => {
        // Get last message
        const { data: lastMessageData } = await this.supabase
          .from('direct_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        // Count unread messages
        const { count: unreadCount } = await this.supabase
          .from('direct_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('recipient_id', userId)
          .neq('status', MessageStatus.READ);
        
        let lastMessage = undefined;
        
        if (lastMessageData) {
          lastMessage = {
            id: lastMessageData.id,
            senderId: lastMessageData.sender_id,
            recipientId: lastMessageData.recipient_id,
            content: lastMessageData.content,
            status: lastMessageData.status as MessageStatus,
            createdAt: lastMessageData.created_at,
            updatedAt: lastMessageData.updated_at,
            conversationId: lastMessageData.conversation_id,
          };
        }
        
        return {
          id: conv.id,
          participants: conv.participants,
          lastMessage,
          unreadCount: unreadCount || 0,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
        };
      });
      
      const conversations = await Promise.all(conversationsPromises);
      
      // Get the next cursor from the last item
      const nextCursor = hasMore && conversations.length > 0
        ? conversations[conversations.length - 1].updatedAt
        : undefined;
      
      return {
        data: {
          conversations,
          pagination: {
            hasMore,
            nextCursor,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting conversations', {
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
}