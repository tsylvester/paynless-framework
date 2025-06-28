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
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Represents the standard structure for successful API responses.
 */
export interface SuccessResponse<T> {
  status: number;
  data?: T;
  error?: undefined;
  assistantMessage?: string;
  chatId?: string;
}

/**
 * Represents the standard structure for error API responses.
 */
export interface ErrorResponse {
  status: number;
  data?: undefined;
  error: ApiError;
}

// --- Types for API Streaming (e.g., SSE) ---

/**
 * Defines the structure for callback functions used with API streaming connections.
 *
 * @template T The expected type of data received in messages.
 */
export interface StreamCallbacks<T> {
    /** Function called when a new message (correctly parsed) is received. */
    onMessage: (data: T) => void;
    /** Function called when any error occurs (connection, parsing, etc.). */
    onError: (error: Event | Error) => void;
    /** Optional function called when the stream connection is successfully opened. */
    onOpen?: () => void;
}

/**
 * Represents the function returned by a streaming connection method, used to disconnect.
 */
export type StreamDisconnectFunction = () => void;

// ---------------------------------------------