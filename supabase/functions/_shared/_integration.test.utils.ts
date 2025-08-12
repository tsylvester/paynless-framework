/**
 * @file supabase/functions/chat/_integration.test.utils.ts
 * @description Provides utility functions for setting up and tearing down isolated test environments
 * for Supabase integration tests. This utility ensures that tests can declare their required
 * database state, and any changes made to support the test are perfectly rolled back afterwards,
 * leaving the database in its original state.
 *
 * Key Principles:
 * 1.  Transactional Guarantee: Each test operates within a pseudo-transaction. All database
 *     modifications made by this utility for a test are undone upon teardown.
 * 2.  Declarative State: Tests declare their required resources and their desired states using
 *     `TestSetupConfig`.
 * 3.  Idempotent Setup: The utility handles cases where a resource might already exist. If it
 *     exists, it's temporarily modified (and restored later). If not, it's created (and deleted later).
 * 4.  Automatic Cleanup: `coreCleanupTestResources` (typically called in a global `afterEach`
 *     or test suite teardown) handles reverting all tracked changes.
 * 5.  Admin Privileges for Setup/Teardown: Uses the `supabaseAdminClient` to prepare and clean
 *     the database state, bypassing RLS for these operations. Test logic itself should use
 *     user-specific clients to validate RLS.
 */

import {
  ILogger,
  LogMetadata,
} from "./types.ts";
import { isTokenUsage } from "./utils/type_guards.ts";
import type { Database } from "../types_db.ts";
import { getMockAiProviderAdapter } from "./ai_service/ai_provider.mock.ts";
import type { GenerateContributionsDeps } from "../../functions/dialectic-service/dialectic.interface.ts";
import type { ChatApiRequest } from "./types.ts";
import { MockFileManagerService } from './services/file_manager.mock.ts';
import { createClient } from "npm:@supabase/supabase-js";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import * as djwt from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { AiModelExtendedConfig } from "./types.ts";

function isDbRow(obj: any): obj is { id: string; [key: string]: any } {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj) && 'id' in obj && typeof obj.id === 'string';
}

