import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PendingActionsCard } from '@/components/organizations/PendingActionsCard';
import { useOrganizationStore } from '@paynless/store';
import { 
    PendingInviteWithInviter, 
    PendingRequestWithDetails
    // UserProfile // Keep UserProfile if needed for mocks below
} from '@paynless/types';
import { formatDistanceToNow } from 'date-fns'; // Keep this for date checks

// Mock the Zustand store
vi.mock('@paynless/store', () => ({
  useOrganizationStore: vi.fn(),
}));

// Helper to create mock date string easily
// REMOVE: const formatDate = (date: Date) => date.toLocaleDateString(); // Using date-fns now

// Mock data using new types
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
  invited_user_id: null, // Assuming null for this mock
  // Add the required profile field
  invited_by_profile: { 
      first_name: 'Admin', 
      last_name: 'Inviter' 
  },
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
  invited_user_id: null, // Assuming null for this mock
   // Add the required profile field (can be null)
  invited_by_profile: null, 
};

const mockRequest1: PendingRequestWithDetails = {
  id: 'req-789',
  user_id: 'user-req1',
  organization_id: 'org-abc',
  role: 'member', // Role requested
  status: 'pending_approval', // Use correct status from VIEW
  created_at: new Date('2023-10-28T12:00:00Z').toISOString(),
  // Directly add profile fields and email from the VIEW type
  first_name: 'Pending',
  last_name: 'User1',
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
    });
    render(<PendingActionsCard />);
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
    expect(screen.getByText(mockInvite1.invited_email)).toBeInTheDocument();
    expect(screen.getByText(mockInvite1.role_to_assign)).toBeInTheDocument();
    // Check for inviter name
    expect(screen.getByText('Admin Inviter')).toBeInTheDocument(); 
    // Check date format using date-fns (relative)
    expect(screen.getByText(formatDistanceToNow(new Date(mockInvite1.created_at), { addSuffix: true }))).toBeInTheDocument();
    
    expect(screen.getByText(mockInvite2.invited_email)).toBeInTheDocument();
    expect(screen.getByText(mockInvite2.role_to_assign)).toBeInTheDocument();
    // Check for fallback inviter name
    expect(screen.getByText('Unknown')).toBeInTheDocument(); 
    expect(screen.getByText(formatDistanceToNow(new Date(mockInvite2.created_at), { addSuffix: true }))).toBeInTheDocument();

    // Check for cancel buttons with the updated text
    const cancelButtons = screen.getAllByRole('button', { name: "Cancel" });
    expect(cancelButtons).toHaveLength(2);
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
     // Check for display name and email
     expect(screen.getByText('Pending User1')).toBeInTheDocument(); 
     expect(screen.getByText('pending1@example.com')).toBeInTheDocument(); 
     expect(screen.getByText(formatDistanceToNow(new Date(mockRequest1.created_at), { addSuffix: true }))).toBeInTheDocument();
     
     expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
     expect(screen.getByRole('button', { name: /deny/i })).toBeInTheDocument();
  });

  it('calls cancelInvite with correct ID when cancel button is clicked', async () => {
    mockCancelInvite.mockResolvedValue(true); // Simulate successful cancellation
    (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentPendingInvites: [mockInvite1],
      currentPendingRequests: [],
      isLoading: false,
      cancelInvite: mockCancelInvite,
      approveRequest: mockApproveRequest,
      denyRequest: mockDenyRequest,
    });

    render(<PendingActionsCard />);
    // Find button by exact text "Cancel"
    const cancelButton = screen.getByRole('button', { name: "Cancel" }); 
    fireEvent.click(cancelButton);

    // Check that the store action was called
    expect(mockCancelInvite).toHaveBeenCalledTimes(1);
    expect(mockCancelInvite).toHaveBeenCalledWith(mockInvite1.id);
  });

   it('calls approveRequest with correct ID when approve button is clicked', () => {
     mockApproveRequest.mockResolvedValue(true); // Simulate success
     (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
       currentPendingInvites: [],
       currentPendingRequests: [mockRequest1],
       isLoading: false,
       cancelInvite: mockCancelInvite,
       approveRequest: mockApproveRequest,
       denyRequest: mockDenyRequest,
     });

     render(<PendingActionsCard />);
     const approveButton = screen.getByRole('button', { name: /approve/i });
     fireEvent.click(approveButton);

     expect(mockApproveRequest).toHaveBeenCalledTimes(1);
     expect(mockApproveRequest).toHaveBeenCalledWith(mockRequest1.id);
   });

   it('calls denyRequest with correct ID when deny button is clicked', () => {
     mockDenyRequest.mockResolvedValue(true); // Simulate success
     (useOrganizationStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
       currentPendingInvites: [],
       currentPendingRequests: [mockRequest1],
       isLoading: false,
       cancelInvite: mockCancelInvite,
       approveRequest: mockApproveRequest,
       denyRequest: mockDenyRequest,
     });

     render(<PendingActionsCard />);
     const denyButton = screen.getByRole('button', { name: /deny/i });
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
        fetchCurrentOrganizationMembers: mockFetchMembers, // Provide the mock fetch function
      });

      render(<PendingActionsCard />);
      const refreshButton = screen.getByRole('button', { name: /refresh pending actions/i });
      fireEvent.click(refreshButton);

      expect(mockFetchMembers).toHaveBeenCalledTimes(1);
   });

   // TODO: Add tests for error handling if needed (e.g., displaying error messages)
}); 