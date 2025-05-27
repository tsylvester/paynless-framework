import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EditName } from './EditName';
import { useAuthStore } from '@paynless/store';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { toast } from 'sonner';

// Mock the useAuthStore
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ShadCN Card components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode, className?: string }) => <div data-testid="shadcn-card" className={className}>{children}</div>,
  CardHeader: ({ children, className }: { children: React.ReactNode, className?: string }) => <div data-testid="shadcn-card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children: React.ReactNode, className?: string }) => <h3 data-testid="shadcn-card-title" className={className}>{children}</h3>,
  CardDescription: ({ children, className }: { children: React.ReactNode, className?: string }) => <p data-testid="shadcn-card-description" className={className}>{children}</p>,
  CardContent: ({ children, className }: { children: React.ReactNode, className?: string }) => <div data-testid="shadcn-card-content" className={className}>{children}</div>,
  CardFooter: ({ children, className }: { children: React.ReactNode, className?: string }) => <div data-testid="shadcn-card-footer" className={className}>{children}</div>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input data-testid="shadcn-input" {...props} />,
}));
vi.mock('@/components/ui/button', () => ({
  Button: (props: any) => <button data-testid="shadcn-button" {...props} />,
}));
vi.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label data-testid="shadcn-label" {...props} />,
}));

vi.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
}));

describe('EditName Component', () => {
  const mockUpdateProfile = vi.fn();
  const mockProfileInitial = {
    id: 'user123',
    email: 'test@example.com',
    first_name: 'InitialFirst',
    last_name: 'InitialLast',
    avatar_url: '',
    username: 'initialuser',
    onboarded: true,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    role: 'user' as const,
    profile_privacy_setting: 'private' as const,
    user_status: 'active' as const,
    name: '',
    chat_context: null,
    last_selected_org_id: null,
  };

  const setupMockStore = (
    profile: any = mockProfileInitial,
    isLoading = false,
    error: Error | null = null,
    updateProfileImpl?: () => Promise<any>
  ) => {
    (useAuthStore as unknown as vi.Mock).mockReturnValue({
      profile,
      updateProfile: updateProfileImpl || mockUpdateProfile,
      isLoading,
      error,
      clearError: vi.fn(),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMockStore();
  });

  it('should render with initial first and last names in input fields and a disabled Save button', () => {
    render(<EditName />);

    expect(screen.getByTestId('shadcn-card-title')).toHaveTextContent('Edit Name');
    
    const firstNameInput = screen.getByLabelText(/first name/i);
    expect(firstNameInput).toBeInTheDocument();
    expect(firstNameInput).toHaveValue('InitialFirst');

    const lastNameInput = screen.getByLabelText(/last name/i);
    expect(lastNameInput).toBeInTheDocument();
    expect(lastNameInput).toHaveValue('InitialLast');

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it('should enable Save button when first name is changed', () => {
    render(<EditName />);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const saveButton = screen.getByRole('button', { name: /save/i });

    fireEvent.change(firstNameInput, { target: { value: 'NewFirst' } });
    expect(saveButton).toBeEnabled();
  });

  it('should enable Save button when last name is changed', () => {
    render(<EditName />);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const saveButton = screen.getByRole('button', { name: /save/i });

    fireEvent.change(lastNameInput, { target: { value: 'NewLast' } });
    expect(saveButton).toBeEnabled();
  });
  
  it('should call updateProfile with first and last names on Save and show success toast', async () => {
    const updatedProfileData = { ...mockProfileInitial, first_name: 'UpdatedFirst', last_name: 'UpdatedLast' };
    mockUpdateProfile.mockResolvedValue(updatedProfileData);
    render(<EditName />);
    
    const firstNameInput = screen.getByLabelText(/first name/i);
    fireEvent.change(firstNameInput, { target: { value: 'UpdatedFirst' } });
    const lastNameInput = screen.getByLabelText(/last name/i);
    fireEvent.change(lastNameInput, { target: { value: 'UpdatedLast' } });
    
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ first_name: 'UpdatedFirst', last_name: 'UpdatedLast' });
      expect(toast.success).toHaveBeenCalledWith('Name updated successfully!');
    });
    expect(saveButton).toBeEnabled();
  });

  it('should display loading state on Save button during save operation', async () => {
    let resolveUpdate: (value: any) => void = () => {};
    const updatePromise = new Promise<any>(resolve => { resolveUpdate = resolve; });
    
    // Initial store setup before any interaction
    setupMockStore(mockProfileInitial, false, null, () => updatePromise);

    render(<EditName />);
    const firstNameInput = screen.getByLabelText(/first name/i);
    fireEvent.change(firstNameInput, { target: { value: 'SavingFirst' } });
    
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    
    expect(saveButton).toHaveTextContent(/saving.../i);
    expect(saveButton).toBeDisabled();

    // Simulate the successful resolution of the update
    const updatedProfileAfterSave = { ...mockProfileInitial, first_name: 'SavingFirst' };
    
    await act(async () => {
      resolveUpdate(updatedProfileAfterSave); // Resolve the promise 
      await updatePromise; // Ensure promise is processed
      // Simulate store updating with the new profile data after successful save
      setupMockStore(updatedProfileAfterSave, false, null, () => updatePromise); 
    });

    // Re-render or ensure component picks up new store state for hasChanged calculation
    // For this test, re-querying the button is fine as its text will change back to Save.
    // The key is that the profile used by hasChanged should reflect updatedProfileAfterSave.

    const finalSaveButton = screen.getByRole('button', { name: /save/i });
    expect(finalSaveButton).toHaveTextContent(/save/i);
    // Now that the profile in the store mock reflects the change, 
    // and firstName input is 'SavingFirst',
    // hasChanged should be false, thus button is disabled.
    expect(finalSaveButton).toBeDisabled();
  });
  
  it('should show error toast and in-card error if updateProfile returns null (simulating API error)', async () => {
    const errorMsg = 'Network Error Updating Name';
    mockUpdateProfile.mockResolvedValue(null);
    
    setupMockStore(mockProfileInitial, false, new Error(errorMsg), mockUpdateProfile);

    render(<EditName />);
    
    const firstNameInput = screen.getByLabelText(/first name/i);
    fireEvent.change(firstNameInput, { target: { value: 'ErrorFirst' } });
    
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ first_name: 'ErrorFirst', last_name: 'InitialLast' });
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('Failed to update name. An unexpected error occurred.');
    });

    const saveButtonAfterError = screen.getByRole('button', { name: /save/i });
    expect(saveButtonAfterError).toBeEnabled();
  });

  it('should display storeError if present on load, without user interaction', () => {
    const existingError = new Error('Initial store error on load');
    setupMockStore(mockProfileInitial, false, existingError);

    render(<EditName />);

    expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
    expect(screen.getByText(existingError.message)).toBeInTheDocument();
  });

  it('should disable save button if profile is not loaded', () => {
    setupMockStore(null);
    render(<EditName />);
    expect(screen.getByText(/Profile data not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('should disable save button if component is in loading state from store', () => {
    setupMockStore(mockProfileInitial, true);
    render(<EditName />);
    const saveButton = screen.getByRole('button', { name: /saving.../i });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent(/saving.../i);
  });
}); 