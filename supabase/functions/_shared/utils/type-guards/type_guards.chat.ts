// supabase/functions/_shared/utils/type_guards.ts
import type { Database, Tables } from "../../../types_db.ts";
import { 
    AiModelExtendedConfig, 
    TokenUsage, 
    ChatMessageRole, 
    ChatInsert, 
    ContinueReason, 
    FinishReason, 
    ChatApiRequest, 
    Messages 
} from "../../types.ts";
import { isRecord } from "./type_guards.common.ts";
type SelectedAiProviderRow = Database['public']['Tables']['ai_providers']['Row'];

export function isAiModelExtendedConfig(obj: unknown): obj is AiModelExtendedConfig {
    if (!isRecord(obj)) return false;

    // Check for a few key properties to be reasonably sure it's the right type.
    // This isn't exhaustive but prevents the most common errors.
    const hasTokenization = 'tokenization_strategy' in obj && isRecord(obj.tokenization_strategy);
    if (!hasTokenization) return false;

    const strategy = obj.tokenization_strategy;
    if (!isRecord(strategy) || typeof strategy.type !== 'string') return false;

    if (strategy.type === 'tiktoken' && typeof strategy.tiktoken_encoding_name !== 'string') {
        return false;
    }

    if (strategy.type === 'rough_char_count' && strategy.chars_per_token_ratio && typeof strategy.chars_per_token_ratio !== 'number') {
        return false;
    }

    return true;
}

export function isApiChatMessage(message: Messages): message is { role: 'user' | 'assistant' | 'system', content: string | null } {
    return message.role === 'user' || message.role === 'assistant' || message.role === 'system';
}

export function isChatApiRequest(obj: unknown): obj is ChatApiRequest {
    if (!isRecord(obj)) {
        return false;
    }
    return (
        'message' in obj && typeof obj.message === 'string' &&
        'providerId' in obj && typeof obj.providerId === 'string' &&
        'promptId' in obj && typeof obj.promptId === 'string'
    );
}

export function isChatInsert(record: unknown): record is ChatInsert {
    if (!isRecord(record)) {
        return false;
    }

    // Required field
    if (typeof record.user_id !== 'string') {
        return false;
    }

    // Optional fields
    if ('created_at' in record && typeof record.created_at !== 'string') {
        return false;
    }
    if ('id' in record && typeof record.id !== 'string') {
        return false;
    }
    if ('organization__id' in record && typeof record.organization_id !== 'string' && record.organization_id !== null) {
        return false;
    }
    if ('system_prompt_id' in record && typeof record.system_prompt_id !== 'string' && record.system_prompt_id !== null) {
        return false;
    }
    if ('title' in record && typeof record.title !== 'string' && record.title !== null) {
        return false;
    }
    if ('updated_at' in record && typeof record.updated_at !== 'string') {
        return false;
    }

    return true;
}

export function isChatMessageRole(role: string): role is ChatMessageRole {
    return ['system', 'user', 'assistant'].includes(role);
}

export function isChatMessageRow(record: unknown): record is Tables<'chat_messages'> {
    if (!isRecord(record)) {
        return false;
    }

    const checks: { key: keyof Tables<'chat_messages'>, type: string, nullable?: boolean }[] = [
        { key: 'id', type: 'string' },
        { key: 'chat_id', type: 'string' },
        { key: 'user_id', type: 'string', nullable: true },
        { key: 'role', type: 'string' },
        { key: 'content', type: 'string', nullable: true },
        { key: 'created_at', type: 'string' },
        { key: 'updated_at', type: 'string' },
        { key: 'is_active_in_thread', type: 'boolean' },
        { key: 'token_usage', type: 'object', nullable: true },
        { key: 'ai_provider_id', type: 'string', nullable: true },
        { key: 'system_prompt_id', type: 'string', nullable: true },
        { key: 'error_type', type: 'string', nullable: true },
        { key: 'response_to_message_id', type: 'string', nullable: true },
    ];

    for (const check of checks) {
        const descriptor = Object.getOwnPropertyDescriptor(record, check.key);
        if (!descriptor && !check.nullable) {
            return false;
        }

        if (descriptor) {
            const value = descriptor.value;
            const valueType = typeof value;
            if (check.nullable && value === null) {
                continue;
            }
            if (valueType !== check.type) {
                return false;
            }
        } else if (!check.nullable) {
            return false;
        }
    }

    return true;
}

export function isContinueReason(reason: FinishReason): reason is ContinueReason {
    if (reason === null) return false;
    for (const value of Object.values(ContinueReason)) {
        if (value === reason) {
            return true;
        }
    }
    return false;
}

export function isFinishReason(value: unknown): value is FinishReason {
    if (value === null) return true;
    if (typeof value !== 'string') return false;
    // Ensure membership in the full allowed set for FinishReason
    const allowed = new Set<string>([
        'stop',
        'length',
        'tool_calls',
        'content_filter',
        'function_call',
        'error',
        'unknown',
        'max_tokens',
        'content_truncated',
    ]);
    return allowed.has(value);
}

/**
 * Type guard for allowed js-tiktoken encoding names used by our token counters.
 * Keeps tests and estimators aligned without any casting.
 */
export function isKnownTiktokenEncoding(
  name: unknown
): name is 'cl100k_base' | 'p50k_base' | 'r50k_base' | 'gpt2' {
  return (
    typeof name === 'string' && (
      name === 'cl100k_base' ||
      name === 'p50k_base' ||
      name === 'r50k_base' ||
      name === 'gpt2'
    )
  );
}

/**
 * A true type guard that safely checks if an object is a SelectedAiProvider
 * using runtime property inspection without any type casting.
 */
export function isSelectedAiProvider(obj: unknown): obj is SelectedAiProviderRow {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const checks = [
    { key: 'id', type: 'string', required: true },
    { key: 'provider', type: 'string', required: false }, // Can be null
    { key: 'name', type: 'string', required: true },
    { key: 'api_identifier', type: 'string', required: true },
  ];

  for (const check of checks) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, check.key);
    if (check.required && (!descriptor || typeof descriptor.value !== check.type)) {
      return false;
    }
    if (!check.required && descriptor && typeof descriptor.value !== check.type && descriptor.value !== null) {
        return false;
    }
    // Ensure required strings are not empty
    if (check.required && typeof descriptor?.value === 'string' && descriptor.value.length === 0) {
      return false;
    }
  }

  return true;
}

export function isTokenUsage(obj: unknown): obj is TokenUsage {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      'prompt_tokens' in obj &&
      typeof obj.prompt_tokens === 'number' &&
      'completion_tokens' in obj &&
      typeof obj.completion_tokens === 'number' &&
      'total_tokens' in obj &&
      typeof obj.total_tokens === 'number'
    );
}

export function isUserRole(role: unknown): role is Database['public']['Enums']['user_role'] {
  return typeof role === 'string' && ['user', 'admin'].includes(role);
}

