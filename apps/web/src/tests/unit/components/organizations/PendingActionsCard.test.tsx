import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PendingActionsCard } from '@/components/organizations/PendingActionsCard';
import { useOrganizationStore } from '@paynless/store';
import { 
    PendingInviteWithInviter, 
    PendingRequestWithDetails,
    UserProfile // Import UserProfile type
} from '@paynless/types';
import { formatDistanceToNow } from 'date-fns'; // Keep this for date checks

// Mock the Zustand store
vi.mock('@paynless/store', () => ({
  useOrganizationStore: vi.fn(),
}));

// Helper to create mock date string easily
// REMOVE: const formatDate = (date: Date) => date.toLocaleDateString(); // Using date-fns now

// Mock data using new types
const mockAdminUserProfile: UserProfile = {
    id: 'user-admin', 
    created_at: new Date().toISOString(), 
    updated_at: new Date().toISOString(), 
    first_name: 'Admin', 
    last_name: 'Inviter',
    last_selected_org_id: null, // or provide a value if needed by component
    role: 'user' // default role, adjust if admin logic differs
};

const mockInvite1: PendingInviteWithInviter = {
  id: 'invite-123',
  invite_token: 'token123',
  organization_id: 'org-abc',
  invited_email: 'test1@example.com',
  role_to_assign: 'member',
  invited_by_user_id: 'user-admin',
  status: 'pending',
  created_at: new Date('2023-10-26T10:00:00Z').toISOString(),
  expires_at: null,
  invited_user_id: null, 
  // Use the full profile mock
  invited_by_profile: mockAdminUserProfile,
};

const mockInvite2: PendingInviteWithInviter = {
  id: 'invite-456',
  invite_token: 'token456',
  organization_id: 'org-abc',
  invited_email: 'test2@example.com',
  role_to_assign: 'admin',
  invited_by_user_id: 'user-admin2',
  status: 'pending',
  created_at: new Date('2023-10-27T11:00:00Z').toISOString(),
  expires_at: null,
  invited_user_id: null, 
  invited_by_profile: null, // Keep null case
};

const mockRequest1: PendingRequestWithDetails = {
  id: 'req-789',
  user_id: 'user-req1',
  organization_id: 'org-abc',
  role: 'member', 
  status: 'pending_approval', 
  created_at: new Date('2023-10-28T12:00:00Z').toISOString(),
  // Nest profile details correctly
  user_profiles: {
      id: 'user-req1',
      first_name: 'Pending',
      last_name: 'User1',
      // Add other required UserProfile fields with dummy data if needed by type
      created_at: new Date().toISOString(), 
      updated_at: new Date().toISOString(), 
      last_selected_org_id: null,
      role: 'user'
  },
  user_email: 'pending1@example.com',
};

// UserProfile type might still be needed if used elsewhere in mocks, keep import if so
// const mockUserProfile: UserProfile = { ... };

