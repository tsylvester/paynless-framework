import { PostService } from './post.service';
import { CommentService } from './comment.service';
import { ReactionService } from './reaction.service';
import { RelationshipService } from './relationship.service';
import { PrivacyService } from './privacy.service';
import { MessagingService } from './messaging.service';
import { logger } from '../../utils/logger';

/**
 * Service for handling social features
 */
export class SocialService {
  private postService: PostService;
  private commentService: CommentService;
  private reactionService: ReactionService;
  private relationshipService: RelationshipService;
  private privacyService: PrivacyService;
  private messagingService: MessagingService;
  
  constructor() {
    this.postService = new PostService();
    this.commentService = new CommentService();
    this.reactionService = new ReactionService();
    this.relationshipService = new RelationshipService();
    this.privacyService = new PrivacyService();
    this.messagingService = new MessagingService();
  }

  // ===== Relationship Methods =====
  
  /**
   * Follow a user
   */
  followUser = this.relationshipService.followUser.bind(this.relationshipService);
  
  /**
   * Unfollow a user
   */
  unfollowUser = this.relationshipService.unfollowUser.bind(this.relationshipService);
  
  /**
   * Block a user
   */
  blockUser = this.relationshipService.blockUser.bind(this.relationshipService);
  
  /**
   * Unblock a user
   */
  unblockUser = this.relationshipService.unblockUser.bind(this.relationshipService);
  
  /**
   * Mute a user
   */
  muteUser = this.relationshipService.muteUser.bind(this.relationshipService);
  
  /**
   * Unmute a user
   */
  unmuteUser = this.relationshipService.unmuteUser.bind(this.relationshipService);
  
  /**
   * Check if the current user follows another user
   */
  checkIfFollowing = this.relationshipService.checkIfFollowing.bind(this.relationshipService);
  
  /**
   * Check if the current user has blocked another user
   */
  checkIfBlocked = this.relationshipService.checkIfBlocked.bind(this.relationshipService);
  
  /**
   * Get follower and following counts for a user
   */
  getFollowerCounts = this.relationshipService.getFollowerCounts.bind(this.relationshipService);
  
  /**
   * Get users that the current user follows
   */
  getFollowing = this.relationshipService.getFollowing.bind(this.relationshipService);
  
  /**
   * Get users that the current user has blocked
   */
  getBlocked = this.relationshipService.getBlocked.bind(this.relationshipService);

  // ===== Post Methods =====
  
  /**
   * Create a new post
   */
  createPost = this.postService.createPost.bind(this.postService);
  
  /**
   * Update an existing post
   */
  updatePost = this.postService.updatePost.bind(this.postService);
  
  /**
   * Delete a post
   */
  deletePost = this.postService.deletePost.bind(this.postService);
  
  /**
   * Get a user's timeline
   */
  getTimeline = this.postService.getTimeline.bind(this.postService);
  
  /**
   * Get posts for a specific user
   */
  getUserPosts = this.postService.getUserPosts.bind(this.postService);

  // ===== Comment Methods =====
  
  /**
   * Create a comment on a post
   */
  createComment = this.commentService.createComment.bind(this.commentService);
  
  /**
   * Get comments for a post
   */
  getComments = this.commentService.getComments.bind(this.commentService);

  // ===== Reaction Methods =====
  
  /**
   * React to a post
   */
  reactToPost = this.reactionService.reactToPost.bind(this.reactionService);
  
  /**
   * Remove a reaction from a post
   */
  unreactToPost = this.reactionService.unreactToPost.bind(this.reactionService);
  
  /**
   * Check if the current user has reacted to a post
   */
  checkIfReacted = this.reactionService.checkIfReacted.bind(this.reactionService);

  // ===== Privacy Methods =====
  
  /**
   * Get privacy settings
   */
  getPrivacySettings = this.privacyService.getPrivacySettings.bind(this.privacyService);
  
  /**
   * Update privacy settings
   */
  updatePrivacySettings = this.privacyService.updatePrivacySettings.bind(this.privacyService);

  // ===== Messaging Methods =====
  
  /**
   * Send a message to another user
   */
  sendMessage = this.messagingService.sendMessage.bind(this.messagingService);
  
  /**
   * Get conversations for the current user
   */
  getConversations = this.messagingService.getConversations.bind(this.messagingService);
  
  /**
   * Get messages for a specific conversation
   */
  getMessages = this.messagingService.getMessages.bind(this.messagingService);
  
  /**
   * Mark messages as read
   */
  markMessagesAsRead = this.messagingService.markMessagesAsRead.bind(this.messagingService);
}

// Export singleton instance
export const socialService = new SocialService();