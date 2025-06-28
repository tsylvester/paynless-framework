import { encodingForModel, getEncoding, Tiktoken, TiktokenModel } from 'js-tiktoken'; // Changed from esm.sh to direct js-tiktoken
import type { AiModelExtendedConfig, MessageForTokenCounting, TiktokenEncoding } from '../../types/src/ai.types.ts';

const DEFAULT_CHARS_PER_TOKEN = 4;
const APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN = (text: string) => Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN);

/**
 * Estimates the number of tokens for a given text or list of messages based on the model's configuration.
 *
 * @param textOrMessages The input string or an array of messages for token counting.
 * @param modelConfig The extended configuration for the AI model.
 * @returns The estimated number of input tokens.
 * @throws Error if essential configuration for tokenization is missing or invalid.
 */
export function estimateInputTokens(
  textOrMessages: string | MessageForTokenCounting[],
  modelConfig: AiModelExtendedConfig,
): number {
  const { tokenization_strategy } = modelConfig;

  if (!tokenization_strategy) {
    console.warn('Tokenization strategy missing in modelConfig. Falling back to rough character count.', modelConfig);
    const textToEstimate = typeof textOrMessages === 'string' ? textOrMessages : textOrMessages.map(m => m.content || '').join('\n');
    return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textToEstimate);
  }

  switch (tokenization_strategy.type) {
    case 'tiktoken': {
      if (typeof textOrMessages === 'string') {
        // If it's a plain string, just encode it directly.
        // This branch assumes non-ChatML for simple strings, or that ChatML structure is passed as MessageForTokenCounting[]
        
        // Validate config first
        if (!tokenization_strategy.api_identifier_for_tokenization && !tokenization_strategy.tiktoken_encoding_name) {
            throw new Error('Tiktoken strategy selected but no encoding name or model identifier provided.');
        }
        
        let encoding: Tiktoken;
        try {
          if (tokenization_strategy.api_identifier_for_tokenization) {
            encoding = encodingForModel(tokenization_strategy.api_identifier_for_tokenization as TiktokenModel); 
          } else if (tokenization_strategy.tiktoken_encoding_name) { // This else if is safe due to the check above
            encoding = getEncoding(tokenization_strategy.tiktoken_encoding_name);
          }
          // The previous check ensures one of these paths is taken, so encoding will be initialized.
          const tokens = encoding!.encode(textOrMessages).length;
          // encoding.free(); // Important to free wasm memory
          return tokens;
        } catch (e) {
          console.error('Tiktoken encoding failed for string. Falling back to rough estimate.', e, modelConfig);
          // encoding?.free(); // Attempt to free if encoding was partially successful
          return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textOrMessages);
        }
      }
      // It's MessageForTokenCounting[]
      if (!tokenization_strategy.is_chatml_model) {
        // Not ChatML, just concatenate content and encode.
        // This is a simplification; some models might still expect specific formatting.
        
        // Validate config first
        if (!tokenization_strategy.api_identifier_for_tokenization && !tokenization_strategy.tiktoken_encoding_name) {
            throw new Error('Tiktoken strategy (non-ChatML messages) but no encoding name or model ID.');
        }

        const combinedContent = textOrMessages.map(m => m.content || '').join('\n');
        let encoding: Tiktoken;
        try {
            if (tokenization_strategy.api_identifier_for_tokenization) {
                encoding = encodingForModel(tokenization_strategy.api_identifier_for_tokenization as TiktokenModel);
            } else if (tokenization_strategy.tiktoken_encoding_name) { // Safe due to check above
                encoding = getEncoding(tokenization_strategy.tiktoken_encoding_name);
            }
            const tokens = encoding!.encode(combinedContent).length;
            // encoding.free();
            return tokens;
        } catch (e) {
            console.error('Tiktoken encoding failed for non-ChatML messages. Falling back to rough estimate.', e, modelConfig);
            // encoding?.free();
            return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(combinedContent);
        }
      }

      // Handle ChatML messages (adapted from supabase/functions/_shared/utils/tokenizer_utils.ts)
      let encoding: Tiktoken;
      const modelNameForTiktoken = tokenization_strategy.api_identifier_for_tokenization || tokenization_strategy.tiktoken_encoding_name;

      if (!modelNameForTiktoken) {
        throw new Error('Tiktoken ChatML strategy selected but no model identifier or encoding name for tokenization.');
      }
      try {
        // Prefer encodingForModel if api_identifier_for_tokenization is available, as it might handle model-specific nuances.
        // Cast to TiktokenModel is an assertion that the provided string is one of the valid ones.
        encoding = tokenization_strategy.api_identifier_for_tokenization 
            ? encodingForModel(tokenization_strategy.api_identifier_for_tokenization as TiktokenModel) 
            : getEncoding(tokenization_strategy.tiktoken_encoding_name as TiktokenEncoding);
      } catch (e: unknown) {
        const typedError = e instanceof Error ? e : new Error(String(e));
        console.error(`[estimateInputTokens] Failed to get encoding for model/encoding name: "${modelNameForTiktoken}". Falling back. Error: ${typedError.message}`);
        const combinedContentForFallback = textOrMessages.map(m => m.content || '').join('\n');
        return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(combinedContentForFallback);
      }

      let tokensPerMessage: number;
      let tokensPerName: number;
      const effectiveModelName = tokenization_strategy.api_identifier_for_tokenization || 'generic_chatml'; // Use actual model name for rules

      // Simplified ChatML rules - a more robust solution might involve passing the actual model name for precise rule application.
      // For a generic approach, we use common ChatML values. These are based on OpenAI's gpt-4/gpt-3.5-turbo.
      if (effectiveModelName.startsWith("gpt-4o") || effectiveModelName.startsWith("gpt-4") || effectiveModelName.startsWith("gpt-3.5-turbo")) {
        tokensPerMessage = 3;
        tokensPerName = 1;
         // Special case for older gpt-3.5-turbo-0301 from OpenAI docs, if using precise model names
        if (effectiveModelName === "gpt-3.5-turbo-0301") {
            tokensPerMessage = 4;
            tokensPerName = -1; 
        }
      } else {
        // Default for other ChatML-like models if not matching OpenAI patterns
        // Or if model name is not specific enough (e.g., just an encoding name was provided)
        console.warn(`[estimateInputTokens] Using generic ChatML rules for "${effectiveModelName}". May not be perfectly accurate.`);
        tokensPerMessage = 3; // A common value for ChatML messages
        tokensPerName = 1;    // A common value for names in ChatML
      }
      
      let numTokens = 0;
      for (const message of textOrMessages) {
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
      numTokens += 3; // Every reply is primed with <|start|>assistant<|message|> (3 tokens) for ChatML.
      
      // encoding.free(); // Free the encoding
      return numTokens;
    }

    case 'rough_char_count': {
      const ratio = tokenization_strategy.chars_per_token_ratio || DEFAULT_CHARS_PER_TOKEN;
      if (ratio <= 0) {
        throw new Error('Invalid chars_per_token_ratio for rough_char_count strategy.');
      }
      const textToEstimate = typeof textOrMessages === 'string' ? textOrMessages : textOrMessages.map(m => m.content || '').join('\n');
      return Math.ceil(textToEstimate.length / ratio);
    }

    case 'provider_specific_api':
    case 'unknown':
    default: {
      console.warn(`Tokenization strategy "${tokenization_strategy.type}" does not support client-side estimation. Falling back to rough character count.`);
      const textToEstimate = typeof textOrMessages === 'string' ? textOrMessages : textOrMessages.map(m => m.content || '').join('\n');
      return APPROXIMATE_TOKEN_ESTIMATE_FOR_UNKNOWN(textToEstimate);
    }
  }
}

