import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CreateOrganizationForm } from '@/components/organizations/CreateOrganizationForm';
import { useOrganizationStore } from '@paynless/store';
import { Organization } from '@paynless/types';
import { toast } from 'sonner';
// Remove unused logger import
// import { logger } from '@paynless/utils'; 
// Remove internal type import
// import type { OrganizationStoreImplementation } from '@paynless/store/src/organizationStore'; 

// Mock the Zustand store
vi.mock('@paynless/store');
// Mock the toast library
vi.mock('sonner');
// Mock the logger
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

// Default mock state values
const mockCreateOrganization = vi.fn();
const mockCloseCreateModal = vi.fn();

// Define the relevant parts of the state needed for mocking this component
interface MockFormState {
    createOrganization: typeof mockCreateOrganization;
    closeCreateModal: typeof mockCloseCreateModal;
    isLoading: boolean;
    error: string | null;
    getState: () => { error: string | null }; 
}

let mockState: MockFormState = {
    createOrganization: mockCreateOrganization,
    closeCreateModal: mockCloseCreateModal,
    isLoading: false,
    error: null,
    getState: () => ({ error: mockState.error }), 
};

// Mock implementation for the hook
const useOrganizationStoreMock = useOrganizationStore as vi.Mock;

// Helper function to set up the mock return values based on current state
const setupMockImplementation = () => {
    // Revert to using any for selector state
    useOrganizationStoreMock.mockImplementation((selector: (state: any) => any) => { 
        // Simulate the Zustand selector behavior for the specific values used by this component
        const state = { 
            createOrganization: mockState.createOrganization,
            closeCreateModal: mockState.closeCreateModal,
            isLoading: mockState.isLoading,
            error: mockState.error,
            getState: mockState.getState 
        };
        
        // Check which specific state/action the component is selecting
        try {
            return selector(state);
        } catch (e) {
            // Fallback for safety, though direct call should work if mockState includes needed fields
            console.error("Error during selector execution in mock:", e);
            console.warn("Unhandled selector in CreateOrganizationForm mock:", selector.toString());
            return undefined;
        }
    });
};

// Reset mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
    // Reset state to default
    mockState = {
        createOrganization: mockCreateOrganization,
        closeCreateModal: mockCloseCreateModal,
        isLoading: false,
        error: null,
        getState: () => ({ error: mockState.error }), // Ensure getState returns the current error
    };
    // Apply the initial mock implementation
    setupMockImplementation(); 
});

// Helper to set the store state for a specific test
const setMockStoreState = (newState: Partial<MockFormState>) => { // Use MockFormState type
    // Ensure getState always points to the latest mockState
    const updatedState = { ...mockState, ...newState };
    // Update the closure for getState
    mockState = { ...updatedState, getState: () => ({ error: updatedState.error }) }; 
    // Re-apply the mock implementation with the new state values
    setupMockImplementation(); 
};

const mockOrg: Organization = {
    id: 'org-new',
    name: 'Test Org From Form',
    visibility: 'private',
    created_at: new Date().toISOString(),
    deleted_at: null,
};

describe('CreateOrganizationForm', () => {
    test('renders initial form correctly', () => {
        render(<CreateOrganizationForm />);
        expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Organization Name/i)).toHaveValue('');
        expect(screen.getByRole('radio', { name: /Private/i })).toBeChecked();
        expect(screen.getByRole('radio', { name: /Public/i })).not.toBeChecked();
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Create Organization/i })).toBeEnabled();
    });

    test('shows validation error for short name', async () => {
        render(<CreateOrganizationForm />);
        const nameInput = screen.getByLabelText(/Organization Name/i);
        const submitButton = screen.getByRole('button', { name: /Create Organization/i });

        await userEvent.type(nameInput, 'ab');
        await userEvent.click(submitButton);

        expect(await screen.findByText(/Organization name must be at least 3 characters./i)).toBeInTheDocument();
        expect(mockCreateOrganization).not.toHaveBeenCalled();
    });

    test('calls createOrganization on valid submission and handles success', async () => {
        mockCreateOrganization.mockResolvedValue(mockOrg); // Simulate successful creation
        render(<CreateOrganizationForm />);
        const nameInput = screen.getByLabelText(/Organization Name/i);
        const publicRadio = screen.getByRole('radio', { name: /Public/i });
        const submitButton = screen.getByRole('button', { name: /Create Organization/i });

        await userEvent.type(nameInput, mockOrg.name);
        await userEvent.click(publicRadio);
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(mockCreateOrganization).toHaveBeenCalledTimes(1);
            expect(mockCreateOrganization).toHaveBeenCalledWith(mockOrg.name, 'public');
        });
        
        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(`Organization "${mockOrg.name}" created successfully!`);
        });
        await waitFor(() => {
            expect(mockCloseCreateModal).toHaveBeenCalledTimes(1);
        });
        // Check if form was reset (name field should be empty)
        expect(nameInput).toHaveValue('');
    });

    test('handles API error during submission', async () => {
        const errorMessage = 'Network Error';
        mockCreateOrganization.mockResolvedValue(null); // Simulate failed creation
        setMockStoreState({ error: errorMessage }); // Set error in store
        
        render(<CreateOrganizationForm />);
        const nameInput = screen.getByLabelText(/Organization Name/i);
        const submitButton = screen.getByRole('button', { name: /Create Organization/i });

        await userEvent.type(nameInput, 'Valid Org Name');
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(mockCreateOrganization).toHaveBeenCalledTimes(1);
            expect(mockCreateOrganization).toHaveBeenCalledWith('Valid Org Name', 'private'); // Default visibility
        });

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(errorMessage);
        });
        expect(mockCloseCreateModal).not.toHaveBeenCalled();
    });

    test('disables buttons when isLoading is true', () => {
        setMockStoreState({ isLoading: true });
        render(<CreateOrganizationForm />);

        expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Creating.../i })).toBeDisabled();
    });

    test('calls closeCreateModal when Cancel button is clicked', async () => {
        render(<CreateOrganizationForm />);
        const cancelButton = screen.getByRole('button', { name: /Cancel/i });

        await userEvent.click(cancelButton);

        expect(mockCloseCreateModal).toHaveBeenCalledTimes(1);
    });
}); 