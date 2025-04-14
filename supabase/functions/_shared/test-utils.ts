// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";
import { spy, stub, type Spy } from "jsr:@std/testing/mock"; // Add Deno mock imports
// Add Deno KV types if not already present (might need unstable flag in files using this)
/// <reference lib="deno.unstable" />
// Import ChatMessage type
import type { ChatMessage } from "../../../packages/types/src/ai.types.ts";

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

// Check for essential Supabase variables, but don't throw if missing during import
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

// --- Rate Limit Mock Store (for Deno KV Mock) ---
type RateLimitStore = {
  [ip: string]: { count: number; expiresAt: number };
};
let rateLimitStore: RateLimitStore = {};

/** Resets the in-memory store used by the KV mock. Call before tests needing a clean slate. */
export function resetRateLimitStore() {
    rateLimitStore = {};
    console.log("[Test Utils] Reset in-memory rate limit store.");
}

/**
 * Creates a basic in-memory mock for Deno.Kv specifically for IP-based rate limiting tests.
 * Assumes keys are in the format ["prefix", ipAddress].
 */
export function createRateLimitKvMock(): Promise<Deno.Kv> {
    const mockKv = {
      get: spy(async (key: Deno.KvKey) => {
        const ip = key[1] as string;
        const entry = rateLimitStore[ip];
        return Promise.resolve({ key, value: entry || null, versionstamp: entry ? String(entry.expiresAt) : null });
      }),
      atomic: spy(() => {
        let _check: Deno.AtomicCheck | null = null;
        let _setKey: Deno.KvKey | null = null;
        let _setValue: any = null;
        let _expireIn: number | undefined = undefined;

        const op = {
          check: (check: Deno.AtomicCheck) => { _check = check; return op; },
          set: (key: Deno.KvKey, value: unknown, options?: { expireIn?: number }) => {
            _setKey = key; _setValue = value; _expireIn = options?.expireIn; return op;
          },
          sum: (_key: Deno.KvKey, _n: bigint) => op, // Basic sum mock
          commit: spy(async () => {
            const ip = _setKey?.[1] as string;
            const existingEntry = rateLimitStore[ip];
            const existingVersionstamp = existingEntry ? String(existingEntry.expiresAt) : null;
            if (_check && _check.versionstamp !== existingVersionstamp) {
              console.log(`[Mock KV Commit] Check failed for IP ${ip}`);
              return Promise.resolve({ ok: false });
            }
            if (_setKey && _setValue) {
              console.log(`[Mock KV Commit] Committing set for IP ${ip}`, _setValue);
              rateLimitStore[ip] = {
                ..._setValue,
                expiresAt: _setValue.expiresAt || (Date.now() + (_expireIn || 60 * 60 * 1000)),
              };
              return Promise.resolve({ ok: true, versionstamp: String(rateLimitStore[ip].expiresAt) });
            }
            return Promise.resolve({ ok: false });
          }),
        };
        return op;
      }),
    } as unknown as Deno.Kv;
    return Promise.resolve(mockKv);
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
    const mockAuth = {
      getUser: spy(async (_options?: any) => {
         if (config.simulateAuthError) return { data: { user: null }, error: config.simulateAuthError };
         if (config.getUserResult) return config.getUserResult;
         // Fallback based on mockUser
         const user = config.mockUser;
         if (user) {
             console.log("[Mock Supa Client Auth] Returning mock user", user.id);
             return Promise.resolve({ data: { user }, error: null });
         } else {
            console.log("[Mock Supa Client Auth] Returning no user");
            return Promise.resolve({ data: { user: null }, error: { message: "No session", status: 401 } });
         }
      })
    };

    // State to track chat message insertions for the current mock instance
    let userMessageInserted = false;

    // Simplified mock for the builder chain
    const fromSpy = spy((tableName: string) => {
        // Explicitly type mockBuilder as any to resolve inference issues
        const mockBuilder: any = {
            select: spy(() => mockBuilder),
            insert: spy(() => mockBuilder),
            eq: spy(() => mockBuilder),
            order: spy(() => mockBuilder),
            single: spy(async () => {
                // Revert: Remove the setTimeout and Promise wrapper
                if (config.simulateDbError) {
                    return { data: null, error: config.simulateDbError };
                }
                console.log(`[Mock QB ${tableName}] .single() resolving`);
                let result: { data: any, error: any };
                switch (tableName) {
                    case 'system_prompts':
                        result = config.selectPromptResult ?? { data: null, error: null };
                        break;
                    case 'ai_providers':
                        result = config.selectProviderResult ?? { data: null, error: null };
                        break;
                    case 'chats':
                        result = config.insertChatResult ?? { data: { id: 'mock-chat-id' }, error: null };
                        break;
                    case 'chat_messages':
                        if (!userMessageInserted) {
                            console.log("[Mock QB chat_messages] single() resolving for USER message");
                            userMessageInserted = true;
                            result = config.insertUserMessageResult ?? { data: null, error: null };
                        } else {
                            console.log("[Mock QB chat_messages] single() resolving for ASSISTANT message");
                            result = config.insertAssistantMessageResult ?? { data: null, error: null };
                        }
                        break;
                    default:
                        result = { data: null, error: null };
                }
                return result; // Directly return the result object
            }),
            then: async (onfulfilled: (value: { data: any; error: any; }) => any) => {
                 if (config.simulateDbError) return onfulfilled({ data: null, error: config.simulateDbError });
                 console.log(`[Mock QB ${tableName}] .then() resolving`);
                 if (tableName === 'chat_messages') { // History fetch
                    return onfulfilled(config.selectChatHistoryResult ?? { data: [], error: null });
                 }
                 return onfulfilled({ data: null, error: null }); // Default
            }
        };
        return mockBuilder;
    });

    const mockClient = {
      auth: mockAuth,
      from: fromSpy,
    } as unknown as SupabaseClient;

    return {
        client: mockClient,
        spies: { getUserSpy: mockAuth.getUser, fromSpy: fromSpy },
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