describe('PendingActionsCard', () => {
  const mockCancelInvite = vi.fn();
  const mockApproveRequest = vi.fn();
  const mockDenyRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock state
    (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentPendingInvites: [],
      currentPendingRequests: [],
      isLoading: false,
      cancelInvite: mockCancelInvite,
      approveRequest: mockApproveRequest,
      denyRequest: mockDenyRequest,
      fetchCurrentOrganizationMembers: vi.fn(), // Add mock fetch
    });
  });

  it('renders loading state for invites and requests', () => {
    (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentPendingInvites: [],
      currentPendingRequests: [],
      isLoading: true,
      cancelInvite: mockCancelInvite,
      approveRequest: mockApproveRequest,
      denyRequest: mockDenyRequest,
      fetchCurrentOrganizationMembers: vi.fn(), // Ensure fetch is mocked here too
    });
    render(<PendingActionsCard />);
    // Check for skeleton presence instead of text if component uses skeletons for loading
    // const skeletons = screen.queryAllByTestId('skeleton'); 
    // expect(skeletons.length).toBeGreaterThan(0);
    // OR check for text if it uses text
    expect(screen.getByText('Loading requests...')).toBeInTheDocument();
    expect(screen.getByText('Loading invites...')).toBeInTheDocument();
  });

  it('renders empty state when no pending items exist', () => {
    render(<PendingActionsCard />);
    expect(screen.getByText('No pending join requests.')).toBeInTheDocument();
    expect(screen.getByText('No pending invites.')).toBeInTheDocument();
  });

  it('renders pending invites correctly', () => {
    (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentPendingInvites: [mockInvite1, mockInvite2],
      currentPendingRequests: [],
      isLoading: false,
      cancelInvite: mockCancelInvite,
      approveRequest: mockApproveRequest,
      denyRequest: mockDenyRequest,
      fetchCurrentOrganizationMembers: vi.fn(),
    });
    render(<PendingActionsCard />);

    // Find row for invite 1 and assert within it
    const row1 = screen.getByText(mockInvite1.invited_email).closest('tr');
    expect(row1).not.toBeNull();
    if (row1) {
      expect(within(row1).getByText(mockInvite1.role_to_assign)).toBeInTheDocument();
      // Construct expected inviter name from profile
      const inviter1Name = `${mockInvite1.invited_by_profile!.first_name} ${mockInvite1.invited_by_profile!.last_name}`;
      expect(within(row1).getByText(inviter1Name)).toBeInTheDocument(); 
      expect(within(row1).getByText(formatDistanceToNow(new Date(mockInvite1.created_at), { addSuffix: true }))).toBeInTheDocument();
      expect(within(row1).getByRole('button', { name: "Cancel" })).toBeInTheDocument();
    }
    
    // Find row for invite 2 and assert within it
    const row2 = screen.getByText(mockInvite2.invited_email).closest('tr');
    expect(row2).not.toBeNull();
    if (row2) {
      expect(within(row2).getByText(mockInvite2.role_to_assign)).toBeInTheDocument();
      expect(within(row2).getByText('Unknown')).toBeInTheDocument(); // Inviter fallback (profile is null)
      expect(within(row2).getByText(formatDistanceToNow(new Date(mockInvite2.created_at), { addSuffix: true }))).toBeInTheDocument();
      expect(within(row2).getByRole('button', { name: "Cancel" })).toBeInTheDocument();
    }
  });

  it('renders pending requests correctly', () => {
    (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentPendingInvites: [],
      currentPendingRequests: [mockRequest1],
      isLoading: false,
       cancelInvite: mockCancelInvite,
       approveRequest: mockApproveRequest,
       denyRequest: mockDenyRequest,
       fetchCurrentOrganizationMembers: vi.fn(),
    });
     render(<PendingActionsCard />);
     
     // Find the row based on email (use non-null assertion for mock data)
     const requestRow = screen.getByText(mockRequest1.user_email!).closest('tr');
     expect(requestRow).not.toBeNull();

     if (requestRow) {
       // Check for first and last name within the row (use non-null assertions for mock data)
       // Combine first and last name for the assertion
       const fullName = `${mockRequest1.user_profiles!.first_name!} ${mockRequest1.user_profiles!.last_name!}`;
       expect(within(requestRow).getByText(fullName)).toBeInTheDocument();
       // Check email is also there 
       expect(within(requestRow).getByText(mockRequest1.user_email!)).toBeInTheDocument(); 
       // Check relative date
       expect(within(requestRow).getByText(formatDistanceToNow(new Date(mockRequest1.created_at), { addSuffix: true }))).toBeInTheDocument();
       // Check buttons
       expect(within(requestRow).getByRole('button', { name: /approve/i })).toBeInTheDocument();
       expect(within(requestRow).getByRole('button', { name: /deny/i })).toBeInTheDocument();
     }
  });

  it('calls cancelInvite with correct ID when cancel button is clicked', async () => {
    mockCancelInvite.mockResolvedValue(true); 
    (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentPendingInvites: [mockInvite1],
      currentPendingRequests: [],
      isLoading: false,
      cancelInvite: mockCancelInvite,
      approveRequest: mockApproveRequest,
      denyRequest: mockDenyRequest,
      fetchCurrentOrganizationMembers: vi.fn(), // Mock fetch
    });

    render(<PendingActionsCard />);
    
    // Find the specific cancel button within the row for mockInvite1
    const row1 = screen.getByText(mockInvite1.invited_email).closest('tr');
    expect(row1).not.toBeNull();
    const cancelButton = within(row1!).getByRole('button', { name: "Cancel" }); 
    fireEvent.click(cancelButton);

    // Check that the store action was called
    expect(mockCancelInvite).toHaveBeenCalledTimes(1);
    expect(mockCancelInvite).toHaveBeenCalledWith(mockInvite1.id);
  });

   it('calls approveRequest with correct ID when approve button is clicked', () => {
     mockApproveRequest.mockResolvedValue(true); 
     (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
       currentPendingInvites: [],
       currentPendingRequests: [mockRequest1],
       isLoading: false,
       cancelInvite: mockCancelInvite,
       approveRequest: mockApproveRequest,
       denyRequest: mockDenyRequest,
       fetchCurrentOrganizationMembers: vi.fn(), // Mock fetch
     });

     render(<PendingActionsCard />);
     // Find button within the specific request row
     const requestRow = screen.getByText(mockRequest1.user_email!).closest('tr');
     expect(requestRow).not.toBeNull();
     const approveButton = within(requestRow!).getByRole('button', { name: /approve/i });
     fireEvent.click(approveButton);

     expect(mockApproveRequest).toHaveBeenCalledTimes(1);
     expect(mockApproveRequest).toHaveBeenCalledWith(mockRequest1.id);
   });

   it('calls denyRequest with correct ID when deny button is clicked', () => {
     mockDenyRequest.mockResolvedValue(true); 
     (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
       currentPendingInvites: [],
       currentPendingRequests: [mockRequest1],
       isLoading: false,
       cancelInvite: mockCancelInvite,
       approveRequest: mockApproveRequest,
       denyRequest: mockDenyRequest,
       fetchCurrentOrganizationMembers: vi.fn(), // Mock fetch
     });

     render(<PendingActionsCard />);
     // Find button within the specific request row
     const requestRow = screen.getByText(mockRequest1.user_email!).closest('tr');
     expect(requestRow).not.toBeNull();
     const denyButton = within(requestRow!).getByRole('button', { name: /deny/i });
     fireEvent.click(denyButton);

     expect(mockDenyRequest).toHaveBeenCalledTimes(1);
     expect(mockDenyRequest).toHaveBeenCalledWith(mockRequest1.id);
   });

   it('calls fetchCurrentOrganizationMembers when refresh button is clicked', () => {
      const mockFetchMembers = vi.fn();
      (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        currentPendingInvites: [],
        currentPendingRequests: [],
        isLoading: false,
        cancelInvite: mockCancelInvite,
        approveRequest: mockApproveRequest,
        denyRequest: mockDenyRequest,
        fetchCurrentOrganizationMembers: mockFetchMembers, 
      });

      render(<PendingActionsCard />);
      const refreshButton = screen.getByRole('button', { name: /refresh pending actions/i });
      fireEvent.click(refreshButton);

      expect(mockFetchMembers).toHaveBeenCalledTimes(1);
   });

   // TODO: Add tests for error handling if needed (e.g., displaying error messages)
}); 