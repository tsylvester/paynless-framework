// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
// Removed commented Deno serve import
import { createClient, type SupabaseClient, type GoTrueClient } from 'npm:@supabase/supabase-js';
// Import shared response/error handlers instead of defaultCorsHeaders directly
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse, // Assuming createSuccessResponse is the equivalent JSON response creator
} from '../_shared/cors-headers.ts'; 
// Import getEnv from Deno namespace directly when needed, avoid putting in deps if not necessary for mocking
// Import AI service factory and necessary types
// REMOVE: import { GetAiProviderAdapter } from '../_shared/types.ts';
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts'; // Import the actual factory function
// Use import type for type-only imports
import type { 
    ChatApiRequest, 
    ChatHandlerDeps, 
    AdapterResponsePayload 
} from '../_shared/types.ts'; 
import type { Database } from "../types_db.ts"; // Import Database type for DB objects
import { verifyApiKey } from '../_shared/auth.ts';
import { logger } from '../_shared/logger.ts'; // Import the logger instance
// ADD BACK serve import
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'; 

// Define derived DB types needed locally
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

// Define expected request body structure
interface ChatRequest {
  message: string;
  providerId: string; // uuid
  promptId: string;   // uuid or '__none__'
  chatId?: string;   // uuid, optional for new chats
  organizationId?: string; // uuid, optional for org chats
  rewindFromMessageId?: string; // uuid, optional for rewinding a chat thread
}

// --- Read Env Vars (Top Level - ONLY for non-secrets needed by DI/boot) ---
// These will be '' when run under `supabase functions serve` due to SUPABASE_ prefix skipping
const SUPABASE_URL_ENV = Deno.env.get('SUPABASE_URL') ?? ''; 
const SUPABASE_ANON_KEY_ENV = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

if (!SUPABASE_URL_ENV || !SUPABASE_ANON_KEY_ENV) {
    // This console.error will likely trigger during `supabase functions serve` 
    // but the function might still work if createClient picks up implicit env vars.
    console.warn("Initial Deno.env.get for SUPABASE_URL or SUPABASE_ANON_KEY returned empty. This is expected for `supabase functions serve`.");
}

// --- Dependency Injection Setup ---

// REMOVE local interface ChatHandlerDeps and comments like "REMOVE supabaseUrl..."
// The interface is now imported.

// Create default dependencies - REMOVE API key params and supabaseUrl/AnonKey params
// Ensure this function correctly returns the imported ChatHandlerDeps type.
export function getDefaultDeps(): ChatHandlerDeps { // This should now use the imported ChatHandlerDeps
  return {
    createSupabaseClient: createClient, 
    fetch: fetch,
    handleCorsPreflightRequest: handleCorsPreflightRequest,
    createJsonResponse: createSuccessResponse,
    createErrorResponse: createErrorResponse,
    getAiProviderAdapter: getAiProviderAdapter, // Use the imported factory function
    verifyApiKey: verifyApiKey,
    logger: logger, // Use the imported logger instance
  }
}

// --- Main Handler Logic ---

