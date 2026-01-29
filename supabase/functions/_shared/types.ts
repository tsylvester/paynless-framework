// supabase/functions/_shared/types.ts
// Centralized APPLICATION-LEVEL types for Supabase Edge Functions.
// Types directly related to DB tables should be imported from ../types_db.ts
import type { Database, Json } from '../types_db.ts';
import type { handleCorsPreflightRequest, createSuccessResponse, createErrorResponse } from './cors-headers.ts';
import type { CountTokensDeps, CountableChatPayload } from './types/tokenizer.types.ts';
import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js";
import { Tables } from '../types_db.ts';
import type { ITokenWalletService } from './types/tokenWallet.types.ts';
import type { prepareChatContext } from '../chat/prepareChatContext.ts';
import type { handleNormalPath } from '../chat/handleNormalPath.ts';
import type { handleRewindPath } from '../chat/handleRewindPath.ts';
import type { handleDialecticPath } from '../chat/handleDialecticPath.ts';
import type { debitTokens } from '../chat/debitTokens.ts';
import { SystemInstruction } from '../dialectic-service/dialectic.interface.ts';

export type GetAiProviderAdapterFn = (
  deps: FactoryDependencies
) => AiProviderAdapterInstance | null;

export type ChatInsert = Tables<'chats'>;

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

export type ResourceDocuments = {
  id?: string;
  content: string;
}[];

/**
 * Structure for sending a message via the 'chat' Edge Function.
 * Includes message history needed by adapters.
 */
export interface ChatApiRequest {
  message: string;
  providerId: string; // uuid for ai_providers table
  promptId: string;   // uuid for system_prompts table, or '__none__'
  chatId?: string;   // uuid, optional for new chats
  walletId?: string; // uuid, optional for specific wallet selection - ADDED
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
  resourceDocuments?: ResourceDocuments;
  organizationId?: string; // uuid, optional for org chats - ADDED
  rewindFromMessageId?: string; // uuid, optional for rewinding - ADDED
  max_tokens_to_generate?: number; // ADDED: Max tokens for the AI to generate in its response
  continue_until_complete?: boolean; // ADDED: Flag to enable response continuation
  isDialectic?: boolean; // ADDED: Flag to indicate a 'headless' dialectic job that should not be saved to the DB
  systemInstruction?: SystemInstruction;
  stream?: boolean; // ADDED: Flag to indicate a streaming request
}

/**
 * Represents the standardized information returned by a provider's listModels method.
 */
export interface ProviderModelInfo {
  api_identifier: string; // The specific ID the provider uses for this model in API calls
  name: string;           // A user-friendly name for the model
  description?: string;    // Optional description
  config?: Partial<AiModelExtendedConfig>;
}
  
/**
 * Interface for AI provider adapters. Defines the constructor and instance methods
 * required for a class to be a valid, interchangeable AI provider.
 */
export type AiProviderAdapter = new (
  provider: Tables<'ai_providers'>,
  apiKey: string,
  logger: ILogger
) => {
  sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string, // The specific API identifier for the model (e.g., 'gpt-4o')
  ): Promise<AdapterResponsePayload>;

  listModels(): Promise<ProviderModelInfo[]>;

  getEmbedding?(text: string): Promise<EmbeddingResponse>;
};

export type AiProviderAdapterInstance = InstanceType<AiProviderAdapter>;

// TODO: chat_id is optional to support "headless" dialectic messages that are not
// associated with a chat history but are still processed by the /chat endpoint
// for token accounting. Re-evaluate this after the chat service refactor.
export type ChatMessage = Omit<Database['public']['Tables']['chat_messages']['Row'], 'chat_id'> & {
    chat_id?: string;
    // Keep application-level status enrichment if needed by UI directly
    // Note: status was previously added to LocalChatMessage, consider if it belongs here
    status?: 'pending' | 'sent' | 'error'; 
};

export type FinishReason = 'stop' 
| 'length' 
| 'tool_calls' 
| 'content_filter' 
| 'function_call' 
| 'error' 
| 'unknown' 
| 'max_tokens' 
| 'content_truncated' 
| 'next_document' 
| null;

