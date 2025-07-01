// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.

// DEPLOYMENT NOTE: This function handles user login BEFORE a user JWT exists.
// It is secured via an API key check (verifyApiKey) within the function body.
// Deploy using: supabase functions deploy login --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { 
    createClient, 
    type SupabaseClient, 
    type SignInWithPasswordCredentials, 
    type AuthResponse, 
    type PostgrestSingleResponse 
} from "npm:@supabase/supabase-js@2"; // Use specific version 2
import { baseCorsHeaders as defaultCorsHeaders } from "../_shared/cors-headers.ts"; // Use baseCorsHeaders
import { HandlerError } from '../api-subscriptions/handlers/current.ts'; // Reuse HandlerError
import { 
    verifyApiKey as actualVerifyApiKey
    // Removed createUnauthorizedResponse import
} from "../_shared/auth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { Database } from "../types_db.ts"; // Import Database types

console.log("DEBUG: Running refactored login/index.ts");

// Define types for expected input and output
export interface LoginCredentials {
    email: string;
    password: string;
}

export interface LoginSuccessResponse {
    user: AuthResponse['data']['user'];
    session: AuthResponse['data']['session'];
    profile: Database['public']['Tables']['user_profiles']['Row'] | null;
}

// --- Remove Dependency Injection Setup ---
/*
export interface LoginHandlerDeps { ... }
const defaultDeps: LoginHandlerDeps = { ... };
*/

// --- Main Handler Logic --- 
// This function now *only* handles the core logic for a validated POST request
// Assumes API key is already validated and body is parsed
export async function mainHandler(
    supabaseClient: SupabaseClient<Database>, // Use Database type
    creds: LoginCredentials
): Promise<LoginSuccessResponse> { 
    try {
        console.log(`Attempting login for user: ${creds.email}`);
        // Sign in the user
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: creds.email,
            password: creds.password,
        });

        if (authError) {
            console.error("Login auth error:", authError.message, "Status:", authError.status);
            // Use error status if available, default to 400 for auth errors
            throw new HandlerError(authError.message, authError.status || 400, authError);
        }

        // Ensure user data exists after successful sign-in 
        if (!authData || !authData.user || !authData.session) {
            console.error("Login succeeded but user/session data missing:", authData);
            throw new HandlerError("Login completed but failed to retrieve session.", 500);
        }

        // --- Start Legacy User True-Up ---
        // Asynchronously call the database function to ensure the user has a profile,
        // wallet, and free subscription. This is non-critical to the login flow,
        // so we don't await it and won't fail the login if it errors.
        // The `true_up_user` function is idempotent and will handle its own logging.
        supabaseClient.rpc('true_up_user', { p_user_id: authData.user.id })
            .then(({ error }) => {
                if (error) {
                    console.warn(`[Login] Non-critical error calling true_up_user for ${authData.user.id}:`, error.message);
                }
            });
        // --- End Legacy User True-Up ---

        let profile = null;
        try {
            // Get the user's profile using the SAME client 
            // RLS policy on user_profiles should allow users to read their own profile
            const { data: profileData, error: profileError } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('id', authData.user.id)
                .maybeSingle<Database['public']['Tables']['user_profiles']['Row']>(); // Add type annotation

            if (profileError) {
                // Log error but don't fail the login if profile fetch fails
                console.warn(`Profile fetch warning for ${authData.user.id} (non-critical):`, profileError.message);
            } else {
                profile = profileData; // Assign profile if fetch succeeded
                console.log(`Successfully fetched profile for user: ${authData.user.id}`);
            }
        } catch (profileCatchError) {
            // Catch unexpected errors during profile fetch
            console.warn(`Unexpected error during profile fetch for ${authData.user.id} (non-critical):`, profileCatchError);
        }

        // Return successful response data
        return {
            user: authData.user,
            session: authData.session,
            profile: profile // Will be null if fetch failed or profile doesn't exist
        };

    } catch (error) {
        // Re-throw HandlerError directly
        if (error instanceof HandlerError) {
            throw error;
        }
        // Wrap other errors
        console.error('Login mainHandler error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
        const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
        throw new HandlerError(errorMessage, status, error instanceof Error ? error : undefined);
    }
}

// --- Serve Function --- 
// This wrapper handles request validation, routing, auth, client creation, and response formatting
serve(async (req) => {
    // --- Handle CORS Preflight --- 
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: defaultCorsHeaders, status: 204 });
    }

    try {
        // --- API Key Validation --- 
        // ---> Add Logging Before Verify <---
        const apiKeyHeader = req.headers.get('apikey');
        console.log(`[login/index.ts serve] About to call verifyApiKey. Header received: ${apiKeyHeader}`);
        // ---> End Logging <---
        const isValidApiKey = actualVerifyApiKey(req); 
        if (!isValidApiKey) {
            // Use HandlerError for consistent error handling
            throw new HandlerError("Invalid or missing apikey", 401);
        }
        console.log("Login API Key check passed in serve wrapper.");

        // --- Method Validation --- 
        if (req.method !== 'POST') {
            throw new HandlerError('Method Not Allowed', 405);
        }

        // --- Body Parsing & Validation --- 
        let creds: LoginCredentials;
        try {
            creds = await req.json();
            if (!creds || typeof creds !== 'object' || !creds.email || !creds.password) {
                 throw new Error("Email and password are required in the JSON body.");
            }
        } catch (parseError) {
            console.warn("Login request body parsing/validation error:", parseError);
            // Use HandlerError for consistent error handling
            const message = parseError instanceof SyntaxError ? "Invalid JSON body" : (parseError instanceof Error ? parseError.message : "Invalid request body");
            throw new HandlerError(message, 400, parseError);
        }

        // --- Client Setup --- 
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        if (!supabaseUrl || !supabaseAnonKey) {
            console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
            throw new HandlerError("Server configuration error.", 500);
        }
        // Create the ANON client - login doesn't use user's JWT
        const supabaseAnonClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

        // --- Call Main Logic --- 
        const data = await mainHandler(supabaseAnonClient, creds);
        
        // --- Format Success Response --- 
        return new Response(JSON.stringify(data), {
            headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err) {
        // --- Format Error Response --- 
        let errorStatus = 500;
        let errorMessage = "Internal Server Error";
        if (err instanceof HandlerError) {
            errorStatus = err.status;
            errorMessage = err.message;
            if (err.cause) console.error("Original error cause:", err.cause);
        } else if (err instanceof Error) {
            errorMessage = err.message;
        } else {
            errorMessage = String(err); 
        }
        console.error("Returning error response:", { status: errorStatus, message: errorMessage });
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
            status: errorStatus,
        });
    }
}); 