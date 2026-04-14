import {
    ChatContextPreferences,
    UserRole,
    AiProvidersApiResponse,
    SystemPromptsApiResponse,
    DialecticContribution,
    ApiError,
    ChatRole,
    WalletDecisionOutcome,
    DialecticNotificationTypes,
    AssembledPrompt,
    StageRenderedDocumentChecklistEntry,
    DagProgressDto,
    StepProgressDto,
    GetAllStageProgressResponse,
    DialecticRecipeEdge,
    ChatMessage,
    SseChatEvent,
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

export function isStageRenderedDocumentChecklistEntry(
    doc: unknown,
): doc is StageRenderedDocumentChecklistEntry {
    if (typeof doc !== 'object' || doc === null) {
        return false;
    }
    if (!('documentKey' in doc) || typeof doc.documentKey !== 'string' || doc.documentKey.length === 0) return false;
    if (!('modelId' in doc) || typeof doc.modelId !== 'string' || doc.modelId.length === 0) return false;
    if (!('jobId' in doc) || typeof doc.jobId !== 'string' || doc.jobId.length === 0) return false;
    if (!('latestRenderedResourceId' in doc) || typeof doc.latestRenderedResourceId !== 'string' || doc.latestRenderedResourceId.length === 0) return false;
    if (!('status' in doc) || typeof doc.status !== 'string') return false;
    const validStatus =
        doc.status === 'idle' ||
        doc.status === 'generating' ||
        doc.status === 'retrying' ||
        doc.status === 'failed' ||
        doc.status === 'completed' ||
        doc.status === 'continuing' ||
        doc.status === 'not_started';
    if (!validStatus) return false;
    return true;
}

export function isDagProgressDto(obj: unknown): obj is DagProgressDto {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(obj));
    return typeof o['completedStages'] === 'number' && typeof o['totalStages'] === 'number';
}

const UNIFIED_PROJECT_STATUS_VALUES: readonly string[] = ['not_started', 'in_progress', 'completed', 'failed'];

export function isStepProgressDto(obj: unknown): obj is StepProgressDto {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(obj));
    const stepKey = o['stepKey'];
    const status = o['status'];
    return typeof stepKey === 'string' && stepKey.length > 0 && typeof status === 'string' && UNIFIED_PROJECT_STATUS_VALUES.includes(status);
}

export function isGetAllStageProgressResponse(obj: unknown): obj is GetAllStageProgressResponse {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(obj));
    return isDagProgressDto(o['dagProgress']) && Array.isArray(o['stages']);
}

export function isDialecticRecipeEdge(obj: unknown): obj is DialecticRecipeEdge {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(obj));
    const fromStepId = o['from_step_id'];
    const toStepId = o['to_step_id'];
    return typeof fromStepId === 'string' && fromStepId.trim() !== '' && typeof toStepId === 'string' && toStepId.trim() !== '';
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
    || x === 'document_completed'
    || x === 'execute_started'
    || x === 'execute_chunk_completed'
    || x === 'execute_completed'
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
      || suffix === 'continued'
      || suffix === 'paused_nsf';
  }

  const dcPrefix = 'dialectic_contribution_';
  if (x.startsWith(dcPrefix)) {
    const suffix = x.slice(dcPrefix.length);
    return suffix === 'started' || suffix === 'received';
  }

  return false;
}

const CHAT_MESSAGE_STATUS_VALUES: readonly string[] = [
  'pending',
  'sent',
  'streaming',
  'failed',
  'error',
];

function isJsonLike(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const t: string = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean' || t === 'object';
}

/**
 * Validates wire-shaped chat_messages row + optional UI status (SseChatCompleteEvent.assistantMessage).
 * Not exported: ChatMessage is owned by @paynless/types; this is internal structure for isSseChatEvent only.
 */
function isChatMessageWireValue(x: unknown): x is ChatMessage {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    return false;
  }
  if (
    !('id' in x) || typeof x.id !== 'string' ||
    !('chat_id' in x) || (x.chat_id !== null && typeof x.chat_id !== 'string') ||
    !('content' in x) || typeof x.content !== 'string' ||
    !('created_at' in x) || typeof x.created_at !== 'string' ||
    !('updated_at' in x) || typeof x.updated_at !== 'string' ||
    !('role' in x) || typeof x.role !== 'string' ||
    !('user_id' in x) || (x.user_id !== null && typeof x.user_id !== 'string') ||
    !('ai_provider_id' in x) || (x.ai_provider_id !== null && typeof x.ai_provider_id !== 'string') ||
    !('system_prompt_id' in x) || (x.system_prompt_id !== null && typeof x.system_prompt_id !== 'string') ||
    !('token_usage' in x) || (x.token_usage !== null && !isJsonLike(x.token_usage)) ||
    !('error_type' in x) || (x.error_type !== null && typeof x.error_type !== 'string') ||
    !('response_to_message_id' in x) || (x.response_to_message_id !== null && typeof x.response_to_message_id !== 'string') ||
    !('is_active_in_thread' in x) || typeof x.is_active_in_thread !== 'boolean'
  ) {
    return false;
  }
  if ('status' in x && x.status !== undefined) {
    if (typeof x.status !== 'string' || !CHAT_MESSAGE_STATUS_VALUES.includes(x.status)) {
      return false;
    }
  }
  return true;
}

export function isSseChatEvent(obj: unknown): obj is SseChatEvent {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }
  if (!('type' in obj) || typeof obj.type !== 'string') {
    return false;
  }
  switch (obj.type) {
    case 'chat_start':
      return (
        'chatId' in obj &&
        typeof obj.chatId === 'string' &&
        'timestamp' in obj &&
        typeof obj.timestamp === 'string'
      );
    case 'content_chunk':
      return (
        'content' in obj &&
        typeof obj.content === 'string' &&
        'assistantMessageId' in obj &&
        typeof obj.assistantMessageId === 'string' &&
        'timestamp' in obj &&
        typeof obj.timestamp === 'string'
      );
    case 'chat_complete':
      return (
        'assistantMessage' in obj &&
        isChatMessageWireValue(obj.assistantMessage) &&
        'finish_reason' in obj &&
        (obj.finish_reason === null || typeof obj.finish_reason === 'string') &&
        'timestamp' in obj &&
        typeof obj.timestamp === 'string'
      );
    case 'error':
      return (
        'message' in obj &&
        typeof obj.message === 'string' &&
        'timestamp' in obj &&
        typeof obj.timestamp === 'string'
      );
    default:
      return false;
  }
}
