import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { OrganizationChatSettings } from './OrganizationChatSettings'; // Assuming this path
import { useOrganizationStore, useAuthStore, selectCurrentUserRoleInOrg } from '@paynless/store';
import { vi, type Mock } from 'vitest';
import { Organization, OrganizationMemberWithProfile, UserProfile as PaynlessUserProfile } from '@paynless/types'; // Renamed UserProfile to avoid conflict

// Mock the store
vi.mock('@paynless/store', async (importActual) => {
    const actualStore = await importActual<typeof import('@paynless/store')>();
    return {
        ...actualStore, // Import actual selectors like selectCurrentUserRoleInOrg
        useOrganizationStore: vi.fn(),
        useAuthStore: vi.fn(), // Mock useAuthStore here
        // We will mock selectCurrentUserRoleInOrg directly in tests where needed
        // selectCurrentUserRoleInOrg: vi.fn(), // So, no need to mock it here globally
    };
});

const mockUpdateOrganizationSettings = vi.fn();
// const mockSelectCurrentUserRoleInOrg = vi.fn(); // This mock is not needed as we test the real selector

// Define a type for the mocked user in AuthStore, simplified for tests
interface MockAuthUser {
  id: string;
}

const basicUserProfileMock: PaynlessUserProfile = {
    id: 'profile-id',
    created_at: 'date',
    updated_at: 'date',
    first_name: null,
    last_name: null,
    last_selected_org_id: null,
    role: 'user', // Default role, can be overridden in specific member mocks
};

