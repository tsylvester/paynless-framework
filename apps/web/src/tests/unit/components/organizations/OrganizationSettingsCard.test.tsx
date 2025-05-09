import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useOrganizationStore, useAuthStore } from '@paynless/store';
import { OrganizationSettingsCard } from '@/components/organizations/OrganizationSettingsCard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OrganizationMemberWithProfile, UserProfile } from '@paynless/types'; // Removed unused OrganizationState
import type { Mock } from 'vitest';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

// Mock the toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the DeleteOrganizationDialog hook/component if it's directly imported/used
// vi.mock('./DeleteOrganizationDialog', () => ({
//   useDeleteOrganizationDialog: () => ({
//     openDeleteDialog: vi.fn(), // Example mock function
//   }),
// }));

// Helper to wrap component in QueryClientProvider if needed
const queryClient = new QueryClient();
const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
};

describe('OrganizationSettingsCard', () => {
  let mockUpdateOrganization: Mock;
  let mockSelectCurrentUserRoleInOrg: Mock;
  let mockOpenDeleteDialog: Mock; // Added mock for openDeleteDialog
  // let mockSoftDeleteOrganization: Mock;

  // Define baseline state for the organization store
  const baselineOrgState = {
    currentOrganizationId: 'org-123',
    currentOrganizationDetails: {
      id: 'org-123',
      name: 'Test Org',
      visibility: 'private' as 'private' | 'public',
      created_at: new Date().toISOString(),
      deleted_at: null,
    },
    currentOrganizationMembers: [
      {
        id: 'mem-1', user_id: 'user-admin', organization_id: 'org-123', role: 'admin', status: 'active', created_at: new Date().toISOString(),
        user_profiles: { id: 'user-admin', first_name: 'Admin', last_name: 'User', role: 'admin', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      },
      {
        id: 'mem-2', user_id: 'user-member', organization_id: 'org-123', role: 'member', status: 'active', created_at: new Date().toISOString(),
        user_profiles: { id: 'user-member', first_name: 'Member', last_name: 'User', role: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      },
    ] as OrganizationMemberWithProfile[],
    isLoading: false,
    error: null,
    // We will inject mocked functions here
  };

  // Define baseline state for the auth store (minimal)
  const baselineAuthState = {
    // Mock user with just ID (use any/ignore if type conflicts)
    user: { id: 'user-admin' },
    // Provide a complete UserProfile mock
    profile: {
      id: 'user-admin',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin' as 'admin' | 'user', // Assert role type
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as UserProfile,
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Mock scrollIntoView for Radix components in JSDOM
    Element.prototype.scrollIntoView = vi.fn();

    mockUpdateOrganization = vi.fn().mockResolvedValue(undefined); // Mock a successful update
    mockSelectCurrentUserRoleInOrg = vi.fn().mockReturnValue('admin'); // Default to admin
    mockOpenDeleteDialog = vi.fn(); // Mock the open dialog action
    // mockSoftDeleteOrganization = vi.fn().mockResolvedValue(undefined);

    // Reset and set ACTUAL store states, injecting mocks
    act(() => {
      useOrganizationStore.setState({
        ...baselineOrgState,
        // Inject mocks for actions/selectors used by the component
        updateOrganization: mockUpdateOrganization,
        selectCurrentUserRoleInOrg: mockSelectCurrentUserRoleInOrg,
        openDeleteDialog: mockOpenDeleteDialog, // Inject the new mock
        // Add other mocked actions/selectors if needed
      }, true); // true replaces the state

      useAuthStore.setState({
        ...baselineAuthState,
        // Set the user ID needed by the selector
        user: { id: 'user-admin' } // Type checked by store definition
      }, true); 
    });
  });

  it('should render the settings card for an admin user', () => {
    // Arrange: beforeEach sets up admin role via selector mock and auth user ID

    // Act
    renderWithProvider(<OrganizationSettingsCard />);

    // Assert
    // Basic synchronous checks for element presence
    // expect(screen.getByRole('heading', { name: /Organization Settings/i })).toBeInTheDocument(); // <<< FAILS - Heading is in the card-title slot, not a direct role
    expect(screen.getByText(/Organization Settings/i, { selector: '[data-slot="card-title"]' })).toBeInTheDocument(); // <<< Use text within the specific slot
    expect(screen.getByText(/Admin/i)).toBeInTheDocument(); // Admin badge is separate
    expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Visibility/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Update$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument();
  });

  it('should NOT render the settings card content for a non-admin user', () => {
    // Arrange: Modify the selector mock and the auth state for this test
    mockSelectCurrentUserRoleInOrg.mockReturnValue('member');
    act(() => {
      // Update auth store user ID
      useAuthStore.setState({ 
        ...useAuthStore.getState(), // Keep existing profile etc.
        user: { id: 'user-member' } // Type checked by store definition
      }); 
    });

    // NOTE: We don't need to call useOrganizationStore.setState again here

    // Act
    renderWithProvider(<OrganizationSettingsCard />);

    // Assert
    expect(screen.queryByRole('heading', { name: /Organization Settings/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Organization Name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Visibility/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Update$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete$/i })).not.toBeInTheDocument();
    // expect(screen.getByText(/You do not have permission to view these settings./i)).toBeInTheDocument();
  });

  // This test DOES need to be async and use waitFor for the value check
  it('should display the current organization name and visibility in the form', async () => {
    // Arrange: beforeEach already sets up details: { name: 'Test Org', visibility: 'private' }

    // Act
    renderWithProvider(<OrganizationSettingsCard />);

    // Assert
    // Wait for the input value to be set by the useEffect hook
    await waitFor(() => {
      const nameInput = screen.getByLabelText<HTMLInputElement>(/Organization Name/i);
      expect(nameInput.value).toBe('Test Org');
    });

    // Check select value ( Shadcn wraps the native select, check the trigger text)
    const visibilityTrigger = screen.getByRole('combobox', { name: /Visibility/i });
    // Check the text content within the trigger
    expect(visibilityTrigger).toHaveTextContent(/private/i); 
    // Alternatively, check the hidden select element if necessary (more brittle)
    // const hiddenSelect = screen.getByRole('listbox', { hidden: true }); // Might need adjustment based on Select implementation
  });

  it('should show validation error if name is empty on submit', async () => {
    // Arrange
    renderWithProvider(<OrganizationSettingsCard />);
    const nameInput = screen.getByLabelText(/Organization Name/i);
    const submitButton = screen.getByRole('button', { name: /^Update$/i });

    // Act: Clear the input and submit
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(submitButton);

    // Assert: Wait for error message using findByText
    await waitFor(() => {
      expect(screen.getByText(/Organization name must be at least 3 characters/i)).toBeInTheDocument();
    });

    // Ensure update function was NOT called
    expect(mockUpdateOrganization).not.toHaveBeenCalled();
  });

  it('should call updateOrganization with correct data and show success toast on successful submit', async () => {
    // Arrange
    const user = userEvent.setup();
    const updatedName = 'Updated Org Name';
    const updatedVisibility = 'public';
    const orgId = baselineOrgState.currentOrganizationId; // Get orgId from baseline

    renderWithProvider(<OrganizationSettingsCard />);

    const nameInput = screen.getByLabelText(/Organization Name/i);
    const visibilityTrigger = screen.getByRole('combobox', { name: /Visibility/i });
    const submitButton = screen.getByRole('button', { name: /^Update$/i });

    // Act: Update fields and submit
    // Use userEvent for text input
    await user.clear(nameInput);
    await user.type(nameInput, updatedName);
    
    // Open the select dropdown using fireEvent to avoid pointer capture issues
    fireEvent.click(visibilityTrigger);
    
    // Select the 'public' option using fireEvent
    const publicOption = await screen.findByRole('option', { name: /Public/i });
    fireEvent.click(publicOption);

    // Submit using userEvent
    await user.click(submitButton);

    // Assert: Check store action and toast
    await waitFor(() => {
      expect(mockUpdateOrganization).toHaveBeenCalledTimes(1);
      expect(mockUpdateOrganization).toHaveBeenCalledWith(orgId, {
        name: updatedName,
        visibility: updatedVisibility,
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Organization settings updated successfully!')
      );
    });
  });

  it('should show error toast if updateOrganization fails', async () => {
    // Arrange
    const user = userEvent.setup();
    const errorMsg = 'API Error: Update failed';
    mockUpdateOrganization.mockRejectedValue(new Error(errorMsg)); // Simulate API error

    renderWithProvider(<OrganizationSettingsCard />);

    const nameInput = screen.getByLabelText(/Organization Name/i);
    const submitButton = screen.getByRole('button', { name: /^Update$/i });

    // Act: Change name slightly and submit
    await user.type(nameInput, ' Updated'); // Use userEvent for consistency
    await user.click(submitButton);

    // Assert: Check store action was called and error toast is shown
    await waitFor(() => {
      expect(mockUpdateOrganization).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to update settings: ${errorMsg}`)
      );
    });
  });

  it('should disable buttons and show loading text during submission', async () => {
    // Arrange
    const user = userEvent.setup();
    mockUpdateOrganization.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100))); // Delay resolution

    renderWithProvider(<OrganizationSettingsCard />);

    const nameInput = screen.getByLabelText(/Organization Name/i);
    const submitButton = screen.getByRole('button', { name: /^Update$/i });
    const deleteButton = screen.getByRole('button', { name: /^Delete$/i });
    // const visibilitySelect = screen.getByRole('combobox', { name: /Visibility/i }); // Unused variable

    // Act: Type something valid and click submit
    await user.clear(nameInput);
    await user.type(nameInput, 'Valid New Name');
    user.click(submitButton); // Don't await this, we want to check the immediate state

    // Assert: Buttons disabled, loading text appears (adjust selector as needed)
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(deleteButton).toBeDisabled();
      expect(screen.getByText(/Updating.../i)).toBeInTheDocument(); // Check for loading state text
    });

    // Assert: After promise resolves, buttons are enabled again
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
      expect(deleteButton).toBeEnabled();
      expect(screen.queryByText(/Updating.../i)).not.toBeInTheDocument();
    });
  });

  it('should call openDeleteDialog when delete button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    const orgId = baselineOrgState.currentOrganizationId; // Use ID from baseline
    renderWithProvider(<OrganizationSettingsCard />);
    const deleteButton = screen.getByRole('button', { name: /^Delete$/i });

    // Act
    await user.click(deleteButton);

    // Assert
    await waitFor(() => {
      // Check the mock function fetched *from the store state*
      expect(useOrganizationStore.getState().openDeleteDialog).toHaveBeenCalledTimes(1);
      expect(useOrganizationStore.getState().openDeleteDialog).toHaveBeenCalledWith(orgId);
    });
  });

  // --- Add More Tests Here based on the plan ---

  // Test: Form validation (e.g., empty name)
  // Test: Successful update action
  // Test: Failed update action
  // Test: Update button disabled during loading/submission
  // Test: Delete button triggers dialog (mock the dialog hook/state)
  // Test: Loading state disables form/shows indicator

}); 