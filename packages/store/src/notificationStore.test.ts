// packages/store/src/notificationStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act } from '@testing-library/react';
// --- Update import: NotificationState might not be exported, adjust if needed ---
import { useNotificationStore /* NotificationState */ } from './notificationStore';
// --- Remove StreamCallbacks, StreamDisconnectFunction if no longer used ---
import type { Notification, ApiError, ApiResponse /* StreamCallbacks, StreamDisconnectFunction */ } from '@paynless/types';
import { mockLogger, resetMockLogger } from '../../api/src/mocks/logger.mock';
// --- Add Supabase types if needed for mocks ---
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createMockNotificationApiClient, resetMockNotificationApiClient } from '@paynless/api/mocks/notifications.api.mock';

vi.mock('@paynless/utils', async (importOriginal) => {
    const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
    const { mockLogger: loggerMock, resetMockLogger: resetLoggerMock } = await import('../../api/src/mocks/logger.mock');

    return {
        ...actualUtils,
        logger: loggerMock,
        resetMockLogger: resetLoggerMock,
    };
});

// --- Mock the dialecticStore to spy on its internal methods ---
const mockHandleDialecticLifecycleEvent = vi.fn();
vi.mock('./dialecticStore', () => ({
  useDialecticStore: {
    getState: () => ({
      _handleDialecticLifecycleEvent: mockHandleDialecticLifecycleEvent,
    }),
  },
}));

// --- NEW: Mock walletStore for wallet transaction events ---
const mockHandleWalletUpdate = vi.fn();
vi.mock('./walletStore', () => ({
    useWalletStore: {
        getState: () => ({
            _handleWalletUpdateNotification: mockHandleWalletUpdate,
        }),
    },
}));

// --- Create an instance of the shared mock ---
const mockNotificationApi = createMockNotificationApiClient();

// --- Mock the Realtime Channel used by subscribe ---
const mockRealtimeChannel: RealtimeChannel = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
} as unknown as RealtimeChannel;

// --- Variable to capture the callback passed to subscribe ---
let capturedNotificationCallback: ((notification: Notification) => void) | null = null;

// --- Mock the @paynless/api module to provide the mock API client instance ---
vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        // Keep other exports from the actual module if needed
        ...actualApiModule,
        // Override the NotificationApiClient class with a factory returning our mock instance
        NotificationApiClient: vi.fn(() => mockNotificationApi), 
        // Also mock the 'api' object if the store uses it directly (e.g., api.notifications())
        api: { 
            // Replace with a function that returns the mock instance
            notifications: () => mockNotificationApi, 
            // Add mocks for other api parts (organizations, ai, etc.) if needed by other tests 
            // or if this test file inadvertently calls them
            organizations: vi.fn(), // Placeholder
            ai: vi.fn(),           // Placeholder
            // ... other potential api parts
        }
    };
});

const initialState = useNotificationStore.getState();

// Mock Notification Data (Keep as is)
const mockNotification1: Notification = {
    id: 'uuid-1',
    user_id: 'user-abc',
    type: 'test',
    data: { message: 'Test 1' },
    read: false,
    created_at: new Date(Date.now() - 10000).toISOString(),
    is_internal_event: false, // For standard notifications
    title: 'Test Title 1',
    message: 'Test Message 1',
    link_path: null,
};
const mockNotification2: Notification = {
    id: 'uuid-2',
    user_id: 'user-abc',
    type: 'test',
    data: { message: 'Test 2', target_path: 'some/path' },
    read: false,
    created_at: new Date(Date.now() - 5000).toISOString(),
    is_internal_event: false, // For standard notifications
    title: 'Test Title 2',
    message: 'Test Message 2',
    link_path: 'some/path',
};
const mockNotification3: Notification = {
    id: 'uuid-3',
    user_id: 'user-abc',
    type: 'another',
    data: null,
    read: true, // Already read
    created_at: new Date(Date.now() - 20000).toISOString(),
    is_internal_event: false, // For standard notifications
    title: 'Test Title 3',
    message: 'Test Message 3',
    link_path: null,
};
const baseDocumentEvent = {
    user_id: 'user-abc',
    read: true,
    created_at: new Date().toISOString(),
    is_internal_event: true,
    title: null,
    message: null,
    link_path: null,
};

const plannerStartedNotification: Notification = {
    ...baseDocumentEvent,
    id: 'uuid-planner-started',
    type: 'planner_started',
    data: {
        sessionId: 'sid-123',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-planner',
        document_key: 'global_header',
        modelId: 'model-planner',
        step_key: 'planner-step-1',
    },
};

