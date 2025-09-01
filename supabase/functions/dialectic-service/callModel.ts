// deno-lint-ignore-file no-explicit-any
import { 
    UnifiedAIResponse,
  } from "./dialectic.interface.ts";
  // Removed unused import: createSupabaseAdminClient
  import type {
    ChatApiRequest,
    ChatHandlerSuccessResponse,
} from "../_shared/types.ts";
import { isTokenUsage } from "../_shared/utils/type_guards.ts";
import { CallModelDependencies } from "./dialectic.interface.ts";

  console.log("callModel function started");
  
  // Initialize Supabase admin client once
  // const supabaseAdmin = createSupabaseAdminClient(); // Removed as it's unused in this function and causes test issues
  

export async function callUnifiedAIModel(
    chatApiRequest: ChatApiRequest,
    authToken: string,        // User's JWT for calling /chat
    dependencies: CallModelDependencies = {},
  ): Promise<UnifiedAIResponse> {
    const { fetch = globalThis.fetch, isTest = false } = dependencies;
    console.log(`callUnifiedAIModel invoked for ai_providers.id (providerId): ${chatApiRequest.providerId}, chatId: ${chatApiRequest.chatId}`);
    const startTime = Date.now();
  
    // Note: callUnifiedAIModel is designed to handle interaction with a single AI model provider (via the /chat function)
    // for a single prompt. Functions that require generating responses from multiple AI models for a given stage
    // (e.g., generateContributions) are responsible for iterating through the selected models
    // (obtained from dialectic_session_models linked to the session) and calling callUnifiedAIModel individually for each one.
  
    try {
      // TODO: Determine the correct URL for invoking the /chat function.
      // It might be via supabaseClient.functions.invoke or a direct fetch to a known internal URL.
      // Using direct fetch for now as an example.
      const chatFunctionUrl = `${Deno.env.get("SUPABASE_INTERNAL_FUNCTIONS_URL") || Deno.env.get("SUPABASE_URL")}/functions/v1/chat`;
      
      console.log("Attempting to call /chat function at URL:", chatFunctionUrl);
      console.log("Request payload to /chat:", JSON.stringify(chatApiRequest, null, 2));
  
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      };

      if (isTest) {
        headers['X-Test-Mode'] = 'true';
      }
  
      const response = await fetch(chatFunctionUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(chatApiRequest),
      });
  
      const processingTimeMs = Date.now() - startTime;
  
      if (!response.ok) {
        let errorBodyText = "No error body from /chat.";
        try {
            errorBodyText = await response.text(); // Try to get more details
        } catch (_e) { /* ignore if reading body fails */ }
        
        console.error(`/chat function call failed with status ${response.status}:`, errorBodyText);
        return {
          content: null,
          error: `/chat function call failed: ${response.status} ${response.statusText}. Details: ${errorBodyText}`,
          errorCode: 'CHAT_API_CALL_FAILED',
          processingTimeMs,
        };
      }
  
      // Try to parse as JSON. If /chat returns non-JSON for success (e.g. empty string), handle it.
      let chatResponseData: ChatHandlerSuccessResponse;
      const responseText = await response.text(); // Read text first
      try {
          chatResponseData = JSON.parse(responseText); // Try to parse the text
      } catch (jsonParseError) {
          console.error("/chat function returned non-JSON response (after attempting to parse text):", jsonParseError);
          return {
              content: null,
              error: `/chat function returned non-JSON response. Status: ${response.status}. Body: ${responseText}`,
              errorCode: 'RESPONSE_PARSING_ERROR', // Aligning with test expectation if this block is hit
              processingTimeMs,
          };
      }
      
      const chatResponse: ChatHandlerSuccessResponse = chatResponseData ; // Cast after parsing
      
      console.log("/chat function response:", JSON.stringify(chatResponse, null, 2));
      
      // The ChatHandlerSuccessResponse type itself does not have an 'error' field.
      // Errors from /chat should be indicated by a non-ok HTTP status, which is handled above.
      // If /chat sends a 200 OK but signifies a logical error within its JSON payload
      // (outside the ChatHandlerSuccessResponse structure), that would need a different handling strategy.
      // For now, assuming a 200 OK with valid JSON parse to ChatHandlerSuccessResponse means success.
  
      if (!chatResponse.assistantMessage) {
          console.error("/chat function response missing assistantMessage:", chatResponse);
          return {
              content: null,
              error: "/chat function response did not include an assistantMessage.",
              errorCode: 'CHAT_API_INVALID_RESPONSE',
              processingTimeMs,
              rawProviderResponse: chatResponse.assistantMessage,
          };
      }
      
      const assistantMessage = chatResponse.assistantMessage;
      const tokenUsage = assistantMessage.token_usage;

      if (!isTokenUsage(tokenUsage)) {
        // If tokenUsage is not valid, we can't proceed with token-related data.
        // Return a successful response but with null token info and a warning in the error field.
        return {
            content: assistantMessage.content,
            error: "Successfully received content, but token usage data was invalid or missing.",
            errorCode: 'INVALID_TOKEN_USAGE_DATA',
            processingTimeMs,
            contentType: "text/markdown", // Default content type
            rawProviderResponse: assistantMessage,
        };
      }

      return {
        content: assistantMessage.content,
        error: null,
        inputTokens: tokenUsage.prompt_tokens,
        outputTokens: tokenUsage.completion_tokens,
        tokenUsage: tokenUsage,
        processingTimeMs,
        contentType: "text/markdown", // Default content type
        rawProviderResponse: assistantMessage,
        finish_reason: chatResponse.finish_reason,
      };
  
    } catch (e) {
      const processingTimeMs = Date.now() - startTime;
      console.error("Error invoking /chat function:", e);
      return {
        content: null,
        error: `Failed to invoke /chat function: ${e instanceof Error ? e.message : String(e)}`,
        errorCode: 'NETWORK_OR_UNHANDLED_ERROR',
        processingTimeMs,
      };
    }
  }
  // --- End AI Model Interaction Utilities ---
  