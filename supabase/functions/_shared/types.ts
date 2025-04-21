// supabase/functions/_shared/types.ts
// Centralized types for Supabase Edge Functions, avoiding reliance on external package imports.

/**
 * Represents the standard user data structure for email marketing services.
 * Copied from packages/types/src/email.marketing.types.ts
 */
export interface UserData {
  id: string; // Your internal user ID
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string; // ISO string format recommended
  lastSignInAt?: string; // ISO string format
  // Add other standard fields you might want to sync
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allows for platform-specific custom fields
}

// --- Subscription Related Types ---
// Copied from supabase/functions/api-subscriptions/types.ts

export interface SubscriptionPlan {
  id: string;
  stripePriceId: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  metadata?: Record<string, any>;
}

export interface UserSubscription {
  id: string | null;
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: SubscriptionPlan | null;
}

export interface CheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalRequest {
  returnUrl: string;
}

export interface SessionResponse {
  sessionId: string;
  url: string;
}

export interface SubscriptionUsageMetrics {
  current: number;
  limit: number;
  reset_date?: string | null;
}

// --- Email Marketing Service Types (Mirrored from packages/types/src/email.types.ts) ---

/**
 * Defines the common contract for interacting with different email marketing platforms.
 */
export interface EmailMarketingService {
  /**
   * Adds a new user/subscriber to the primary list/audience/tag.
   * @param userData - The user's details.
   */
  addUserToList(userData: UserData): Promise<void>;

  /**
   * Updates attributes/custom fields for an existing user/subscriber.
   * Typically identified by email or their ID in the marketing platform.
   * @param email - The user's email address to identify them.
   * @param attributes - An object containing the fields to update.
   */
  updateUserAttributes(email: string, attributes: Partial<UserData>): Promise<void>;

  /**
   * (Optional but recommended for advanced segmentation)
   * Tracks a specific event performed by the user.
   * @param email - The user's email address.
   * @param eventName - The name of the event (e.g., 'Subscription Upgraded').
   * @param properties - Optional additional data about the event.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trackEvent?(email: string, eventName: string, properties?: Record<string, any>): Promise<void>;

  /**
   * (Optional) Removes a user from the list/unsubscribes them.
   * Usually handled by the platform's unsubscribe links, but useful for manual removal.
   * @param email - The user's email address.
   */
  removeUser?(email: string): Promise<void>;
}

// --- AI Types (Copied from packages/types) ---

// Basic JSON type alias
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Represents a single message within a Chat.
 * Matches the chat_messages table structure.
 * id/chat_id are optional as they aren't present before DB save.
 */
export interface ChatMessage {
  id?: string; // Optional before DB save
  chat_id?: string; // Optional before DB save (for new chats)
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ai_provider_id: string | null;
  system_prompt_id: string | null;
  token_usage: Json | null;
  created_at: string; // This might also be optional pre-save, but adapters add it.
}

/**
 * Structure for sending a message via the 'chat' Edge Function.
 * Includes message history needed by adapters.
 */
export interface ChatApiRequest {
  message: string;
  providerId: string; // AiProvider['id'] (ID from ai_providers table)
  promptId: string;   // SystemPrompt['id'] or '__none__'
  chatId?: string;   // Chat['id'] (optional for new chats)
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]; // History + System Prompt
}

/**
 * Represents the standardized information returned by a provider's listModels method.
 */
export interface ProviderModelInfo {
  api_identifier: string; // The specific ID the provider uses for this model in API calls
  name: string;           // A user-friendly name for the model
  description?: string;    // Optional description
  config?: Json;         // Optional non-sensitive configuration details
}

/**
 * Interface for AI provider adapters.
 * Defines the common methods required for interacting with different AI provider APIs.
 */
export interface AiProviderAdapter {
  sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string, // The specific API identifier for the model (e.g., 'gpt-4o')
    apiKey: string
  ): Promise<ChatMessage>;

  listModels(apiKey: string): Promise<ProviderModelInfo[]>;
}

// --- End AI Types ---

// --- Add other shared types below --- 