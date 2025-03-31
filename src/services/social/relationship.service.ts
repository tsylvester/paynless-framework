import { socialApiClient } from '../../api/clients/social';
import { logger } from '../../utils/logger';
import { 
  RelationshipType, 
  UserRelationship, 
  FollowerCount
} from '../../types/relationship.types';

/**
 * Service for relationship-related functionality
 */
export class RelationshipService {
  /**
   * Follow a user
   */
  async followUser(userId: string): Promise<boolean> {
    try {
      logger.info('Following user', { userId });
      
      const request = {
        relatedUserId: userId,
        type: RelationshipType.FOLLOW,
      };
      
      const response = await socialApiClient.createRelationship(request);
      
      if (response.error) {
        logger.error('Failed to follow user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error following user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Unfollow a user
   */
  async unfollowUser(userId: string): Promise<boolean> {
    try {
      logger.info('Unfollowing user', { userId });
      
      const request = {
        relatedUserId: userId,
        type: RelationshipType.FOLLOW,
      };
      
      const response = await socialApiClient.removeRelationship(request);
      
      if (response.error) {
        logger.error('Failed to unfollow user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error unfollowing user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Block a user
   */
  async blockUser(userId: string): Promise<boolean> {
    try {
      logger.info('Blocking user', { userId });
      
      const request = {
        relatedUserId: userId,
        type: RelationshipType.BLOCK,
      };
      
      const response = await socialApiClient.createRelationship(request);
      
      if (response.error) {
        logger.error('Failed to block user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error blocking user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Unblock a user
   */
  async unblockUser(userId: string): Promise<boolean> {
    try {
      logger.info('Unblocking user', { userId });
      
      const request = {
        relatedUserId: userId,
        type: RelationshipType.BLOCK,
      };
      
      const response = await socialApiClient.removeRelationship(request);
      
      if (response.error) {
        logger.error('Failed to unblock user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error unblocking user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Mute a user
   */
  async muteUser(userId: string): Promise<boolean> {
    try {
      logger.info('Muting user', { userId });
      
      const request = {
        relatedUserId: userId,
        type: RelationshipType.MUTE,
      };
      
      const response = await socialApiClient.createRelationship(request);
      
      if (response.error) {
        logger.error('Failed to mute user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error muting user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Unmute a user
   */
  async unmuteUser(userId: string): Promise<boolean> {
    try {
      logger.info('Unmuting user', { userId });
      
      const request = {
        relatedUserId: userId,
        type: RelationshipType.MUTE,
      };
      
      const response = await socialApiClient.removeRelationship(request);
      
      if (response.error) {
        logger.error('Failed to unmute user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error unmuting user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Check if the current user follows another user
   */
  async checkIfFollowing(userId: string): Promise<boolean> {
    try {
      logger.info('Checking if following user', { userId });
      
      const response = await socialApiClient.checkRelationship(userId, RelationshipType.FOLLOW);
      
      if (response.error || !response.data) {
        logger.warn('Failed to check if following user', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return response.data.exists;
    } catch (error) {
      logger.error('Unexpected error checking if following user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Check if the current user has blocked another user
   */
  async checkIfBlocked(userId: string): Promise<boolean> {
    try {
      logger.info('Checking if user is blocked', { userId });
      
      const response = await socialApiClient.checkRelationship(userId, RelationshipType.BLOCK);
      
      if (response.error || !response.data) {
        logger.warn('Failed to check if user is blocked', { 
          error: response.error,
          userId,
        });
        return false;
      }
      
      return response.data.exists;
    } catch (error) {
      logger.error('Unexpected error checking if user is blocked', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Get follower and following counts for a user
   */
  async getFollowerCounts(userId: string): Promise<FollowerCount | null> {
    try {
      logger.info('Getting follower counts', { userId });
      
      const response = await socialApiClient.getFollowerCounts(userId);
      
      if (response.error || !response.data) {
        logger.error('Failed to get follower counts', { 
          error: response.error,
          userId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error getting follower counts', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }
  
  /**
   * Get users that the current user follows
   */
  async getFollowing(cursor?: string, limit: number = 20): Promise<UserRelationship[] | null> {
    try {
      logger.info('Getting following', { cursor, limit });
      
      const response = await socialApiClient.getRelationships(RelationshipType.FOLLOW, cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get following', { 
          error: response.error,
        });
        return null;
      }
      
      return response.data.relationships;
    } catch (error) {
      logger.error('Unexpected error getting following', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Get users that the current user has blocked
   */
  async getBlocked(cursor?: string, limit: number = 20): Promise<UserRelationship[] | null> {
    try {
      logger.info('Getting blocked users', { cursor, limit });
      
      const response = await socialApiClient.getRelationships(RelationshipType.BLOCK, cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get blocked users', { 
          error: response.error,
        });
        return null;
      }
      
      return response.data.relationships;
    } catch (error) {
      logger.error('Unexpected error getting blocked users', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}