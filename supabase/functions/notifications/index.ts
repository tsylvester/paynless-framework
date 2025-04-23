import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4';
import { Notification } from "../_shared/types.ts"; // Import Notification from shared
import { corsHeaders } from '../_shared/cors-headers.ts'; // Assuming this utility exists

console.log("Notifications GET function initializing (top-level).");

// Define dependencies type
export interface NotificationsDeps {
    supabaseClient: SupabaseClient;
}

// Helper to get required environment variables
function getEnvVar(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new Error(`Environment variable ${name} is not set.`);
    }
    return value;
}

// Define the handler function (exported)
export async function handler(req: Request, deps: NotificationsDeps): Promise<Response> {
    console.log(`Request received: ${req.method} ${req.url}`);

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'GET') {
        console.warn(`Method not allowed: ${req.method}`);
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // --- Authentication ---
    let user: User | null = null;
    try {
        // We assume deps.supabaseClient is correctly authenticated FOR THIS REQUEST
        const { data: userData, error: authError } = await deps.supabaseClient.auth.getUser(); // No token needed here

        if (authError || !userData?.user) {
            console.error('Authentication failed via injected client:', authError);
            // Use 401 for consistency, even if the underlying error might be different
            return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message ?? 'Invalid client context'}` }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        user = userData.user;
        console.log(`Authenticated user via injected client: ${user.id}`);
    } catch (err) {
        console.error('Unexpected error during authentication via injected client:', err);
        return new Response(JSON.stringify({ error: 'Internal Server Error during authentication' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized: User not found' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // --- Fetch Notifications ---
    try {
        console.log(`Fetching notifications for user: ${user.id} using injected client`);
       
        const { data: notifications, error: dbError } = await deps.supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }); 

        if (dbError) {
            console.error('Database error fetching notifications:', dbError);
            return new Response(JSON.stringify({ error: `Database error: ${dbError.message}` }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`Successfully fetched ${notifications?.length ?? 0} notifications.`);
        return new Response(JSON.stringify(notifications ?? []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Unexpected error fetching notifications:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
}

// --- Default Dependencies & Serve (Only run when executed directly) ---
if (import.meta.main) {
    console.log("Running Notifications GET function directly (import.meta.main).");

    // How to handle default dependencies? 
    // We can't easily create a user-specific client here without a request token.
    // Option 1: Use Admin client (might bypass RLS, maybe not intended)
    // Option 2: Require a token when running directly (complex setup)
    // Option 3: Realize that testing should use mocks, and direct running is less critical.
    // Let's use the Admin client for the default serve, acknowledging it might behave differently than user context.
    
    // Re-add getEnvVar locally if needed
    function getEnvVarLocal(name: string): string {
        const value = Deno.env.get(name);
        if (!value) {
            throw new Error(`Environment variable ${name} is not set.`);
        }
        return value;
    }

    const defaultSupabaseClient = createClient(
        getEnvVarLocal('SUPABASE_URL'),
        getEnvVarLocal('SUPABASE_SERVICE_ROLE_KEY'), // Use service role for direct execution
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        }
    );

    const defaultDeps: NotificationsDeps = {
        supabaseClient: defaultSupabaseClient,
    };

    // Start the server - IMPORTANT: The handler will now expect the request
    // itself to contain the necessary auth (e.g., Authorization header)
    // for the *injected* defaultSupabaseClient to work correctly IF RLS is on.
    // Calling `deps.supabaseClient.auth.getUser()` without a token passed in
    // the request headers to this default client will likely fail.
    serve(async (req) => {
        // Attempt to create a user-specific client *if* auth header exists
        const authHeader = req.headers.get('Authorization');
        let clientToUse = defaultSupabaseClient; // Default to admin
        let handlerDeps = defaultDeps;

        if (authHeader && authHeader.startsWith('Bearer ')) {
             console.log("Direct run: Auth header detected, creating user-context client.");
             // Create a client instance authenticated with the token from the request
             try {
                 const userClient = createClient(
                     getEnvVarLocal('SUPABASE_URL'),
                     getEnvVarLocal('SUPABASE_ANON_KEY'),
                     {
                         global: { headers: { Authorization: authHeader } },
                         auth: { 
                             persistSession: false, 
                             autoRefreshToken: false 
                         }
                     }
                 );
                 // Check if token is actually valid before using the client
                 const { data: checkData, error: checkError } = await userClient.auth.getUser();
                 if (checkError || !checkData.user) {
                    console.error("Direct run: Auth header token invalid:", checkError);
                    // Fall back to returning an error response directly
                    return new Response(JSON.stringify({ error: `Unauthorized: ${checkError?.message ?? 'Invalid token'}` }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                 } else {
                     console.log("Direct run: User client created successfully.");
                     clientToUse = userClient;
                     handlerDeps = { supabaseClient: clientToUse };
                 }
             } catch (e) {
                 console.error("Direct run: Error creating user client:", e);
                 // Fall back to returning an error
                  return new Response(JSON.stringify({ error: 'Internal Server Error creating client' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                 });
             }
        }
        
        // Pass the chosen client (admin or user-specific) to the handler
        return handler(req, handlerDeps); 
    });

    console.log("Notifications GET function started via serve.");
} 