import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAiStore } from './aiStore';
import { act } from '@testing-library/react';
import {
    Chat,
    User,
    Session,
} from '@paynless/types';
import { useAuthStore } from './authStore';

// --- Restore API Client Factory Mock --- 
const mockGetAiProviders = vi.fn(); 
const mockGetSystemPrompts = vi.fn(); 
const mockSendChatMessage = vi.fn(); 
const mockGetChatHistory = vi.fn();
const mockGetChatMessages = vi.fn(); 

vi.mock('@paynless/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actual, 
        api: {
            ...actual.api,
            ai: () => ({
                getAiProviders: mockGetAiProviders,
                getSystemPrompts: mockGetSystemPrompts,
                sendChatMessage: mockSendChatMessage, 
                getChatHistory: mockGetChatHistory,
                getChatMessages: mockGetChatMessages,
            }),
            auth: () => ({}), 
            billing: () => ({}),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        initializeApiClient: vi.fn(), 
    };
});

// --- Mock the authStore --- (Keep this)
vi.mock('./authStore');

// Helper to reset Zustand store state between tests (manual reset)
const resetAiStore = () => {
    useAiStore.setState({
        availableProviders: [],
        availablePrompts: [],
        currentChatId: null,
        isLoadingAiResponse: false,
        isConfigLoading: false,
        isDetailsLoading: false,
        aiError: null,
        chatsByContext: { personal: [], orgs: {} },
        messagesByChatId: {},
        isLoadingHistoryByContext: { personal: false, orgs: {} },
        newChatContext: null,
        rewindTargetMessageId: null,
    }, true); // Replace state
};

// Define a global navigate mock
const mockNavigateGlobal = vi.fn();

describe('aiStore - loadChatHistory', () => {

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        act(() => {
             resetAiStore();
             // Reset authStore state but preserve/set navigate
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); // Replace state but include global navigate
        });
    });

    // --- Tests for loadChatHistory ---
    describe('loadChatHistory', () => {
        // Define constants for mock data
        const mockPersonalChats: Chat[] = [
            { id: 'c1', user_id: 'u1', title: 'Personal Chat 1', created_at: 't1', updated_at: 't2', organization_id: null, system_prompt_id: null },
        ];
        const mockToken = 'valid-token-for-history';
        const mockUser: User = { id: 'user-123', email: 'test@test.com', role: 'user', created_at: '2023-01-01', updated_at: '2023-01-01' };
        const mockSession: Session = { access_token: mockToken, refresh_token: 'rt', expiresAt: Date.now() / 1000 + 3600 };

        // Nested beforeEach using mockReturnValue for authStore.getState
        beforeEach(() => {
             if (vi.isMockFunction(useAuthStore)) { 
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    // ... other auth state ...
                } as any); 
            }
        });
        
        it('should set personal loading state and call API client for personal context', async () => {
            // Arrange
            mockGetChatHistory.mockResolvedValue({
                data: mockPersonalChats,
                status: 200,
                error: null
            });

            // Act
            let promise;
            act(() => { 
                // Call without orgId for personal context
                promise = useAiStore.getState().loadChatHistory();
                // MODIFIED: Check new loading state
                expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(true);
            });
            
            await promise;

            // Assert final state
            // MODIFIED: Check new loading state
            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            // MODIFIED: Expect API call with null or undefined for orgId
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, undefined); 
        });

        it('should update personal chatsByContext on success for personal context', async () => {
             // Arrange
             mockGetChatHistory.mockResolvedValue({
                 data: mockPersonalChats,
                 status: 200,
                 error: null
             });

             // Act
             await act(async () => { 
                await useAiStore.getState().loadChatHistory();
             });

             // Assert
             const state = useAiStore.getState();
             // MODIFIED: Check new state property
             expect(state.chatsByContext.personal).toEqual(mockPersonalChats);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError and clear personal loading state on failure for personal context', async () => {
             // Arrange
             const errorMsg = 'Failed to load history';
             mockGetChatHistory.mockResolvedValue({
                 data: null,
                 status: 500,
                 error: { message: errorMsg }
             });

             // Act: Wrap async action
             await act(async () => { 
                await useAiStore.getState().loadChatHistory();
             });

             // Assert
             const state = useAiStore.getState();
             expect(state.aiError).toBe(errorMsg);
             // MODIFIED: Check new state properties
             expect(state.chatsByContext.personal).toEqual([]);
             expect(state.isLoadingHistoryByContext.personal).toBe(false);
             expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
             // MODIFIED: Expect API call with null or undefined for orgId
             expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, undefined);
        });

        it('should set aiError and clear personal loading state if no auth token is available', async () => {
            // Arrange: Override authStore.getState for this specific test
            if (vi.isMockFunction(useAuthStore)) { 
                const currentMockState = useAuthStore.getState();
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({
                    ...currentMockState, 
                    session: null, // Override session to null
                });
            }
            
            // Act: Wrap async action
            await act(async () => { 
                await useAiStore.getState().loadChatHistory();
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe('Authentication token not found.'); 
            // MODIFIED: Check new loading state
            expect(state.isLoadingHistoryByContext.personal).toBe(false);
            expect(state.chatsByContext.personal).toEqual([]);
            expect(mockGetChatHistory).not.toHaveBeenCalled();
        });

        // --- NEW Tests for Organization Context ---
        const mockOrgId = 'org-789';
        const mockOrgChats: Chat[] = [
            { id: 'c-org1', user_id: 'u1', title: 'Org Chat 1', organization_id: mockOrgId, created_at: 't1', updated_at: 't2', system_prompt_id: null },
        ];

        it('should set organization loading state and call API client with orgId', async () => {
            // Arrange
            mockGetChatHistory.mockResolvedValue({
                data: mockOrgChats,
                status: 200,
                error: null
            });

            // Act
            let promise;
            act(() => { 
                promise = useAiStore.getState().loadChatHistory(mockOrgId);
                // Check loading state for the specific org
                expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBe(true);
                // Ensure personal loading state is unaffected
                expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);
            });
            
            await promise;

            // Assert final state
            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            // MODIFIED: Expect API call with orgId
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, mockOrgId); 
        });

        it('should update organization chatsByContext on success for organization context', async () => {
            // Arrange
            mockGetChatHistory.mockResolvedValue({
                data: mockOrgChats,
                status: 200,
                error: null
            });

            // Act
            await act(async () => { 
               await useAiStore.getState().loadChatHistory(mockOrgId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual(mockOrgChats);
            // Ensure personal chats are unaffected
            expect(state.chatsByContext.personal).toEqual([]); 
            expect(state.aiError).toBeNull();
       });

        it('should set aiError and clear organization loading state on failure for organization context', async () => {
            // Arrange
            const errorMsg = 'Failed to load org history';
            mockGetChatHistory.mockResolvedValue({
                data: null,
                status: 500,
                error: { message: errorMsg }
            });

            // Act: Wrap async action
            await act(async () => { 
               await useAiStore.getState().loadChatHistory(mockOrgId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe(errorMsg);
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual([]); // Should set empty array for the org on error
            expect(state.isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, mockOrgId);
       });

    }); // End loadChatHistory describe

}); // End main describe block
