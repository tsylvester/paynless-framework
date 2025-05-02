import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
// Adjust relative path to the component
import { OrganizationListCard } from '../../../../components/organizations/OrganizationListCard'; 
import { useOrganizationStore } from '@paynless/store';
// Import the full type and related types
// Using Organization type directly as list now holds full org objects
import type { Organization, OrganizationState } from '@paynless/types';

// Mock the store using vi.fn() for better control
vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/store')>();
    return {
        ...actual,
        // Ensure useOrganizationStore is a mock function we can manipulate
        useOrganizationStore: vi.fn(), 
    };
});

// --- Test Setup ---

// Define mock functions for actions
const mockSetCurrentOrganizationId = vi.fn();
const mockFetchUserOrganizations = vi.fn();
const mockFetchOrganizationDetails = vi.fn();
const mockCreateOrganization = vi.fn(); 
const mockOpenCreateModal = vi.fn();
const mockSetOrgListPage = vi.fn(); // <<< Mock pagination action
const mockSetOrgListPageSize = vi.fn(); // <<< Mock pagination action

// Define a baseline mock state matching OrganizationState
// Include all fields, even if not used by this specific component
const baselineOrgState: Partial<OrganizationState & { openCreateModal: () => void; setOrgListPage: (page: number) => void; setOrgListPageSize: (size: number) => void; }> = {
    userOrganizations: [],
    currentOrganizationId: null,
    currentOrganizationDetails: null,
    currentOrganizationMembers: [],
    currentPendingInvites: [],
    currentPendingRequests: [],
    currentInviteDetails: null,
    isLoading: false,
    isFetchingInviteDetails: false,
    fetchInviteDetailsError: null,
    error: null,
    isCreateModalOpen: false,
    isDeleteDialogOpen: false,
    // --- Pagination State ---
    orgListPage: 1,
    orgListPageSize: 5, // <<< Use smaller size for testing pagination UI
    orgListTotalCount: 0, // <<< Initialize with 0, but override in specific tests
    // --- Mocked Actions ---
    setCurrentOrganizationId: mockSetCurrentOrganizationId,
    fetchUserOrganizations: mockFetchUserOrganizations,
    fetchOrganizationDetails: mockFetchOrganizationDetails,
    createOrganization: mockCreateOrganization,
    openCreateModal: mockOpenCreateModal, 
    setOrgListPage: mockSetOrgListPage, // <<< Assign mock
    setOrgListPageSize: mockSetOrgListPageSize, // <<< Assign mock
    // Add other actions as mocks
    updateOrganization: vi.fn(),
    softDeleteOrganization: vi.fn(),
    openDeleteDialog: vi.fn(),
    closeDeleteDialog: vi.fn(),
    inviteUser: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    leaveOrganization: vi.fn(),
    fetchCurrentOrganizationMembers: vi.fn(),
    cancelInvite: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    requestJoin: vi.fn(),
    approveRequest: vi.fn(),
    denyRequest: vi.fn(),
    fetchInviteDetails: vi.fn(),
    // selectCurrentUserRoleInOrg: () => null, // Default selector mock
};

// Mock the hook implementation
const mockedUseOrgStore = vi.mocked(useOrganizationStore);

// Reset mocks and state before each test
beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementation to the baseline state for each test
    mockedUseOrgStore.mockReturnValue({ ...(baselineOrgState as any) }); // Cast needed due to partial state
    // Mock scrollIntoView for Radix UI components in JSDOM
    Element.prototype.scrollIntoView = vi.fn(); 
});

// --- Mocks for Org Data ---
// Create a larger list for pagination testing
const mockOrgs: Organization[] = Array.from({ length: 12 }, (_, i) => ({
    id: `org-${i + 1}`,
    name: `Org ${i + 1}`,
    visibility: 'private',
    created_at: new Date().toISOString(),
    deleted_at: null,
}));

