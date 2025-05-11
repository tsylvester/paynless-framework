import { createClient, type SupabaseClient, type User as SupabaseUser, type Session } from "npm:@supabase/supabase-js";
import type { Database } from "../../functions/types_db.ts";

// --- Admin Client Creation ---
// Changed to accept config parameters
export function createAdminClientInstance(
    supabaseUrl: string,
    serviceRoleKey: string
): SupabaseClient<Database> {
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Supabase URL or Service Role Key is required to create admin client.");
    }
    return createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

// --- Test User Management ---
export interface TestUserContext {
    user: SupabaseUser;
    jwt: string;
    client: SupabaseClient<Database>; // Client authenticated as this user
    email: string;
    userId: string;
}

// Changed to accept adminClient and config parameters
export async function createTestUser(
    adminClient: SupabaseClient<Database>, // Pass admin client in
    supabaseUrl: string, // Pass URL in
    supabaseAnonKey: string, // Pass anon key in
    email: string,
    password = "password123"
): Promise<TestUserContext> {
    // 1. Check if user exists and delete if so (using provided adminClient)
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (listError) console.warn('Error listing users during createTestUser for ' + email + ': ' + listError.message);
    
    const existingUser = users?.find(u => u.email === email);
    if (existingUser) {
        console.log('Test user ' + email + ' (ID: ' + existingUser.id + ') already exists. Deleting for fresh setup...');
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
        if (deleteError) {
            console.error('Failed to delete existing user ' + email + ' (ID: ' + existingUser.id + '): ' + deleteError.message);
        }
    }

    // 2. Create the new user (using provided adminClient)
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm for tests
    });

    if (createError || !createData?.user) {
        throw createError || new Error('Failed to create test user ' + email + '.');
    }
    const user = createData.user;
    console.log('Test user ' + email + ' created with ID: ' + user.id);

    // 3. Sign in as the new user to get a JWT and an authenticated client
    // Create a temporary client for sign-in using passed config
    const userClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false } // Important for tests
    });

    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
        email,
        password,
    });

    if (signInError || !signInData?.session?.access_token) {
        throw signInError || new Error('Failed to sign in as test user ' + email + '. Session or token missing.');
    }

    // Update client to use the new user's token by default for subsequent requests
    userClient.auth.setSession(signInData.session);

    return {
        user,
        jwt: signInData.session.access_token,
        client: userClient,
        email,
        userId: user.id,
    };
}

// --- Organization Management ---
export interface TestOrg {
    id: string;
    name: string;
}

// Changed to accept adminClient
export async function createTestOrg(
    adminClient: SupabaseClient<Database>, // Pass admin client in
    name: string, 
    ownerUserId?: string // Optional: If provided, also add owner
): Promise<TestOrg> {
    const { data, error } = await adminClient
        .from("organizations")
        .insert({ name })
        .select("id, name")
        .single();

    if (error || !data) throw error || new Error('Failed to create organization ' + name + '.');
    
    // Pass adminClient down if adding owner
    if (ownerUserId) { 
        await addOrgMember(adminClient, data.id, ownerUserId, "admin");
    }
    console.log('Test organization \'' + data.name + '\' created with ID: ' + data.id);
    return data;
}

// Changed to accept adminClient
export async function addOrgMember(
    adminClient: SupabaseClient<Database>, // Pass admin client in
    organizationId: string,
    userId: string,
    role: "admin" | "member",
    status: "active" | "pending" | "invited" = "active"
): Promise<void> {
    const { error } = await adminClient.from("organization_members").insert({
        organization_id: organizationId,
        user_id: userId,
        role,
        status,
    });
    if (error) throw new Error('Failed to add user ' + userId + ' to org ' + organizationId + ' as ' + role + ': ' + error.message);
    console.log('User ' + userId + ' added to org ' + organizationId + ' as ' + role + ' with status ' + status + '.');
}

// Changed to accept adminClient
export async function setOrgMemberChatCreation(
    adminClient: SupabaseClient<Database>, // Pass admin client in
    organizationId: string,
    allow: boolean
): Promise<void> {
    const { error } = await adminClient
        .from("organizations")
        .update({ allow_member_chat_creation: allow })
        .eq("id", organizationId);
    if (error) throw error;
    console.log('Organization ' + organizationId + ' allow_member_chat_creation set to ' + allow + '.');
}

// --- Generic Cleanup ---
// Changed to accept adminClient
export async function cleanupTestUserByEmail(
    adminClient: SupabaseClient<Database>, // Pass admin client in
    email: string
): Promise<void> {
    const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const userToDelete = users?.find(u => u.email === email);
    if (userToDelete) {
        console.log('Cleaning up user ' + email + ' (ID: ' + userToDelete.id + ')');
        const { error } = await adminClient.auth.admin.deleteUser(userToDelete.id);
        if (error) console.error('Error cleaning up user ' + email + ': ' + error.message);
        else console.log('User ' + email + ' cleaned up successfully.');
    } else {
        console.log('User ' + email + ' not found for cleanup.');
    }
}

// Changed to accept adminClient
export async function cleanupTestOrgByName(
    adminClient: SupabaseClient<Database>, // Pass admin client in
    name: string
): Promise<void> {
    // Supabase RLS might prevent direct delete if cascades aren't perfect or other dependencies exist.
    // For tests, ensure cascade deletes are set up in DB schema or delete members first.
    const { data: orgs, error: findError } = await adminClient.from("organizations").select("id").eq("name", name);
    if (findError) {
        console.error('Error finding org ' + name + ' for cleanup: ' + findError.message);
        return;
    }
    if (orgs && orgs.length > 0) {
        for (const org of orgs) {
            console.log('Cleaning up organization ' + name + ' (ID: ' + org.id + ')');
            // Attempt to delete members first (optional, if cascade isn't reliable or specific order needed)
            // await adminClient.from("organization_members").delete().eq("organization_id", org.id);
            const { error } = await adminClient.from("organizations").delete().eq("id", org.id);
            if (error) console.error('Error cleaning up org ' + name + ' (ID: ' + org.id + '): ' + error.message);
            else console.log('Org ' + name + ' (ID: ' + org.id + ') cleaned up successfully.');
        }
    } else {
         console.log('Org ' + name + ' not found for cleanup.');
    }
}

// --- API Request Helper (Optional but recommended for RLS tests via Edge Functions) ---
// Changed to accept supabaseUrl and anonKey
export async function makeApiRequest(
    supabaseUrl: string, // Pass URL in
    supabaseAnonKey: string, // Pass anon key in
    endpointPath: string, // e.g., "/chat", "/chat-history"
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    userContext: TestUserContext | null, // Pass null for unauthenticated or anon key requests
    body?: Record<string, unknown> | null,
    queryParams?: Record<string, string>
): Promise<Response> {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase URL or Anon Key was not provided to makeApiRequest.");
    }
    const headers: HeadersInit = {
        "apikey": supabaseAnonKey, // Use passed anon key
    };
    if (userContext) {
        headers["Authorization"] = 'Bearer ' + userContext.jwt;
    }
    if (method !== "GET" && body) {
        headers["Content-Type"] = "application/json";
    }

    let url = supabaseUrl + '/functions/v1' + endpointPath;
    if (queryParams) {
        url += '?' + new URLSearchParams(queryParams).toString();
    }

    return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
}

// You might also add helpers here for direct DB interaction as a specific user role
// if some RLS policies are too complex to test reliably only through Edge Functions.
// For example:
// export async function executeSqlAsUser(adminClient: SupabaseClient<Database>, userContext: TestUserContext, sql: string, params?: any[]) { ... }
// This would involve setting role and jwt.claims in a transaction. 