import { spy, type Spy } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import type { 
    NotificationServiceType,
    DialecticContributionStartedPayload, 
    ContributionGenerationRetryingPayload, 
    DialecticContributionReceivedPayload, 
    DialecticContributionRow,
    ContributionGenerationStartedPayload,
    ContributionGenerationContinuedPayload,
    ContributionGenerationCompletePayload,
    DialecticProgressUpdatePayload,
    ContributionGenerationFailedPayload,
    ApiError
} from '../types/notification.service.types.ts';

export type MockNotificationService = {
    [K in keyof NotificationServiceType]: Spy<NotificationServiceType[K]>;
};

function createMockService(): MockNotificationService {
    return {
        sendContributionStartedEvent: spy(() => Promise.resolve()),
        sendDialecticContributionStartedEvent: spy(() => Promise.resolve()),
        sendContributionRetryingEvent: spy(() => Promise.resolve()),
        sendContributionReceivedEvent: spy(() => Promise.resolve()),
        sendContributionGenerationContinuedEvent: spy(() => Promise.resolve()),
        sendContributionGenerationCompleteEvent: spy(() => Promise.resolve()),
        sendDialecticProgressUpdateEvent: spy(() => Promise.resolve()),
        sendContributionFailedNotification: spy(() => Promise.resolve()),
    };
}

export let mockNotificationService: MockNotificationService = createMockService();

export function resetMockNotificationService() {
    mockNotificationService = createMockService();
}


export const mockDialecticContributionStartedPayload: DialecticContributionStartedPayload = {
    sessionId: 'session-uuid-456',
    modelId: 'model-uuid-abc',
    iterationNumber: 2,
    type: 'dialectic_contribution_started',
    job_id: 'job-uuid-123',
  };

export const mockContributionGenerationRetryingPayload: ContributionGenerationRetryingPayload = {
    sessionId: 'session-uuid-456',
    modelId: 'model-uuid-abc',
    iterationNumber: 2,
    error: 'AI model timed out.',
    type: 'contribution_generation_retrying',
    job_id: 'job-uuid-123',
  };

// Arrange
export const mockContributionRow: DialecticContributionRow = {
    id: 'contrib-uuid-789',
    session_id: 'session-uuid-456',
    user_id: 'user-uuid-123',
    stage: 'thesis',
    iteration_number: 1,
    model_id: 'model-uuid-abc',
    model_name: 'Test Model',
    prompt_template_id_used: 'prompt-uuid-def',
    seed_prompt_url: null,
    edit_version: 0,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: 'text',
    file_name: 'contribution.md',
    storage_bucket: 'dialectic',
    storage_path: 'path/to/contribution.md',
    size_bytes: 1234,
    mime_type: 'text/markdown',
    };

    export const mockDialecticContributionReceivedPayload: DialecticContributionReceivedPayload = {
    type: 'dialectic_contribution_received',
    sessionId: mockContributionRow.session_id,
    contribution: mockContributionRow,
    job_id: 'job-uuid-123',
    is_continuing: false,
    };

export const mockContributionGenerationStartedPayload: ContributionGenerationStartedPayload = {
    type: 'contribution_generation_started',
    sessionId: 'session-uuid-456',
    job_id: 'job-uuid-123',
  };

  export const mockContributionGenerationContinuedPayload: ContributionGenerationContinuedPayload = {
    sessionId: 'session-uuid-456',
    projectId: 'project-uuid-abc',
    modelId: 'model-uuid-def',
    continuationNumber: 2,
    job_id: 'job-uuid-123',
    contribution: mockContributionRow,
    type: 'contribution_generation_continued',
  };

export const mockContributionGenerationCompletePayload: ContributionGenerationCompletePayload = {
    sessionId: 'session-uuid-456',
    projectId: 'project-uuid-abc',
    type: 'contribution_generation_complete',
    job_id: 'job-uuid-123',
  };

export const mockDialecticProgressUpdatePayload: DialecticProgressUpdatePayload = {
    type: 'dialectic_progress_update',
    sessionId: 'session-uuid-456',
    stageSlug: 'synthesis',
    current_step: 5,
    total_steps: 10,
    message: 'Synthesizing 5 of 10 items...',
    job_id: 'job-uuid-123',
  };

export const mockContributionGenerationFailedApiError: ApiError = {
    code: 'AI_ERROR',
    message: 'The AI model failed to respond.',
  };

export const mockContributionGenerationFailedPayload: ContributionGenerationFailedPayload = {
    type: 'contribution_generation_failed',
    sessionId: 'session-uuid-456',
    projectId: 'project-uuid-abc',
    stageSlug: 'antithesis',
    error: mockContributionGenerationFailedApiError,
    job_id: 'job-uuid-123',
  };