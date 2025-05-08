import React from 'react';
import { render, screen, act, within, waitFor } from '@testing-library/react'; 
import { vi, describe, it, expect, beforeEach, beforeAll, Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemberListCard } from '@/components/organizations/MemberListCard';
import { OrganizationMemberWithProfile, UserProfile, OrganizationMember, User } from '@paynless/types';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { toast } from 'sonner';

// Import the selector we intend to mock ITS BEHAVIOR FOR
import { selectCurrentUserRoleInOrg as actualSelectCurrentUserRoleInOrg } from '@paynless/store';

// Import mock helpers from the central mock file
import {
    resetAllStoreMocks,
    mockSetAuthUser,
    mockSetCurrentOrgId,
    mockSetCurrentOrganizationDetails,
    mockSetCurrentOrganizationMembers,
    mockSetOrgIsLoading,
    // Spies for organization actions (if MemberListCard used them, which it doesn't directly)
    // getInternalUpdateOrganizationSpy, 
    // getInternalOpenDeleteDialogSpy,
    // Spies for member actions
    getInternalUpdateMemberRoleSpy,
    getInternalRemoveMemberSpy,
    getInternalFetchCurrentOrganizationMembersSpy,
    // Import new pagination setters
    mockSetMemberCurrentPage,
    mockSetMemberPageSize,
    mockSetMemberTotalCount,
} from './../../mocks/organizationStore.mock';

// PointerEvent stubs for Radix UI components in JSDOM
beforeAll(() => {
  if (!window.Element.prototype.setPointerCapture) { window.Element.prototype.setPointerCapture = vi.fn(); }
  if (!window.Element.prototype.hasPointerCapture) { window.Element.prototype.hasPointerCapture = vi.fn(() => false); }
  if (!window.Element.prototype.releasePointerCapture) { window.Element.prototype.releasePointerCapture = vi.fn(); }
});

// --- PREPARE MOCKS ---

// Mock @paynless/store for its main exports
vi.mock('@paynless/store', async () => {
  const mockImpl = await import('./../../mocks/organizationStore.mock');
  const mockSelectCurrentUserRoleInOrgFn = vi.fn();
  return {
    __esModule: true,
    // Use the centralized mock hook logic
    useOrganizationStore: vi.fn(mockImpl.mockedUseOrganizationStoreHookLogic),
    useAuthStore: vi.fn(mockImpl.mockedUseAuthStoreHookLogic),
    // Provide the mockSelectCurrentUserRoleInOrgFn for tests to control
    selectCurrentUserRoleInOrg: mockSelectCurrentUserRoleInOrgFn,
  };
});

// Mock sonner toast (already done, ensure it's correct)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock logger (already done)
vi.mock('@paynless/utils', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(), // Add info if used
  },
}));

// Mock the useCurrentUser hook (already done)
vi.mock('../../hooks/useCurrentUser', () => ({ // Adjusted path
  useCurrentUser: vi.fn(), 
}));

// --- Mock Pagination Component --- (already done, ensure it's correct)
interface MockPaginationProps { /* ... as before ... */ 
    currentPage: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}
let paginationProps: Partial<MockPaginationProps> = {};
let simulatePageChange: ((page: number) => void) | null = null;
let simulatePageSizeChange: ((size: number) => void) | null = null;

vi.mock('@/components/common/PaginationComponent', () => ({
  PaginationComponent: vi.fn((props) => {
    paginationProps = props;
    simulatePageChange = props.onPageChange; 
    simulatePageSizeChange = props.onPageSizeChange;
    return <div data-testid="mock-pagination" />; 
  }),
}));


// --- Mock Data & Setup ---

// Spies for component actions - will be assigned in beforeEach
let updateMemberRoleSpy: Mock;
let removeMemberSpy: Mock;
let fetchCurrentOrganizationMembersSpy: Mock;
// Note: leaveOrganization in the component calls removeMember, so we use removeMemberSpy for that.

// Function to generate mock members easily (already exists, ensure UserProfile has last_selected_org_id)
const createMockMember = (index: number, role: 'admin' | 'member' = 'member'): OrganizationMemberWithProfile => {
    const userId = `user-${role}-${index}`;
    const profile: UserProfile = {
        id: userId,
        first_name: role === 'admin' ? 'Admin' : 'Member',
        last_name: `User${index}`,
        role: role === 'admin' ? 'admin' : 'user', // This is UserProfile.role
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_selected_org_id: 'org-123', // Ensure this is present
    };
    const member: OrganizationMember = { // This is OrganizationMember.role
        id: `mem-${role}-${index}`,
        user_id: userId,
        organization_id: 'org-123',
        role: role, // This is the role within the organization
        status: 'active',
        created_at: new Date().toISOString(),
    };
    return { ...member, user_profiles: profile };
};

