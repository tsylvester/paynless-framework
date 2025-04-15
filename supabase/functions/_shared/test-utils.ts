// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";
import { spy, stub, type Spy } from "jsr:@std/testing/mock"; // Add Deno mock imports
// Remove unstable directive, no longer needed after removing KV mocks
// /// <reference lib="deno.unstable" />
// Import ChatMessage type
import type { ChatMessage } from "../../../packages/types/src/ai.types.ts";

// Remove manual .env file loading - rely on deno test --env flag instead
/*
// Load environment variables from .env.local file manually
// Assuming CWD is the project root (paynless-framework)
const envFileName = '.env.local'; // Corrected filename WITH leading dot
const relativePath = `supabase/${envFileName}`;

console.log(`Attempting to manually load .env file from relative path: ${relativePath}`);

try {
    const fileContent = await Deno.readTextFile(relativePath); // Use relative path directly
    const lines = fileContent.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();
        // Skip comments and empty lines
        if (trimmedLine.startsWith('#') || trimmedLine.length === 0) {
            continue;
        }
        // Split line by the first '=' 
        const equalsIndex = trimmedLine.indexOf('=');
        if (equalsIndex === -1) {
            // Skip lines without an equals sign
            continue;
        }

        const key = trimmedLine.substring(0, equalsIndex).trim();
        let value = trimmedLine.substring(equalsIndex + 1).trim();

        // Remove surrounding quotes (single or double) if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
        }
        
        if (key) {
             // Set the environment variable
             Deno.env.set(key, value);
             // Optional: Log loaded variables for debugging (can be noisy)
             // console.log(`  Loaded env var: ${key}`); 
        }
    }
    console.log("Manually processed .env file:", relativePath);

} catch (error) {
    if (error instanceof Deno.errors.NotFound) {
        console.warn(`WARN: Environment file (${envFileName}) not found at relative path ${relativePath}. Relying on globally set env vars.`);
    } else {
        console.error(`Error manually reading or parsing environment file ${relativePath}:`, error);
        // Re-throw critical errors during loading
        throw error; 
    }
}
*/

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

// --- Supabase Client Mocking Utilities ---

/** Configurable data/handlers for the mock Supabase client (Revised) */
export interface MockSupabaseDataConfig {
    // Expected results for specific operations
    getUserResult?: { data: { user: { id: string } | null }; error: any };
    selectPromptResult?: { data: { id: string; prompt_text: string } | null; error: any };
    selectProviderResult?: { data: { id: string; api_identifier: string } | null; error: any };
    selectChatHistoryResult?: { data: Array<{ role: string; content: string }> | null; error: any };
    insertChatResult?: { data: { id: string } | null; error: any };
    insertUserMessageResult?: { data: ChatMessage | null; error: any }; // Use ChatMessage type
    insertAssistantMessageResult?: { data: ChatMessage | null; error: any }; // Use ChatMessage type
    // User for auth mock (if not providing full getUserResult)
    mockUser?: { id: string };
    // Error simulation (simplified)
    simulateDbError?: Error | null; // General DB error
    simulateAuthError?: Error | null;
}

