import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { getSupabaseClient } from '../../../utils/supabase';
import {
  Reaction,
  ReactionType,
  CreateReactionRequest,
  ReactionCheckResponse
} from '../../../types/post.types';

/**
 * API client for reaction-related endpoints
 */
export class ReactionApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/social`);
  }
  
  /**
   * Add a reaction to a post
   */
  async createReaction(request: CreateReactionRequest): Promise<ApiResponse<Reaction>> {
    try {
      logger.info('Creating reaction', { postId: request.postId, type: request.type });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.post<Reaction>('/reactions', request);
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
      
      const { data, error } = await this.supabase
        .from('reactions')
        .insert([
          {
            post_id: request.postId,
            user_id: userId,
            type: request.type,
          },
        ])
        .select()
        .single();
      
      if (error) {
        // If the error is a duplicate constraint error, check if it's a different reaction type
        if (error.code === '23505') { // PostgreSQL unique constraint violation
          // Update the existing reaction type
          const { data: updatedData, error: updateError } = await this.supabase
            .from('reactions')
            .update({ type: request.type })
            .eq('post_id', request.postId)
            .eq('user_id', userId)
            .select()
            .single();
          
          if (updateError) {
            return {
              error: {
                code: 'reaction_error',
                message: updateError.message,
                details: updateError,
              },
              status: 400,
            };
          }
          
          return {
            data: {
              id: updatedData.id,
              postId: updatedData.post_id,
              userId: updatedData.user_id,
              type: updatedData.type as ReactionType,
              createdAt: updatedData.created_at,
            },
            status: 200,
          };
        }
        
        return {
          error: {
            code: 'reaction_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          id: data.id,
          postId: data.post_id,
          userId: data.user_id,
          type: data.type as ReactionType,
          createdAt: data.created_at,
        },
        status: 201,
      };
    } catch (error) {
      logger.error('Error creating reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Remove a reaction from a post
   */
  async deleteReaction(postId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Deleting reaction', { postId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.delete<void>(`/reactions/${postId}`);
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
        .from('reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      
      if (error) {
        return {
          error: {
            code: 'reaction_error',
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
      logger.error('Error deleting reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Check if a user has reacted to a post
   */
  async checkReaction(postId: string): Promise<ApiResponse<ReactionCheckResponse>> {
    try {
      logger.info('Checking reaction', { postId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<ReactionCheckResponse>(`/reactions/check/${postId}`);
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
      
      const { data, error } = await this.supabase
        .from('reactions')
        .select('*')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        return {
          error: {
            code: 'reaction_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      if (!data) {
        return {
          data: {
            hasReacted: false,
          },
          status: 200,
        };
      }
      
      return {
        data: {
          hasReacted: true,
          reaction: {
            id: data.id,
            postId: data.post_id,
            userId: data.user_id,
            type: data.type as ReactionType,
            createdAt: data.created_at,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error checking reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}