import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
// Adjust relative path to the component
import { OrganizationListCard } from '../../../../components/organizations/OrganizationListCard'; 
import { useOrganizationStore } from '@paynless/store';
import { Organization } from '@paynless/types';

// Mock the Zustand store
vi.mock('@paynless/store');

// Default mock state values
const mockSetCurrentOrganizationId = vi.fn();
let mockState: { 
    userOrganizations: Organization[];
    currentOrganizationId: string | null;
    isLoading: boolean;
    setCurrentOrganizationId: (id: string | null) => void;
} = {
    userOrganizations: [],
    currentOrganizationId: null,
    isLoading: false,
    setCurrentOrganizationId: mockSetCurrentOrganizationId,
};

// Mock implementation for the hook
const useOrganizationStoreMock = useOrganizationStore as vi.Mock;

// Reset mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
    // Reset state to default before each test
    mockState = {
        userOrganizations: [],
        currentOrganizationId: null,
        isLoading: false,
        setCurrentOrganizationId: mockSetCurrentOrganizationId,
    };
    // Apply the initial mock state
    useOrganizationStoreMock.mockImplementation(() => mockState); // Return the whole state
});

// Helper to set the store state for a specific test
const setMockStoreState = (newState: Partial<typeof mockState>) => {
    mockState = { ...mockState, ...newState };
    // Update the mock implementation to return the new state
    useOrganizationStoreMock.mockImplementation(() => mockState); 
};


// --- Tests --- 

describe('OrganizationListCard', () => {
    const org1: Organization = { id: 'org-1', name: 'Org One', visibility: 'private', created_at: '2023-01-01T00:00:00Z', deleted_at: null };
    const org2: Organization = { id: 'org-2', name: 'Org Two', visibility: 'private', created_at: '2023-01-02T00:00:00Z', deleted_at: null };

    test('renders correctly with organizations', () => {
        setMockStoreState({ userOrganizations: [org1, org2], isLoading: false });
        render(<OrganizationListCard />);

        expect(screen.getByText('Your Organizations')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org One' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Org Two' })).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    test('renders the empty state correctly', () => {
        setMockStoreState({ userOrganizations: [], isLoading: false });
        render(<OrganizationListCard />);

        expect(screen.getByText('Your Organizations')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByText('No organizations found.')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    test('renders the loading state correctly', () => {
        setMockStoreState({ userOrganizations: [], isLoading: true });
        render(<OrganizationListCard />);

        expect(screen.getByText('Your Organizations')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create New/i })).toBeInTheDocument();
        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();
    });

    test('highlights the active organization', () => {
        setMockStoreState({ userOrganizations: [org1, org2], currentOrganizationId: org2.id, isLoading: false });
        render(<OrganizationListCard />);

        const orgOneButton = screen.getByRole('button', { name: 'Org One' });
        const orgTwoButton = screen.getByRole('button', { name: 'Org Two' });

        // Check based on expected classes added by the variants
        // Note: These class names might need adjustment based on the exact Button implementation
        expect(orgOneButton.classList.contains('bg-secondary')).toBe(false); 
        expect(orgTwoButton.classList.contains('bg-secondary')).toBe(true);

        // Optionally, check that the inactive one has the ghost class if applicable
        // expect(orgOneButton.classList.contains('hover:bg-accent')).toBe(true); // Example check for ghost
    });

    test('clicking an inactive organization dispatches setCurrentOrganizationId', () => {
        // Arrange: Org1 is inactive, Org2 is active
        setMockStoreState({ userOrganizations: [org1, org2], currentOrganizationId: org2.id, isLoading: false });
        render(<OrganizationListCard />);
        const orgOneButton = screen.getByRole('button', { name: 'Org One' });
        
        // Act
        fireEvent.click(orgOneButton);

        // Assert
        expect(mockSetCurrentOrganizationId).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentOrganizationId).toHaveBeenCalledWith(org1.id);
    });

    test('clicking the active organization does NOT dispatch setCurrentOrganizationId', () => {
        // Arrange: Org2 is active
        setMockStoreState({ userOrganizations: [org1, org2], currentOrganizationId: org2.id, isLoading: false });
        render(<OrganizationListCard />);
        const orgTwoButton = screen.getByRole('button', { name: 'Org Two' });
        
        // Act
        fireEvent.click(orgTwoButton);

        // Assert
        expect(mockSetCurrentOrganizationId).not.toHaveBeenCalled();
    });

    test('clicking "Create New" button logs a TODO message', () => {
        // Arrange
        const consoleLogSpy = vi.spyOn(console, 'log');
        setMockStoreState({ userOrganizations: [org1], isLoading: false }); // Need at least one org or empty state
        render(<OrganizationListCard />);
        const createNewButton = screen.getByRole('button', { name: /Create New/i });

        // Act
        fireEvent.click(createNewButton);

        // Assert
        expect(consoleLogSpy).toHaveBeenCalledWith('TODO: Trigger Create Organization Modal');

        // Clean up spy
        consoleLogSpy.mockRestore();
    });

    // TODO: Add more tests:
    // - Test list updates when userOrganizations state changes
}); 