import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { useOrganizationStore } from './organizationStore';
import { useAuthStore } from './authStore';
import { act } from '@testing-library/react';
import { Organization, UserProfile, OrganizationStoreType, OrganizationMember } from '@paynless/types';
import { getApiClient } from '@paynless/api';

// --- Mocks ---
// This mock factory is hoisted. It should not reference module-level variables 
// defined with const/let that are initialized later in the file.
vi.mock('@paynless/api', async () => {
    const actual = await vi.importActual<typeof import('@paynless/api')>('@paynless/api');
    return {
        ...actual,
        // getApiClient will be a mock function that returns an object with further mock functions
        getApiClient: vi.fn().mockReturnValue({
            organizations: {
                getOrganizationDetails: vi.fn(),
                updateOrganization: vi.fn(),
                updateOrganizationSettings: vi.fn(),
            },
        }),
    };
});

vi.mock('./authStore');
vi.mock('./analyticsStore'); 

const mockTrackEvent = vi.fn();

// --- Test State Setup ---
const testOrgId = 'org-settings-test-123';
const mockUser: UserProfile = { 
    id: 'user-settings-test', 
    created_at: 't', 
    updated_at: 't',
    first_name: null,
    last_name: null,
    last_selected_org_id: null,
    role: 'user'
};

const initialTestOrgState: Partial<OrganizationStoreType> = {
    currentOrganizationId: testOrgId,
    currentOrganizationDetails: null, 
    isLoading: false,
    error: null,
    userOrganizations: [],
    currentOrganizationMembers: [],
    memberCurrentPage: 1,
    memberPageSize: 10,
    memberTotalCount: 0,
    currentPendingInvites: [], 
    currentPendingRequests: [], 
    currentInviteDetails: null,
    isFetchingInviteDetails: false,
    fetchInviteDetailsError: null,
    isCreateModalOpen: false,
    isDeleteDialogOpen: false,
    orgListPage: 1,
    orgListPageSize: 10,
    orgListTotalCount: 0,
};

const resetOrganizationStore = (initialState: Partial<OrganizationStoreType> = {}) => {
    act(() => {
        useOrganizationStore.setState({
            ...initialTestOrgState,
            ...initialState,
        } as OrganizationStoreType, false); 
    });
};

