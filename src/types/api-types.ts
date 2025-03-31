import { corsHeaders } from '../utils/edge-shared';

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  status: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiRequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * API client specific types
 */
export interface CreateCheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  isTestMode?: boolean;
}

export interface CreateBillingPortalRequest {
  returnUrl: string;
  isTestMode?: boolean;
}

export interface StripeSessionResponse {
  sessionId: string;
  url: string;
}

/**
 * Export CORS headers from the shared utility
 */
export { corsHeaders };