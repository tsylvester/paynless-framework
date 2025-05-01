/// <reference types="vitest/globals" />

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { OrganizationDetailsCard } from '@/components/organizations/OrganizationDetailsCard';
import { useOrganizationStore } from '@paynless/store';
import { Organization } from '@paynless/types';

// Mock the Zustand store
vi.mock('@paynless/store');

// Define the relevant part of the state for this mock
interface MockStateType {
    currentOrganizationId: string | null;
    currentOrganizationDetails: Organization | null;
    isLoading: boolean;
}

// Default mock state values
let mockState: MockStateType = {
    currentOrganizationId: null,
    currentOrganizationDetails: null,
    isLoading: false,
};

// Mock implementation for the hook
const useOrganizationStoreMock = useOrganizationStore as vi.Mock;

// Helper function to set up the mock return values based on current state
const setupMockImplementation = () => {
    useOrganizationStoreMock.mockImplementation((selector?: (state: any) => any) => {
        // Define the state object based on the current mockState
        const state = { 
            currentOrganizationId: mockState.currentOrganizationId,
            currentOrganizationDetails: mockState.currentOrganizationDetails,
            isLoading: mockState.isLoading,
            // Add any other state parts that might be returned by the hook if needed
        };
        // If a selector function is provided, call it with the state
        if (typeof selector === 'function') {
            return selector(state);
        }
        // Otherwise, return the entire state object (simulating no selector)
        return state;
    });
};

// Reset mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
    // Reset state to default
    mockState = {
        currentOrganizationId: null,
        currentOrganizationDetails: null,
        isLoading: false,
    };
    setupMockImplementation();
});

// Helper to set the store state for a specific test
const setMockStoreState = (newState: Partial<MockStateType>) => {
    mockState = { ...mockState, ...newState };
    setupMockImplementation();
};

const mockOrgDetails: Organization = {
    id: 'org-123',
    name: 'Test Organization Alpha',
    visibility: 'private',
    created_at: '2024-01-15T10:00:00Z',
    deleted_at: null,
};

describe('OrganizationDetailsCard', () => {
    test('renders loading skeletons when isLoading is true and details mismatch', () => {
        setMockStoreState({ 
            isLoading: true, 
            currentOrganizationId: 'org-123', 
            currentOrganizationDetails: null // Simulate details not yet loaded
        });
        const { container } = render(<OrganizationDetailsCard />);
        // Check for presence of skeleton elements (more robust than counting)
        expect(container.querySelector('.animate-pulse')).toBeInTheDocument(); 
        // Check that actual data is not displayed
        expect(screen.queryByText(mockOrgDetails.name)).not.toBeInTheDocument();
        expect(screen.queryByText(/Visibility:/i)).not.toBeInTheDocument();
    });

     test('renders loading skeletons when isLoading is true even if stale details exist', () => {
        setMockStoreState({ 
            isLoading: true, 
            currentOrganizationId: 'org-456', // Different ID selected
            currentOrganizationDetails: mockOrgDetails // Stale details for org-123
        });
        const { container } = render(<OrganizationDetailsCard />);
        expect(container.querySelector('.animate-pulse')).toBeInTheDocument(); 
        expect(screen.queryByText(mockOrgDetails.name)).not.toBeInTheDocument();
    });

    test('renders placeholder message when no organization is selected', () => {
        setMockStoreState({ 
            isLoading: false, 
            currentOrganizationId: null, 
            currentOrganizationDetails: null 
        });
        render(<OrganizationDetailsCard />);
        expect(screen.getByText(/No organization selected or details unavailable./i)).toBeInTheDocument();
        expect(screen.queryByText(/Name:/i)).not.toBeInTheDocument();
    });

    test('renders organization details correctly when loaded', () => {
        setMockStoreState({ 
            isLoading: false, 
            currentOrganizationId: mockOrgDetails.id,
            currentOrganizationDetails: mockOrgDetails 
        });
        // Render once and capture container
        const { container } = render(<OrganizationDetailsCard />); 
        
        // Check Title
        expect(screen.getByText('Organization Details')).toBeInTheDocument();
        
        // Check Name
        expect(screen.getByText(mockOrgDetails.name)).toBeInTheDocument();
        
        // Check Visibility
        const visibilityLabel = screen.getByText(/Visibility:/i);
        const visibilityValueElement = visibilityLabel.nextElementSibling;
        expect(visibilityValueElement).toBeInTheDocument();
        expect(visibilityValueElement?.textContent).toBe(mockOrgDetails.visibility);
        expect(visibilityValueElement).toHaveClass('capitalize');

        // Check Date
        const dateLabel = screen.getByText(/Created:/i);
        const expectedDate = new Date(mockOrgDetails.created_at).toLocaleDateString();
        // Check the parent's text content, ensuring no extra space after colon
        expect(dateLabel.parentElement?.textContent).toBe(`Created:${expectedDate}`);

        // Check skeletons are not present using the container from the initial render
        expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument(); 
    });
});

