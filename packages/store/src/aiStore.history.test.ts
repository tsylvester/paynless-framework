import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore } from './aiStore';
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import {
    // AiProvider,
    // SystemPrompt,
    Chat,
    // ChatMessage,
    // ChatApiRequest,
    ApiResponse,
    User,
    Session,
    UserProfile,
    UserRole
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { AuthRequiredError } from '@paynless/types';

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
        messagesByChatId: {},
        chatsByContext: { personal: [], orgs: {} },
        currentChatId: null,
        isLoadingAiResponse: false,
        isConfigLoading: false,
        isLoadingHistoryByContext: { personal: false, orgs: {} },
        isDetailsLoading: false,
        newChatContext: null,
        rewindTargetMessageId: null,
        aiError: null,
    });
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

    const mockToken = 'valid-token';
    const mockUser: User = { id: 'user-123', email: 'test@test.com', /* other required fields */ created_at: 'now', updated_at: 'now', role: 'user' };
    const mockSession: Session = { access_token: mockToken, refresh_token: 'rt', expiresAt: Date.now() / 1000 + 3600 };
    const mockPersonalChats: Chat[] = [
        { id: 'pc1', user_id: 'u1', title: 'Personal Chat 1', created_at: 't1', updated_at: 't2', organization_id: null, system_prompt_id: null },
        { id: 'pc2', user_id: 'u1', title: 'Personal Chat 2', created_at: 't3', updated_at: 't4', organization_id: null, system_prompt_id: null },
    ];

    // --- Tests for Personal Chat History ---    
    describe('when loading personal chat history (organizationId is null/undefined)', () => {
        beforeEach(() => {
             if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    // ... other authStore state
                } as any);
            } 
        });
        
        it('should set personal loading state and call API client without orgId', async () => {
            mockGetChatHistory.mockResolvedValue({
                data: mockPersonalChats,
                status: 200,
                error: null
            });
            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);

            const promise = useAiStore.getState().loadChatHistory(); // Implicitly personal

            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(true);
            
            await act(async () => { await promise; });

            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, undefined); // Or null, depending on how you want to call for personal
        });

        it('should update personal chatsByContext on success', async () => {
             mockGetChatHistory.mockResolvedValue({
                 data: mockPersonalChats,
                 status: 200,
                 error: null
             });

             await act(async () => { 
                await useAiStore.getState().loadChatHistory(); // Implicitly personal
             });

             const state = useAiStore.getState();
             expect(state.chatsByContext.personal).toEqual(mockPersonalChats);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError and clear personal chats on failure', async () => {
             const errorMsg = 'Failed to load personal history';
             mockGetChatHistory.mockResolvedValue({
                 data: null,
                 status: 500,
                 error: { message: errorMsg }
             });
             // Pre-populate to ensure it gets cleared
             useAiStore.setState(state => ({ chatsByContext: { ...state.chatsByContext, personal: mockPersonalChats }}));

             await act(async () => { 
                await useAiStore.getState().loadChatHistory(); // Implicitly personal
             });

             const state = useAiStore.getState();
             expect(state.aiError).toBe(errorMsg);
             expect(state.chatsByContext.personal).toEqual([]);
             expect(state.isLoadingHistoryByContext.personal).toBe(false);
        });

        it('should update personal chatsByContext on success and not affect pre-existing org chats', async () => {
            // Arrange: Pre-populate some org chats
            const otherOrgId = 'org-other-789';
            const preExistingOrgChats: Chat[] = [
                { id: 'oxo1', user_id: 'u1', title: 'Existing Other Org Chat', created_at: 'tox1', updated_at: 'tox2', organization_id: otherOrgId, system_prompt_id: null }
            ];
            useAiStore.setState(state => ({
                chatsByContext: { ...state.chatsByContext, orgs: { ...state.chatsByContext.orgs, [otherOrgId]: preExistingOrgChats } }
            }));

            mockGetChatHistory.mockResolvedValue({
                data: mockPersonalChats, // mockPersonalChats defined in outer describe
                status: 200,
                error: null
            });

            // Act
            await act(async () => { 
                await useAiStore.getState().loadChatHistory(); // Personal
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.chatsByContext.personal).toEqual(mockPersonalChats);
            expect(state.chatsByContext.orgs[otherOrgId]).toEqual(preExistingOrgChats); // Verify other org chats are untouched
            expect(state.aiError).toBeNull();
        });

        it('should set aiError if no auth token is available for personal history', async () => {
            if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({ session: null } as any);
            }
            
            await act(async () => { 
                await useAiStore.getState().loadChatHistory(); // Implicitly personal
            });

            const state = useAiStore.getState();
            expect(state.aiError).toBe('Authentication token not found.'); 
            expect(state.isLoadingHistoryByContext.personal).toBe(false);
            expect(state.chatsByContext.personal).toEqual([]);
            expect(mockGetChatHistory).not.toHaveBeenCalled();
        });
    });

    // --- Tests for Organization Chat History --- 
    describe('when loading organization-specific chat history', () => {
        const mockOrgId = 'org-abc-123';
        const mockOrgChats: Chat[] = [
            { id: 'oc1', user_id: 'u1', title: 'Org Chat 1', created_at: 't1', updated_at: 't2', organization_id: mockOrgId, system_prompt_id: null },
        ];

        beforeEach(() => {
             if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    // ... other authStore state
                } as any);
            } 
        });

        it('should set org-specific loading state and call API client with orgId', async () => {
            mockGetChatHistory.mockResolvedValue({
                data: mockOrgChats,
                status: 200,
                error: null
            });
            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBeUndefined(); // Or false if pre-initialized

            const promise = useAiStore.getState().loadChatHistory(mockOrgId);

            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBe(true);
            
            await act(async () => { await promise; });

            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, mockOrgId);
        });

        it('should update org-specific chatsByContext on success', async () => {
            mockGetChatHistory.mockResolvedValue({
                data: mockOrgChats,
                status: 200,
                error: null
            });

            await act(async () => { 
               await useAiStore.getState().loadChatHistory(mockOrgId);
            });

            const state = useAiStore.getState();
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual(mockOrgChats);
            expect(state.chatsByContext.personal).toEqual([]); // Personal should be unaffected
            expect(state.aiError).toBeNull();
        });

        it('should update org-specific chatsByContext on success and not affect pre-existing personal chats', async () => {
            // Arrange: Pre-populate some personal chats
            const preExistingPersonalChats: Chat[] = [
                { id: 'px1', user_id: 'u1', title: 'Existing Personal Chat', created_at: 'tp1', updated_at: 'tp2', organization_id: null, system_prompt_id: null }
            ];
            useAiStore.setState(state => ({
                chatsByContext: { ...state.chatsByContext, personal: preExistingPersonalChats }
            }));

            mockGetChatHistory.mockResolvedValue({
                data: mockOrgChats, // mockOrgChats is defined in the describe block
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
            expect(state.chatsByContext.personal).toEqual(preExistingPersonalChats); // Verify personal chats are untouched
            expect(state.aiError).toBeNull();
        });

        it('should set aiError and clear org-specific chats on failure', async () => {
            const errorMsg = 'Failed to load org history';
            mockGetChatHistory.mockResolvedValue({
                data: null,
                status: 500,
                error: { message: errorMsg }
            });
            // Pre-populate to ensure it gets cleared
            useAiStore.setState(state => ({ chatsByContext: { ...state.chatsByContext, orgs: { ...state.chatsByContext.orgs, [mockOrgId]: mockOrgChats } }}));

            await act(async () => { 
               await useAiStore.getState().loadChatHistory(mockOrgId);
            });

            const state = useAiStore.getState();
            expect(state.aiError).toBe(errorMsg);
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual([]);
            expect(state.isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
        });

        it('should set aiError if no auth token is available for org history', async () => {
            if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({ session: null } as any);
            }
            
            await act(async () => { 
                await useAiStore.getState().loadChatHistory(mockOrgId);
            });

            const state = useAiStore.getState();
            expect(state.aiError).toBe('Authentication token not found.'); 
            expect(state.isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false); // or undefined if not touched
            expect(state.chatsByContext.orgs[mockOrgId]).toBeUndefined(); // Or empty array if pre-initialized and then cleared
            expect(mockGetChatHistory).not.toHaveBeenCalled();
        });
    });
});
