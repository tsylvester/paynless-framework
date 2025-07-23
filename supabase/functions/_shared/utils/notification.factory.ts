import type {
  RpcNotification,
  ContributionGenerationCompletePayload,
  ContributionGenerationContinuedPayload,
  ContributionGenerationRetryingPayload,
  ContributionGenerationStartedPayload,
  DialecticContributionReceivedPayload,
  DialecticContributionStartedPayload,
  DialecticProgressUpdatePayload,
  ContributionGenerationFailedPayload,
} from '../types/notification.factory.types.ts';

export class NotificationFactory {
  public static createContributionStartedEvent(
    payload: ContributionGenerationStartedPayload,
  ): Omit<RpcNotification<ContributionGenerationStartedPayload>, 'target_user_id'> {
    return {
      notification_type: 'contribution_generation_started',
      is_internal_event: true,
      notification_data: payload,
    };
  }

  public static createDialecticContributionStartedEvent(
    payload: DialecticContributionStartedPayload,
  ): Omit<RpcNotification<DialecticContributionStartedPayload>, 'target_user_id'> {
    return {
      notification_type: 'dialectic_contribution_started',
      is_internal_event: true,
      notification_data: payload,
    };
  }

  public static createContributionRetryingEvent(
    payload: ContributionGenerationRetryingPayload,
  ): Omit<RpcNotification<ContributionGenerationRetryingPayload>, 'target_user_id'> {
    return {
      notification_type: 'contribution_generation_retrying',
      is_internal_event: true,
      notification_data: payload,
    };
  }

  public static createContributionReceivedEvent(
    payload: DialecticContributionReceivedPayload,
  ): Omit<RpcNotification<DialecticContributionReceivedPayload>, 'target_user_id'> {
    return {
      notification_type: 'dialectic_contribution_received',
      is_internal_event: true,
      notification_data: {
        ...payload,
        contribution: payload.contribution,
      },
    };
  }
  
  public static createContributionGenerationContinuedEvent(
    payload: ContributionGenerationContinuedPayload,
    ): Omit<RpcNotification<ContributionGenerationContinuedPayload>, 'target_user_id'> {
        return {
        notification_type: 'contribution_generation_continued',
        is_internal_event: true,
        notification_data: {
            ...payload,
            contribution: payload.contribution,
        },
        };
    }

  public static createContributionGenerationCompleteEvent(
    payload: ContributionGenerationCompletePayload,
  ): Omit<RpcNotification<ContributionGenerationCompletePayload>, 'target_user_id'> {
    return {
      notification_type: 'contribution_generation_complete',
      is_internal_event: true,
      notification_data: payload,
    };
  }

  public static createDialecticProgressUpdateEvent(
    payload: DialecticProgressUpdatePayload,
    ): Omit<RpcNotification<DialecticProgressUpdatePayload>, 'target_user_id'> {
        return {
        notification_type: 'dialectic_progress_update',
        is_internal_event: true,
        notification_data: payload,
        };
    }

  public static createContributionFailedNotification(
    payload: ContributionGenerationFailedPayload,
  ): Omit<RpcNotification<ContributionGenerationFailedPayload>, 'target_user_id'> {
    return {
      notification_type: 'contribution_generation_failed',
      is_internal_event: false,
      title: 'Contribution Generation Failed',
      message:
        `An error occurred while generating a contribution for the '${payload.stageSlug}' stage. Details: ${payload.error.message}`,
      link_path: `/projects/${payload.projectId}/sessions/${payload.sessionId}`,
      notification_data: {
        sessionId: payload.sessionId,
        type: 'contribution_generation_failed',
        error: payload.error,
        projectId: payload.projectId,
        stageSlug: payload.stageSlug,
      },
    };
  }
} 