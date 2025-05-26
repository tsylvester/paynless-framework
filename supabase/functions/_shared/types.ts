// supabase/functions/_shared/types.ts
// Centralized APPLICATION-LEVEL types for Supabase Edge Functions.
// Types directly related to DB tables should be imported from ../types_db.ts
import type { Database, Json } from '../types_db.ts';
import type { handleCorsPreflightRequest, createSuccessResponse, createErrorResponse } from './cors-headers.ts';
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js";
import type { Spy } from "jsr:@std/testing@0.225.1/mock";
import type { User as SupabaseUser } from "npm:@supabase/supabase-js";
import { Tables } from '../types_db.ts';
import type { ITokenWalletService } from './types/tokenWallet.types.ts';
// Import MessageForTokenCounting from the centralized location AT THE TOP



// Define PaymentTransaction using the Tables helper type from types_db.ts
export type PaymentTransaction = Tables<'payment_transactions'>;

export type UpdatePaymentTransactionFn = (
  transactionId: string,
  updates: Partial<Omit<PaymentTransaction, 'id' | 'created_at' | 'user_id' | 'payment_provider' | 'transaction_type' | 'amount' | 'currency' | 'provider_transaction_id' | 'metadata_json'>> & { 
    metadata_json?: Json | Record<string, unknown>;
    status?: string; // Explicitly allow status here, or ensure it's not in Omit
    gateway_transaction_id?: string; // Allow this as well, as it's used
  },
  stripeEventId?: string
) => Promise<PaymentTransaction | null>;


// We can add more specific context types if needed for other categories of handlers.

export interface PaymentConfirmation {
  success: boolean;
  transactionId: string | undefined;
  error?: string;
}

/**
 * Logging levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}  

/**
* Configuration for the logger
*/
export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  captureErrors: boolean;
}

/**
 * Interface for log entry metadata
 */
export interface LogMetadata {
  [key: string]: unknown;
}

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
  [key: string]: unknown; // Allows for platform-specific custom fields
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
  providerId: string; // uuid for ai_providers table
  promptId: string;   // uuid for system_prompts table, or '__none__'
  chatId?: string;   // uuid, optional for new chats
  selectedMessages?: { // User-selected messages for context
    role: 'system' | 'user' | 'assistant';
    content: string;
    // Potentially include other relevant fields from ChatMessage if needed by adapter,
    // e.g., id, if adapters need to reference original messages.
    // For now, keeping it minimal to role and content.
  }[];
  messages?: { // For sending history to adapter, optional
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[];
  organizationId?: string; // uuid, optional for org chats - ADDED
  rewindFromMessageId?: string; // uuid, optional for rewinding - ADDED
  max_tokens_to_generate?: number; // ADDED: Max tokens for the AI to generate in its response
}

/**
 * Represents the standardized information returned by a provider's listModels method.
 */
export interface ProviderModelInfo {
  api_identifier: string; // The specific ID the provider uses for this model in API calls
  name: string;           // A user-friendly name for the model
  description?: string;    // Optional description
  // Use `Database['public']['Tables']['ai_providers']['Row']['config']` for the actual JSON type
  config?: Database['public']['Tables']['ai_providers']['Row']['config']; // Use specific DB Json type
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
  ): Promise<AdapterResponsePayload>; // Return type changed to AdapterResponsePayload

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
  token_usage: Database['public']['Tables']['chat_messages']['Row']['token_usage']; // Use specific DB Json type
  created_at?: string;
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
  token_usage?: Database['public']['Tables']['chat_messages']['Row']['token_usage']; // Use specific DB Json type
}

/**
 * Interface describing the signature of the getAiProviderAdapter function.
 */
export interface GetAiProviderAdapter {
  (provider: string): AiProviderAdapter | null;
}

/**
 * Interface describing the signature of the verifyApiKey function.
 */
export interface VerifyApiKey {
  (req: Request): boolean;
}

/**
 * Interface describing the public contract of a Logger instance.
 */
export interface ILogger {
  debug: (message: string, metadata?: LogMetadata) => void;
  info: (message: string, metadata?: LogMetadata) => void;
  warn: (message: string, metadata?: LogMetadata) => void;
  error: (message: string | Error, metadata?: LogMetadata) => void;
  // setLogLevel?: (level: LogLevel) => void; // Example if needed
}

  // Define the specific type for the RPC parameters based on types_db.ts
  export type PerformChatRewindArgs = Database['public']['Functions']['perform_chat_rewind']['Args'];
  
  // Define derived DB types needed locally
  export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']; // Added for storing AI provider errors
  
  export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
  // type ChatRow = Database['public']['Tables']['chats']['Row']; // Not directly used in handlePostRequest return
  
  export interface ChatHandlerSuccessResponse {
    userMessage?: ChatMessageRow;       // Populated for normal new messages and new user message in rewind
    assistantMessage: ChatMessageRow;  // Always populated on success
    chatId: string;                    // ID of the chat session (new or existing) - ADDED
    isRewind?: boolean;                 // True if this was a rewind operation
    isDummy?: boolean;                  // True if dummy provider was used
  }
  export interface ChatDetailsHandlerDeps {
    createSupabaseClient: typeof createClient;
    createJsonResponse: typeof createSuccessResponse;
    createErrorResponse: typeof createErrorResponse;
    // Add other specific dependencies if needed, e.g., a logger
  }
  

