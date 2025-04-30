import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PendingActionsCard } from '@/components/organizations/PendingActionsCard';
import { useOrganizationStore } from '@paynless/store';
import { Invite, MembershipRequest, UserProfile } from '@paynless/types';

// Mock the Zustand store
vi.mock('@paynless/store', () => ({
  useOrganizationStore: vi.fn(),
}));

// Helper to create mock date string easily
const formatDate = (date: Date) => date.toLocaleDateString();

// Mock data
const mockInvite1: Invite = {
  id: 'invite-123',
  invite_token: 'token123',
  organization_id: 'org-abc',
  invited_email: 'test1@example.com',
  role_to_assign: 'member',
  invited_by_user_id: 'user-admin',
  status: 'pending',
  created_at: new Date('2023-10-26T10:00:00Z').toISOString(),
  expires_at: null,
};

const mockInvite2: Invite = {
  id: 'invite-456',
  invite_token: 'token456',
  organization_id: 'org-abc',
  invited_email: 'test2@example.com',
  role_to_assign: 'admin',
  invited_by_user_id: 'user-admin',
  status: 'pending',
  created_at: new Date('2023-10-27T11:00:00Z').toISOString(),
  expires_at: null,
};

const mockRequest1: MembershipRequest = {
  id: 'req-789',
  user_id: 'user-req1',
  organization_id: 'org-abc',
  role: 'member', // Role requested often defaults or isn't set until approval
  status: 'pending',
  created_at: new Date('2023-10-28T12:00:00Z').toISOString(),
  user_profiles: { // Assuming a nested profile structure
    user_id: 'user-req1',
    first_name: 'Pending',
    last_name: 'User1',
    full_name: 'Pending User1', // Add full_name if used
    email: 'pending1@example.com', // Add email if available/needed
    avatar_url: null,
    billing_address: null,
    payment_method: null,
    updated_at: new Date().toISOString(),
  } as UserProfile,
};

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
    });
    render(<PendingActionsCard />);
    expect(screen.getByText(mockInvite1.invited_email)).toBeInTheDocument();
    expect(screen.getByText(mockInvite1.role_to_assign)).toBeInTheDocument();
    expect(screen.getByText(formatDate(new Date(mockInvite1.created_at)))).toBeInTheDocument();
    
    expect(screen.getByText(mockInvite2.invited_email)).toBeInTheDocument();
    expect(screen.getByText(mockInvite2.role_to_assign)).toBeInTheDocument();
    expect(screen.getByText(formatDate(new Date(mockInvite2.created_at)))).toBeInTheDocument();

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
    });
     render(<PendingActionsCard />);
     // Use full_name from mock data
     expect(screen.getByText(mockRequest1.user_profiles!.full_name!)).toBeInTheDocument(); 
     expect(screen.getByText(formatDate(new Date(mockRequest1.created_at)))).toBeInTheDocument();
     
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