import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
// Adjust relative path to the component
import { OrganizationListCard } from '../../../../components/organizations/OrganizationListCard'; 
import { useOrganizationStore } from '@paynless/store';
// Import the full type and related types
import type { Organization, OrganizationState, UserOrganizationLink } from '@paynless/types';

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
// Add mocks for any other actions the component might *indirectly* trigger or need
const mockFetchOrganizationDetails = vi.fn();
const mockCreateOrganization = vi.fn(); // Placeholder if Create button gets implemented
const mockOpenCreateModal = vi.fn(); // <<< Define dedicated mock for the action

// Define a baseline mock state matching OrganizationState
const baselineOrgState: OrganizationState = {
    userOrganizations: [],
    currentOrganizationId: null,
    currentOrganizationDetails: null,
    currentOrganizationMembers: [],
    isLoading: false,
    error: null,
    // --- Mocked Actions ---
    setCurrentOrganizationId: mockSetCurrentOrganizationId,
    fetchUserOrganizations: mockFetchUserOrganizations,
    fetchOrganizationDetails: mockFetchOrganizationDetails,
    createOrganization: mockCreateOrganization,
    openCreateModal: mockOpenCreateModal, // <<< Assign dedicated mock here
    // Add *all* other actions from OrganizationState with vi.fn()
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
    approveRequest: vi.fn(),
    denyRequest: vi.fn(),
    selectCurrentUserRoleInOrg: () => null, // Default selector mock
};

// Mock the hook implementation
const mockedUseOrgStore = vi.mocked(useOrganizationStore);

// Reset mocks and state before each test
beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementation to the baseline state
    mockedUseOrgStore.mockReturnValue(baselineOrgState);
    // Reset the state object itself if modified directly (safer to use setState)
    // Object.assign(baselineOrgState, { /* reset properties if needed */ });
});

// --- Mocks for Org Data ---
// Use UserOrganizationLink type if that's what userOrganizations holds
const org1: UserOrganizationLink = { id: 'org-1', name: 'Org One', membership_id: 'mem-1' }; 
const org2: UserOrganizationLink = { id: 'org-2', name: 'Org Two', membership_id: 'mem-2' };

// --- Test Suite --- 
describe('OrganizationListCard', () => {

    it('renders correctly with organizations', () => {
        // Arrange: Set state using the store's setState method
        act(() => {
            useOrganizationStore.setState({
                userOrganizations: [org1, org2],
                isLoading: false
            });
        });

        // Act
        render(<OrganizationListCard />);

        // Assert
        expect(screen.getByRole('heading', { name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org One' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org Two' })).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    it('renders the empty state correctly', () => {
        // Arrange: Default state has empty userOrganizations
        act(() => {
            useOrganizationStore.setState({ userOrganizations: [], isLoading: false });
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
        // Arrange
        act(() => {
            useOrganizationStore.setState({ userOrganizations: [], isLoading: true });
        });
        
        // Act
        render(<OrganizationListCard />);

        // Assert
        expect(screen.getByRole('heading', { name: /Organizations/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    it('highlights the active organization', () => {
        // Arrange
        act(() => {
            useOrganizationStore.setState({ 
                userOrganizations: [org1, org2], 
                currentOrganizationId: org2.id, 
                isLoading: false 
            });
        });
        
        // Act
        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org One' });
        const orgTwoButton = screen.getByRole('button', { name: 'Org Two' });

        // Assert: Check for presence/absence of the 'bg-secondary' class
        expect(orgOneButton).not.toHaveClass('bg-secondary');
        expect(orgTwoButton).toHaveClass('bg-secondary');
    });

    it('clicking an inactive organization calls setCurrentOrganizationId', () => {
        // Arrange
        act(() => {
            useOrganizationStore.setState({ 
                userOrganizations: [org1, org2], 
                currentOrganizationId: org2.id, 
                isLoading: false 
            });
        });
        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org One' });
        
        // Act
        fireEvent.click(orgOneButton);

        // Assert
        expect(mockSetCurrentOrganizationId).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentOrganizationId).toHaveBeenCalledWith(org1.id);
    });

    it('clicking the active organization does NOT call setCurrentOrganizationId', () => {
        // Arrange
        act(() => {
            useOrganizationStore.setState({ 
                userOrganizations: [org1, org2], 
                currentOrganizationId: org2.id, 
                isLoading: false 
            });
        });
        render(<OrganizationListCard />);
        const orgTwoButton = screen.getByRole('button', { name: 'Org Two' });
        
        // Act
        fireEvent.click(orgTwoButton);

        // Assert
        expect(mockSetCurrentOrganizationId).not.toHaveBeenCalled();
    });

    it('clicking "Create New" button calls openCreateModal action', () => {
        // Arrange
        act(() => {
            useOrganizationStore.setState({ userOrganizations: [org1], isLoading: false });
        });
        render(<OrganizationListCard />);
        const createNewButton = screen.getByRole('button', { name: /Create New/i });

        // Act
        fireEvent.click(createNewButton);

        // Assert
        expect(mockOpenCreateModal).toHaveBeenCalledTimes(1);
    });
}); 