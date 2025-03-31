/**
 * Types for user relationships and social interactions
 */

export enum RelationshipType {
  FOLLOW = 'follow',
  BLOCK = 'block',
  MUTE = 'mute',
}

export interface UserRelationship {
  id: string;
  userId: string;
  relatedUserId: string;
  type: RelationshipType;
  createdAt: string;
}

export interface FollowerCount {
  userId: string;
  followerCount: number;
  followingCount: number;
}

/**
 * Request/response types for relationship API endpoints
 */
export interface CreateRelationshipRequest {
  relatedUserId: string;
  type: RelationshipType;
}

export interface RemoveRelationshipRequest {
  relatedUserId: string;
  type: RelationshipType;
}

export interface GetRelationshipsResponse {
  relationships: UserRelationship[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface RelationshipCheckResponse {
  exists: boolean;
  relationship?: UserRelationship;
}