export async function mainHandler(req: Request, deps?: ChatHandlerDeps): Promise<Response> {
  // Initialize deps if not provided
  const resolvedDeps = deps || getDefaultDeps();

  // Use injected deps 
  const {
    createSupabaseClient: createSupabaseClientDep, // Reverted: Use DI again
    handleCorsPreflightRequest, 
    createJsonResponse,
    createErrorResponse,
    getAiProviderAdapter: getAiProviderAdapterDep, 
  } = resolvedDeps; 

  // Handle CORS preflight requests using the injected handler
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Read non-SUPABASE_ prefixed env vars for URL and Key
  // These should be set in .env.local for `supabase functions serve`
  const projectUrlForLocalServe = Deno.env.get('MY_PROJECT_URL');
  const projectAnonKeyForLocalServe = Deno.env.get('MY_PROJECT_ANON_KEY');

  if (req.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405, req);
  }

  try {
    const requestBody: ChatRequest = await req.json();
    console.log('Received chat request:', requestBody);

    // --- Input Validation ---
    if (!requestBody.message || typeof requestBody.message !== 'string' || requestBody.message.trim() === '') {
      return createErrorResponse('Missing or invalid "message" in request body', 400, req);
    }
    if (!requestBody.providerId || typeof requestBody.providerId !== 'string') {
       return createErrorResponse('Missing or invalid "providerId" in request body', 400, req);
    }
    // Allow '__none__' for promptId
    if (!requestBody.promptId || typeof requestBody.promptId !== 'string') {
      return createErrorResponse('Missing or invalid "promptId" in request body', 400, req);
    }
    if (requestBody.chatId && typeof requestBody.chatId !== 'string') {
      return createErrorResponse('Invalid "chatId" in request body', 400, req);
    }
    if (requestBody.organizationId && typeof requestBody.organizationId !== 'string') {
      return createErrorResponse('Invalid "organizationId" in request body', 400, req);
    }
    if (requestBody.rewindFromMessageId && typeof requestBody.rewindFromMessageId !== 'string') {
      return createErrorResponse('Invalid "rewindFromMessageId" in request body', 400, req);
    }
    if (requestBody.rewindFromMessageId && !requestBody.chatId) {
      return createErrorResponse('"chatId" is required when "rewindFromMessageId" is provided', 400, req);
    }

    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       console.log("Chat function called without Authorization header. Returning AUTH_REQUIRED signal.")
       return createJsonResponse(
           { error: "Authentication required", code: "AUTH_REQUIRED" },
           401, // Set status to 401 Unauthorized
           req
       );
    }

    // Initialize client: 
    // For `functions serve`, use MY_PROJECT_... vars if available.
    // For `deno test` or deployed, createSupabaseClientDep('', '', ...) will allow implicit env pickup.
    let supabaseClient: SupabaseClient<Database>;
    if (projectUrlForLocalServe && projectAnonKeyForLocalServe && Deno.env.get('SUPA_ENV') === 'local') {
      console.log('Using MY_PROJECT_URL and MY_PROJECT_ANON_KEY for local Supabase client.');
      supabaseClient = createSupabaseClientDep(
        projectUrlForLocalServe,
        projectAnonKeyForLocalServe,
        { global: { headers: { Authorization: authHeader } } }
      );
    } else {
      console.log('Using default createSupabaseClientDep (empty strings for URL/Key for implicit env pickup).');
      supabaseClient = createSupabaseClientDep(
        '', // Rely on runtime or test environment to provide these if not using MY_PROJECT_... vars
        '',
        { global: { headers: { Authorization: authHeader } } }
      );
    }

    // --- Verify user authentication ---
    const authClient = supabaseClient.auth as GoTrueClient; // Cast to GoTrueClient
    const { data: { user }, error: userError } = await authClient.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return createErrorResponse('Invalid authentication credentials', 401, req);
    }
    const userId = user.id; // Store user ID for later use
    console.log('Authenticated user:', userId);

    // --- Fetch System Prompt and AI Provider details (including provider string) ---
    let systemPromptText: string | null = null; // Initialize as null
    if (requestBody.promptId !== '__none__') {
      const { data: promptData, error: promptError } = await supabaseClient
        .from('system_prompts')
        .select('prompt_text')
        .eq('id', requestBody.promptId)
        .eq('is_active', true)
        .single();
      if (promptError || !promptData) {
          console.error('Error fetching system prompt:', promptError);
          return createErrorResponse(promptError?.message || 'System prompt not found or inactive.', 400, req);
      }
      systemPromptText = promptData.prompt_text;
      console.log('Fetched system prompt text.');
    }

    // Fetch provider api_identifier AND provider string
    const { data: providerData, error: providerError } = await supabaseClient
      .from('ai_providers')
      .select('api_identifier, provider') // Fetch provider string
      .eq('id', requestBody.providerId) // Use the UUID from the request
      .eq('is_active', true)
      .single();

    if (providerError || !providerData) {
        console.error('Error fetching provider details:', providerError);
        return createErrorResponse(providerError?.message || 'AI provider not found or inactive.', 400, req);
    }
    const apiIdentifier = providerData.api_identifier;
    const provider = providerData.provider; // Get the provider string (e.g., 'openai')
    if (!provider) {
        console.error(`Provider string missing for ai_providers record ID: ${requestBody.providerId}`);
        return createErrorResponse('AI provider configuration error on server [missing provider string].', 500, req);
    }
    console.log(`Fetched provider details: provider=${provider}, api_identifier=${apiIdentifier}`);

    // --- Get Adapter from Factory ---
    const adapter = getAiProviderAdapterDep(provider);
    if (!adapter) {
        console.error(`No adapter found for provider: ${provider}`);
        return createErrorResponse(`Unsupported AI provider: ${provider}`, 400, req);
    }

    // --- Securely Get API Key based on Provider (READING DIRECTLY) ---
    let apiKeyEnvVarName: string;
    let apiKey: string | undefined;
    
    switch (provider.toLowerCase()) { 
        case 'openai': 
            apiKeyEnvVarName = 'OPENAI_API_KEY'; 
            apiKey = Deno.env.get(apiKeyEnvVarName); // Read directly
            break;
        case 'anthropic': 
            apiKeyEnvVarName = 'ANTHROPIC_API_KEY'; 
            apiKey = Deno.env.get(apiKeyEnvVarName); // Read directly
            break;
        case 'google': 
            apiKeyEnvVarName = 'GOOGLE_API_KEY'; 
            apiKey = Deno.env.get(apiKeyEnvVarName); // Read directly
            break;
        default:
            console.error(`Unknown provider string encountered for API key lookup: ${provider}`);
            return createErrorResponse(`Internal server error: Unknown AI provider configuration for provider ${provider}.`, 500, req);
    }
    
    // Check if the key was found, BUT bypass check if running locally
    const isLocalEnv = Deno.env.get('SUPA_ENV') === 'local';
    if (!apiKey && !isLocalEnv) {
        console.error(`API key not found in environment variable: ${apiKeyEnvVarName} for provider ${provider} (direct read). Not running in local env.`);
        return createErrorResponse('AI provider configuration error on server [key missing - direct read].', 500, req);
    } else if (!apiKey && isLocalEnv) {
        console.warn(`API key ${apiKeyEnvVarName} not found, but proceeding because SUPA_ENV=local. AI call will likely fail.`);
        // Allow execution to continue, but the key will be undefined
    } else {
        console.log(`Retrieved API key directly from env var: ${apiKeyEnvVarName}`);
    }

    // --- Fetch Chat History (if chatId provided) ---
    let chatHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
    let currentChatId = requestBody.chatId;

    // Perform rewind logic first if rewindFromMessageId is provided
    if (requestBody.rewindFromMessageId && currentChatId) {
        logger.info(`Rewind requested for chat ${currentChatId} from message ${requestBody.rewindFromMessageId}`);

        // 1. Fetch the 'created_at' of the message to rewind from
        const { data: rewindPointMessage, error: rewindPointError } = await supabaseClient
            .from('chat_messages')
            .select('created_at')
            .eq('id', requestBody.rewindFromMessageId)
            .eq('chat_id', currentChatId) // Ensure the message belongs to the chat
            .single();

        if (rewindPointError || !rewindPointMessage) {
            logger.error(`Error fetching rewind point message ${requestBody.rewindFromMessageId} in chat ${currentChatId}: ${rewindPointError?.message}`);
            return createErrorResponse('Rewind point message not found or not accessible.', 404, req);
        }
        const rewindTimestamp = rewindPointMessage.created_at;

        console.log(`DEBUG Rewind PRE-SELECT: chatId = ${currentChatId}, rewindTimestamp = ${rewindTimestamp}`); // Log vars before SELECT
        // DEBUGGING: Select messages that *should* be updated
        const { data: messagesToDeactivate, error: selectToDeactivateError } = await supabaseClient
            .from('chat_messages')
            .select('id, content, created_at, is_active_in_thread')
            .eq('chat_id', currentChatId)
            .gt('created_at', rewindTimestamp);

        if (selectToDeactivateError) {
            console.error(`DEBUG Rewind: Error selecting messages for deactivation check: ${selectToDeactivateError.message}`);
        } else {
            console.log(`DEBUG Rewind: Messages that meet deactivation criteria (chatId: ${currentChatId}, created_at > ${rewindTimestamp}):`);
            (messagesToDeactivate || []).forEach(msg => {
                console.log(`  - ID: ${msg.id}, Content: "${msg.content}", CreatedAt: ${msg.created_at}, Active: ${msg.is_active_in_thread}`);
            });
            console.log(`DEBUG Rewind: Found ${messagesToDeactivate?.length || 0} messages to potentially deactivate.`);
        }
        // END DEBUGGING

        console.log(`DEBUG Rewind PRE-UPDATE: chatId = ${currentChatId}, rewindTimestamp = ${rewindTimestamp}`); // Log vars before UPDATE
        // 2. Update subsequent messages to be inactive
        const { error: deactivateError, count: actualDeactivatedRowCount } = await supabaseClient
            .from('chat_messages')
            .update({ is_active_in_thread: false }, { count: 'exact' })
            .eq('chat_id', currentChatId)
            .gt('created_at', rewindTimestamp);

        // Updated log to show the actual count and any error
        console.log(`Deactivation UPDATE executed. ChatID: ${currentChatId}, AfterTimestamp: ${rewindTimestamp}, Error: ${JSON.stringify(deactivateError)}, Rows affected: ${actualDeactivatedRowCount}`);

        if (deactivateError) {
            console.error('Error deactivating messages during rewind:', deactivateError);
            return createErrorResponse('Rewind failed: could not update messages.', 500, req);
        }
        // The currentChatId remains the same for the rewind operation.
    }

    // Fetch active chat history if chatId is present
    // This will now correctly fetch pruned history in case of a rewind, as messages would have been updated.
    if (currentChatId) {
        logger.info(`Fetching active history for chat ID: ${currentChatId}`);
        const { data: messages, error: historyError } = await supabaseClient
            .from('chat_messages')
            .select('role, content')
            .eq('chat_id', currentChatId)
            .eq('is_active_in_thread', true) // <<< ALWAYS FETCH ACTIVE MESSAGES
            .order('created_at', { ascending: true });

        if (historyError) {
            logger.error(`Error fetching active chat history for chat ${currentChatId}: ${historyError.message}`);
            // If history fetch fails after a rewind op, this is problematic.
            // If it's not a rewind, and it's a new chat an RLS error on select might happen if chat doesn't exist yet. But we create chat later.
            // If it is an existing chat, RLS should allow if user has access.
            // For now, if it fails, we will proceed as if no history, which means AI gets less context.
            // This is different from the original logic of currentChatId = undefined; 
            // because in rewind, we KNOW the chat exists.
        } else if (messages) {
            chatHistory = messages.map((msg: Pick<ChatMessageRow, 'role' | 'content'>) => ({
                role: msg.role as ('user' | 'assistant' | 'system'), 
                content: msg.content 
            }));
            logger.info(`Fetched ${chatHistory.length} active messages for history for chat ${currentChatId}.`);
        }
    } else {
        logger.info('No chatId provided, starting new chat.');
    }

    // --- Construct Adapter Payload & Call Adapter ---
    try {
        // Prepare history, adding system prompt if present
        const messagesForAdapter = [
            ...(systemPromptText ? [{ role: 'system' as const, content: systemPromptText }] : []),
            ...chatHistory,
        ];

        const adapterRequest: ChatApiRequest = {
            message: requestBody.message,
            providerId: requestBody.providerId, // Pass the DB record ID
            promptId: requestBody.promptId,
            chatId: currentChatId,
            messages: messagesForAdapter, // Pass the prepared history + system prompt
        };

        console.log(`Calling ${provider} adapter sendMessage with apiIdentifier: ${apiIdentifier}`);
        // Call the adapter's sendMessage method
        // Pass empty string for apiKey if it's undefined (only possible in local env)
        const assistantResponse: AdapterResponsePayload = await adapter.sendMessage(
            adapterRequest,
            apiIdentifier, 
            apiKey || '' // Pass empty string if undefined
        );
        console.log('Received response from adapter.');

        // --- Save Messages to Database ---
        // 1. Ensure Chat Exists (Create if new, get existing ID)
        if (!currentChatId) {
            // Create a new chat entry
            const firstUserMessage = requestBody.message.substring(0, 50); // Simple title
            const { data: newChat, error: newChatError } = await supabaseClient
                .from('chats')
                // Do NOT prepend with 'Chat: ' or 'Chat - ' or anything like that.
                .insert({ 
                    user_id: userId, 
                    title: `${firstUserMessage}...`,
                    organization_id: requestBody.organizationId || null, // Add organization_id
                    system_prompt_id: requestBody.promptId === '__none__' ? null : requestBody.promptId // Add system_prompt_id
                })
                .select('id')
                .single();
            if (newChatError || !newChat) {
                console.error('Error creating new chat:', newChatError);
                return createErrorResponse('Failed to create new chat session.', 500, req);
            }
            currentChatId = newChat.id;
            console.log(`Created new chat with ID: ${currentChatId}`);
        }

        // Ensure we have a valid chat ID before proceeding
        if (!currentChatId) {
          console.error("Chat ID is missing before attempting to save messages.");
          return createErrorResponse("Invalid chat session state.", 500, req);
        }

        // 4. Save user message (using ChatMessageInsert)
        const userMessageRecord: ChatMessageInsert = {
          chat_id: currentChatId, // Now guaranteed non-null
          user_id: userId,
          role: 'user',
          content: requestBody.message,
          ai_provider_id: requestBody.providerId,
          system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
        };

        // 5. Save assistant message (using ChatMessageInsert)
        const assistantMessageRecord: ChatMessageInsert = {
          chat_id: currentChatId, // Now guaranteed non-null
          user_id: null, 
          role: 'assistant',
          content: assistantResponse.content,
          ai_provider_id: assistantResponse.ai_provider_id, 
          system_prompt_id: assistantResponse.system_prompt_id,
          token_usage: assistantResponse.token_usage, 
        };

        // Insert both messages (Remove explicit cast, rely on TS inference now)
        const { data: savedMessages, error: saveError } = await supabaseClient
          .from('chat_messages')
          .insert([userMessageRecord, assistantMessageRecord])
          .select();

        if (saveError) {
            console.error(`Error saving messages for chat ${currentChatId}:`, saveError);
            return createErrorResponse('Failed to save messages to database.', 500, req);
        }
        
        // Find the saved assistant message (should conform to ChatMessageRow)
        const finalAssistantMessage: ChatMessageRow | undefined = savedMessages?.find((m: ChatMessageRow) => m.role === 'assistant'); // Add type to m

        if (!finalAssistantMessage) {
            console.error("Failed to retrieve saved assistant message from DB", { currentChatId, savedMessages });
            return createErrorResponse("Failed to save or retrieve chat response.", 500, req);
        }

        // Return only the saved assistant message (as ChatMessageRow)
        // Ensure createJsonResponse handles the ChatMessageRow type correctly
        return createJsonResponse({ message: finalAssistantMessage }, 200, req);

    } catch (error) {
        // Catch errors from adapter.sendMessage or DB operations
        console.error('Error during AI interaction or saving:', error);
        // Check if error is an Error instance before accessing message
        const errorMessage = error instanceof Error ? error.message : 'An internal error occurred during chat processing.';
        return createErrorResponse(errorMessage, 500, req);
    }

  } catch (err) {
    // Catch errors from initial request parsing, auth, setup
    console.error('Unhandled error in chat handler:', err);
    // Check if err is an Error instance before accessing message
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return createErrorResponse(errorMessage, 500, req);
  }
}

// --- Serve Function ---
// Use the mainHandler. Default dependencies will now be constructed 
// using the top-level environment variables read when the module loaded.
serve((req: Request) => mainHandler(req)) // Add type to req

console.log(`Function "chat" up and running!`) 

// ADD THIS LINE TO RE-EXPORT THE TYPE
export type { ChatHandlerDeps }; 