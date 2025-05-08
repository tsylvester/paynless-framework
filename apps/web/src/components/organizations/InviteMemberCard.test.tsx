import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { InviteMemberCard } from './InviteMemberCard';
import { UserProfile, OrganizationMemberWithProfile, User } from '@paynless/types';
import { toast } from 'sonner'; // Import toast for assertion
import { useCurrentUser } from '../../hooks/useCurrentUser'; // Import the hook directly
// Import the selector we intend to mock ITS BEHAVIOR FOR, not its implementation
import { selectCurrentUserRoleInOrg as actualSelectCurrentUserRoleInOrg } from '@paynless/store';

// Import ONLY the mock *helpers* needed for test bodies and setup (NOT for the vi.mock factory below)
import {
    mockSetAuthUser,
    mockSetCurrentOrgId,
    mockSetCurrentOrganizationMembers,
    mockSetOrgIsLoading,
    getInternalInviteUserSpy,
    resetAllStoreMocks
} from './../../mocks/organizationStore.mock';

// Mock @paynless/store for its main exports used by the component
vi.mock('@paynless/store', async () => {
  const mockImpl = await import('./../../mocks/organizationStore.mock');
  // This is the function whose behavior we will control in each test
  const mockSelectCurrentUserRoleInOrgFn = vi.fn();
  return {
    __esModule: true,
    useOrganizationStore: vi.fn(mockImpl.mockedUseOrganizationStoreHookLogic),
    useAuthStore: vi.fn(mockImpl.mockedUseAuthStoreHookLogic),
    // Provide the mockSelectCurrentUserRoleInOrgFn as the implementation for selectCurrentUserRoleInOrg
    selectCurrentUserRoleInOrg: mockSelectCurrentUserRoleInOrgFn,
  };
});

// Mock dependencies, creating vi.fn() *inside* the factory
vi.mock('sonner', () => {
  const actual = vi.importActual('sonner'); // Import actual if needed, though here we mock all
  const mockError = vi.fn();
  const mockSuccess = vi.fn();
  return {
    ...actual, // Spread actual if you only want to override parts
    toast: {
      success: mockSuccess,
      error: mockError,
    }
  };
});

