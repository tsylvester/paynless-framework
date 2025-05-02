// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";
import { spy, stub, type Spy } from "jsr:@std/testing/mock"; // Add Deno mock imports
// Remove unstable directive, no longer needed after removing KV mocks
// /// <reference lib="deno.unstable" />
// Import ChatMessage type
import type { ChatMessage } from "../../../packages/types/src/ai.types.ts";
// --- Import RealtimeChannel type --- 
import type { RealtimeChannel } from "npm:@supabase/supabase-js@^2.43.4";

// Check for essential Supabase variables, but don't throw if missing during import
// These checks will now rely on the environment being correctly set by `deno test --env`
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.warn("WARN: Essential Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY) were not found during initial load. Tests relying on these variables might fail if they are not set globally or mocked.");
} else {
     console.log("Essential Supabase variables confirmed loaded.");
}

// Function to execute Supabase CLI commands
async function runSupabaseCommand(command: string): Promise<void> {
    console.log(`Executing: supabase ${command}...`);
    const cmd = new Deno.Command("supabase", {
        args: [command],
        stdout: "piped",
        stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();

    if (code !== 0) {
        console.error(`Supabase CLI Error (supabase ${command}):`);
        console.error(new TextDecoder().decode(stderr));
        console.error(new TextDecoder().decode(stdout)); // Also log stdout in case of error
        throw new Error(`Failed to execute supabase ${command}. Exit code: ${code}`);
    }
    console.log(`Supabase ${command} finished successfully.`);
    // Optional: Add a small delay to allow services to stabilize, especially after start
    if (command === "start") {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
    }
}

// Start local Supabase instance
export async function startSupabase(): Promise<void> {
    await runSupabaseCommand("start");
}

// Stop local Supabase instance
export async function stopSupabase(): Promise<void> {
    await runSupabaseCommand("stop");
}

// Get Supabase environment variables or throw error if missing
function getSupabaseEnvVars(): { url: string; serviceRoleKey: string, anonKey: string } {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!url) throw new Error("SUPABASE_URL environment variable is not set.");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
    if (!anonKey) throw new Error("SUPABASE_ANON_KEY environment variable is not set.");

    return { url, serviceRoleKey, anonKey };
}

// Create a Supabase client with Service Role privileges
export function createAdminClient(): SupabaseClient {
    const { url, serviceRoleKey } = getSupabaseEnvVars();
    return createClient(url, serviceRoleKey, {
        auth: {
            // Prevent client from persisting session/user locally
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}

// Create a test user
export async function createUser(email: string, password: string): Promise<{ user: any; error: any }> {
    const supabaseAdmin = createAdminClient();
    console.log(`Creating user: ${email}`);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Automatically confirm email for testing
    });
    if (error) {
        console.error(`Error creating user ${email}:`, error);
    } else {
        console.log(`User ${email} created successfully.`);
    }
    return { user: data?.user, error };
}

// Clean up (delete) a test user
export async function cleanupUser(email: string, adminClient?: SupabaseClient): Promise<void> {
    const supabaseAdmin = adminClient || createAdminClient();
    console.log(`Attempting to clean up user: ${email}`);

    // Find user by email first - necessary because deleteUser needs the ID
    // Fetch the first page of users (default is 50, should be enough for tests)
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
        console.error(`Error listing users to find ${email} for cleanup:`, listError);
        return; // Exit cleanup if we can't list users
    }

    const users = listData?.users || [];
    const userToDelete = users.find(user => user.email === email);

    if (!userToDelete) {
        console.warn(`User ${email} not found for cleanup.`);
        return;
    }

    // Found the user, proceed with deletion using their ID
    const userId = userToDelete.id;
    console.log(`Found user ID ${userId} for ${email}. Proceeding with deletion.`);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error(`Error deleting user ${email} (ID: ${userId}):`, deleteError);
    } else {
        console.log(`User ${email} (ID: ${userId}) deleted successfully.`);
    }
}

