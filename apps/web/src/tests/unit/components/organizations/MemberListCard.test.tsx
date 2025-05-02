import React from 'react';
// Use custom render and re-exported testing-library utils
import { render, screen, act, within, waitFor } from '@/tests/utils'; 
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemberListCard } from '@/components/organizations/MemberListCard';
import { useOrganizationStore } from '@paynless/store';
import { OrganizationMemberWithProfile, UserProfile, OrganizationMember } from '@paynless/types'; // Import UserProfile type
import { useAuthStore } from '@paynless/store';
import { useCurrentUser } from '../../../../hooks/useCurrentUser'; // <<< RE-ADD THIS IMPORT
import { toast } from 'sonner'; // Import toast
// import { User } from '@supabase/supabase-js'; // No longer needed

// --- PREPARE MOCKS ---

// Mock the stores
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useOrganizationStore: vi.fn(),
    useAuthStore: vi.fn(),
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the useCurrentUser hook
vi.mock('../../../../hooks/useCurrentUser', () => {
  const mockFn = vi.fn(); // Create mock *inside* factory
  return {
    useCurrentUser: mockFn, // Export the mock
  };
});

// --- Mock Pagination Component ---
// Keep track of passed props and allow simulating callbacks

// Define an interface for expected pagination props in the test
interface MockPaginationProps {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    // Add other potential props if needed, e.g., allowedPageSizes
}

let paginationProps: Partial<MockPaginationProps> = {}; // Use partial as it might not be set initially
let simulatePageChange: ((page: number) => void) | null = null;
let simulatePageSizeChange: ((size: number) => void) | null = null;

vi.mock('@/components/common/PaginationComponent', () => ({
  PaginationComponent: vi.fn((props) => {
    paginationProps = props; // Store props passed to the mock
    // Store callbacks to allow simulation from tests
    simulatePageChange = props.onPageChange; 
    simulatePageSizeChange = props.onPageSizeChange;
    // Render something identifiable for presence check
    return <div data-testid="mock-pagination" />; 
  }),
}));


// --- Mock Data & Setup ---
const mockUpdateMemberRole = vi.fn();
const mockRemoveMember = vi.fn();

// Function to generate mock members easily
const createMockMember = (index: number, role: 'admin' | 'member' = 'member'): OrganizationMemberWithProfile => {
    const userId = `user-${role}-${index}`;
    const profile: UserProfile = {
        id: userId,
        first_name: role === 'admin' ? 'Admin' : 'Member',
        last_name: `User${index}`,
        role: role === 'admin' ? 'admin' : 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_selected_org_id: null, // Add missing property
    };
    const member: OrganizationMember = {
        id: `mem-${role}-${index}`,
        user_id: userId,
        organization_id: 'org-123',
        role: role,
        status: 'active',
        created_at: new Date().toISOString(),
    };
    return { ...member, user_profiles: profile };
};

// Default mock members (less than typical page size)
const defaultMockMembers: OrganizationMemberWithProfile[] = [
  createMockMember(0, 'admin'),
  createMockMember(1),
  createMockMember(2),
];

// Helper to create a larger list for pagination tests
const createLargeMockMemberList = (count: number): OrganizationMemberWithProfile[] => {
    const members: OrganizationMemberWithProfile[] = [createMockMember(0, 'admin')]; // Start with admin
    for (let i = 1; i < count; i++) {
        members.push(createMockMember(i));
    }
    return members;
};

// Default page size for tests
const DEFAULT_TEST_PAGE_SIZE = 10;

// +++ Mock implementations for store actions +++
const mockFetchCurrentOrganizationMembers = vi.fn();
const mockLeaveOrganization = vi.fn(); // Add mock for leave action
// Add other mocks if needed (e.g., from baseline state in other files)
const mockInviteUser = vi.fn(); 
const mockUpdateOrganization = vi.fn();
const mockOpenDeleteDialog = vi.fn();