export enum ContinueReason {
    MaxTokens = 'max_tokens',
    Length = 'length',
    ContentTruncated = 'content_truncated',
    Unknown = 'unknown',
    NextDocument = 'next_document',
    ToolCalls = 'tool_calls',
    TruncationRecovery = 'truncation_recovery',
    Continuation = 'continuation',
    TokenLimit = 'token_limit',
}

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
  finish_reason?: FinishReason; // ADDED: Standardized finish reason
}

/**
 * Represents a full chat message record as stored in the database.
 */
export interface FullChatMessageRecord {
  id: string;
      // TODO: chat_id is nullable to accommodate 'headless' dialectic messages that are not associated with a chat.
    // This should be revisited when the chat and dialectic services are more formally separated.
    chat_id?: string;
  user_id: string;
  created_at: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ai_provider_id?: string | null;
  system_prompt_id?: string | null;
  token_usage?: Database['public']['Tables']['chat_messages']['Row']['token_usage']; // Use specific DB Json type
}


// Define the dependencies for the factory to allow for injection.
export interface FactoryDependencies {
  provider: Tables<'ai_providers'>;
  apiKey: string;
  logger: ILogger;
  providerMap?: Record<string, AiProviderAdapter>;
}
/**
 * Interface describing the signature of the getAiProviderAdapter function.
 */
export interface GetAiProviderAdapter {
  (dependencies: FactoryDependencies): AiProviderAdapterInstance | null;
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
    chatId?: string;                   // ID of the chat session, optional for 'headless' dialectic jobs
    finish_reason?: FinishReason;      // ADDED: The reason the AI provider finished generating tokens
    isRewind?: boolean;                 // True if this was a rewind operation
    isDummy?: boolean;                  // True if dummy provider was used
  }
  export interface ChatDetailsHandlerDeps {
    createSupabaseClient: typeof createClient;
    createJsonResponse: typeof createSuccessResponse;
    createErrorResponse: typeof createErrorResponse;
    // Add other specific dependencies if needed, e.g., a logger
  }
  

// Interface for messages argument in countTokensFn
// REMOVED Local Definition:
// export interface MessageForTokenCounting {
//   role: "system" | "user" | "assistant" | "function";
//   content: string | null;
//   name?: string;
// }

export interface Messages {
  id?: string; // Optional: The UUID of the source contribution for this message
  role: "system" | "user" | "assistant" | "function"; // Function role might be needed for some models
  content: string | null; // Content can be null for some function calls
  name?: string; // Optional, for function calls
}

export interface EmbeddingResponse {
  embedding: number[];
  usage: {
      prompt_tokens: number;
      total_tokens: number;
  };
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
  id?: string; // Optional: The UUID of the provider from the ai_providers table.
  model_id?: string; // Optional: Internal model ID or name, for display or logging
  api_identifier: string; // Crucial: The string used to call the AI provider's API (e.g., "gpt-4-turbo")
  
  input_token_cost_rate: number | null; // Cost per 1000 input tokens, can be null from DB
  output_token_cost_rate: number | null; // Cost per 1000 output tokens, can be null from DB
  
  tokenization_strategy: 
    | { type: 'tiktoken'; tiktoken_encoding_name: TiktokenEncoding; tiktoken_model_name_for_rules_fallback?: TiktokenModelForRules; is_chatml_model?: boolean; api_identifier_for_tokenization?: string; } 
    | { type: 'rough_char_count'; chars_per_token_ratio?: number; }
    | { type: 'anthropic_tokenizer'; model: string }
    | { type: 'google_gemini_tokenizer'; chars_per_token_ratio?: number } // Allow explicit ratio control for Gemini
    | { type: 'none'; }; // If token counting is not applicable or handled externally

  hard_cap_output_tokens?: number; // An absolute maximum for output tokens
  context_window_tokens?: number | null;   // Provider's max context window (input + output usually)
  
  // Defaults that might be applied if the main rates are null (e.g., from a service-level config)
  service_default_input_cost_rate?: number; 
  service_default_output_cost_rate?: number;
  
  status?: 'active' | 'beta' | 'deprecated' | 'experimental';
  features?: string[]; // e.g., ["json_mode", "tool_use", "image_input"]
  notes?: string;

  provider_max_input_tokens?: number; 
  provider_max_output_tokens?: number; 