// Define type for the internal state of the mock query builder
// Export this type so it can be used in test mock functions
export interface MockQueryBuilderState {
    tableName: string;
    operation: 'select' | 'insert' | 'update' | 'delete';
    filters: { column?: string; value?: any; type: 'eq' | 'in' | 'match' | 'is'; criteria?: object }[]; // Added 'is' type
    selectColumns: string | null;
    insertData: any[] | object | null;
    updateData: object | null;
    // Add pagination state
    rangeFrom?: number;
    rangeTo?: number;
    // Add order state etc. if needed
    orClause?: string; // Add optional property for OR clause string
}

/** Configurable data/handlers for the mock Supabase client (Revised & Extended) */
export interface MockSupabaseDataConfig {
    // Existing specific results (retain for compatibility)
    getUserResult?: { data: { user: { id: string } | null }; error: any };
    selectPromptResult?: { data: { id: string; prompt_text: string } | null; error: any };
    selectProviderResult?: { data: { id: string; api_identifier: string } | null; error: any };
    selectChatHistoryResult?: { data: Array<{ role: string; content: string }> | null; error: any };
    insertChatResult?: { data: { id: string } | null; error: any };
    insertUserMessageResult?: { data: ChatMessage | null; error: any }; 
    insertAssistantMessageResult?: { data: ChatMessage | null; error: any };
    // User for auth mock
    mockUser?: { id: string };
    // Error simulation
    simulateDbError?: Error | null; 
    simulateAuthError?: Error | null;

    // --- Generic Mocking (Passes full state to function) --- 
    genericMockResults?: {
        [tableName: string]: {
            select?: { data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string }>);
            insert?: { data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string }>);
            update?: { data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string }>);
            upsert?: { data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string }>);
            delete?: { data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string }>);
        };
    };
    
    // --- NEW: Generic Mocking for RPC --- 
    rpcResults?: {
        [functionName: string]: { data?: any; error?: any } | (() => Promise<{ data?: any; error?: any }>);
    };
    adminAuthConfig?: { // <-- Add this optional property
        getUserById?: (userId: string) => Promise<any>; // Adjust return type if needed
        // Add other admin auth methods if needed for testing
    };
}

// --- Define a type for the minimal mock channel ---
type MockChannel = {
    on: Spy<MockChannel, [any, any]>; // Returns self
    subscribe: Spy<MockChannel, [any?]>; // Returns self
    unsubscribe: Spy<Promise<'ok' | 'error' | 'timed out'>, []>; // Returns promise
    topic: string;
};

