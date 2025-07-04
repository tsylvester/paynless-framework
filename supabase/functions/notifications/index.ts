import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4';
import type { Database } from "../types_db.ts"; // Import Database type
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse 
} from '../_shared/cors-headers.ts'; // Assuming this utility exists

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
async function authenticateUser(req: Request, client: SupabaseClient): Promise<{ user: User | null; errorResponse: Response | null }> {
    try {
        const { data: userData, error: authError } = await client.auth.getUser();
        if (authError || !userData?.user) {
            console.error('Authentication failed:', authError);
            // Use shared error response
            return { user: null, errorResponse: createErrorResponse(
                `Unauthorized: ${authError?.message ?? 'Invalid client context'}`,
                401,
                req,
                authError
            ) };
        }
        console.log(`Authenticated user: ${userData.user.id}`);
        return { user: userData.user, errorResponse: null };
    } catch (err) {
        console.error('Unexpected error during authentication:', err);
        // Use shared error response
        return { user: null, errorResponse: createErrorResponse(
            'Internal Server Error during authentication',
            500,
            req,
            err
        ) };
    }
}

// Use derived type for Notification
type NotificationPayload = Database['public']['Tables']['notifications']['Insert']; 
// Type for the row data if needed elsewhere
// export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

// Define the handler function (exported)
export async function handler(req: Request, deps: NotificationsDeps): Promise<Response> {
    console.log(`Request received: ${req.method} ${req.url}`);
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(segment => segment !== '');

    // 1. Handle CORS preflight requests first
    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) {
        console.log('Handling OPTIONS preflight request via handler');
        return corsResponse;
    }

    // 2. Check for allowed methods *before* authentication
    if (!['GET', 'PUT', 'POST'].includes(req.method)) {
        console.warn(`Method not allowed: ${req.method}`);
        // Use shared error response
        return createErrorResponse('Method Not Allowed', 405, req);
    }

    // 3. Authenticate (only for GET, PUT, POST)
    const { user, errorResponse: authErrorResponse } = await authenticateUser(req, deps.supabaseClient);
    if (authErrorResponse) {
        return authErrorResponse;
    }
    if (!user) { 
         // Use shared error response
         return createErrorResponse('Unauthorized: User not found after auth check', 401, req);
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
                // Use shared error response
                return createErrorResponse(`Database error: ${dbError.message}`, 500, req, dbError);
            }
            console.log(`Successfully fetched ${notifications?.length ?? 0} notifications.`);
            // Use shared success response
            return createSuccessResponse(notifications ?? [], 200, req);
        }

        // --- Handle PUT /notifications/:id ---
        else if (req.method === 'PUT' && pathSegments.length === 2 && pathSegments[0] === 'notifications') {
            const notificationId = pathSegments[1];
            console.log(`Attempting to mark notification ${notificationId} as read for user ${user.id}`);

            // Basic validation (could add UUID check)
            if (!notificationId) {
                 // Use shared error response
                 return createErrorResponse('Missing notification ID', 400, req);
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
                    // Use shared error response
                    return createErrorResponse('Notification not found or not owned by user', 404, req, updateError);
                 }
                 // Use shared error response
                 return createErrorResponse(`Database error: ${updateError.message}`, 500, req, updateError);
            }

            // If no error, assume success (even if 0 rows were updated, the state is now read=true for that ID/user)
            // Returning 204 No Content is standard for successful PUT/DELETE with no body
             console.log(`Successfully marked notification ${notificationId} as read.`);
             // Create 204 response directly (no shared helper for this)
             return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } }); // Keep basic CORS for 204
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
                 // Use shared error response
                 return createErrorResponse(`Database error: ${updateError.message}`, 500, req, updateError);
            }

            // Success, even if 0 rows were affected (means none were unread)
            console.log(`Successfully marked all notifications as read for user ${user.id}.`);
            // Create 204 response directly
            return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } }); // Keep basic CORS for 204
        }

        // --- Handle Unmatched Routes (for valid methods) ---
        else {
            console.warn(`Path not handled for method ${req.method}: ${url.pathname}`);
            // Use shared error response
            return createErrorResponse('Not Found', 404, req);
        }

    } catch (error) {
        console.error('Unexpected server error:', error);
        // Use shared error response
        return createErrorResponse('Internal Server Error', 500, req, error);
    }
}

// --- Default Dependencies & Serve (Only run when executed directly) ---
if (import.meta.main) {
    console.log("Running Notifications GET/PUT/POST function directly (import.meta.main).");

    const defaultSupabaseClient = createClient(
        getEnvVar('SUPABASE_URL'),
        getEnvVar('SUPABASE_SERVICE_ROLE_KEY'), 
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
                     getEnvVar('SUPABASE_URL'),
                     getEnvVar('SUPABASE_ANON_KEY'),
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
                    // Use shared error response (req is available here)
                    return createErrorResponse(
                        `Unauthorized: ${checkError?.message ?? 'Invalid token'}`,
                        401,
                        req,
                        checkError
                    );
                 } else {
                     console.log("Direct run: User client created successfully.");
                     clientToUse = userClient;
                     handlerDeps = { supabaseClient: clientToUse };
                 }
             } catch (e) {
                 console.error("Direct run: Error creating user client:", e);
                  // Use shared error response (req is available here)
                  return createErrorResponse(
                      'Internal Server Error creating client',
                      500,
                      req,
                      e
                  );
             }
        }
        
        return handler(req, handlerDeps); 
    });

    console.log("Notifications GET/PUT/POST function started via serve.");
} 