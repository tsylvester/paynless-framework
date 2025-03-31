/**
 * Types for direct messaging functionality
 */

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  conversationId?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
}

/**
 * Request/response types for messaging API endpoints
 */
export interface SendMessageRequest {
  recipientId: string;
  content: string;
}

export interface UpdateMessageStatusRequest {
  messageIds: string[];
  status: MessageStatus;
}

export interface ConversationsResponse {
  conversations: Conversation[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface MessagesResponse {
  messages: Message[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}