const defaultMockMembers: OrganizationMemberWithProfile[] = [
  createMockMember(0, 'admin'), createMockMember(1), createMockMember(2),
];
const createLargeMockMemberList = (count: number): OrganizationMemberWithProfile[] => { /* ... as before ... */ 
    const members: OrganizationMemberWithProfile[] = [createMockMember(0, 'admin')];
    for (let i = 1; i < count; i++) {
        members.push(createMockMember(i));
    }
    return members;
};
const DEFAULT_TEST_PAGE_SIZE = 10;

// Profiles for convenience
const adminUser = createMockMember(0, 'admin');
const adminProfile = adminUser.user_profiles!; // From default list

const memberUser1 = createMockMember(1);
const memberProfile1 = memberUser1.user_profiles!;

const memberUser2 = createMockMember(2);
const memberProfile2 = memberUser2.user_profiles!;


// Helper to set up mock state using imported setters
const setupMockState = (
    currentUser: UserProfile | null, 
    simulatedRoleInOrg: 'admin' | 'member' | null,
    membersToDisplay: OrganizationMemberWithProfile[] = defaultMockMembers, 
    isLoading = false,
    initialPage = 1,
    initialPageSize = DEFAULT_TEST_PAGE_SIZE,
    totalMembersCount = membersToDisplay.length 
) => {
  // Set auth user (affects useAuthStore via mockedUseAuthStoreHookLogic)
  // The User type for mockSetAuthUser might need adjustment if it expects a simpler User object
  // For now, passing UserProfile should work if mockSetAuthUser handles it by taking id.
  mockSetAuthUser(currentUser as User | UserProfile | null); // Cast if User type is simpler

  // Mock useCurrentUser hook directly
  vi.mocked(useCurrentUser).mockReturnValue({
    user: currentUser, 
    isLoading: false, // Assuming current user data loading is separate
  });

  // Set organization store state (affects useOrganizationStore via mockedUseOrganizationStoreHookLogic)
  mockSetCurrentOrgId('org-123'); // Assume a default org ID
  mockSetCurrentOrganizationDetails({
      id: 'org-123', name: 'Test Org From MemberList Mock', visibility: 'private',
      created_at: new Date().toISOString(), deleted_at: null, allow_member_chat_creation: true,
  });
  mockSetCurrentOrganizationMembers(membersToDisplay);
  mockSetOrgIsLoading(isLoading);
  
  // Use the new setters to explicitly set pagination state in the mock store
  mockSetMemberCurrentPage(initialPage);
  mockSetMemberPageSize(initialPageSize);
  mockSetMemberTotalCount(totalMembersCount);

  // Explicitly set the return value of the selectCurrentUserRoleInOrg mock
  vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue(simulatedRoleInOrg);
};


// Helper to find a member's row (already exists, ensure it's correct)
const findMemberRow = (profile: UserProfile): HTMLElement => { /* ... as before ... */ 
    const fullName = `${profile.first_name} ${profile.last_name}`;
    return screen.getByRole('row', { 
        name: (accessibleName: string | null | undefined, element: Element | null) => element?.textContent?.includes(fullName) ?? false 
    });
};


