import { BaseApiClient } from '../../clients/base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { Post } from '../../../types/social.types';
import { CommentApiClient } from './comment.api';
import { ReactionApiClient } from './reaction.api';
import { RelationshipApiClient } from './relationship.api';
import { PrivacyApiClient } from './privacy.api';

/**
 * API client for social features
 */
export class SocialApiClient {
  private baseClient: BaseApiClient;
  private commentClient: CommentApiClient;
  private reactionClient: ReactionApiClient;
  private relationshipClient: RelationshipApiClient;
  private privacyClient: PrivacyApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('social');
    this.commentClient = new CommentApiClient();
    this.reactionClient = new ReactionApiClient();
    this.relationshipClient = new RelationshipApiClient();
    this.privacyClient = new PrivacyApiClient();
  }
  
  async getTimeline(): Promise<ApiResponse<Post[]>> {
    try {
      logger.info('Getting timeline');
      return await this.baseClient.get<Post[]>('/timeline');
    } catch (error) {
      logger.error('Error getting timeline', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'social_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async getUserPosts(userId: string): Promise<ApiResponse<Post[]>> {
    try {
      logger.info('Getting user posts', { userId });
      return await this.baseClient.get<Post[]>(`/users/${userId}/posts`);
    } catch (error) {
      logger.error('Error getting user posts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'social_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async createPost(content: string): Promise<ApiResponse<Post>> {
    try {
      logger.info('Creating post');
      return await this.baseClient.post<Post>('/posts', { content });
    } catch (error) {
      logger.error('Error creating post', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'social_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async deletePost(postId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Deleting post', { postId });
      return await this.baseClient.delete<void>(`/posts/${postId}`);
    } catch (error) {
      logger.error('Error deleting post', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      
      return {
        error: {
          code: 'social_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  // Delegate to specialized clients
  get comments() {
    return this.commentClient;
  }
  
  get reactions() {
    return this.reactionClient;
  }
  
  get relationships() {
    return this.relationshipClient;
  }
  
  get privacy() {
    return this.privacyClient;
  }
}

// Export singleton instance
export const socialApiClient = new SocialApiClient();