const documentStartedNotification: Notification = {
    ...baseDocumentEvent,
    id: 'uuid-document-started',
    type: 'document_started',
    data: {
        sessionId: 'sid-123',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-doc',
        document_key: 'business_case',
        modelId: 'model-doc',
        step_key: 'execute-step-1',
    },
};

const chunkCompletedNotification: Notification = {
    ...baseDocumentEvent,
    id: 'uuid-chunk-completed',
    type: 'document_chunk_completed',
    data: {
        sessionId: 'sid-123',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-doc',
        document_key: 'business_case',
        modelId: 'model-doc',
        step_key: 'execute-step-1',
        isFinalChunk: false,
        continuationNumber: 2,
    },
};

const renderCompletedNotification: Notification = {
    ...baseDocumentEvent,
    id: 'uuid-render-completed',
    type: 'render_completed',
    data: {
        sessionId: 'sid-123',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-render',
        document_key: 'business_case',
        modelId: 'model-render',
        step_key: 'render-step-1',
        latestRenderedResourceId: 'resource-123',
    },
};

const jobFailedNotification: Notification = {
    ...baseDocumentEvent,
    id: 'uuid-job-failed',
    type: 'job_failed',
    data: {
        sessionId: 'sid-123',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-doc',
        document_key: 'business_case',
        modelId: 'model-doc',
        step_key: 'execute-step-1',
        error: { code: 'MODEL_FAILURE', message: 'LLM aborted early' },
    },
};

