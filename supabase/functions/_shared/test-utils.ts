import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";

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

// Critical check: Ensure essential variables are now set
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("CRITICAL: Essential Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY) are missing after manual load attempt. Please check:", relativePath, "or ensure they are set globally.");
    throw new Error("Essential Supabase env vars missing after manual loading.");
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