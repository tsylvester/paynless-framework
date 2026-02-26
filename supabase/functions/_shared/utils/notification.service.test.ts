import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import { NotificationService } from './notification.service.ts';
import { 
  mockContributionGenerationStartedPayload, 
  mockDialecticContributionStartedPayload,
  mockContributionGenerationRetryingPayload,
  mockContributionRow,
  mockDialecticContributionReceivedPayload,
  mockContributionGenerationContinuedPayload,
  mockContributionGenerationCompletePayload,
  mockContributionGenerationFailedPayload,
  mockContributionGenerationFailedApiError,
  mockContributionGenerationFailedInternalPayload,
} from './notification.service.mock.ts';
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
} from '../supabase.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { 
  PlannerStartedPayload,
  ExecuteStartedPayload,
  ExecuteChunkCompletedPayload,
  RenderCompletedPayload,
  JobFailedPayload,
} from '../types/notification.service.types.ts';

Deno.test('NotificationService - should send a valid internal event for contribution_generation_started', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );

  // Act
  await service.sendContributionStartedEvent(
    mockContributionGenerationStartedPayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcArgs[0], 'create_notification_for_user');
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(rpcParams.p_notification_type, 'contribution_generation_started');
  assertEquals(rpcParams.p_is_internal_event, true);
  assertEquals(
    rpcParams.p_notification_data.sessionId,
    mockContributionGenerationStartedPayload.sessionId,
  );
});

Deno.test('NotificationService - should send a valid internal event for dialectic_contribution_started', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );

  // Act
  await service.sendDialecticContributionStartedEvent(
    mockDialecticContributionStartedPayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(
    rpcParams.p_notification_type,
    'dialectic_contribution_started',
  );
  assertEquals(
    rpcParams.p_notification_data.sessionId,
    mockDialecticContributionStartedPayload.sessionId,
  );
});

Deno.test('NotificationService - should send a valid internal event for contribution_generation_retrying', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );

  // Act
  await service.sendContributionRetryingEvent(
    mockContributionGenerationRetryingPayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(
    rpcParams.p_notification_type,
    'contribution_generation_retrying',
  );
  assertEquals(
    rpcParams.p_notification_data.error,
    mockContributionGenerationRetryingPayload.error,
  );
});

Deno.test('NotificationService - should send a valid internal event for dialectic_contribution_received', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );

  // Act
  await service.sendContributionReceivedEvent(
    mockDialecticContributionReceivedPayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(
    rpcParams.p_notification_type,
    'dialectic_contribution_received',
  );
  assertEquals(
    JSON.stringify(rpcParams.p_notification_data.contribution),
    JSON.stringify(mockContributionRow),
  );
});

Deno.test('NotificationService - should send a valid internal event for contribution_generation_continued', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );
  // Act
  await service.sendContributionGenerationContinuedEvent(
    mockContributionGenerationContinuedPayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(
    rpcParams.p_notification_type,
    'contribution_generation_continued',
  );
  assertEquals(
    rpcParams.p_notification_data.continuationNumber,
    mockContributionGenerationContinuedPayload.continuationNumber,
  );
});

Deno.test('NotificationService - should send a valid internal event for contribution_generation_complete', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );
  // Act
  await service.sendContributionGenerationCompleteEvent(
    mockContributionGenerationCompletePayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(
    rpcParams.p_notification_type,
    'contribution_generation_complete',
  );
  assertEquals(
    rpcParams.p_notification_data.projectId,
    mockContributionGenerationCompletePayload.projectId,
  );
});

Deno.test('NotificationService - should send a user-facing notification for contribution_generation_failed', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );
  // Act
  await service.sendContributionFailedNotification(
    mockContributionGenerationFailedPayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(rpcParams.p_notification_type, 'contribution_generation_failed');
  assertEquals(rpcParams.p_is_internal_event, false);
  assertExists(rpcParams.p_title);
  assertExists(rpcParams.p_message);
  assertEquals(
    rpcParams.p_notification_data.error.message,
    mockContributionGenerationFailedApiError.message,
  );
}); 

Deno.test('NotificationService - should send a valid internal event for other_generation_failed', async () => {
  // Arrange
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: {
      create_notification_for_user: { data: null, error: null },
    },
  });
  const service = new NotificationService(
    client as unknown as SupabaseClient<Database>,
  );

  // Act
  await service.sendContributionGenerationFailedEvent(mockContributionGenerationFailedInternalPayload, mockUserId);

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcArgs[0], 'create_notification_for_user');
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(rpcParams.p_notification_type, 'other_generation_failed');
  assertEquals(rpcParams.p_is_internal_event, true);
  assertEquals(rpcParams.p_notification_data.sessionId, mockContributionGenerationFailedInternalPayload.sessionId);
  assertEquals(rpcParams.p_notification_data.job_id, mockContributionGenerationFailedInternalPayload.job_id);
  assertEquals(rpcParams.p_notification_data.error.message, mockContributionGenerationFailedInternalPayload.error.message);
});

