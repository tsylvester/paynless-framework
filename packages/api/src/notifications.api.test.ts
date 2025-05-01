// packages/api/src/notifications.api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationApiClient } from './notifications.api';
// Remove direct ApiClient import
// import { ApiClient } from './apiClient'; 
import { Notification, ApiResponse, ApiError } from '@paynless/types'; // Removed StreamCallbacks, StreamDisconnectFunction
// Import the shared mock
import { mockApiClient, resetMockApiClient } from './mocks/apiClient.mock'; 

// --- Mocks ---

// Mock the base ApiClient methods - REMOVED, using shared mock
// const mockDisconnectFunction = vi.fn(); 
// const mockApiClient = { ... }; 

// Removed global EventSource mock as ApiClient.stream handles it now

// --- Test Suite ---

// Instantiate the class under test, injecting the SHARED mock client
const notificationApiClient = new NotificationApiClient(mockApiClient); 

describe('NotificationApiClient', () => {
  // Remove getTokenSpy setup if not needed for this specific test file's logic
  // let getTokenSpy: ReturnType<typeof vi.spyOn>; 

  beforeEach(() => {
    // Use the shared reset function
    resetMockApiClient(); 

    // --- Mock private getToken using spyOn --- REMOVED if shared mock default is okay
    // Need 'any' because it's private. Ensure this aligns with actual implementation.
    // We spy on the *instance* we pass to the constructor.
    // getTokenSpy = vi.spyOn(mockApiClient as any, 'getToken')
    //                  .mockResolvedValue('default-test-token');
    // ---------------------------------------

    // Provide default mocks for other ApiClient methods - REMOVED, handled by shared mock/reset
    // vi.mocked(mockApiClient.getFunctionsUrl).mockReturnValue('http://test-functions.api/v1');
    // mockDisconnectFunction.mockClear(); // Clear the disconnect mock calls
  });

  afterEach(() => {
      // getTokenSpy.mockRestore(); // Restore original getToken if needed elsewhere - REMOVED if spy removed
  });

  // --- fetchNotifications ---
  describe('fetchNotifications', () => {
    it('should call apiClient.get with the correct endpoint', async () => {
      const mockResponse = { status: 200, data: [] } as ApiResponse<Notification[]>;
      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);
      await notificationApiClient.fetchNotifications();
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith('notifications');
    });

    it('should return notifications on successful fetch', async () => {
      const mockNotifications: Notification[] = [{ id: 'n1', type: 'test', read: false, user_id: 'u1', created_at: 't1', data: {} }];
      const mockResponse = { status: 200, data: mockNotifications } as ApiResponse<Notification[]>;
      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.fetchNotifications();
      expect(result.status).toBe(200);
      expect(result.data).toEqual(mockNotifications);
      expect(result.error).toBeUndefined();
    });

     it('should return empty array if data is null/undefined on success', async () => {
       // Ensure the mock specifically returns undefined data for this case
       const mockResponse = { status: 200, data: undefined } as ApiResponse<Notification[]>; 
       vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);
       const result = await notificationApiClient.fetchNotifications();
       expect(result.status).toBe(200);
      // The client implementation should handle this and return []
      expect(result.data).toEqual([]); 
       expect(result.error).toBeUndefined();
     });

    it('should return the error object on failed fetch', async () => {
      const mockError: ApiError = { message: 'Fetch failed', code: '500' };
      const mockResponse = { status: 500, error: mockError } as ApiResponse<Notification[]>;
      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.fetchNotifications();
      expect(result.status).toBe(500);
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeUndefined();
    });
  });

  // --- markNotificationRead --- (Renamed from markNotificationAsRead)
  describe('markNotificationRead', () => {
    const notificationId = 'uuid-notify-1';

    it('should call apiClient.put with the correct endpoint and empty object data', async () => { // Updated payload expectation
      const mockResponse = { status: 200, data: null } as ApiResponse<null>; // Updated type to null
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);
      await notificationApiClient.markNotificationRead(notificationId); // Renamed method call
      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`notifications/${notificationId}`, {}); // Expect empty object {}
    });

     it('should return success response when marking as read succeeds', async () => {
      const mockResponse = { status: 200, data: null } as ApiResponse<null>; // Updated type to null
       vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);
       const result = await notificationApiClient.markNotificationRead(notificationId); // Renamed method call
       expect(result.status).toBe(200);
       expect(result.error).toBeUndefined();
     });

    it('should return the error object on failed update', async () => {
      const mockError: ApiError = { message: 'Update failed', code: 'DB_ERROR' };
      const mockResponse = { status: 500, error: mockError } as ApiResponse<null>; // Updated type to null
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.markNotificationRead(notificationId); // Renamed method call
      expect(result.status).toBe(500);
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeUndefined(); // data should be undefined on error
    });
  });

  // --- markAllNotificationsAsRead ---
  describe('markAllNotificationsAsRead', () => {
    it('should call apiClient.post with the correct endpoint and empty object data', async () => { // Updated payload expectation
      const mockResponse = { status: 200, data: null } as ApiResponse<null>; // Updated type to null
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      await notificationApiClient.markAllNotificationsAsRead();
      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith('notifications/mark-all-read', {}); // Expect empty object {}
    });

    it('should return success response when marking all as read succeeds', async () => {
      const mockResponse = { status: 200, data: null } as ApiResponse<null>; // Updated type to null
       vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
       const result = await notificationApiClient.markAllNotificationsAsRead();
       expect(result.status).toBe(200);
       expect(result.error).toBeUndefined();
     });

    it('should return the error object on failed update', async () => {
       const mockError: ApiError = { message: 'Update all failed', code: 'INTERNAL' };
      const mockResponse = { status: 500, error: mockError } as ApiResponse<null>; // Updated type to null
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.markAllNotificationsAsRead();
      expect(result.status).toBe(500);
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeUndefined(); // data should be undefined on error
    });
  });

  // --- REMOVED connectToNotificationStream describe block ---

  // --- REMOVED disconnectFromNotificationStream describe block ---

  // --- NEW: Add tests for subscribeToNotifications and unsubscribeFromNotifications (Optional - Skipped for now) ---
  // describe('subscribeToNotifications', () => { ... });
  // describe('unsubscribeFromNotifications', () => { ... });

}); 