// --- Test Suite --- 
describe('OrganizationListCard', () => {

    it('renders correctly with organizations', () => {
        // Arrange: Set state by providing a specific return value for the hook
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState,
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            orgListTotalCount: 2, // <<< Make sure count is > 0
            isLoading: false,
        });

        // Act
        render(<OrganizationListCard />);

        // Assert
        // Find the card header first to scope the title query
        const cardHeader = screen.getByRole('heading', { level: 2, name: /Organizations/i }).closest('div[data-slot="card-header"]');
        expect(cardHeader).toBeInTheDocument();
        // Check title within the header
        expect(screen.getByRole('heading', { level: 2, name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 2' })).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    it('renders the empty state correctly', () => {
        // Arrange: Set state for this test (default baseline is empty)
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState, // userOrgs is [], orgListTotalCount is 0
            isLoading: false,
        });

        // Act
        render(<OrganizationListCard />);

        // Assert
        expect(screen.getByRole('heading', { level: 2, name: /Organizations/i })).toBeInTheDocument(); // More specific title query
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByText('No organizations found.')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('renders the loading state correctly', () => {
        // Arrange: Set state for this test
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState,
            userOrganizations: [],
            isLoading: true,
        });

        // Act
        // Get container from render to use querySelectorAll
        const { container } = render(<OrganizationListCard />); 

        // Assert
        expect(screen.getByRole('heading', { level: 2, name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        
        // Check for skeleton placeholders using querySelectorAll on the container
        const skeletons = container.querySelectorAll('[data-slot="skeleton"]'); 
        expect(skeletons.length).toBeGreaterThan(0); // Check if at least one skeleton is present
        
        // Ensure "Loading..." text is NOT present if using skeletons
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); 
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    it('highlights the active organization', () => {
        // Arrange: Set state for this test
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState,
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            currentOrganizationId: mockOrgs[1].id,
            orgListTotalCount: 2, // <<< Make sure count is > 0
            isLoading: false,
        });

        // Act
        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org 1' });
        const orgTwoButton = screen.getByRole('button', { name: 'Org 2' });

        // Assert: Check for presence/absence of the 'bg-secondary' class
        expect(orgOneButton).not.toHaveClass('bg-secondary');
        expect(orgTwoButton).toHaveClass('bg-secondary');
    });

    it('clicking an inactive organization calls setCurrentOrganizationId', () => {
        // Arrange: Set state for this test
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState,
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            currentOrganizationId: mockOrgs[1].id,
            orgListTotalCount: 2, // <<< Make sure count is > 0
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org 1' });
        
        // Act
        fireEvent.click(orgOneButton);

        // Assert
        expect(mockSetCurrentOrganizationId).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentOrganizationId).toHaveBeenCalledWith(mockOrgs[0].id);
    });

    it('clicking the active organization does NOT call setCurrentOrganizationId', () => {
        // Arrange: Set state for this test
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState,
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            currentOrganizationId: mockOrgs[1].id,
            orgListTotalCount: 2, // <<< Make sure count is > 0
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const orgTwoButton = screen.getByRole('button', { name: 'Org 2' });
        
        // Act
        fireEvent.click(orgTwoButton);

        // Assert
        expect(mockSetCurrentOrganizationId).not.toHaveBeenCalled();
    });

    it('clicking "Create New" button calls openCreateModal action', () => {
        // Arrange: Set state for this test
        mockedUseOrgStore.mockReturnValue({
            ...baselineOrgState,
            userOrganizations: [mockOrgs[0]],
            orgListTotalCount: 1, // <<< Make sure count is > 0
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const createNewButton = screen.getByRole('button', { name: /Create New/i });

        // Act
        fireEvent.click(createNewButton);

        // Assert
        expect(mockOpenCreateModal).toHaveBeenCalledTimes(1);
    });

    // --- New Tests for Pagination ---
    it('renders pagination controls when total count exceeds page size', () => {
        mockedUseOrgStore.mockReturnValue({
            ...(baselineOrgState as any),
            userOrganizations: mockOrgs.slice(0, 5), // First page
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 12, // Total count > page size
            isLoading: false,
            allowedPageSizes: [5, 10, 20], // Explicitly provide for clarity
        });

        render(<OrganizationListCard />);

        // Check for a reliable element within pagination, like the "next" button
        expect(screen.getByRole('button', { name: /go to next page/i })).toBeInTheDocument(); 
        expect(screen.getByText(/Page 1 of 3/i)).toBeInTheDocument();
        // The total count display changed format in the component
        expect(screen.getByText(/12 item(s)? total/i)).toBeInTheDocument(); 
    });

    it('does NOT render pagination controls when total count is less than or equal to page size', () => {
        mockedUseOrgStore.mockReturnValue({
            ...(baselineOrgState as any),
            userOrganizations: mockOrgs.slice(0, 5),
            orgListPage: 1,
            orgListPageSize: 15, // Page size >= total count
            orgListTotalCount: 12, 
            isLoading: false,
        });
        render(<OrganizationListCard />);

        expect(screen.queryByRole('navigation', { name: /pagination/i })).not.toBeInTheDocument();
    });

    it('calls setOrgListPage when a page link is clicked', async () => {
        mockedUseOrgStore.mockReturnValue({
            ...(baselineOrgState as any),
            userOrganizations: mockOrgs.slice(0, 5),
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 12,
            isLoading: false,
            allowedPageSizes: [5, 10, 20], // Explicitly provide
        });
        render(<OrganizationListCard />);

        // Click the 'Next Page' button instead of a numbered link
        const nextPageButton = screen.getByRole('button', { name: /go to next page/i }); 
        fireEvent.click(nextPageButton);

        expect(mockSetOrgListPage).toHaveBeenCalledWith(2);
    });

    it('calls setOrgListPageSize when page size selector is changed', async () => {
        mockedUseOrgStore.mockReturnValue({
            ...(baselineOrgState as any),
            userOrganizations: mockOrgs.slice(0, 5),
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 12,
            isLoading: false,
            allowedPageSizes: [5, 10, 20], // <<< Explicitly provide allowed sizes
        });

        render(<OrganizationListCard />);

        // Find the trigger (combobox/button) for the page size selector
        const sizeSelectorTrigger = screen.getByRole('combobox'); 
        // Use fireEvent.click which might work better for Select components
        fireEvent.click(sizeSelectorTrigger); 

        // Find and click the option for page size 10 (ensure it waits)
        const sizeOption10 = await screen.findByRole('option', { name: '10' }); 
        fireEvent.click(sizeOption10);

        expect(mockSetOrgListPageSize).toHaveBeenCalledWith(10);
        expect(mockSetOrgListPage).toHaveBeenCalledWith(1); // Expect page to reset to 1
    });
    
    // --- Test for Automatic List Update ---
    it('updates the displayed list when userOrganizations state changes', () => {
        const initialMockState = {
            ...(baselineOrgState as any),
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 2,
            isLoading: false,
        };
        mockedUseOrgStore.mockReturnValue(initialMockState);

        const { rerender } = render(<OrganizationListCard />);

        // Initial state assertion
        expect(screen.getByRole('button', { name: 'Org 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 2' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Org 3' })).not.toBeInTheDocument();

        // Arrange: Simulate store update (e.g., adding an org)
        const updatedMockState = {
            ...initialMockState,
            userOrganizations: [mockOrgs[0], mockOrgs[1], mockOrgs[2]], // Add Org 3
            orgListTotalCount: 3,
        };
        mockedUseOrgStore.mockReturnValue(updatedMockState);
        
        // Act: Rerender the component with the new state
        rerender(<OrganizationListCard />);
        
        // Assert: Check if the new org is now displayed
        expect(screen.getByRole('button', { name: 'Org 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 2' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 3' })).toBeInTheDocument();
    });

}); 