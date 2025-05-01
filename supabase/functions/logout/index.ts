// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// Removed unused actualCreateClient import
// import { createClient as actualCreateClient } from "npm:@supabase/supabase-js"; 
import type { SupabaseClient, AuthError } from "npm:@supabase/supabase-js@2"; // Use version 2
import { baseCorsHeaders as defaultCorsHeaders } from "../_shared/cors-headers.ts"; // Import standard CORS headers
import { HandlerError } from '../api-subscriptions/handlers/current.ts'; // Reuse HandlerError
import { 
    createSupabaseClient as actualCreateSupabaseClient, 
    verifyApiKey as actualVerifyApiKey, 
    // Removed createUnauthorizedResponse import
} from "../_shared/auth.ts";
import type { Database } from "../types_db.ts"; // Import Database types

// --- Remove Dependency Injection Setup ---
/*
export interface LogoutHandlerDeps { ... }
const defaultDeps: LogoutHandlerDeps = { ... };
*/

// --- Main Handler Logic --- 
// This function now *only* handles the core sign-out logic
// Assumes client is already created and authenticated based on request header
export async function mainHandler(supabaseClient: SupabaseClient<Database>): Promise<void> { // Returns void on success
    try {
        console.log("[logout/mainHandler] Calling signOut...");
        const { error } = await supabaseClient.auth.signOut();
        console.log(`[logout/mainHandler] signOut result: error=${error?.message}`);
        
        if (error) {
            console.error("[logout/mainHandler] Logout error:", error);
            // Use error status if available (like 401 for token issues), default to 500
            throw new HandlerError(error.message, error.status || 500, error);
        }

        console.log("[logout/mainHandler] SignOut successful.");
        // No return value needed for success

    } catch (error) {
        // Re-throw HandlerError directly
        if (error instanceof HandlerError) {
            throw error;
        }
        // Wrap other errors
        console.error('[logout/mainHandler] Unexpected error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred during sign out';
        // Default to 500, could check error.status if available
        const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
        throw new HandlerError(errorMessage, status, error instanceof Error ? error : undefined);
    }
}

// --- Serve Function --- 
serve(async (req) => {
    // --- Handle CORS Preflight --- 
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: defaultCorsHeaders, status: 204 });
    }

    try {
        // --- API Key Validation --- 
        const isValidApiKey = actualVerifyApiKey(req); 
        if (!isValidApiKey) {
            throw new HandlerError("Invalid or missing apikey", 401);
        }
        
        // --- Method Validation --- 
        if (req.method !== 'POST') {
            throw new HandlerError('Method Not Allowed', 405);
        }

        // --- Client Setup (using auth header) --- 
        let supabaseClient: SupabaseClient<Database>;
        try {
             console.log("[logout/serve] Creating client from request auth header...");
             // Pass Database type to client creation
             supabaseClient = actualCreateSupabaseClient(req);
             console.log("[logout/serve] Client created.");
        } catch (authError) {
             console.error("[logout/serve] Error creating client from auth header:", authError);
             const message = authError instanceof Error ? authError.message : "Failed to create client from auth token";
             // Assume 401 for client creation errors based on auth header
             throw new HandlerError(message, 401, authError);
        }

        // --- Call Main Logic --- 
        await mainHandler(supabaseClient);
        
        // --- Format Success Response --- 
        // Simple 200 OK is sufficient for logout
        return new Response(null, { // No body needed
            headers: defaultCorsHeaders, 
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