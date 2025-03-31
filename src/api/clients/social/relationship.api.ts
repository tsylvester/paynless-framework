import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { getSupabaseClient } from '../../../utils/supabase';
import { 
  RelationshipType, 
  UserRelationship, 
  FollowerCount, 
  GetRelationshipsResponse,
  RelationshipCheckResponse,
  CreateRelationshipRequest,
  RemoveRelationshipRequest
} from '../../../types/relationship.types';

/**
 * API client for relationship-related endpoints
 */
export class RelationshipApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/social`);
  }
  
  /**
   * Create a relationship (follow, block, mute) with another user
   */
  async createRelationship(request: CreateRelationshipRequest): Promise<ApiResponse<UserRelationship>> {
    try {
      logger.info('Creating user relationship', { 
        relatedUserId: request.relatedUserId, 
        type: request.type 
      });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.post<UserRelationship>('/relationships', request);
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
        .from('user_relationships')
        .insert([
          {
            user_id: userId,
            related_user_id: request.relatedUserId,
            relationship_type: request.type,
          },
        ])
        .select()
        .single();
      
      if (error) {
        return {
          error: {
            code: 'relationship_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          id: data.id,
          userId: data.user_id,
          relatedUserId: data.related_user_id,
          type: data.relationship_type as RelationshipType,
          createdAt: data.created_at,
        },
        status: 201,
      };
    } catch (error) {
      logger.error('Error creating relationship', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Remove a relationship (unfollow, unblock, unmute) with another user
   */
  async removeRelationship(request: RemoveRelationshipRequest): Promise<ApiResponse<void>> {
    try {
      logger.info('Removing user relationship', { 
        relatedUserId: request.relatedUserId, 
        type: request.type 
      });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.delete<void>(`/relationships/${request.relatedUserId}/${request.type}`);
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
        .from('user_relationships')
        .delete()
        .eq('user_id', userId)
        .eq('related_user_id', request.relatedUserId)
        .eq('relationship_type', request.type);
      
      if (error) {
        return {
          error: {
            code: 'relationship_error',
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
      logger.error('Error removing relationship', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Check if a relationship exists between the current user and another user
   */
  async checkRelationship(relatedUserId: string, type: RelationshipType): Promise<ApiResponse<RelationshipCheckResponse>> {
    try {
      logger.info('Checking user relationship', { relatedUserId, type });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<RelationshipCheckResponse>(`/relationships/check/${relatedUserId}/${type}`);
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
        .from('user_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('related_user_id', relatedUserId)
        .eq('relationship_type', type)
        .maybeSingle();
      
      if (error) {
        return {
          error: {
            code: 'relationship_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      if (!data) {
        return {
          data: {
            exists: false,
          },
          status: 200,
        };
      }
      
      return {
        data: {
          exists: true,
          relationship: {
            id: data.id,
            userId: data.user_id,
            relatedUserId: data.related_user_id,
            type: data.relationship_type as RelationshipType,
            createdAt: data.created_at,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error checking relationship', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get a list of users that the current user has a specific relationship with
   */
  async getRelationships(type: RelationshipType, cursor?: string, limit: number = 20): Promise<ApiResponse<GetRelationshipsResponse>> {
    try {
      logger.info('Getting user relationships', { type, cursor, limit });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<GetRelationshipsResponse>(`/relationships/${type}`, {
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
      
      // Query for one more than the limit to determine if there are more results
      let query = this.supabase
        .from('user_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('relationship_type', type)
        .order('created_at', { ascending: false })
        .limit(limit + 1);
      
      // Apply cursor if provided
      if (cursor) {
        query = query.lt('created_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return {
          error: {
            code: 'relationship_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Check if there are more results
      const hasMore = data.length > limit;
      const relationships = data.slice(0, limit).map(item => ({
        id: item.id,
        userId: item.user_id,
        relatedUserId: item.related_user_id,
        type: item.relationship_type as RelationshipType,
        createdAt: item.created_at,
      }));
      
      // Get the next cursor from the last item
      const nextCursor = hasMore && relationships.length > 0
        ? relationships[relationships.length - 1].createdAt
        : undefined;
      
      return {
        data: {
          relationships,
          pagination: {
            hasMore,
            nextCursor,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting relationships', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get follower and following counts for a user
   */
  async getFollowerCounts(userId: string): Promise<ApiResponse<FollowerCount>> {
    try {
      logger.info('Getting follower counts', { userId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<FollowerCount>(`/relationships/counts/${userId}`);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      // Count followers (users who follow the specified user)
      const { count: followerCount, error: followerError } = await this.supabase
        .from('user_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('related_user_id', userId)
        .eq('relationship_type', RelationshipType.FOLLOW);
      
      if (followerError) {
        return {
          error: {
            code: 'relationship_error',
            message: followerError.message,
            details: followerError,
          },
          status: 400,
        };
      }
      
      // Count following (users the specified user follows)
      const { count: followingCount, error: followingError } = await this.supabase
        .from('user_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('relationship_type', RelationshipType.FOLLOW);
      
      if (followingError) {
        return {
          error: {
            code: 'relationship_error',
            message: followingError.message,
            details: followingError,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          userId,
          followerCount: followerCount ?? 0,
          followingCount: followingCount ?? 0,
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting follower counts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}