// Interface for messages argument in CountTokensForMessagesFn
// REMOVED Local Definition:
// export interface MessageForTokenCounting {
//   role: "system" | "user" | "assistant" | "function";
//   content: string | null;
//   name?: string;
// }

export interface MessageForTokenCounting {
  role: "system" | "user" | "assistant" | "function"; // Function role might be needed for some models
  content: string | null; // Content can be null for some function calls
  name?: string; // Optional, for function calls
}

// Accepted Tiktoken encoding names - aligned with js-tiktoken
export type TiktokenEncoding = 'cl100k_base' | 'p50k_base' | 'r50k_base' | 'gpt2' | 'o200k_base';

// Helper type for tiktoken_model_name_for_rules_fallback
export type TiktokenModelForRules = 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4o' | 'gpt-3.5-turbo-0301';

// This AiModelConfig is a simpler version, potentially for getMaxOutputTokens internal logic after defaults.
// It is NOT the source of truth for the DB ai_providers.config structure.
export interface AiModelConfig {
  input_token_cost_rate: number;
  output_token_cost_rate: number;
  hard_cap_output_tokens?: number;
  context_window_tokens?: number;
  tokenization_strategy: {
    type: 'tiktoken' | 'rough_char_count' | 'provider_specific_api' | 'unknown';
    tiktoken_encoding_name?: TiktokenEncoding;
    is_chatml_model?: boolean;
    api_identifier_for_tokenization?: string;
    chars_per_token_ratio?: number;
  };
  provider_max_input_tokens?: number;
  provider_max_output_tokens?: number;
  default_temperature?: number;
  default_top_p?: number;
}

// Comprehensive configuration for an AI model, reflecting ai_providers.config structure
export interface AiModelExtendedConfig {
  model_id?: string; // Optional: Internal model ID or name, for display or logging
  api_identifier: string; // Crucial: The string used to call the AI provider's API (e.g., "gpt-4-turbo")
  
  input_token_cost_rate: number | null; // Cost per 1000 input tokens, can be null from DB
  output_token_cost_rate: number | null; // Cost per 1000 output tokens, can be null from DB
  
  tokenization_strategy: 
    | { type: 'tiktoken'; tiktoken_encoding_name: TiktokenEncoding; tiktoken_model_name_for_rules_fallback?: TiktokenModelForRules; } 
    | { type: 'rough_char_count'; chars_per_token_ratio?: number; }
    | { type: 'claude_tokenizer'; } // Placeholder for Anthropic's official tokenizer
    | { type: 'google_gemini_tokenizer'; } // Placeholder for Google's official tokenizer
    | { type: 'none'; }; // If token counting is not applicable or handled externally

  hard_cap_output_tokens?: number; // An absolute maximum for output tokens
  context_window_tokens?: number;   // Provider's max context window (input + output usually)
  
  // Defaults that might be applied if the main rates are null (e.g., from a service-level config)
  service_default_input_cost_rate?: number; 
  service_default_output_cost_rate?: number;
  
  status?: 'active' | 'beta' | 'deprecated' | 'experimental';
  features?: string[]; // e.g., ["json_mode", "tool_use", "image_input"]
  max_context_window_tokens?: number; // Duplicates context_window_tokens? Consolidate if same meaning.
  notes?: string;

  // Optional: Provider-returned limits (can be synced automatically if API provides them)
  // These seem to overlap with hard_cap_output_tokens and context_window_tokens above.
  // Let's keep the ones defined initially for AiModelConfig (lines 300-301) if they are distinct.
  // provider_max_input_tokens?: number; // from the other AiModelConfig def
  // provider_max_output_tokens?: number; // from the other AiModelConfig def

  // Optional: Default parameters for the model (also from other AiModelConfig def)
  default_temperature?: number;
  default_top_p?: number;
  // is_chatml_model?: boolean; // Covered by tiktoken_model_name_for_rules_fallback or inferred
  // api_identifier_for_tokenization?: string; // Covered by main api_identifier generally
}

// Signature for countTokensForMessages function (this might be an old definition)
// export type CountTokensForMessagesFn = (
//   messages: MessageForTokenCounting[], 
//   modelName: string
// ) => number;

export interface ChatHandlerDeps {
  createSupabaseClient: typeof createClient;
  fetch: typeof fetch; // Global fetch type
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createSuccessResponse: typeof createSuccessResponse; // Use the corrected type name
  createErrorResponse: typeof createErrorResponse;
  getAiProviderAdapter: (provider: string, apiKey: string, logger?: ILogger) => AiProviderAdapter;
  getAiProviderAdapterOverride?: (provider: string, apiKey: string, logger?: ILogger) => AiProviderAdapter; // For testing
  verifyApiKey: (apiKey: string, providerName: string) => Promise<boolean>;
  logger: ILogger;
  tokenWalletService?: ITokenWalletService; 
  countTokensForMessages: (messages: MessageForTokenCounting[], modelConfig: AiModelExtendedConfig) => number; // Updated signature
  supabaseClient?: SupabaseClient; // Added for test overrides
}