describe('MemberListCard', () => {
  beforeEach(() => {
    resetAllStoreMocks(); // Resets underlying state of mocked store logic
    vi.mocked(actualSelectCurrentUserRoleInOrg).mockReset(); // Reset the specific selector mock
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(useCurrentUser).mockReset(); // Reset useCurrentUser

    // Get spies from the central mock file
    updateMemberRoleSpy = getInternalUpdateMemberRoleSpy();
    removeMemberSpy = getInternalRemoveMemberSpy();
    fetchCurrentOrganizationMembersSpy = getInternalFetchCurrentOrganizationMembersSpy();
    
    // Default behavior for spies if needed (e.g., resolve promises)
    updateMemberRoleSpy.mockResolvedValue(true);
    removeMemberSpy.mockResolvedValue(true);
    fetchCurrentOrganizationMembersSpy.mockResolvedValue(undefined);

    paginationProps = {}; 
    simulatePageChange = null;
    simulatePageSizeChange = null;

    // Default setup for most tests: Admin user, default members
    // setupMockState(adminProfile, 'admin', defaultMockMembers); // Will be called in specific test/describe blocks
  });

  // --- Rendering and Display Tests ---
  it('should display the first page of active members...', () => {
    const totalMembers = 15;
    const pageSize = DEFAULT_TEST_PAGE_SIZE;
    const largeMemberList = createLargeMockMemberList(totalMembers);
    const firstPageMembers = largeMemberList.slice(0, pageSize);
    
    setupMockState(adminProfile, 'admin', firstPageMembers, false, 1, pageSize, totalMembers); 
    
    render(<MemberListCard />);

    expect(screen.getByText('Admin User0')).toBeInTheDocument(); 
    expect(screen.getByText('Member User1')).toBeInTheDocument();
    expect(screen.getByText('Member User9')).toBeInTheDocument();
    expect(screen.queryByText('Member User10')).not.toBeInTheDocument(); 
    expect(screen.getByText('AU')).toBeInTheDocument();
    const memberAvatars = screen.getAllByText('MU');
    expect(memberAvatars).toHaveLength(9);

    const adminRowElement = findMemberRow(adminProfile); // Use adminProfile from convenience const
    expect(within(adminRowElement).getByRole('button', { name: /Leave/i })).toBeInTheDocument();
    const memberRowElement = findMemberRow(memberProfile1); // Use memberProfile1
    expect(within(memberRowElement).getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('should display a message when there are no members', () => {
    setupMockState(adminProfile, 'admin', [], false, 1, DEFAULT_TEST_PAGE_SIZE, 0);
    render(<MemberListCard />);
    expect(screen.getByText('No members found.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('should display loading text when loading and members list is empty', () => {
    setupMockState(adminProfile, 'admin', [], true, 1, DEFAULT_TEST_PAGE_SIZE, 0);
    render(<MemberListCard />);
    expect(screen.getByText('Loading members...')).toBeInTheDocument();
  });
  
  // --- Pagination Tests --- (Largely similar, ensure setupMockState is used)
  describe('Pagination', () => {
    const pageSize = DEFAULT_TEST_PAGE_SIZE;

    it('should render PaginationComponent when total members exceed page size', () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      // Pass only the first page to display, but total count reflects all
      const firstPageDisplay = members.slice(0, pageSize);
      setupMockState(adminProfile, 'admin', firstPageDisplay, false, 1, pageSize, totalMembers);
      render(<MemberListCard />);
      expect(screen.getByTestId('mock-pagination')).toBeInTheDocument(); 
    });

    it('should NOT render PaginationComponent if total members <= page size', () => {
      setupMockState(adminProfile, 'admin', defaultMockMembers, false, 1, pageSize, defaultMockMembers.length);
      render(<MemberListCard />);
      expect(screen.queryByTestId('mock-pagination')).not.toBeInTheDocument();
    });

    it('should pass correct props to PaginationComponent', () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      const firstPageDisplay = members.slice(0, pageSize);
      setupMockState(adminProfile, 'admin', firstPageDisplay, false, 1, pageSize, totalMembers);
      render(<MemberListCard />);
      expect(paginationProps).toEqual(expect.objectContaining({
          currentPage: 1, pageSize: pageSize, totalItems: totalMembers,
      }));
    });

    it('should call fetchCurrentOrganizationMembers with correct page on onPageChange', async () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      const firstPageDisplay = members.slice(0, pageSize);
      setupMockState(adminProfile, 'admin', firstPageDisplay, false, 1, pageSize, totalMembers);
      render(<MemberListCard />);
      
      fetchCurrentOrganizationMembersSpy.mockClear(); 
      
      expect(simulatePageChange).toBeInstanceOf(Function);
      await act(async () => { simulatePageChange!(2); });

      expect(fetchCurrentOrganizationMembersSpy).toHaveBeenCalledTimes(1); 
      expect(fetchCurrentOrganizationMembersSpy).toHaveBeenCalledWith({ page: 2, limit: pageSize });
    });

    it('should call fetchCurrentOrganizationMembers with page 1 on onPageSizeChange', async () => {
      const totalMembers = pageSize + 5;
      const members = createLargeMockMemberList(totalMembers);
      const firstPageDisplay = members.slice(0, pageSize);
      setupMockState(adminProfile, 'admin', firstPageDisplay, false, 1, pageSize, totalMembers);
      render(<MemberListCard />);
       
      fetchCurrentOrganizationMembersSpy.mockClear(); 
      
      expect(simulatePageSizeChange).toBeInstanceOf(Function);
      await act(async () => { simulatePageSizeChange!(25); });

      expect(fetchCurrentOrganizationMembersSpy).toHaveBeenCalledTimes(1); 
      expect(fetchCurrentOrganizationMembersSpy).toHaveBeenCalledWith({ page: 1, limit: 25 });
    });
  });

  // --- Admin Action Tests ---
  describe('Admin Actions', () => {
    const user = userEvent.setup();
    
    beforeEach(() => {
      setupMockState(adminProfile, 'admin', defaultMockMembers); 
    });

    it(`should allow admin to change another member's role`, async () => {
      render(<MemberListCard />);
      const targetMemberRow = findMemberRow(memberProfile1); 
      const dropdownTrigger = within(targetMemberRow).getByRole('button', { name: 'Open menu' });
      await user.click(dropdownTrigger); 
      await waitFor(() => expect(dropdownTrigger).toHaveAttribute('data-state', 'open'));
      
      const dropdownContent = await screen.findByRole('menu');
      const makeAdminItem = within(dropdownContent).getByRole('menuitem', { name: 'Make Admin' });
      await user.click(makeAdminItem);
      expect(updateMemberRoleSpy).toHaveBeenCalledWith(memberUser1.id, 'admin'); 
    });

    it('should call store removeMember when admin removes another member', async () => {
      render(<MemberListCard />);
      const targetMemberRow = findMemberRow(memberProfile2); 
      const dropdownTrigger = within(targetMemberRow).getByRole('button', { name: 'Open menu' });
      await user.click(dropdownTrigger); 
      await waitFor(() => expect(dropdownTrigger).toHaveAttribute('data-state', 'open'));

      const dropdownContent = await screen.findByRole('menu');
      const removeItem = within(dropdownContent).getByRole('menuitem', { name: 'Remove Member' });
      await user.click(removeItem);
      
      const dialog = await screen.findByRole('alertdialog');
      const confirmButton = within(dialog).getByRole('button', { name: /Confirm Remove/i });
      await user.click(confirmButton);
      expect(removeMemberSpy).toHaveBeenCalledWith(memberUser2.id); 
    });

    it(`should NOT show dropdown menu for the admin's own row`, () => {
      render(<MemberListCard />);
      const adminRowElement = findMemberRow(adminProfile);
      expect(within(adminRowElement).queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
      expect(within(adminRowElement).getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    });
  });

  // --- Member Action Tests ---
  describe('Member Actions', () => {
    const user = userEvent.setup();
    
    beforeEach(() => {
      // Current user is Member One (memberProfile1)
      setupMockState(memberProfile1, 'member', defaultMockMembers); 
    });

    it('should NOT show dropdown menu for other members if current user is not admin', () => {
      render(<MemberListCard />);
      const otherMemberRow = findMemberRow(memberProfile2); // Different member
      const adminRowElement = findMemberRow(adminProfile); // Admin member
      
      expect(within(otherMemberRow).queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
      expect(within(adminRowElement).queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
      // Check for placeholder '-'
      expect(within(otherMemberRow).getByText('-')).toBeInTheDocument();
      expect(within(adminRowElement).getByText('-')).toBeInTheDocument();
    });

    it('should show Leave button and call removeMember on confirm for own row', async () => {
      render(<MemberListCard />);
      const selfRow = findMemberRow(memberProfile1);
      const leaveButtonTrigger = within(selfRow).getByRole('button', { name: 'Leave' });
      await user.click(leaveButtonTrigger);

      const dialog = await screen.findByRole('alertdialog');
      const confirmButton = within(dialog).getByRole('button', { name: /Confirm Leave/i });
      await user.click(confirmButton);
      expect(removeMemberSpy).toHaveBeenCalledWith(memberUser1.id); 
    });

    it("should show error toast if leave fails (e.g. last admin)", async () => {
       removeMemberSpy.mockResolvedValue(false); // Simulate failure
       // Current user is adminProfile, and they are the only admin in defaultMockMembers
       setupMockState(adminProfile, 'admin', defaultMockMembers);
       
       render(<MemberListCard />);
       const selfRow = findMemberRow(adminProfile);
       const leaveButtonTrigger = within(selfRow).getByRole('button', { name: 'Leave' });
       await user.click(leaveButtonTrigger);

       const dialog = await screen.findByRole('alertdialog');
       const confirmButton = within(dialog).getByRole('button', { name: /Confirm Leave/i });
       await user.click(confirmButton);
       
       expect(removeMemberSpy).toHaveBeenCalledWith(adminUser.id);
       expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to leave organization. You might be the last admin.");
    });
  });
});
