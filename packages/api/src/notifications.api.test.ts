// packages/api/src/notifications.api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationApiClient } from './notifications.api';
import { ApiClient } from './apiClient'; // Base client needed for mocking
// Import shared types - Should resolve now that build succeeds
import { Notification, ApiResponse, ApiError, StreamCallbacks, StreamDisconnectFunction } from '@paynless/types';

// --- Mocks ---

// --- REMOVE TEMPORARY LOCAL TYPE DEFINITIONS --- 
// // TODO: Remove these once shared type import issue is resolved
// interface StreamCallbacks<T> {
//   onMessage: (data: T) => void;
//   onError: (error: Event | Error) => void;
//   onOpen?: () => void;
// }
// type StreamDisconnectFunction = () => void;
// -------------------------------------------

// Mock the base ApiClient methods
const mockDisconnectFunction = vi.fn();
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  // Mock the new stream method - Use imported types
  stream: vi.fn<[string, StreamCallbacks<any>], StreamDisconnectFunction | null>(
        () => mockDisconnectFunction // Default mock returns the disconnect function
  ), 
  // getFunctionsUrl is public, can mock directly
  getFunctionsUrl: vi.fn(), 
  // Add placeholder for private getToken - it will be spied on/replaced in beforeEach
  getToken: vi.fn(), 
} as unknown as ApiClient; // Use type assertion

// Removed global EventSource mock as ApiClient.stream handles it now


// --- Test Suite ---

// Instantiate the class under test, injecting the mock base client
const notificationApiClient = new NotificationApiClient(mockApiClient);

