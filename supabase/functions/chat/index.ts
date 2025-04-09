import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors-headers.ts'

// Define expected request body structure
interface ChatRequest {
  message: string;
  providerId: string; // uuid
  promptId: string;   // uuid
  chatId?: string;   // uuid, optional for new chats
}

console.log(`Function "chat" up and running!`)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  try {
    const requestBody: ChatRequest = await req.json()
    console.log('Received chat request:', requestBody)

    // --- Input Validation ---
    if (!requestBody.message || typeof requestBody.message !== 'string' || requestBody.message.trim() === '') {
      throw new Error('Missing or invalid "message" in request body')
    }
    if (!requestBody.providerId || typeof requestBody.providerId !== 'string') {
      throw new Error('Missing or invalid "providerId" in request body')
    }
    if (!requestBody.promptId || typeof requestBody.promptId !== 'string') {
      throw new Error('Missing or invalid "promptId" in request body')
    }
    if (requestBody.chatId && typeof requestBody.chatId !== 'string') {
      throw new Error('Invalid "chatId" in request body')
    }

    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
       return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 401,
       })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // --- Verify user authentication ---
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(JSON.stringify({ error: 'Invalid authentication credentials' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 401,
      })
    }
    const userId = user.id // Store user ID for later use
    console.log('Authenticated user:', userId)

    // --- Fetch System Prompt and AI Provider details ---
    // Fetch system prompt text
    const { data: promptData, error: promptError } = await supabaseClient
      .from('system_prompts')
      .select('prompt_text')
      .eq('id', requestBody.promptId)
      .eq('is_active', true) // Ensure prompt is active
      .single() // Expect only one prompt

    if (promptError || !promptData) {
        console.error('Error fetching system prompt:', promptError)
        return new Response(JSON.stringify({ error: promptError?.message || 'System prompt not found or inactive.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400, // Bad request, as the provided promptId is invalid/inactive
        })
    }
    const systemPromptText = promptData.prompt_text
    console.log('Fetched system prompt text.')

    // Fetch provider api_identifier
    const { data: providerData, error: providerError } = await supabaseClient
      .from('ai_providers')
      .select('api_identifier')
      .eq('id', requestBody.providerId)
      .eq('is_active', true) // Ensure provider is active
      .single()

    if (providerError || !providerData) {
        console.error('Error fetching provider details:', providerError)
        return new Response(JSON.stringify({ error: providerError?.message || 'AI provider not found or inactive.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400, // Bad request, as the provided providerId is invalid/inactive
        })
    }
    const apiIdentifier = providerData.api_identifier
    console.log(`Fetched provider api_identifier: ${apiIdentifier}`)

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
        console.error(`Unsupported api_identifier: ${apiIdentifier}`)
        return new Response(JSON.stringify({ error: `Unsupported AI provider: ${apiIdentifier}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }

    const apiKey = Deno.env.get(apiKeyEnvVarName)
    if (!apiKey) {
        console.error(`API key not found in environment variable: ${apiKeyEnvVarName}`)
        // Do NOT expose the variable name in the client-facing error
        return new Response(JSON.stringify({ error: 'AI provider configuration error on server.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500, // Internal Server Error
        })
    }
    console.log(`Retrieved API key from env var: ${apiKeyEnvVarName}`)

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
    let aiApiResponse: any; // Use a more specific type based on expected AI responses

    try {
        const messagesPayload = [
            { role: 'system', content: systemPromptText },
            ...chatHistory, // Add historical messages
            { role: 'user', content: requestBody.message },
        ];

        console.log(`Sending ${messagesPayload.length} messages to AI (${apiIdentifier}).`);
        // console.log('Payload:', JSON.stringify(messagesPayload)); // Debug: careful logging PII

        if (apiIdentifier.startsWith('openai-')) {
            // --- OpenAI API Call --- 
            const openaiUrl = 'https://api.openai.com/v1/chat/completions';
            const openaiPayload = {
                model: apiIdentifier.replace('openai-', ''), // e.g., 'gpt-4o'
                messages: messagesPayload,
                // Add other parameters like temperature, max_tokens as needed
            };

            const response = await fetch(openaiUrl, {
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
            // --- Anthropic API Call (Placeholder) ---
            // const anthropicUrl = 'https://api.anthropic.com/v1/messages'; 
            // Construct Anthropic specific payload (different format)
            // const anthropicPayload = { ... };
            // const response = await fetch(anthropicUrl, { ... headers: {'x-api-key': apiKey, ...} ... });
            console.error('Anthropic API call not yet implemented.');
            throw new Error('Anthropic provider not yet supported.');
            // aiApiResponse = await response.json();

        } else {
            // Should have been caught earlier by the API key lookup, but as a safeguard:
            throw new Error(`Unsupported api_identifier for API call: ${apiIdentifier}`);
        }

    } catch (error) {
        console.error('Error during AI API call:', error);
        return new Response(JSON.stringify({ error: `Failed to get response from AI provider: ${error.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 502, // Bad Gateway - error communicating with upstream server
        });
    }

    // --- Process AI Response ---
    let assistantMessageContent: string;
    let tokenUsage: object | null = null; // Store usage if available

    try {
        if (apiIdentifier.startsWith('openai-') && aiApiResponse?.choices?.[0]?.message?.content) {
            assistantMessageContent = aiApiResponse.choices[0].message.content.trim();
            if (aiApiResponse.usage) {
                tokenUsage = aiApiResponse.usage; // e.g., { prompt_tokens: ..., completion_tokens: ..., total_tokens: ... }
            }
            console.log('Extracted content and usage from OpenAI response.');
        } else if (apiIdentifier.startsWith('anthropic-')) {
            // TODO: Add logic to extract content from Anthropic response
            // Example (structure might differ based on actual API response):
            // if (aiApiResponse?.content?.[0]?.text) { 
            //    assistantMessageContent = aiApiResponse.content[0].text.trim();
            //    tokenUsage = aiApiResponse.usage; // Check Anthropic usage structure
            // } else { throw new Error('Invalid Anthropic response structure'); }
            assistantMessageContent = "Anthropic response processing not implemented."; // Placeholder
            console.warn('Anthropic response processing needs implementation.');
        } else {
            console.error('Failed to extract content from AI response:', aiApiResponse);
            throw new Error('Could not parse content from AI provider response.');
        }

        if (!assistantMessageContent) {
             throw new Error('Extracted empty message content from AI response.');
        }

    } catch (error) {
        console.error('Error processing AI response:', error);
        return new Response(JSON.stringify({ error: `Failed to process AI provider response: ${error.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500, 
        });
    }

    // --- Save Messages to Database ---
    let finalAssistantMessage: any; // To store the object we return

    try {
        // 1. Create a new chat entry if necessary
        if (!currentChatId) {
            // Generate a simple title from the first message
            const newChatTitle = requestBody.message.substring(0, 50) + (requestBody.message.length > 50 ? '...' : '');
            
            const { data: newChat, error: chatInsertError } = await supabaseClient
                .from('chats')
                .insert({ user_id: userId, title: newChatTitle })
                .select('id') // Select the id of the newly created chat
                .single();

            if (chatInsertError || !newChat?.id) {
                console.error('Error creating new chat entry:', chatInsertError);
                throw new Error('Failed to initiate new chat session.');
            }
            currentChatId = newChat.id;
            console.log(`Created new chat with ID: ${currentChatId}`);
        } else {
             // If it's an existing chat, update its updated_at timestamp
             // (The trigger on the table should handle this automatically, 
             // but we could explicitly update it here if needed, e.g., if adding a message didn't trigger it)
            //  await supabaseClient.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', currentChatId);
             console.log(`Adding messages to existing chat: ${currentChatId}`);
        }

        // 2. Prepare message records
        const userMessageRecord = {
            chat_id: currentChatId,
            user_id: userId,
            role: 'user',
            content: requestBody.message,
            // No provider/prompt info needed for user messages
        };

        const assistantMessageRecord = {
            chat_id: currentChatId,
            user_id: null, // Assistant message isn't directly from a user
            role: 'assistant',
            content: assistantMessageContent,
            ai_provider_id: requestBody.providerId,
            system_prompt_id: requestBody.promptId,
            token_usage: tokenUsage,
        };

        // 3. Insert both messages
        // Note: Could potentially use RLS check on insert for added safety
        const { error: messagesInsertError, data: insertedMessages } = await supabaseClient
            .from('chat_messages')
            .insert([userMessageRecord, assistantMessageRecord])
            .select(); // Select the inserted records to potentially return the assistant one

        if (messagesInsertError || !insertedMessages || insertedMessages.length !== 2) {
            console.error('Error saving chat messages:', messagesInsertError);
            // Attempt to fetch the chat again to see if *anything* was saved?
            throw new Error('Failed to save conversation messages.');
        }

        // Find the assistant message from the inserted records to return
        finalAssistantMessage = insertedMessages.find(msg => msg.role === 'assistant');
        console.log(`Successfully saved user and assistant messages for chat ${currentChatId}`);

    } catch (error) {
        console.error('Error during database save operation:', error);
        return new Response(JSON.stringify({ error: `Failed to save chat: ${error.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500, 
        });
    }

    // --- Return AI Response --- 
    // Return the saved assistant message object
    return new Response(JSON.stringify({ message: finalAssistantMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) { // Outer catch for setup errors (parsing, auth, initial fetches)
    console.error('Chat function error:', error)
    return new Response(JSON.stringify({ error: error.message || 'An internal error occurred' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: (error instanceof SyntaxError || error.message.includes('Missing or invalid')) ? 400 : 500,
    })
  }
}) 