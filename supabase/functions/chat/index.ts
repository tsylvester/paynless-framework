/// <reference lib="deno.unstable" />

// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve, type ConnInfo } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders as defaultCorsHeaders } from '../_shared/cors-headers.ts'
import type { ChatMessage } from '../../../packages/types/src/ai.types.ts';

// --- Rate Limiting Config ---
const ANON_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ANON_RATE_LIMIT_MAX_REQUESTS = 10; // Max requests per window per IP
const ANON_SECRET_HEADER = 'X-Paynless-Anon-Secret'; // Custom header name

// Define expected request body structure
interface ChatRequest {
  message: string;
  providerId: string; // uuid
  promptId: string;   // uuid or '__none__'
  chatId?: string;   // uuid, optional for new chats
}

// --- Dependency Injection Setup ---

// Define the interface for dependencies
export interface ChatHandlerDeps {
  createSupabaseClient: (url: string, key: string, options?: any) => SupabaseClient;
  getEnv: (key: string) => string | undefined;
  fetch: typeof fetch;
  corsHeaders: Record<string, string>;
  createJsonResponse: (data: unknown, status?: number, headers?: Record<string, string>) => Response;
  createErrorResponse: (message: string, status?: number, headers?: Record<string, string>) => Response;
  openKv: () => Promise<Deno.Kv>; // Add KV store access dependency
}

// Create default dependencies using actual implementations
// Export defaultDeps for testing purposes
export const defaultDeps: ChatHandlerDeps = {
  createSupabaseClient: createClient,
  getEnv: Deno.env.get,
  fetch: fetch,
  corsHeaders: defaultCorsHeaders,
  createJsonResponse: (data, status = 200, headers = {}) => {
    return new Response(JSON.stringify(data), {
      headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json', ...headers },
      status: status,
    });
  },
  createErrorResponse: (message, status = 500, headers = {}) => {
     return new Response(JSON.stringify({ error: message }), {
       headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json', ...headers },
       status: status,
     });
  },
  openKv: Deno.openKv, // Add default KV implementation
};

