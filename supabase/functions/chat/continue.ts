import type {
    AdapterResponsePayload,
    ChatApiRequest,
    ILogger,
    TokenUsage,
  } from "../_shared/types.ts";
  import type { AiProviderAdapter } from "../_shared/types.ts";
  
  const MAX_CONTINUATIONS = 4; // Max 4 additional calls, for a total of 5
  
  /**
   * Handles the logic for repeatedly calling an AI provider until the response is complete.
   * This function assumes the initialRequest has already been fully prepared with the correct
   * message history. It focuses purely on the continuation loop.
   *
   * @param adapter The initialized AI provider adapter.
   * @param initialApiRequest The fully prepared initial request for the AI.
   * @param providerApiIdentifier The API identifier for the model.
   * @param apiKey The API key for the provider.
   * @param logger A logger instance.
   * @returns A promise that resolves to the combined and final assistant message payload.
   */
  export async function handleContinuationLoop(
    adapter: AiProviderAdapter,
    initialApiRequest: ChatApiRequest,
    providerApiIdentifier: string,
    apiKey: string,
    logger: ILogger,
  ): Promise<AdapterResponsePayload> {
    let accumulatedContent = "";
    const accumulatedTokenUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  
    const currentRequest = { ...initialApiRequest };
    // !FIX: Ensure messages is an array to prevent 'possibly undefined' errors.
    if (!currentRequest.messages) {
      currentRequest.messages = [];
    }
  
    let continuationCount = 0;
    let lastResponse: AdapterResponsePayload | null = null;
  
    while (continuationCount <= MAX_CONTINUATIONS) {
      logger.info(`Continuation loop #${continuationCount}. Making AI call...`, { historyLength: currentRequest.messages.length });
  
      const response = await adapter.sendMessage(
        currentRequest,
        providerApiIdentifier,
        apiKey,
      );
  
      // Correctly accumulate token usage from each call.
      const token_usage = response.token_usage as TokenUsage | null;
      if (token_usage) {
        accumulatedTokenUsage.prompt_tokens += token_usage.prompt_tokens || 0;
        accumulatedTokenUsage.completion_tokens += token_usage.completion_tokens || 0;
      }
  
      accumulatedContent += response.content;
      lastResponse = response;
  
      const finishReason = token_usage?.finish_reason;
      logger.info(`Continuation loop #${continuationCount}: Finish reason is '${finishReason}'`);
  
      if (finishReason !== "length" || continuationCount >= MAX_CONTINUATIONS) {
        break; 
      }
  
      continuationCount++;
      
      // Add the assistant's partial response to the history for the next call.
      currentRequest.messages.push({ role: "assistant", content: response.content });
    }
  
    if (!lastResponse) {
      throw new Error("AI provider did not return a response in the continuation loop.");
    }
  
    // Sum up the final token counts.
    accumulatedTokenUsage.total_tokens = accumulatedTokenUsage.prompt_tokens + accumulatedTokenUsage.completion_tokens;
  
    // Return a new payload with the combined results.
    return {
      ...lastResponse,
      content: accumulatedContent,
      token_usage: {
        ...accumulatedTokenUsage,
        finish_reason: "stop", // Force the final reason to be 'stop'.
      },
    };
  }