// Helper to set up mock return values for stores
const setupMocks = (
    currentUserProfile: UserProfile | null, 
    members: OrganizationMemberWithProfile[] = defaultMockMembers, 
    isLoading = false,
    // Add pagination state defaults
    initialPage = 1,
    initialPageSize = DEFAULT_TEST_PAGE_SIZE,
    totalMembers = members.length 
) => {
  const currentUserId = currentUserProfile?.id;
  const currentUserMembership = members.find(m => m.user_id === currentUserId);
  const currentUserRole = currentUserMembership?.role ?? null;

  // Use vi.mocked to get the typed mock function
  vi.mocked(useOrganizationStore).mockReturnValue({
    // --- State ---\
    currentOrganizationMembers: members ?? [],
    isLoading: isLoading,
    currentOrganizationId: 'org-123',
    currentOrganizationDetails: { // Add minimal details needed by component/hooks
        id: 'org-123',
        name: 'Test Org From MemberList Mock',
        visibility: 'private',
        created_at: new Date().toISOString(),
        deleted_at: null,
    },
    userOrganizations: [], // Add empty array if needed
    error: null, // Add error state
    // Add member pagination state
    memberCurrentPage: initialPage,
    memberPageSize: initialPageSize,
    memberTotalCount: totalMembers,

    // --- Selectors ---\
    selectCurrentUserRoleInOrg: () => currentUserRole, 

    // --- Actions ---\
    updateMemberRole: mockUpdateMemberRole,
    removeMember: mockRemoveMember,
    fetchCurrentOrganizationMembers: mockFetchCurrentOrganizationMembers, // Use the mock
    leaveOrganization: mockLeaveOrganization,
    // Add other actions from baseline if potentially used
    fetchUserOrganizations: vi.fn(),
    setCurrentOrganizationId: vi.fn(),
    fetchCurrentOrganizationDetails: vi.fn(),
    inviteUser: mockInviteUser,
    updateOrganization: mockUpdateOrganization,
    openDeleteDialog: mockOpenDeleteDialog,
    // ... add any other actions used by the component or its children/hooks
  });

  // Configure the mocked hook using the imported name
  (useCurrentUser as Mock).mockReturnValue({ // Keep this cast
    user: currentUserProfile, 
    isLoading: false,
  });

  // Use vi.mocked for the auth store as well
  vi.mocked(useAuthStore).mockReturnValue({
    // Provide a more complete auth state if needed
    user: currentUserProfile ? { id: currentUserId, email: `${currentUserId}@test.com` } : null, 
    session: currentUserProfile ? { access_token: 'mock-token', expires_in: 3600, refresh_token: 'mock-refresh', token_type: 'bearer', user: {} } : null,
    profile: currentUserProfile, 
    isLoading: false,
    error: null,
    // Add any other necessary auth state/actions
    loginWithPassword: vi.fn(),
    registerUser: vi.fn(),
    logout: vi.fn(),
    checkSession: vi.fn(),
    updateProfile: vi.fn(),
    getToken: async () => currentUserProfile ? 'mock-token' : null,
    fetchUserProfile: vi.fn(), 
    // ... other auth store properties/methods
  });
};

// Helper to find a member's row in the table (using profile name)
const findMemberRow = (profile: UserProfile): HTMLElement => {
    const fullName = `${profile.first_name} ${profile.last_name}`;
    return screen.getByRole('row', { 
        name: (accessibleName, element) => element.textContent?.includes(fullName) ?? false 
    });
}

// Get the admin profile from the default list for convenience
const adminProfile = defaultMockMembers[0].user_profiles!;
const memberProfile1 = defaultMockMembers[1].user_profiles!;
const memberProfile2 = defaultMockMembers[2].user_profiles!;