/** Creates a mocked Supabase client instance for unit testing (Revised & Extended) */
export function createMockSupabaseClient(
    config: MockSupabaseDataConfig = {}
): {
    client: SupabaseClient;
    spies: { getUserSpy: Spy<any>; fromSpy: Spy<any>; rpcSpy: Spy<any>; removeChannelSpy: Spy<any> };
} {
    // --- Mock Auth ---
    const mockAuth = {
        getUser: spy(async () => {
            if (config.simulateAuthError) return { data: { user: null }, error: config.simulateAuthError };
            if (config.getUserResult) return config.getUserResult;
            return { data: { user: config.mockUser ?? null }, error: null };
        }),
    };

    // --- Mock Query Builder Chain ---
    interface MockQueryBuilder {
        select: Spy<any>;
        insert: Spy<any>;
        update: Spy<any>;
        delete: Spy<any>;
        eq: Spy<any>;
        in: Spy<any>;
        is: Spy<any>; // <-- Add 'is' filter
        match: Spy<any>;
        order: Spy<any>;
        returns: Spy<any>;
        upsert: Spy<any>;
        single: Spy<any>;
        maybeSingle: Spy<any>;
        then: Spy<any>;
        range: Spy<any>; // <-- Add range method
        or: Spy<any>; // <-- Add OR method
    }

    const fromSpy = spy((tableName: string) => {
        const _queryBuilderState = {
            tableName: tableName,
            operation: 'select' as 'select' | 'insert' | 'update' | 'delete',
            filters: [] as { column?: string; value?: any; type: 'eq' | 'in' | 'match' | 'is'; criteria?: object }[], // Added 'is' type
            selectColumns: '*' as string | null,
            insertData: null as any[] | object | null,
            updateData: null as object | null,
            rangeFrom: 0 as number,
            rangeTo: 0 as number,
            orClause: undefined as string | undefined,
        };

        const mockQueryBuilder: MockQueryBuilder = {} as MockQueryBuilder;
        
        // --- Modifier Methods (Return `this` for chaining) ---

        mockQueryBuilder.select = spy((columns = '*') => {
            console.log(`[Mock QB ${tableName}] .select(${columns}) called`);
            // Only relevant if starting op or after insert/update
            if (_queryBuilderState.operation === 'insert' || _queryBuilderState.operation === 'update') {
                 console.log(`[Mock QB ${tableName}] Chaining .select() after ${_queryBuilderState.operation}`);
            } else {
                 _queryBuilderState.operation = 'select'; // Set op if starting chain
            }
            _queryBuilderState.selectColumns = columns;
            return mockQueryBuilder; // Return self for chaining
        });

         mockQueryBuilder.insert = spy((rows: any[] | object) => {
            console.log(`[Mock QB ${tableName}] .insert() called with:`, rows);
            _queryBuilderState.operation = 'insert';
            _queryBuilderState.insertData = rows;
            _queryBuilderState.selectColumns = null; // Not a select op initially
            return mockQueryBuilder; // Return self for chaining .select() after insert
        });
        
        mockQueryBuilder.update = spy((data: object) => {
            console.log(`[Mock QB ${tableName}] .update() called with:`, data);
             _queryBuilderState.operation = 'update';
            _queryBuilderState.updateData = data;
            _queryBuilderState.selectColumns = null;
            return mockQueryBuilder;
        });
        
        mockQueryBuilder.delete = spy(() => {
            console.log(`[Mock QB ${tableName}] .delete() called`);
            _queryBuilderState.operation = 'delete';
            return mockQueryBuilder;
        });

        mockQueryBuilder.eq = spy((column: string, value: any) => {
            console.log(`[Mock QB ${tableName}] .eq(${column}, ${value}) called`);
            _queryBuilderState.filters.push({ column, value, type: 'eq' });
            return mockQueryBuilder;
        });
        
        mockQueryBuilder.in = spy((column: string, values: any[]) => {
            console.log(`[Mock QB ${tableName}] .in(${column}, [${values.length} items]) called`);
             _queryBuilderState.filters.push({ column, value: values, type: 'in' });
             return mockQueryBuilder;
        });

        mockQueryBuilder.match = spy((criteria: object) => {
            console.log(`[Mock QB ${tableName}] .match() called with criteria:`, criteria);
            _queryBuilderState.filters.push({ criteria, type: 'match' }); // Store criteria directly
            return mockQueryBuilder;
        });

        // NEW: Implement the 'is' filter
        mockQueryBuilder.is = spy((column: string, value: any) => {
            // Value is typically null, true, or false
            console.log(`[Mock QB ${tableName}] .is(${column}, ${value}) called`); 
            _queryBuilderState.filters.push({ column, value, type: 'is' });
            return mockQueryBuilder;
        });

        // --- Other Modifiers (Return `this`) ---
        mockQueryBuilder.order = spy((_column: string, _options?: any) => {
            console.log(`[Mock QB ${tableName}] .order() called`);
            // Logic to store order state could be added if needed
            return mockQueryBuilder; 
        });

        mockQueryBuilder.returns = spy(() => {
            // Track returns modifier if needed for specific tests (e.g., upsert with ignoreDuplicates)
            return mockQueryBuilder;
        });

        mockQueryBuilder.range = spy((from: number, to: number) => {
            console.log(`[Mock QB ${tableName}] .range(${from}, ${to}) called`);
            _queryBuilderState.rangeFrom = from;
            _queryBuilderState.rangeTo = to;
            return mockQueryBuilder; 
        });

        mockQueryBuilder.or = spy((filterString: string) => {
            // Basic mock: just log and record the filter string
            console.log(`[Mock QB ${tableName}] .or(${filterString}) called`);
            _queryBuilderState.orClause = filterString; // Store it separately
            return mockQueryBuilder;
        });

        // --- Terminal Methods / Resolution Logic ---
        
        // Helper to resolve the query based on current state and config
        const resolveQuery = async () => {
            console.log(`[Mock QB ${tableName}] Resolving query. State:`, _queryBuilderState);
            const operation = _queryBuilderState.operation;
            const genericConfig = config.genericMockResults?.[tableName]?.[operation];
            
            // Function Config
            if (typeof genericConfig === 'function') {
                console.log(`[Mock QB ${tableName}] Using function config for ${operation}`);
                // Pass the whole state object
                 try {
                    // The function defined in the config is responsible 
                    // for interpreting the state based on the operation.
                    return await genericConfig(_queryBuilderState);
                } catch (e) {
                    console.error(`[Mock QB ${tableName}] Error executing generic mock function for ${operation}:`, e);
                    return { data: null, error: e, status: 500, statusText: 'Internal Server Error', count: null };
                }
            } 
            // Object Config
            else if (genericConfig) {
                 console.log(`[Mock QB ${tableName}] Using object config for ${operation}`);
                 return { 
                    data: genericConfig.data ?? null,
                    error: genericConfig.error ?? null,
                    count: genericConfig.count ?? (genericConfig.data ? genericConfig.data.length : null),
                    status: genericConfig.status ?? (genericConfig.error ? 500 : (operation === 'insert' ? 201 : (operation === 'delete' ? 204 : 200))),
                    statusText: genericConfig.statusText ?? (genericConfig.error ? 'Internal Server Error' : (operation === 'insert' ? 'Created' : (operation === 'delete' ? 'No Content' : 'OK')))
                };
            }
            
            // Fallback to specific configs (for backward compatibility)
            console.log(`[Mock QB ${tableName}] No generic config found for ${operation}. Checking specific fallbacks.`);
            if (operation === 'select') {
                if (tableName === 'chat_messages') {
                     console.log("[Mock QB chat_messages] Resolving .select() with specific history config");
                     const fallbackResult = config.selectChatHistoryResult ?? { data: [], error: null };
                     return { 
                        data: fallbackResult.data,
                        error: fallbackResult.error,
                        count: fallbackResult.data?.length ?? 0,
                        status: fallbackResult.error ? 500 : 200,
                        statusText: fallbackResult.error ? 'Internal Server Error' : 'OK'
                     };
                }
                // Add other specific table fallbacks for select if needed
            }
            // Add specific fallbacks for insert/update/delete if needed

            // Ultimate Fallback: Return default based on operation
            console.warn(`[Mock QB ${tableName}] No specific or generic mock found for ${operation}. Returning default.`);
             switch (operation) {
                case 'select': return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
                case 'insert': return { data: [{ id: 'mock-inserted-id' }], error: null, count: 1, status: 201, statusText: 'Created' };
                case 'update': return { data: [{ id: 'mock-updated-id' }], error: null, count: 1, status: 200, statusText: 'OK' };
                case 'delete': return { data: [], error: null, count: 0, status: 204, statusText: 'No Content' };
            }
        };

        // Mock .then() to make the builder awaitable
        mockQueryBuilder.then = spy(async (onfulfilled: (value: any) => any, onrejected?: (reason: any) => any) => {
            console.log(`[Mock QB ${tableName}] .then() called. Resolving query...`);
            try {
                const result = await resolveQuery();
                // The actual Supabase client resolves the promise even if there's a DB error,
                // putting the error object in the resolved value.
                // We mimic that behavior here.
                if (result.error) {
                    console.log(`[Mock QB ${tableName}] Query resolved with DB error. Fulfilling promise with error object.`);
                    // Resolve with the full result object containing the error
                    const errorResult = { data: result.data, error: result.error, count: result.count, status: result.status ?? 500, statusText: result.statusText ?? 'Internal Server Error' };
                    onfulfilled?.(errorResult);
                    return Promise.resolve(errorResult);
                } else {
                     console.log(`[Mock QB ${tableName}] Query resolved successfully, fulfilling promise.`);
                     const successResult = { data: result.data, error: null, count: result.count, status: result.status ?? 200, statusText: result.statusText ?? 'OK' };
                     onfulfilled?.(successResult);
                     return Promise.resolve(successResult);
                }
            } catch (e) {
                 // Catch errors during the resolveQuery itself (e.g., bad mock function)
                 console.error(`[Mock QB ${tableName}] Unexpected error during query resolution in .then():`, e);
                 const error = e instanceof Error ? e : new Error(String(e ?? 'Unknown error during query resolution'));
                 if (onrejected) {
                     onrejected(error);
                     // Even if onrejected exists, return a rejected promise for await
                     return Promise.reject(error); 
                 } else {
                     // If no reject handler, re-throw the error (wrapped as an Error)
                     return Promise.reject(error);
                 }
            }
        });

        // Modifier to get a single row
        mockQueryBuilder.single = spy(async () => {
            console.log(`[Mock QB ${tableName}] .single() called. Resolving query...`);
            // Define a minimal mock PostgrestError for simulation ONLY for row count issues
            class MockPostgrestErrorPGRST116 extends Error { // Rename for clarity
                details: string | null;
                hint: string | null;
                code: string;
                status: number;
                statusText: string;
                    constructor(message: string, hint: string) {
                    super(message);
                    this.name = 'MockPostgrestErrorPGRST116';
                    this.status = 406;
                    this.statusText = "Not Acceptable";
                    this.details = null;
                    this.hint = hint;
                    this.code = "PGRST116";
                }
            }
            
            try {
                // Step 1: Resolve the underlying query
                const { data, error, status, statusText, count } = await resolveQuery(); // Include count/status if needed
                
                // --- FIX: Return error object if underlying query failed --- 
                if (error) {
                    console.log(`[Mock QB ${tableName}] Query (for single) resolved with DB error. Returning error object.`);
                    // Mimic real client: return the error object, don't throw here
                    return { data: null, error: error, status: status ?? 500, statusText: statusText ?? "Internal Server Error", count: 0 }; 
                }
                
                // Step 2: If query succeeded, check row count for .single()
                
                // --- FIX: Throw specific error if no data found --- 
                if (!data || data.length === 0) {
                     console.warn(`[Mock QB ${tableName}] Query (for single) resolved with no data. Throwing MockPostgrestErrorPGRST116.`);
                     throw new MockPostgrestErrorPGRST116("JSON object requested, multiple (or no) rows returned", "Results contain 0 rows");
                }
                
                // --- FIX: Throw specific error if multiple rows found ---
                if (data.length > 1) {
                    console.warn(`[Mock QB ${tableName}] Query (for single) resolved with multiple rows (${data.length}). Throwing MockPostgrestErrorPGRST116.`);
                    throw new MockPostgrestErrorPGRST116("JSON object requested, multiple (or no) rows returned", `Results contain ${data.length} rows`);
                }
                
                // If query succeeded AND exactly one row was found, return it
                console.log(`[Mock QB ${tableName}] Query (for single) resolved successfully with one row.`);
                return { data: data[0], error: null, status: status ?? 200, statusText: statusText ?? "OK", count: 1 }; 
            } catch (err) {
                 // Catch errors thrown by the row count checks or resolveQuery itself
                console.error(`[Mock QB ${tableName}] Error originated or caught within .single() implementation:`, err);
                 // Re-throw the error 
                throw err; 
            }
        });

        // Mock .maybeSingle()
        // Resolves with { data: object | null, error: Error | null }
        mockQueryBuilder.maybeSingle = spy(async () => {
            console.log(`[Mock QB ${tableName}] .maybeSingle() called. Resolving query...`);
            try {
                const result = await resolveQuery();
                // maybeSingle resolves with error object if underlying query failed
                if (result.error) {
                    console.log(`[Mock QB ${tableName}] Query (for maybeSingle) resolved with DB error. Resolving promise with error object.`);
                    return { data: null, error: result.error };
                } else if (result.data && result.data.length > 1) {
                    // Simulate PostgREST error for multiple rows found
                    console.warn(`[Mock QB ${tableName}] .maybeSingle() found multiple rows. Simulating PostgREST error.`);
                    // Create a mock PostgREST error object
                    const error = new Error('Multiple rows returned for maybeSingle row query');
                    (error as any).code = 'PGRST116'; // Add code like real PostgREST error
                    return { data: null, error: error };
                } else {
                    console.log(`[Mock QB ${tableName}] Query (for maybeSingle) resolved successfully.`);
                    return { data: result.data?.[0] ?? null, error: null }; // Resolve successfully with first item or null
                }
            } catch (e) {
                 console.error(`[Mock QB ${tableName}] Error during query resolution or processing in .maybeSingle():`, e);
                 // Ensure we throw an actual Error instance if resolveQuery itself throws unexpectedly
                 const error = e instanceof Error ? e : new Error(String(e ?? 'Unknown error in .maybeSingle()'));
                 // Return error in the resolved object structure
                 return { data: null, error: error }; 
            }
        });

        return mockQueryBuilder;
    });

    // --- NEW: Mock RPC --- 
    const rpcSpy = spy(async (functionName: string, args?: any) => {
        console.log(`[Mock RPC] .rpc('${functionName}') called with args:`, args);
        const rpcConfig = config.rpcResults?.[functionName];

        if (typeof rpcConfig === 'function') {
            console.log(`[Mock RPC ${functionName}] Using function config.`);
            try {
                return await rpcConfig(); // Execute the configured function
            } catch (e) {
                console.error(`[Mock RPC ${functionName}] Error executing mock function:`, e);
                return { data: null, error: e };
            }
        } else if (rpcConfig) {
            console.log(`[Mock RPC ${functionName}] Using object config.`);
            return { data: rpcConfig.data ?? null, error: rpcConfig.error ?? null };
        } else {
            // No specific config found for this RPC function
            const errorMessage = `[Mock RPC] No mock result configured for RPC function: ${functionName}`;
            console.warn(errorMessage);
            return { data: null, error: new Error(errorMessage) };
        }
    });

    // --- Define spy ONLY for removeChannel --- 
    const removeChannelSpy = spy((_channel: RealtimeChannel) => Promise.resolve<'ok' | 'error' | 'timed out'>('ok'));

    // --- Assemble Mock Client ---
    const mockClient = {
        auth: mockAuth,
        from: fromSpy,
        rpc: rpcSpy, // Assign the new rpcSpy
        // --- Add a PLAIN function implementation for channel ---
        channel: (channelName: string): RealtimeChannel => {
            // --- Use the explicit MockChannel type --- 
            const minimalMockChannel: MockChannel = {
                topic: `realtime:${channelName}`,
                // Assign spies, returning the correctly typed object
                on: spy((_event: any, _callback: any) => minimalMockChannel),
                subscribe: spy((_callback?: any) => minimalMockChannel),
                unsubscribe: spy(() => Promise.resolve<'ok' | 'error' | 'timed out'>('ok')),
            };
            return minimalMockChannel as unknown as RealtimeChannel;
        },
        removeChannel: removeChannelSpy, // Assign the spy for removeChannel
    } as unknown as SupabaseClient;

    return {
        client: mockClient,
        spies: {
            getUserSpy: mockAuth.getUser,
            fromSpy: fromSpy,
            rpcSpy: rpcSpy, // Return the rpcSpy
            removeChannelSpy: removeChannelSpy, 
        },
    };
}

