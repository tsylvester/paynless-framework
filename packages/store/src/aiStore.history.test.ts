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
                vi.mocked(useAuthStore.getState).mockReturnValue({ user: mockUser, session: mockSession } as any);
            } 
        });
        
        it('should set personal loading state and call API client for personal context', async () => {
            mockGetChatHistory.mockResolvedValue({ data: mockPersonalChats, status: 200, error: null });
            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);

            const promise = useAiStore.getState().loadChatHistory(); // organizationId is undefined/null

            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(true);
            expect(useAiStore.getState().historyErrorByContext.personal).toBeNull(); // Error cleared initially
            
            await act(async () => { await promise; });

            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            // API called with token. For personal history, no second argument is passed.
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken);
        });

        it('should update personal chatsByContext and clear error on success', async () => {
             mockGetChatHistory.mockResolvedValue({ data: mockPersonalChats, status: 200, error: null });
             await act(async () => { await useAiStore.getState().loadChatHistory(); });
             const state = useAiStore.getState();
             expect(state.chatsByContext.personal).toEqual(mockPersonalChats);
             expect(state.historyErrorByContext.personal).toBeNull();
        });

         it('should set historyErrorByContext.personal and NOT clear personal chats on failure', async () => {
             const errorMsg = 'Failed to load personal history';
             mockGetChatHistory.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg }});
             // Pre-populate to ensure it does NOT get cleared by default (unless store logic changes)
             act(() => {
                useAiStore.setState(state => ({ chatsByContext: { ...state.chatsByContext, personal: [...mockPersonalChats] }}));
             });

             await act(async () => { await useAiStore.getState().loadChatHistory(); });

             const state = useAiStore.getState();
             expect(state.historyErrorByContext.personal).toBe(errorMsg);
             expect(state.chatsByContext.personal).toEqual(mockPersonalChats); // Data not cleared on error
             expect(state.isLoadingHistoryByContext.personal).toBe(false);
        });

        it('should handle AuthRequiredError correctly for personal history', async () => {
            if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({ session: null, user: null } as any);
            }
            
            await act(async () => { await useAiStore.getState().loadChatHistory('personal'); });

            const state = useAiStore.getState();
            // The error message is now standardized in the store.
            expect(state.historyErrorByContext.personal).toBe('Authentication required to fetch chat history.');
            expect(state.isLoadingHistoryByContext.personal).toBe(false);
            expect(state.chatsByContext.personal).toEqual([]); // Should remain empty or initial state
            expect(mockGetChatHistory).not.toHaveBeenCalled();
        });

        it('should update personal chatsByContext on success and not affect pre-existing org chats or their errors', async () => {
            const otherOrgId = 'org-other-789';
            const preExistingOrgChats: Chat[] = [{ id: 'oxo1', user_id: 'u1', title: 'Existing Other Org Chat', created_at: 'tox1', updated_at: 'tox2', organization_id: otherOrgId, system_prompt_id: null }];
            const preExistingOrgError = 'some org error';
            act(() => {
                useAiStore.setState(state => ({
                    chatsByContext: { ...state.chatsByContext, orgs: { ...state.chatsByContext.orgs, [otherOrgId]: preExistingOrgChats } },
                    historyErrorByContext: { ...state.historyErrorByContext, orgs: { ...state.historyErrorByContext.orgs, [otherOrgId]: preExistingOrgError } }
                }));
            });

            mockGetChatHistory.mockResolvedValue({ data: mockPersonalChats, status: 200, error: null });
            await act(async () => { await useAiStore.getState().loadChatHistory(); });

            const state = useAiStore.getState();
            expect(state.chatsByContext.personal).toEqual(mockPersonalChats);
            expect(state.chatsByContext.orgs[otherOrgId]).toEqual(preExistingOrgChats);
            expect(state.historyErrorByContext.personal).toBeNull();
            expect(state.historyErrorByContext.orgs[otherOrgId]).toBe(preExistingOrgError); // Org error untouched
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
                vi.mocked(useAuthStore.getState).mockReturnValue({ user: mockUser, session: mockSession } as any);
            } 
        });

        it('should set org-specific loading state and call API client with orgId', async () => {
            mockGetChatHistory.mockResolvedValue({ data: mockOrgChats, status: 200, error: null });
            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBeUndefined(); 

            const promise = useAiStore.getState().loadChatHistory(mockOrgId);

            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBe(true);
            expect(useAiStore.getState().historyErrorByContext.orgs[mockOrgId]).toBeNull(); // Error cleared initially
            
            await act(async () => { await promise; });

            expect(useAiStore.getState().isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            // API called with token and then organizationId
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, mockOrgId);
        });

        it('should update org-specific chatsByContext and clear error on success', async () => {
            mockGetChatHistory.mockResolvedValue({ data: mockOrgChats, status: 200, error: null });
            await act(async () => { await useAiStore.getState().loadChatHistory(mockOrgId); });
            const state = useAiStore.getState();
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual(mockOrgChats);
            expect(state.historyErrorByContext.orgs[mockOrgId]).toBeNull();
            // API called with the valid token from mockSession and then organizationId
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken, mockOrgId);
        });

        it('should set historyErrorByContext.orgs[orgId] and NOT clear org chats on failure', async () => {
            const errorMsg = 'Failed to load org history';
            mockGetChatHistory.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg }});
            // Pre-populate to ensure it does NOT get cleared
            act(() => {
                useAiStore.setState(state => ({
                    chatsByContext: { ...state.chatsByContext, orgs: { ...state.chatsByContext.orgs, [mockOrgId]: [...mockOrgChats] } }
                }));
            });

            await act(async () => { await useAiStore.getState().loadChatHistory(mockOrgId); });

            const state = useAiStore.getState();
            expect(state.historyErrorByContext.orgs[mockOrgId]).toBe(errorMsg);
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual(mockOrgChats); // Data not cleared on error
            expect(state.isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
        });

        it('should handle AuthRequiredError correctly for org history', async () => {
            // This test confirms that if the user is not authenticated, the action
            // fails gracefully before making an API call.
            if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({ session: null, user: null } as any); // No token
            }
            
            await act(async () => { await useAiStore.getState().loadChatHistory(mockOrgId); });

            const state = useAiStore.getState();
            expect(state.historyErrorByContext.orgs[mockOrgId]).toBe('Authentication required to fetch chat history.');
            expect(state.isLoadingHistoryByContext.orgs[mockOrgId]).toBe(false);
            expect(mockGetChatHistory).not.toHaveBeenCalled();
        });

        it('should update specific org chats and not affect other contexts (personal or other orgs)', async () => {
            const otherOrgId = 'org-other-789';
            const preExistingOtherOrgChats: Chat[] = [{ id: 'oxo1', title: 'Other Org Chat' } as Chat];
            const preExistingPersonalChats: Chat[] = [{ id: 'pxo1', title: 'Personal Xtra Chat' } as Chat];
            act(() => {
                useAiStore.setState(state => ({
                    chatsByContext: {
                        personal: preExistingPersonalChats,
                        orgs: { ...state.chatsByContext.orgs, [otherOrgId]: preExistingOtherOrgChats }
                    }
                }));
            });

            mockGetChatHistory.mockResolvedValue({ data: mockOrgChats, status: 200, error: null });
            await act(async () => { await useAiStore.getState().loadChatHistory(mockOrgId); });

            const state = useAiStore.getState();
            expect(state.chatsByContext.orgs[mockOrgId]).toEqual(mockOrgChats);
            expect(state.chatsByContext.orgs[otherOrgId]).toEqual(preExistingOtherOrgChats);
            expect(state.chatsByContext.personal).toEqual(preExistingPersonalChats);
            expect(state.historyErrorByContext.orgs[mockOrgId]).toBeNull();
        });
    });
});
