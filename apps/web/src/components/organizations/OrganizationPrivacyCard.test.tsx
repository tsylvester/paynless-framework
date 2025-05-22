import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// Import the selector we intend to mock ITS BEHAVIOR FOR, not its implementation
import { selectCurrentUserRoleInOrg as actualSelectCurrentUserRoleInOrg } from '@paynless/store';
import { OrganizationPrivacyCard } from '@/components/organizations/OrganizationPrivacyCard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OrganizationMemberWithProfile, UserProfile, Organization } from '@paynless/types';
import type { Mock } from 'vitest';
import { act } from '@testing-library/react'; // Keep act for specific cases if needed
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

// PointerEvent stubs for Radix UI components in JSDOM
beforeAll(() => {
  if (!window.Element.prototype.setPointerCapture) { window.Element.prototype.setPointerCapture = vi.fn(); }
  if (!window.Element.prototype.hasPointerCapture) { window.Element.prototype.hasPointerCapture = vi.fn(() => false); }
  if (!window.Element.prototype.releasePointerCapture) { window.Element.prototype.releasePointerCapture = vi.fn(); }
});

// Import mock helpers from the central mock file
import {
    resetAllStoreMocks,
    mockSetAuthUser,
    mockSetCurrentOrgId,
    mockSetCurrentOrganizationDetails,
    mockSetCurrentOrganizationMembers,
    mockSetOrgIsLoading,
    getInternalUpdateOrganizationSpy, // Assuming this exists or we create it
    getInternalOpenDeleteDialogSpy,   // Assuming this exists or we create it
} from '../../mocks/organizationStore.mock'; // Adjust path as needed

// Mock the toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @paynless/store for its main exports used by the component
vi.mock('@paynless/store', async () => {
  const mockImpl = await import('../../mocks/organizationStore.mock');
  const mockSelectCurrentUserRoleInOrgFn = vi.fn();
  return {
    __esModule: true,
    useOrganizationStore: vi.fn(mockImpl.mockedUseOrganizationStoreHookLogic),
    useAuthStore: vi.fn(mockImpl.mockedUseAuthStoreHookLogic),
    selectCurrentUserRoleInOrg: mockSelectCurrentUserRoleInOrgFn,
    // Export other items if OrganizationSettingsCard imports them directly from @paynless/store
  };
});

// Helper to wrap component in QueryClientProvider if needed
const queryClient = new QueryClient();
const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
};

// Define baseline test data (can be outside describe)
const testOrgId = 'org-123';
const adminUserProfile: UserProfile = {
    id: 'user-admin', first_name: 'Admin', last_name: 'User', role: 'admin', 
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    last_selected_org_id: testOrgId,
    chat_context: { last_chat_id: null, last_model_used: null },
    profile_privacy_setting: 'private',
};
const adminUser = { id: 'user-admin', email: 'admin@example.com', role: 'admin' as const };

const memberUserProfile: UserProfile = {
    id: 'user-member', first_name: 'Member', last_name: 'User', role: 'user', 
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    last_selected_org_id: testOrgId,
    chat_context: { last_chat_id: null, last_model_used: null },
    profile_privacy_setting: 'private',
};
const memberUser = { id: 'user-member', email: 'member@example.com', role: 'user' as const };

const baselineOrgDetails: Organization = {
    id: testOrgId,
    name: 'Test Org',
    visibility: 'private',
    created_at: new Date().toISOString(),
    deleted_at: null,
    allow_member_chat_creation: true,
    token_usage_policy: 'member_tokens',
};

const baselineOrgMembers: OrganizationMemberWithProfile[] = [
    { 
        id: 'mem-admin-1', user_id: adminUser.id, organization_id: testOrgId, role: 'admin', status: 'active', 
        created_at: new Date().toISOString(), user_profiles: adminUserProfile 
    },
];