/** Creates a mocked Supabase client instance for unit testing (Revised) */
export function createMockSupabaseClient(
    config: MockSupabaseDataConfig = {}
): {
    client: SupabaseClient;
    spies: { getUserSpy: Spy<any>; fromSpy: Spy<any>; /* Add more if needed */ };
} {
    // --- Mock Auth ---
    const mockAuth = {
        getUser: spy(async () => {
            if (config.simulateAuthError) return { data: { user: null }, error: config.simulateAuthError };
            // Prefer getUserResult if provided, otherwise use mockUser
            if (config.getUserResult) return config.getUserResult;
            return { data: { user: config.mockUser ?? null }, error: null };
        }),
        // Add other auth methods if needed (e.g., signInWithPassword)
    };

    // --- Mock Query Builder Chain ---
    // Define an interface for the builder methods we mock
    interface MockQueryBuilder {
        select: Spy<any>;
        insert: Spy<any>;
        eq: Spy<any>;
        order: Spy<any>;
        single: Spy<any>;
        then: Spy<any>;
    }

    const fromSpy = spy((tableName: string) => {
        // State for the current query chain
        const _queryBuilderState = {
            tableName: tableName,
            operation: 'select', // Default operation
            filters: [] as { column: string; value: any }[],
            selectColumns: '*',
        };

        // Define the mock builder methods here, typed with the interface
        const mockQueryBuilder: MockQueryBuilder = {} as MockQueryBuilder; 

        mockQueryBuilder.select = spy((columns = '*') => {
            console.log(`[Mock QB ${tableName}] .select(${columns}) called`);
            if (_queryBuilderState.operation !== 'insert') {
                _queryBuilderState.operation = 'select';
            }
            _queryBuilderState.selectColumns = columns;
            return mockQueryBuilder; // Return self for chaining
        });

        mockQueryBuilder.insert = spy((rows: any[] | object) => {
            console.log(`[Mock QB ${tableName}] .insert() called with:`, rows);
            _queryBuilderState.operation = 'insert';
            // In a real scenario, you might store `rows` in the state
            return mockQueryBuilder; // Return self for chaining
        });

        mockQueryBuilder.eq = spy((column: string, value: any) => {
             console.log(`[Mock QB ${tableName}] .eq(${column}, ${value}) called`);
            _queryBuilderState.filters.push({ column, value });
            return mockQueryBuilder; // Return self for chaining
        });

        mockQueryBuilder.order = spy((_column: string, _options?: any) => {
            console.log(`[Mock QB ${tableName}] .order() called`);
            // Ordering logic could be added if needed
            return mockQueryBuilder; // Return self for chaining
        });

        // Terminal methods: .single() and .then()
        mockQueryBuilder.single = spy(async () => {
             if (config.simulateDbError) return { data: null, error: config.simulateDbError };
             console.log(`[Mock QB ${tableName}] .single() resolving based on state:`, _queryBuilderState);
             // Logic based on operation and table name
             if (_queryBuilderState.operation === 'select') {
                 switch (tableName) {
                    case 'system_prompts': return config.selectPromptResult ?? { data: null, error: null };
                    case 'ai_providers': return config.selectProviderResult ?? { data: null, error: null };
                    // *** FIX: Add case for selecting a single chat (needed?) ***
                    // case 'chats': return ???; 
                    default: return { data: null, error: new Error(`Mock .single() SELECT not configured for table ${tableName}`) };
                 }
             } else if (_queryBuilderState.operation === 'insert') {
                 // .insert().select().single() case
                 switch (tableName) {
                     // *** FIX: Add case for inserting a chat ***
                     case 'chats': 
                         console.log("[Mock QB chats] Resolving .single() after insert");
                         return config.insertChatResult ?? { data: { id: 'mock-chat-id-fallback' }, error: null };
                     default: return { data: null, error: new Error(`Mock .single() INSERT not configured for table ${tableName}`) };
                 }
             }
             // Reset operation state after terminal call?
             // _queryBuilderState.operation = 'select'; // Reset to default? Or handle differently?
            return { data: null, error: new Error(`Unhandled mock .single() case for table ${tableName} and operation ${_queryBuilderState.operation}`) };
        });

        mockQueryBuilder.then = spy(async (onfulfilled: (value: { data: any; error: any; }) => any) => {
             if (config.simulateDbError) return onfulfilled({ data: null, error: config.simulateDbError });
             console.log(`[Mock QB ${tableName}] .then() resolving based on state:`, _queryBuilderState);

             if (_queryBuilderState.operation === 'insert' && tableName === 'chat_messages') {
                 // Handle insert().select('*') for chat_messages
                 console.log("[Mock QB chat_messages] Resolving .then() after insert");
                 
                 // *** FIX: Check for configured errors first ***
                 const userMsgError = config.insertUserMessageResult?.error;
                 const asstMsgError = config.insertAssistantMessageResult?.error;
                 if (userMsgError || asstMsgError) {
                    console.log("[Mock QB chat_messages] Returning configured insert error");
                    // Return the first error found (or combine if needed, but usually one error matters)
                    return onfulfilled({ data: null, error: userMsgError || asstMsgError });
                 }
                 
                 // Original logic: Combine data only if no errors
                 const insertedData = [
                     config.insertUserMessageResult?.data,
                     config.insertAssistantMessageResult?.data
                 ].filter(Boolean);
                 return onfulfilled({ data: insertedData, error: null });
             }

             if (_queryBuilderState.operation === 'select' && tableName === 'chat_messages') {
                 // Handle select() for chat history
                 console.log("[Mock QB chat_messages] Resolving .then() for history select");
                 return onfulfilled(config.selectChatHistoryResult ?? { data: [], error: null });
             }

             // Default case for other .then() calls (e.g., select from other tables)
             console.log(`[Mock QB ${tableName}] Resolving .then() with default empty array data`);
             return onfulfilled({ data: [], error: null });
        });

        // Return the fully constructed mock query builder
        return mockQueryBuilder;
    });

    const mockClient = {
        auth: mockAuth,
        from: fromSpy,
    } as unknown as SupabaseClient;

    return {
        client: mockClient,
        spies: { getUserSpy: mockAuth.getUser, fromSpy: fromSpy }, // Export fromSpy correctly
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
async function baseFetchImplementation(/*url: string | URL, options?: RequestInit*/): Promise<Response> {
    let configToUse: MockResponseConfig;

    if (Array.isArray(_mockFetchResponseConfig)) {
        if (_responseSequenceIndex >= _mockFetchResponseConfig.length) {
            throw new Error(`Mock fetch sequence exhausted.`);
        }
        configToUse = _mockFetchResponseConfig[_responseSequenceIndex++];
    } else {
        configToUse = _mockFetchResponseConfig;
    }

    const responseToReturn = configToUse.response instanceof Promise
        ? await configToUse.response
        : configToUse.response;

    // Clone the response before modifying/returning
    const clonedResponse = responseToReturn.clone();

    // Stub the .json() method if jsonData was provided in the config
    if (configToUse.jsonData !== undefined) {
        stub(clonedResponse, "json", () => Promise.resolve(configToUse.jsonData));
        console.log("[Mock Fetch] Stubbed .json() method on response clone.");
    }

    // Cancel original body if needed (on a separate clone)
    if (responseToReturn.body) {
        const cancelClone = responseToReturn.clone();
        if (cancelClone.body) {
           await cancelClone.body.cancel().catch(e => console.warn("[Mock Fetch] Error cancelling body:", e));
        }
    }

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