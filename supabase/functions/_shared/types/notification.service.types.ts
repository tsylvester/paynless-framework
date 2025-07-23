import type { Database } from '@paynless/db-types';

export interface NotificationServiceType {
    sendContributionStartedEvent(payload: ContributionGenerationStartedPayload, targetUserId: string): Promise<void>;
    sendDialecticContributionStartedEvent(payload: DialecticContributionStartedPayload, targetUserId: string): Promise<void>;
    sendContributionReceivedEvent(payload: DialecticContributionReceivedPayload, targetUserId: string): Promise<void>;
    sendContributionRetryingEvent(payload: ContributionGenerationRetryingPayload, targetUserId: string): Promise<void>;
    sendContributionFailedNotification(payload: ContributionGenerationFailedPayload, targetUserId: string): Promise<void>;
    sendContributionGenerationCompleteEvent(payload: ContributionGenerationCompletePayload, targetUserId: string): Promise<void>;
    sendContributionGenerationContinuedEvent(payload: ContributionGenerationContinuedPayload, targetUserId: string): Promise<void>;
    sendDialecticProgressUpdateEvent(payload: DialecticProgressUpdatePayload, targetUserId: string): Promise<void>;
}

export interface RpcNotification<T> {
  target_user_id: string;
  notification_type: string;
  is_internal_event: boolean;
  title?: string;
  message?: string;
  link_path?: string;
  notification_data: T;
}

export type DialecticContributionRow = Database['public']['Tables']['dialectic_contributions']['Row'];
export type DialecticJobRow = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export interface ApiError {
    code: string;
    message: string;
    details?: unknown;
  }
  

export interface ContributionGenerationStartedPayload {
    // This is the overall contribution generation for the entire session stage. 
    type: 'contribution_generation_started';
    sessionId: string;
    job_id: string;
  }
  
  export interface DialecticContributionStartedPayload {
    // This is the individual contribution generation for a specific model. 
    type: 'dialectic_contribution_started';
    sessionId: string;
    modelId: string;
    iterationNumber: number;
    job_id: string;
  }
  
  export interface ContributionGenerationRetryingPayload {
    // This is the individual contribution generation for a specific model. 
    type: 'contribution_generation_retrying';
    sessionId: string;
    modelId: string;
    iterationNumber: number;
    error?: string;
    job_id: string;
  }
  
  export interface DialecticContributionReceivedPayload {
    // This is the individual contribution generation for a specific model. 
    type: 'dialectic_contribution_received';
    sessionId: string;
    contribution: DialecticContributionRow;
    job_id: string;
    is_continuing: boolean;
  }
  
  export interface ContributionGenerationFailedPayload {
    // This is a specific model failing for all of its retries.  
    type: 'contribution_generation_failed';
    sessionId: string;
    projectId: string;
    stageSlug: string;
    error: ApiError;
    job_id: string;
  }
  
  export interface ContributionGenerationContinuedPayload {
    // This is a specific model that is continuing its generation because its internal stop reason was not "stop". 
    // The most common continuation reasons are "max_tokens_reached" and "length". 
    type: 'contribution_generation_continued';
    sessionId: string;
    contribution: DialecticContributionRow;
    projectId: string;
    modelId: string;
    continuationNumber: number;
    job_id: string;
  }
  
  export interface ContributionGenerationCompletePayload {
    // This is a specific model that has completed its generation. 
    type: 'contribution_generation_complete';
    sessionId: string;
    projectId: string;
    job_id: string;
  }
  
  export interface DialecticProgressUpdatePayload {
    type: 'dialectic_progress_update';
    sessionId: string;
    stageSlug: string;
    current_step: number;
    total_steps: number;
    message: string;
    job_id: string;
  }
  
  export interface ProgressData {
    current_step: number;
    total_steps: number;
    message: string;
  }
  
  export type DialecticLifecycleEvent = 
  ContributionGenerationStartedPayload 
  | DialecticContributionStartedPayload 
  | ContributionGenerationRetryingPayload 
  | DialecticContributionReceivedPayload 
  | ContributionGenerationFailedPayload 
  | ContributionGenerationContinuedPayload
  | ContributionGenerationCompletePayload
  | DialecticProgressUpdatePayload;