describe('OrganizationPrivacyCard', () => {
  let updateOrganizationSpy: Mock;
  let openDeleteDialogSpy: Mock;

  beforeEach(() => {
    resetAllStoreMocks(); // Reset the underlying state in the mock store logic
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(actualSelectCurrentUserRoleInOrg).mockReset();
    Element.prototype.scrollIntoView = vi.fn(); // Mock scrollIntoView

    // Get spies from the mock module (ensure these are exported from organizationStore.mock.ts)
    updateOrganizationSpy = getInternalUpdateOrganizationSpy();
    openDeleteDialogSpy = getInternalOpenDeleteDialogSpy();
    updateOrganizationSpy.mockResolvedValue(undefined); // Default success for update
  });

  const setupAdminUser = () => {
    mockSetAuthUser(adminUser);
    vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('admin');
  };

  const setupMemberUser = () => {
    mockSetAuthUser(memberUser);
    vi.mocked(actualSelectCurrentUserRoleInOrg).mockReturnValue('member');
  };

  const setupOrgDetails = (details: Organization | null = baselineOrgDetails, members: OrganizationMemberWithProfile[] = baselineOrgMembers) => {
    mockSetCurrentOrgId(details ? details.id : null);
    mockSetCurrentOrganizationDetails(details);
    mockSetCurrentOrganizationMembers(members);
  };

  it('should render the settings card for an admin user with org details', async () => {
    setupAdminUser();
    setupOrgDetails();

    renderWithProvider(<OrganizationPrivacyCard />);

    expect(await screen.findByText(/Organization Privacy/i, { selector: '[data-slot="card-title"]' })).toBeInTheDocument();
    expect(screen.getByText(/Admin/i)).toBeInTheDocument(); // Admin badge
    expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Visibility/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Update$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument();
  });

  it('should NOT render the settings card if organization details are null', () => {
    setupAdminUser();
    setupOrgDetails(null); // No org details

    renderWithProvider(<OrganizationPrivacyCard />);
    expect(screen.queryByText(/Organization Settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Organization Privacy/i)).not.toBeInTheDocument(); // Also check for the new title
  });

  it('should NOT render the settings card for a non-admin user', () => {
    setupMemberUser();
    setupOrgDetails();

    renderWithProvider(<OrganizationPrivacyCard />);
    expect(screen.queryByText(/Organization Settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Organization Privacy/i)).not.toBeInTheDocument(); // Also check for the new title
  });

  it('should display the current organization name and visibility in the form', async () => {
    setupAdminUser();
    setupOrgDetails(baselineOrgDetails); 

    renderWithProvider(<OrganizationPrivacyCard />);
    expect(await screen.findByLabelText<HTMLInputElement>(/Organization Name/i)).toHaveValue(baselineOrgDetails.name);
    expect(screen.getByRole('combobox', { name: /Visibility/i })).toHaveTextContent(new RegExp(baselineOrgDetails.visibility, 'i'));
  });

  it('should show validation error if name is empty on submit', async () => {
    setupAdminUser();
    setupOrgDetails();
    renderWithProvider(<OrganizationPrivacyCard />);
    
    const nameInput = await screen.findByLabelText(/Organization Name/i);
    const submitButton = screen.getByRole('button', { name: /^Update$/i });

    await userEvent.clear(nameInput);
    await userEvent.click(submitButton);

    expect(await screen.findByText(/Organization name must be at least 3 characters/i)).toBeInTheDocument();
    expect(updateOrganizationSpy).not.toHaveBeenCalled();
  });

  it('should call updateOrganization with correct data and show success toast on successful submit', async () => {
    setupAdminUser();
    setupOrgDetails();
    renderWithProvider(<OrganizationPrivacyCard />);

    const updatedName = 'Updated Org Name';
    const updatedVisibility = 'public';

    const nameInput = await screen.findByLabelText(/Organization Name/i);
    const visibilityTrigger = screen.getByRole('combobox', { name: /Visibility/i });
    const submitButton = screen.getByRole('button', { name: /^Update$/i });

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, updatedName);
    
    await userEvent.click(visibilityTrigger);
    const publicOption = await screen.findByRole('option', { name: /Public/i });
    await userEvent.click(publicOption);
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(updateOrganizationSpy).toHaveBeenCalledTimes(1);
      expect(updateOrganizationSpy).toHaveBeenCalledWith(testOrgId, {
        name: updatedName,
        visibility: updatedVisibility,
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Organization privacy settings updated successfully!');
    });
  });

  it('should show error toast if updateOrganization fails', async () => {
    setupAdminUser();
    setupOrgDetails();
    const errorMsg = 'API Error: Update failed';
    updateOrganizationSpy.mockRejectedValueOnce(new Error(errorMsg));

    renderWithProvider(<OrganizationPrivacyCard />);
    const nameInput = await screen.findByLabelText(/Organization Name/i);
    await userEvent.type(nameInput, 'Any valid name'); // Ensure form is valid before submit
    const submitButton = screen.getByRole('button', { name: /^Update$/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Failed to update privacy settings: ${errorMsg}`);
    });
  });

  it('should call openDeleteDialog when delete button is clicked', async () => {
    setupAdminUser();
    setupOrgDetails();
    renderWithProvider(<OrganizationPrivacyCard />);

    const deleteButton = await screen.findByRole('button', { name: /^Delete$/i });
    await userEvent.click(deleteButton);

    expect(openDeleteDialogSpy).toHaveBeenCalledTimes(1);
  });

  it('should disable form fields and buttons when isLoading is true', async () => {
    setupAdminUser();
    setupOrgDetails();
    mockSetOrgIsLoading(true); // Set loading state

    renderWithProvider(<OrganizationPrivacyCard />);

    expect(await screen.findByLabelText(/Organization Name/i)).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Visibility/i })).toBeDisabled(); // Shadcn select might not directly support :disabled on trigger, check underlying input or visual state
    // For Radix/Shadcn Select, the trigger itself gets `data-disabled` and `aria-disabled`
    expect(screen.getByRole('combobox', { name: /Visibility/i })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('button', { name: /^Update$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeDisabled();
  });
}); 