// --- Final Corrected Test --- 
describe('OrganizationDetailsCard Final', () => {
    // Keep the first three tests the same
    test('renders loading skeletons when isLoading is true and details mismatch', () => {
        setMockStoreState({ 
            isLoading: true, 
            currentOrganizationId: 'org-123', 
            currentOrganizationDetails: null
        });
        const { container } = render(<OrganizationDetailsCard />);
        expect(container.querySelector('.animate-pulse')).toBeInTheDocument(); 
        expect(screen.queryByText(mockOrgDetails.name)).not.toBeInTheDocument();
        expect(screen.queryByText(/Visibility:/i)).not.toBeInTheDocument();
    });

     test('renders loading skeletons when isLoading is true even if stale details exist', () => {
        setMockStoreState({ 
            isLoading: true, 
            currentOrganizationId: 'org-456',
            currentOrganizationDetails: mockOrgDetails
        });
        const { container } = render(<OrganizationDetailsCard />);
        expect(container.querySelector('.animate-pulse')).toBeInTheDocument(); 
        expect(screen.queryByText(mockOrgDetails.name)).not.toBeInTheDocument();
    });

    test('renders placeholder message when no organization is selected', () => {
        setMockStoreState({ 
            isLoading: false, 
            currentOrganizationId: null, 
            currentOrganizationDetails: null 
        });
        render(<OrganizationDetailsCard />);
        expect(screen.getByText(/No organization selected or details unavailable./i)).toBeInTheDocument();
        expect(screen.queryByText(/Name:/i)).not.toBeInTheDocument();
    });

    // Corrected test for loaded state
    test('renders organization details correctly when loaded', () => {
        setMockStoreState({ 
            isLoading: false, 
            currentOrganizationId: mockOrgDetails.id,
            currentOrganizationDetails: mockOrgDetails 
        });
        // Render ONCE and capture container
        const { container } = render(<OrganizationDetailsCard />); 
        
        // Check Title
        expect(screen.getByText('Organization Details')).toBeInTheDocument();
        
        // Check Name
        expect(screen.getByText(mockOrgDetails.name)).toBeInTheDocument();
        
        // Check Visibility (using robust nextElementSibling check)
        const visibilityLabel = screen.getByText(/Visibility:/i);
        const visibilityValueElement = visibilityLabel.nextElementSibling;
        expect(visibilityValueElement).toBeInTheDocument();
        expect(visibilityValueElement?.textContent).toBe(mockOrgDetails.visibility);
        expect(visibilityValueElement).toHaveClass('capitalize');

        // Check Date (robust parent check, no space after colon)
        const dateLabel = screen.getByText(/Created:/i);
        const expectedDate = new Date(mockOrgDetails.created_at).toLocaleDateString();
        expect(dateLabel.parentElement?.textContent).toBe(`Created:${expectedDate}`);

        // Check skeletons are not present using the initial container
        expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument(); 
    });
}); 