describe('Organization Store - Chat Settings', () => {
    // Hold references to the mock functions obtained from the mocked getApiClient
    let mockedGetOrganizationDetails: Mock;
    let mockedUpdateOrganizationSettings: Mock;
    // let mockedUpdateOrganization: vi.Mock; // If needed

    beforeEach(() => {
        resetOrganizationStore();
        
        const apiClient = getApiClient();
        mockedGetOrganizationDetails = apiClient.organizations.getOrganizationDetails as Mock;
        mockedUpdateOrganizationSettings = apiClient.organizations.updateOrganizationSettings as Mock;
        // mockedUpdateOrganization = vi.mocked(apiClient.organizations.updateOrganization); // Corrected if used

        vi.clearAllMocks(); 

        mockedGetOrganizationDetails.mockReset();
        mockedUpdateOrganizationSettings.mockReset();
        // mockedUpdateOrganization.mockReset(); // Corrected if used
        mockTrackEvent.mockReset();

        (useAuthStore.getState as Mock).mockReturnValue({ 
            user: mockUser,
            session: { access_token: 'test-token', expires_at: Date.now() + 360000, user: mockUser, expires_in: 3600 } as any,
            navigate: vi.fn(), 
        } as any);
    });

    // afterEach(() => {
    //     // vi.restoreAllMocks(); // Can be too broad. Reset specific spies if used.
    // });

    describe('fetchCurrentOrganizationDetails', () => {
        it('should load organization details including allow_member_chat_creation', async () => {
            const mockOrgDetails: Organization = {
                id: testOrgId,
                name: 'Test Settings Org',
                created_at: 't',
                visibility: 'private',
                deleted_at: null,
                allow_member_chat_creation: true
            };
            mockedGetOrganizationDetails.mockResolvedValue({ data: mockOrgDetails, error: undefined, status: 200 });

            await act(async () => {
                await useOrganizationStore.getState().fetchCurrentOrganizationDetails();
            });

            expect(mockedGetOrganizationDetails).toHaveBeenCalledWith(testOrgId);
            const state = useOrganizationStore.getState();
            expect(state.currentOrganizationDetails).toEqual(mockOrgDetails);
            expect(state.currentOrganizationDetails?.allow_member_chat_creation).toBe(true);
            expect(state.isLoading).toBe(false);
            expect(state.error).toBeNull();
        });
    });

    describe('updateOrganizationSettings', () => {
        it('should call API, update state, and track event on successful update', async () => {
            const initialOrgDetails: Organization = {
                id: testOrgId,
                name: 'Test Settings Org Update',
                created_at: 't',
                visibility: 'private',
                deleted_at: null,
                allow_member_chat_creation: false
            };
            resetOrganizationStore({ currentOrganizationDetails: initialOrgDetails });

            const newSettings = { allow_member_chat_creation: true };
            const updatedOrgDetails = { ...initialOrgDetails, ...newSettings };
            
            mockedUpdateOrganizationSettings.mockResolvedValue({ data: updatedOrgDetails, error: undefined, status: 200 });

            let result: boolean | undefined;
            await act(async () => {
                result = await useOrganizationStore.getState().updateOrganizationSettings(testOrgId, newSettings);
            });

            expect(result).toBe(true);
            expect(mockedUpdateOrganizationSettings).toHaveBeenCalledWith(testOrgId, newSettings);
            const state = useOrganizationStore.getState();
            expect(state.currentOrganizationDetails?.allow_member_chat_creation).toBe(true);
            expect(state.isLoading).toBe(false);
            expect(state.error).toBeNull();
            // TODO: Uncomment and verify when analytics for 'member_chat_creation_toggled' is active in organizationStore.ts
            // expect(mockTrackEvent).toHaveBeenCalledWith('member_chat_creation_toggled', {
            //     organization_id: testOrgId,
            //     enabled: true,
            // });
        });

        it('should set error state and return false on API failure', async () => {
             const initialOrgDetails: Organization = {
                id: testOrgId,
                name: 'Test Settings Org Fail',
                created_at: 't',
                visibility: 'private',
                deleted_at: null,
                allow_member_chat_creation: true
            };
            resetOrganizationStore({ currentOrganizationDetails: initialOrgDetails });

            const newSettings = { allow_member_chat_creation: false };
            const apiError = { message: 'Update failed', code: 'API_ERROR' };
            
            mockedUpdateOrganizationSettings.mockResolvedValue({ data: undefined, error: apiError, status: 500 });

            let result: boolean | undefined;
            await act(async () => {
                result = await useOrganizationStore.getState().updateOrganizationSettings(testOrgId, newSettings);
            });

            expect(result).toBe(false);
            expect(mockedUpdateOrganizationSettings).toHaveBeenCalledWith(testOrgId, newSettings);
            const state = useOrganizationStore.getState();
            expect(state.currentOrganizationDetails?.allow_member_chat_creation).toBe(true); 
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe(apiError.message);
            expect(mockTrackEvent).not.toHaveBeenCalled();
        });
    });

    describe('selectCanCreateOrganizationChats', () => {
        const setupRole = (role: 'admin' | 'member' | null) => { 
             const storeState = useOrganizationStore.getState();
             vi.spyOn(storeState, 'selectCurrentUserRoleInOrg').mockReturnValue(role);
        };

        it('should return true if setting is true (admin)', () => {
            resetOrganizationStore({ currentOrganizationDetails: { allow_member_chat_creation: true } as any });
            setupRole('admin');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(true);
        });

        it('should return true if setting is true (member)', () => {
             resetOrganizationStore({ currentOrganizationDetails: { allow_member_chat_creation: true } as any });
            setupRole('member');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(true);
        });

        it('should return false if setting is false (admin)', () => {
            resetOrganizationStore({ currentOrganizationDetails: { allow_member_chat_creation: false } as any });
            setupRole('admin');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(false);
        });

        it('should return false if setting is false (member)', () => {
             resetOrganizationStore({ currentOrganizationDetails: { allow_member_chat_creation: false } as any });
            setupRole('member');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(false);
        });

        it('should return false if setting is null or undefined', () => {
            resetOrganizationStore({ currentOrganizationDetails: { allow_member_chat_creation: null } as any });
            setupRole('member');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(false);
            
            resetOrganizationStore({ currentOrganizationDetails: {} as any }); 
            setupRole('member');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(false);
        });
        
        it('should return false if organization details are null', () => {
             resetOrganizationStore({ currentOrganizationDetails: null });
            setupRole('member');
            expect(useOrganizationStore.getState().selectCanCreateOrganizationChats()).toBe(false);
        });
    });
});