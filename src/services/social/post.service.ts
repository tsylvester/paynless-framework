import { socialApiClient } from '../../api/clients/social';
import { logger } from '../../utils/logger';
import { Post, PostVisibility } from '../../types/post.types';

/**
 * Service for post-related functionality
 */
export class PostService {
  /**
   * Create a new post
   */
  async createPost(content: string, visibility: PostVisibility = PostVisibility.PUBLIC, attachments?: string[]): Promise<Post | null> {
    try {
      logger.info('Creating post', { visibility });
      
      const request = {
        content,
        visibility,
        attachments,
      };
      
      const response = await socialApiClient.createPost(request);
      
      if (response.error || !response.data) {
        logger.error('Failed to create post', { 
          error: response.error,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error creating post', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Update an existing post
   */
  async updatePost(postId: string, content?: string, visibility?: PostVisibility, attachments?: string[]): Promise<Post | null> {
    try {
      logger.info('Updating post', { postId });
      
      const updateData: Record<string, any> = {};
      if (content !== undefined) updateData.content = content;
      if (visibility !== undefined) updateData.visibility = visibility;
      if (attachments !== undefined) updateData.attachments = attachments;
      
      const response = await socialApiClient.updatePost(postId, updateData);
      
      if (response.error || !response.data) {
        logger.error('Failed to update post', { 
          error: response.error,
          postId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error updating post', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return null;
    }
  }
  
  /**
   * Delete a post
   */
  async deletePost(postId: string): Promise<boolean> {
    try {
      logger.info('Deleting post', { postId });
      
      const response = await socialApiClient.deletePost(postId);
      
      if (response.error) {
        logger.error('Failed to delete post', { 
          error: response.error,
          postId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error deleting post', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return false;
    }
  }
  
  /**
   * Get the timeline for the current user
   */
  async getTimeline(cursor?: string, limit: number = 20): Promise<TimelineResponseWithUsers | null> {
    try {
      logger.info('Getting timeline', { cursor, limit });
      
      const response = await socialApiClient.getTimeline(cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get timeline', { 
          error: response.error,
        });
        return null;
      }
      
      // Enhance posts with user information
      const enhancedPosts = await this.enhancePostsWithUserInfo(response.data.posts);
      
      return {
        posts: enhancedPosts,
        pagination: response.data.pagination,
      };
    } catch (error) {
      logger.error('Unexpected error getting timeline', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Get posts for a specific user
   */
  async getUserPosts(userId: string, cursor?: string, limit: number = 20): Promise<TimelineResponseWithUsers | null> {
    try {
      logger.info('Getting user posts', { userId, cursor, limit });
      
      const response = await socialApiClient.getUserPosts(userId, cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get user posts', { 
          error: response.error,
          userId,
        });
        return null;
      }
      
      // Enhance posts with user information
      const enhancedPosts = await this.enhancePostsWithUserInfo(response.data.posts);
      
      return {
        posts: enhancedPosts,
        pagination: response.data.pagination,
      };
    } catch (error) {
      logger.error('Unexpected error getting user posts', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }
  
  /**
   * Helper method to enhance posts with user information
   */
  private async enhancePostsWithUserInfo(posts: Post[]): Promise<Post[]> {
    try {
      if (!posts || !Array.isArray(posts)) {
        return [];
      }
      
      // In a real implementation, you'd have an efficient way to get user info for multiple posts
      // For this demo, we'll just mock the user data
      return posts.map(post => ({
        ...post,
        user: {
          firstName: 'User',
          lastName: post.userId.substring(0, 4),
          avatarUrl: undefined,
        },
      }));
    } catch (error) {
      logger.error('Error enhancing posts with user info', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return posts || [];
    }
  }
}

export interface TimelineResponseWithUsers {
  posts: Post[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}