describe('OrganizationChatSettings', () => {
  const mockOrgId = 'org-123';
  let mockCurrentOrganizationDetails: Partial<Organization> | null;
  let mockIsLoading: boolean;
  let mockError: string | null;
  let mockMembersState: OrganizationMemberWithProfile[] = [];
  let mockAuthUser: MockAuthUser | null = { id: 'default-user-id' };

  const renderComponent = () => render(<OrganizationChatSettings />);

  beforeEach(() => {
    mockCurrentOrganizationDetails = {
      id: mockOrgId,
      name: 'Test Org',
      allow_member_chat_creation: false, // Default to false for tests
    };
    mockIsLoading = false;
    mockError = null;
    mockMembersState = []; // Reset members for each test
    mockAuthUser = { id: 'default-user-id' }; // Reset auth user for each test

    // Setup useAuthStore mock for each test
    (useOrganizationStore as Mock).mockImplementation((selector?: (state: any) => any) => {
      const stateForSelector = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: mockCurrentOrganizationDetails as Organization | null,
        isLoading: mockIsLoading,
        error: mockError,
        updateOrganizationSettings: mockUpdateOrganizationSettings,
        currentOrganizationMembers: mockMembersState, // Provide members for the selector
      };

      if (typeof selector === 'function') {
        // When selectCurrentUserRoleInOrg is called, it will get stateForSelector.
        // It will then internally call useAuthStore.getState().
        return selector(stateForSelector);
      }
      return stateForSelector; 
    });
    
    // Ensure this mock is consistently providing the user object via getState()
    (useAuthStore as Mock).mockImplementation(() => ({
        user: mockAuthUser, // For direct useAuthStore().user access (if any)
        getState: () => ({ // For useAuthStore.getState().user access
            user: mockAuthUser,
            // Mock other parts of authStore state if the selector or component needs them
        }),
    }));

    mockUpdateOrganizationSettings.mockClear();
    mockUpdateOrganizationSettings.mockResolvedValue(true);
  });

  it('should render a Switch and a descriptive label', () => {
    renderComponent();
    expect(screen.getByLabelText(/Allow members to create organization chats/i)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText(/Allow members to create organization chats/i)).toBeInTheDocument();
  });

  it('should have Switch checked if allow_member_chat_creation is true in store', () => {
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, allow_member_chat_creation: true };
    mockAuthUser = { id: 'admin-user' };
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    const switchControl = screen.getByRole('switch') as HTMLButtonElement;
    expect(switchControl.getAttribute('aria-checked')).toBe('true');
  });

  it('should have Switch unchecked if allow_member_chat_creation is false in store', () => {
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, allow_member_chat_creation: false };
    mockAuthUser = { id: 'admin-user' };
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    const switchControl = screen.getByRole('switch') as HTMLButtonElement;
    expect(switchControl.getAttribute('aria-checked')).toBe('false');
  });

  it('should disable Switch if currentUserRoleInOrg is not admin', () => {
    mockAuthUser = { id: 'member-user' };
    mockMembersState = [{ user_id: 'member-user', role: 'member', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'member-user-profile'}, created_at: 'date' }];
    renderComponent();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('should enable Switch if currentUserRoleInOrg is admin', () => {
    // Directly mock selectCurrentUserRoleInOrg for this test
    (useOrganizationStore as Mock).mockImplementation((selector?: (state: any) => any) => {
      const state = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: {
          ...mockCurrentOrganizationDetails,
          id: mockOrgId, // ensure id is present
          allow_member_chat_creation: false 
        } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings,
        currentOrganizationMembers: [
          { user_id: 'admin-user-for-enable-test', role: 'admin', id:'mem-admin-enable', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-enable', role: 'admin'}, created_at: 'date' }
        ],
      };
      if (selector === selectCurrentUserRoleInOrg) {
        return 'admin'; // Force admin role
      }
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    });
    
    mockAuthUser = { id: 'admin-user-for-enable-test' };
    // mockMembersState is set up inside the mockImplementation now for this test

    renderComponent();
    expect(screen.getByRole('switch')).toBeEnabled();
  });

  it('should call updateOrganizationSettings with true when an enabled Switch is toggled on', async () => {
    // Directly mock selectCurrentUserRoleInOrg for this test to ensure switch is enabled
    (useOrganizationStore as Mock).mockImplementation((selector?: (state: any) => any) => {
      const state = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: {
          ...mockCurrentOrganizationDetails,
          id: mockOrgId,
          allow_member_chat_creation: false // Initial state for toggle ON test
        } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings,
        currentOrganizationMembers: [
          { user_id: 'admin-user-toggle-on', role: 'admin', id:'mem-admin-toggle-on', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-toggle-on', role: 'admin'}, created_at: 'date' }
        ],
      };
      if (selector === selectCurrentUserRoleInOrg) {
        return 'admin'; // Force admin role
      }
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    });

    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, id: mockOrgId, allow_member_chat_creation: false };
    mockAuthUser = { id: 'admin-user-toggle-on' };
    // mockMembersState is implicitly set up by the mockImplementation

    renderComponent();
    const switchControl = screen.getByRole('switch');
    
    // Sanity check: ensure switch is enabled before trying to click
    expect(switchControl).toBeEnabled();

    await act(async () => {
      fireEvent.click(switchControl);
    });

    expect(mockUpdateOrganizationSettings).toHaveBeenCalledWith(mockOrgId, { allow_member_chat_creation: true });
  });

  it('should call updateOrganizationSettings with false when an enabled Switch is toggled off', async () => {
    // Directly mock selectCurrentUserRoleInOrg for this test to ensure switch is enabled
    (useOrganizationStore as Mock).mockImplementation((selector?: (state: any) => any) => {
      const state = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: {
          ...mockCurrentOrganizationDetails,
          id: mockOrgId,
          allow_member_chat_creation: true // Initial state for toggle OFF test
        } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings,
        currentOrganizationMembers: [
          { user_id: 'admin-user-toggle-off', role: 'admin', id:'mem-admin-toggle-off', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-toggle-off', role: 'admin'}, created_at: 'date' }
        ],
      };
      if (selector === selectCurrentUserRoleInOrg) {
        return 'admin'; // Force admin role
      }
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    });

    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, id: mockOrgId, allow_member_chat_creation: true };
    mockAuthUser = { id: 'admin-user-toggle-off' };
    // mockMembersState is implicitly set up by the mockImplementation

    renderComponent();
    const switchControl = screen.getByRole('switch');

    // Sanity check: ensure switch is enabled
    expect(switchControl).toBeEnabled();

    await act(async () => {
      fireEvent.click(switchControl);
    });

    expect(mockUpdateOrganizationSettings).toHaveBeenCalledWith(mockOrgId, { allow_member_chat_creation: false });
  });

  it('should not call updateOrganizationSettings if a disabled Switch is clicked (non-admin)', async () => {
    mockAuthUser = { id: 'member-user' }; // Non-admin
    mockMembersState = [
        { 
            user_id: 'member-user', 
            role: 'member', 
            id:'mem-member-no-call', 
            organization_id: mockOrgId, 
            status: 'active', 
            user_profiles: {...basicUserProfileMock, id: 'member-user-profile-no-call'}, 
            created_at: 'date' 
        }
    ];
    renderComponent();
    const switchControl = screen.getByRole('switch');

    // Sanity check: ensure switch is disabled
    expect(switchControl).toBeDisabled();

    await act(async () => {
      fireEvent.click(switchControl); // Attempt to click disabled switch
    });

    expect(mockUpdateOrganizationSettings).not.toHaveBeenCalled();
  });

  it('should display a loading state (disable Switch) when isLoading is true', () => {
    mockIsLoading = true;
    mockAuthUser = { id: 'admin-user-loading' }; // Admin user
    mockMembersState = [
        { 
            user_id: 'admin-user-loading', 
            role: 'admin', 
            id:'mem-admin-loading', 
            organization_id: mockOrgId, 
            status: 'active', 
            user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-loading', role: 'admin'}, 
            created_at: 'date' 
        }
    ];
    renderComponent();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/Updating settings.../i)).toBeInTheDocument();
  });

  it('should display an error message if error is present in store', () => {
    mockError = 'Failed to update!';
    renderComponent();
    expect(screen.getByText(/Update Failed/i)).toBeInTheDocument();
    expect(screen.getByText(mockError)).toBeInTheDocument();
  });

  it('should not render if currentOrganizationDetails is null', () => {
    mockCurrentOrganizationDetails = null;
    const { container } = renderComponent();
    expect(container.firstChild).toBeNull();
  });

  it('should not render if currentOrganizationId is null', () => {
    (useOrganizationStore as Mock).mockImplementation((selector?: (state: any) => any) => {
      const state = {
        currentOrganizationId: null, // Set orgId to null for this test
        currentOrganizationDetails: { id: 'some-org', name: 'Some Org', allow_member_chat_creation: false } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings,
        currentOrganizationMembers: mockMembersState, // Include members
      };
      if (typeof selector === 'function') return selector(state);
      return state;
    });
    // Also ensure authStore is mocked for this specific scenario if selectCurrentUserRoleInOrg is involved
    (useAuthStore as Mock).mockImplementation(() => ({
        user: { id: 'some-user' },
    }));
    const { container } = renderComponent();
    expect(container.firstChild).toBeNull();
  });
}); 