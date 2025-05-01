// supabase/functions/_shared/types.ts
// Centralized APPLICATION-LEVEL types for Supabase Edge Functions.
// Types directly related to DB tables should be imported from ../types_db.ts
import type { Database } from '../types_db.ts';

/**
 * Represents the standard user data structure for email marketing services.
 * Copied from packages/types/src/email.types.ts
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

// --- Subscription Related API Types (Not DB Tables) ---

export interface CheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalRequest {
  returnUrl: string;
}

export interface SessionResponse {
  sessionId?: string; // Make optional as it might not always be present (e.g., portal)
  url: string;
}

export interface SubscriptionUsageMetrics {
  current: number;
  limit: number;
  reset_date?: string | null;
}

// --- Email Marketing Service Interface ---

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

// --- AI Adapter/API Types (Not DB Tables) ---

/**
 * Structure for sending a message via the 'chat' Edge Function.
 * Includes message history needed by adapters.
 */
export interface ChatApiRequest {
  message: string;
  providerId: string; // AiProvider['id'] (ID from ai_providers table)
  promptId: string;   // SystemPrompt['id'] or '__none__'
  chatId?: string;   // Chat['id'] (optional for new chats)
  // NOTE: The ChatMessage type previously here is REMOVED.
  // Adapters/functions will need to handle message structure internally
  // or import the DB type `Database['public']['Tables']['chat_messages']['Row']` from `../types_db.ts`.
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]; // History + System Prompt
}

/**
 * Represents the standardized information returned by a provider's listModels method.
 */
export interface ProviderModelInfo {
  api_identifier: string; // The specific ID the provider uses for this model in API calls
  name: string;           // A user-friendly name for the model
  description?: string;    // Optional description
  // Use `Database['public']['Tables']['ai_providers']['Row']['config']` for the actual JSON type
  config?: any; // Use 'any' here to avoid importing Json from db-types
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
  ): Promise<any>; // Return type changed to any - implementation needs to use DB type

  listModels(apiKey: string): Promise<ProviderModelInfo[]>;
}

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'] & {
  // Keep application-level status enrichment if needed by UI directly
  // Note: status was previously added to LocalChatMessage, consider if it belongs here
  status?: 'pending' | 'sent' | 'error'; 
};

/**
 * Type representing the payload returned *by* an AI Provider Adapter's sendMessage method.
 * This contains only the information the adapter can realistically provide before
 * the message is saved to the database (which adds id, chat_id, user_id, created_at).
 */
export interface AdapterResponsePayload {
  role: 'assistant'; // Adapters always return assistant messages
  content: string;
  ai_provider_id: string | null; // The DB ID of the provider used
  system_prompt_id: string | null; // The DB ID of the prompt used (or null)
  token_usage: any | null; // Use 'any' for now to avoid linter issues
}

/**
 * Represents a full chat message record as stored in the database.
 */
export interface FullChatMessageRecord {
  id: string;
  chat_id: string;
  user_id: string;
  created_at: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ai_provider_id?: string | null;
  system_prompt_id?: string | null;
  token_usage?: any | null; // Use 'any' for now
}