  // Optional: Default parameters for the model (also from other AiModelConfig def)
  default_temperature?: number;
  default_top_p?: number;
  // is_chatml_model?: boolean; // Covered by tiktoken_model_name_for_rules_fallback or inferred
  // api_identifier_for_tokenization?: string; // Covered by main api_identifier generally
}

/**
 * A strict, application-ready data contract for a fully configured AI model.
 * This is the final, validated output of the ConfigAssembler, ensuring that
 * the model has a complete and non-partial configuration before being used.
 */
export interface FinalAppModelConfig {
  api_identifier: string;
  name: string;
  description: string;
  // Note: The 'config' property is NOT optional and NOT partial.
  // It must be a complete, valid object.
  config: AiModelExtendedConfig; 
}

// Signature for countTokens function (this might be an old definition)
// export type countTokensFn = (
//   messages: MessageForTokenCounting[], 
//   modelName: string
// ) => number;

export interface ChatHandlerDeps {
  createSupabaseClient: typeof createClient;
  fetch: typeof fetch; // Global fetch type
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createSuccessResponse: typeof createSuccessResponse; // Use the corrected type name
  createErrorResponse: typeof createErrorResponse;
  getAiProviderAdapter: (dependencies: FactoryDependencies) => AiProviderAdapterInstance | null;
  getAiProviderAdapterOverride?: (dependencies: FactoryDependencies) => AiProviderAdapterInstance | null;
  verifyApiKey: (apiKey: string, providerName: string) => Promise<boolean>;
  logger: ILogger;
  tokenWalletService?: ITokenWalletService; 
  countTokens: (deps: CountTokensDeps, payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number;
  prepareChatContext: typeof prepareChatContext;
  handleNormalPath: typeof handleNormalPath;
  handleRewindPath: typeof handleRewindPath;
  handleDialecticPath: typeof handleDialecticPath;
  debitTokens: typeof debitTokens;
  handlePostRequest?: (requestBody: ChatApiRequest, supabaseClient: SupabaseClient<Database>, userId: string, deps: ChatHandlerDeps) => Promise<ChatHandlerSuccessResponse | { error: { message: string, status?: number } }>;
  handleStreamingRequest?: (requestBody: ChatApiRequest, supabaseClient: SupabaseClient<Database>, userId: string, deps: ChatHandlerDeps) => Promise<Response>;
}

export type PerformChatRewindResult = Database['public']['Functions']['perform_chat_rewind']['Returns'];

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  finish_reason?: 'stop' | 'length';
}

// Define ChatMessageRole locally for clarity if not available from shared types
export type ChatMessageRole = 'system' | 'user' | 'assistant';

// --- START: New/Standardized Interfaces ---

export interface ServiceError {
  message: string;
  status?: number;
  details?: string | Record<string, unknown>[];
  code?: string;
}

export interface GetUserFnResult {
  data: { user: User | null };
  error: ServiceError | null;
}

export interface GetUserFn {
  (): Promise<GetUserFnResult>;
}

// --- END: New/Standardized Interfaces ---

// +++ ADDED Chat Context Preferences Type +++
/**
 * Defines the structure for user-specific chat UI preferences,
 * intended to be stored as JSON in user_profiles.chat_context.
 */
export interface ChatContextPreferences {
  newChatContext?: string | null;      // Corresponds to ChatContextSelector
  selectedProviderId?: string | null;  // Corresponds to ModelSelector (provider ID)
  selectedPromptId?: string | null;    // Corresponds to PromptSelector
}
// +++ END Chat Context Preferences Type +++

// Define the allowed values for profile privacy settings
export type ProfilePrivacySetting = 'private' | 'public' | 'members_only';

// Define the type for profile updates - ONLY first/last name
export type UserProfileUpdate = {
  first_name?: string | null; // Match DB nullability
  last_name?: string | null; // Match DB nullability
  last_selected_org_id?: string | null; // <<< ADD THIS LINE BACK
  chat_context?: ChatContextPreferences | null; // Added to store user's chat selector preferences
  profile_privacy_setting?: ProfilePrivacySetting; // Added for user profile privacy
  is_subscribed_to_newsletter?: boolean; // Added for user newsletter subscription
  has_seen_welcome_modal?: boolean; // Added for user welcome modal seen
}