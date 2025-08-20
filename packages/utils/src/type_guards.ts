import { 
    ChatContextPreferences,
    UserRole,
    AiProvidersApiResponse, // Correctly from @paynless/types
    SystemPromptsApiResponse, // Correctly from @paynless/types
    DialecticLifecycleEvent,
    DialecticContribution,
    ApiError,
    ChatRole,
} from '@paynless/types';

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && ['user', 'admin'].includes(role);
}

export function isChatRole(role: unknown): role is ChatRole {
  return typeof role === 'string' && ['system', 'user', 'assistant', 'function'].includes(role);
}

export function isChatContextPreferences(obj: unknown): obj is ChatContextPreferences {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }

  const hasNewChatContext = 'newChatContext' in obj;
  const hasSelectedProviderId = 'selectedProviderId' in obj;
  const hasSelectedPromptId = 'selectedPromptId' in obj;
  
  if (hasNewChatContext && typeof obj.newChatContext !== 'string' && obj.newChatContext !== null) return false;
  if (hasSelectedProviderId && typeof obj.selectedProviderId !== 'string' && obj.selectedProviderId !== null) return false;
  if (hasSelectedPromptId && typeof obj.selectedPromptId !== 'string' && obj.selectedPromptId !== null) return false;
  
  return true;
}

const dialecticNotificationTypes: ReadonlyArray<string> = [
    'contribution_generation_started',
    'dialectic_contribution_started',
    'contribution_generation_retrying',
    'dialectic_contribution_received',
    'contribution_generation_failed',
    'contribution_generation_complete',
    'dialectic_progress_update',
    'contribution_generation_continued',
];

export function isDialecticLifecycleEventType(type: string): type is DialecticLifecycleEvent['type'] {
    return dialecticNotificationTypes.includes(type);
}

// A type guard for DialecticContribution
export function isDialecticContribution(obj: unknown): obj is DialecticContribution {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    return (
        'id' in obj && typeof obj['id'] === 'string' &&
        'session_id' in obj && typeof obj['session_id'] === 'string' &&
        'stage' in obj && typeof obj['stage'] === 'string' &&
        'iteration_number' in obj && typeof obj['iteration_number'] === 'number' &&
        'is_latest_edit' in obj && typeof obj['is_latest_edit'] === 'boolean'
    );
}

// Type guard for ApiError
export function isApiError(obj: unknown): obj is ApiError {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    return (
        'code' in obj && typeof obj['code'] === 'string' &&
        'message' in obj && typeof obj['message'] === 'string'
    );
}

export function isAiProvidersApiResponse(obj: unknown): obj is AiProvidersApiResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'providers' in obj &&
        Array.isArray(obj.providers)
    );
}

export function isSystemPromptsApiResponse(obj: unknown): obj is SystemPromptsApiResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'prompts' in obj &&
        Array.isArray(obj.prompts)
    );
}