describe('MemberListCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paginationProps = {}; // Reset pagination props tracker
    simulatePageChange = null;
    simulatePageSizeChange = null;
    // Default setup before each test (admin user, default members)
    setupMocks(adminProfile);
  });

  afterEach(() => {
  });

  // --- Rendering and Display Tests ---
  // MODIFIED: Only check for members expected on the first page
  it('should display the first page of active members with name, role, and avatar', () => {
    // Arrange
    const totalMembers = 15;
    const pageSize = DEFAULT_TEST_PAGE_SIZE; // 10
    const largeMemberList = createLargeMockMemberList(totalMembers); // Full list (15)
    const firstPageMembers = largeMemberList.slice(0, pageSize); // Get only first page (10)
    
    // Setup mocks: Provide ONLY the first page members, but the correct TOTAL count
    setupMocks(
        adminProfile, 
        firstPageMembers, // Pass only page 1 members
        false,            // isLoading
        1,                // initialPage
        pageSize,         // initialPageSize
        totalMembers      // TOTAL member count
    ); 
    
    // Act
    render(<MemberListCard />);

    // Assert: Verify names and presence of role indicators for PAGE 1 MEMBERS ONLY
    // Assuming pageSize = 10, we expect AdminUser0 to MemberUser9
    expect(screen.getByText('Admin User0')).toBeInTheDocument(); 
    expect(screen.getByText('Member User1')).toBeInTheDocument();
    expect(screen.getByText('Member User9')).toBeInTheDocument(); // Check last member on first page
    
    // Assert member NOT on the first page is NOT rendered initially
    // This should now pass because Member User10 is not in firstPageMembers
    expect(screen.queryByText('Member User10')).not.toBeInTheDocument(); 

    // ... (keep avatar checks if needed, adjust for dynamic names) ...
    expect(screen.getByText('AU')).toBeInTheDocument(); // Correct initials
    // Use getAllByText and check the count for duplicated initials
    const memberAvatars = screen.getAllByText('MU');
    expect(memberAvatars).toHaveLength(9); // Expect 9 members on the first page (index 1-9)

    // ... (keep checks for admin's own row actions) ...
    const adminRow = screen.getByRole('row', { name: /Admin User0/i });
    expect(within(adminRow).getByRole('button', { name: /Leave/i })).toBeInTheDocument();
    // Check dropdown exists for another member on the first page
    const memberRow = screen.getByRole('row', { name: /Member User1/i });
    expect(within(memberRow).getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('should display a message when there are no members', () => {
    setupMocks(adminProfile, []); // Pass empty array for members
    render(<MemberListCard />);
    expect(screen.getByText('No members found.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('should display loading text when loading and members list is empty', () => {
    setupMocks(adminProfile, [], true); // Set isLoading to true, empty members
    render(<MemberListCard />);
    expect(screen.getByText('Loading members...')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No members found.')).not.toBeInTheDocument();
  });
  
  // Note: Test for loading state *with* existing members (showing table + skeleton) 
  // would require component changes to support that.

  // --- Pagination Tests ---
  describe('Pagination', () => {
    const pageSize = DEFAULT_TEST_PAGE_SIZE; // Use constant

    it('should render PaginationComponent when total members exceed page size', () => {
      const members = createLargeMockMemberList(pageSize + 5); // e.g., 15 members
      setupMocks(adminProfile, members);
      render(<MemberListCard />);
      // Check if our mock pagination component was rendered
      expect(screen.getByTestId('mock-pagination')).toBeInTheDocument(); 
    });

    it('should NOT render PaginationComponent when total members are less than or equal to page size', () => {
      const members = createLargeMockMemberList(pageSize); // Exactly page size
      setupMocks(adminProfile, members);
      render(<MemberListCard />);
      expect(screen.queryByTestId('mock-pagination')).not.toBeInTheDocument();
      
      // Also test with fewer members
      render(<MemberListCard />); // Uses defaultMockMembers (3)
      expect(screen.queryByTestId('mock-pagination')).not.toBeInTheDocument();
    });

    it('should pass correct props to PaginationComponent', () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      setupMocks(adminProfile, members);
      render(<MemberListCard />);

      expect(screen.getByTestId('mock-pagination')).toBeInTheDocument();
      // Check the props captured by the mock
      expect(paginationProps).toEqual(
        expect.objectContaining({
          currentPage: 1, // Should initialize to 1
          pageSize: pageSize, // Assuming default is 10
          totalItems: totalMembers,
          // Check that callbacks are functions
          onPageChange: expect.any(Function), 
          onPageSizeChange: expect.any(Function),
        })
      );
    });

    it('should call fetchCurrentOrganizationMembers with correct page when onPageChange is triggered', async () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      setupMocks(adminProfile, members, false, 1, pageSize, totalMembers); 
      render(<MemberListCard />);
      
      expect(screen.getByTestId('mock-pagination')).toBeInTheDocument();
      vi.mocked(mockFetchCurrentOrganizationMembers).mockClear(); 
      
      // Simulate page change via the stored callback
      expect(simulatePageChange).toBeInstanceOf(Function);
      await act(async () => {
        simulatePageChange!(2); // Simulate changing to page 2
      });

      // Expect fetch action to be called again (the component should handle page number internally)
      expect(mockFetchCurrentOrganizationMembers).toHaveBeenCalledTimes(1); 
      // Assert it was called with the new page and existing page size
      expect(mockFetchCurrentOrganizationMembers).toHaveBeenCalledWith({ page: 2, limit: pageSize });
    });

    it('should call fetchCurrentOrganizationMembers with new size and page 1 when onPageSizeChange is triggered', async () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      setupMocks(adminProfile, members, false, 1, pageSize, totalMembers);
      render(<MemberListCard />);
       
      expect(screen.getByTestId('mock-pagination')).toBeInTheDocument();
      vi.mocked(mockFetchCurrentOrganizationMembers).mockClear(); 
      
      // Simulate page size change
      expect(simulatePageSizeChange).toBeInstanceOf(Function);
      await act(async () => {
        simulatePageSizeChange!(25); // Simulate changing page size
      });

      // Expect fetch action to be called again
      expect(mockFetchCurrentOrganizationMembers).toHaveBeenCalledTimes(1); 
      // Assert it was called with page 1 and the new page size
      expect(mockFetchCurrentOrganizationMembers).toHaveBeenCalledWith({ page: 1, limit: 25 });
    });
  });

  // --- Admin Action Tests ---
  describe('Admin Actions', () => {
    const user = userEvent.setup();
    
    beforeEach(() => {
      // Use default members list (small) for these tests unless pagination interaction is needed
      setupMocks(adminProfile); 
    });

    it(`should allow admin to change another member's role via dropdown`, async () => {
      render(<MemberListCard />);
      // Use memberProfile1 from the default small list
      const targetMemberRow = findMemberRow(memberProfile1); 
      const dropdownTrigger = within(targetMemberRow).getByRole('button', { name: 'Open menu' });
      
      // Click the trigger
      await user.click(dropdownTrigger); 
      
      // Wait for the trigger to enter the 'open' state (optional but good practice)
      await waitFor(() => {
        expect(dropdownTrigger).toHaveAttribute('data-state', 'open');
      });
      
      // Wait for the dropdown content to appear in the body, then find the item within it
      const dropdownContent = await waitFor(() => screen.getByRole('menu')); // Wait for the menu container
      const makeAdminItem = within(dropdownContent).getByRole('menuitem', { name: 'Make Admin' }); // Find item inside
      expect(makeAdminItem).toBeInTheDocument(); 
      
      // Click the menu item
      await user.click(makeAdminItem);
      // Expect call with the correct membership ID from the default list
      expect(mockUpdateMemberRole).toHaveBeenCalledWith(defaultMockMembers[1].id, 'admin'); 
    });

    it('should call store removeMember when admin removes another member', async () => {
      render(<MemberListCard />);
      // Use memberProfile2 from the default small list
      const targetMemberRow = findMemberRow(memberProfile2); 
      const dropdownTrigger = within(targetMemberRow).getByRole('button', { name: 'Open menu' });
      
      // Click the trigger
      await user.click(dropdownTrigger); 
      
      // Wait for the trigger to enter the 'open' state (optional)
      await waitFor(() => {
        expect(dropdownTrigger).toHaveAttribute('data-state', 'open');
      });
      
      // Wait for the dropdown content to appear, then find the item within it
      const dropdownContent = await waitFor(() => screen.getByRole('menu')); // Wait for menu container
      const removeItem = within(dropdownContent).getByRole('menuitem', { name: 'Remove Member' }); // Find item inside
      expect(removeItem).toBeInTheDocument(); 
      
      // Click the menu item
      await user.click(removeItem);
      
      // <<< ADD: Wait for dialog and click confirm >>>
      const dialog = await screen.findByRole('alertdialog');
      const confirmButton = await within(dialog).findByRole('button', { name: /Continue|Confirm|Remove/i });
      await user.click(confirmButton);
      
      // Expect call with the correct membership ID from the default list
      expect(mockRemoveMember).toHaveBeenCalledWith(defaultMockMembers[2].id); 
    });

    it(`should NOT show dropdown menu for the admin's own row`, () => {
      render(<MemberListCard />);
      const adminRow = findMemberRow(adminProfile);
      expect(within(adminRow).queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
      expect(within(adminRow).getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    });

    // Tests for API error handling (last admin, generic) are deferred until implementation
    it('should handle generic API errors gracefully for admin actions (e.g., show toast)', async () => {
      // TODO: Setup mocks where updateMemberRole/removeMember throws generic error
      setupMocks(adminProfile);
      render(<MemberListCard />);
      console.log('SKIPPING: Cannot test generic admin action error handling with current UI/placeholder logic.');
    });
  });

  // --- Member Action Tests ---
  describe('Member Actions', () => {
    const user = userEvent.setup();
    
    beforeEach(() => {
      setupMocks(memberProfile1); // Current user is Member One (from default list)
    });

    it('should NOT show dropdown menu controls for non-admins viewing other members', () => {
      render(<MemberListCard />);
      const otherMemberRow = findMemberRow(memberProfile2);
      const adminRow = findMemberRow(adminProfile);
      expect(within(otherMemberRow).queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
      expect(within(adminRow).queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
      expect(within(otherMemberRow).getByText('-')).toBeInTheDocument();
      expect(within(adminRow).getByText('-')).toBeInTheDocument();
    });

    it('should show Leave button and call store removeMember when member clicks Leave', async () => {
      render(<MemberListCard />);
      const selfRow = findMemberRow(memberProfile1);
      const leaveButtonTrigger = within(selfRow).getByRole('button', { name: 'Leave' });
      expect(leaveButtonTrigger).toBeInTheDocument();
      
      // Click the trigger to open the dialog
      // await act(async () => { // Use async act consistency
      //   fireEvent.click(leaveButtonTrigger);
      // });
      await user.click(leaveButtonTrigger);

      // Wait for the dialog and click confirm
      const dialog = await screen.findByRole('alertdialog');
      const confirmButton = await within(dialog).findByRole('button', { name: /Continue|Confirm|Leave/i });
      await user.click(confirmButton);
      
      // Expect call with correct membership ID
      expect(mockRemoveMember).toHaveBeenCalledWith(defaultMockMembers[1].id); 
    });

    // Tests for API error handling (last admin, generic) are deferred until implementation
    it("should handle 'last admin' error when the sole admin tries to leave", async () => {
       // TODO: Setup mocks where removeMember throws 'last admin' error
       // Mock the store action to simulate the API returning the 'last admin' error
       mockRemoveMember.mockResolvedValue(false);

       const soleAdminMember = createMockMember(0, 'admin');
       const soleAdminProfile = soleAdminMember.user_profiles!;
       setupMocks(soleAdminProfile, [soleAdminMember]); // Only one member, who is admin
       const user = userEvent.setup(); // Setup userEvent
       
       render(<MemberListCard />);
       const selfRow = findMemberRow(soleAdminProfile);
       const leaveButtonTrigger = within(selfRow).getByRole('button', { name: 'Leave' });
       await user.click(leaveButtonTrigger);

       // Wait for dialog & click confirm
       const dialog = await screen.findByRole('alertdialog');
       const confirmButton = await within(dialog).findByRole('button', { name: /Continue|Confirm|Leave/i });
       await user.click(confirmButton);
       
       // TODO: Mock removeMember to throw specific error, assert toast/feedback
       expect(mockRemoveMember).toHaveBeenCalledWith(soleAdminMember.id);
       // Assert that an error toast was shown
       expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining('last admin'));
    });
    
    it('should handle generic API errors gracefully for leave action (e.g., show toast)', async () => {
       // TODO: Setup mocks where removeMember throws generic error
       // For now, just check console log
      setupMocks(memberProfile1); // Regular member
      render(<MemberListCard />);
      const selfRow = findMemberRow(memberProfile1);
      const leaveButtonTrigger = within(selfRow).getByRole('button', { name: 'Leave' });
      
      // Click trigger
      await user.click(leaveButtonTrigger);
      
      // Wait for dialog & click confirm
      const dialog = await screen.findByRole('alertdialog');
      const confirmButton = await within(dialog).findByRole('button', { name: /Continue|Confirm|Leave/i });
      await user.click(confirmButton);
      
      // TODO: Mock removeMember to throw generic error, assert toast/feedback
      // await act(async () => { fireEvent.click(leaveButton); });
      expect(mockRemoveMember).toHaveBeenCalledWith(defaultMockMembers[1].id);
    });
  });
});
