import { type SupabaseClient } from 'npm:@supabase/supabase-js';
import { isJson } from './type_guards.ts';
import type { Database } from '../../types_db.ts';
import type {
  NotificationServiceType,
  RpcNotification,
  ContributionGenerationStartedPayload,
  DialecticContributionStartedPayload,
  ContributionGenerationRetryingPayload,
  ContributionGenerationContinuedPayload,
  ContributionGenerationCompletePayload,
  DialecticContributionReceivedPayload,
  DialecticProgressUpdatePayload,
  ContributionGenerationFailedPayload,
  ContributionGenerationFailedInternalPayload,
  DocumentRenderedNotificationPayload,
} from '../types/notification.service.types.ts';

export class NotificationService implements NotificationServiceType {
  private supabase: SupabaseClient<Database>;
  private authToken?: string;

  constructor(supabase: SupabaseClient<Database>, authToken?: string) {
    this.supabase = supabase;
    this.authToken = authToken;
  }

  private async _sendNotification<T>(notification: RpcNotification<T>) {
    const {
      target_user_id,
      notification_type,
      notification_data,
      is_internal_event,
      title,
      message,
      link_path,
    } = notification;

    if (!isJson(notification_data)) {
      console.error('Invalid JSON data provided to _sendNotification', { notification_data });
      return;
    }

    const { error } = await this.supabase.rpc('create_notification_for_user', {
      p_target_user_id: target_user_id,
      p_notification_type: notification_type,
      p_notification_data: notification_data,
      p_title: title ?? undefined,
      p_message: message ?? undefined,
      p_link_path: link_path ?? undefined,
      p_is_internal_event: is_internal_event ?? false,
    });

    if (error) {
      console.error('Failed to send notification', { error, notification_type });
    }
  }

  public async sendDocumentRenderedNotification(
    payload: DocumentRenderedNotificationPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'document_rendered',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendContributionStartedEvent(
    payload: ContributionGenerationStartedPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'contribution_generation_started',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendDialecticContributionStartedEvent(
    payload: DialecticContributionStartedPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'dialectic_contribution_started',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendContributionRetryingEvent(
    payload: ContributionGenerationRetryingPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'contribution_generation_retrying',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendContributionReceivedEvent(
    payload: DialecticContributionReceivedPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'dialectic_contribution_received',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendContributionGenerationContinuedEvent(
    payload: ContributionGenerationContinuedPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'contribution_generation_continued',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendContributionGenerationCompleteEvent(
    payload: ContributionGenerationCompletePayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'contribution_generation_complete',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendDialecticProgressUpdateEvent(
    payload: DialecticProgressUpdatePayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'dialectic_progress_update',
      is_internal_event: true,
      notification_data: payload,
    });
  }

  public async sendContributionFailedNotification(
    payload: ContributionGenerationFailedPayload,
    targetUserId: string,
  ): Promise<void> {
    const { projectId, sessionId, stageSlug, error } = payload;
    const message =
      `An error occurred while generating a contribution for the '${stageSlug}' stage. Details: ${error.message}`;
    const linkPath = `/projects/${projectId}/sessions/${sessionId}`;

    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: 'contribution_generation_failed',
      is_internal_event: false,
      title: 'Contribution Generation Failed',
      message: message,
      link_path: linkPath,
      notification_data: payload,
    });
  }

  public async sendContributionGenerationFailedEvent(
    payload: ContributionGenerationFailedInternalPayload,
    targetUserId: string,
  ): Promise<void> {
    await this._sendNotification({
      target_user_id: targetUserId,
      notification_type: payload.type,
      is_internal_event: true,
      notification_data: payload,
    });
  }
} 