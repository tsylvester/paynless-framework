import { 
    ChatContextPreferences,
    UserRole,
    AiProvidersApiResponse, // Correctly from @paynless/types
    SystemPromptsApiResponse, // Correctly from @paynless/types
} from '@paynless/types';

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && ['user', 'admin'].includes(role);
}

export function isChatContextPreferences(obj: unknown): obj is ChatContextPreferences {
  if (typeof obj !== 'object' || obj === null) {
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

export function isAiProvidersApiResponse(obj: unknown): obj is AiProvidersApiResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'providers' in obj &&
        Array.isArray((obj as AiProvidersApiResponse).providers)
    );
}

export function isSystemPromptsApiResponse(obj: unknown): obj is SystemPromptsApiResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'prompts' in obj &&
        Array.isArray((obj as SystemPromptsApiResponse).prompts)
    );
}
