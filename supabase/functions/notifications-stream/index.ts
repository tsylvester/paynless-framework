import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@^2.43.4';
// Import Realtime types
import type { RealtimePostgresChangesPayload } from 'npm:@supabase/supabase-js@^2.43.4';
import type { Notification } from '../../../packages/types/src/notification.types.ts'; // Adjust path if needed

// Define types for dependencies, mirroring the test structure
// Note: In a real scenario, the SupabaseClient type might be used directly
// if the dependency is just the client itself.
interface NotificationsStreamDeps {
    supabaseClient: SupabaseClient;
    // Add other deps like environment variables if needed
}

// Error response helper
function createErrorResponse(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
        status: status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// --- NEW: Extracted function to handle payload --- 
export function handleRealtimePayload(
    payload: RealtimePostgresChangesPayload<Notification>,
    controller: ReadableStreamDefaultController<string> // Controller expects string chunks
) {
    console.log('Handling Realtime notification payload:', payload);
    if (payload.eventType === 'INSERT' && payload.new) {
        try {
            // Format the SSE message
            const sseMessage = `data: ${JSON.stringify(payload.new)}\n\n`;
            controller.enqueue(sseMessage);
            console.log('Enqueued SSE message.');
        } catch (e) {
            console.error('Error formatting or enqueuing SSE message:', e);
            // Optional: controller.error(e) to signal stream error?
        }
    } else {
        console.warn('Received non-INSERT payload or missing data:', payload);
    }
}

// --- Main Handler Logic ---
export async function handler(req: Request, deps: NotificationsStreamDeps): Promise<Response> {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return createErrorResponse('Missing authentication token', 401);
    }

    let user: User | null = null;
    try {
        const { data, error } = await deps.supabaseClient.auth.getUser(token);
        if (error || !data?.user) {
            console.error('Auth error or no user:', error);
            return createErrorResponse('Invalid authentication token', 401);
        }
        user = data.user;
        console.log(`SSE connection authenticated for user: ${user.id}`);
    } catch (err) {
        console.error('Unexpected error during authentication:', err);
        return createErrorResponse('Authentication failed', 500);
    }

    // --- If authenticated, setup SSE stream ---
    if (!user) { // Should be caught above, but belts and suspenders
        return createErrorResponse('User not found after authentication', 500);
    }

    const userId = user.id; // Get userId after successful auth

    // --- Declare channel variable here to be accessible in start and cancel ---
    let channel: ReturnType<SupabaseClient['channel']> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            console.log(`SSE stream started for user: ${userId}`);
            const channelName = `notifications-user-${userId}`;
            console.log(`Attempting to create channel: ${channelName}`);
            // --- Assign the created channel to the outer variable ---
            channel = deps.supabaseClient.channel(channelName);

            // Use the extracted handler function in the callback
            channel.on<Notification>(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => handleRealtimePayload(payload, controller) // Pass controller via closure
            );
            
            channel.subscribe((status, err) => {
                 // Add basic subscription status logging
                 if (status === 'SUBSCRIBED') {
                     console.log(`Realtime channel "${channelName}" subscribed successfully.`);
                 } else if (err) {
                     console.error(`Realtime channel "${channelName}" subscription error:`, err);
                     // Optional: Close stream on critical subscribe error?
                     // controller.error(err);
                     // controller.close();
                 } else {
                      console.log(`Realtime channel "${channelName}" status: ${status}`);
                 }
            });

            // Keep connection open, send initial confirmation
            controller.enqueue(': Stream opened\n\n'); 
        },
        cancel() {
            console.log(`SSE stream cancelled for user: ${userId}`);
            // --- Use the channel instance stored in the outer scope --- 
            if (channel) {
                console.log(`Removing Supabase Realtime channel: ${channel.topic}`);
                deps.supabaseClient.removeChannel(channel)
                    .then((status) => {
                        console.log(`Channel ${channel?.topic} removal status: ${status}`);
                    })
                    .catch((error) => {
                        console.error(`Error removing channel ${channel?.topic}:`, error);
                    });
                channel = null; // Clear reference
            } else {
                console.warn('Attempted to cancel stream but channel was not initialized.');
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            // Optional: Add CORS headers if needed, though typically direct function URLs might not need them
            // 'Access-Control-Allow-Origin': '*',
        },
    });
}

// --- Default Dependencies & Serve (Only run when executed directly) ---
if (import.meta.main) {
    // Helper to get required environment variables
    function getEnvVar(name: string): string {
        const value = Deno.env.get(name);
        if (!value) {
            throw new Error(`Environment variable ${name} is not set.`);
        }
        return value;
    }

    // Create the default Supabase client instance using environment variables
    const defaultSupabaseClient = createClient(
        getEnvVar('SUPABASE_URL'),
        getEnvVar('SUPABASE_SERVICE_ROLE_KEY'), // Use service role for backend operations
        {
            auth: {
                // Important for server-side usage
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        }
    );

    // Define the default dependencies object
    const defaultDeps: NotificationsStreamDeps = {
        supabaseClient: defaultSupabaseClient,
    };

    // Start the server, passing requests to the handler with default dependencies
    serve((req) => handler(req, defaultDeps));

    console.log(`Notifications stream function up and running!`);
} 