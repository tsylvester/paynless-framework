import type { AiModelExtendedConfig, TokenUsage, ILogger } from '../types.ts';

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
    throw new Error('[calculateActualChatCost] TokenUsage object is missing or invalid.');
  }

  if (!modelConfig || typeof modelConfig !== 'object') {
    throw new Error('[calculateActualChatCost] ModelConfig object is missing or invalid.');
  }

  if (typeof tokenUsage.prompt_tokens !== 'number' || isNaN(tokenUsage.prompt_tokens) || tokenUsage.prompt_tokens < 0) {
    throw new Error(`[calculateActualChatCost] Invalid prompt_tokens: ${tokenUsage.prompt_tokens}`);
  }
  if (typeof tokenUsage.completion_tokens !== 'number' || isNaN(tokenUsage.completion_tokens) || tokenUsage.completion_tokens < 0) {
    throw new Error(`[calculateActualChatCost] Invalid completion_tokens: ${tokenUsage.completion_tokens}`);
  }
  if (typeof tokenUsage.total_tokens !== 'number' || isNaN(tokenUsage.total_tokens) || tokenUsage.total_tokens < 0) {
    throw new Error(`[calculateActualChatCost] Invalid total_tokens: ${tokenUsage.total_tokens}`);
  }
  const promptTokens = tokenUsage.prompt_tokens;
  const completionTokens = tokenUsage.completion_tokens;
  const totalTokens = tokenUsage.total_tokens;

  if (promptTokens === 0 && completionTokens === 0 && totalTokens > 0) {
    logger?.warn(
        '[calculateActualChatCost] prompt_tokens and completion_tokens are zero, but total_tokens is present. ' +
        'Using total_tokens for cost calculation.',
        { tokenUsage, modelContext: modelConfig.tokenization_strategy?.type === 'tiktoken' ? modelConfig.tokenization_strategy.tiktoken_encoding_name : 'N/A' }
    );
  }

  const inputCostRate = modelConfig.input_token_cost_rate;
  const outputCostRate = modelConfig.output_token_cost_rate;

  if (typeof inputCostRate !== 'number' || isNaN(inputCostRate) || inputCostRate < 0) {
    throw new Error(`[calculateActualChatCost] Invalid input_token_cost_rate: ${inputCostRate}`);
  }

  if (typeof outputCostRate !== 'number' || isNaN(outputCostRate) || outputCostRate < 0) {
    throw new Error(`[calculateActualChatCost] Invalid output_token_cost_rate: ${outputCostRate}`);
  }

  const calculatedCost = (promptTokens * inputCostRate) + (completionTokens * outputCostRate);

  if (calculatedCost < 0) {
    throw new Error(`[calculateActualChatCost] Calculated cost is negative: ${calculatedCost}`);
  }
  
  // Round up to the nearest whole unit for the wallet.
  return Math.ceil(calculatedCost);
} 