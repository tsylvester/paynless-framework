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
  
  // Method declarations
  followUser: (userId: string) => Promise<boolean>;
  unfollowUser: (userId: string) => Promise<boolean>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  muteUser: (userId: string) => Promise<boolean>;
  unmuteUser: (userId: string) => Promise<boolean>;
  checkIfFollowing: (userId: string) => Promise<boolean>;
  checkIfBlocked: (userId: string) => Promise<boolean>;
  getFollowerCounts: (userId: string) => Promise<FollowerCount | null>;
  getFollowing: (cursor?: string, limit?: number) => Promise<UserRelationship[] | null>;
  getBlocked: (cursor?: string, limit?: number) => Promise<UserRelationship[] | null>;
  createPost: (request: CreatePostRequest) => Promise<ApiResponse<Post>>;
  updatePost: (postId: string, request: UpdatePostRequest) => Promise<ApiResponse<Post>>;
  deletePost: (postId: string) => Promise<ApiResponse<void>>;
  getTimeline: (cursor?: string, limit?: number) => Promise<ApiResponse<TimelineResponse>>;
  getUserPosts: (userId: string, cursor?: string, limit?: number) => Promise<ApiResponse<TimelineResponse>>;
  createComment: (request: CreateCommentRequest) => Promise<ApiResponse<Comment>>;
  getComments: (postId: string, cursor?: string, limit?: number) => Promise<ApiResponse<CommentResponse>>;
  reactToPost: (request: CreateReactionRequest) => Promise<ApiResponse<Reaction>>;
  unreactToPost: (reactionId: string) => Promise<ApiResponse<void>>;
  checkIfReacted: (postId: string) => Promise<ApiResponse<Reaction>>;
  getPrivacySettings: () => Promise<ApiResponse<PrivacySettings>>;
  updatePrivacySettings: (settings: PrivacySettings) => Promise<ApiResponse<PrivacySettings>>;
  sendMessage: (request: SendMessageRequest) => Promise<ApiResponse<Message>>;
  getConversations: (cursor?: string, limit?: number) => Promise<ApiResponse<ConversationResponse>>;
  getMessages: (conversationId: string, cursor?: string, limit?: number) => Promise<ApiResponse<MessageResponse>>;
  markMessagesAsRead: (conversationId: string) => Promise<ApiResponse<void>>;
  
  constructor() {
    this.postService = new PostService();
    this.commentService = new CommentService();
    this.reactionService = new ReactionService();
    this.relationshipService = new RelationshipService();
    this.privacyService = new PrivacyService();
    this.messagingService = new MessagingService();

    // Bind methods in constructor
    this.followUser = this.relationshipService.followUser.bind(this.relationshipService);
    this.unfollowUser = this.relationshipService.unfollowUser.bind(this.relationshipService);
    this.blockUser = this.relationshipService.blockUser.bind(this.relationshipService);
    this.unblockUser = this.relationshipService.unblockUser.bind(this.relationshipService);
    this.muteUser = this.relationshipService.muteUser.bind(this.relationshipService);
    this.unmuteUser = this.relationshipService.unmuteUser.bind(this.relationshipService);
    this.checkIfFollowing = this.relationshipService.checkIfFollowing.bind(this.relationshipService);
    this.checkIfBlocked = this.relationshipService.checkIfBlocked.bind(this.relationshipService);
    this.getFollowerCounts = this.relationshipService.getFollowerCounts.bind(this.relationshipService);
    this.getFollowing = this.relationshipService.getFollowing.bind(this.relationshipService);
    this.getBlocked = this.relationshipService.getBlocked.bind(this.relationshipService);
    this.createPost = this.postService.createPost.bind(this.postService);
    this.updatePost = this.postService.updatePost.bind(this.postService);
    this.deletePost = this.postService.deletePost.bind(this.postService);
    this.getTimeline = this.postService.getTimeline.bind(this.postService);
    this.getUserPosts = this.postService.getUserPosts.bind(this.postService);
    this.createComment = this.commentService.createComment.bind(this.commentService);
    this.getComments = this.commentService.getComments.bind(this.commentService);
    this.reactToPost = this.reactionService.reactToPost.bind(this.reactionService);
    this.unreactToPost = this.reactionService.unreactToPost.bind(this.reactionService);
    this.checkIfReacted = this.reactionService.checkIfReacted.bind(this.reactionService);
    this.getPrivacySettings = this.privacyService.getPrivacySettings.bind(this.privacyService);
    this.updatePrivacySettings = this.privacyService.updatePrivacySettings.bind(this.privacyService);
    this.sendMessage = this.messagingService.sendMessage.bind(this.messagingService);
    this.getConversations = this.messagingService.getConversations.bind(this.messagingService);
    this.getMessages = this.messagingService.getMessages.bind(this.messagingService);
    this.markMessagesAsRead = this.messagingService.markMessagesAsRead.bind(this.messagingService);
  }
}

// Export singleton instance
export const socialService = new SocialService();