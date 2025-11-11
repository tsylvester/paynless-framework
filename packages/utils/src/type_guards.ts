import { 
    ChatContextPreferences,
    UserRole,
    AiProvidersApiResponse, // Correctly from @paynless/types
    SystemPromptsApiResponse, // Correctly from @paynless/types
    DialecticContribution,
    ApiError,
    ChatRole,
    WalletDecisionOutcome,
    DialecticNotificationTypes,
    AssembledPrompt,
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

// Type guard for AssembledPrompt
export function isAssembledPrompt(obj: unknown): obj is AssembledPrompt {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    return (
        'promptContent' in obj && typeof obj['promptContent'] === 'string' &&
        'source_prompt_resource_id' in obj && typeof obj['source_prompt_resource_id'] === 'string'
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

export function isWalletDecisionLoading(x: unknown): x is Extract<WalletDecisionOutcome, { outcome: 'loading' }> {
  return typeof x === 'object' && x !== null && 'outcome' in x && x.outcome === 'loading';
}

export function isWalletDecisionError(x: unknown): x is Extract<WalletDecisionOutcome, { outcome: 'error'; message: string }> {
  return (
    typeof x === 'object' &&
    x !== null &&
    'outcome' in x && x.outcome === 'error' &&
    'message' in x && typeof x.message === 'string'
  );
}

function hasOrgId(x: unknown): x is { orgId: string } {
  return typeof x === 'object' && x !== null && 'orgId' in x && typeof x.orgId === 'string';
}

export function isUserConsentRequired(x: unknown): x is Extract<WalletDecisionOutcome, { outcome: 'user_consent_required'; orgId: string }> {
  return typeof x === 'object' && x !== null && 'outcome' in x && x.outcome === 'user_consent_required' && hasOrgId(x);
}

export function isUserConsentRefused(x: unknown): x is Extract<WalletDecisionOutcome, { outcome: 'user_consent_refused'; orgId: string }> {
  return typeof x === 'object' && x !== null && 'outcome' in x && x.outcome === 'user_consent_refused' && hasOrgId(x);
}

export function isOrgWalletUnavailableByPolicy(x: unknown): x is Extract<WalletDecisionOutcome, { outcome: 'org_wallet_not_available_policy_org'; orgId: string }> {
  return typeof x === 'object' && x !== null && 'outcome' in x && x.outcome === 'org_wallet_not_available_policy_org' && hasOrgId(x);
}

// Dialectic lifecycle event type guard
// Note: we intentionally avoid enumerating all values to keep this future-proof.

export function isDialecticLifecycleEventType(x: unknown): x is DialecticNotificationTypes {
  if (typeof x !== 'string' || x.length === 0) return false;
  if (x === 'dialectic_progress_update') return true;

  if (
    x === 'planner_started'
    || x === 'document_started'
    || x === 'document_chunk_completed'
    || x === 'render_completed'
    || x === 'job_failed'
  ) {
    return true;
  }

  const cgPrefix = 'contribution_generation_';
  if (x.startsWith(cgPrefix)) {
    const suffix = x.slice(cgPrefix.length);
    return suffix === 'started'
      || suffix === 'retrying'
      || suffix === 'failed'
      || suffix === 'complete'
      || suffix === 'continued';
  }

  const dcPrefix = 'dialectic_contribution_';
  if (x.startsWith(dcPrefix)) {
    const suffix = x.slice(dcPrefix.length);
    return suffix === 'started' || suffix === 'received';
  }

  return false;
}
