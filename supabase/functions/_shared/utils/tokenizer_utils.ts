import type { AiModelExtendedConfig, TiktokenModelForRules } from "../types.ts";
import type { CountableChatPayload, CountTokensDeps } from "../types/tokenizer.types.ts";



/**
 * Counts the number of tokens in the full chat payload based on the provided model configuration.
 * Supports 'tiktoken', 'anthropic_tokenizer', 'google_gemini_tokenizer', and 'rough_char_count'.
 * For 'tiktoken', applies ChatML-specific token counting rules to the chat history (messages),
 * and also measures the other payload elements (systemInstruction, message, resourceDocuments)
 * via encoding length without introducing synthetic ChatML wrappers.
 *
 * @param payload Full CountableChatPayload containing systemInstruction, message, messages and resourceDocuments.
 * @param modelConfig The extended configuration for the AI model, including its tokenization strategy.
 * @returns The total number of tokens.
 * @throws Error if token counting cannot be performed for the given strategy or configuration.
 */
export function countTokens(
  deps: CountTokensDeps,
  payload: CountableChatPayload,
  modelConfig: AiModelExtendedConfig
): number {
  // Note: Avoid verbose logging and unused vars to satisfy lint rules.
  const { tokenization_strategy, api_identifier } = modelConfig;

  if (tokenization_strategy.type === "tiktoken") {
    if (!tokenization_strategy.tiktoken_encoding_name) {
      deps.logger.error(`[countTokens] Tiktoken strategy selected for "${api_identifier}" but 'tiktoken_encoding_name' is missing in tokenization_strategy.`);
      throw new Error(`Configuration error for ${api_identifier}: tiktoken_encoding_name is required for tiktoken strategy.`);
    }

    let encoding;
    const requestedEncodingName = tokenization_strategy.tiktoken_encoding_name;
    let encodingNameToUse = requestedEncodingName;
    try {
      encoding = deps.getEncoding(encodingNameToUse);
    } catch (e: unknown) {
      const typedError = e instanceof Error ? e : new Error(String(e));
      // If o200k_base is not available in the current js-tiktoken build, fall back to cl100k_base for counting only.
      if (requestedEncodingName === 'o200k_base') {
        deps.logger.warn(`[countTokens] Encoding 'o200k_base' unavailable in current tiktoken build. Falling back to 'cl100k_base' for estimation on model "${api_identifier}".`);
        try {
          encodingNameToUse = 'cl100k_base';
          encoding = deps.getEncoding('cl100k_base');
        } catch (e2: unknown) {
          const typedError2 = e2 instanceof Error ? e2 : new Error(String(e2));
          deps.logger.error(`[countTokens] Failed to get fallback encoding 'cl100k_base' for model "${api_identifier}". Error: ${typedError2.message}`);
          throw new Error(`Unsupported encoding name: ${requestedEncodingName}. Original error: ${typedError.message}`);
        }
      } else {
        deps.logger.error(`[countTokens] Failed to get encoding for encoding name "${requestedEncodingName}" (model "${api_identifier}"). Error: ${typedError.message}`);
        throw new Error(`Unsupported encoding name: ${requestedEncodingName}. Original error: ${typedError.message}`);
      }
    }

    let tokensPerMessage: number;
    let tokensPerName: number;

    // Determine ChatML rules: Use fallback from config, or infer from api_identifier.
    let ruleModelKey: TiktokenModelForRules | string = tokenization_strategy.tiktoken_model_name_for_rules_fallback || api_identifier;

    // Simplify rule key for startsWith checks (e.g. "openai-gpt-4" becomes "gpt-4")
    const simplifiedRuleModelKey = ruleModelKey.split('-').slice(1).join('-');

    if (simplifiedRuleModelKey.startsWith("gpt-4")) ruleModelKey = "gpt-4";
    else if (simplifiedRuleModelKey.startsWith("gpt-3.5-turbo")) ruleModelKey = "gpt-3.5-turbo";
    else if (simplifiedRuleModelKey.startsWith("gpt-4o")) ruleModelKey = "gpt-4o";
    // Add other families if needed, e.g., gpt-4-turbo might have specific variations

    if (ruleModelKey === "gpt-4o") {
        tokensPerMessage = 3;
        tokensPerName = 1;
    } else if (ruleModelKey === "gpt-4") {
      tokensPerMessage = 3;
      tokensPerName = 1;
    } else if (ruleModelKey === "gpt-3.5-turbo") {
      tokensPerMessage = 3;
      tokensPerName = 1;
      // No special handling for "gpt-3.5-turbo-0301" here, assume modern behavior
      // unless explicitly provided by tiktoken_model_name_for_rules_fallback.
      // If granular control for specific older snapshots is needed, 
      // 'tiktoken_model_name_for_rules_fallback' should be set to that exact snapshot name.
      if (tokenization_strategy.tiktoken_model_name_for_rules_fallback === 'gpt-3.5-turbo-0301') {
        tokensPerMessage = 4;
        tokensPerName = -1;
      }
    } else {
      // Fallback for cl100k_base or other encodings if no specific model rule is matched
      // This is a general assumption, might need refinement if other encodings have different ChatML structures.
      if (tokenization_strategy.tiktoken_encoding_name === "cl100k_base" || tokenization_strategy.tiktoken_encoding_name === "o200k_base") {
        deps.logger.warn(`[countTokens] Model "${api_identifier}" (encoding: ${tokenization_strategy.tiktoken_encoding_name}) did not match a specific ChatML rule set (gpt-4, gpt-3.5-turbo, gpt-4o). Applying default ChatML rules (3 tokensPerMessage, 1 tokensPerName).`);
        tokensPerMessage = 3;
        tokensPerName = 1;
      } else {
        // For other encodings like p50k_base, r50k_base (older models), ChatML rules are less standard.
        // Defaulting to treating them like gpt-3.5-turbo for token penalties, but this is a rough guess.
        // Consider throwing an error or requiring explicit rules_fallback for non-cl100k/o200k encodings.
        deps.logger.warn(`[countTokens] Model "${api_identifier}" (encoding: ${tokenization_strategy.tiktoken_encoding_name}) uses an encoding for which ChatML rules are not well-defined in this function. Applying gpt-3.5-turbo-like rules as a fallback.`);
        tokensPerMessage = 3; 
        tokensPerName = 1;
      }
    }
    
    const sysInstr = payload.systemInstruction ?? undefined;
    const topMessage = payload.message ?? undefined;
    const docs = payload.resourceDocuments ?? [];
    const history = payload.messages ?? [];

    let numTokens = 0;

    // Measure non-history payload parts using encoding length directly (no ChatML overhead)
    if (typeof sysInstr === 'string' && sysInstr.length > 0) {
      numTokens += encoding.encode(sysInstr).length;
    }
    if (typeof topMessage === 'string' && topMessage.length > 0) {
      numTokens += encoding.encode(topMessage).length;
    }
    for (const doc of docs) {
      if (doc && typeof doc.content === 'string') {
        numTokens += encoding.encode(doc.content).length;
      }
    }

    // Apply ChatML rules to the conversation history only
    for (const message of history) {
      numTokens += tokensPerMessage;
      if (message.role) {
        numTokens += encoding.encode(message.role).length;
      }
      if (message.content !== null && message.content !== undefined) {
        numTokens += encoding.encode(message.content).length;
      }
      if (message.name) {
        numTokens += encoding.encode(message.name).length;
        numTokens += tokensPerName;
      }
    }
    numTokens += 3; // Every reply is primed with <|start|>assistant<|message|>

    // encoding.free(); // js-tiktoken's getEncoding doesn't require manual free if not using WASM directly.
    return numTokens;

  } else if (tokenization_strategy.type === "anthropic_tokenizer") {
    // The official Anthropic tokenizer from the `@anthropic-ai/tokenizer` package.
    const parts: string[] = [];
    if (typeof payload.systemInstruction === 'string' && payload.systemInstruction.length > 0) {
      parts.push(payload.systemInstruction);
    }
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      parts.push(payload.message);
    }
    if (Array.isArray(payload.resourceDocuments)) {
      for (const d of payload.resourceDocuments) {
        if (d && typeof d.content === 'string') parts.push(d.content);
      }
    }
    if (Array.isArray(payload.messages)) {
      for (const m of payload.messages) {
        if (typeof m.content === 'string') parts.push(m.content);
      }
    }
    return deps.countTokensAnthropic(parts.join("\n"));

  } else if (tokenization_strategy.type === "google_gemini_tokenizer") {
    let totalChars = 0;
    // systemInstruction and top-level message
    if (typeof payload.systemInstruction === 'string') totalChars += payload.systemInstruction.length;
    if (typeof payload.message === 'string') totalChars += payload.message.length;
    // resourceDocuments
    if (Array.isArray(payload.resourceDocuments)) {
      for (const d of payload.resourceDocuments) {
        if (d && typeof d.content === 'string') totalChars += d.content.length;
      }
    }
    // chat history
    if (Array.isArray(payload.messages)) {
      for (const message of payload.messages) {
        if (message.role) totalChars += message.role.length;
        if (message.content) totalChars += message.content.length;
        if (message.name) totalChars += message.name.length;
      }
    }
    // Honor an explicit ratio if provided on the strategy; otherwise default to 4.0
    const ratio = ("chars_per_token_ratio" in tokenization_strategy
      && typeof (tokenization_strategy).chars_per_token_ratio === "number"
      && (tokenization_strategy).chars_per_token_ratio as number > 0)
      ? (tokenization_strategy).chars_per_token_ratio
      : 4.0;
    if (ratio === 4.0) {
      deps.logger.warn(`[countTokens] Using default 4 chars/token ratio for '${tokenization_strategy.type}' on model "${api_identifier}".`);
    }
    return Math.ceil(totalChars / ratio);

  } else if (tokenization_strategy.type === "rough_char_count") {
    let totalChars = 0;
    // systemInstruction and top-level message
    if (typeof payload.systemInstruction === 'string') totalChars += payload.systemInstruction.length;
    if (typeof payload.message === 'string') totalChars += payload.message.length;
    // resourceDocuments
    if (Array.isArray(payload.resourceDocuments)) {
      for (const d of payload.resourceDocuments) {
        if (d && typeof d.content === 'string') totalChars += d.content.length;
      }
    }
    // chat history
    if (Array.isArray(payload.messages)) {
      for (const message of payload.messages) {
        if (message.role) totalChars += message.role.length;
        if (message.content) totalChars += message.content.length;
        if (message.name) totalChars += message.name.length;
      }
    }
    const ratio = tokenization_strategy.chars_per_token_ratio || 4.0; // Default to 4 chars/token
    return Math.ceil(totalChars / ratio);

  } else if (tokenization_strategy.type === "none") {
    deps.logger.warn(`[countTokens] Tokenization strategy is 'none' for model "${api_identifier}". Returning 0 tokens.`);
    return 0;
  
  } else {
    // This block should be unreachable if all members of the discriminated union are handled above.
    // The `never` type assertion helps catch missing cases at compile time.
    const unhandled: never = tokenization_strategy;
    deps.logger.error(`[countTokens] Unhandled tokenization strategy: ${JSON.stringify(unhandled)}`);
    throw new Error(`Unsupported tokenization strategy for ${api_identifier}.`);
  }
} 