describe('NotificationApiClient', () => {
  let getTokenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks before each test

    // --- Mock private getToken using spyOn --- 
    // Need 'any' because it's private. Ensure this aligns with actual implementation.
    // We spy on the *instance* we pass to the constructor.
    getTokenSpy = vi.spyOn(mockApiClient as any, 'getToken')
                     .mockResolvedValue('default-test-token');
    // ---------------------------------------

    // Provide default mocks for other ApiClient methods
    vi.mocked(mockApiClient.getFunctionsUrl).mockReturnValue('http://test-functions.api/v1');
    mockDisconnectFunction.mockClear(); // Clear the disconnect mock calls
  });

  afterEach(() => {
      getTokenSpy.mockRestore(); // Restore original getToken if needed elsewhere
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
      const mockResponse = { status: 200, data: undefined } as ApiResponse<Notification[]>;
      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.fetchNotifications();
      expect(result.status).toBe(200);
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

  // --- markNotificationAsRead ---
  describe('markNotificationAsRead', () => {
    const notificationId = 'uuid-notify-1';

    it('should call apiClient.put with the correct endpoint and data', async () => {
      const mockResponse = { status: 200, data: undefined } as ApiResponse<void>;
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);
      await notificationApiClient.markNotificationAsRead(notificationId);
      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`notifications/${notificationId}`, { read: true });
    });

    it('should return success response when marking as read succeeds', async () => {
      const mockResponse = { status: 200, data: undefined } as ApiResponse<void>;
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.markNotificationAsRead(notificationId);
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it('should return the error object on failed update', async () => {
      const mockError: ApiError = { message: 'Update failed', code: 'DB_ERROR' };
      const mockResponse = { status: 500, error: mockError } as ApiResponse<void>;
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.markNotificationAsRead(notificationId);
      expect(result.status).toBe(500);
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeUndefined();
    });
  });

  // --- markAllNotificationsAsRead ---
  describe('markAllNotificationsAsRead', () => {
    it('should call apiClient.post with the correct endpoint and null data', async () => {
      const mockResponse = { status: 200, data: undefined } as ApiResponse<void>;
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      await notificationApiClient.markAllNotificationsAsRead();
      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith('notifications/mark-all-read', null);
    });

    it('should return success response when marking all as read succeeds', async () => {
      const mockResponse = { status: 200, data: undefined } as ApiResponse<void>;
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.markAllNotificationsAsRead();
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it('should return the error object on failed update', async () => {
      const mockError: ApiError = { message: 'Update all failed', code: 'INTERNAL' };
      const mockResponse = { status: 500, error: mockError } as ApiResponse<void>;
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      const result = await notificationApiClient.markAllNotificationsAsRead();
      expect(result.status).toBe(500);
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeUndefined();
    });
  });

  // --- connectToNotificationStream ---
  describe('connectToNotificationStream', () => {
    const onMessageCallback = vi.fn();
    const onErrorCallback = vi.fn();

    it('should call apiClient.stream with correct endpoint and callbacks', () => {
      notificationApiClient.connectToNotificationStream(onMessageCallback, onErrorCallback);

      expect(mockApiClient.stream).toHaveBeenCalledTimes(1);
      expect(mockApiClient.stream).toHaveBeenCalledWith(
        'notifications-stream', 
        expect.objectContaining({
          onMessage: onMessageCallback,
          onError: onErrorCallback,
          onOpen: expect.any(Function) // Check that an onOpen handler is passed
        })
      );
    });

    it('should return the disconnect function provided by apiClient.stream', () => {
      // Ensure the mock returns our specific disconnect function
      vi.mocked(mockApiClient.stream).mockReturnValue(mockDisconnectFunction);

      const disconnect = notificationApiClient.connectToNotificationStream(onMessageCallback, onErrorCallback);

      // Verify the returned function is the one from the mock
      expect(disconnect).toBe(mockDisconnectFunction);
    });

    it('should return null if apiClient.stream returns null', () => {
      // Make the mock return null
      vi.mocked(mockApiClient.stream).mockReturnValue(null);

      const disconnect = notificationApiClient.connectToNotificationStream(onMessageCallback, onErrorCallback);

      expect(disconnect).toBeNull();
    });

    it('should call the previously stored disconnect function if called again', () => {
      // First call, setup the mock to return the disconnect function
      vi.mocked(mockApiClient.stream).mockReturnValue(mockDisconnectFunction);
      notificationApiClient.connectToNotificationStream(onMessageCallback, onErrorCallback);
      expect(mockDisconnectFunction).not.toHaveBeenCalled(); // Should not be called yet

      // Second call
      const newDisconnect = vi.fn();
      vi.mocked(mockApiClient.stream).mockReturnValue(newDisconnect);
      notificationApiClient.connectToNotificationStream(vi.fn(), vi.fn());

      // Verify the *original* disconnect function was called
      expect(mockDisconnectFunction).toHaveBeenCalledTimes(1);
      // Verify the stream method was called again for the new connection
      expect(mockApiClient.stream).toHaveBeenCalledTimes(2);
    });
  });

  // --- disconnectFromNotificationStream ---
  describe('disconnectFromNotificationStream', () => {
    const onMessageCallback = vi.fn();
    const onErrorCallback = vi.fn();

    it('should call the disconnect function returned by connectToNotificationStream', () => {
      // Arrange: connect and get the disconnect function
      vi.mocked(mockApiClient.stream).mockReturnValue(mockDisconnectFunction);
      notificationApiClient.connectToNotificationStream(onMessageCallback, onErrorCallback);
      expect(mockDisconnectFunction).not.toHaveBeenCalled(); // Ensure it wasn't called yet

      // Act: disconnect
      notificationApiClient.disconnectFromNotificationStream();

      // Assert: the disconnect function from the mock was called
      expect(mockDisconnectFunction).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if no stream is active (no disconnect function stored)', () => {
      // Arrange: Ensure no stream is connected (disconnectStream is null)
      // (This is the default state after beforeEach runs and resets mocks)

      // Act: Try to disconnect
      notificationApiClient.disconnectFromNotificationStream();

      // Assert: The mock disconnect function (or any disconnect) was not called
      expect(mockDisconnectFunction).not.toHaveBeenCalled();
      expect(mockApiClient.stream).not.toHaveBeenCalled(); // Ensure connect wasn't accidentally called
    });

    it('should clear the stored disconnect function after calling it', () => {
      // Arrange: Connect
      vi.mocked(mockApiClient.stream).mockReturnValue(mockDisconnectFunction);
      notificationApiClient.connectToNotificationStream(onMessageCallback, onErrorCallback);

      // Act: Disconnect once
      notificationApiClient.disconnectFromNotificationStream();
      expect(mockDisconnectFunction).toHaveBeenCalledTimes(1);

      // Act: Disconnect again
      notificationApiClient.disconnectFromNotificationStream();

      // Assert: The disconnect function is not called a second time
      expect(mockDisconnectFunction).toHaveBeenCalledTimes(1); 
    });
  });

}); 