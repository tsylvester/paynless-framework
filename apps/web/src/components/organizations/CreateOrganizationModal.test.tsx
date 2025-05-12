/// <reference types="vitest/globals" />

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CreateOrganizationModal } from '@/components/organizations/CreateOrganizationModal';
import { useOrganizationStore } from '@paynless/store';

// Mock the Zustand store
vi.mock('@paynless/store');

// Mock the form component
vi.mock('@/components/organizations/CreateOrganizationForm', () => ({
    CreateOrganizationForm: () => <div data-testid="mock-create-form">Mock Form</div>
}));

// Define the relevant part of the state for this mock
interface MockStateType {
    isCreateModalOpen: boolean;
    closeCreateModal: () => void;
}

// Default mock state values
const mockCloseCreateModal = vi.fn();
let mockState: MockStateType = {
    isCreateModalOpen: false,
    closeCreateModal: mockCloseCreateModal,
};

// Mock implementation for the hook
// Revert to using the type cast despite linter error
const useOrganizationStoreMock = useOrganizationStore as vi.Mock;

// Helper function to set up the mock return values based on current state
const setupMockImplementation = () => {
    // Directly return the specific state/actions needed by the component
    // Use MockStateType for the selector's state parameter
    useOrganizationStoreMock.mockImplementation((selector: (state: MockStateType) => any) => { 
        // Simulate the Zustand selector behavior for the specific values used
        const state: MockStateType = { 
            isCreateModalOpen: mockState.isCreateModalOpen,
            closeCreateModal: mockState.closeCreateModal,
        };
        return selector(state);
    });
};

// Reset mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
    // Reset state to default (closed)
    mockState = {
        isCreateModalOpen: false,
        closeCreateModal: mockCloseCreateModal, // Ensure the mock function is assigned
    };
    // Apply the initial mock implementation
    setupMockImplementation(); 
});

// Helper to set the store state for a specific test
const setMockStoreState = (newState: Partial<MockStateType>) => {
    mockState = { ...mockState, ...newState };
    // Re-apply the mock implementation with the new state values
    setupMockImplementation(); 
};

describe('CreateOrganizationModal', () => {
    test('does not render the content when isCreateModalOpen is false', () => {
        render(<CreateOrganizationModal />);
        // Dialog container might still exist but be hidden.
        // Check that the *content* (title, description, form) is not rendered.
        // This might still fail if Radix keeps elements mounted but hidden.
        // Consider removing this test if closing mechanism test passes reliably.
        expect(screen.queryByText('Create New Organization')).not.toBeInTheDocument();
        expect(screen.queryByText('Enter the details for your new organization.')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-create-form')).not.toBeInTheDocument();
    });

    test('renders the dialog and form when isCreateModalOpen is true', () => {
        setMockStoreState({ isCreateModalOpen: true });
        render(<CreateOrganizationModal />);

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Create New Organization')).toBeInTheDocument();
        expect(screen.getByText('Enter the details for your new organization.')).toBeInTheDocument();
        expect(screen.getByTestId('mock-create-form')).toBeInTheDocument();
    });

    test('calls closeCreateModal when the dialog is closed via the Close button', () => {
        setMockStoreState({ isCreateModalOpen: true });
        render(<CreateOrganizationModal />);

        // Find the close button (typically has aria-label="Close")
        const closeButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(closeButton);
        
        // Wait for potential state updates if needed, although close should be synchronous here
        // await waitFor(() => { ... });
        
        expect(mockCloseCreateModal).toHaveBeenCalledTimes(1);
    });

    // Add test for closing via internal 'Cancel' button IF it were in this component
    // Since it's in the form, that test belongs to the form.
}); 