// --- Exported Constants ---
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
export const SUPABASE_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET");
export const CHAT_FUNCTION_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/chat` : 'http://localhost:54321/functions/v1/chat';
export const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'mock-model',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'none' },
};


// Set a default for the content storage bucket if it's not already set
if (!Deno.env.get('SB_CONTENT_STORAGE_BUCKET')) {
  console.log(`[TestUtil] SB_CONTENT_STORAGE_BUCKET value is ${Deno.env.get('SB_CONTENT_STORAGE_BUCKET')}.`);
}


// --- New Type Guards for RPC Calls ---

function isChatMessageRole(role: any): role is 'user' | 'system' | 'assistant' {
    return typeof role === 'string' && ['user', 'system', 'assistant'].includes(role);
}

function isTableColumnInfo(obj: any): obj is TableColumnInfo {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'column_name' in obj && typeof obj.column_name === 'string' &&
    'data_type' in obj && typeof obj.data_type === 'string' &&
    'is_nullable' in obj && (obj.is_nullable === 'YES' || obj.is_nullable === 'NO') &&
    'column_default' in obj && (typeof obj.column_default === 'string' || obj.column_default === null) &&
    'udt_name' in obj && typeof obj.udt_name === 'string'
  );
}

function isTableColumnInfoArray(data: any): data is TableColumnInfo[] {
  return Array.isArray(data) && data.every(isTableColumnInfo);
}

interface RawConstraintInfo {
  constraint_name: string;
  constraint_type: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK";
  constrained_column: string | null;
  foreign_table_schema?: string | null;
  foreign_table_name?: string | null;
  foreign_column?: string | null;
  check_clause?: string | null;
  delete_rule?: string | null;
  update_rule?: string | null;
}

function isRawConstraintInfo(obj: any): obj is RawConstraintInfo {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'constraint_name' in obj && typeof obj.constraint_name === 'string' &&
    'constraint_type' in obj && typeof obj.constraint_type === 'string'
  );
}

function isRawConstraintInfoArray(data: any): data is RawConstraintInfo[] {
    return Array.isArray(data) && data.every(isRawConstraintInfo);
}

interface RawIndexInfo {
    indexname: string;
    indexdef: string;
}

function isRawIndexInfo(obj: any): obj is RawIndexInfo {
    return obj !== null && typeof obj === 'object' && 'indexname' in obj && typeof obj.indexname === 'string' && 'indexdef' in obj && typeof obj.indexdef === 'string';
}

function isRawIndexInfoArray(data: any): data is RawIndexInfo[] {
    return Array.isArray(data) && data.every(isRawIndexInfo);
}

interface RawTriggerInfo {
    trigger_name: string;
    event_manipulation: string;
    action_timing: string;
    action_statement: string;
}

function isRawTriggerInfo(obj: any): obj is RawTriggerInfo {
    return obj !== null && typeof obj === 'object' &&
        'trigger_name' in obj && typeof obj.trigger_name === 'string' &&
        'event_manipulation' in obj && typeof obj.event_manipulation === 'string' &&
        'action_timing' in obj && typeof obj.action_timing === 'string' &&
        'action_statement' in obj && typeof obj.action_statement === 'string';
}

function isRawTriggerInfoArray(data: any): data is RawTriggerInfo[] {
    return Array.isArray(data) && data.every(isRawTriggerInfo);
}

interface RLSInfo {
    relrowsecurity: boolean;
}

function isRLSInfo(obj: any): obj is RLSInfo {
    return obj !== null && typeof obj === 'object' && 'relrowsecurity' in obj && typeof obj.relrowsecurity === 'boolean';
}


// --- Test Resource Management --- 

/**
 * Defines the dependencies required by this test utility.
 */
interface TestUtilityDeps {
  createSupabaseClient: typeof createClient;
  logger: ILogger;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseClient?: SupabaseClient<Database>;
}

/**
 * Defines the types of undo actions that can be registered and processed by `coreCleanupTestResources`.
 * Each action represents a specific operation that needs to be reversed to restore the pre-test state.
 */
export type UndoAction = 
  | { type: 'DELETE_CREATED_USER'; userId: string; scope: 'global' | 'local'; } 
  | { type: 'DELETE_CREATED_ROW'; tableName: keyof Database['public']['Tables']; criteria: Record<string, any>; scope: 'global' | 'local'; }
  | { 
      type: 'RESTORE_UPDATED_ROW'; 
      tableName: keyof Database['public']['Tables']; 
      identifier: Record<string, any>; // To uniquely identify the row for restoration
      originalRow: Record<string, any>; // The complete original row data
      scope: 'global' | 'local';
    }
  | { type: 'DELETE_STORAGE_OBJECT'; bucketName: string; path: string; scope: 'global' | 'local'; };
  // Future: Add more as needed, e.g., for wallet balance adjustments if not covered by row restoration
  // | { type: 'RESTORE_WALLET_BALANCE'; userId: string; organizationId?: string | null; originalBalance: number; scope: 'global' | 'local'; };

/**
 * Stores the stack of undo actions to be performed during teardown.
 * Actions are added via `registerUndoAction` and processed by `coreCleanupTestResources` in LIFO order.
 */
let undoActionsStack: UndoAction[] = [];

/**
 * ADDED: This variable will hold the JWT for the currently initialized test user.
 * It is set by `coreInitializeTestStep` and retrieved by `getTestUserAuthToken`.
 */
let currentTestJwt: string | null = null;

/**
 * Registers an undo action to the global `undoActionsStack`.
 * These actions are processed in reverse order of registration during `coreCleanupTestResources`.
 * This function is primarily for internal use by the utility functions when they make changes
 * that need to be reverted, but can also be called directly from test setup if providing a fully-formed UndoAction.
 *
 * @param action The `UndoAction` (which must include a `scope`) to register.
 */
export function registerUndoAction(action: UndoAction) {
  undoActionsStack.unshift(action);
}

// The old TestResource interface, currentTestRegisteredResources array,
// and registerTestResource function are now removed as they are replaced by the UndoAction system.

/**
 * Cleans up all resources that were created or modified by `coreInitializeTestStep` for the current test.
 * It iterates through the `undoActionsStack` and performs the appropriate reversal action for each entry.
 * This function is CRITICAL for ensuring tests are isolated and do not leave side effects on the database.
 * It should typically be called in a global `afterEach` hook or at the end of a test suite.
 *
 * Considerations:
 * - Ensure `supabaseAdminClient` is initialized and available.
 * - Actions are processed in LIFO (Last In, First Out) order, which is generally correct for 
 *   reversing operations that might have dependencies (e.g., delete a row before deleting the user it references,
 *   assuming user creation was registered first, then the row creation).
 */
export async function coreCleanupTestResources(executionScope: 'all' | 'local' = 'local') {
  if (!supabaseAdminClient) {
    console.warn("Supabase admin client not initialized; cannot clean up test resources.");
    return;
  }
  console.log(`[TestUtil] Starting cleanup process with executionScope: '${executionScope}'. Current undo stack size: ${undoActionsStack.length}`);

  const actionsToProcess = executionScope === 'all' 
    ? [...undoActionsStack] // Process a copy of all actions
    : undoActionsStack.filter(action => action.scope === 'local'); // Process only local actions

  const remainingActions: UndoAction[] = executionScope === 'all'
    ? [] // All actions will be removed
    : undoActionsStack.filter(action => action.scope === 'global'); // Keep global actions if scope is local

  // Dependency-aware sorting of actions.
  // This is a targeted fix. A more robust solution might involve building a full dependency graph.
  actionsToProcess.sort((a, b) => {
    // Rule 1: Always process 'DELETE_CREATED_ROW' for 'user_subscriptions' first.
    if (a.type === 'DELETE_CREATED_ROW' && a.tableName === 'user_subscriptions' && b.type !== 'DELETE_CREATED_ROW') return -1;
    if (b.type === 'DELETE_CREATED_ROW' && b.tableName === 'user_subscriptions' && a.type !== 'DELETE_CREATED_ROW') return 1;
    
    // Rule 2: User deletion should happen last.
    if (a.type === 'DELETE_CREATED_USER') return 1;
    if (b.type === 'DELETE_CREATED_USER') return -1;
    
    return 0; // Keep original order for other types
  });

  // Process actions in the reverse order of their registration (LIFO)
  for (const action of actionsToProcess) {
    try {
      console.log(`[TestUtil] Processing UNDO action: ${JSON.stringify(action)}`);
      switch (action.type) {
        case 'DELETE_CREATED_USER': {
          const { error: deleteUserError } = await supabaseAdminClient.auth.admin.deleteUser(action.userId);
          if (deleteUserError) {
            console.error(`[TestUtil] Error executing UNDO DELETE_CREATED_USER for ${action.userId}: ${deleteUserError.name} (${deleteUserError.status}) - ${deleteUserError.message}`, deleteUserError);
          } else {
            console.log(`[TestUtil] Successfully executed UNDO DELETE_CREATED_USER for ID: ${action.userId}`);
          }
          break;
        }
        case 'DELETE_CREATED_ROW': {
          const { error } = await supabaseAdminClient
            .from(action.tableName)
            .delete()
            .match(action.criteria);
          if (error) {
            console.error(`[TestUtil] Error executing UNDO DELETE_CREATED_ROW from ${action.tableName} with criteria ${JSON.stringify(action.criteria)}:`, error);
          } else {
            console.log(`[TestUtil] Successfully executed UNDO DELETE_CREATED_ROW from ${action.tableName} with criteria ${JSON.stringify(action.criteria)}`);
          }
          break;
        }
        case 'RESTORE_UPDATED_ROW': {
          const { error } = await supabaseAdminClient
            .from(action.tableName)
            .update(action.originalRow) // originalRow needs to be just the fields to update, not the whole object with e.g. created_at for insert
            .match(action.identifier); 
          if (error) {
            console.error(`[TestUtil] Error executing UNDO RESTORE_UPDATED_ROW in ${action.tableName} with criteria ${JSON.stringify(action.identifier)}:`, error);
          } else {
            console.log(`[TestUtil] Successfully executed UNDO RESTORE_UPDATED_ROW in ${action.tableName} with criteria ${JSON.stringify(action.identifier)}`);
          }
          break;
        }
        case 'DELETE_STORAGE_OBJECT': {
          const { error: deleteStorageError } = await supabaseAdminClient.storage
            .from(action.bucketName)
            .remove([action.path]);
          if (deleteStorageError) {
            console.error(`[TestUtil] Error executing UNDO DELETE_STORAGE_OBJECT for ${action.bucketName}/${action.path}:`, deleteStorageError);
          } else {
            console.log(`[TestUtil] Successfully executed UNDO DELETE_STORAGE_OBJECT for ${action.bucketName}/${action.path}`);
          }
          break;
        }
        default: {
          const unhandledAction: never = action;
          console.warn("[TestUtil] Unhandled undo action type:", unhandledAction);
          break;
        }
      }
    } catch (e) {
      console.error("[TestUtil] Exception during undo action processing:", action, e);
    }
  }
  undoActionsStack = remainingActions; // Update the stack with remaining actions
  console.log(`[TestUtil] Finished cleanup process. Remaining undo stack size: ${undoActionsStack.length}`);
}

// --- Exported Shared Instances and Mutable State ---
export let supabaseAdminClient: SupabaseClient<Database>;
// const testUserAuthToken: string | null = null; // Commented out as it's not set globally by the utility anymore.
export let currentTestDeps: TestUtilityDeps;

export const testLogger: ILogger = {
  debug: (message: string, metadata?: LogMetadata) => console.debug('[TestLogger DEBUG]', message, metadata || ""),
  info: (message: string, metadata?: LogMetadata) => console.log('[TestLogger INFO]', message, metadata || ""),
  warn: (message: string, metadata?: LogMetadata) => console.warn('[TestLogger WARN]', message, metadata || ""),
  error: (message: string | Error, metadata?: LogMetadata) => console.error('[TestLogger ERROR]', message, metadata || ""),
};

export const mockAiAdapter = getMockAiProviderAdapter(testLogger, MOCK_MODEL_CONFIG);

// --- Core Logic for Test Setup and Helpers (to be called by router) ---

export function initializeSupabaseAdminClient(): SupabaseClient<Database> {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL environment variable is not set.");
  }
  if (!SERVICE_ROLE_KEY) { 
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
  }
  const client = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  supabaseAdminClient = client;
  return client;
}

export function initializeTestDeps(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  if (!supabaseAdminClient) {
    initializeSupabaseAdminClient(); // Ensure admin client is available
  }

  currentTestDeps = {
    createSupabaseClient: createClient, // Use the direct import
    logger: testLogger,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: SERVICE_ROLE_KEY,
    supabaseClient: undefined,
  };

  // The complex override for createSupabaseClient within defaultDeps is no longer needed here
  // because we are directly providing the imported createClient.
  // The mockAiAdapter and TokenWalletService are also not part of the core utility deps.
  // If specific tests need a mock adapter or a token wallet service with the admin client,
  // they should set that up themselves or we can provide more specific helper functions for those.
}

export async function coreTeardown() {
  if (supabaseAdminClient) {
    try {
      const results = await supabaseAdminClient.removeAllChannels();
      if (results.includes("error") || results.includes("timed out")) {
        console.warn("Error or timeout during removeAllChannels in teardown:", results);
      } else {
        console.log("Successfully called removeAllChannels. Results:", results);
      }
    } catch (e) {
      console.warn("Exception during removeAllChannels in teardown:", e);
    }
  }
}

export async function coreCreateAndSetupTestUser(
  profileProps?: Partial<{ role: "user" | "admin"; first_name: string }>,
  scope: 'global' | 'local' = 'local'
): Promise<{ userId: string; userClient: SupabaseClient<Database>; jwt: string }> {
  if (!currentTestDeps || !supabaseAdminClient) {
    throw new Error(
      "Test dependencies or admin client not initialized. Call initializeTestDeps() first."
    );
  }

  const testUserEmail = `testuser-${crypto.randomUUID()}@example.com`;
  const testUserPassword = "password123";

  const { data: authData, error: authError } =
    await supabaseAdminClient.auth.admin.createUser({
      email: testUserEmail,
      password: testUserPassword,
      email_confirm: true, // Auto-confirm email for tests
    });

  if (authError || !authData.user) {
    console.error("Error creating test user:", authError);
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }
  const userId = authData.user.id;
  registerUndoAction({ type: 'DELETE_CREATED_USER', userId, scope });

  // Upsert a corresponding user_profile
  const profileDataToUpsert: Database['public']['Tables']['user_profiles']['Insert'] = {
    id: userId,
    role: profileProps?.role || "user",
    first_name: profileProps?.first_name || `TestUser-${userId.substring(0, 8)}`,
    // other non-nullable fields with no defaults must be specified here or have DB defaults
  };

  // Fetch existing profile to restore later, if any
  const { data: existingProfile, error: fetchError } = await supabaseAdminClient
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine
    console.error(`Error fetching existing profile for user ${userId} before upsert:`, fetchError);
    // Decide if this should throw or just warn
  }
  if (existingProfile) {
    registerUndoAction({
      type: 'RESTORE_UPDATED_ROW',
      tableName: 'user_profiles',
      identifier: { id: userId },
      originalRow: existingProfile,
      scope
    });
  } else {
    // If it didn't exist, we'll delete it on cleanup
    registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'user_profiles',
        criteria: { id: userId },
        scope
    });
  }

  const { error: profileError } = await supabaseAdminClient
    .from("user_profiles")
    .upsert(profileDataToUpsert);

  if (profileError) {
    console.error("Error upserting user profile:", profileError);
    throw new Error(
      `Failed to upsert user profile for ${userId}: ${profileError.message}`
    );
  }

  // Always generate JWT with 'authenticated' role for RLS purposes
  const jwt = await coreGenerateTestUserJwt(userId, 'authenticated');

  const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false, // Explicitly disable auto-refresh for test user clients
      detectSessionInUrl: false, // Recommended for server-side/test environments
    },
  });

  return { userId, userClient, jwt };
}

export async function coreGenerateTestUserJwt(userId: string, role: string = 'authenticated', app_metadata?: Record<string, unknown>): Promise<string> {
  if (!SUPABASE_JWT_SECRET) {
    console.error("[TestUtil] SUPABASE_JWT_SECRET is not set! Cannot sign JWTs for tests.");
    throw new Error("SUPABASE_JWT_SECRET is not set. Cannot sign JWTs for tests.");
  }
  // Log the presence and length of the JWT secret for debugging
  console.log(`[TestUtil] SUPABASE_JWT_SECRET is present. Length: ${SUPABASE_JWT_SECRET.length}`);

  const payload: djwt.Payload = {
    iss: SUPABASE_URL ?? 'http://localhost:54321', 
    sub: userId, 
    role: role, 
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + (60 * 60), 
    iat: Math.floor(Date.now() / 1000),
    app_metadata: { provider: 'email', providers: ['email'], ...(app_metadata || {}) },
  };
  const header: djwt.Header = { alg: "HS256", typ: "JWT" };
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(SUPABASE_JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const jwt = await djwt.create(header, payload, cryptoKey);

  // Log the generated JWT
  console.log(`[coreInitializeTestStep] Generated JWT for user ${userId}: ${jwt}`);

  return jwt;
}

export async function coreEnsureTestUserAndWallet(userId: string, initialBalance: number = 10000, scope: 'global' | 'local' = 'local') {
  if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized.");

  // Define identifier for the user's personal wallet
  const walletIdentifier = { user_id: userId, organization_id: null }; 

  const { data: existingWallet, error: selectError } = await supabaseAdminClient
    .from('token_wallets')
    .select('*') // Select all columns for potential restoration
    .eq('user_id', userId)
    .is('organization_id', null) // Explicitly check for organization_id IS NULL
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine
    console.error(`Error fetching token wallet for user ${userId}:`, selectError);
    throw selectError;
  }
  console.log(`[TestUtil] Existing token_wallet for user ${userId} (org null): ${existingWallet ? JSON.stringify(existingWallet) : 'Not found'}`);

  const desiredWalletState = {
    user_id: userId,
    balance: initialBalance,
    currency: 'AI_TOKEN',
    organization_id: null,
    // Ensure all required fields are here or have DB defaults
  };

  if (existingWallet) {
    // If it exists and we plan to change it (e.g. balance), register to restore it
    if (existingWallet.balance !== initialBalance) {
      registerUndoAction({
        type: 'RESTORE_UPDATED_ROW',
        tableName: 'token_wallets',
        identifier: { wallet_id: existingWallet.wallet_id }, // Use primary key for identification
        originalRow: existingWallet, // The complete original row
        scope: scope,
      });
      console.log(`[TestUtil] Registered UNDO action: RESTORE_UPDATED_ROW for 'token_wallets' ID: ${existingWallet.wallet_id}`);
      const { error: updateError } = await supabaseAdminClient
        .from('token_wallets')
        .update({ balance: initialBalance, updated_at: new Date().toISOString() })
        .eq('wallet_id', existingWallet.wallet_id);
      if (updateError) {
        console.error(`Error updating token wallet for user ${userId}:`, updateError);
        throw updateError;
      }
    }
  } else {
    // Wallet does not exist, so we will create it and register an action to delete it
    console.log(`[TestUtil] No existing token_wallet for user ${userId} (org null), will create with balance: ${initialBalance}`);
    const { data: newWallet, error: insertError } = await supabaseAdminClient
      .from('token_wallets')
      .insert(desiredWalletState)
      .select('wallet_id') // Select wallet_id to use for deletion criteria
      .single();

    if (insertError || !newWallet) {
      console.error(`Error inserting token wallet for user ${userId}:`, insertError);
      throw insertError || new Error('Failed to insert token wallet and get its ID.');
    }

    registerUndoAction({
      type: 'DELETE_CREATED_ROW',
      tableName: 'token_wallets',
      criteria: { wallet_id: newWallet.wallet_id }, // Use primary key for deletion
      scope: scope,
    });
    console.log(`[TestUtil] Registered UNDO action: DELETE_CREATED_ROW for 'token_wallets' ID: ${newWallet.wallet_id}`);
  }
}

export function getTestUserAuthToken(): string | null {
    if (!currentTestJwt) {
        testLogger.warn("getTestUserAuthToken called but no JWT is set. This can happen if coreInitializeTestStep has not been called or failed.");
    }
    return currentTestJwt;
}

/**
 * Ensures that a standard set of AI providers required for integration tests
 * exist in the database with valid, predictable configurations.
 * This function is idempotent and uses the UndoAction system for cleanup.
 * @param adminClient The Supabase admin client.
 * @param scope The scope for the undo actions.
 */
export async function coreUpsertTestProviders(adminClient: SupabaseClient<Database>, scope: 'global' | 'local' = 'local') {
    console.log(`[TestUtil] Upserting standard test AI providers with scope: '${scope}'`);

    // Define the state of the providers required for the integration tests to run.
    const requiredProviders = [
        {
            api_identifier: 'openai-gpt-4o',
            name: 'GPT-4o (Integration Test)',
            provider: 'openai',
            config: {
                api_identifier: 'openai-gpt-4o',
                tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: true, api_identifier_for_tokenization: 'gpt-4o' },
                input_token_cost_rate: 5.0,
                output_token_cost_rate: 15.0,
                context_window_tokens: 128000,
            },
            is_active: true,
        },
        {
            api_identifier: 'anthropic-claude-3-5-sonnet-20240620',
            name: 'Claude 3.5 Sonnet (Integration Test)',
            provider: 'anthropic',
            config: {
                api_identifier: 'anthropic-claude-3-5-sonnet-20240620',
                tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-5-sonnet-20240620' },
                input_token_cost_rate: 3.00,
                output_token_cost_rate: 15.00,
                context_window_tokens: 200000,
            },
            is_active: true,
        },
    ];

    for (const provider of requiredProviders) {
        const identifier = { api_identifier: provider.api_identifier };
        
        const { data: existing, error: selectError } = await adminClient
            .from('ai_providers')
            .select('*')
            .match(identifier)
            .maybeSingle();

        if (selectError && selectError.code !== 'PGRST116') {
            console.error(`[TestUtil] Error checking for provider ${provider.api_identifier}:`, selectError);
            continue; // Skip to the next provider on error
        }

        if (isDbRow(existing)) {
            // Exists: register for restoration and update to ensure it's active and has the test config.
            registerUndoAction({ type: 'RESTORE_UPDATED_ROW', tableName: 'ai_providers', identifier, originalRow: existing, scope });
            
            const { error: updateError } = await adminClient
                .from('ai_providers')
                .update({ is_active: true, name: provider.name, config: provider.config })
                .match(identifier);

            if (updateError) {
                console.error(`[TestUtil] Error updating test provider ${provider.api_identifier}:`, updateError);
            } else {
                console.log(`[TestUtil] Successfully updated test provider: ${provider.api_identifier}`);
            }
        } else {
            // Does not exist: create it.
            const { data: newProvider, error: insertError } = await adminClient
                .from('ai_providers')
                .insert(provider)
                .select('id')
                .single();

            if (insertError || !newProvider) {
                console.error(`[TestUtil] Error creating test provider ${provider.api_identifier}:`, insertError);
            } else {
                console.log(`[TestUtil] Successfully created test provider: ${provider.api_identifier} with ID ${newProvider.id}`);
                registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'ai_providers', criteria: { id: newProvider.id }, scope });
            }
        }
    }
}

// --- Test Configuration Interfaces for Desired State Management ---

/**
 * Describes a generic way to identify a specific row in a table using a partial set of its columns.
 * This is typically used with primary keys or unique constraint fields to ensure a single row is targeted.
 * @template T - The table name, extending `keyof Database['public']['Tables']`.
 */
export type ResourceIdentifier<T extends keyof Database['public']['Tables']> = 
  Partial<Database['public']['Tables'][T]['Row']>;

/**
 * Defines a requirement for a single database resource (a row in a table) for a test.
 * The utility will ensure this resource exists and matches the `desiredState` before the test runs,
 * and will revert any changes or creations after the test.
 *
 * @template T - The specific table name, e.g., 'user_profiles', 'ai_providers'.
 */
export interface TestResourceRequirement<T extends keyof Database['public']['Tables'] = any> {
  /** The name of the table for this resource. */
  tableName: T;
  /** 
   * An object containing key-value pairs to uniquely identify the row (e.g., `{ id: 'some-uuid' }` 
   * or `{ api_identifier: 'gpt-4' }`). This is used to:
   * 1. Check if the row already exists.
   * 2. Target the row for updates if it exists.
   * 3. Target the row for deletion if it was created by the utility.
   * It's crucial that this identifier uniquely points to at most one row.
   */
  identifier: ResourceIdentifier<T>; 
  /** 
   * An object representing the desired state of the resource for the test.
   * - If the resource identified by `identifier` does NOT exist: 
   *   It will be CREATED. The `desiredState` (merged with `identifier` fields) must include all 
   *   non-nullable columns for a valid insertion. 
   * - If the resource DOES exist:
   *   It will be UPDATED with the fields specified in `desiredState`. Only provided fields are changed.
   *   Its original state will be captured and restored during teardown.
   *
   *   **Important for `desiredState` when creating new rows:**
   *   Ensure all non-nullable columns of your table are present in either `identifier` or `desiredState`
   *   to avoid database errors on insert. The utility merges `identifier` and `desiredState` for creations.
   */
  desiredState: Partial<Database['public']['Tables'][T]['Row']>; 
  // Optional: If true, and resource has user_id, it will be set to primaryUserId
  linkUserId?: boolean; 
  exportId?: string; // Optional: Used to export the ID of the created/identified resource for later reference
}

/**
 * Configuration object passed to `coreInitializeTestStep` to define the complete desired 
 * environment for a test.
 */
export interface TestSetupConfig {
  /**
   * An array of `TestResourceRequirement` objects.
   * The utility will process these in the order provided. If there are foreign key dependencies
   * between resources (e.g., an organization must exist before a user profile belonging to it, or a 
   * user must exist before their profile), list them in the correct creation order.
   * Teardown will automatically occur in the reverse order of registration, which typically handles dependencies correctly.
   * If omitted, no specific table resources will be provisioned beyond the default test user.
   */
  resources?: TestResourceRequirement[];
  /** 
   * Optional: Specifies properties for the primary test user that is automatically created 
   * for the test (e.g., role, first_name). This user is always created unless an error occurs earlier.
   * See `coreCreateAndSetupTestUser` for default values if not provided.
   */
  userProfile?: Partial<{ role: "user" | "admin"; first_name: string }>; 
  /** 
   * Optional: Specifies the initial token balance for the primary test user's default wallet.
   * Defaults to 10000 if not provided. See `coreEnsureTestUserAndWallet`.
   */
  initialWalletBalance?: number; 
}

// ADDED: Interface for returning info about processed resources
export interface ProcessedResourceInfo<T extends keyof Database['public']['Tables'] = any> {
  tableName: T;
  identifier: ResourceIdentifier<T>; // The identifier used from TestResourceRequirement
  resource?: Database['public']['Tables'][T]['Row'] | null; // The actual row data, esp. with ID
  status: 'created' | 'updated' | 'exists_unchanged' | 'failed' | 'skipped'; // Added skipped
  error?: string;
  exportId?: string; // Added exportId
}

/**
 * Finds a processed resource by its exportId from the results of coreInitializeTestStep.
 * This is a convenience helper to avoid manually searching the processedResources array.
 * @param processedResources The array returned from coreInitializeTestStep.
 * @param exportId The exportId you are looking for.
 * @returns The resource object from the database, or undefined if not found.
 */
export function findProcessedResource<T extends keyof Database['public']['Tables']>(
  processedResources: ProcessedResourceInfo[],
  tableName: T,
  exportId: string
): (Database['public']['Tables'][T]['Row'] & { id: string }) | undefined {
    const found = processedResources.find(p => p.exportId === exportId && p.tableName === tableName);
    if (found && found.resource) {
        // A type assertion is acceptable here because we are inside a specific utility
        // and have manually verified the type logic by checking tableName. 
        // This provides a strictly-typed interface to all calling functions.
        return found.resource as (Database['public']['Tables'][T]['Row'] & { id: string });
    }
    return undefined;
}

// --- New Helper Functions for Schema Integration Tests ---

export interface TableColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  udt_name: string; // Underlying data type
  numeric_precision: number | null;
  numeric_scale: number | null;
}

export async function getTableColumns(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<TableColumnInfo[]> {
  const query = `
    SELECT column_name, data_type, is_nullable, column_default, udt_name,
           numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'
    ORDER BY ordinal_position
  `;
  const { data, error } = await client.rpc('execute_sql', { query: query });
  if (error) {
    console.error("Error fetching table columns:", error);
    throw error;
  }
  if (isTableColumnInfoArray(data)) {
    return data;
  }
  console.error("Data from execute_sql for getTableColumns does not match expected type", data);
  return [];
}

export interface TableConstraintInfo {
  constraint_name: string;
  constraint_type: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK";
  constrained_columns: string[]; // For PK, FK, UNIQUE
  foreign_table_schema?: string; // For FK
  foreign_table_name?: string; // For FK
  foreign_columns?: string[]; // For FK - Names of columns in the foreign table
  check_clause?: string; // For CHECK
  delete_rule?: string; // Added for FK
  update_rule?: string; // Added for FK
}


export async function getTableConstraints(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<TableConstraintInfo[]> {
  const query = `
    SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name AS constrained_column,
        -- For Foreign Keys, get referenced table details from table_constraints (tc_ref)
        rc_ref.table_schema AS foreign_table_schema,
        rc_ref.table_name AS foreign_table_name,
        -- For Foreign Keys, get referenced column details from key_column_usage (kcu_ref)
        kcu_ref.column_name AS foreign_column,
        chk.check_clause,
        rc.update_rule,
        rc.delete_rule
    FROM
        information_schema.table_constraints AS tc
    JOIN
        information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name
    LEFT JOIN
        information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
    LEFT JOIN
        information_schema.table_constraints AS rc_ref -- Referenced table_constraints
        ON rc.unique_constraint_schema = rc_ref.table_schema
        AND rc.unique_constraint_name = rc_ref.constraint_name
    LEFT JOIN
        information_schema.key_column_usage AS kcu_ref -- Referenced key_column_usage
        ON rc_ref.constraint_schema = kcu_ref.constraint_schema
        AND rc_ref.constraint_name = kcu_ref.constraint_name
        -- This join needs to also ensure we match columns in the correct order if it's a composite key
        -- For simple FKs, this might be okay. For composite, kcu.position_in_unique_constraint = kcu_ref.ordinal_position
    LEFT JOIN
        information_schema.check_constraints AS chk
        ON tc.constraint_name = chk.constraint_name
        AND tc.constraint_schema = chk.constraint_schema
    WHERE
        tc.table_name = '${tableName}' AND tc.table_schema = '${schemaName}'
    ORDER BY
        tc.constraint_name, kcu.ordinal_position, kcu_ref.ordinal_position
  `;
  const { data: rawConstraints, error } = await client.rpc('execute_sql', { query: query });

  if (error) {
    console.error("Error fetching table constraints:", error);
    throw error;
  }

  if (!isRawConstraintInfoArray(rawConstraints)) {
    console.error('getTableConstraints received invalid data:', rawConstraints);
    return [];
  }

  const processedConstraints: { [key: string]: TableConstraintInfo } = {};
  rawConstraints.forEach(rc_row => { // Renamed loop variable to avoid conflict with outer 'rc' alias
    if (isRawConstraintInfo(rc_row)) {
      if (!processedConstraints[rc_row.constraint_name]) {
        processedConstraints[rc_row.constraint_name] = {
          constraint_name: rc_row.constraint_name,
          constraint_type: rc_row.constraint_type,
          constrained_columns: [],
          foreign_table_schema: rc_row.foreign_table_schema ?? undefined,
          foreign_table_name: rc_row.foreign_table_name ?? undefined,
          foreign_columns: rc_row.constraint_type === 'FOREIGN KEY' ? [] : undefined,
          check_clause: rc_row.check_clause ?? undefined,
          delete_rule: rc_row.delete_rule ?? undefined,
          update_rule: rc_row.update_rule ?? undefined,
        };
      }
      // Add constrained column if it's not already there
      if (rc_row.constrained_column && !processedConstraints[rc_row.constraint_name].constrained_columns.includes(rc_row.constrained_column)) {
        processedConstraints[rc_row.constraint_name].constrained_columns.push(rc_row.constrained_column);
      }
      // Add foreign column if it's a FOREIGN KEY constraint and the column is not already there
      if (rc_row.constraint_type === 'FOREIGN KEY' && rc_row.foreign_column && processedConstraints[rc_row.constraint_name].foreign_columns && !processedConstraints[rc_row.constraint_name].foreign_columns!.includes(rc_row.foreign_column) ) {
          processedConstraints[rc_row.constraint_name].foreign_columns!.push(rc_row.foreign_column);
      }
    }
  });

  return Object.values(processedConstraints);
}


export interface IndexInfo {
  indexname: string;
  indexdef: string;
  column_names: string[]; // Extracted from indexdef or a more specific query
}

export async function getTableIndexes(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<IndexInfo[]> {
  // This query gets basic index info. Parsing column names from indexdef can be complex.
  // For more robust index column checking, a more targeted query against pg_indexes and pg_index / pg_attribute might be needed.
  const query = `
    SELECT
        indexname,
        indexdef
    FROM
        pg_indexes
    WHERE
        schemaname = '${schemaName}' AND tablename = '${tableName}'
  `;
  const { data, error } = await client.rpc('execute_sql', { query: query });
  if (error) {
    console.error("Error fetching table indexes:", error);
    throw error;
  }

  if (!isRawIndexInfoArray(data)) {
    console.error("Invalid data for getTableIndexes", data);
    return [];
  }

  // Basic parsing of column names from indexdef (can be improved)
  return data.reduce<IndexInfo[]>((acc, idx) => {
    if (isRawIndexInfo(idx)) {
      const colMatch = idx.indexdef.match(/\(([^)]+)\)/);
      const column_names = colMatch ? colMatch[1].split(',').map((s: string) => s.trim().replace(/"/g, '')) : [];
      acc.push({
        indexname: idx.indexname,
        indexdef: idx.indexdef,
        column_names: column_names
      });
    }
    return acc;
  }, []);
}

// Keep one instance of setSharedAdminClient, remove any duplicates.
// This is the instance to keep (content may vary slightly, but signature is key)
export function setSharedAdminClient(client: SupabaseClient<Database>) {
  supabaseAdminClient = client;
}

export interface TriggerInfo {
  trigger_name: string;
  event_manipulation: string; // INSERT, DELETE, UPDATE, TRUNCATE
  action_timing: string; // BEFORE, AFTER, INSTEAD OF
  action_statement: string; // The command executed by the trigger
  // Add other fields if needed, e.g., trigger_schema, trigger_table
}

export async function getTriggersForTable(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<TriggerInfo[]> {
  const query = `
    SELECT
        trg.tgname AS trigger_name,
        evt.evtname AS event_manipulation, -- This gives 'insert', 'delete', 'update', 'truncate'
        CASE trg.tgtype::integer & 66 -- TG_TYPE_ROW (2) + TG_TYPE_BEFORE (0) / TG_TYPE_AFTER (4) / TG_TYPE_INSTEAD (64)
            WHEN 2 THEN 'BEFORE' -- ROW BEFORE
            WHEN 4 THEN 'AFTER'  -- ROW AFTER
            WHEN 66 THEN 'INSTEAD OF' -- ROW INSTEAD OF
            -- Add other combinations if needed, e.g., for statement-level triggers
            ELSE 'UNKNOWN'
        END AS action_timing,
        pg_get_triggerdef(trg.oid) AS action_statement -- Gets the CREATE TRIGGER statement
    FROM
        pg_trigger trg
    JOIN
        pg_class cls ON cls.oid = trg.tgrelid
    JOIN
        pg_namespace nsp ON nsp.oid = cls.relnamespace
    JOIN
        pg_event_trigger evt ON evt.oid = trg.tgevent_oid -- This join might be incorrect, need to verify how to get event type simply.
                                                        -- Simpler: parse from pg_get_triggerdef or use tgtype bits more extensively.

    -- Correctly mapping event manipulation from tgtype as evtname from pg_event_trigger is not for specific table triggers
    -- Let's use a more direct way to get event_manipulation
    WHERE
        cls.relname = '${tableName}' AND nsp.nspname = '${schemaName}' AND NOT trg.tgisinternal
    ORDER BY
        trigger_name;
  `;
  // A more robust way to get event_manipulation:
   const query_correct_event = `
    SELECT
        trg.tgname AS trigger_name,
        pg_get_triggerdef(trg.oid) AS trigger_definition, -- Contains full def, can parse event from here
        CASE
            WHEN (trg.tgtype::integer & (1<<2)) <> 0 THEN 'INSERT'
            WHEN (trg.tgtype::integer & (1<<3)) <> 0 THEN 'DELETE'
            WHEN (trg.tgtype::integer & (1<<4)) <> 0 THEN 'UPDATE'
            WHEN (trg.tgtype::integer & (1<<5)) <> 0 THEN 'TRUNCATE'
            ELSE 'UNKNOWN'
        END AS event_manipulation,
        CASE
            WHEN (trg.tgtype::integer & (1<<0)) <> 0 THEN 'ROW' -- TG_ROW_TRIGGER
            ELSE 'STATEMENT'
        END AS trigger_level, -- ROW or STATEMENT
        CASE
            WHEN (trg.tgtype::integer & (1<<1)) <> 0 THEN 'BEFORE' -- TG_BEFORE_TRIGGER
            WHEN (trg.tgtype::integer & (1<<6)) <> 0 THEN 'INSTEAD OF' -- TG_INSTEAD_TRIGGER
            ELSE 'AFTER' -- AFTER by default if not BEFORE or INSTEAD OF (assuming tgtype & 4 for AFTER)
        END AS action_timing,
        proc.proname AS function_name, -- Name of the trigger function
        nsp_proc.nspname AS function_schema -- Schema of the trigger function
    FROM
        pg_trigger trg
    JOIN
        pg_class cls ON cls.oid = trg.tgrelid
    JOIN
        pg_namespace nsp ON nsp.oid = cls.relnamespace
    JOIN
        pg_proc proc ON proc.oid = trg.tgfoid
    JOIN
        pg_namespace nsp_proc ON nsp_proc.oid = proc.pronamespace
    WHERE
        cls.relname = '${tableName}' AND nsp.nspname = '${schemaName}' AND NOT trg.tgisinternal
    ORDER BY
        trigger_name;
   `;
  // The above query for event is still a bit complex.
  // pg_get_triggerdef(trg.oid) itself is very informative.
  // Let's simplify and derive from execute_sql and process, or use a known structure.
  // For the 'handle_updated_at' use case, we often just need to know if a trigger calls a specific function.

  // Simplified query focusing on typical needs for 'handle_updated_at'
  const final_query = `
    SELECT
        tgname AS trigger_name,
        tgtype, -- Raw type, can decode later if needed
        pg_get_triggerdef(oid) as action_statement, -- Full definition, good for checks
        CASE
            WHEN (tgtype::integer & (1<<2)) <> 0 THEN 'INSERT'
            WHEN (tgtype::integer & (1<<3)) <> 0 THEN 'DELETE'
            WHEN (tgtype::integer & (1<<4)) <> 0 THEN 'UPDATE'
            ELSE 'TRUNCATE' -- Assuming tgconstrrelid means it's not TRUNCATE if others are false
        END AS event_manipulation,
        CASE
            WHEN (tgtype::integer & (1<<1)) <> 0 THEN 'BEFORE'
            WHEN (tgtype::integer & (1<<6)) <> 0 THEN 'INSTEAD OF'
            ELSE 'AFTER'
        END AS action_timing
    FROM pg_trigger
    WHERE tgrelid = (SELECT oid FROM pg_class WHERE relname = '${tableName}' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}'))
      AND NOT tgisinternal
    ORDER BY trigger_name
  `;

  const { data, error } = await client.rpc('execute_sql', { query: final_query });
  if (error) {
    console.error(`Error fetching triggers for ${schemaName}.${tableName}:`, error);
    throw error;
  }
  
  if (!isRawTriggerInfoArray(data)) {
    console.error("Invalid data for getTriggersForTable", data);
    return [];
  }

  return data.reduce<TriggerInfo[]>((acc, trg) => {
    if (isRawTriggerInfo(trg)) {
      acc.push({
        trigger_name: trg.trigger_name,
        event_manipulation: trg.event_manipulation,
        action_timing: trg.action_timing,
        action_statement: trg.action_statement,
      });
    }
    return acc;
  }, []);
}

export interface ForeignKeyInfo {
    constraint_name: string;
    foreign_key_column: string; // Name of the column in the referencing table
    referenced_table_name: string;
    referenced_column_name: string; // Name of the column in the referenced table
    delete_rule: string; // NO ACTION, RESTRICT, CASCADE, SET NULL, SET DEFAULT
    update_rule: string; // NO ACTION, RESTRICT, CASCADE, SET NULL, SET DEFAULT
}

export async function getForeignKeyInfo(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<ForeignKeyInfo[]> {
  const fkQuery = `
    SELECT
        tc.constraint_name AS constraint_name,
        kcu.column_name AS foreign_key_column,
        tc_ref.table_name AS referenced_table_name,
        kcu_ref.column_name AS referenced_column_name,
        rc.delete_rule,
        rc.update_rule
    FROM
        information_schema.table_constraints AS tc
    JOIN
        information_schema.key_column_usage AS kcu
        ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
        AND tc.table_name = kcu.table_name
    LEFT JOIN
        information_schema.referential_constraints AS rc
        ON tc.constraint_schema = rc.constraint_schema
        AND tc.constraint_name = rc.constraint_name
    LEFT JOIN
        information_schema.table_constraints AS tc_ref
        ON rc.unique_constraint_schema = tc_ref.constraint_schema
        AND rc.unique_constraint_name = tc_ref.constraint_name
    LEFT JOIN
        information_schema.key_column_usage AS kcu_ref
        ON tc_ref.constraint_schema = kcu_ref.constraint_schema
        AND tc_ref.constraint_name = kcu_ref.constraint_name
        AND kcu.position_in_unique_constraint = kcu_ref.ordinal_position
    WHERE
        tc.table_schema = '${schemaName}'
        AND tc.table_name = '${tableName}'
        AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY
        tc.constraint_name, kcu.ordinal_position
  `;

   const { data: rawFks, error } = await client.rpc('execute_sql', { query: fkQuery });

   if (error) {
     console.error(`Error fetching detailed foreign key info for ${schemaName}.${tableName}:`, error);
     throw error;
   }

  return rawFks.map((fk: any) => ({
    constraint_name: fk.constraint_name,
    foreign_key_column: fk.foreign_key_column,
    referenced_table_name: fk.referenced_table_name,
    referenced_column_name: fk.referenced_column_name,
    delete_rule: fk.delete_rule,
    update_rule: fk.update_rule,
  }));
}


export interface UniqueConstraintInfo {
  constraint_name: string;
  column_names: string[];
}

export async function getUniqueConstraintInfo(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<UniqueConstraintInfo[]> {
  const constraints = await getTableConstraints(client, tableName, schemaName);
  return constraints
    .filter(c => c.constraint_type === 'UNIQUE')
    .map(c => ({
      constraint_name: c.constraint_name,
      column_names: c.constrained_columns.sort(), // Sort for consistent comparison
    }));
}

export interface PrimaryKeyInfo {
  constraint_name: string;
  column_name: string; // Assuming PKs are usually single-column for this simplified version
                       // Or we can make it column_names: string[] like UNIQUE
}
// To match the test which expects an array of {column_name: string} for PKs
export interface PrimaryKeyColumnInfo {
    column_name: string;
}


export async function getPrimaryKeyInfo(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<PrimaryKeyColumnInfo[]> {
  const constraints = await getTableConstraints(client, tableName, schemaName);
  const pkConstraint = constraints.find(c => c.constraint_type === 'PRIMARY KEY');
  if (pkConstraint) {
    return pkConstraint.constrained_columns.map(colName => ({ column_name: colName }));
  }
  return [];
}

export async function isRLSEnabled(
  client: SupabaseClient<Database>,
  tableName: string,
  schemaName: string = "public"
): Promise<boolean> {
  const query = `
    SELECT relrowsecurity
    FROM pg_class cl
    JOIN pg_namespace nsp ON nsp.oid = cl.relnamespace
    WHERE cl.relname = '${tableName}' AND nsp.nspname = '${schemaName}'
  `;
  const { data, error } = await client.rpc('execute_sql', { query: query });
  if (error) {
    console.error(`Error checking RLS status for ${schemaName}.${tableName}:`, error);
    throw error;
  }
  if (data && Array.isArray(data) && data.length > 0 && isRLSInfo(data[0])) {
    return data[0].relrowsecurity;
  }
  return false; // Or throw error if table not found
}

// Helper function to resolve {$ref: ...} placeholders
function resolveReferences(obj: any, exportedIds: Map<string, string>): any {
  if (typeof obj === 'string') {
    // This regex finds all occurrences of "{$ref: '...'}""
    return obj.replace(/"\{\$ref: '([^']+)'\}"/g, (match, refKey) => {
      const resolved = exportedIds.get(refKey);
      if (resolved) {
        // Replace the entire placeholder with just the resolved ID, unquoted.
        return `"${resolved}"`;
      }
      // If a reference can't be resolved, leave it as is for debugging.
      console.warn(`[resolveReferences] Failed to resolve ref in string: "${refKey}"`);
      return match;
    });
  }
  
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => resolveReferences(item, exportedIds));
  }

  if (Object.prototype.hasOwnProperty.call(obj, '$ref') && typeof obj.$ref === 'string' && Object.keys(obj).length === 1) {
    const refKey = obj.$ref; 
    const actualId: string | undefined = exportedIds.get(refKey);

    if (actualId !== undefined) {
      return actualId;
    } else {
      console.warn(`[resolveReferences] Failed to resolve ref: "${refKey}".`);
      console.warn(`[resolveReferences] Full exportedIds map at this failure point: ${JSON.stringify(Array.from(exportedIds.entries()))}`);
      return obj;
    }
  }

  const newObj: { [key: string]: any } = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        // Also process standalone strings that might contain the placeholder pattern.
        newObj[key] = value.replace(/\{\$ref: '([^']+)'\}/g, (match, refKey) => {
          const resolved = exportedIds.get(refKey);
          if (resolved) {
            return resolved;
          }
          console.warn(`[resolveReferences] Failed to resolve ref in string property: "${refKey}"`);
          return match;
        });
      } else {
        newObj[key] = resolveReferences(value, exportedIds);
      }
    }
  }
  return newObj;
}

/**
 * Initializes the testing environment for a single test case or a group of related test cases.
 * This is the primary function test suites should call before their test logic.
 *
 * It performs the following actions:
 * 1. Resets the internal undo actions stack.
 * 2. Ensures the Supabase admin client is available.
 * 3. Processes resource requirements from `config.resources` (if provided):
 *    - For each resource, it checks if it exists using `resource.identifier`.
 *    - If it exists: captures its original state, updates it to `resource.desiredState`,
 *      and registers an undo action to restore its original state.
 *    - If it does not exist: creates it using `resource.identifier` and `resource.desiredState`,
 *      and registers an undo action to delete it.
 * 4. Creates a primary test user using `config.userProfile` (or defaults).
 * 5. Ensures a token wallet exists for this user with `config.initialWalletBalance` (or default).
 * 6. Generates a JWT for this test user (`testUserAuthToken`).
 * 7. Resets the mock AI adapter.
 *
 * @param config - A `TestSetupConfig` object detailing the desired database state and test user properties.
 *                 Defaults to an empty object if not provided, resulting in a default test user and wallet.
 * @param executionScope - The scope of the test execution. This determines whether the undo actions stack is cleared.
 * @returns A Promise resolving to the `userId` of the created primary test user.
 * @throws If the Supabase admin client is not initialized or if any resource setup fails.
 *
 * @example
 * ```typescript
 * // In your test file:
 * import { coreInitializeTestStep, TestSetupConfig, getTestUserAuthToken, coreCleanupTestResources } from './_integration.test.utils.ts';
 *
 * Deno.test("My feature test", async (t) => {
 *   const config: TestSetupConfig = {
 *     resources: [
 *       {
 *         tableName: 'ai_providers',
 *         identifier: { api_identifier: 'test-provider' },
 *         desiredState: { provider_name: 'Test Provider', is_active: true, api_key_env_var_name: 'TEST_PROVIDER_KEY' }
 *       }
 *     ],
 *     userProfile: { role: 'editor' }
 *   };
 *   let userId: string;
 *
 *   await t.step("Setup test environment", async () => {
 *     userId = await coreInitializeTestStep(config);
 *     // Supabase admin client should be initialized globally or per suite before this point.
 *   });
 *
 *   // ... your test logic using userId and getTestUserAuthToken() ...
 *
 *   await t.step("Teardown test environment", async () => {
 *     await coreCleanupTestResources(); 
 *     // Consider calling coreTeardown() if you also need to clean up Supabase real-time channels.
 *   });
 * });
 * ```
 */
export async function coreInitializeTestStep(
  config: TestSetupConfig = {},
  executionScope: 'global' | 'local' = 'local'
): Promise<{
  primaryUserId: string;
  primaryUserClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
  processedResources: ProcessedResourceInfo[];
  primaryUserJwt: string;
}> {
  console.log(`[coreInitializeTestStep] Called with executionScope: ${executionScope}`);
  const {
    resources: configResources = [],
    userProfile: configUserProfile,
    initialWalletBalance: configInitialWalletBalance,
  } = config;

  if (!supabaseAdminClient) {
    console.warn("[coreInitializeTestStep] supabaseAdminClient not initialized. Initializing now...");
    initializeSupabaseAdminClient();
  }
  const anonClient = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  // Always create a primary user for the test context.
  const { userId: primaryUserId, userClient: primaryUserClient, jwt: primaryUserJwt } = await coreCreateAndSetupTestUser(configUserProfile, executionScope);
  
  // Set the JWT for the current test scope so getTestUserAuthToken can retrieve it.
  currentTestJwt = primaryUserJwt;

  // Now ensure the wallet exists for this user.
  await coreEnsureTestUserAndWallet(primaryUserId, configInitialWalletBalance, executionScope);

  const processedResources: ProcessedResourceInfo[] = [];
  const exportedIds = new Map<string, string>();

  if (configResources && configResources.length > 0) {
    console.log("[coreInitializeTestStep] Starting to process config.resources...");
    for (const req of configResources) {
      console.log(`[coreInitializeTestStep] Processing requirement: { tableName: '${req.tableName}', identifier: ${JSON.stringify(req.identifier)}, exportId: ${req.exportId} }`);
      
      const resolvedIdentifier = resolveReferences(JSON.parse(JSON.stringify(req.identifier)), exportedIds);
      const resolvedDesiredState = resolveReferences(JSON.parse(JSON.stringify(req.desiredState)), exportedIds);
      
      const { data: existingResource, error: selectError } = await supabaseAdminClient
        .from(req.tableName)
        .select('*')
        .match(resolvedIdentifier)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error(`[coreInitializeTestStep] Error checking for existing resource in ${req.tableName}:`, selectError);
        processedResources.push({ tableName: req.tableName, identifier: resolvedIdentifier, status: 'failed', error: selectError.message, exportId: req.exportId });
        continue;
      }

      if (isDbRow(existingResource)) {
        // Exists: register for restoration and update
        const originalRowForUndo = Object.assign({}, existingResource);
        registerUndoAction({ type: 'RESTORE_UPDATED_ROW', tableName: req.tableName, identifier: resolvedIdentifier, originalRow: originalRowForUndo, scope: executionScope });
        
        const { data: updatedRecord, error: updateError } = await supabaseAdminClient
          .from(req.tableName)
          .update(resolvedDesiredState)
          .match(resolvedIdentifier)
          .select()
          .single();
        
        if (updateError) {
          console.error(`[coreInitializeTestStep] Error updating resource in ${req.tableName}:`, updateError);
          processedResources.push({ tableName: req.tableName, identifier: resolvedIdentifier, resource: existingResource, status: 'failed', error: updateError.message, exportId: req.exportId });
        } else {
          if (isDbRow(updatedRecord)) {
            console.log(`[TestUtil] Updated existing resource in ${req.tableName} (ID: ${updatedRecord.id}, Resolved Identifier: ${JSON.stringify(resolvedIdentifier)}) with data: ${JSON.stringify(resolvedDesiredState)}`);
            processedResources.push({ tableName: req.tableName, identifier: resolvedIdentifier, resource: updatedRecord, status: 'updated', exportId: req.exportId });
            if (req.exportId) {
              exportedIds.set(req.exportId, updatedRecord.id);
            }
          }
        }
      } else {
        // Does not exist: create it
        const createPayload = req.linkUserId 
          ? { ...resolvedIdentifier, ...resolvedDesiredState, user_id: primaryUserId }
          : { ...resolvedIdentifier, ...resolvedDesiredState };

        const { data: newResource, error: createError } = await supabaseAdminClient
          .from(req.tableName)
          .insert(createPayload)
          .select()
          .single();

        if (createError) {
          console.error(`[coreInitializeTestStep] Error creating resource in ${req.tableName}:`, createError);
          processedResources.push({ tableName: req.tableName, identifier: resolvedIdentifier, status: 'failed', error: createError.message, exportId: req.exportId });
        } else {
          if (isDbRow(newResource)) {
            console.log(`[TestUtil] Created new resource in ${req.tableName} with ID: ${newResource.id}`);
            const deleteCriteria = { id: newResource.id };
            registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: req.tableName, criteria: deleteCriteria, scope: executionScope });
            processedResources.push({ tableName: req.tableName, identifier: resolvedIdentifier, resource: newResource, status: 'created', exportId: req.exportId });
            if (req.exportId) {
              exportedIds.set(req.exportId, newResource.id);
            }
          }
        }
      }
    }
  }
  
  console.log(`[coreInitializeTestStep] Finished processing resources. Final processedResources array (before return): ${JSON.stringify(processedResources.map(p => ({ tableName: p.tableName, exportId: p.exportId, status: p.status, id: isDbRow(p.resource) ? p.resource.id : null, error: p.error  })), null, 2)}`);

  return {
    primaryUserId,
    primaryUserClient,
    adminClient: supabaseAdminClient,
    anonClient,
    processedResources,
    primaryUserJwt,
  };
}

// The getAuthedSupabaseClient and getAnonSupabaseClient helper functions are now effectively superseded
// by the return values of coreInitializeTestStep and coreCreateAndSetupTestUser.
// They can be removed if no other part of the utility uses them directly.
// For now, I will leave them, but comment them out to indicate they are deprecated for external test use.

/**
 * DEPRECATED for direct test use. Clients are now returned by coreInitializeTestStep and coreCreateAndSetupTestUser.
 * Creates and returns a Supabase client authenticated as the specified user.
 */
// export async function getAuthedSupabaseClient(userId: string): Promise<SupabaseClient<Database>> { ... }

/**
 * DEPRECATED for direct test use. Clients are now returned by coreInitializeTestStep.
 * Creates and returns an anonymous Supabase client.
 */
// export function getAnonSupabaseClient(): SupabaseClient<Database> { ... }

// Helper to set the admin client and deps from the router
// export function setSharedAdminClient(client: SupabaseClient<Database>) { // This is the one to remove
//     supabaseAdminClient = client;
// } 