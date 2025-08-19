import { getEncoding } from "https://esm.sh/js-tiktoken@1.0.10";
import type { Messages, AiModelExtendedConfig, TiktokenModelForRules } from "../types.ts";
import { countTokens } from "npm:@anthropic-ai/tokenizer@0.0.4";

/**
 * Counts the number of tokens in a list of messages based on the provided model configuration.
 * Supports 'tiktoken' strategy (using a specific encoding name) and 'rough_char_count'.
 * For 'tiktoken', applies ChatML-specific token counting rules.
 *
 * @param messages Array of message objects, each with role, content, and optional name.
 * @param modelConfig The extended configuration for the AI model, including its tokenization strategy.
 * @returns The total number of tokens.
 * @throws Error if token counting cannot be performed for the given strategy or configuration.
 */
export function countTokensForMessages(
  messages: Messages[],
  modelConfig: AiModelExtendedConfig
): number {
  const payloadFingerprint = messages.map(m => ({
    role: m.role,
    content_length: m.content?.length ?? 0,
    name_length: m.name?.length ?? 0,
  }));
  //console.log(`[countTokensForMessages] Estimating tokens for model "${modelConfig.api_identifier}". Payload fingerprint:`, JSON.stringify(payloadFingerprint, null, 2));
  const { tokenization_strategy, api_identifier } = modelConfig;

  if (tokenization_strategy.type === "tiktoken") {
    if (!tokenization_strategy.tiktoken_encoding_name) {
      console.error(`[countTokensForMessages] Tiktoken strategy selected for "${api_identifier}" but 'tiktoken_encoding_name' is missing in tokenization_strategy.`);
      throw new Error(`Configuration error for ${api_identifier}: tiktoken_encoding_name is required for tiktoken strategy.`);
    }

    let encoding;
    try {
      encoding = getEncoding(tokenization_strategy.tiktoken_encoding_name as import("https://esm.sh/js-tiktoken@1.0.10").TiktokenEncoding);
    } catch (e: unknown) {
      const typedError = e instanceof Error ? e : new Error(String(e));
      console.error(`[countTokensForMessages] Failed to get encoding for encoding name "${tokenization_strategy.tiktoken_encoding_name}" (model "${api_identifier}"). Error: ${typedError.message}`);
      throw new Error(`Unsupported encoding name: ${tokenization_strategy.tiktoken_encoding_name}. Original error: ${typedError.message}`);
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
        console.warn(`[countTokensForMessages] Model "${api_identifier}" (encoding: ${tokenization_strategy.tiktoken_encoding_name}) did not match a specific ChatML rule set (gpt-4, gpt-3.5-turbo, gpt-4o). Applying default ChatML rules (3 tokensPerMessage, 1 tokensPerName).`);
        tokensPerMessage = 3;
        tokensPerName = 1;
      } else {
        // For other encodings like p50k_base, r50k_base (older models), ChatML rules are less standard.
        // Defaulting to treating them like gpt-3.5-turbo for token penalties, but this is a rough guess.
        // Consider throwing an error or requiring explicit rules_fallback for non-cl100k/o200k encodings.
        console.warn(`[countTokensForMessages] Model "${api_identifier}" (encoding: ${tokenization_strategy.tiktoken_encoding_name}) uses an encoding for which ChatML rules are not well-defined in this function. Applying gpt-3.5-turbo-like rules as a fallback.`);
        tokensPerMessage = 3; 
        tokensPerName = 1;
      }
    }
    
    let numTokens = 0;
    for (const message of messages) {
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
    return countTokens(messages.map(m => m.content || "").join("\\n"));

  } else if (tokenization_strategy.type === "google_gemini_tokenizer") {
    console.warn(`[countTokensForMessages] Using 'rough_char_count' as a fallback for '${tokenization_strategy.type}' on model "${api_identifier}".`);
    let totalChars = 0;
    for (const message of messages) {
      if (message.role) totalChars += message.role.length;
      if (message.content) totalChars += message.content.length;
      if (message.name) totalChars += message.name.length;
    }
    return Math.ceil(totalChars / 4.0); // Default to 4 chars/token for fallback

  } else if (tokenization_strategy.type === "rough_char_count") {
    let totalChars = 0;
    for (const message of messages) {
      if (message.role) totalChars += message.role.length;
      if (message.content) totalChars += message.content.length;
      if (message.name) totalChars += message.name.length;
    }
    const ratio = tokenization_strategy.chars_per_token_ratio || 4.0; // Default to 4 chars/token
    return Math.ceil(totalChars / ratio);

  } else if (tokenization_strategy.type === "none") {
    console.warn(`[countTokensForMessages] Tokenization strategy is 'none' for model "${api_identifier}". Returning 0 tokens.`);
    return 0;
  
  } else {
    // This block should be unreachable if all members of the discriminated union are handled above.
    // The `never` type assertion helps catch missing cases at compile time.
    const unhandled: never = tokenization_strategy;
    console.error(`[countTokensForMessages] Unhandled tokenization strategy: ${JSON.stringify(unhandled)}`);
    throw new Error(`Unsupported tokenization strategy for ${api_identifier}.`);
  }
} 