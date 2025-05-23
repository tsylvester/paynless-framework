// supabase/functions/_shared/types.ts
// Centralized APPLICATION-LEVEL types for Supabase Edge Functions.
// Types directly related to DB tables should be imported from ../types_db.ts
import type { Database } from '../types_db.ts';
import type { handleCorsPreflightRequest, createSuccessResponse, createErrorResponse } from './cors-headers.ts';
import { createClient } from "npm:@supabase/supabase-js";
import type { Spy } from "jsr:@std/testing@0.225.1/mock";
import type { User as SupabaseUser } from "npm:@supabase/supabase-js";

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
  messages?: { // For sending history to adapter, optional
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[];
  organizationId?: string; // uuid, optional for org chats - ADDED
  rewindFromMessageId?: string; // uuid, optional for rewinding - ADDED
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

export interface ChatHandlerDeps {
  createSupabaseClient: typeof createClient;
  fetch: typeof fetch; // Global fetch type
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createSuccessResponse: typeof createSuccessResponse; // Use the corrected type name
  createErrorResponse: typeof createErrorResponse;
  getAiProviderAdapter: GetAiProviderAdapter; // Use the new specific type
  verifyApiKey: VerifyApiKey;
  logger: ILogger;
}

// --- Interfaces for Mock Supabase Client (for testing) ---

export type User = SupabaseUser;

export interface IMockQueryBuilder {
  select: (columns?: string) => IMockQueryBuilder;
  insert: (data: unknown[] | object) => IMockQueryBuilder;
  update: (data: object) => IMockQueryBuilder;
  delete: () => IMockQueryBuilder; // delete often doesn't take args directly, filters applied before
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
  not: (column: string, operator: string, value: unknown) => IMockQueryBuilder; // Simplified not, full not is more complex

  // Modifiers
  order: (column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string }) => IMockQueryBuilder;
  limit: (count: number, options?: { referencedTable?: string }) => IMockQueryBuilder;
  range: (from: number, to: number, options?: { referencedTable?: string }) => IMockQueryBuilder;

  // Terminators
  single: () => Promise<{ data: object | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  maybeSingle: () => Promise<{ data: object | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  // .then is implicitly supported by async functions / promises in JS/TS, 
  // but if we want to spy on it explicitly as a method:
  then: (
    onfulfilled?: ((value: { data: unknown[] | null; error: Error | null; count: number | null; status: number; statusText: string; }) => unknown | PromiseLike<unknown>) | null | undefined, 
    onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
  ) => Promise<unknown>; 
  // For RPC-like calls if the builder supports it (e.g. PostgREST functions)
  returns: () => IMockQueryBuilder; // Or Promise<any> if it's terminal

  // TODO: Add other methods as needed: e.g., rpc within builder, with, modifiers like .csv()
}

export interface IMockSupabaseAuth {
  // Define methods we need to mock, e.g.:
  getUser: () => Promise<{ data: { user: User | null }; error: Error | null }>; // Now User is defined
  // Add signOut, signUp, signInWithPassword etc. if needed for tests
  // For admin actions if used by client directly (usually not)
  // admin?: { listUsers: () => Promise<any>, deleteUser: (id: string) => Promise<any> };
}

export interface IMockSupabaseClient {
  from: (tableName: string) => IMockQueryBuilder;
  // Define simplified auth object for now based on what's typically used client-side
  auth: IMockSupabaseAuth; 
  rpc: (name: string, params?: object, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }) => Promise<{ data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  // Add removeChannel, getChannels etc. if realtime is tested
}

// Interface for the collection of spies returned by the mock client setup
export interface IMockClientSpies {
  auth: {
    getUserSpy: Spy<IMockSupabaseAuth['getUser']>; // Spy type is now available
    // Add other auth method spies here
  };
  rpcSpy: Spy<IMockSupabaseClient['rpc']>; // Spy type is now available
  fromSpy: Spy<IMockSupabaseClient['from']>; // Spy type is now available
  
  // New way to access query builder method spies for a specific table
  // This function would be part of the returned spies object.
  // It retrieves the spies from the *last* MockQueryBuilder instance created for that table.
  getLatestQueryBuilderSpies: (tableName: string) => ({
    select?: Spy<IMockQueryBuilder['select']>; // Spy type is now available
    insert?: Spy<IMockQueryBuilder['insert']>; // Spy type is now available
    update?: Spy<IMockQueryBuilder['update']>; // Spy type is now available
    delete?: Spy<IMockQueryBuilder['delete']>; // Spy type is now available
    upsert?: Spy<IMockQueryBuilder['upsert']>; // Spy type is now available
    eq?: Spy<IMockQueryBuilder['eq']>; // Spy type is now available
    neq?: Spy<IMockQueryBuilder['neq']>; // Spy type is now available
    gt?: Spy<IMockQueryBuilder['gt']>; // Spy type is now available
    gte?: Spy<IMockQueryBuilder['gte']>; // Spy type is now available
    lt?: Spy<IMockQueryBuilder['lt']>; // Spy type is now available
    lte?: Spy<IMockQueryBuilder['lte']>; // Spy type is now available
    // Add other filter/modifier/terminator method spies as needed
    single?: Spy<IMockQueryBuilder['single']>; // Spy type is now available
    maybeSingle?: Spy<IMockQueryBuilder['maybeSingle']>; // Spy type is now available
    then?: Spy<IMockQueryBuilder['then']>; // Spy type is now available
  } | undefined);
}

// The return type of the refined createMockSupabaseClient function
export interface MockSupabaseClientSetup {
  client: IMockSupabaseClient; // The mock client instance
  spies: IMockClientSpies;   // The collection of spies
}

// Define the specific type for the RPC parameters based on types_db.ts
export type PerformChatRewindArgs = Database['public']['Functions']['perform_chat_rewind']['Args'];

// Define derived DB types needed locally
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
// type ChatRow = Database['public']['Tables']['chats']['Row']; // Not directly used in handlePostRequest return

export interface ChatHandlerSuccessResponse {
  userMessage?: ChatMessageRow;       // Populated for normal new messages and new user message in rewind
  assistantMessage: ChatMessageRow;  // Always populated on success
  isRewind?: boolean;                 // True if this was a rewind operation
  isDummy?: boolean;                  // True if dummy provider was used
}