// --- Helper: Rate Limiter ---
async function checkRateLimit(
  ip: string,
  deps: { openKv: () => Promise<Deno.Kv>, createErrorResponse: ChatHandlerDeps['createErrorResponse'] }
): Promise<Response | null> {
  if (!ip) {
    console.warn("Rate limiting skipped: IP address unavailable.");
    return null; // Cannot rate limit without IP
  }
  const kv = await deps.openKv();
  const key = ["chat_rate_limit", ip];
  const now = Date.now();
  const expiryMs = ANON_RATE_LIMIT_WINDOW_MS;

  // Use atomic operation for compare-and-set behavior
  let finalRes: Deno.KvCommitResult | Deno.KvCommitError | null = null;
  let attempt = 0;
  const maxAttempts = 5; // Prevent infinite loops on contention

  while ((finalRes === null || !finalRes.ok) && attempt < maxAttempts) {
    attempt++;
    const currentEntry = await kv.get<{ count: number; expiresAt: number }>(key);
    const currentRecord = currentEntry.value;
    const currentVersionstamp = currentEntry.versionstamp; // Can be null if entry doesn't exist

    let newCount = 1;
    let newExpiresAt = now + expiryMs;

    if (currentRecord && currentRecord.expiresAt > now && currentVersionstamp !== null) {
      // Record exists, is not expired, and has a versionstamp
      if (currentRecord.count >= ANON_RATE_LIMIT_MAX_REQUESTS) {
        console.log(`Rate limit exceeded for IP: ${ip}`);
        const retryAfter = Math.ceil((currentRecord.expiresAt - now) / 1000);
        return deps.createErrorResponse('Rate limit exceeded', 429, { 'Retry-After': String(retryAfter) });
      }
      // Increment count, keep existing expiry
      newCount = currentRecord.count + 1;
      newExpiresAt = currentRecord.expiresAt;
    } else {
      // Record doesn't exist, is expired, or has no versionstamp; start new window
      console.log(`Starting new rate limit window for IP: ${ip}`);
      newCount = 1;
      newExpiresAt = now + expiryMs;
    }

    const newRecord = { count: newCount, expiresAt: newExpiresAt };

    // Reset the atomic operation for the new attempt
    const currentAtomicOp = kv.atomic();
    // Check ensures that the record hasn't changed since we read it
    currentAtomicOp.check({ key, versionstamp: currentVersionstamp });
    // Set the new value with expiry
    currentAtomicOp.set(key, newRecord, { expireIn: expiryMs });
    // Sum commits all mutations in the operation
    currentAtomicOp.sum(["global_anon_chat_count"], 1n); // Optional: Track total anon requests globally

    finalRes = await currentAtomicOp.commit();

    if (finalRes && !finalRes.ok) {
      console.warn(`Rate limit atomic commit failed for IP ${ip} (attempt ${attempt}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 50 * attempt)); // Exponential backoff delay
    } else if (finalRes?.ok) {
       console.log(`Rate limit check passed for IP: ${ip}, count: ${newCount}`);
       return null; // Success, not rate limited
    }
  }

   if (!finalRes?.ok) {
        console.error(`Rate limit check failed for IP ${ip} after ${maxAttempts} attempts. Allowing request.`);
        // Decide on fallback behavior: fail open (allow) or closed (block)?
        // Failing open here for resilience, but log it prominently.
        return null; // Or return createErrorResponse('Rate limit check failed', 500);
   }

    // Should only be reached if successful commit happened inside the loop
    return null;
}

// --- Main Handler Logic ---
// Modify signature to accept ConnInfo
export async function mainHandler(req: Request, connInfo: ConnInfo, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  // Use injected deps
  const {
    createSupabaseClient: createSupabaseClientDep,
    getEnv: getEnvDep,
    fetch: fetchDep,
    corsHeaders: corsHeadersDep,
    createJsonResponse,
    createErrorResponse,
    openKv: openKvDep, // Get KV dep
  } = deps;

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    // Status 204 must have null body
    return new Response(null, { headers: corsHeadersDep, status: 204 });
  }

  if (req.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const requestBody: ChatRequest = await req.json();
    console.log('Received chat request:', requestBody);

    // --- Input Validation ---
    if (!requestBody.message || typeof requestBody.message !== 'string' || requestBody.message.trim() === '') {
      return createErrorResponse('Missing or invalid "message" in request body', 400);
    }
    if (!requestBody.providerId || typeof requestBody.providerId !== 'string') {
       return createErrorResponse('Missing or invalid "providerId" in request body', 400);
    }
    // Allow '__none__' for promptId
    if (!requestBody.promptId || typeof requestBody.promptId !== 'string') {
      return createErrorResponse('Missing or invalid "promptId" in request body', 400);
    }
    if (requestBody.chatId && typeof requestBody.chatId !== 'string') {
      return createErrorResponse('Invalid "chatId" in request body', 400);
    }

    // --- Auth, Rate Limiting, and Client Initialization ---
    let userId: string | null = null;
    let isAuthenticated = false;
    let isAnonymous = false;
    let supabaseClient: SupabaseClient;

    const supabaseUrl = getEnvDep('SUPABASE_URL') ?? '';
    const supabaseAnonKey = getEnvDep('SUPABASE_ANON_KEY') ?? '';
    const expectedAnonSecret = getEnvDep('ANON_FUNCTION_SECRET'); // User-provided secret

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
        return createErrorResponse("Server configuration error.", 500);
    }
    // Check for ANON_FUNCTION_SECRET existence early if needed
    // Note: It's only strictly required if the anon path is taken

    const authHeader = req.headers.get('Authorization');
    const anonSecretHeader = req.headers.get(ANON_SECRET_HEADER);

    if (authHeader) {
      // 1. Authenticated user flow (JWT)
      console.log("Attempting authentication via Authorization header.");
      supabaseClient = createSupabaseClientDep(
        supabaseUrl,
        supabaseAnonKey,
        { global: { headers: { Authorization: authHeader } } } // Pass user's JWT
      );

      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user) {
        console.error('Auth error:', userError?.message || 'No user found for JWT');
        // Don't allow fallback to anonymous if JWT is provided but invalid
        return createErrorResponse('Invalid authentication credentials', 401);
      }
      userId = user.id;
      isAuthenticated = true;
      console.log('Authenticated user:', userId);

    } else if (anonSecretHeader) {
      // 2. Anonymous user flow (Secret Header)
      console.log("Attempting access via anonymous secret header.");

      // Check if the secret is configured on the server
      if (!expectedAnonSecret) {
         console.error("Anonymous access attempted, but ANON_FUNCTION_SECRET is not configured.");
         return createErrorResponse("Anonymous access is not configured correctly.", 500);
      }

      if (anonSecretHeader !== expectedAnonSecret) {
          console.warn("Invalid anonymous secret provided.");
          return createErrorResponse('Unauthorized', 401); // Or 403 Forbidden
      }

      // Secret is valid, proceed with rate limiting
      // Get IP address from connInfo safely
      let ipAddress: string | undefined;
      try {
          // Deno.NetAddr is the expected type for TCP connections (like HTTP)
          const remoteAddr = connInfo.remoteAddr as Deno.NetAddr;
          ipAddress = remoteAddr?.hostname;
      } catch (err) {
          console.error("Error accessing IP address from connInfo:", err);
          // Fallback or error depending on policy
          return createErrorResponse("Could not process request due to network info error.", 500);
      }

       if (!ipAddress) {
         console.error("Could not determine client IP address for rate limiting.");
         return createErrorResponse("Could not process request.", 500);
       }
       console.log(`Anonymous request from IP: ${ipAddress}`);

      // Check rate limit
      const rateLimitResponse = await checkRateLimit(ipAddress, { openKv: openKvDep, createErrorResponse });
      if (rateLimitResponse) {
        return rateLimitResponse; // Return 429 if limit exceeded
      }

      // Initialize client with Anon key (no user context needed for subsequent reads if RLS allows)
      // If writes are needed later for anon users, this might need service_role key.
      supabaseClient = createSupabaseClientDep(supabaseUrl, supabaseAnonKey);
      isAnonymous = true;
      console.log('Anonymous access granted.');

    } else {
      // 3. Neither valid JWT nor anonymous secret provided
      console.log("Unauthorized: Missing Authorization header and anonymous secret header.");
      return createErrorResponse('Unauthorized', 401);
    }

    // Request processing continues only if authenticated or anonymous (and not rate limited)
    try {
      // --- Fetch System Prompt and AI Provider details ---
      let systemPromptText: string;
      // Handle the case where no prompt is selected
      if (requestBody.promptId === '__none__') {
        systemPromptText = ''; // Use empty string if no prompt
        console.log('No system prompt selected (__none__), using empty prompt text.');
      } else {
        // Fetch system prompt text only if a specific promptId is provided
        const { data: promptData, error: promptError } = await supabaseClient
          .from('system_prompts')
          .select('prompt_text')
          .eq('id', requestBody.promptId)
          .eq('is_active', true) // Ensure prompt is active
          .single(); // Expect only one prompt

        if (promptError || !promptData) {
            console.error('Error fetching system prompt:', promptError);
            // Use injected createErrorResponse
            return createErrorResponse(promptError?.message || 'System prompt not found or inactive.', 400);
        }
        systemPromptText = promptData.prompt_text;
        console.log('Fetched system prompt text.');
      }

      // Fetch provider api_identifier
      const { data: providerData, error: providerError } = await supabaseClient
        .from('ai_providers')
        .select('api_identifier')
        .eq('id', requestBody.providerId)
        .eq('is_active', true) // Ensure provider is active
        .single();

      if (providerError || !providerData) {
          console.error('Error fetching provider details:', providerError);
          // Use injected createErrorResponse
          return createErrorResponse(providerError?.message || 'AI provider not found or inactive.', 400);
      }
      const apiIdentifier = providerData.api_identifier;
      console.log(`Fetched provider api_identifier: ${apiIdentifier}`);

      // --- Securely Get API Key from Environment Variables ---
      let apiKeyEnvVarName: string | undefined;
      switch (apiIdentifier) {
        case 'openai-gpt-4o': // Example identifier
          apiKeyEnvVarName = 'OPENAI_API_KEY';
          break;
        case 'openai-gpt-3.5-turbo': // Example identifier
          apiKeyEnvVarName = 'OPENAI_API_KEY'; // Might use the same key
          break;
        case 'anthropic-claude-3-sonnet': // Example identifier
          apiKeyEnvVarName = 'ANTHROPIC_API_KEY';
          break;
        // Add cases for other supported api_identifiers
        default:
          console.error(`Unsupported api_identifier: ${apiIdentifier}`);
          // Use injected createErrorResponse
          return createErrorResponse(`Unsupported AI provider: ${apiIdentifier}`, 400);
      }

      // Use injected getEnv
      const apiKey = getEnvDep(apiKeyEnvVarName);
      if (!apiKey) {
          console.error(`API key not found in environment variable: ${apiKeyEnvVarName}`);
          // Do NOT expose the variable name in the client-facing error
          // Use injected createErrorResponse
          return createErrorResponse('AI provider configuration error on server.', 500);
      }
      console.log(`Retrieved API key from env var: ${apiKeyEnvVarName}`);

      // --- Fetch Chat History (Only for Authenticated Users) ---
      let chatHistory: { role: string; content: string }[] = [];
      let currentChatId = requestBody.chatId; // Use existing chatId or will be updated if new

      if (isAuthenticated && currentChatId) { // <-- Only fetch if authenticated and chatId provided
          // Ensure client is the user-authenticated one
          console.log(`Fetching history for authenticated user ${userId}, chat ID: ${currentChatId}`);
          const { data: messages, error: historyError } = await supabaseClient // Use the client initialized in the auth section
              .from('chat_messages')
              .select('role, content')
              // RLS policy should ensure the user owns this chat implicitly
              .eq('chat_id', currentChatId)
              .order('created_at', { ascending: true });

          if (historyError) {
              console.error(`Error fetching chat history for chat ${currentChatId}:`, historyError);
              // Don't fail the whole request, maybe the chat ID was invalid but it's a new chat intent?
              // Or maybe RLS prevented access? Treat as if no history exists.
              // Consider if a stricter error response is needed here.
              currentChatId = undefined; // Treat as a new chat if history fetch fails
          } else if (messages) {
              // Map to the simple { role, content } format needed for AI context
              // Add explicit type for msg
              chatHistory = messages.map((msg: { role: string; content: string }) => ({ role: msg.role, content: msg.content }));
              console.log(`Fetched ${chatHistory.length} messages for history.`);
          }
      } else if (isAnonymous) {
          console.log('Skipping chat history fetch for anonymous user.');
          currentChatId = undefined; // Anonymous users always start a new "session" contextually
      } else if (isAuthenticated && !currentChatId) {
           console.log('Authenticated user starting new chat.');
      } else if (!isAuthenticated && currentChatId) {
          console.warn('Received chatId from non-authenticated user. Ignoring.');
          currentChatId = undefined;
      }

      // --- Construct AI Provider Payload & Call API ---
      let aiApiResponse: any;

      try {
          const messagesPayload = [
              // Conditionally add system prompt if it's not empty
              ...(systemPromptText ? [{ role: 'system', content: systemPromptText }] : []),
              ...chatHistory, // Add historical messages
              { role: 'user', content: requestBody.message },
          ].filter(msg => msg.content); // Ensure no empty messages are sent

          console.log(`Sending ${messagesPayload.length} messages to AI (${apiIdentifier}).`);
          // console.log('Payload:', JSON.stringify(messagesPayload)); // Debug: careful logging PII

          // Use injected fetch
          const fetchFn = fetchDep;

          if (apiIdentifier.startsWith('openai-')) {
              // --- OpenAI API Call ---
              const openaiUrl = 'https://api.openai.com/v1/chat/completions';
              const openaiPayload = {
                  model: apiIdentifier.replace('openai-', ''), // e.g., 'gpt-4o'
                  messages: messagesPayload,
                  // Add other parameters like temperature, max_tokens as needed
              };

              const response = await fetchFn(openaiUrl, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify(openaiPayload),
              });

              if (!response.ok) {
                  const errorBody = await response.text();
                  console.error(`OpenAI API error: ${response.status} ${response.statusText}`, errorBody);
                  throw new Error(`AI API request failed: ${response.statusText}`);
              }
              aiApiResponse = await response.json();
              console.log('Received response from OpenAI.');

          } else if (apiIdentifier.startsWith('anthropic-')) {
              // --- Anthropic API Call (Placeholder - Requires update) ---
              const anthropicUrl = 'https://api.anthropic.com/v1/messages';
               const anthropicPayload = {
                 model: apiIdentifier.replace('anthropic-', ''), // e.g., claude-3-opus-20240229
                 max_tokens: 1024, // Example max tokens
                 messages: messagesPayload, // Anthropic uses the same 'messages' structure
                 system: systemPromptText || undefined, // Anthropic uses a top-level 'system' parameter
               };
               messagesPayload.shift(); // Remove system prompt from messages if it exists for Anthropic

               const response = await fetchFn(anthropicUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01', // Required header
                  },
                  body: JSON.stringify(anthropicPayload),
               });

               if (!response.ok) {
                  const errorBody = await response.text();
                  console.error(`Anthropic API error: ${response.status} ${response.statusText}`, errorBody);
                  throw new Error(`AI API request failed: ${response.statusText}`);
               }
               aiApiResponse = await response.json();
               console.log('Received response from Anthropic.');
              // console.error('Anthropic API call not yet implemented.');
              // throw new Error('Anthropic provider not yet supported.');

          } else {
              // Should have been caught earlier by the API key lookup, but as a safeguard:
              throw new Error(`Unsupported api_identifier for API call: ${apiIdentifier}`);
          }

          // Yield to event loop after fetch completes
          await new Promise(resolve => setTimeout(resolve, 0));
          console.log("Yielded after fetch, before DB insert."); // Diagnostic log

      } catch (error) {
          console.error('Error during AI API call:', error);
          // Safely access error message
          const errorMessage = error instanceof Error ? error.message : 'Unknown AI API error';
          return createErrorResponse(`Failed to get response from AI provider: ${errorMessage}`, 502);
      }

      // --- Process AI Response ---
      let assistantMessageContent: string;
      let tokenUsage: object | null = null;

      try {
          if (apiIdentifier.startsWith('openai-') && aiApiResponse?.choices?.[0]?.message?.content) {
              assistantMessageContent = aiApiResponse.choices[0].message.content.trim();
              if (aiApiResponse.usage) {
                  tokenUsage = aiApiResponse.usage; // e.g., { prompt_tokens: ..., completion_tokens: ..., total_tokens: ... }
              }
              console.log('Extracted content and usage from OpenAI response.');
          } else if (apiIdentifier.startsWith('anthropic-') && aiApiResponse?.content?.[0]?.text) {
               assistantMessageContent = aiApiResponse.content[0].text.trim();
               if (aiApiResponse.usage) {
                  // Map Anthropic usage (input_tokens, output_tokens) to our schema if needed
                  tokenUsage = {
                      prompt_tokens: aiApiResponse.usage.input_tokens,
                      completion_tokens: aiApiResponse.usage.output_tokens,
                      total_tokens: aiApiResponse.usage.input_tokens + aiApiResponse.usage.output_tokens
                  };
               }
              console.log('Extracted content and usage from Anthropic response.');
          } else {
              console.error('Failed to extract assistant message content from AI response:', aiApiResponse);
              throw new Error('Invalid response structure from AI provider.');
          }

          if (!assistantMessageContent) {
               throw new Error('Empty message content received from AI provider.');
          }

      } catch (error) {
          console.error('Error processing AI response:', error);
          // Safely access error message
          const errorMessage = error instanceof Error ? error.message : 'Unknown error processing AI response';
          return createErrorResponse(`Error processing AI response: ${errorMessage}`, 500);
      }

      // --- Save messages to DB (Only for Authenticated Users) ---
      let savedUserMessage: ChatMessage | null = null;
      let savedAssistantMessage: ChatMessage | null = null;

      if (isAuthenticated && userId) { // <-- Only save if authenticated and we have a userId
          console.log(`Saving messages for authenticated user ${userId}.`);
          // Use the authenticated supabaseClient instance created earlier
          // It already has the user's JWT. RLS policies must allow the user to insert.

          // 1. Ensure Chat Exists or Create New One
          if (!currentChatId) {
              console.log("Creating new chat entry for authenticated user.");
              // Generate a user-friendly title, capped length
              const titlePrefix = requestBody.message.split('\n')[0]; // First line - Fixed split character
              // Ensure titlePrefix is treated as a string for substring
              const title = typeof titlePrefix === 'string' && titlePrefix.length > 50
                  ? titlePrefix.substring(0, 47) + '...'
                  : titlePrefix ?? 'New Chat'; // Provide fallback title

              const { data: newChat, error: chatInsertError } = await supabaseClient
                  .from('chats')
                  .insert({ user_id: userId, title: title })
                  .select('id')
                  .single();

              if (chatInsertError || !newChat) {
                  console.error('Error creating new chat:', chatInsertError?.message);
                  return createErrorResponse('Failed to create chat.', 500);
              }
              currentChatId = newChat.id;
              console.log(`Created new chat with ID: ${currentChatId}`);
          }

          // 2. Save User Message (Restore original logic)
          const userMessageRecord = {
              chat_id: currentChatId,
              user_id: userId, // Link to the authenticated user
              role: 'user',
              content: requestBody.message,
              ai_provider_id: requestBody.providerId,
              system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
              // Token usage is not available here, can be omitted or added later if calculated
          };
          const { data: userMsgData, error: userSaveError } = await supabaseClient
              .from('chat_messages')
              .insert(userMessageRecord)
              .select('*') // Select the complete message object
              .single(); // Expecting one row back

          if (userSaveError || !userMsgData) {
               console.error('Error saving user message:', userSaveError?.message);
               // Decide if we should still return the AI response or fail hard
               return createErrorResponse('Failed to save user message.', 500);
          }
          // Cast to expected ChatMessage type
          savedUserMessage = userMsgData as ChatMessage;
          console.log("Saved user message.");

          // 3. Save Assistant Message (Restore original logic)
          if (assistantMessageContent) {
               const assistantMessageRecord = {
                    chat_id: currentChatId,
                    user_id: null, // Assistant messages don't have a user_id
                    role: 'assistant',
                    content: assistantMessageContent ?? '', // Provide fallback if undefined
                    ai_provider_id: requestBody.providerId,
                    system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
                    // token_usage: tokenUsage, // Add if available from AI response
               };
              const { data: assistantMsgData, error: assistantSaveError } = await supabaseClient
                  .from('chat_messages')
                  .insert(assistantMessageRecord)
                  .select('*')
                  .single();

               if (assistantSaveError || !assistantMsgData) {
                    console.error('Error saving assistant message:', assistantSaveError?.message);
                    // Still return the response to the user, but log the error
                    console.warn("Failed to save assistant message, but proceeding with response.");
                    savedAssistantMessage = null;
               } else {
                   savedAssistantMessage = assistantMsgData as ChatMessage;
                   console.log("Saved assistant message.");
               }
           } else {
              // Handle case where AI produced no content (e.g., safety filters)
              console.warn("AI produced no content to save for assistant message.");
              // savedAssistantMessage remains null
           }

      } else if (isAnonymous) {
           console.log("Skipping message saving for anonymous user.");
           // Generate temporary IDs and structure if needed by the frontend response structure
           // The actual content comes from requestBody and aiResponseContent
           savedUserMessage = {
              id: crypto.randomUUID(), // Temporary ID for frontend state
              created_at: new Date().toISOString(),
              chat_id: '__anonymous__', // Placeholder identifier
              role: 'user',
              content: requestBody.message,
              ai_provider_id: requestBody.providerId, // Correct key
              system_prompt_id: requestBody.promptId === '__none__' ? null : requestBody.promptId, // Correct key
              // Add other required fields from ChatMessage with null/default values
              user_id: null,
              token_usage: null,
           };
           savedAssistantMessage = {
              id: crypto.randomUUID(), // Temporary ID
              created_at: new Date().toISOString(), // Or derive from response time
              chat_id: '__anonymous__',
              role: 'assistant',
              content: assistantMessageContent ?? '', // Ensure content is set, provide default
              ai_provider_id: requestBody.providerId, // Correct key
              system_prompt_id: requestBody.promptId === '__none__' ? null : requestBody.promptId, // Correct key
              // Add other required fields from ChatMessage with null/default values
              user_id: null,
              token_usage: null,
           };
      }

      // --- Return Response ---
      // Return the AI's response content, and potentially the saved message IDs/chat ID
      // Ensure response structure is consistent for both user types where possible
      return createJsonResponse({
          chatId: isAuthenticated ? currentChatId : null, // Only return valid saved chatId for authenticated users
          userMessage: savedUserMessage, // Include the saved (or temp) user message
          assistantMessage: savedAssistantMessage, // Include the saved (or temp) assistant message
      });

    } catch (error) {
      console.error('Unhandled error in chat handler:', error);
      // Safely access error message
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      return createErrorResponse(errorMessage, 500);
    }
  } catch (error) {
    console.error('Unhandled error in chat handler:', error);
    // Safely access error message
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return createErrorResponse(errorMessage, 500);
  }
}

// --- Serve Function ---
// Only run the server if this script is the main entry point
if (import.meta.main) {
  serve(async (req: Request, connInfo: ConnInfo) => { // Add connInfo parameter
      try {
          // Pass connInfo to the handler
          return await mainHandler(req, connInfo, defaultDeps);
      } catch (e) {
          // Catch any unexpected error during handler invocation itself
          console.error("Critical error in serve:", e);
          // Use defaultDeps directly for error response if handler failed early
          return defaultDeps.createErrorResponse("Internal Server Error", 500);
      }
  }, {
      // Add port configuration if needed, Supabase usually handles this
      // port: 8000,
      onListen({ hostname, port }) {
          console.log(`Chat function listening on http://${hostname}:${port}`);
      },
  });

  console.log(`Function "chat" up and running!`);
} 