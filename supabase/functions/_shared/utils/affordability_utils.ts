import type { AiModelExtendedConfig, ILogger } from '../types.ts';

/**
 * Calculates the maximum number of output tokens a user can generate based on their balance,
 * the cost of the input prompt, and the model's configuration.
 *
 * @param user_balance_tokens The user's current balance in wallet tokens.
 * @param prompt_input_tokens The estimated number of tokens for the input prompt.
 * @param modelConfig The extended configuration for the AI model.
 * @param logger The logger instance for logging errors or warnings.
 * @param deficit_tokens_allowed The number of wallet tokens the user is allowed to go into deficit (default: 0).
 * @returns The maximum number of output tokens the user can afford and is allowed to generate.
 */
export function getMaxOutputTokens(
  user_balance_tokens: number,
  prompt_input_tokens: number,
  modelConfig: AiModelExtendedConfig,
  logger: ILogger,
  deficit_tokens_allowed = 0,
): number {
  const { 
    input_token_cost_rate,
    output_token_cost_rate,
    hard_cap_output_tokens 
  } = modelConfig;

  if (typeof input_token_cost_rate !== 'number' || input_token_cost_rate < 0) {
    logger.error('Invalid or missing input_token_cost_rate in modelConfig', { modelConfig });
    throw new Error('Cannot calculate max output tokens: Invalid input token cost rate.');
  }
  if (typeof output_token_cost_rate !== 'number' || output_token_cost_rate <= 0) {
    // Output cost rate must be positive, otherwise division by zero or infinite tokens.
    logger.error('Invalid or missing output_token_cost_rate in modelConfig', { modelConfig });
    throw new Error('Cannot calculate max output tokens: Invalid output token cost rate.');
  }

  // Calculate the cost of the input prompt in wallet tokens
  const prompt_cost_wallet_tokens = prompt_input_tokens * input_token_cost_rate;

  // Calculate the total available budget in wallet tokens, including any allowed deficit
  const effective_balance_wallet_tokens = user_balance_tokens + deficit_tokens_allowed;

  // PRE-FLIGHT CHECK: Can the user even afford the prompt?
  if (effective_balance_wallet_tokens < prompt_cost_wallet_tokens) {
    logger.warn('User cannot afford the input prompt cost.', {
      effective_balance: effective_balance_wallet_tokens,
      prompt_cost: prompt_cost_wallet_tokens,
    });
    return -1; // Return a sentinel value for "cannot even afford prompt"
  }

  // Calculate the remaining budget in wallet tokens after accounting for the prompt cost
  const budget_for_output_wallet_tokens = effective_balance_wallet_tokens - prompt_cost_wallet_tokens;

  // If the budget for output is zero or negative, the user cannot generate any output tokens
  if (budget_for_output_wallet_tokens <= 0) {
    return 0;
  }

  // Calculate how many output tokens can be afforded with the remaining budget
  const max_spendable_output_tokens = Math.floor(budget_for_output_wallet_tokens / output_token_cost_rate);

  // Determine the dynamic hard cap, now based on the remaining budget for output
  const twenty_percent_balance_as_output_tokens = Math.floor((0.20 * budget_for_output_wallet_tokens) / output_token_cost_rate);
  
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
