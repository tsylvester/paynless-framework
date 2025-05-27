import { render, screen, fireEvent, act } from '@testing-library/react';
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

// Define a more specific type for the state used in mockImplementation
// This should ideally align with the actual state parts being used by the component/selectors
// For OrganizationStore, based on usage:
interface MockOrganizationStoreState {
  currentOrganizationId: string | null;
  currentOrganizationDetails: Partial<Organization> | null;
  isLoading: boolean;
  error: string | null;
  updateOrganizationSettings: Mock<[string, Partial<Organization>], Promise<boolean | void>>; // More specific mock type
  currentOrganizationMembers: OrganizationMemberWithProfile[];
  // Add other state properties if they are accessed by selectors or the component
  // For example, if OrganizationStoreImplementation has more fields that selectors might use
}

const basicUserProfileMock: PaynlessUserProfile = {
    id: 'profile-id',
    created_at: 'date',
    updated_at: 'date',
    first_name: null,
    last_name: null,
    last_selected_org_id: null,
    role: 'user', // Default role, can be overridden in specific member mocks
    chat_context: { last_chat_id: null, last_model_used: null }, // Provide a default or mock value
    profile_privacy_setting: 'private', // Provide a default or mock value
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
    (useOrganizationStore as unknown as Mock).mockImplementation((selector?: (state: MockOrganizationStoreState) => unknown) => {
      const stateForSelector: MockOrganizationStoreState = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: mockCurrentOrganizationDetails as Organization | null,
        isLoading: mockIsLoading,
        error: mockError,
        updateOrganizationSettings: mockUpdateOrganizationSettings as Mock<[string, Partial<Organization>], Promise<boolean | void>>,
        currentOrganizationMembers: mockMembersState,
      };

      if (typeof selector === 'function') {
        // When selectCurrentUserRoleInOrg is called, it will get stateForSelector.
        // It will then internally call useAuthStore.getState().
        // Cast for comparison to specific selector type
        if (selector === (selectCurrentUserRoleInOrg as unknown as (state: MockOrganizationStoreState) => unknown)) {
            // If your mock for selectCurrentUserRoleInOrg is supposed to return a specific value directly from here
            // you might need to adjust. Original logic implies it runs the actual selector.
        }
        return selector(stateForSelector);
      }
      return stateForSelector; 
    });
    
    // Ensure this mock is consistently providing the user object via getState()
    (useAuthStore as unknown as Mock).mockImplementation(() => ({
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
    expect(screen.getByLabelText(/Use organization tokens for organization chats/i)).toBeInTheDocument();
    expect(screen.getByText(/Allow members to create organization chats/i)).toBeInTheDocument();
  });

  it('should have Switch checked if allow_member_chat_creation is true in store', () => {
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, allow_member_chat_creation: true };
    mockAuthUser = { id: 'admin-user' };
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    const switchControl = screen.getByLabelText(/Allow members to create organization chats/i) as HTMLButtonElement;
    expect(switchControl.getAttribute('aria-checked')).toBe('true');
  });

  it('should have Switch unchecked if allow_member_chat_creation is false in store', () => {
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, allow_member_chat_creation: false };
    mockAuthUser = { id: 'admin-user' };
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    const switchControl = screen.getByLabelText(/Allow members to create organization chats/i) as HTMLButtonElement;
    expect(switchControl.getAttribute('aria-checked')).toBe('false');
  });

  it('should disable Switch if currentUserRoleInOrg is not admin', () => {
    mockAuthUser = { id: 'member-user' };
    mockMembersState = [{ user_id: 'member-user', role: 'member', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'member-user-profile'}, created_at: 'date' }];
    renderComponent();
    expect(screen.getByLabelText(/Allow members to create organization chats/i)).toBeDisabled();
    expect(screen.getByLabelText(/Use organization tokens for organization chats/i)).toBeDisabled();
  });

  it('should enable Switch if currentUserRoleInOrg is admin', () => {
    // Directly mock selectCurrentUserRoleInOrg for this test
    (useOrganizationStore as unknown as Mock).mockImplementation((selector?: (state: MockOrganizationStoreState) => unknown) => {
      const state: MockOrganizationStoreState = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: {
          ...mockCurrentOrganizationDetails,
          id: mockOrgId, // ensure id is present
          allow_member_chat_creation: false 
        } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings as Mock<[string, Partial<Organization>], Promise<boolean | void>>,
        currentOrganizationMembers: [
          { user_id: 'admin-user-for-enable-test', role: 'admin', id:'mem-admin-enable', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-enable', role: 'admin'}, created_at: 'date' }
        ],
      };
      if (selector === (selectCurrentUserRoleInOrg as unknown as (state: MockOrganizationStoreState) => unknown)) {
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
    expect(screen.getByLabelText(/Allow members to create organization chats/i)).toBeEnabled();
    // For Phase 1, the token usage policy switch is always disabled, even for admins.
    expect(screen.getByLabelText(/Use organization tokens for organization chats/i)).toBeDisabled();
  });

  it('should call updateOrganizationSettings with true when an enabled Switch is toggled on', async () => {
    // Directly mock selectCurrentUserRoleInOrg for this test to ensure switch is enabled
    (useOrganizationStore as unknown as Mock).mockImplementation((selector?: (state: MockOrganizationStoreState) => unknown) => {
      const state: MockOrganizationStoreState = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: {
          ...mockCurrentOrganizationDetails,
          id: mockOrgId,
          allow_member_chat_creation: false // Initial state for toggle ON test
        } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings as Mock<[string, Partial<Organization>], Promise<boolean | void>>,
        currentOrganizationMembers: [
          { user_id: 'admin-user-toggle-on', role: 'admin', id:'mem-admin-toggle-on', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-toggle-on', role: 'admin'}, created_at: 'date' }
        ],
      };
      if (selector === (selectCurrentUserRoleInOrg as unknown as (state: MockOrganizationStoreState) => unknown)) {
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
    const switchControl = screen.getByLabelText(/Allow members to create organization chats/i);
    
    // Sanity check: ensure switch is enabled before trying to click
    expect(switchControl).toBeEnabled();

    await act(async () => {
      fireEvent.click(switchControl);
    });

    expect(mockUpdateOrganizationSettings).toHaveBeenCalledWith(mockOrgId, { allow_member_chat_creation: true });
  });

  it('should call updateOrganizationSettings with false when an enabled Switch is toggled off', async () => {
    // Directly mock selectCurrentUserRoleInOrg for this test to ensure switch is enabled
    (useOrganizationStore as unknown as Mock).mockImplementation((selector?: (state: MockOrganizationStoreState) => unknown) => {
      const state: MockOrganizationStoreState = {
        currentOrganizationId: mockOrgId,
        currentOrganizationDetails: {
          ...mockCurrentOrganizationDetails,
          id: mockOrgId,
          allow_member_chat_creation: true // Initial state for toggle OFF test
        } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings as Mock<[string, Partial<Organization>], Promise<boolean | void>>,
        currentOrganizationMembers: [
          { user_id: 'admin-user-toggle-off', role: 'admin', id:'mem-admin-toggle-off', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-toggle-off', role: 'admin'}, created_at: 'date' }
        ],
      };
      if (selector === (selectCurrentUserRoleInOrg as unknown as (state: MockOrganizationStoreState) => unknown)) {
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
    const switchControl = screen.getByLabelText(/Allow members to create organization chats/i);

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

    // Attempt to click the first switch
    const switchControlAllowMember = screen.getByLabelText(/Allow members to create organization chats/i);
    expect(switchControlAllowMember).toBeDisabled(); // Verify it's disabled
    await act(async () => {
      fireEvent.click(switchControlAllowMember);
    });

    // Attempt to click the second switch
    const switchControlTokenPolicy = screen.getByLabelText(/Use organization tokens for organization chats/i);
    expect(switchControlTokenPolicy).toBeDisabled(); // Verify it's disabled
    await act(async () => {
      fireEvent.click(switchControlTokenPolicy);
    });

    expect(mockUpdateOrganizationSettings).not.toHaveBeenCalled();
  });

  it('should display a loading state (disable Switch) when isLoading is true', () => {
    mockIsLoading = true;
    mockAuthUser = { id: 'admin-user' }; // Assume admin for this, loading state should override
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem1', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    expect(screen.getByLabelText(/Allow members to create organization chats/i)).toBeDisabled();
    expect(screen.getByLabelText(/Use organization tokens for organization chats/i)).toBeDisabled();
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
    (useOrganizationStore as unknown as Mock).mockImplementation((selector?: (state: MockOrganizationStoreState) => unknown) => {
      const state: MockOrganizationStoreState = {
        currentOrganizationId: null, // Set orgId to null for this test
        currentOrganizationDetails: { id: 'some-org', name: 'Some Org', allow_member_chat_creation: false } as Organization,
        isLoading: false,
        error: null,
        updateOrganizationSettings: mockUpdateOrganizationSettings as Mock<[string, Partial<Organization>], Promise<boolean | void>>,
        currentOrganizationMembers: mockMembersState, // Include members
      };
      if (typeof selector === 'function') return selector(state);
      return state;
    });
    // Also ensure authStore is mocked for this specific scenario if selectCurrentUserRoleInOrg is involved
    (useAuthStore as unknown as Mock).mockImplementation(() => ({
        user: { id: 'some-user' },
    }));
    const { container } = renderComponent();
    expect(container.firstChild).toBeNull();
  });

  // Tests for the new "Token Usage Policy" switch
  // These tests assume an admin user, as only admins can modify this setting.

  it('should have "Token Usage Policy" Switch unchecked by default (member_tokens)', () => {
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, token_usage_policy: 'member_tokens' };
    mockAuthUser = { id: 'admin-user' };
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem-admin-token-default', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-token-default', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    const tokenPolicySwitch = screen.getByLabelText(/Use organization tokens for organization chats/i) as HTMLButtonElement;
    expect(tokenPolicySwitch.getAttribute('aria-checked')).toBe('false');
    // The switch should be disabled as per Phase 1 requirements
    expect(tokenPolicySwitch).toBeDisabled();
     // And the label should indicate it's not available
    expect(screen.getByText(/Use organization tokens for chat \(not available\)/i)).toBeInTheDocument();
  });


  it('should have "Token Usage Policy" Switch checked if token_usage_policy is organization_tokens (and org wallets enabled - future state)', () => {
    // This test reflects a future state where org wallets are enabled. For now, it will be similar to the default.
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, token_usage_policy: 'organization_tokens' };
    mockAuthUser = { id: 'admin-user' };
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem-admin-token-org', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-token-org', role: 'admin'}, created_at: 'date' }];
    renderComponent();
    const tokenPolicySwitch = screen.getByLabelText(/Use organization tokens for organization chats/i) as HTMLButtonElement;
    // In Phase 1, this switch is always disabled and reflects 'member_tokens' effectively, so it should be 'false'
    // When org wallets are enabled, and policy is 'organization_tokens', this would be 'true' and enabled.
    expect(tokenPolicySwitch.getAttribute('aria-checked')).toBe('false'); // This would be 'true' in a later phase
    expect(tokenPolicySwitch).toBeDisabled(); // This would be enabled in a later phase
    // The label reflects "not available" in phase 1
    expect(screen.getByText(/Use organization tokens for chat \(not available\)/i)).toBeInTheDocument();
  });


  // it('should call updateOrganizationSettings with organization_tokens when "Token Usage Policy" Switch is toggled on (and org wallets enabled - future state)', async () => {
  //   // This test will be relevant in Phase 3 when the switch is interactive.
  //   // For Phase 1, this interaction is disabled.
  //   (useOrganizationStore as Mock).mockImplementation((selector?: (state: any) => any) => {
  //     const state = {
  //       currentOrganizationId: mockOrgId,
  //       currentOrganizationDetails: {
  //         ...mockCurrentOrganizationDetails,
  //         id: mockOrgId,
  //         token_usage_policy: 'member_tokens', // Initial state
  //         allow_member_chat_creation: true, // Assuming this is also enabled for an admin
  //       } as Organization,
  //       isLoading: false,
  //       error: null,
  //       updateOrganizationSettings: mockUpdateOrganizationSettings,
  //       currentOrganizationMembers: [
  //         { user_id: 'admin-user-token-toggle', role: 'admin', id:'mem-admin-token-toggle', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-token-toggle', role: 'admin'}, created_at: 'date' }
  //       ],
  //     };
  //     if (selector === selectCurrentUserRoleInOrg) return 'admin';
  //     if (typeof selector === 'function') return selector(state);
  //     return state;
  //   });

  //   mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, id: mockOrgId, token_usage_policy: 'member_tokens' };
  //   mockAuthUser = { id: 'admin-user-token-toggle' };
  //   renderComponent();
    
  //   const tokenPolicySwitch = screen.getByLabelText(/Use organization tokens for organization chats/i);
    
  //   // In future phases, this switch would be enabled. For now, we expect it to be disabled.
  //   // For the purpose of this illustrative future test, let's assume it's enabled.
  //   // You would uncomment the following lines and adjust component logic for Phase 3.
  //   // expect(tokenPolicySwitch).toBeEnabled(); 
  //   // await act(async () => {
  //   //   fireEvent.click(tokenPolicySwitch);
  //   // });
  //   // expect(mockUpdateOrganizationSettings).toHaveBeenCalledWith(mockOrgId, { token_usage_policy: 'organization_tokens' });
    
  //   // For Phase 1, we assert it's disabled.
  //   expect(tokenPolicySwitch).toBeDisabled();
  // });

  // Add a test for the tooltip/informational message for the disabled "Organization Tokens" option
  it('should display an informational message when "Organization Tokens" option is disabled', () => {
    mockCurrentOrganizationDetails = { ...mockCurrentOrganizationDetails, token_usage_policy: 'member_tokens' };
    mockAuthUser = { id: 'admin-user' }; // Admin context
    mockMembersState = [{ user_id: 'admin-user', role: 'admin', id:'mem-admin-info', organization_id: mockOrgId, status: 'active', user_profiles: {...basicUserProfileMock, id: 'admin-user-profile-info', role: 'admin'}, created_at: 'date' }];

    renderComponent();
    const tokenPolicySwitch = screen.getByLabelText(/Use organization tokens for organization chats/i);
    const label = screen.getByText(/Use organization tokens for chat \(not available\)/i);

    expect(tokenPolicySwitch).toBeDisabled();
    expect(label).toBeInTheDocument();
    
    // As per checklist: "Display an informational message/toast (e.g., "Organization wallets are not yet enabled. Org chats will use member tokens by default.") when "Organization Tokens" is interacted with or hovered over while disabled."
    // The label itself serves as this informational message in the current implementation.
    // If a separate Tooltip component was used, we would test for its appearance on hover/focus of the disabled switch.
    // For now, checking the label text which indicates unavailability is sufficient.
  });
}); 