// --- Fetch Mocking Utilities ---

// Type for setting mock response
interface MockResponseConfig {
    response: Response | Promise<Response>;
    jsonData?: any; // Optional pre-parsed JSON data
}

// Store can hold a single config or an array for sequences
let _mockFetchResponseConfig: MockResponseConfig | Array<MockResponseConfig> = {
    response: new Response(null, { status: 200 })
};
let _responseSequenceIndex = 0;

// Update setter function signature
export function setMockFetchResponse(
    config: Response | Promise<Response> | MockResponseConfig | Array<Response | Promise<Response> | MockResponseConfig>
) {
    if (Array.isArray(config)) {
        // Convert array elements to MockResponseConfig if they are just Response objects
        _mockFetchResponseConfig = config.map(item => 
            item instanceof Response || item instanceof Promise ? { response: item } : item
        );
    } else if (config instanceof Response || config instanceof Promise) {
        // Wrap single Response/Promise in MockResponseConfig
        _mockFetchResponseConfig = { response: config };
    } else {
        // Assume it's already a MockResponseConfig
        _mockFetchResponseConfig = config;
    }
    _responseSequenceIndex = 0; 
}

// Base fetch implementation function
async function baseFetchImplementation(url: string | URL, options?: RequestInit): Promise<Response> {
    console.log(`[Mock Fetch] Intercepted fetch call: ${url}`, options);
    let configToUse: MockResponseConfig;

    if (Array.isArray(_mockFetchResponseConfig)) {
        console.log(`[Mock Fetch] Using response sequence (Index: ${_responseSequenceIndex})`);
        if (_responseSequenceIndex >= _mockFetchResponseConfig.length) {
            console.error("[Mock Fetch] Mock fetch sequence exhausted.");
            throw new Error(`Mock fetch sequence exhausted.`);
        }
        configToUse = _mockFetchResponseConfig[_responseSequenceIndex++];
    } else {
        console.log("[Mock Fetch] Using single response config.");
        configToUse = _mockFetchResponseConfig;
    }

    console.log("[Mock Fetch] Resolving configured response...");
    const responseToReturn = configToUse.response instanceof Promise
        ? await configToUse.response
        : configToUse.response;
    console.log(`[Mock Fetch] Resolved response object (Status: ${responseToReturn.status})`);

    // Clone the response before modifying/returning
    const clonedResponse = responseToReturn.clone();
    console.log("[Mock Fetch] Cloned response.");

    // Stub the .json() method if jsonData was provided in the config
    if (configToUse.jsonData !== undefined) {
        stub(clonedResponse, "json", () => {
             console.log("[Mock Fetch] Stubbed .json() method called.");
             return Promise.resolve(configToUse.jsonData);
        });
        console.log("[Mock Fetch] Stubbed .json() method on response clone.");
    }

    console.log("[Mock Fetch] Returning cloned response.");
    return clonedResponse; // Return the clone with potentially stubbed .json()
}

