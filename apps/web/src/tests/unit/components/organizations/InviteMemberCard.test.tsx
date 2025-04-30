import React from 'react';
import { render, screen, fireEvent, act, within, waitFor } from '@/tests/utils'; 
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InviteMemberCard } from '@/components/organizations/InviteMemberCard';
import { useOrganizationStore } from '@paynless/store';
import { useCurrentUser } from '../../../../hooks/useCurrentUser';
import { UserProfile } from '@paynless/types'; 
import { toast } from 'sonner';

// --- PREPARE MOCKS ---
const mockInviteUser = vi.fn();

// Mock the stores
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useOrganizationStore: vi.fn(() => ({ // Default mock return
        inviteUser: mockInviteUser,
        isLoading: false,
        currentOrganizationId: 'org-test-123',
        selectCurrentUserRoleInOrg: () => 'admin', // Default to admin for visibility
    })),
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

// Mock useCurrentUser (needed for role check, though store provides selector)
const mockUseCurrentUserFn = vi.fn();
vi.mock('../../../../hooks/useCurrentUser', () => ({
  useCurrentUser: mockUseCurrentUserFn,
}));

// --- Mock Data & Setup ---
const adminProfile: UserProfile = { id: 'user-admin', first_name: 'Admin', last_name: 'User', role: 'admin', created_at: '', updated_at: '' };
const memberProfile: UserProfile = { id: 'user-member', first_name: 'Member', last_name: 'User', role: 'user', created_at: '', updated_at: '' };


// Helper to set up mock return values
const setupMocks = (role: 'admin' | 'member' | null, isLoading = false, orgId: string | null = 'org-test-123') => {
    vi.mocked(useOrganizationStore).mockReturnValue({
        inviteUser: mockInviteUser,
        isLoading: isLoading,
        currentOrganizationId: orgId,
        selectCurrentUserRoleInOrg: () => role,
    });

    // Mock useCurrentUser minimal return
    mockUseCurrentUserFn.mockReturnValue({
        user: role === 'admin' ? adminProfile : memberProfile,
        isLoading: false,
    });
};


describe('InviteMemberCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupMocks('admin'); // Default to admin view
    });

    it('should render correctly for an admin', () => {
        render(<InviteMemberCard />);
        expect(screen.getByText(/invite new member/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send invite/i })).toBeInTheDocument();
    });

    it('should NOT render for a non-admin member', () => {
        setupMocks('member');
        const { container } = render(<InviteMemberCard />);
        // Expect the component to render nothing or a placeholder if role check is internal
        // For now, assuming it renders null or similar based on common patterns
        // If it has internal logic to hide, check for absence of key elements
        expect(screen.queryByText(/invite new member/i)).not.toBeInTheDocument();
        // A more robust check might be needed depending on implementation (e.g., expect(container.firstChild).toBeNull())
    });
    
    it('should NOT render if currentOrganizationId is null', () => {
        setupMocks('admin', false, null); // Admin, but no org selected
        render(<InviteMemberCard />);
        expect(screen.queryByText(/invite new member/i)).not.toBeInTheDocument();
    });

    it('should require email input', async () => {
        render(<InviteMemberCard />);
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        
        // Try submitting without email
        fireEvent.click(submitButton);
        
        // Check for browser validation or react-hook-form error (when implemented)
        await waitFor(() => {
           // TODO: Assert validation error is shown for email (requires RHF/Zod)
           // Example: expect(screen.getByText(/email is required/i)).toBeInTheDocument();
           // For now, check that inviteUser was NOT called
           expect(mockInviteUser).not.toHaveBeenCalled();
           // Also check built-in validation attribute if present (may vary)
           expect(emailInput).toBeInvalid(); 
        });
    });
    
    it('should validate email format', async () => {
        render(<InviteMemberCard />);
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        
        fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
        fireEvent.click(submitButton);
        
        await waitFor(() => {
           // TODO: Assert validation error is shown for email format (requires RHF/Zod)
           // Example: expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
           expect(mockInviteUser).not.toHaveBeenCalled();
           expect(emailInput).toBeInvalid();
        });
    });

    it('should successfully call inviteUser with email and default role (member) on valid submission', async () => {
        render(<InviteMemberCard />);
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        // Assuming Select defaults to 'member'
        
        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        
        await act(async () => {
          fireEvent.click(submitButton);
        });

        expect(mockInviteUser).toHaveBeenCalledTimes(1);
        expect(mockInviteUser).toHaveBeenCalledWith('test@example.com', 'member'); 
        // TODO: Add assertion for success toast when implemented
        // expect(toast.success).toHaveBeenCalled();
    });

    it('should successfully call inviteUser with email and selected role (admin) on valid submission', async () => {
       render(<InviteMemberCard />);
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        const roleSelectTrigger = screen.getByRole('combobox', { name: /role/i }); // Find by accessible name via Label
        
        fireEvent.change(emailInput, { target: { value: 'admin@example.com' } });
        
        // Open select and choose 'admin'
        fireEvent.mouseDown(roleSelectTrigger); // Open the dropdown
        const adminOption = await screen.findByRole('option', { name: 'Admin' });
        fireEvent.click(adminOption);

        await act(async () => {
          fireEvent.click(submitButton);
        });

        expect(mockInviteUser).toHaveBeenCalledTimes(1);
        expect(mockInviteUser).toHaveBeenCalledWith('admin@example.com', 'admin');
         // TODO: Add assertion for success toast when implemented
    });

    it('should disable submit button while loading', () => {
        setupMocks('admin', true); // Set loading to true
        render(<InviteMemberCard />);
        expect(screen.getByRole('button', { name: /send invite/i })).toBeDisabled();
    });

    it('should display API error feedback (e.g., toast) if inviteUser fails', async () => {
        const apiError = new Error('User already exists');
        mockInviteUser.mockRejectedValue(apiError); // Simulate API failure

        render(<InviteMemberCard />);
        const submitButton = screen.getByRole('button', { name: /send invite/i });
        const emailInput = screen.getByLabelText(/email/i);
        
        fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
        
        await act(async () => {
          fireEvent.click(submitButton);
        });

        expect(mockInviteUser).toHaveBeenCalledTimes(1);
        expect(mockInviteUser).toHaveBeenCalledWith('existing@example.com', 'member');
        // TODO: Assert error toast is shown (requires toast implementation in component)
        // await waitFor(() => {
        //    expect(toast.error).toHaveBeenCalledWith(apiError.message);
        // });
    });
}); 