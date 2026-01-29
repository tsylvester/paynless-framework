import { create } from 'zustand';
import { api } from '@paynless/api';
import type { Notification, ApiError, DialecticLifecycleEvent } from '@paynless/types';
import { logger, isDialecticLifecycleEventType, isDialecticContribution, isApiError } from '@paynless/utils';
import { useDialecticStore } from './dialecticStore';
import { useWalletStore } from './walletStore';

// Define state structure
export interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    error: ApiError | null;
    // --- NEW: State for Realtime Subscription ---
    subscribedUserId: string | null;
    // -------------------------------------------
    fetchNotifications: () => Promise<void>;
    addNotification: (notification: Notification) => void; // For incoming Realtime updates
    markNotificationRead: (notificationId: string) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
    // --- NEW: Actions for Realtime Subscription ---
    subscribeToUserNotifications: (userId: string) => void;
    unsubscribeFromUserNotifications: () => void;
    // --------------------------------------------
    // Exposed for testing, but considered internal
    handleIncomingNotification: (notification: Notification) => void;
}

// Helper function to calculate unread count
const calculateUnreadCount = (notifications: Notification[]): number => {
    return notifications.filter(n => !n.read).length;
};

// Helper function to sort notifications (newest first)
const sortNotifications = (notifications: Notification[]): Notification[] => {
    return [...notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const useNotificationStore = create<NotificationState>((set, get) => {

    // --- NEW: Internal Realtime Callback Handler ---
    const handleIncomingNotification = (notification: Notification | null | undefined) => {
        logger.info('[NotificationStore] Raw incoming notification from Supabase Realtime:', { notification });
        if (!notification || !notification.id || !notification.user_id || !notification.type) {
            logger.warn('[NotificationStore] Received invalid notification data from subscription.', { payload: notification ?? 'undefined/null' });
            return;
        }
        logger.debug('[NotificationStore] Received notification via Realtime', { id: notification.id, type: notification.type });

        // --- NEW: Simplified Routing Logic ---
        if (notification.is_internal_event) {
            logger.info(`[NotificationStore] Routing internal event: ${notification.type}`, { data: notification.data });
            // Map other_generation_failed -> contribution_generation_failed for store routing
            if (notification.type === 'other_generation_failed') {
                const data = notification.data;
                if (data && typeof (data)['sessionId'] === 'string' && isApiError((data)['error'])) {
                    const eventPayload: DialecticLifecycleEvent = {
                        type: 'contribution_generation_failed',
                        sessionId: (data)['sessionId'],
                        error: (data)['error'],
                        job_id: typeof (data)['job_id'] === 'string' ? (data)['job_id'] : undefined,
                    };
                    useDialecticStore.getState()._handleDialecticLifecycleEvent?.(eventPayload);
                } else {
                    logger.warn(`[NotificationStore] Internal event 'other_generation_failed' received, but its data payload did not match the expected format.`, { data });
                }
                return;
            }

            if (isDialecticLifecycleEventType(notification.type)) {
                if (notification.data) {
                    let eventPayload: DialecticLifecycleEvent | null = null;
                    const { type, data } = notification;

                    /**
                     * ====================================================================================
                     * NOTIFICATION EVENT TYPE MAPPING - SYSTEMATIC PAYLOAD EXTRACTION SPECIFICATION
                     * ====================================================================================
                     * 
                     * This mapping documents all DialecticLifecycleEvent types, their required/optional fields,
                     * current extraction status, and validation requirements. This serves as the specification
                     * for systematic payload extraction to ensure all optional fields are extracted consistently.
                     * 
                     * FORMAT FOR EACH EVENT TYPE:
                     * - Type Definition Location: File path and line numbers
                     * - Required Fields: Fields that MUST be present (no `?` in type definition)
                     * - Optional Fields: Fields marked with `?` in type definition
                     * - Current Extraction Status: Which fields are extracted, which are missing
                     * - Validation Requirements: What validation checks are performed
                     * 
                     * BASE TYPES:
                     * - DocumentLifecyclePayload (packages/types/src/dialectic.types.ts:757-766):
                     *   Required: sessionId, stageSlug, iterationNumber, job_id, document_key, modelId
                     *   Optional: step_key?: string, latestRenderedResourceId?: string | null
                     *   NOTE: latestRenderedResourceId allows null, not just undefined
                     * 
                     * ====================================================================================
                     */

                    /**
                     * 1. ContributionGenerationStartedPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:677-684
                     *    Required Fields: type, sessionId, modelId, iterationNumber, job_id
                     *    Optional Fields: NONE
                     *    Current Extraction Status: ✅ All required fields extracted (line 79)
                     *    Validation Requirements: sessionId (string), modelId (string), iterationNumber (number), job_id (string)
                     */

                    /**
                     * 2. DialecticContributionStartedPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:686-693
                     *    Required Fields: type, sessionId, modelId, iterationNumber, job_id
                     *    Optional Fields: NONE
                     *    Current Extraction Status: ✅ All required fields extracted (line 84)
                     *    Validation Requirements: sessionId (string), modelId (string), iterationNumber (number), job_id (string)
                     */

                    /**
                     * 3. ContributionGenerationRetryingPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:695-703
                     *    Required Fields: type, sessionId, modelId, iterationNumber, job_id
                     *    Optional Fields: error?: string
                     *    Current Extraction Status: ✅ All required fields extracted, ✅ error extracted (line 89)
                     *    Validation Requirements: sessionId (string), modelId (string), iterationNumber (number), job_id (string)
                     */

                    /**
                     * 4. DialecticContributionReceivedPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:705-712
                     *    Required Fields: type, sessionId, contribution, job_id, is_continuing
                     *    Optional Fields: NONE
                     *    Current Extraction Status: ✅ All required fields extracted (lines 94-100)
                     *    Validation Requirements: sessionId (string), job_id (string), contribution (DialecticContribution), is_continuing (boolean)
                     */

                    /**
                     * 5. ContributionGenerationFailedPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:714-721
                     *    Required Fields: type, sessionId
                     *    Optional Fields: job_id?: string, modelId?: string, error?: ApiError
                     *    Current Extraction Status: ✅ sessionId extracted, ✅ job_id extracted, ✅ modelId extracted, ✅ error extracted (line 105)
                     *    Validation Requirements: sessionId (string), error (ApiError)
                     */

                    /**
                     * 6. ContributionGenerationContinuedPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:723-733
                     *    Required Fields: type, sessionId, contribution, projectId, modelId, continuationNumber, job_id
                     *    Optional Fields: NONE
                     *    Current Extraction Status: ✅ All required fields extracted (line 266)
                     *    Validation Requirements: sessionId (string), projectId (string), modelId (string), continuationNumber (number), contribution (DialecticContribution), job_id (string)
                     */

                    /**
                     * 7. ContributionGenerationCompletePayload
                     *    Type Location: packages/types/src/dialectic.types.ts:735-740
                     *    Required Fields: type, sessionId, projectId
                     *    Optional Fields: NONE
                     *    Current Extraction Status: ✅ All required fields extracted (line 110)
                     *    Validation Requirements: sessionId (string), projectId (string)
                     */

                    /**
                     * 8. DialecticProgressUpdatePayload
                     *    Type Location: packages/types/src/dialectic.types.ts:742-749
                     *    Required Fields: type, sessionId, stageSlug, current_step, total_steps, message
                     *    Optional Fields: NONE
                     *    Current Extraction Status: ✅ All required fields extracted (lines 121-128)
                     *    Validation Requirements: sessionId (string), stageSlug (string), current_step (number), total_steps (number), message (string)
                     */

                    /**
                     * 9. PlannerStartedPayload
                     *    Type Location: packages/types/src/dialectic.types.ts:768-770
                     *    Base Type: DocumentLifecyclePayload (extends)
                     *    Required Fields: type, sessionId, stageSlug, iterationNumber, job_id, document_key, modelId (from base)
                     *    Optional Fields: step_key?: string, latestRenderedResourceId?: string | null (from base)
                     *    Current Extraction Status: ✅ All required fields extracted, ✅ step_key extracted, ✅ latestRenderedResourceId extracted (lines 353-374)
                     *    Validation Requirements: sessionId (string), stageSlug (string), iterationNumber (number), job_id (string), document_key (string), modelId (string)
                     */

                    /**
                     * 10. DocumentStartedPayload
                     *     Type Location: packages/types/src/dialectic.types.ts:772-774
                     *     Base Type: DocumentLifecyclePayload (extends)
                     *     Required Fields: type, sessionId, stageSlug, iterationNumber, job_id, document_key, modelId (from base)
                     *     Optional Fields: step_key?: string, latestRenderedResourceId?: string | null (from base)
                     *     Current Extraction Status: ✅ All required fields extracted, ✅ step_key extracted, ✅ latestRenderedResourceId extracted (lines 375-396)
                     *     Validation Requirements: sessionId (string), stageSlug (string), iterationNumber (number), job_id (string), document_key (string), modelId (string)
                     */

                    /**
                     * 11. DocumentChunkCompletedPayload
                     *     Type Location: packages/types/src/dialectic.types.ts:776-780
                     *     Base Type: DocumentLifecyclePayload (extends)
                     *     Required Fields: type, sessionId, stageSlug, iterationNumber, job_id, document_key, modelId (from base)
                     *     Optional Fields: step_key?: string, latestRenderedResourceId?: string | null (from base), isFinalChunk?: boolean, continuationNumber?: number (own)
                     *     Current Extraction Status: ✅ All required fields extracted, ✅ step_key extracted, ✅ isFinalChunk extracted, ✅ continuationNumber extracted, ✅ latestRenderedResourceId extracted (lines 397-420)
                     *     Validation Requirements: sessionId (string), stageSlug (string), iterationNumber (number), job_id (string), document_key (string), modelId (string)
                     */

                    /**
                     * 12. DocumentCompletedPayload
                     *     Type Location: packages/types/src/dialectic.types.ts:782-784
                     *     Base Type: DocumentLifecyclePayload (extends)
                     *     Required Fields: type, sessionId, stageSlug, iterationNumber, job_id, document_key, modelId (from base)
                     *     Optional Fields: step_key?: string, latestRenderedResourceId?: string | null (from base)
                     *     Current Extraction Status: ✅ All required fields extracted, ✅ step_key extracted, ✅ latestRenderedResourceId extracted (handles string | null | undefined) (lines 421-442)
                     *     Validation Requirements: sessionId (string), stageSlug (string), iterationNumber (number), job_id (string), document_key (string), modelId (string)
                     */

                    /**
                     * 13. RenderCompletedPayload
                     *     Type Location: packages/types/src/dialectic.types.ts:786-789
                     *     Base Type: DocumentLifecyclePayload (extends)
                     *     Required Fields: type, sessionId, stageSlug, iterationNumber, job_id, document_key, modelId, latestRenderedResourceId (latestRenderedResourceId is REQUIRED in this type, not optional)
                     *     Optional Fields: step_key?: string (from base)
                     *     Current Extraction Status: ✅ All required fields extracted, ✅ step_key extracted, ✅ latestRenderedResourceId extracted (lines 434-456)
                     *     Validation Requirements: sessionId (string), stageSlug (string), iterationNumber (number), job_id (string), document_key (string), modelId (string), latestRenderedResourceId (string - REQUIRED)
                     */

                    /**
                     * 14. JobFailedPayload
                     *     Type Location: packages/types/src/dialectic.types.ts:791-794
                     *     Base Type: DocumentLifecyclePayload (extends)
                     *     Required Fields: type, sessionId, stageSlug, iterationNumber, job_id, document_key, modelId, error (from own)
                     *     Optional Fields: step_key?: string, latestRenderedResourceId?: string | null (from base)
                     *     Current Extraction Status: ✅ All required fields extracted, ✅ step_key extracted, ✅ error extracted, ✅ latestRenderedResourceId extracted (lines 466-489)
                     *     Validation Requirements: sessionId (string), stageSlug (string), iterationNumber (number), job_id (string), document_key (string), modelId (string), error (ApiError)
                     */

                    /**
                     * ====================================================================================
                     * BASE TYPE INCONSISTENCY ANALYSIS
                     * ====================================================================================
                     * 
                     * DocumentLifecyclePayload is extended by 5 event types:
                     * - PlannerStartedPayload
                     * - DocumentStartedPayload
                     * - DocumentChunkCompletedPayload
                     * - DocumentCompletedPayload
                     * - JobFailedPayload
                     * 
                     * Optional field extraction status for latestRenderedResourceId (from base type):
                     * - PlannerStartedPayload: ✅ EXTRACTED (handles string | null | undefined)
                     * - DocumentStartedPayload: ✅ EXTRACTED (handles string | null | undefined)
                     * - DocumentChunkCompletedPayload: ✅ EXTRACTED (handles string | null | undefined)
                     * - DocumentCompletedPayload: ✅ EXTRACTED (handles string | null | undefined)
                     * - JobFailedPayload: ✅ EXTRACTED (handles string | null | undefined)
                     * 
                     * Optional field extraction status for step_key (from base type):
                     * - All 5 types: ✅ EXTRACTED consistently
                     * 
                     * CONCLUSION: All optional fields from DocumentLifecyclePayload are now extracted consistently
                     * across all extending types using the pattern: 
                     * `typeof data['latestRenderedResourceId'] === 'string' ? data['latestRenderedResourceId'] : (data['latestRenderedResourceId'] === null ? null : undefined)`
                     * 
                     * ====================================================================================
                     * WALLET_TRANSACTION VALIDATION
                     * ====================================================================================
                     * 
                     * Event Type: WALLET_TRANSACTION (not in DialecticLifecycleEvent union)
                     * Location: notificationStore.ts:502-515
                     * Required Fields: walletId (string), newBalance (string)
                     * Current Behavior: ✅ FIXED - Only calls get().addNotification(notification) when validation passes.
                     * Invalid notifications are logged with an error and the function returns early without adding to the notification list.
                     * 
                     * ====================================================================================
                     */

                    /**
                     * This switch statement constructs type-safe payloads from notification data.
                     * 
                     * SYSTEMATIC EXTRACTION REQUIREMENTS:
                     * - Each case must extract ALL optional fields defined in the corresponding type definition.
                     * - Base type optional fields (e.g., `latestRenderedResourceId` from `DocumentLifecyclePayload`)
                     *   must be extracted consistently across all extending types.
                     * - Validation failures must prevent invalid notifications from being added to the notification list.
                     * 
                     * EXTRACTION PATTERN:
                     * For optional fields that allow `string | null | undefined`:
                     *   fieldName: typeof data['fieldName'] === 'string' 
                     *       ? data['fieldName'] 
                     *       : (data['fieldName'] === null ? null : undefined)
                     * 
                     * For optional fields that only allow `string | undefined`:
                     *   fieldName: typeof data['fieldName'] === 'string' ? data['fieldName'] : undefined
                     */
                    switch (type) {
                        case 'contribution_generation_started':
                            if (typeof data['sessionId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['iterationNumber'] === 'number' && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], modelId: data['modelId'], iterationNumber: data['iterationNumber'], job_id: data['job_id'] };
                            }
                            break;
                        case 'dialectic_contribution_started':
                             if (typeof data['sessionId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['iterationNumber'] === 'number' && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], modelId: data['modelId'], iterationNumber: data['iterationNumber'], job_id: data['job_id'] };
                            }
                            break;
                        case 'contribution_generation_retrying':
                             if (typeof data['sessionId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['iterationNumber'] === 'number' && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], modelId: data['modelId'], iterationNumber: data['iterationNumber'], job_id: data['job_id'], error: typeof data['error'] === 'string' ? data['error'] : undefined };
                            }
                            break;
                        case 'dialectic_contribution_received':
                             if (typeof data['sessionId'] === 'string' && typeof data['job_id'] === 'string' && isDialecticContribution(data['contribution'])) {
                                eventPayload = { 
                                    type, 
                                    sessionId: data['sessionId'], 
                                    contribution: data['contribution'],
                                    job_id: data['job_id'],
                                    is_continuing: typeof data['is_continuing'] === 'boolean' ? data['is_continuing'] : false,
                                };
                            }
                            break;
                        case 'contribution_generation_failed':
                             if (typeof data['sessionId'] === 'string' && isApiError(data['error'])) {
                                eventPayload = { type, sessionId: data['sessionId'], error: data['error'], job_id: typeof data['job_id'] === 'string' ? data['job_id'] : undefined, modelId: typeof data['modelId'] === 'string' ? data['modelId'] : undefined };
                            }
                            break;
                        case 'contribution_generation_complete':
                            if (typeof data['sessionId'] === 'string' && typeof data['projectId'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], projectId: data['projectId'] };
                            }
                            break;
                        case 'dialectic_progress_update':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['current_step'] === 'number' &&
                                typeof data['total_steps'] === 'number' &&
                                typeof data['message'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    current_step: data['current_step'],
                                    total_steps: data['total_steps'],
                                    message: data['message'],
                                };
                            }
                            break;
                        case 'planner_started':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    latestRenderedResourceId: typeof data['latestRenderedResourceId'] === 'string' ? data['latestRenderedResourceId'] : (data['latestRenderedResourceId'] === null ? null : undefined),
                                };
                            }
                            break;
                        case 'document_started':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    latestRenderedResourceId: typeof data['latestRenderedResourceId'] === 'string' ? data['latestRenderedResourceId'] : (data['latestRenderedResourceId'] === null ? null : undefined),
                                };
                            }
                            break;
                        case 'document_chunk_completed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    isFinalChunk: typeof data['isFinalChunk'] === 'boolean' ? data['isFinalChunk'] : undefined,
                                    continuationNumber: typeof data['continuationNumber'] === 'number' ? data['continuationNumber'] : undefined,
                                    latestRenderedResourceId: typeof data['latestRenderedResourceId'] === 'string' ? data['latestRenderedResourceId'] : (data['latestRenderedResourceId'] === null ? null : undefined),
                                };
                            }
                            break;
                        case 'document_completed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    latestRenderedResourceId: typeof data['latestRenderedResourceId'] === 'string' ? data['latestRenderedResourceId'] : (data['latestRenderedResourceId'] === null ? null : undefined),
                                };
                            }
                            break;
                        case 'render_completed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string' &&
                                typeof data['latestRenderedResourceId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    latestRenderedResourceId: data['latestRenderedResourceId'],
                                };
                            }
                            break;
                        case 'job_failed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string' &&
                                isApiError(data['error'])
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    error: data['error'],
                                    latestRenderedResourceId: typeof data['latestRenderedResourceId'] === 'string' ? data['latestRenderedResourceId'] : (data['latestRenderedResourceId'] === null ? null : undefined),
                                };
                            }
                            break;
                        case 'contribution_generation_continued':
                             if (typeof data['sessionId'] === 'string' && typeof data['projectId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['continuationNumber'] === 'number' && isDialecticContribution(data['contribution']) && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], projectId: data['projectId'], modelId: data['modelId'], continuationNumber: data['continuationNumber'], contribution: data['contribution'], job_id: data['job_id'] };
                            }
                            break;
                    }

                    if (eventPayload) {
                        useDialecticStore.getState()._handleDialecticLifecycleEvent?.(eventPayload);
                    } else {
                        logger.warn(`[NotificationStore] Internal event '${type}' received, but its data payload did not match the expected format.`, { data });
                    }
                } else {
                    logger.warn(`[NotificationStore] Received internal event '${notification.type}' with no data.`);
                }
            } else {
                logger.warn(`[NotificationStore] Received internal event with an unknown or unhandled type: '${notification.type}'`);
            }
            return;
        }

        if (notification.type === 'WALLET_TRANSACTION') {
            const { data } = notification;
            if (data && typeof data === 'object' && 'walletId' in data && typeof data['walletId'] === 'string' && 'newBalance' in data && typeof data['newBalance'] === 'number') {
                logger.info('[NotificationStore] Handling wallet transaction event.', { data });
                useWalletStore.getState()._handleWalletUpdateNotification({
                    walletId: data['walletId'],
                    newBalance: String(data['newBalance']),
                });
                get().addNotification(notification);
            } else {
                logger.error('[NotificationStore] Received WALLET_TRANSACTION event with invalid data.', { data });
            }
            return;
        }
        
        get().addNotification(notification);
    };
    // -------------------------------------------

    return {
        // Initial state
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        // --- NEW: Realtime State ---
        subscribedUserId: null,
        // --------------------------
        handleIncomingNotification, // Exposed for testing

        // Actions
        fetchNotifications: async () => {
            if (!get().isLoading) {
                set({ isLoading: true, error: null });
            }
            try {
                const notificationApi = api.notifications();
                const response = await notificationApi.fetchNotifications();
                if (response.error) {
                    logger.error('[notificationStore] Failed to fetch notifications', { error: response.error });
                    set({ error: response.error, isLoading: false, notifications: [], unreadCount: 0 });
                } else {
                    const fetchedNotifications = response.data ?? [];
                    // Filter out internal events that should not be displayed in the UI.
                    const userFacingNotifications = fetchedNotifications.filter(n => !n.is_internal_event);
                    const sortedNotifications = sortNotifications(userFacingNotifications);
                    const unreadCount = calculateUnreadCount(sortedNotifications);
                    logger.info(`[notificationStore] Fetched ${fetchedNotifications.length} total notifications, showing ${userFacingNotifications.length} user-facing notifications. ${unreadCount} are unread.`);
                    set({
                        notifications: sortedNotifications,
                        unreadCount: unreadCount,
                        isLoading: false,
                        error: null,
                    });
                }
            } catch (error: unknown) {
                logger.error('[notificationStore] Error during initial load:', { 
                    error: error instanceof Error ? error.message : String(error) 
                });
                // Create ApiError object
                const apiError: ApiError = {
                    code: 'FETCH_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to load notifications'
                };
                set({ isLoading: false, error: apiError });
            }
        },

        addNotification: (notification) => {
            set(state => {
                if (state.notifications.some(n => n.id === notification.id)) {
                    logger.warn('[notificationStore] Attempted to add duplicate notification', { id: notification.id });
                    return {};
                }
                logger.debug('[notificationStore] Added notification', { notificationId: notification.id });
                const newNotifications = sortNotifications([notification, ...state.notifications]);
                const newUnreadCount = calculateUnreadCount(newNotifications);
                return { notifications: newNotifications, unreadCount: newUnreadCount };
            });
        },

        markNotificationRead: async (notificationId) => {
            const currentNotifications = get().notifications;
            const notification = currentNotifications.find(n => n.id === notificationId);

            if (!notification) {
                logger.warn('[notificationStore] markNotificationRead: Notification not found', { notificationId });
                return;
            }
            if (notification.read) {
                logger.debug('[notificationStore] Notification already read', { notificationId });
                return;
            }

            set({ error: null });
            try {
                const notificationApi = api.notifications();
                const response = await notificationApi.markNotificationRead(notificationId);

                if (response.error) {
                    logger.error('[notificationStore] Failed to mark notification as read', { notificationId, error: response.error });
                    set({ error: response.error });
                } else {
                    logger.info('[notificationStore] Marked notification as read', { notificationId });
                    set(state => {
                        const updatedNotifications = state.notifications.map(n =>
                            n.id === notificationId ? { ...n, read: true } : n
                        );
                        const newUnreadCount = calculateUnreadCount(updatedNotifications);
                        return {
                            notifications: updatedNotifications,
                            unreadCount: newUnreadCount,
                            error: null
                        };
                    });
                }
            } catch (error: unknown) {
                logger.error(`Error marking notification ${notificationId} as read:`, { 
                    error: error instanceof Error ? error.message : String(error) 
                });
                // Create ApiError object
                const apiError: ApiError = {
                    code: 'MARK_READ_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to mark notification as read'
                };
                set({ error: apiError });
            }
        },

        markAllNotificationsAsRead: async () => {
            if (get().unreadCount === 0) {
                logger.debug('No unread notifications to mark as read.');
                return;
            }

            set({ error: null });
            try {
                const notificationApi = api.notifications();
                const response = await notificationApi.markAllNotificationsAsRead();

                if (response.error) {
                    logger.error('[notificationStore] Failed to mark all notifications as read', { error: response.error });
                    set({ error: response.error });
                } else {
                    logger.info('[notificationStore] Marked all notifications as read');
                    set(state => ({
                        notifications: state.notifications.map(n => ({ ...n, read: true })),
                        unreadCount: 0,
                        error: null
                    }));
                }
            } catch (error: unknown) {
                logger.error('Error marking all notifications as read:', { 
                     error: error instanceof Error ? error.message : String(error) 
                });
                 // Create ApiError object
                 const apiError: ApiError = {
                    code: 'MARK_ALL_READ_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to mark all notifications as read'
                 };
                 set({ error: apiError });
            }
        },

        // --- NEW: Realtime Actions Implementation ---
        subscribeToUserNotifications: (userId: string) => {
            if (!userId) {
                logger.error('User ID is required to subscribe to notifications.');
                return;
            }

            const currentSubscribedId = get().subscribedUserId;

            if (currentSubscribedId === userId) {
                logger.warn('[NotificationStore] Already subscribed to notifications for user:', { userId });
                return;
            }

            if (currentSubscribedId) {
                logger.info(`[NotificationStore] Switching subscription from user ${currentSubscribedId} to ${userId}`);
                get().unsubscribeFromUserNotifications();
            }

            logger.info('[NotificationStore] Subscribing to notifications for user:', { userId });
            try {
                const notificationApi = api.notifications();
                const channel = notificationApi.subscribeToNotifications(userId, get().handleIncomingNotification);

                if (channel) {
                    set({ subscribedUserId: userId, error: null });
                    logger.info('[NotificationStore] Successfully subscribed to notification channel for user:', { userId });
                } else {
                    logger.error('[NotificationStore] Failed to subscribe to notifications, API returned null channel for user:', { userId });
                    set({ subscribedUserId: null });
                }
            } catch (error: unknown) {
                logger.error('[NotificationStore] Error calling subscribeToNotifications:', { 
                    userId, 
                    error: error instanceof Error ? error.message : String(error) 
                });
                set({ subscribedUserId: null, error: { code: 'SUBSCRIBE_ERROR', message: error instanceof Error ? error.message : String(error) } });
            }
        },

        unsubscribeFromUserNotifications: () => {
            const currentSubscribedId = get().subscribedUserId;
            if (!currentSubscribedId) {
                logger.debug('Not currently subscribed to notifications, skipping unsubscribe.');
                return;
            }

            logger.info('Unsubscribing from notifications.');
            try {
                const notificationApi = api.notifications();
                notificationApi.unsubscribeFromNotifications();
                set({ subscribedUserId: null });
                logger.info('Successfully unsubscribed from notifications for user:', { userId: currentSubscribedId });
            } catch (error: unknown) {
                logger.error('[NotificationStore] Error calling unsubscribeFromNotifications:', { 
                    userId: currentSubscribedId, 
                    error: error instanceof Error ? error.message : String(error) 
                });
                set({ subscribedUserId: null, error: { code: 'UNSUBSCRIBE_ERROR', message: error instanceof Error ? error.message : String(error) } });
            }
        },
        // -----------------------------------------
    }
}); 