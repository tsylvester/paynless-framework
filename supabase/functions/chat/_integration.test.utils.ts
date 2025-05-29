import { createClient, SupabaseClient, SupabaseClientOptions, AuthError } from "npm:@supabase/supabase-js@2";
import * as djwt from "https://deno.land/x/djwt@v3.0.2/mod.ts";
// Import types for use within this file
import type {
  ChatApiRequest, // Not directly used in this file, but kept if other utils fns might need it. Consider removing if truly unused.
  ChatHandlerSuccessResponse, // Same as above
  AdapterResponsePayload, // Same as above
  AiModelExtendedConfig, // Used in AiProviderSeedRecord
  TokenUsage, // Not directly used
  ChatMessageRow, // Not directly used
  ChatHandlerDeps, // Used in initializeTestDeps, currentTestDeps, setSharedTestDeps
  ILogger, // Used in testLogger
  LogMetadata, // Used in testLogger
} from "../_shared/types.ts";
import type { Json, Database } from "../types_db.ts";
import { MockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
import { handler as chatHandler, defaultDeps } from "../chat/index.ts"; // Renamed to avoid conflict
import { TokenWalletService } from "../_shared/services/tokenWalletService.ts";

// --- Exported Constants ---
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
export const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY"); 
export const SUPABASE_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET");
export const CHAT_FUNCTION_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/chat` : 'http://localhost:54321/functions/v1/chat';


// --- Exported Shared Instances and Mutable State ---
export let supabaseAdminClient: SupabaseClient<Database>;
export let testUserAuthToken: string | null = null;
export const mockAiAdapter = new MockAiProviderAdapter();
export let currentTestDeps: ChatHandlerDeps;

export const testLogger: ILogger = {
  debug: (message: string, metadata?: LogMetadata) => console.debug('[TestLogger DEBUG]', message, metadata || ""),
  info: (message: string, metadata?: LogMetadata) => console.log('[TestLogger INFO]', message, metadata || ""),
  warn: (message: string, metadata?: LogMetadata) => console.warn('[TestLogger WARN]', message, metadata || ""),
  error: (message: string | Error, metadata?: LogMetadata) => console.error('[TestLogger ERROR]', message, metadata || ""),
};

// Re-export the handler for convenience in test files
export { chatHandler };

// --- Core Logic for Test Setup and Helpers (to be called by router) ---

export function initializeSupabaseAdminClient(): SupabaseClient<Database> {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL environment variable is not set.");
  }
  if (!SERVICE_ROLE_KEY) { 
    throw new Error("SB_SERVICE_ROLE_KEY environment variable is not set.");
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

export function initializeTestDeps(adminClient: SupabaseClient<Database>): ChatHandlerDeps {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not set for creating test user clients.");
  }
  return {
    ...defaultDeps,
    createSupabaseClient: <
      ArgDB = any, 
      ArgSchemaName extends string & keyof ArgDB = "public" extends keyof ArgDB 
        ? "public" 
        : string & keyof ArgDB,
      ArgSchema extends { 
        Tables: Record<string, any>; 
        Views: Record<string, any>; 
        Functions: Record<string, any>;
        Enums?: Record<string, any>;
      } = ArgDB[ArgSchemaName] extends { 
            Tables: Record<string, any>; 
            Views: Record<string, any>; 
            Functions: Record<string, any>;
            Enums?: Record<string, any>;
          } 
        ? ArgDB[ArgSchemaName] 
        : { Tables: Record<string, never>, Views: Record<string, never>, Functions: Record<string, never>, Enums: Record<string, never> }
    >(
      _supabaseUrl: string, 
      _supabaseKey: string, 
      options?: SupabaseClientOptions<ArgSchemaName>
    ): SupabaseClient<ArgDB, ArgSchemaName, ArgSchema> => {
      const clientOptions: SupabaseClientOptions<"public"> = {
        ...(options as SupabaseClientOptions<"public"> | undefined),
        auth: {
          ...(options?.auth || {}),
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        db: {
          ...(options?.db || {}),
          schema: 'public', 
        }
      };
      const specificClient = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, clientOptions);
      return specificClient as unknown as SupabaseClient<ArgDB, ArgSchemaName, ArgSchema>;
    },
    getAiProviderAdapterOverride: () => mockAiAdapter,
    logger: testLogger, 
    tokenWalletService: new TokenWalletService(adminClient),
    supabaseClient: adminClient,
  };
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

export async function coreResetDatabaseState() {
  if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized for DB reset.");
  
  const nilUuid = '00000000-0000-0000-0000-000000000000';
  const { error: deleteMessagesError } = await supabaseAdminClient.from('chat_messages').delete().neq('id', nilUuid);
  if (deleteMessagesError) console.error("Error deleting chat_messages:", deleteMessagesError);

  const { error: deleteChatsError } = await supabaseAdminClient.from('chats').delete().neq('id', nilUuid);
  if (deleteChatsError) console.error("Error deleting chats:", deleteChatsError);

  const { error: deleteWalletsError } = await supabaseAdminClient.from('token_wallets').delete().neq('wallet_id', nilUuid);
  if (deleteWalletsError) console.error("Error deleting token_wallets:", deleteWalletsError);
  
  const { error: deleteProvidersError } = await supabaseAdminClient.from('ai_providers').delete().neq('id', nilUuid);
  if (deleteProvidersError) console.error("Error deleting ai_providers:", deleteProvidersError);

  const { data: users, error: listUsersError } = await supabaseAdminClient.auth.admin.listUsers();
  if (listUsersError) {
    // Log specific AuthApiError details if available
    if (listUsersError instanceof AuthError) {
        console.error(`Error listing users for cleanup: ${listUsersError.name} (${listUsersError.status}) - ${listUsersError.message}`);
    } else {
        console.error("Error listing users for cleanup (non-AuthError):", listUsersError);
    }
  } else {
    const testUserPattern = /^test-user-\d+@example\.com$/;
    for (const user of users.users) {
      if (user.email && testUserPattern.test(user.email)) {
        const { error: deleteUserError } = await supabaseAdminClient.auth.admin.deleteUser(user.id);
        if (deleteUserError) console.error(`Error deleting user ${user.id} (${user.email}):`, deleteUserError);
      }
    }
  }
}

// Define AiProviderSeedRecord if it's not already globally available from other type files
// Assuming it's specific enough to be here or re-exported from a central types location.
export interface AiProviderSeedRecord {
  id: string;
  provider: string;
  name: string;
  api_identifier: string;
  is_active: boolean;
  config: AiModelExtendedConfig;
}

export async function coreSeedAiProviders() {
  if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized for seeding.");
  const providersToSeed: AiProviderSeedRecord[] = [
    {
      id: crypto.randomUUID(), provider: "openai", name: "GPT-3.5 Turbo (Test)", api_identifier: "gpt-3.5-turbo-test", is_active: true,
      config: { input_token_cost_rate: 1, output_token_cost_rate: 1, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" }, hard_cap_output_tokens: 1000, api_identifier: "gpt-3.5-turbo-test" } 
    },
    {
      id: crypto.randomUUID(), provider: "openai", name: "GPT-4 Costly (Test)", api_identifier: "gpt-4-costly-test", is_active: true,
      config: { input_token_cost_rate: 10, output_token_cost_rate: 30, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" }, hard_cap_output_tokens: 500, api_identifier: "gpt-4-costly-test" }
    },
    {
      id: crypto.randomUUID(), provider: "dummy", name: "Dummy Echo (Test)", api_identifier: "dummy-echo-test", is_active: true,
      config: { input_token_cost_rate: 0, output_token_cost_rate: 0, tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 4 }, api_identifier: "dummy-echo-test" }
    },
  ];
  const providersForUpsert = providersToSeed.map(p => ({ ...p, config: p.config as unknown as Json }));
  const { error } = await supabaseAdminClient.from('ai_providers').upsert(providersForUpsert);
  if (error) throw error;
}

export async function coreCreateAndSetupTestUser(
  profileProps?: Partial<{ role: string; first_name: string }>
): Promise<string> {
  if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized for user creation.");
  const testUserEmail = `test-user-${Date.now()}@example.com`;
  const testUserPassword = "password123";
  const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
    email: testUserEmail, password: testUserPassword, email_confirm: true,
  });
  if (authError || !authData?.user) throw authError || new Error("Test user creation failed.");
  const userId = authData.user.id;
  const profileDataToUpsert = {
    id: userId, role: (profileProps?.role as 'user' | 'admin') || 'user', first_name: profileProps?.first_name || `TestUser${userId.substring(0, 4)}`,
  };
  const { error: userProfileUpsertError } = await supabaseAdminClient.from('user_profiles').upsert(profileDataToUpsert, { onConflict: 'id' });
  if (userProfileUpsertError) throw userProfileUpsertError;
  return userId;
}

export async function coreGenerateTestUserJwt(userId: string, role: string = 'authenticated', app_metadata?: Record<string, unknown>): Promise<string> {
  if (!SUPABASE_JWT_SECRET) throw new Error("SUPABASE_JWT_SECRET is not available.");
  const payload: djwt.Payload = {
    iss: SUPABASE_URL ?? 'http://localhost:54321', sub: userId, role: role, aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + (60 * 60), iat: Math.floor(Date.now() / 1000),
    app_metadata: { provider: 'email', providers: ['email'], ...(app_metadata || {}) },
  };
  const header: djwt.Header = { alg: "HS256", typ: "JWT" };
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(SUPABASE_JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return await djwt.create(header, payload, cryptoKey);
}

export async function coreEnsureTestUserAndWallet(userId: string, initialBalance: number = 10000) {
  if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized.");
  const { data: existingWallet, error: selectError } = await supabaseAdminClient.from('token_wallets').select('wallet_id, balance').eq('user_id', userId).is('organization_id', null).single();
  if (selectError && selectError.code !== 'PGRST116') throw selectError;
  if (existingWallet) {
    if (existingWallet.balance !== initialBalance) {
      const { error: updateError } = await supabaseAdminClient.from('token_wallets').update({ balance: initialBalance, updated_at: new Date().toISOString() }).eq('wallet_id', existingWallet.wallet_id).select().single();
      if (updateError) throw updateError;
    }
  } else {
    const { error: insertError } = await supabaseAdminClient.from('token_wallets').insert({ user_id: userId, balance: initialBalance, currency: 'AI_TOKEN', organization_id: null }).select().single();
    if (insertError) throw insertError;
  }
}

export async function coreInitializeTestStep(
  options: { 
    userProfile?: Partial<{ role: string; first_name: string }>; 
    initialWalletBalance?: number;
    aiProviderApiIdentifier?: string; 
    aiProviderConfigOverride?: Partial<AiModelExtendedConfig>;
  } = {}
): Promise<string> {
  await coreResetDatabaseState();
  await coreSeedAiProviders(); 

  if (options.aiProviderApiIdentifier && options.aiProviderConfigOverride) {
    if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized for custom provider seeding.");
    
    // The config override is merged with a base AiModelExtendedConfig structure.
    // The key is that input_token_cost_rate and output_token_cost_rate can be null/undefined from the override.
    const mergedConfig: AiModelExtendedConfig = {
      // Base default structure for AiModelExtendedConfig
      api_identifier: options.aiProviderApiIdentifier, // This is crucial
      input_token_cost_rate: null, // Default to null, override will apply if present
      output_token_cost_rate: null, // Default to null, override will apply if present
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" }, // Default strategy
      hard_cap_output_tokens: 1000, // Default cap
      // Now, spread the override. This allows override to set rates to null or specific values.
      ...options.aiProviderConfigOverride,
    };

    const customProviderToSeed = {
      provider: "dummy", // Use "dummy" to bypass API key check for these mocked providers
      name: `Custom Test Provider (${options.aiProviderApiIdentifier})`, 
      api_identifier: options.aiProviderApiIdentifier, 
      is_active: true, // Default to active for testing
      config: mergedConfig as unknown as Json, 
    };

    console.log(`[Test Setup] Seeding/Upserting custom AI provider: ${customProviderToSeed.api_identifier} with config: ${JSON.stringify(customProviderToSeed.config)}`);
    const { error: customSeedError } = await supabaseAdminClient
      .from('ai_providers')
      .upsert(customProviderToSeed, { onConflict: 'api_identifier' }); 

    if (customSeedError) {
      console.error(`Error upserting custom provider ${options.aiProviderApiIdentifier}:`, customSeedError);
      throw customSeedError;
    }
  }

  const userId = await coreCreateAndSetupTestUser(options.userProfile);
  await coreEnsureTestUserAndWallet(userId, options.initialWalletBalance || 10000);
  testUserAuthToken = await coreGenerateTestUserJwt(userId); // Sets the exported let
  mockAiAdapter.reset();
  return userId;
}

// Helper to set the admin client and deps from the router
export function setSharedAdminClient(client: SupabaseClient<Database>) {
    supabaseAdminClient = client;
}
export function setSharedTestDeps(deps: ChatHandlerDeps) {
    currentTestDeps = deps;
}
export function getTestUserAuthToken(): string | null {
    return testUserAuthToken;
}

// New utility function to get provider ID by API identifier
export async function getProviderIdByApiIdentifier(apiIdentifier: string): Promise<string | null> {
  if (!supabaseAdminClient) throw new Error("Supabase admin client not initialized.");
  const { data, error } = await supabaseAdminClient
    .from('ai_providers')
    .select('id')
    .eq('api_identifier', apiIdentifier)
    .single();
  if (error) {
    testLogger.error(`Error fetching provider ID for ${apiIdentifier}: ${error.message}`);
    return null;
  }
  return data?.id || null;
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
  const { data, error } = await client.rpc('execute_sql' as any, { query: query });
  if (error) {
    console.error("Error fetching table columns:", error);
    throw error;
  }
  return data as TableColumnInfo[];
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
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
    LEFT JOIN
        information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.constraint_schema = rc.constraint_schema
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
  const { data: rawConstraints, error } = await client.rpc('execute_sql' as any, { query: query });

  if (error) {
    console.error("Error fetching table constraints:", error);
    throw error;
  }

  const processedConstraints: { [key: string]: TableConstraintInfo } = {};
  (rawConstraints as any[]).forEach(rc_row => { // Renamed loop variable to avoid conflict with outer 'rc' alias
    if (!processedConstraints[rc_row.constraint_name]) {
      processedConstraints[rc_row.constraint_name] = {
        constraint_name: rc_row.constraint_name,
        constraint_type: rc_row.constraint_type,
        constrained_columns: [],
        foreign_table_schema: rc_row.foreign_table_schema,
        foreign_table_name: rc_row.foreign_table_name,
        foreign_columns: rc_row.constraint_type === 'FOREIGN KEY' ? [] : undefined,
        check_clause: rc_row.check_clause,
        delete_rule: rc_row.delete_rule,
        update_rule: rc_row.update_rule,
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
  const { data, error } = await client.rpc('execute_sql' as any, { query: query });
  if (error) {
    console.error("Error fetching table indexes:", error);
    throw error;
  }

  // Basic parsing of column names from indexdef (can be improved)
  return (data as any[]).map(idx => {
    const colMatch = idx.indexdef.match(/\(([^)]+)\)/);
    const column_names = colMatch ? colMatch[1].split(',').map((s: string) => s.trim().replace(/"/g, '')) : [];
    return {
      indexname: idx.indexname,
      indexdef: idx.indexdef,
      column_names: column_names
    };
  });
}

// Function to set the shared admin client instance
export function setSupabaseAdminClientForTests(client: SupabaseClient<Database>) {
  supabaseAdminClient = client;
} 