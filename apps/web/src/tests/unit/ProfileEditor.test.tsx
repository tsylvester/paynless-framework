import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '@paynless/store'; // Import actual store
import type { UserProfile, UserProfileUpdate } from '@paynless/types';
import { ProfileEditor } from './ProfileEditor';
import { analytics } from '@paynless/analytics-client'; // Import analytics

// Mock the updateProfile function
const mockUpdateProfile = vi.fn();

// Mock initial profile data for the store
const initialMockProfile: UserProfile = {
  id: 'user-123',
  email: 'test@example.com', 
  first_name: 'InitialFirst',
  last_name: 'InitialLast',
  role: 'user',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Define baseline initial state for the store
const authStoreInitialState = {
  isLoading: false,
  error: null as Error | null,
  user: null, 
  session: null,
  profile: initialMockProfile, // Initial profile data
  updateProfile: mockUpdateProfile, // Inject mock action
  // Add other state/actions as needed from actual store
  login: vi.fn(), 
  logout: vi.fn(),
  initialize: vi.fn(),
  refreshSession: vi.fn(),
  register: vi.fn(),
  setUser: vi.fn(),
  setSession: vi.fn(),
  setProfile: vi.fn(),
  setIsLoading: vi.fn(), 
  setError: vi.fn(),    
};

// Mock the store module BUT use the actual hook implementation
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore, // Use the real hook
  };
});

// Mock logger if needed (can likely be removed if component doesn't use it directly)
vi.mock('@paynless/utils', () => ({
  logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
  }
}));

// Mock analytics
vi.mock('@paynless/analytics-client', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

// Keep refs to mock store functions
let mockAnalyticsTrack: vi.Mock;

describe('ProfileEditor Component', () => {
  const user = userEvent.setup();

  // Helper function, props removed as component uses store
  const renderEditor = () => {
    return render(<ProfileEditor />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProfile.mockReset();
    // Reset the ACTUAL store state
    act(() => {
      useAuthStore.setState({
        ...authStoreInitialState,
        profile: { ...initialMockProfile }, // Ensure fresh copy
        error: null, // Reset error
        isLoading: false, // Reset loading
        updateProfile: mockUpdateProfile // Re-inject mock
      }, true);
    });

    // Get a reference to the mocked track function
    mockAnalyticsTrack = vi.mocked(analytics.track);
  });

  afterEach(() => {
    vi.clearAllMocks(); // Clear mocks between tests
  });

  it('should render initial profile data from store and form elements', () => {
    renderEditor();
    // Check values initialized from store state set in beforeEach
    expect(screen.getByPlaceholderText('Enter first name')).toHaveValue('InitialFirst');
    expect(screen.getByPlaceholderText('Enter last name')).toHaveValue('InitialLast');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('should handle null initial profile names from store', () => {
    // Set store state for this specific test
    act(() => {
      useAuthStore.setState({ 
          profile: { ...initialMockProfile, first_name: null, last_name: null } 
      });
    });
    renderEditor();
    expect(screen.getByPlaceholderText('Enter first name')).toHaveValue('');
    expect(screen.getByPlaceholderText('Enter last name')).toHaveValue('');
  });

  it('should update input fields on user typing', async () => {
    renderEditor();
    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    const lastNameInput = screen.getByPlaceholderText('Enter last name');

    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'UpdatedFirst');
    await user.clear(lastNameInput);
    await user.type(lastNameInput, 'UpdatedLast');

    expect(firstNameInput).toHaveValue('UpdatedFirst');
    expect(lastNameInput).toHaveValue('UpdatedLast');
  });

  it('should call updateProfile store action with updated values on submit', async () => {
    mockUpdateProfile.mockResolvedValue(true); // Simulate successful update
    renderEditor();
    const firstNameInput = screen.getByPlaceholderText('Enter first name');
    const lastNameInput = screen.getByPlaceholderText('Enter last name');
    const saveButton = screen.getByRole('button', { name: /save changes/i });

    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'NewFirst');
    await user.clear(lastNameInput);
    await user.type(lastNameInput, 'NewLast');
    await user.click(saveButton);

    // Simulate store setting loading state
    act(() => { useAuthStore.setState({ isLoading: true }); });
    const loadingButton = await screen.findByRole('button', { name: /saving.../i });
    expect(loadingButton).toBeDisabled();

    // Check the mock store action was called
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ 
      first_name: 'NewFirst', 
      last_name: 'NewLast' 
    });

    // Simulate end of loading state after promise resolves
    await act(async () => { await mockUpdateProfile.mock.results[0].value; });
    act(() => { useAuthStore.setState({ isLoading: false, error: null }); });

    // Check button is enabled again
    const revertedButton = await screen.findByRole('button', { name: /save changes/i });
    expect(revertedButton).toBeEnabled();
  });

  it('should disable inputs and change button text when store isLoading is true', async () => {
    renderEditor(); // Start with isLoading false
    // Simulate store setting loading state
    act(() => { useAuthStore.setState({ isLoading: true }); });

    // Wait for the button text to update
    const loadingButton = await screen.findByRole('button', { name: /saving.../i });

    // Check elements are disabled
    expect(screen.getByPlaceholderText('Enter first name')).toBeDisabled();
    expect(screen.getByPlaceholderText('Enter last name')).toBeDisabled();
    expect(loadingButton).toBeDisabled();
  });

  it('should not call updateProfile if submit is attempted while store isLoading is true', async () => {
     // Set initial loading state in the store
    act(() => { useAuthStore.setState({ isLoading: true }); });
    renderEditor(); 

    const saveButton = screen.getByRole('button', { name: /saving.../i });
    expect(saveButton).toBeDisabled(); // Verify button is disabled first

    // Try submitting the form directly (should be prevented by handler check)
    const form = saveButton.closest('form');
    if (form) {
        fireEvent.submit(form);
    }

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  
  it('should display error message when store error is set', async () => {
    const testError = new Error('Failed to save profile');
    renderEditor(); // Initial render without error

    // Simulate store setting an error
    act(() => { useAuthStore.setState({ error: testError }); });

    // Check error message is displayed
    const errorMessage = await screen.findByTestId('profile-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Failed to save profile');
  });

  it('should call analytics.track when form is submitted', async () => {
    render(<ProfileEditor />)

    const firstNameInput = screen.getByLabelText(/first name/i)
    const lastNameInput = screen.getByLabelText(/last name/i)
    const submitButton = screen.getByRole('button', { name: /save changes/i })

    // Change form values (optional, but good practice)
    await fireEvent.change(firstNameInput, { target: { value: 'Updated' } })
    await fireEvent.change(lastNameInput, { target: { value: 'Name' } })

    // Submit form
    await fireEvent.click(submitButton)

    // Assert analytics track was called BEFORE updateProfile attempt
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Profile: Submit Profile Update Form')
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1)

    // Optional: Verify updateProfile was still called afterwards
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ first_name: 'Updated', last_name: 'Name' })
    })
  })

  // Test for Basic Info tab removed as the tab is gone

}); 