/**
 * Calculates the maximum number of output tokens a user can generate based on their balance,
 * the cost of the input prompt, and the model's configuration.
 *
 * @param user_balance_tokens The user's current balance in wallet tokens.
 * @param prompt_input_tokens The estimated number of tokens for the input prompt.
 * @param modelConfig The extended configuration for the AI model.
 * @param deficit_tokens_allowed The number of wallet tokens the user is allowed to go into deficit (default: 0).
 * @returns The maximum number of output tokens the user can afford and is allowed to generate.
 */
export function getMaxOutputTokens(
  user_balance_tokens: number,
  prompt_input_tokens: number,
  modelConfig: AiModelExtendedConfig,
  deficit_tokens_allowed = 0,
): number {
  const { 
    input_token_cost_rate,
    output_token_cost_rate,
    hard_cap_output_tokens 
  } = modelConfig;

  if (typeof input_token_cost_rate !== 'number' || input_token_cost_rate < 0) {
    console.error('Invalid or missing input_token_cost_rate in modelConfig', modelConfig);
    throw new Error('Cannot calculate max output tokens: Invalid input token cost rate.');
  }
  if (typeof output_token_cost_rate !== 'number' || output_token_cost_rate <= 0) {
    // Output cost rate must be positive, otherwise division by zero or infinite tokens.
    console.error('Invalid or missing output_token_cost_rate in modelConfig', modelConfig);
    throw new Error('Cannot calculate max output tokens: Invalid output token cost rate.');
  }

  // Calculate the cost of the input prompt in wallet tokens
  const prompt_cost_wallet_tokens = prompt_input_tokens * input_token_cost_rate;

  // Calculate the total available budget in wallet tokens, including any allowed deficit
  const effective_balance_wallet_tokens = user_balance_tokens + deficit_tokens_allowed;

  // Calculate the remaining budget in wallet tokens after accounting for the prompt cost
  const budget_for_output_wallet_tokens = effective_balance_wallet_tokens - prompt_cost_wallet_tokens;

  // If the budget for output is zero or negative, the user cannot generate any output tokens
  if (budget_for_output_wallet_tokens <= 0) {
    return 0;
  }

  // Calculate how many output tokens can be afforded with the remaining budget
  const max_spendable_output_tokens = Math.floor(budget_for_output_wallet_tokens / output_token_cost_rate);

  // Determine the dynamic hard cap
  // This is the minimum of 20% of the user's original balance (in output tokens) OR the model's absolute hard cap.
  const twenty_percent_balance_as_output_tokens = Math.floor((0.20 * user_balance_tokens) / output_token_cost_rate);
  
  // Provider's hard cap for output tokens (e.g., 4096, 8192). Use Infinity if not set, implying no provider limit beyond affordability.
  const provider_hard_cap = typeof hard_cap_output_tokens === 'number' && hard_cap_output_tokens >= 0 
    ? hard_cap_output_tokens 
    : Infinity;

  const dynamic_hard_cap = Math.min(twenty_percent_balance_as_output_tokens, provider_hard_cap);
  
  // Ensure dynamic_hard_cap is not negative if user_balance_tokens was negative and deficit allowed it to proceed this far
  const non_negative_dynamic_hard_cap = Math.max(0, dynamic_hard_cap);

  // The final max output tokens is the minimum of what can be spent and the dynamic hard cap.
  // Result must also be non-negative.
  return Math.max(0, Math.min(max_spendable_output_tokens, non_negative_dynamic_hard_cap));
} 