Deno.test('NotificationService - should send planner_started with document_key and modelId', async () => {
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: { create_notification_for_user: { data: null, error: null } },
  });
  const service = new NotificationService(client as unknown as SupabaseClient<Database>);

  const payload: PlannerStartedPayload = {
    type: 'planner_started',
    sessionId: 'session-uuid-456',
    stageSlug: 'thesis',
    job_id: 'job-uuid-123',
    step_key: 'step-one',
    iterationNumber: 1,
  };

  await service.sendJobNotificationEvent(payload, mockUserId);

  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcArgs[0], 'create_notification_for_user');
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(rpcParams.p_notification_type, 'planner_started');
  assertEquals(rpcParams.p_is_internal_event, true);
  assertEquals(rpcParams.p_notification_data.step_key, payload.step_key);
});

Deno.test('NotificationService - should send execute_started with document_key and modelId', async () => {
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: { create_notification_for_user: { data: null, error: null } },
  });
  const service = new NotificationService(client as unknown as SupabaseClient<Database>);

  const payload: ExecuteStartedPayload = {
    type: 'execute_started',
    sessionId: 'session-uuid-456',
    stageSlug: 'thesis',
    job_id: 'job-uuid-123',
    step_key: 'step-one',
    document_key: 'business_case',
    modelId: 'model-uuid-abc',
    iterationNumber: 1,
  };

  await service.sendJobNotificationEvent(payload, mockUserId);

  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_notification_type, 'execute_started');
  assertEquals(rpcParams.p_notification_data.document_key, payload.document_key);
  assertEquals(rpcParams.p_notification_data.modelId, payload.modelId);
});

Deno.test('NotificationService - should send execute_chunk_completed with document_key and modelId', async () => {
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: { create_notification_for_user: { data: null, error: null } },
  });
  const service = new NotificationService(client as unknown as SupabaseClient<Database>);

  const payload: ExecuteChunkCompletedPayload = {
    type: 'execute_chunk_completed',
    sessionId: 'session-uuid-456',
    stageSlug: 'thesis',
    job_id: 'job-uuid-123',
    step_key: 'step-one',
    document_key: 'business_case',
    modelId: 'model-uuid-abc',
    iterationNumber: 1,
  };

  await service.sendJobNotificationEvent(payload, mockUserId);

  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_notification_type, 'execute_chunk_completed');
  assertEquals(rpcParams.p_notification_data.document_key, payload.document_key);
  assertEquals(rpcParams.p_notification_data.modelId, payload.modelId);
});

Deno.test('NotificationService - should send render_completed with document_key and modelId', async () => {
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: { create_notification_for_user: { data: null, error: null } },
  });
  const service = new NotificationService(client as unknown as SupabaseClient<Database>);

  const payload: RenderCompletedPayload = {
    type: 'render_completed',
    sessionId: 'session-uuid-456',
    stageSlug: 'thesis',
    job_id: 'job-uuid-123',
    step_key: 'step-one',
    document_key: 'business_case',
    modelId: 'model-uuid-abc',
    iterationNumber: 1,
    latestRenderedResourceId: 'resource-uuid-123',
  };

  await service.sendJobNotificationEvent(payload, mockUserId);

  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_notification_type, 'render_completed');
  assertEquals(rpcParams.p_notification_data.document_key, payload.document_key);
  assertEquals(rpcParams.p_notification_data.modelId, payload.modelId);
});

Deno.test('NotificationService - should send job_failed with error and document context', async () => {
  const mockUserId = 'user-123';
  const { client, spies } = createMockSupabaseClient(mockUserId, {
    rpcResults: { create_notification_for_user: { data: null, error: null } },
  });
  const service = new NotificationService(client as unknown as SupabaseClient<Database>);

  const payload: JobFailedPayload = {
    type: 'job_failed',
    sessionId: 'session-uuid-456',
    stageSlug: 'thesis',
    job_id: 'job-uuid-123',
    step_key: 'step-one',
    document_key: 'business_case',
    modelId: 'model-uuid-abc',
    iterationNumber: 1,
    error: mockContributionGenerationFailedApiError,
  };

  await service.sendJobNotificationEvent(payload, mockUserId);

  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_notification_type, 'job_failed');
  assertEquals(rpcParams.p_notification_data.document_key, payload.document_key);
  assertEquals(rpcParams.p_notification_data.modelId, payload.modelId);
  assertEquals(rpcParams.p_notification_data.error.message, payload.error.message);
});