import type { AiModelExtendedConfig, TokenUsage, ILogger } from '../types.ts'; // Import ILogger from main types
import { DEFAULT_INPUT_TOKEN_COST_RATE, DEFAULT_OUTPUT_TOKEN_COST_RATE } from '../config/token_cost_defaults.ts';

/**
 * Calculates the actual cost of a chat interaction in wallet units.
 *
 * @param tokenUsage - The token usage object from the AI provider adapter,
 *                     containing prompt_tokens and completion_tokens.
 * @param modelConfig - The AiModelExtendedConfig for the model, containing
 *                      input_token_cost_rate and output_token_cost_rate.
 * @param logger - Optional logger instance for warnings (expects ILogger).
 * @returns The calculated cost in wallet units (integer, rounded up),
 *          or 0 if essential token information is missing.
 */
export function calculateActualChatCost(
  tokenUsage: TokenUsage | null | undefined,
  modelConfig: AiModelExtendedConfig | null | undefined,
  logger?: ILogger // Changed to ILogger from ../types.ts
): number {
  if (!tokenUsage || typeof tokenUsage !== 'object') {
    logger?.warn('[calculateActualChatCost] TokenUsage object is missing or invalid. Cost calculation cannot proceed.');
    return 0;
  }

  if (!modelConfig || typeof modelConfig !== 'object') {
    logger?.warn('[calculateActualChatCost] ModelConfig object is missing or invalid. Cost calculation cannot proceed.');
    return 0;
  }

  const promptTokens = typeof tokenUsage.prompt_tokens === 'number' ? tokenUsage.prompt_tokens : 0;
  const completionTokens = typeof tokenUsage.completion_tokens === 'number' ? tokenUsage.completion_tokens : 0;

  if (promptTokens === 0 && completionTokens === 0 && typeof tokenUsage.total_tokens === 'number' && tokenUsage.total_tokens > 0) {
    logger?.warn(
        '[calculateActualChatCost] prompt_tokens and completion_tokens are zero, but total_tokens is present. ' +
        'Cost calculation will proceed using specific rates, which might differ from a direct total_tokens debit if rates are not 1.0.',
        { tokenUsage, modelContext: modelConfig.tokenization_strategy?.type === 'tiktoken' ? modelConfig.tokenization_strategy.tiktoken_encoding_name : 'N/A' }
    );
  }

  let inputCostRate = modelConfig.input_token_cost_rate;
  let outputCostRate = modelConfig.output_token_cost_rate;

  if (typeof inputCostRate !== 'number' || isNaN(inputCostRate) || inputCostRate < 0) {
    logger?.warn(
      `[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: ${modelConfig.tokenization_strategy?.type === 'tiktoken' ? modelConfig.tokenization_strategy.tiktoken_encoding_name : 'N/A'}). Defaulting to ${DEFAULT_INPUT_TOKEN_COST_RATE}.`,
      { originalRate: inputCostRate }
    );
    inputCostRate = DEFAULT_INPUT_TOKEN_COST_RATE;
  }

  if (typeof outputCostRate !== 'number' || isNaN(outputCostRate) || outputCostRate < 0) {
    logger?.warn(
      `[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: ${modelConfig.tokenization_strategy?.type === 'tiktoken' ? modelConfig.tokenization_strategy.tiktoken_encoding_name : 'N/A'}). Defaulting to ${DEFAULT_OUTPUT_TOKEN_COST_RATE}.`,
      { originalRate: outputCostRate }
    );
    outputCostRate = DEFAULT_OUTPUT_TOKEN_COST_RATE;
  }

  const calculatedCost = (promptTokens * inputCostRate) + (completionTokens * outputCostRate);

  if (calculatedCost < 0) {
    logger?.warn(
        `[calculateActualChatCost] Calculated cost is negative for model (context: ${modelConfig.tokenization_strategy?.type === 'tiktoken' ? modelConfig.tokenization_strategy.tiktoken_encoding_name : 'N/A'}). Defaulting to 0. This should not happen.`,
        { promptTokens, completionTokens, inputCostRate, outputCostRate, calculatedCost }
    );
    return 0;
  }
  
  // Round up to the nearest whole unit for the wallet.
  return Math.ceil(calculatedCost);
} 