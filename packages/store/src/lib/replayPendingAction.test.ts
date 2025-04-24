import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { replayPendingAction } from './replayPendingAction';
import { type ApiClient } from '@paynless/api-client';
import { type NavigateFunction } from '@paynless/types';
import { type PendingAction, type ApiResponse } from '@paynless/types';
import { logger as mockLogger } from '@paynless/utils';

// Mock dependencies
vi.mock('@paynless/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the ApiClient instance methods
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

// Note: localStorage is now automatically mocked by vitest-localstorage-mock setup in vitest.config.ts


// --- Start tests for the actual replayPendingAction function ---
describe('replayPendingAction', () => {
    let mockNavigate: NavigateFunction;
    const mockToken = 'mock-access-token';
    const mockPendingAction: PendingAction = {
        endpoint: 'test/endpoint',
        method: 'POST',
        body: { key: 'value' },
        returnPath: '/original/path'
    };
    const mockPendingActionJson = JSON.stringify(mockPendingAction);

    beforeEach(() => {
        // Clear mocks and the mocked localStorage before each test
        vi.clearAllMocks();
        localStorage.clear(); 
        mockNavigate = vi.fn();

        // Reset default API mocks for cases where API calls might happen
        // (though initial tests focus on validation before API calls)
        mockApiClient.post.mockResolvedValue({ status: 200, data: { success: true }, error: undefined });
        mockApiClient.put.mockResolvedValue({ status: 200, data: { success: true }, error: undefined });
        mockApiClient.delete.mockResolvedValue({ status: 200, data: { success: true }, error: undefined });
        mockApiClient.get.mockResolvedValue({ status: 200, data: { success: true }, error: undefined });
    });

    it('should return false and log debug if no pending action exists in localStorage', async () => {
        // Arrange: localStorage is empty (cleared in beforeEach)
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);
        
        // Assert
        expect(result).toBe(false);
        expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
        expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No pending action found'));
        expect(mockApiClient.post).not.toHaveBeenCalled(); // No API call attempted
        expect(localStorage.removeItem).not.toHaveBeenCalled(); // Item wasn't there to remove
    });

    it('should return false and log error if localStorage contains invalid JSON', async () => {
        // Arrange
        localStorage.setItem('pendingAction', 'invalid json{]}');
        
        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(false);
        expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Error processing pending action'),
            expect.any(Object) // Contains the JSON parse error
        );
        expect(mockApiClient.post).not.toHaveBeenCalled(); // No API call attempted
        expect(localStorage.removeItem).not.toHaveBeenCalled(); // Item kept on parsing error
    });

     it('should return false, log error, and remove item if localStorage contains literal "null"', async () => {
        // Arrange
        localStorage.setItem('pendingAction', 'null'); // Valid JSON, but results in null object
        
        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(false);
        expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Parsed pending action is null or undefined')
        );
        expect(mockApiClient.post).not.toHaveBeenCalled(); // No API call attempted
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction'); // Should remove corrupt item
    });

    it('should return false and log error if token argument is missing (null)', async () => {
        // Arrange
        localStorage.setItem('pendingAction', mockPendingActionJson);
        
        // Act: Pass null token
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, null); 

        // Assert
        expect(result).toBe(false);
        expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
        // expect(JSON.parse).toHaveBeenCalledWith(mockPendingActionJson); // REMOVED: Cannot assert on built-in JSON.parse unless explicitly mocked
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Invalid pending action data or missing token:'),
            expect.objectContaining({ hasToken: false })
        );
        expect(mockApiClient.post).not.toHaveBeenCalled(); // No API call attempted
        expect(localStorage.removeItem).not.toHaveBeenCalled(); // Item kept on validation error
    });

    it('should return false and log error if stored action is missing endpoint', async () => {
        // Arrange
        const invalidAction = { ...mockPendingAction, endpoint: undefined };
        localStorage.setItem('pendingAction', JSON.stringify(invalidAction));
        
        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(false);
        expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Invalid pending action data or missing token:'),
            expect.objectContaining({ pendingAction: expect.objectContaining({ method: 'POST' }) })
        );
        expect(mockApiClient.post).not.toHaveBeenCalled();
        expect(localStorage.removeItem).not.toHaveBeenCalled(); // Item kept on validation error
    });

    it('should return false and log error if stored action is missing method', async () => {
        // Arrange
        const invalidAction = { ...mockPendingAction, method: undefined };
        localStorage.setItem('pendingAction', JSON.stringify(invalidAction));
        
        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(false);
        expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Invalid pending action data or missing token:'),
            expect.objectContaining({ pendingAction: expect.objectContaining({ endpoint: 'test/endpoint' }) })
        );
        expect(mockApiClient.post).not.toHaveBeenCalled();
        expect(localStorage.removeItem).not.toHaveBeenCalled(); // Item kept on validation error
    });

    // --- Test successful replay paths ---

    it('should replay POST, remove item, and navigate on success', async () => {
        // Arrange
        localStorage.setItem('pendingAction', mockPendingActionJson); // Use the valid action defined earlier
        mockApiClient.post.mockResolvedValue({ status: 201, data: { id: '123' }, error: undefined }); // Mock successful API call

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(true); // Should indicate navigation occurred
        // Verify API call
        expect(mockApiClient.post).toHaveBeenCalledWith(
            mockPendingAction.endpoint,
            mockPendingAction.body,
            { token: mockToken }
        );
        // Verify cleanup and navigation
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
        expect(mockNavigate).toHaveBeenCalledWith(mockPendingAction.returnPath);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Successfully replayed pending action'),
            expect.objectContaining({ status: 201 })
        );
        expect(mockLogger.error).not.toHaveBeenCalled(); // No errors logged
    });

    it('should replay PUT, remove item, and navigate on success', async () => {
        // Arrange
        const putAction: PendingAction = { ...mockPendingAction, method: 'PUT', endpoint: 'items/1' };
        localStorage.setItem('pendingAction', JSON.stringify(putAction));
        mockApiClient.put.mockResolvedValue({ status: 200, data: { id: '1' }, error: undefined });

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(true); // Navigated
        expect(mockApiClient.put).toHaveBeenCalledWith(putAction.endpoint, putAction.body, { token: mockToken });
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
        expect(mockNavigate).toHaveBeenCalledWith(putAction.returnPath);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Successfully replayed pending action'),
            expect.objectContaining({ status: 200 })
        );
    });

    it('should replay DELETE, remove item, and navigate on success', async () => {
        // Arrange
        const deleteAction: PendingAction = { ...mockPendingAction, method: 'DELETE', endpoint: 'items/1', body: undefined }; // Explicitly undefined body
        localStorage.setItem('pendingAction', JSON.stringify(deleteAction));
        mockApiClient.delete.mockResolvedValue({ status: 204, data: null, error: undefined });

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(true); // Navigated
        expect(mockApiClient.delete).toHaveBeenCalledWith(deleteAction.endpoint, { token: mockToken }); // No body passed
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
        expect(mockNavigate).toHaveBeenCalledWith(deleteAction.returnPath);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Successfully replayed pending action'),
            expect.objectContaining({ status: 204 })
        );
    });

    it('should replay GET, remove item, and navigate on success', async () => {
        // Arrange
        const getAction: PendingAction = { ...mockPendingAction, method: 'GET', endpoint: 'items', body: undefined }; // Explicitly undefined body
        localStorage.setItem('pendingAction', JSON.stringify(getAction));
        mockApiClient.get.mockResolvedValue({ status: 200, data: [{ id: '1' }, { id: '2' }], error: undefined });

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(true); // Navigated
        expect(mockApiClient.get).toHaveBeenCalledWith(getAction.endpoint, { token: mockToken }); // No body passed
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
        expect(mockNavigate).toHaveBeenCalledWith(getAction.returnPath);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Successfully replayed pending action'),
            expect.objectContaining({ status: 200 })
        );
    });

    it('should NOT remove item but still navigate if API call fails', async () => {
        // Arrange
        localStorage.setItem('pendingAction', mockPendingActionJson); // Valid action
        const apiError = { code: 'API_ERROR', message: 'Something went wrong' };
        // Mock the API client's post method to return an error
        mockApiClient.post.mockResolvedValue({ status: 500, data: undefined, error: apiError });

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(true); // Should still report true because navigation was attempted
        expect(mockApiClient.post).toHaveBeenCalledWith(
            mockPendingAction.endpoint,
            mockPendingAction.body,
            { token: mockToken }
        );
        expect(localStorage.removeItem).not.toHaveBeenCalled(); // Item NOT removed on API failure
        expect(mockNavigate).toHaveBeenCalledWith(mockPendingAction.returnPath); // Navigation still called
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Error replaying pending action'),
            expect.objectContaining({ status: 500, error: apiError })
        );
    });

    // --- Test Navigation Edge Cases ---

    it('should replay action and NOT navigate if navigate function is null', async () => {
        // Arrange
        localStorage.setItem('pendingAction', mockPendingActionJson);
        mockApiClient.post.mockResolvedValue({ status: 201, data: { id: '123' }, error: undefined });

        // Act: Pass null for navigate function
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, null, mockToken); 

        // Assert
        expect(result).toBe(false); // Should report false as navigation did not occur
        expect(mockApiClient.post).toHaveBeenCalled(); // API call still happens
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction'); // Item removed on API success
        expect(mockNavigate).not.toHaveBeenCalled(); // Original (non-null) mock navigate fn should NOT be called
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not navigate to returnPath after replay'),
            expect.objectContaining({ hasNavigate: false, returnPath: mockPendingAction.returnPath })
        );
    });

    it('should replay action and NOT navigate if returnPath is missing', async () => {
        // Arrange
        const noReturnPathAction = { ...mockPendingAction, returnPath: undefined }; // Remove returnPath
        localStorage.setItem('pendingAction', JSON.stringify(noReturnPathAction));
        mockApiClient.post.mockResolvedValue({ status: 201, data: { id: '123' }, error: undefined });

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(false); // Should report false as navigation did not occur
        expect(mockApiClient.post).toHaveBeenCalled(); // API call still happens
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction'); // Item removed on API success
        expect(mockNavigate).not.toHaveBeenCalled(); // Navigate fn not called
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not navigate to returnPath after replay'),
            expect.objectContaining({ hasNavigate: true, returnPath: undefined })
        );
    });

    // --- Test Special Cases ---

    it('should replay chat POST, set loadChatIdOnRedirect, remove item, and navigate', async () => {
        // Arrange
        const chatAction: PendingAction = {
            endpoint: 'chat',
            method: 'POST',
            body: { message: 'Hi' },
            returnPath: '/chat' // Specific return path for chat
        };
        const chatId = 'chat-abc-123';
        localStorage.setItem('pendingAction', JSON.stringify(chatAction));
        // Mock API response to include chat_id
        mockApiClient.post.mockResolvedValue({ status: 200, data: { chat_id: chatId }, error: undefined });

        // Act
        const result = await replayPendingAction(mockApiClient as unknown as ApiClient, mockNavigate, mockToken);

        // Assert
        expect(result).toBe(true); // Navigated
        expect(mockApiClient.post).toHaveBeenCalledWith(chatAction.endpoint, chatAction.body, { token: mockToken });
        expect(localStorage.setItem).toHaveBeenCalledWith('loadChatIdOnRedirect', chatId); // Verify chat ID storage
        expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction'); // Verify removal
        expect(mockNavigate).toHaveBeenCalledWith(chatAction.returnPath); // Verify navigation
    });

});

/* --- REMOVED localStorage Mock Interaction Basics suite --- */