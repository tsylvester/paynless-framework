import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import { OrganizationListCard } from './OrganizationListCard';
import * as PaynlessStore from '@paynless/store'; // Import for spyOn
import type { Organization } from '@paynless/types'; // Removed OrganizationState, OrganizationStoreType
import { createMockOrganizationStore } from './../../mocks/organizationStore.mock'; // Import mock creator

// --- Test Setup ---

// --- Mocks for Org Data ---
const mockOrgs: Organization[] = Array.from({ length: 12 }, (_, i) => ({
    id: `org-${i + 1}`,
    name: `Org ${i + 1}`,
    visibility: 'private',
    created_at: new Date().toISOString(),
    deleted_at: null,
    allow_member_chat_creation: false,
}));

// --- Test Suite --- 
describe('OrganizationListCard', () => {
    // Keep track of the mock store instance for tests to access actions/state
    let mockOrgStore: ReturnType<typeof createMockOrganizationStore>;
    let mockFetchUserOrganizations: Mock; // Declare mock for specific action

    beforeEach(() => {
        // Create a specific mock instance for fetchUserOrganizations
        mockFetchUserOrganizations = vi.fn().mockImplementation(() => {
            // console.log('[MOCK] fetchUserOrganizations called via injected mock'); // Optional: for seeing if this specific instance is hit
            return Promise.resolve(undefined);
        });

        // Create a fresh mock store instance for each test, injecting our specific mock
        mockOrgStore = createMockOrganizationStore({
            fetchUserOrganizations: mockFetchUserOrganizations,
        });

        // Spy on the actual store hook and make it return our mock instance's state
        // Reverting to `any` for the selector's state type due to complex type mismatches
        // between the mock store's state shape and the actual OrganizationStoreImplementation.
        vi.spyOn(PaynlessStore, 'useOrganizationStore').mockImplementation((selector?: (state: any) => any) => {
            const state = mockOrgStore.getState();
            return selector ? selector(state) : state;
        });

        // Mock scrollIntoView for Radix UI components in JSDOM (keep this)
        Element.prototype.scrollIntoView = vi.fn(); 
    });

    afterEach(() => {
        // Restore all mocks and spies
        vi.restoreAllMocks();
    });

    // --- Tests (Updated to use mockOrgStore instance where needed) ---

    it('renders correctly with organizations', () => {
        // Arrange: Set state directly on the mock instance
        mockOrgStore.setState({
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            orgListTotalCount: 2,
            isLoading: false,
        });

        // Act
        render(<OrganizationListCard />);

        // Assert (Keep assertions as they were, relying on the spy)
        expect(screen.getByRole('heading', { name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org 2' })).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    it('renders the empty state correctly', () => {
        // Arrange: Set state on mock instance
        mockOrgStore.setState({
            userOrganizations: [],
            orgListTotalCount: 0,
            isLoading: false,
        });

        // Act
        render(<OrganizationListCard />);

        // Assert
        expect(screen.getByRole('heading', { name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByText('No organizations found.')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('renders the loading state correctly', () => {
        // Arrange: Set state on mock instance
        mockOrgStore.setState({
            userOrganizations: [],
            isLoading: true,
        });

        // Act
        const { container } = render(<OrganizationListCard />); 

        // Assert
        expect(screen.getByRole('heading', { name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        const skeletons = container.querySelectorAll('[data-slot="skeleton"]'); 
        expect(skeletons.length).toBeGreaterThan(0);
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); 
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    it('highlights the active organization', () => {
        // Arrange: Set state on mock instance
        mockOrgStore.setState({
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            currentOrganizationId: mockOrgs[1].id,
            orgListTotalCount: 2, 
            isLoading: false,
        });

        // Act
        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org 1' });
        const orgTwoButton = screen.getByRole('button', { name: 'Org 2' });

        // Assert
        expect(orgOneButton).not.toHaveClass('bg-secondary');
        expect(orgTwoButton).toHaveClass('bg-secondary');
    });

    it('clicking an inactive organization calls setCurrentOrganizationId', () => {
        // Arrange: Set state on mock instance
        mockOrgStore.setState({
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            currentOrganizationId: mockOrgs[1].id,
            orgListTotalCount: 2,
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org 1' });
        
        // Act
        fireEvent.click(orgOneButton);

        // Assert: Check the mock action on the mock store instance
        expect(mockOrgStore.getState().setCurrentOrganizationId).toHaveBeenCalledTimes(1);
        expect(mockOrgStore.getState().setCurrentOrganizationId).toHaveBeenCalledWith(mockOrgs[0].id);
    });

    it('clicking the active organization does NOT call setCurrentOrganizationId', () => {
        // Arrange: Set state on mock instance
        mockOrgStore.setState({
            userOrganizations: [mockOrgs[0], mockOrgs[1]],
            currentOrganizationId: mockOrgs[1].id,
            orgListTotalCount: 2,
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const orgTwoButton = screen.getByRole('button', { name: 'Org 2' });
        
        // Act
        fireEvent.click(orgTwoButton);

        // Assert
        expect(mockOrgStore.getState().setCurrentOrganizationId).not.toHaveBeenCalled();
    });

    it('clicking "Create New" button calls openCreateModal action', () => {
        // Arrange: Set state on mock instance
        mockOrgStore.setState({
            userOrganizations: [mockOrgs[0]],
            orgListTotalCount: 1,
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const createNewButton = screen.getByRole('button', { name: /Create New/i });

        // Act
        fireEvent.click(createNewButton);

        // Assert
        expect(mockOrgStore.getState().openCreateModal).toHaveBeenCalledTimes(1);
    });

    it('updates the list when userOrganizations state changes', async () => {
        const org1 = { id: 'o1', name: 'Org 1', visibility: 'private', created_at: 'd', deleted_at: null, allow_member_chat_creation: false };
        const org2 = { id: 'o2', name: 'Org 2', visibility: 'private', created_at: 'd', deleted_at: null, allow_member_chat_creation: false };

        // Spy is no longer needed here as we assert on mockFetchUserOrganizations directly
        // const fetchUserOrgsSpy = vi.spyOn(mockOrgStore.getState(), 'fetchUserOrganizations');

        mockOrgStore.setState({
            userOrganizations: [org1],
            orgListTotalCount: 1,
            isLoading: false,
            orgListPage: 1,
            orgListPageSize: 10,
        });

        const { rerender } = render(<OrganizationListCard />); // Capture rerender
        console.log('[TEST DEBUG] mockFetchUserOrganizations calls after initial render:', mockFetchUserOrganizations.mock.calls.length);

        // Initial assertions
        expect(screen.getByRole('button', { name: 'Org 1' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Org 2' })).not.toBeInTheDocument();

        // Act: Update the store state
        mockOrgStore.setState({
            userOrganizations: [org1, org2],
            orgListTotalCount: 2,
            isLoading: false,
        });
        
        rerender(<OrganizationListCard />); // Call rerender

        console.log('[TEST DEBUG] Store userOrganizations before waitFor:', JSON.stringify(mockOrgStore.getState().userOrganizations));
        console.log('[TEST DEBUG] mockFetchUserOrganizations calls before waitFor:', mockFetchUserOrganizations.mock.calls.length);

        // Assert: Updated state using waitFor
        await waitFor(() => {
            // console.log('[TEST DEBUG] DOM inside waitFor:');
            // screen.debug(undefined, 30000); // Temporarily uncomment for full DOM output if needed
            expect(screen.getByRole('button', { name: 'Org 2' })).toBeInTheDocument();
        });
        // Assert Org 1 is still there too
        expect(screen.getByRole('button', { name: 'Org 1' })).toBeInTheDocument();
        console.log('[TEST DEBUG] mockFetchUserOrganizations calls after waitFor:', mockFetchUserOrganizations.mock.calls.length);
        // Expect our injected mock to have been called once by the initial render's effect
        expect(mockFetchUserOrganizations).toHaveBeenCalledTimes(1); 
    });

    // --- Pagination Tests (Adjusted to use mockOrgStore) ---
    it('renders pagination controls when total count exceeds page size', () => {
        mockOrgStore.setState({
            userOrganizations: mockOrgs.slice(0, 5), // First page
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 12, // Total count > page size
            isLoading: false,
        });

        render(<OrganizationListCard />);

        // Check for elements rendered by PaginationComponent
        expect(screen.getByRole('button', { name: /go to next page/i })).toBeInTheDocument(); 
        // Check for separate text elements
        expect(screen.getByText(/Page 1 of 3/i)).toBeInTheDocument(); 
        expect(screen.getByText(/12 items? total/i)).toBeInTheDocument(); 
    });

    it('does NOT render pagination controls when total count is less than or equal to page size', () => {
        mockOrgStore.setState({
            userOrganizations: mockOrgs.slice(0, 3),
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 3,
            isLoading: false,
        });

        render(<OrganizationListCard />);

        // Pagination component should return null
        expect(screen.queryByRole('button', { name: /go to next page/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/Page \d+ of \d+/i)).not.toBeInTheDocument();
        // Check the total items text IS NOT present either if the component returns null
        expect(screen.queryByText(/\d+ items? total/i)).not.toBeInTheDocument(); 
    });

    it('calls setOrgListPage when next page button is clicked', async () => {
        mockOrgStore.setState({
            userOrganizations: mockOrgs.slice(0, 5),
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 12,
            isLoading: false,
        });

        render(<OrganizationListCard />);
        const nextPageButton = screen.getByRole('button', { name: /go to next page/i });
        await act(async () => {
          fireEvent.click(nextPageButton);
        });
        expect(mockOrgStore.getState().setOrgListPage).toHaveBeenCalledTimes(1);
        expect(mockOrgStore.getState().setOrgListPage).toHaveBeenCalledWith(2);
    });

    it('calls setOrgListPageSize when a new size is selected', async () => {
        mockOrgStore.setState({
            userOrganizations: mockOrgs.slice(0, 5),
            orgListPage: 1,
            orgListPageSize: 5,
            orgListTotalCount: 12,
            isLoading: false,
            // allowedPageSizes: [5, 10, 20] // Optional override if needed
        });

        render(<OrganizationListCard />);
        const trigger = screen.getByRole('combobox');
        await act(async () => {
          fireEvent.click(trigger);
        });

        // Find the option by text (assuming default sizes 5, 10, 20, 50)
        // Note: Default page sizes are [10, 25, 50] in component, test needs adjustment
        const option25 = await screen.findByText('25'); // Find one of the DEFAULT sizes
        await act(async () => {
          fireEvent.click(option25);
        });

        expect(mockOrgStore.getState().setOrgListPageSize).toHaveBeenCalledTimes(1);
        expect(mockOrgStore.getState().setOrgListPageSize).toHaveBeenCalledWith(25); // Check for 25
    });

}); 