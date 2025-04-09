import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders as defaultCorsHeaders } from '../_shared/cors-headers.ts'
import type { ChatMessage } from '../../../packages/types/src/ai.types.ts';

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
}

// Create default dependencies using actual implementations
const defaultDeps: ChatHandlerDeps = {
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
};

// --- Main Handler Logic ---

export async function mainHandler(req: Request, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  // Use injected deps
  const {
    createSupabaseClient: createSupabaseClientDep,
    getEnv: getEnvDep,
    fetch: fetchDep,
    corsHeaders: corsHeadersDep,
    createJsonResponse,
    createErrorResponse,
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

    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       return createErrorResponse('Missing Authorization header', 401);
    }

    // Use injected createSupabaseClient and getEnv
    const supabaseUrl = getEnvDep('SUPABASE_URL') ?? '';
    const supabaseAnonKey = getEnvDep('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
        return createErrorResponse("Server configuration error.", 500);
    }

    const supabaseClient = createSupabaseClientDep(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // --- Verify user authentication ---
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return createErrorResponse('Invalid authentication credentials', 401);
    }
    const userId = user.id; // Store user ID for later use
    console.log('Authenticated user:', userId);

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

    // --- Fetch Chat History (if chatId provided) ---
    let chatHistory: { role: string; content: string }[] = [];
    let currentChatId = requestBody.chatId; // Use existing chatId or will be updated if new

    if (currentChatId) {
        console.log(`Fetching history for chat ID: ${currentChatId}`);
        const { data: messages, error: historyError } = await supabaseClient
            .from('chat_messages')
            .select('role, content')
            // Ensure we only select messages from the specified chat
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
            chatHistory = messages.map(msg => ({ role: msg.role, content: msg.content }));
            console.log(`Fetched ${chatHistory.length} messages for history.`);
        }
    } else {
        console.log('No chatId provided, starting new chat.');
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

    // --- Save Messages to Database ---
    let finalChatId = currentChatId;

    // Create a new chat entry if no chatId was provided or history fetch failed
    if (!finalChatId) {
        // Generate title from the first part of the user's message
        const potentialTitle = requestBody.message.substring(0, 100); // Use first 100 chars

        const { data: newChatData, error: newChatError } = await supabaseClient
            .from('chats')
            .insert({ 
                user_id: userId,
                title: potentialTitle // Add the generated title here
            }) 
            .select('id')
            .single();

        if (newChatError || !newChatData) {
            console.error('Error creating new chat entry:', newChatError);
            // Use injected createErrorResponse
            return createErrorResponse('Failed to initiate new chat session.', 500);
        }
        finalChatId = newChatData.id;
        console.log(`Created new chat with ID: ${finalChatId}`);
    }

    // Prepare messages for insertion
    const userMessageRecord = {
        chat_id: finalChatId,
        user_id: userId,
        role: 'user',
        content: requestBody.message,
        ai_provider_id: requestBody.providerId,
        system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
    };
    const assistantMessageRecord = {
        chat_id: finalChatId,
        user_id: null, // Assistant messages aren't directly linked to a user sender
        role: 'assistant',
        content: assistantMessageContent,
        ai_provider_id: requestBody.providerId,
        system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
        token_usage: tokenUsage,
    };

    // Insert both messages
    const { data: insertedMessages, error: messagesInsertError } = await supabaseClient
        .from('chat_messages')
        .insert([userMessageRecord, assistantMessageRecord])
        .select('*'); // Select all columns of the inserted rows

    if (messagesInsertError) {
        console.error('Error saving chat messages:', messagesInsertError);
        // Use injected createErrorResponse
        return createErrorResponse('Failed to save chat messages.', 500);
    }

    const finalAssistantMessage = insertedMessages?.find(msg => msg.role === 'assistant');

    if (!finalAssistantMessage) {
        console.error('Assistant message not found in insert result:', insertedMessages);
        // Use injected createErrorResponse
        return createErrorResponse('Failed to retrieve saved assistant message.', 500);
    }
     // Log the message we're about to return
    console.log('Final assistant message to return:', JSON.stringify(finalAssistantMessage, null, 2));
    console.log('Explicitly checking finalAssistantMessage.id:', finalAssistantMessage?.id);

    // --- Return Success Response ---
    return createJsonResponse(finalAssistantMessage, 200);

  } catch (error) {
    console.error('Unhandled error in chat handler:', error);
    // Safely access error message
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return createErrorResponse(errorMessage, 500);
  }
}

// --- Serve Function ---
// Use the mainHandler with default dependencies when serving
serve((req) => mainHandler(req, defaultDeps))
// console.log(`Function "chat" up and running!`) // Moved log to top

console.log(`Function "chat" up and running!`) 