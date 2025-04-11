// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";
import { spy, stub, type Spy } from "jsr:@std/testing/mock"; // Add Deno mock imports

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

// --- Fetch Mocking Utilities ---

// Can hold a single response, a promise, or an array for sequences
let _mockFetchResponse: Response | Promise<Response> | Array<Response | Promise<Response>> = new Response(null, { status: 200 });
let _responseSequenceIndex = 0;

// Setter function for tests to configure the mock response(s)
export function setMockFetchResponse(response: Response | Promise<Response> | Array<Response | Promise<Response>>) {
    _mockFetchResponse = response;
    _responseSequenceIndex = 0; // Reset sequence index when setting new response(s)
}

// Base fetch implementation function (used by per-test spies)
async function baseFetchImplementation(/*url: string | URL, options?: RequestInit*/): Promise<Response> {
    let responseToUse: Response | Promise<Response>;

    if (Array.isArray(_mockFetchResponse)) {
        if (_responseSequenceIndex >= _mockFetchResponse.length) {
            throw new Error(`Mock fetch sequence exhausted. Called more than ${_mockFetchResponse.length} times.`);
        }
        responseToUse = _mockFetchResponse[_responseSequenceIndex++];
    } else {
        responseToUse = _mockFetchResponse;
    }
    
    // Clone/cancel logic remains the same
    if (responseToUse instanceof Response && responseToUse.body) {
        const clonedResponse = responseToUse.clone(); 
        if (clonedResponse.body) {
            await clonedResponse.body.cancel(); 
        }
    }
    if (responseToUse instanceof Response) {
        return responseToUse.clone(); 
    } else {
        return await responseToUse; 
    }
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
 * Returns the new spy instance for assertions and the disposable stub.
 * Use with `await using` to ensure the stub is disposed.
 */
export function stubFetchForTestScope(): { spy: Spy<typeof baseFetchImplementation>, stub: Disposable } {
    const newSpy: Spy<typeof baseFetchImplementation> = spy(baseFetchImplementation);
    // Cast newSpy to any to bypass complex stub signature checks
    const fetchStub = stub(globalThis, "fetch", newSpy as any);
    return { spy: newSpy, stub: fetchStub };
}

// --- End of Fetch Mocking Utilities --- 