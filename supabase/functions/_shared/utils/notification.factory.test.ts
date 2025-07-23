import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { NotificationFactory } from './notification.factory.ts';
import type {
  ContributionGenerationCompletePayload,
  ContributionGenerationContinuedPayload,
  ContributionGenerationRetryingPayload,
  ContributionGenerationStartedPayload,
  DialecticContributionReceivedPayload,
  DialecticContributionStartedPayload,
  DialecticProgressUpdatePayload,
  DialecticContributionRow,
  ContributionGenerationFailedPayload,
  ApiError,
} from '../types/notification.factory.types.ts';

Deno.test('NotificationFactory - should create a valid internal event for contribution_generation_started', () => {
  // Arrange
  const payload: ContributionGenerationStartedPayload = {
    type: 'contribution_generation_started',
    sessionId: 'session-uuid-456',
  };

  // Act
  const notification = NotificationFactory.createContributionStartedEvent(
    payload,
  );

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'contribution_generation_started');
  assertEquals(notification.is_internal_event, true, 'Should be an internal event');
  assert(!notification.title, 'Internal events should not have a title');
  assert(!notification.message, 'Internal events should not have a message');
  assertEquals(data.sessionId, payload.sessionId);
});

Deno.test('NotificationFactory - should create a valid internal event for dialectic_contribution_started', () => {
  // Arrange
  const mockPayload: DialecticContributionStartedPayload = {
    sessionId: 'session-uuid-456',
    modelId: 'model-uuid-abc',
    iterationNumber: 2,
    type: 'dialectic_contribution_started',
  };

  // Act
  const notification = NotificationFactory.createDialecticContributionStartedEvent(mockPayload);

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'dialectic_contribution_started');
  assertEquals(notification.is_internal_event, true);
  assertEquals(data.sessionId, mockPayload.sessionId);
  assertEquals(data.modelId, mockPayload.modelId);
  assertEquals(data.iterationNumber, mockPayload.iterationNumber);
});

Deno.test('NotificationFactory - should create a valid internal event for contribution_generation_retrying', () => {
  // Arrange
  const mockPayload: ContributionGenerationRetryingPayload = {
    sessionId: 'session-uuid-456',
    modelId: 'model-uuid-abc',
    iterationNumber: 2,
    error: 'AI model timed out.',
    type: 'contribution_generation_retrying',
  };

  // Act
  const notification = NotificationFactory.createContributionRetryingEvent(mockPayload);

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'contribution_generation_retrying');
  assertEquals(notification.is_internal_event, true);
  assertEquals(data.sessionId, mockPayload.sessionId);
  assertEquals(data.modelId, mockPayload.modelId);
  assertEquals(data.iterationNumber, mockPayload.iterationNumber);
  assertEquals(data.error, mockPayload.error);
});

Deno.test('NotificationFactory - should create a valid internal event for dialectic_contribution_received', () => {
  // Arrange
  const mockContribution: DialecticContributionRow = {
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

  const payload: DialecticContributionReceivedPayload = {
    type: 'dialectic_contribution_received',
    sessionId: mockContribution.session_id,
    contribution: mockContribution,
    job_id: 'job-uuid-123',
    is_continuing: false,
  };

  // Act
  const notification = NotificationFactory.createContributionReceivedEvent(
    payload,
  );

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'dialectic_contribution_received');
  assertEquals(notification.is_internal_event, true, 'Should be an internal event');
  assertEquals(JSON.stringify(data.contribution), JSON.stringify(mockContribution));
  assertEquals(data.job_id, payload.job_id);
  assertEquals(data.is_continuing, payload.is_continuing);
});

Deno.test('NotificationFactory - should create a valid internal event for contribution_generation_continued', () => {
  // Arrange
  const mockContribution: DialecticContributionRow = {
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

  const mockPayload: ContributionGenerationContinuedPayload = {
    sessionId: 'session-uuid-456',
    projectId: 'project-uuid-abc',
    modelId: 'model-uuid-def',
    continuationNumber: 2,
    job_id: 'job-uuid-123',
    contribution: mockContribution,
    type: 'contribution_generation_continued',
  };

  // Act
  const notification = NotificationFactory.createContributionGenerationContinuedEvent(mockPayload);

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'contribution_generation_continued');
  assertEquals(notification.is_internal_event, true);
  assertEquals(data.sessionId, mockPayload.sessionId);
  assertEquals(data.job_id, mockPayload.job_id);
  assertEquals(data.continuationNumber, mockPayload.continuationNumber);
});

Deno.test('NotificationFactory - should create a valid internal event for contribution_generation_complete', () => {
  // Arrange
  const mockPayload: ContributionGenerationCompletePayload = {
    sessionId: 'session-uuid-456',
    projectId: 'project-uuid-abc',
    type: 'contribution_generation_complete',
  };

  // Act
  const notification = NotificationFactory.createContributionGenerationCompleteEvent(mockPayload);

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'contribution_generation_complete');
  assertEquals(notification.is_internal_event, true);
  assertEquals(data.sessionId, mockPayload.sessionId);
  assertEquals(data.projectId, mockPayload.projectId);
});

Deno.test('NotificationFactory - should create a valid internal event for dialectic_progress_update', () => {
  // Arrange
  const mockPayload: DialecticProgressUpdatePayload = {
    type: 'dialectic_progress_update',
    sessionId: 'session-uuid-456',
    stageSlug: 'synthesis',
    current_step: 5,
    total_steps: 10,
    message: 'Synthesizing 5 of 10 items...',
  };

  // Act
  const notification = NotificationFactory.createDialecticProgressUpdateEvent(mockPayload);

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'dialectic_progress_update');
  assertEquals(notification.is_internal_event, true);
  assertEquals(data.current_step, 5);
  assertEquals(data.message, mockPayload.message);
});

Deno.test('NotificationFactory - should create a user-facing notification for contribution_generation_failed', () => {
  // Arrange
  const error: ApiError = {
    code: 'AI_ERROR',
    message: 'The AI model failed to respond.',
  };

  const payload: ContributionGenerationFailedPayload = {
    type: 'contribution_generation_failed',
    sessionId: 'session-uuid-456',
    projectId: 'project-uuid-abc',
    stageSlug: 'antithesis',
    error: error,
  };

  // Act
  const notification = NotificationFactory.createContributionFailedNotification(
    payload,
  );

  // Assert
  assertExists(notification);
  const data = notification.notification_data;
  assertEquals(notification.notification_type, 'contribution_generation_failed');
  assertEquals(notification.is_internal_event, false, 'Should be a user-facing notification');
  assertExists(notification.title, 'User-facing notifications must have a title');
  assertExists(notification.message, 'User-facing notifications must have a message');
  assertExists(notification.link_path, 'User-facing notifications should have a link path');
  assertEquals(notification.title, 'Contribution Generation Failed');
  assertEquals(notification.link_path, `/projects/${payload.projectId}/sessions/${payload.sessionId}`);
  assertEquals(data.sessionId, payload.sessionId);
  assertEquals(data.error.message, error.message);
}); 