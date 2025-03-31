import { PostApiClient } from './post.api';
import { CommentApiClient } from './comment.api';
import { ReactionApiClient } from './reaction.api';
import { RelationshipApiClient } from './relationship.api';
import { PrivacyApiClient } from './privacy.api';
import { getSupabaseClient } from '../../../utils/supabase';
import { logger } from '../../../utils/logger';

/**
 * API client for social features
 */
export class SocialApiClient {
  private postClient: PostApiClient;
  private commentClient: CommentApiClient;
  private reactionClient: ReactionApiClient;
  private relationshipClient: RelationshipApiClient;
  private privacyClient: PrivacyApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.postClient = new PostApiClient();
    this.commentClient = new CommentApiClient();
    this.reactionClient = new ReactionApiClient();
    this.relationshipClient = new RelationshipApiClient();
    this.privacyClient = new PrivacyApiClient();
  }

  // ===== Post Methods =====
  
  /**
   * Create a new post
   */
  createPost = this.postClient.createPost.bind(this.postClient);
  
  /**
   * Update an existing post
   */
  updatePost = this.postClient.updatePost.bind(this.postClient);
  
  /**
   * Delete a post
   */
  deletePost = this.postClient.deletePost.bind(this.postClient);
  
  /**
   * Get a user's timeline
   */
  getTimeline = this.postClient.getTimeline.bind(this.postClient);
  
  /**
   * Get a user's posts
   */
  getUserPosts = this.postClient.getUserPosts.bind(this.postClient);

  // ===== Comment Methods =====
  
  /**
   * Create a comment on a post
   */
  createComment = this.commentClient.createComment.bind(this.commentClient);
  
  /**
   * Get comments for a post
   */
  getComments = this.commentClient.getComments.bind(this.commentClient);

  // ===== Reaction Methods =====
  
  /**
   * Create a reaction on a post
   */
  createReaction = this.reactionClient.createReaction.bind(this.reactionClient);
  
  /**
   * Delete a reaction from a post
   */
  deleteReaction = this.reactionClient.deleteReaction.bind(this.reactionClient);
  
  /**
   * Check if a user has reacted to a post
   */
  checkReaction = this.reactionClient.checkReaction.bind(this.reactionClient);

  // ===== Relationship Methods =====
  
  /**
   * Create a relationship with another user
   */
  createRelationship = this.relationshipClient.createRelationship.bind(this.relationshipClient);
  
  /**
   * Remove a relationship with another user
   */
  removeRelationship = this.relationshipClient.removeRelationship.bind(this.relationshipClient);
  
  /**
   * Check if a relationship exists
   */
  checkRelationship = this.relationshipClient.checkRelationship.bind(this.relationshipClient);
  
  /**
   * Get relationships of a specific type
   */
  getRelationships = this.relationshipClient.getRelationships.bind(this.relationshipClient);
  
  /**
   * Get follower counts for a user
   */
  getFollowerCounts = this.relationshipClient.getFollowerCounts.bind(this.relationshipClient);

  // ===== Privacy Methods =====
  
  /**
   * Get privacy settings
   */
  getPrivacySettings = this.privacyClient.getPrivacySettings.bind(this.privacyClient);
  
  /**
   * Update privacy settings
   */
  updatePrivacySettings = this.privacyClient.updatePrivacySettings.bind(this.privacyClient);
}

// Export singleton instance
export const socialApiClient = new SocialApiClient();