// Mock @paynless/utils, preserving other exports and mocking logger
vi.mock('@paynless/utils', async (importOriginal) => {
  const actualUtils = await importOriginal() as Record<string, unknown>; // Get original exports
  return {
    ...actualUtils, // Spread all original exports (including store mock helpers)
    logger: { // Override just the logger
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// Mock useCurrentUser hook
vi.mock('../../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(), // Simple mock function
}));

// --- Test Data ---
const adminProfile: UserProfile = { id: 'user-admin', first_name: 'Admin', last_name: 'User', role: 'admin', created_at: '', updated_at: '', last_selected_org_id: null };
const memberProfile: UserProfile = { id: 'user-member', first_name: 'Member', last_name: 'User', role: 'user', created_at: '', updated_at: '', last_selected_org_id: null };
const adminUser: User = { id: 'user-admin', email: 'admin@example.com', role: 'admin' };
const memberUser: User = { id: 'user-member', email: 'member@example.com', role: 'user' };

// Helper setup function (no longer async)
const setupMocksForCard = (roleToSimulate: 'admin' | 'member' | null, isLoading = false, currentOrgId: string | null = 'org-test-123') => {
    const userForAuthStore = roleToSimulate === 'admin' ? adminUser : (roleToSimulate === 'member' ? memberUser : null);
    const profileForCurrentUserHook = roleToSimulate === 'admin' ? adminProfile : (roleToSimulate === 'member' ? memberProfile : null);
    
    mockSetAuthUser(userForAuthStore); 
    vi.mocked(useCurrentUser).mockReturnValue({ user: profileForCurrentUserHook, isLoading: false }); 
    mockSetCurrentOrgId(currentOrgId);
    mockSetOrgIsLoading(isLoading);

    let orgMembers: OrganizationMemberWithProfile[] = [];
    if (profileForCurrentUserHook && currentOrgId && roleToSimulate) {
        orgMembers = [{
            id: `member-${profileForCurrentUserHook.id}`,
            user_id: profileForCurrentUserHook.id,
            organization_id: currentOrgId,
            role: roleToSimulate,
            status: 'active',
            created_at: new Date().toISOString(),
            user_profiles: profileForCurrentUserHook,
        }];
    }
    mockSetCurrentOrganizationMembers(orgMembers);
};

// PointerEvent stubs
beforeAll(() => {
  if (!window.Element.prototype.setPointerCapture) { window.Element.prototype.setPointerCapture = vi.fn(); }
  if (!window.Element.prototype.hasPointerCapture) { window.Element.prototype.hasPointerCapture = vi.fn(() => false); }
  if (!window.Element.prototype.releasePointerCapture) { window.Element.prototype.releasePointerCapture = vi.fn(); }
  if (!window.Element.prototype.scrollIntoView) { window.Element.prototype.scrollIntoView = vi.fn(); }
});

describe('InviteMemberCard', () => {
    beforeEach(() => {
        resetAllStoreMocks(); // Resets the underlying data state in organizationStore.mock
        vi.mocked(toast.error).mockClear();
        vi.mocked(useCurrentUser).mockReset();
        
        // Reset the mock for selectCurrentUserRoleInOrg that's part of the @paynless/store mock
        // This `actualSelectCurrentUserRoleInOrg` is the one we imported from '@paynless/store'
        // and which our vi.mock factory for '@paynless/store' replaces with `mockSelectCurrentUserRoleInOrgFn`.
        // So, vi.mocked(actualSelectCurrentUserRoleInOrg) refers to `mockSelectCurrentUserRoleInOrgFn`.
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReset();
    });

    it('should render correctly for an admin', async () => {
        setupMocksForCard('admin', false, 'org-test-123'); // Set up underlying data as admin
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin'); // Explicitly set selector's output

        render(<InviteMemberCard />);
        // Use findByText for initial assertion as component rendering might involve async operations
        expect(await screen.findByText(/invite new member/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send invite/i })).toBeInTheDocument();
    });

    it('should NOT render for a non-admin member', () => {
        setupMocksForCard('member', false, 'org-test-123'); // Set up underlying data as member
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('member'); // Explicitly set selector's output

        render(<InviteMemberCard />);
        expect(screen.queryByText(/invite new member/i)).not.toBeInTheDocument();
    });
    
    it('should NOT render if currentOrganizationId is null', () => {
        // currentOrganizationId is set to null by setupMocksForCard
        // The component's logic `!currentOrganizationId` should cause it to return null
        // regardless of what selectCurrentUserRoleInOrg returns, but we set it for consistency.
        setupMocksForCard('admin', false, null); 
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin'); // Role is admin

        render(<InviteMemberCard />);
        expect(screen.queryByText(/invite new member/i)).not.toBeInTheDocument();
    });

    it('should require email input', async () => {
        setupMocksForCard('admin', false, 'org-test-123');
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');
        render(<InviteMemberCard />); 
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        const inviteUserSpy = getInternalInviteUserSpy();
        
        fireEvent.click(submitButton);
        
        await waitFor(() => {
           expect(inviteUserSpy).not.toHaveBeenCalled();
           expect(emailInput).toBeInvalid(); 
        });
    });
    
    it('should validate email format', async () => {
        setupMocksForCard('admin', false, 'org-test-123');
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');
        render(<InviteMemberCard />); 
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        const inviteUserSpy = getInternalInviteUserSpy();
        
        fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
        fireEvent.click(submitButton);
        
        await waitFor(() => {
           expect(inviteUserSpy).not.toHaveBeenCalled();
           expect(emailInput).toBeInvalid();
        });
    });

    it('should successfully call inviteUser with email and default role (member) on valid submission', async () => {
        setupMocksForCard('admin', false, 'org-test-123');
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');
        render(<InviteMemberCard />); 
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        const inviteUserSpy = getInternalInviteUserSpy();
        
        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        
        await act(async () => {
          fireEvent.click(submitButton);
        });

        expect(inviteUserSpy).toHaveBeenCalledTimes(1);
        expect(inviteUserSpy).toHaveBeenCalledWith('test@example.com', 'member'); 
    });

    it('should successfully call inviteUser with email and selected role (admin) on valid submission', async () => {
       setupMocksForCard('admin', false, 'org-test-123');
       vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');
       render(<InviteMemberCard />); 
       const user = userEvent.setup();
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        const roleSelectTrigger = screen.getByRole('combobox', { name: /role/i }); 
        const inviteUserSpy = getInternalInviteUserSpy();

        await user.type(emailInput, 'admin@example.com');
        await user.click(roleSelectTrigger); 
        const adminOption = await waitFor(() => screen.getByRole('option', { name: /Admin/i }));
        await user.click(adminOption); 
        await user.click(submitButton); 

        expect(inviteUserSpy).toHaveBeenCalledTimes(1);
        expect(inviteUserSpy).toHaveBeenCalledWith('admin@example.com', 'admin');
    });

    it('should disable submit button while loading', () => {
        // isLoading is set to true by setupMocksForCard
        // The component's Button disabled={formState.isSubmitting || isLoading} should handle this.
        // selectCurrentUserRoleInOrg needs to be 'admin' for the card to render at all.
        setupMocksForCard('admin', true, 'org-test-123'); 
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');

        render(<InviteMemberCard />);
        expect(screen.getByRole('button', { name: /send invite/i })).toBeDisabled();
    });

    it('should display API error feedback (e.g., toast) if inviteUser fails', async () => {
        setupMocksForCard('admin', false, 'org-test-123');
        vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');
        const apiError = new Error('User already exists');
        const inviteUserSpy = getInternalInviteUserSpy();
        inviteUserSpy.mockRejectedValueOnce(apiError); 

        render(<InviteMemberCard />); 
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        
        fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
        
        await act(async () => {
          fireEvent.click(submitButton);
        });

        expect(inviteUserSpy).toHaveBeenCalledTimes(1);
        expect(inviteUserSpy).toHaveBeenCalledWith('existing@example.com', 'member');
        
        await waitFor(() => {
           expect(vi.mocked(toast.error)).toHaveBeenCalledWith(apiError.message);
        });
    });
}); 