// --- Test Suite ---
describe('notificationStore', () => {
    // Reset store state and mocks before each test
    beforeEach(() => {
        act(() => {
            useNotificationStore.setState(initialState, true); // Replace state
        });
        vi.clearAllMocks();
        // Use the shared reset function for the mock API client
        resetMockNotificationApiClient(mockNotificationApi);
        
        // --- NEW: Reset walletStore mock ---
        mockHandleWalletUpdate.mockClear();
        
        // Reset Realtime specific mocks
        mockRealtimeChannel.unsubscribe = vi.fn();
        capturedNotificationCallback = null; // Clear captured callback

        // --- Mocks for the API methods are now part of mockNotificationApi ---
        // Default success mock for fetch
        vi.mocked(mockNotificationApi.fetchNotifications).mockResolvedValue({ data: [], status: 200 });
        // Default success mock for mark read
        vi.mocked(mockNotificationApi.markNotificationRead).mockResolvedValue({ data: undefined, status: 204 });
        // Default success mock for mark all read
        vi.mocked(mockNotificationApi.markAllNotificationsAsRead).mockResolvedValue({ data: undefined, status: 204 });
        
        // --- NEW: Default mocks for realtime subscription methods ---
        vi.mocked(mockNotificationApi.subscribeToNotifications).mockImplementation(
            (userId: string, callback: (notification: Notification) => void) => {
                if (!userId) return null;
                capturedNotificationCallback = callback;
                return mockRealtimeChannel;
            }
        );
        vi.mocked(mockNotificationApi.unsubscribeFromNotifications).mockImplementation(() => {
            // This is synchronous in the store
        });
        
        // Reset logger mocks
        resetMockLogger();
    });

    afterEach(() => {
        // Clear mocks after each test to ensure isolation
        mockHandleDialecticLifecycleEvent.mockClear();
    });

    it('should have correct initial state', () => {
        expect(useNotificationStore.getState().notifications).toEqual([]);
        expect(useNotificationStore.getState().unreadCount).toBe(0);
        expect(useNotificationStore.getState().isLoading).toBe(false);
        expect(useNotificationStore.getState().error).toBeNull();
    });

    describe('Actions', () => {
        describe('fetchNotifications', () => {
            it('should set notifications and unread count on successful fetch', async () => {
                const mockNotifications = [mockNotification1, mockNotification2, mockNotification3];
                // Use the mock API instance
                vi.mocked(mockNotificationApi.fetchNotifications).mockResolvedValue({ data: mockNotifications, status: 200 });
                await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([mockNotification2, mockNotification1, mockNotification3]);
                expect(state.unreadCount).toBe(2);
                expect(mockNotificationApi.fetchNotifications).toHaveBeenCalledTimes(1);
            });
            
            it('should handle null data on successful fetch', async () => {
                 // Use the mock API instance
                vi.mocked(mockNotificationApi.fetchNotifications).mockResolvedValue({ data: undefined, status: 200 });
                await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([]);
                expect(state.unreadCount).toBe(0);
                expect(mockNotificationApi.fetchNotifications).toHaveBeenCalledTimes(1);
            });

            it('should set loading state during fetch', async () => {
                const mockNotifications = [mockNotification1];
                const fetchPromise = new Promise<ApiResponse<Notification[]>>((resolve) => setTimeout(() => resolve({ data: mockNotifications, status: 200, error: undefined }), 20));
                // Use the mock API instance
                vi.mocked(mockNotificationApi.fetchNotifications).mockReturnValue(fetchPromise);

                await act(async () => {
                    const storePromise = useNotificationStore.getState().fetchNotifications();
                    expect(useNotificationStore.getState().isLoading).toBe(true);
                    await storePromise; 
                    expect(useNotificationStore.getState().isLoading).toBe(false);
                });
                expect(useNotificationStore.getState().isLoading).toBe(false);
            });

            it('should set error state on failed fetch', async () => {
                 const mockError: ApiError = { code: 'FETCH_ERROR', message: 'Failed to fetch' };
                 // Use the mock API instance
                 vi.mocked(mockNotificationApi.fetchNotifications).mockResolvedValue({ error: mockError, status: 500 });
                 await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                 const state = useNotificationStore.getState();
                 expect(state.isLoading).toBe(false);
                 expect(state.error).toEqual(mockError);
                 expect(state.notifications).toEqual([]);
                 expect(state.unreadCount).toBe(0);
                 expect(mockNotificationApi.fetchNotifications).toHaveBeenCalledTimes(1);
                 expect(mockLogger.error).toHaveBeenCalledWith('[notificationStore] Failed to fetch notifications', { error: mockError });
            });
        });

        // Assuming addNotification is still internal / triggered by subscribe
        describe('addNotification (Internal - called by Realtime subscription callback)', () => {
            // These tests remain largely the same, as they test the store's internal logic
            it('should prepend a new notification and increment unread count', () => {
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); }); 
                 act(() => { useNotificationStore.getState().addNotification(mockNotification2);
                 });
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification2, mockNotification1]);
                 expect(state.unreadCount).toBe(2);
                 expect(mockLogger.debug).toHaveBeenCalledWith('[notificationStore] Added notification', { notificationId: mockNotification2.id });
            });
            
            it('should prepend a new notification but not increment count if already read', () => {
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); });
                 act(() => { useNotificationStore.getState().addNotification(mockNotification3); }); 
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification1, mockNotification3]);
                 expect(state.unreadCount).toBe(1); 
                 expect(mockLogger.debug).toHaveBeenCalledWith('[notificationStore] Added notification', { notificationId: mockNotification3.id });
            });
             
            it('should not add a duplicate notification based on ID', () => {
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); });
                 act(() => { useNotificationStore.getState().addNotification(mockNotification1); });
                 const state = useNotificationStore.getState();
                 expect(state.notifications.length).toBe(1);
                 expect(state.unreadCount).toBe(1);
                 expect(mockLogger.warn).toHaveBeenCalledWith('[notificationStore] Attempted to add duplicate notification', { id: mockNotification1.id });
            });
        });

        describe('handleIncomingNotification (Internal - called by Realtime subscription callback)', () => {
            it('should call addNotification for standard, user-facing notifications', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');
                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(mockNotification1);
                });
                expect(addNotificationSpy).toHaveBeenCalledWith(mockNotification1);
                expect(mockHandleDialecticLifecycleEvent).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            it('should route planner_started events to the dialectic store without creating a visible notification', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(plannerStartedNotification);
                });

                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'planner_started',
                    sessionId: 'sid-123',
                    stageSlug: 'thesis',
                    iterationNumber: 1,
                    job_id: 'job-planner',
                    document_key: 'global_header',
                    modelId: 'model-planner',
                    step_key: 'planner-step-1',
                });

                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            it('should route document_started events to the dialectic store without creating a visible notification', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(documentStartedNotification);
                });

                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'document_started',
                    sessionId: 'sid-123',
                    stageSlug: 'thesis',
                    iterationNumber: 1,
                    job_id: 'job-doc',
                    document_key: 'business_case',
                    modelId: 'model-doc',
                    step_key: 'execute-step-1',
                });

                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            it('should route document_chunk_completed events to the dialectic store without creating a visible notification', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(chunkCompletedNotification);
                });

                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'document_chunk_completed',
                    sessionId: 'sid-123',
                    stageSlug: 'thesis',
                    iterationNumber: 1,
                    job_id: 'job-doc',
                    document_key: 'business_case',
                    modelId: 'model-doc',
                    step_key: 'execute-step-1',
                    isFinalChunk: false,
                    continuationNumber: 2,
                });

                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            it('should route render_completed events to the dialectic store without creating a visible notification', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(renderCompletedNotification);
                });

                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'render_completed',
                    sessionId: 'sid-123',
                    stageSlug: 'thesis',
                    iterationNumber: 1,
                    job_id: 'job-render',
                    document_key: 'business_case',
                    modelId: 'model-render',
                    step_key: 'render-step-1',
                    latestRenderedResourceId: 'resource-123',
                });

                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            it('should route job_failed events to the dialectic store without creating a visible notification', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(jobFailedNotification);
                });

                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'job_failed',
                    sessionId: 'sid-123',
                    stageSlug: 'thesis',
                    iterationNumber: 1,
                    job_id: 'job-doc',
                    document_key: 'business_case',
                    modelId: 'model-doc',
                    step_key: 'execute-step-1',
                    error: { code: 'MODEL_FAILURE', message: 'LLM aborted early' },
                });

                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            
            it('should not process wallet notifications as internal events', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');
                const walletNotification: Notification = {
                    ...mockNotification1,
                    id: 'wallet-noti-1',
                    type: 'WALLET_TRANSACTION',
                    data: { walletId: 'wallet-xyz', newBalance: '1000' },
                    is_internal_event: false, // Wallet notifications are user-facing
                };

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(walletNotification);
                });

                // Should call the special wallet handler
                expect(mockHandleWalletUpdate).toHaveBeenCalledWith(walletNotification.data);
                // Should ALSO still add it to the general notification list
                expect(addNotificationSpy).toHaveBeenCalledWith(walletNotification);
                // Should NOT be routed to the dialectic handler
                expect(mockHandleDialecticLifecycleEvent).not.toHaveBeenCalled();
                
                addNotificationSpy.mockRestore();
            });
            
            it('should route internal failed events with job_id and error preserved (NSF) to the dialecticStore', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');
                const failedInternalNotification: Notification = {
                    id: 'uuid-internal-fail-1',
                    user_id: 'user-abc',
                    type: 'contribution_generation_failed',
                    data: {
                        sessionId: 'sid-123',
                        job_id: 'job-1',
                        error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds to cover the input prompt cost.' },
                    },
                    read: true,
                    created_at: new Date().toISOString(),
                    is_internal_event: true,
                    title: null,
                    message: null,
                    link_path: null,
                };

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(failedInternalNotification);
                });

                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'contribution_generation_failed',
                    sessionId: 'sid-123',
                    job_id: 'job-1',
                    error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds to cover the input prompt cost.' },
                });
                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });

            it('should route other_generation_failed as a failure event to the dialecticStore and not create a visible notification', () => {
                const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');
                const otherFailedInternal: Notification = {
                    id: 'uuid-internal-fail-2',
                    user_id: 'user-abc',
                    type: 'other_generation_failed',
                    data: {
                        sessionId: 'sid-xyz',
                        job_id: 'job-xyz',
                        error: { code: 'INTERNAL_DEPENDENCY_MISSING', message: 'Token wallet service is required for affordability preflight' },
                    },
                    read: true,
                    created_at: new Date().toISOString(),
                    is_internal_event: true,
                    title: null,
                    message: null,
                    link_path: null,
                };

                act(() => {
                    useNotificationStore.getState().handleIncomingNotification(otherFailedInternal);
                });

                // Should be translated to the same failure path as contribution_generation_failed
                expect(mockHandleDialecticLifecycleEvent).toHaveBeenCalledWith({
                    type: 'contribution_generation_failed',
                    sessionId: 'sid-xyz',
                    job_id: 'job-xyz',
                    error: { code: 'INTERNAL_DEPENDENCY_MISSING', message: 'Token wallet service is required for affordability preflight' },
                });

                // No user-facing notification should be added
                expect(addNotificationSpy).not.toHaveBeenCalled();
                addNotificationSpy.mockRestore();
            });
        });

        describe('markNotificationRead', () => {
             beforeEach(() => {
                act(() => {
                    useNotificationStore.setState({
                         notifications: [mockNotification2, mockNotification1, mockNotification3], 
                         unreadCount: 2,
                         error: null,
                    });
                 });
             });

             it('should mark a notification as read, decrement count, and call API', async () => {
                 // Use the mock API instance
                 vi.mocked(mockNotificationApi.markNotificationRead).mockResolvedValue({ status: 204 }); // Success

                 await act(async () => { 
                     await useNotificationStore.getState().markNotificationRead(mockNotification1.id);
                 });

                 const state = useNotificationStore.getState();
                 expect(state.error).toBeNull();
                 expect(state.unreadCount).toBe(1);
                 const updatedNotification = state.notifications.find(n => n.id === mockNotification1.id);
                 expect(updatedNotification?.read).toBe(true);
                 // Use the mock API instance for assertion
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledTimes(1);
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledWith(mockNotification1.id);
                 expect(mockLogger.info).toHaveBeenCalledWith('[notificationStore] Marked notification as read', { notificationId: mockNotification1.id });
             });

             it('should NOT change state if notification is already read', async () => {
                await act(async () => { 
                    await useNotificationStore.getState().markNotificationRead(mockNotification3.id); // mock3 is already read
                 });
                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2); // Unchanged
                 expect(mockNotificationApi.markNotificationRead).not.toHaveBeenCalled(); // API should not be called
             });

             it('should NOT change state if notification is not found', async () => {
                await act(async () => { 
                    await useNotificationStore.getState().markNotificationRead('non-existent-id');
                 });
                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2); // Unchanged
                 expect(mockNotificationApi.markNotificationRead).not.toHaveBeenCalled(); // API should not be called
             });

             it('should revert state and set error on API failure', async () => {
                 const mockError: ApiError = { code: 'UPDATE_FAILED', message: 'Could not update' };
                 // Use the mock API instance
                 vi.mocked(mockNotificationApi.markNotificationRead).mockResolvedValue({ error: mockError, status: 500 });

                 await act(async () => { 
                     await useNotificationStore.getState().markNotificationRead(mockNotification1.id);
                 });

                 const state = useNotificationStore.getState();
                 expect(state.error).toEqual(mockError);
                 expect(state.unreadCount).toBe(2); // Should revert
                 const revertedNotification = state.notifications.find(n => n.id === mockNotification1.id);
                 expect(revertedNotification?.read).toBe(false); // Should revert
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledTimes(1);
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledWith(mockNotification1.id);
                 expect(mockLogger.error).toHaveBeenCalledWith(
                   '[notificationStore] Failed to mark notification as read',
                   expect.objectContaining({
                     notificationId: 'uuid-1',
                     error: mockError
                   })
                 );
             });
        });

        describe('markAllNotificationsAsRead', () => {
            beforeEach(() => {
                act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification2, mockNotification1, mockNotification3],
                        unreadCount: 2, 
                        error: null,
                    });
                });
            });

            it('should mark all as read, set count to 0, and call API', async () => {
                // Use the mock API instance
                vi.mocked(mockNotificationApi.markAllNotificationsAsRead).mockResolvedValue({ status: 204 });

                await act(async () => { 
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                 });

                const state = useNotificationStore.getState();
                expect(state.error).toBeNull();
                expect(state.unreadCount).toBe(0);
                expect(state.notifications.every(n => n.read)).toBe(true);
                // Use the mock API instance for assertion
                expect(mockNotificationApi.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
                expect(mockLogger.info).toHaveBeenCalledWith('[notificationStore] Marked all notifications as read');
            });

            it('should NOT call API if unread count is already 0', async () => {
                act(() => { useNotificationStore.setState({ unreadCount: 0 }); }); // Set count to 0
                await act(async () => { 
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                 });
                 expect(mockNotificationApi.markAllNotificationsAsRead).not.toHaveBeenCalled();
            });

            it('should revert state and set error on API failure', async () => {
                const originalNotifications = [...useNotificationStore.getState().notifications]; // Store original state
                const mockError: ApiError = { code: 'UPDATE_ALL_FAILED', message: 'Mass update failed' };
                // Use the mock API instance
                vi.mocked(mockNotificationApi.markAllNotificationsAsRead).mockResolvedValue({ error: mockError, status: 500 });

                await act(async () => { 
                     await useNotificationStore.getState().markAllNotificationsAsRead();
                 });

                 const state = useNotificationStore.getState();
                 expect(state.error).toEqual(mockError);
                 expect(state.unreadCount).toBe(2); // Reverted
                 // Check if notifications reverted (simple check)
                 expect(state.notifications[0].read).toBe(false); // mock2
                 expect(state.notifications[1].read).toBe(false); // mock1
                 expect(state.notifications[2].read).toBe(true); // mock3 was already read
                 expect(mockNotificationApi.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
                 expect(mockLogger.error).toHaveBeenCalledWith(
                   '[notificationStore] Failed to mark all notifications as read',
                   expect.objectContaining({
                     error: mockError
                   })
                 );
            });
        });
        
        // --- NEW: Tests for Realtime Subscription ---
        describe('subscribeToUserNotifications and unsubscribeFromUserNotifications', () => {
            const userId = 'user-for-sub';

            beforeEach(() => {
                // This setup is isolated to this describe block
                vi.mocked(mockNotificationApi.subscribeToNotifications).mockImplementation(
                    (userId: string, callback: (notification: Notification) => void) => {
                        if (!userId) return null;
                        capturedNotificationCallback = callback;
                        return mockRealtimeChannel;
                    }
                );
                vi.mocked(mockNotificationApi.unsubscribeFromNotifications).mockImplementation(() => {});
            });

            it('should subscribe with a valid user ID and set state', () => {
                act(() => {
                    useNotificationStore.getState().subscribeToUserNotifications(userId);
                });

                expect(mockNotificationApi.subscribeToNotifications).toHaveBeenCalledWith(userId, expect.any(Function));
                expect(useNotificationStore.getState().subscribedUserId).toBe(userId);
                expect(mockLogger.info).toHaveBeenCalledWith('[NotificationStore] Successfully subscribed to notification channel for user:', { userId });
            });

            it('should not subscribe with an empty user ID', () => {
                act(() => {
                    useNotificationStore.getState().subscribeToUserNotifications('');
                });

                expect(mockNotificationApi.subscribeToNotifications).not.toHaveBeenCalled();
                expect(useNotificationStore.getState().subscribedUserId).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith('User ID is required to subscribe to notifications.');
            });

            it('should warn if already subscribed to the same user', () => {
                act(() => {
                    useNotificationStore.setState({ subscribedUserId: userId });
                });

                act(() => {
                    useNotificationStore.getState().subscribeToUserNotifications(userId);
                });

                expect(mockNotificationApi.subscribeToNotifications).not.toHaveBeenCalled();
                expect(mockLogger.warn).toHaveBeenCalledWith('[NotificationStore] Already subscribed to notifications for user:', { userId });
            });

            it('should switch subscriptions if called with a new user ID', () => {
                const oldUserId = 'user-old';
                
                act(() => {
                    useNotificationStore.setState({ subscribedUserId: oldUserId });
                });

                act(() => {
                    useNotificationStore.getState().subscribeToUserNotifications(userId);
                });

                expect(mockNotificationApi.unsubscribeFromNotifications).toHaveBeenCalledTimes(1);
                expect(mockNotificationApi.subscribeToNotifications).toHaveBeenCalledWith(userId, expect.any(Function));
                expect(useNotificationStore.getState().subscribedUserId).toBe(userId);
                expect(mockLogger.info).toHaveBeenCalledWith(`[NotificationStore] Switching subscription from user ${oldUserId} to ${userId}`);
            });

            it('should unsubscribe and clear state', () => {
                act(() => {
                    useNotificationStore.setState({ subscribedUserId: userId });
                });

                act(() => {
                    useNotificationStore.getState().unsubscribeFromUserNotifications();
                });

                expect(mockNotificationApi.unsubscribeFromNotifications).toHaveBeenCalledTimes(1);
                expect(useNotificationStore.getState().subscribedUserId).toBeNull();
                expect(mockLogger.info).toHaveBeenCalledWith('Successfully unsubscribed from notifications for user:', { userId: userId });
            });

            it('should handle incoming notifications after subscribing', () => {
                const handleIncomingNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'handleIncomingNotification');
                
                act(() => {
                    useNotificationStore.getState().subscribeToUserNotifications(userId);
                });

                expect(capturedNotificationCallback).toBeInstanceOf(Function);

                act(() => {
                    if (capturedNotificationCallback) {
                        capturedNotificationCallback(mockNotification1);
                    }
                });

                expect(handleIncomingNotificationSpy).toHaveBeenCalledWith(mockNotification1);
                handleIncomingNotificationSpy.mockRestore();
            });
        });
        // ------------------------------------
    });
}); 

