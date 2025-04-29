import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom'; // Use MemoryRouter for Link/navigate testing
import { OrganizationSwitcher } from '../../../../components/organizations/OrganizationSwitcher';
import { useOrganizationStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { Organization } from '@paynless/types';

// --- Mocks ---
vi.mock('@paynless/store', () => ({ useOrganizationStore: vi.fn() }));
vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Mock react-router-dom hooks (useNavigate is used directly)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    useNavigate: () => mockNavigate, // Provide the mock navigate function
  };
});

// Mock UI Components & Icons
vi.mock('@/components/ui/button', () => ({ 
    Button: ({ children, onClick, disabled, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
    )
}));
// Mock SimpleDropdown to just render trigger and children immediately for easier testing
vi.mock('@/components/ui/SimpleDropdown', () => ({ 
    SimpleDropdown: ({ trigger, children }: { trigger: React.ReactNode, children: React.ReactNode }) => (
        <div>
            <div data-testid="dropdown-trigger">{trigger}</div>
            <div data-testid="dropdown-content">{children}</div>
        </div>
    )
}));
vi.mock('lucide-react', () => ({
    ChevronsUpDown: () => <span data-testid="icon-chevrons"></span>,
    PlusCircle: () => <span data-testid="icon-plus"></span>,
    Check: () => <span data-testid="icon-check"></span>,
    Building: () => <span data-testid="icon-building"></span>,
}));

// --- Test Suite ---
describe('OrganizationSwitcher Component', () => {
  let mockUseOrganizationStore: Mock;
  let mockFetchUserOrganizations: Mock;
  let mockSetCurrentOrganizationId: Mock;

  const org1: Organization = { id: 'org-1', name: 'Org One', created_at: '2023-01-01', visibility: 'private', deleted_at: null };
  const org2: Organization = { id: 'org-2', name: 'Org Two', created_at: '2023-01-01', visibility: 'private', deleted_at: null };

  // Helper to setup store state
  const setupStore = (overrides = {}) => {
    const defaultState = {
      userOrganizations: [org1, org2],
      currentOrganizationId: null,
      isLoading: false,
      fetchUserOrganizations: mockFetchUserOrganizations,
      setCurrentOrganizationId: mockSetCurrentOrganizationId,
      // Add other necessary state fields if component uses them
      ...overrides,
    };
    mockUseOrganizationStore.mockReturnValue(defaultState);
    return defaultState;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUserOrganizations = vi.fn();
    mockSetCurrentOrganizationId = vi.fn();
    mockUseOrganizationStore = useOrganizationStore as Mock;
    setupStore(); // Setup default store
  });

  // Helper to render with Router context
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  // --- Test Cases Will Go Here ---
  it('renders loading state initially', () => {
    setupStore({ isLoading: true, userOrganizations: [] });
    renderWithRouter(<OrganizationSwitcher />);
    // Target by combobox role
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeDisabled();
    // Find text within the disabled combobox
    expect(within(combobox).getByText('Loading...')).toBeInTheDocument();
  });

  it('calls fetchUserOrganizations on mount if organizations are not loaded', () => {
    setupStore({ userOrganizations: [], isLoading: false });
    renderWithRouter(<OrganizationSwitcher />);
    expect(mockFetchUserOrganizations).toHaveBeenCalledTimes(1);
  });

  it('displays "Select Organization" when no org is selected', () => {
    setupStore({ currentOrganizationId: null });
    renderWithRouter(<OrganizationSwitcher />);
    // Target by combobox role
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveTextContent(/Select Organization/i);
  });

  it('displays the current organization name when selected', () => {
    setupStore({ currentOrganizationId: org1.id });
    renderWithRouter(<OrganizationSwitcher />);
    // Target trigger by combobox role
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveTextContent(new RegExp(org1.name, 'i'));
  });

  it('renders the list of organizations in the dropdown', () => {
    renderWithRouter(<OrganizationSwitcher />);
    // Our mock SimpleDropdown renders content immediately
    expect(screen.getByTestId('dropdown-content')).toBeInTheDocument();
    // These are the buttons *inside* the dropdown, so role="button" is correct here
    expect(screen.getByRole('button', { name: new RegExp(org1.name, 'i') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(org2.name, 'i') })).toBeInTheDocument();
  });

  it('shows a checkmark next to the selected organization', () => {
    setupStore({ currentOrganizationId: org1.id });
    renderWithRouter(<OrganizationSwitcher />);
    // These are the buttons *inside* the dropdown
    const org1Button = screen.getByRole('button', { name: new RegExp(org1.name, 'i') });
    // Check within the button/parent element for the checkmark icon
    // Adjust based on actual DOM structure if needed
    expect(org1Button.querySelector('[data-testid="icon-check"]')).toBeInTheDocument();

    const org2Button = screen.getByRole('button', { name: new RegExp(org2.name, 'i') });
    expect(org2Button.querySelector('[data-testid="icon-check"]')).toBeNull();
  });

  it('calls setCurrentOrganizationId and navigate when a different org is clicked', () => {
    setupStore({ currentOrganizationId: org1.id }); // Start with org1 selected
    renderWithRouter(<OrganizationSwitcher />);
    
    const org2Button = screen.getByRole('button', { name: new RegExp(org2.name, 'i') });
    fireEvent.click(org2Button);

    expect(mockSetCurrentOrganizationId).toHaveBeenCalledWith(org2.id);
    expect(mockNavigate).toHaveBeenCalledWith(`/dashboard/organizations/${org2.id}`);
  });

  it('does NOT call setCurrentOrganizationId or navigate when the current org is clicked', () => {
    setupStore({ currentOrganizationId: org1.id }); 
    renderWithRouter(<OrganizationSwitcher />);
    
    const org1Button = screen.getByRole('button', { name: new RegExp(org1.name, 'i') });
    // This button is the one inside the dropdown list, not the trigger
    fireEvent.click(org1Button);

    expect(mockSetCurrentOrganizationId).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders the "Manage Organizations" link correctly', () => {
    renderWithRouter(<OrganizationSwitcher />);
    const manageLink = screen.getByRole('link', { name: /Manage Organizations/i });
    expect(manageLink).toBeInTheDocument();
    expect(manageLink).toHaveAttribute('href', '/dashboard/organizations');
  });

  it('renders the "Create Organization" link correctly', () => {
    renderWithRouter(<OrganizationSwitcher />);
    const createLink = screen.getByRole('link', { name: /Create Organization/i });
    expect(createLink).toBeInTheDocument();
    expect(createLink).toHaveAttribute('href', '/dashboard/organizations/new');
  });

  it('displays "No organizations found" message when list is empty', () => {
    setupStore({ userOrganizations: [], isLoading: false });
    renderWithRouter(<OrganizationSwitcher />);
    expect(screen.getByText('No organizations found.')).toBeInTheDocument();
  });
}); 