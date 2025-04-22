// packages/api-client/src/notifications.api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationApiClient } from './notifications.api';
import { ApiClient } from './apiClient'; // Base client needed for mocking
// Attempt import again - assuming build/cache might resolve it
import { Notification, ApiResponse, ApiError } from '@paynless/types';

// Mock the base ApiClient methods
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as ApiClient; // Use type assertion

// Instantiate the class under test, injecting the mock base client
const notificationApiClient = new NotificationApiClient(mockApiClient);

describe('NotificationApiClient', () => {

  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks before each test
  });

  // --- fetchNotifications ---
  describe('fetchNotifications', () => {
    it('should call apiClient.get with the correct endpoint', async () => {
      // Explicitly match SUCCESS type branch
      const mockResponse = { status: 200, data: [] } as ApiResponse<Notification[]>;
      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      await notificationApiClient.fetchNotifications();

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith('notifications');
    });

    it('should return notifications on successful fetch', async () => {
      const mockNotifications: Notification[] = [{ id: 'n1', type: 'test', read: false, user_id: 'u1', created_at: 't1', data: {} }];
       // Explicitly match SUCCESS type branch
      const mockResponse = { status: 200, data: mockNotifications } as ApiResponse<Notification[]>;
      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await notificationApiClient.fetchNotifications();

      expect(result.status).toBe(200);
      expect(result.data).toEqual(mockNotifications);
      expect(result.error).toBeUndefined();
    });

     it('should return empty array if data is null/undefined on success', async () => {
       // Explicitly match SUCCESS type branch
       const mockResponse = { status: 200, data: undefined } as ApiResponse<Notification[]>;
       vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

       const result = await notificationApiClient.fetchNotifications();

       expect(result.status).toBe(200);
       expect(result.data).toEqual([]); // Implementation ensures array
       expect(result.error).toBeUndefined();
     });

    it('should return the error object on failed fetch', async () => {
      const mockError: ApiError = { message: 'Fetch failed', code: '500' };
      // Explicitly match ERROR type branch
      const mockResponse = { status: 500, error: mockError } as ApiResponse<Notification[]>; // Cast needed
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
      // Explicitly match SUCCESS type branch
      const mockResponse = { status: 200, data: undefined } as ApiResponse<void>; // Explicit undefined data
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      await notificationApiClient.markNotificationAsRead(notificationId);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`notifications/${notificationId}`, { read: true });
    });

     it('should return success response when marking as read succeeds', async () => {
       // Explicitly match SUCCESS type branch
       const mockResponse = { status: 200, data: undefined } as ApiResponse<void>; // Explicit undefined data
       vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

       const result = await notificationApiClient.markNotificationAsRead(notificationId);

       expect(result.status).toBe(200);
       expect(result.error).toBeUndefined();
     });

    it('should return the error object on failed update', async () => {
      const mockError: ApiError = { message: 'Update failed', code: 'DB_ERROR' };
       // Explicitly match ERROR type branch
      const mockResponse = { status: 500, error: mockError } as ApiResponse<void>; // Cast needed
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
       // Explicitly match SUCCESS type branch
       const mockResponse = { status: 200, data: undefined } as ApiResponse<void>; // Explicit undefined data
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      await notificationApiClient.markAllNotificationsAsRead();

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith('notifications/mark-all-read', null);
    });

    it('should return success response when marking all as read succeeds', async () => {
       // Explicitly match SUCCESS type branch
       const mockResponse = { status: 200, data: undefined } as ApiResponse<void>; // Explicit undefined data
       vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

       const result = await notificationApiClient.markAllNotificationsAsRead();

       expect(result.status).toBe(200);
       expect(result.error).toBeUndefined();
     });

    it('should return the error object on failed update', async () => {
       const mockError: ApiError = { message: 'Update all failed', code: 'INTERNAL' };
       // Explicitly match ERROR type branch
      const mockResponse = { status: 500, error: mockError } as ApiResponse<void>; // Cast needed
      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await notificationApiClient.markAllNotificationsAsRead();

      expect(result.status).toBe(500);
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeUndefined();
    });
  });
}); 