// --- Interfaces for Mock Supabase Client (for testing) ---

export type User = SupabaseUser;

export interface IMockQueryBuilder {
  select: (columns?: string) => IMockQueryBuilder;
  insert: (data: unknown[] | object) => IMockQueryBuilder;
  update: (data: object) => IMockQueryBuilder;
  delete: () => IMockQueryBuilder;
  upsert: (data: unknown[] | object, options?: { onConflict?: string, ignoreDuplicates?: boolean }) => IMockQueryBuilder;

  // Filtering
  eq: (column: string, value: unknown) => IMockQueryBuilder;
  neq: (column: string, value: unknown) => IMockQueryBuilder;
  gt: (column: string, value: unknown) => IMockQueryBuilder;
  gte: (column: string, value: unknown) => IMockQueryBuilder;
  lt: (column: string, value: unknown) => IMockQueryBuilder;
  lte: (column: string, value: unknown) => IMockQueryBuilder;
  like: (column: string, pattern: string) => IMockQueryBuilder;
  ilike: (column: string, pattern: string) => IMockQueryBuilder;
  is: (column: string, value: 'null' | 'not null' | 'true' | 'false') => IMockQueryBuilder;
  in: (column: string, values: unknown[]) => IMockQueryBuilder;
  contains: (column: string, value: string | string[] | object) => IMockQueryBuilder;
  containedBy: (column: string, value: string | string[] | object) => IMockQueryBuilder;
  rangeGt: (column: string, range: string) => IMockQueryBuilder;
  rangeGte: (column: string, range: string) => IMockQueryBuilder;
  rangeLt: (column: string, range: string) => IMockQueryBuilder;
  rangeLte: (column: string, range: string) => IMockQueryBuilder;
  rangeAdjacent: (column: string, range: string) => IMockQueryBuilder;
  overlaps: (column: string, value: string | string[]) => IMockQueryBuilder;
  textSearch: (column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' }) => IMockQueryBuilder;
  match: (query: object) => IMockQueryBuilder;
  or: (filters: string, options?: { referencedTable?: string }) => IMockQueryBuilder;
  filter: (column: string, operator: string, value: unknown) => IMockQueryBuilder;
  not: (column: string, operator: string, value: unknown) => IMockQueryBuilder;

  // Modifiers
  order: (column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string }) => IMockQueryBuilder;
  limit: (count: number, options?: { referencedTable?: string }) => IMockQueryBuilder;
  range: (from: number, to: number, options?: { referencedTable?: string }) => IMockQueryBuilder;

  // Terminators
  single: () => Promise<{ data: object | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  maybeSingle: () => Promise<{ data: object | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  then: (
    onfulfilled?: ((value: { data: unknown[] | null; error: Error | null; count: number | null; status: number; statusText: string; }) => unknown | PromiseLike<unknown>) | null | undefined, 
    onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
  ) => Promise<unknown>; 
  returns: () => IMockQueryBuilder;
  methodSpies: { [key: string]: Spy<(...args: unknown[]) => unknown> };
}

export interface IMockSupabaseAuth {
  getUser: () => Promise<{ data: { user: User | null }; error: Error | null }>;
}

export interface IMockSupabaseClient {
  from: (tableName: string) => IMockQueryBuilder;
  auth: IMockSupabaseAuth; 
  rpc: (name: string, params?: object, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }) => Promise<{ data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  getLatestBuilder(tableName: string): IMockQueryBuilder | undefined;
  getHistoricBuildersForTable(tableName: string): IMockQueryBuilder[] | undefined;
  clearAllTrackedBuilders(): void;
}

export interface IMockClientSpies {
  auth: {
    getUserSpy: Spy<IMockSupabaseAuth['getUser']>;
  };
  rpcSpy: Spy<IMockSupabaseClient['rpc']>;
  fromSpy: Spy<IMockSupabaseClient['from']>;
  getLatestQueryBuilderSpies: (tableName: string) => ({
    select?: Spy<IMockQueryBuilder['select']>;
    insert?: Spy<IMockQueryBuilder['insert']>;
    update?: Spy<IMockQueryBuilder['update']>;
    delete?: Spy<IMockQueryBuilder['delete']>;
    upsert?: Spy<IMockQueryBuilder['upsert']>;
    eq?: Spy<IMockQueryBuilder['eq']>;
    neq?: Spy<IMockQueryBuilder['neq']>;
    gt?: Spy<IMockQueryBuilder['gt']>;
    gte?: Spy<IMockQueryBuilder['gte']>;
    lt?: Spy<IMockQueryBuilder['lt']>;
    lte?: Spy<IMockQueryBuilder['lte']>;
    single?: Spy<IMockQueryBuilder['single']>;
    maybeSingle?: Spy<IMockQueryBuilder['maybeSingle']>;
    then?: Spy<IMockQueryBuilder['then']>;
  } | undefined);
}

export type PerformChatRewindResult = Database['public']['Functions']['perform_chat_rewind']['Returns'];

// Add this new interface
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