// Global spy 
export const mockFetch = spy(baseFetchImplementation);

/**
 * Helper function to run a test with temporarily mocked environment variables.
 */
export function withMockEnv(envVars: Record<string, string>, testFn: () => Promise<void>) {
    return async () => {
        const originalEnv = Deno.env.toObject();
        // Reset global mock response state before applying new env
        setMockFetchResponse(new Response(null, { status: 200 })); 
        try {
           // ... set env vars ...
            await testFn();
        } finally {
            // ... restore env vars ...
            // Reset global mock response state after the test
            setMockFetchResponse(new Response(null, { status: 200 }));
        }
    };
}

/**
 * Creates a NEW spy and stubs globalThis.fetch with it for a specific test scope.
 * Returns the new spy instance and the disposable stub.
 * Use with `try...finally` and `stub[Symbol.dispose]()`.
 */
export function stubFetchForTestScope(): { spy: Spy<any>, stub: Disposable } {
    // Ensure baseFetchImplementation is wrapped in spy *before* stubbing
    const fetchSpy = spy(baseFetchImplementation);
    const fetchStub = stub(globalThis, "fetch", fetchSpy as any);
    // Return with simplified spy type
    return { spy: fetchSpy as Spy<any>, stub: fetchStub };
}

// --- End of Fetch Mocking Utilities --- 