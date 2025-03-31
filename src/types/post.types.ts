export enum PostVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  PRIVATE = 'private',
}

export enum ReactionType {
  LIKE = 'like',
  LOVE = 'love',
  CELEBRATE = 'celebrate',
  SUPPORT = 'support',
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  visibility: PostVisibility;
  parentId?: string | null; // Parent post ID for replies
  attachments?: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
}

export interface CreatePostRequest {
  content: string;
  visibility: PostVisibility;
  parentId?: string; // Optional parent post ID for replies
  attachments?: string[];
}

export interface UpdatePostRequest {
  content?: string;
  visibility?: PostVisibility;
  attachments?: string[];
}

export interface Reaction {
  id: string;
  postId: string;
  userId: string;
  type: ReactionType;
  createdAt: string;
}

export interface CreateReactionRequest {
  postId: string;
  type: ReactionType;
}

export interface ReactionCheckResponse {
  hasReacted: boolean;
  reaction?: Reaction;
}

export interface TimelineResponse {
  posts: Post[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface RepliesResponse {
  replies: Post[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}