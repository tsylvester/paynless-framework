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
    sendContributionGenerationFailedEvent(payload: ContributionGenerationFailedInternalPayload, targetUserId: string): Promise<void>;
    sendJobNotificationEvent(payload: JobNotificationEvent, targetUserId: string): Promise<void>;
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
    modelId: string;
    iterationNumber: number;
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

  // Internal (store-routing) failure event payload used for UI state updates
  export interface ContributionGenerationFailedInternalPayload {
    type: 'other_generation_failed'; // event name; test constructs plain string
    sessionId: string;
    job_id?: string;
    error: ApiError;
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

// ------------------------------
// Job notification type hierarchy (PLAN / EXECUTE / RENDER lifecycle, unified job_failed)
// Base and stage-specific payloads for progress tracking

export interface JobNotificationBase {
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  job_id: string;
  step_key: string;
}

// PLAN: orchestration only — no modelId, no document_key
export interface PlannerPayload extends JobNotificationBase {}

export interface PlannerStartedPayload extends PlannerPayload {
  type: 'planner_started';
}

export interface PlannerCompletedPayload extends PlannerPayload {
  type: 'planner_completed';
}

// EXECUTE: modelId required, document_key optional
export interface ExecutePayload extends JobNotificationBase {
  modelId: string;
  document_key?: string;
}

export interface ExecuteStartedPayload extends ExecutePayload {
  type: 'execute_started';
}

export interface ExecuteChunkCompletedPayload extends ExecutePayload {
  type: 'execute_chunk_completed';
}

export interface ExecuteCompletedPayload extends ExecutePayload {
  type: 'execute_completed';
}

// RENDER: modelId and document_key both required
export interface RenderPayload extends JobNotificationBase {
  modelId: string;
  document_key: string;
}

export interface RenderStartedPayload extends RenderPayload {
  type: 'render_started';
}

export interface RenderChunkCompletedPayload extends RenderPayload {
  type: 'render_chunk_completed';
}

export interface RenderCompletedPayload extends RenderPayload {
  type: 'render_completed';
  latestRenderedResourceId: string;
}

// Unified failure payload: optional modelId and document_key per stage
export interface JobFailedPayload extends JobNotificationBase {
  type: 'job_failed';
  error: ApiError;
  modelId?: string;
  document_key?: string;
}

export type JobNotificationEvent =
  | PlannerStartedPayload
  | PlannerCompletedPayload
  | ExecuteStartedPayload
  | ExecuteChunkCompletedPayload
  | ExecuteCompletedPayload
  | RenderStartedPayload
  | RenderChunkCompletedPayload
  | RenderCompletedPayload
  | JobFailedPayload;