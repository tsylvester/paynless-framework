import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4';
import { Notification } from "../_shared/types.ts"; // Import Notification from shared
import { corsHeaders } from '../_shared/cors-headers.ts'; // Assuming this utility exists

console.log("Notifications GET/PUT/POST function initializing (top-level).");

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

// Helper function for authentication
async function authenticateUser(client: SupabaseClient): Promise<{ user: User | null; errorResponse: Response | null }> {
    try {
        const { data: userData, error: authError } = await client.auth.getUser();
        if (authError || !userData?.user) {
            console.error('Authentication failed:', authError);
            return { user: null, errorResponse: new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message ?? 'Invalid client context'}` }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }) };
        }
        console.log(`Authenticated user: ${userData.user.id}`);
        return { user: userData.user, errorResponse: null };
    } catch (err) {
        console.error('Unexpected error during authentication:', err);
        return { user: null, errorResponse: new Response(JSON.stringify({ error: 'Internal Server Error during authentication' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }) };
    }
}

// Define the handler function (exported)
export async function handler(req: Request, deps: NotificationsDeps): Promise<Response> {
    console.log(`Request received: ${req.method} ${req.url}`);
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(segment => segment !== '');

    // 1. Handle CORS preflight requests first
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        return new Response('ok', { headers: corsHeaders });
    }

    // 2. Check for allowed methods *before* authentication
    if (!['GET', 'PUT', 'POST'].includes(req.method)) {
        console.warn(`Method not allowed: ${req.method}`);
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 3. Authenticate (only for GET, PUT, POST)
    const { user, errorResponse: authErrorResponse } = await authenticateUser(deps.supabaseClient);
    if (authErrorResponse) {
        return authErrorResponse;
    }
    if (!user) { 
         return new Response(JSON.stringify({ error: 'Unauthorized: User not found after auth check' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 4. Routing based on Method and Path (now assumes authenticated user)
    try {
        // --- Handle GET /notifications ---
        if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'notifications') {
            console.log(`Fetching notifications for user: ${user.id}`);
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
        }

        // --- Handle PUT /notifications/:id ---
        else if (req.method === 'PUT' && pathSegments.length === 2 && pathSegments[0] === 'notifications') {
            const notificationId = pathSegments[1];
            console.log(`Attempting to mark notification ${notificationId} as read for user ${user.id}`);

            // Basic validation (could add UUID check)
            if (!notificationId) {
                 return new Response(JSON.stringify({ error: 'Missing notification ID' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const { error: updateError } = await deps.supabaseClient
                .from('notifications')
                .update({ read: true })
                .match({ id: notificationId, user_id: user.id }); // Match both ID and user_id for security

            if (updateError) {
                // Differentiate between not found and other DB errors if possible
                // Supabase might return a specific error code/message for RLS violations or 0 rows affected
                 console.error(`Database error marking notification ${notificationId} as read:`, updateError);
                 // Let's assume generic 500 for now, could refine if needed
                 if (updateError.code === 'PGRST116') { // Example: Check for specific PostgREST error for not found/zero rows
                    return new Response(JSON.stringify({ error: 'Notification not found or not owned by user' }), {
                        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                 }
                 return new Response(JSON.stringify({ error: `Database error: ${updateError.message}` }), {
                     status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                 });
            }

            // If no error, assume success (even if 0 rows were updated, the state is now read=true for that ID/user)
            // Returning 204 No Content is standard for successful PUT/DELETE with no body
             console.log(`Successfully marked notification ${notificationId} as read.`);
             return new Response(null, { status: 204, headers: corsHeaders });
        }

        // --- Handle POST /notifications/mark-all-read ---
        else if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[0] === 'notifications' && pathSegments[1] === 'mark-all-read') {
            console.log(`Attempting to mark all notifications as read for user ${user.id}`);

            const { error: updateError } = await deps.supabaseClient
                .from('notifications')
                .update({ read: true })
                .match({ user_id: user.id, read: false }); // Only update unread ones for this user

            if (updateError) {
                 console.error(`Database error marking all notifications as read:`, updateError);
                 return new Response(JSON.stringify({ error: `Database error: ${updateError.message}` }), {
                     status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                 });
            }

            // Success, even if 0 rows were affected (means none were unread)
            console.log(`Successfully marked all notifications as read for user ${user.id}.`);
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // --- Handle Unmatched Routes (for valid methods) ---
        else {
            console.warn(`Path not handled for method ${req.method}: ${url.pathname}`);
            return new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

    } catch (error) {
        console.error('Unexpected server error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
}

// --- Default Dependencies & Serve (Only run when executed directly) ---
if (import.meta.main) {
    console.log("Running Notifications GET/PUT/POST function directly (import.meta.main).");

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
        getEnvVarLocal('SUPABASE_SERVICE_ROLE_KEY'), 
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

    serve(async (req) => {
        const authHeader = req.headers.get('Authorization');
        let clientToUse = defaultSupabaseClient; 
        let handlerDeps = defaultDeps;

        if (authHeader && authHeader.startsWith('Bearer ')) {
             console.log("Direct run: Auth header detected, creating user-context client.");
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
                 const { data: checkData, error: checkError } = await userClient.auth.getUser();
                 if (checkError || !checkData.user) {
                    console.error("Direct run: Auth header token invalid:", checkError);
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
                  return new Response(JSON.stringify({ error: 'Internal Server Error creating client' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                 });
             }
        }
        
        return handler(req, handlerDeps); 
    });

    console.log("Notifications GET/PUT/POST function started via serve.");
} 