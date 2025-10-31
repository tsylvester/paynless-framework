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
  mockDialecticProgressUpdatePayload,
  mockContributionGenerationFailedPayload,
  mockContributionGenerationFailedApiError,
  mockContributionGenerationFailedInternalPayload,
  mockDocumentRenderedNotificationPayload,
} from './notification.service.mock.ts';
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
} from '../supabase.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { DocumentRenderedNotificationPayload } from '../types/notification.service.types.ts';

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

Deno.test('NotificationService - should send a valid internal event for dialectic_progress_update', async () => {
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
  await service.sendDialecticProgressUpdateEvent(
    mockDialecticProgressUpdatePayload,
    mockUserId,
  );

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(rpcParams.p_notification_type, 'dialectic_progress_update');
  assertEquals(
    rpcParams.p_notification_data.current_step,
    5,
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

Deno.test('NotificationService - should send a valid internal event for document_rendered', async () => {
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

  const payload: DocumentRenderedNotificationPayload = mockDocumentRenderedNotificationPayload;

  // Act
  await service.sendDocumentRenderedNotification(payload, mockUserId);

  // Assert
  assertEquals(spies.rpcSpy.calls.length, 1);
  const rpcArgs = spies.rpcSpy.calls[0].args;
  const rpcParams = rpcArgs[1];
  assertEquals(rpcArgs[0], 'create_notification_for_user');
  assertEquals(rpcParams.p_target_user_id, mockUserId);
  assertEquals(rpcParams.p_notification_type, 'document_rendered');
  assertEquals(rpcParams.p_is_internal_event, true);
  assertEquals(rpcParams.p_notification_data.type, 'document_rendered');
  assertEquals(rpcParams.p_notification_data.projectId, payload.projectId);
  assertEquals(rpcParams.p_notification_data.sessionId, payload.sessionId);
  assertEquals(rpcParams.p_notification_data.iterationNumber, payload.iterationNumber);
  assertEquals(rpcParams.p_notification_data.stageSlug, payload.stageSlug);
  assertEquals(rpcParams.p_notification_data.documentIdentity, payload.documentIdentity);
  assertEquals(rpcParams.p_notification_data.documentKey, payload.documentKey);
  assertEquals(rpcParams.p_notification_data.completed, payload.completed);
});