import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest
} from './ai.types';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Options for customizing fetch requests in the apiClient.
 * Extends standard RequestInit.
 */
export interface FetchOptions extends RequestInit {
  isPublic?: boolean; // Indicates if the endpoint requires authentication
  token?: string;     // Allows passing a specific token, overriding the automatic one
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    perPage: number;
    currentPage: number;
    lastPage: number;
    from: number;
    to: number;
  };
}

export interface ApiRequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export interface CacheConfig {
  strategy: 'cache-first' | 'network-first';
  maxAge: number;
  staleWhileRevalidate: boolean;
}

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  parameters?: {
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
  responses: {
    [key: number]: {
      description: string;
      schema: Record<string, unknown>;
    };
  };
}

/**
 * Utility type for responses from API endpoints
 */
export type ApiResponse<T> = 
  | { status: number; data: T; error?: ApiError }
  | { status: number; data?: never; error: ApiError };

// ---> Define custom error for auth requirement <---
export class AuthRequiredError extends Error {
    constructor(message: string = 'Authentication required') {
        super(message);
        this.name = 'AuthRequiredError';
    }
}

// +++ Add IApiClient Interface +++
/**
 * Defines the contract for the API client methods needed by stores.
 */
export interface IApiClient {
  ai: {
    getAiProviders: () => Promise<ApiResponse<AiProvider[]>>;
    getSystemPrompts: () => Promise<ApiResponse<SystemPrompt[]>>;
    sendChatMessage: (request: ChatApiRequest, options?: FetchOptions) => Promise<ApiResponse<ChatMessage>>;
    getChatHistory: (token: string) => Promise<ApiResponse<Chat[]>>;
    getChatMessages: (chatId: string, token: string) => Promise<ApiResponse<ChatMessage[]>>;
  };
  post: <T, U>(endpoint: string, body: U, options?: FetchOptions) => Promise<ApiResponse<T>>;
  // Define other top-level API namespaces if needed
  // billing?: { ... }; 
  // organizations?: { ... };
}
// +++ End IApiClient Interface +++