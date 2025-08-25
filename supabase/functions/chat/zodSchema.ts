import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// --- Zod Schemas for Runtime Validation ---
export const TokenUsageSchema = z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  });
  
  export const TiktokenEncodingSchema = z.enum(['cl100k_base', 'p50k_base', 'r50k_base', 'gpt2', 'o200k_base']);
  export const TiktokenModelForRulesSchema = z.enum(['gpt-4', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-3.5-turbo-0301']);
  
  export const TokenizationStrategySchema = z.union([
      z.object({ type: z.literal('tiktoken'), tiktoken_encoding_name: TiktokenEncodingSchema, tiktoken_model_name_for_rules_fallback: TiktokenModelForRulesSchema.optional(), is_chatml_model: z.boolean().optional(), api_identifier_for_tokenization: z.string().optional() }),
      z.object({ type: z.literal('rough_char_count'), chars_per_token_ratio: z.number().optional() }),
      z.object({ type: z.literal('anthropic_tokenizer'), model: z.string() }),
      z.object({ type: z.literal('google_gemini_tokenizer') }),
      z.object({ type: z.literal('none') }),
  ]);
  
  export const AiModelExtendedConfigSchema = z.object({
    model_id: z.string().optional(),
    api_identifier: z.string(),
    input_token_cost_rate: z.number().positive().nullable(),
    output_token_cost_rate: z.number().positive().nullable(),
    tokenization_strategy: TokenizationStrategySchema,
    hard_cap_output_tokens: z.number().positive().optional(),
    context_window_tokens: z.number().positive().optional().nullable(),
    service_default_input_cost_rate: z.number().positive().optional(),
    service_default_output_cost_rate: z.number().positive().optional(),
    status: z.enum(['active', 'beta', 'deprecated', 'experimental']).optional(),
    features: z.array(z.string()).optional(),
    max_context_window_tokens: z.number().positive().optional(),
    notes: z.string().optional(),
    provider_max_input_tokens: z.number().positive().optional(),
    provider_max_output_tokens: z.number().positive().optional(),
    default_temperature: z.number().min(0).optional(),
    default_top_p: z.number().positive().optional(),
  });

  // --- Zod Schema for ChatApiRequest ---
export const ChatApiRequestSchema = z.object({
  message: z.string().min(1, { message: "message is required and cannot be empty." }),
  providerId: z.string().uuid({ message: "providerId is required and must be a valid UUID." }),
  promptId: z.union([
    z.string().uuid({ message: "promptId must be a valid UUID if provided and not '__none__'." }),
    z.literal("__none__")
  ], { errorMap: () => ({ message: "promptId is required and must be a valid UUID or '__none__'." }) }),
  chatId: z.string().uuid({ message: "If provided, chatId must be a valid UUID." }).optional(),
  walletId: z.string().uuid({ message: "If provided, walletId must be a valid UUID." }).optional(),
  selectedMessages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"], { errorMap: () => ({ message: "selectedMessages.role must be 'system', 'user', or 'assistant'."}) }),
    content: z.string()
  })).optional(),
  messages: z.array(z.object({ // This might be deprecated if selectedMessages is primary
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).optional(),
  resourceDocuments: z.array(z.object({
    id: z.string().optional(),
    content: z.string(),
  })).optional(),
  organizationId: z.string().uuid({ message: "If provided, organizationId must be a valid UUID." }).optional(),
  rewindFromMessageId: z.string().uuid({ message: "If provided, rewindFromMessageId must be a valid UUID." }).optional(),
  max_tokens_to_generate: z.number().int({ message: "max_tokens_to_generate must be an integer." }).positive({ message: "max_tokens_to_generate must be positive." }).optional(),
  continue_until_complete: z.boolean().optional(),
  systemInstruction: z.string().optional(),
});