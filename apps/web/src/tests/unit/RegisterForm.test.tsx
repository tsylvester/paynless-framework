import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '@paynless/store'; // Import actual store
import { RegisterForm } from './RegisterForm';
import { analytics } from '@paynless/analytics-client';
import { render as sharedRender } from '@/tests/utils/render'; // Use the shared render util

// Mock the register function that will be injected
const mockRegister = vi.fn();

// Define baseline initial state (adjust if needed)
const authStoreInitialState = {
  isLoading: false,
  error: null as Error | null,
  user: null,
  session: null,
  profile: null,
  register: mockRegister, // Inject mock function
  // Add other state/actions as needed from actual store
  login: vi.fn(), 
  logout: vi.fn(),
  initialize: vi.fn(),
  refreshSession: vi.fn(),
  updateProfile: vi.fn(),
  setUser: vi.fn(),
  setSession: vi.fn(),
  setProfile: vi.fn(),
  setIsLoading: vi.fn(), // We'll use direct setState instead
  setError: vi.fn(),     // We'll use direct setState instead
};


// Mock the store module BUT use the actual hook implementation
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore, // Use the real hook
  };
});

// Mock react-router-dom (useNavigate is needed if register action navigates)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual, 
    useNavigate: () => mockNavigate,
    Link: ({ to, children, ...props }) => <a href={to} role="link" {...props}>{children}</a>,
  };
});

// Mock logger
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
let mockRegister: vi.Mock;
let mockAnalyticsTrack: vi.Mock;

describe('RegisterForm Component', () => {
  const user = userEvent.setup();

  const renderRegisterForm = (props = {}) => {
    return render(
      <BrowserRouter>
        <RegisterForm {...props} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockReset();
    mockNavigate.mockReset();
    // Reset the ACTUAL store state
    act(() => {
      useAuthStore.setState({
        ...authStoreInitialState,
        register: mockRegister // Ensure mock is injected
      }, true);
    });

    // Provide fresh mock impls for each test
    mockRegister = vi.fn().mockResolvedValue(null); // Default to resolving successfully
    vi.mocked(useAuthStore).mockReturnValue({
      register: mockRegister,
      isLoading: false,
      error: null,
      // Add other necessary state/functions if RegisterForm uses them
      user: null,
      session: null,
      profile: null,
      setNavigate: vi.fn(),
      setUser: vi.fn(),
      setSession: vi.fn(),
      setProfile: vi.fn(),
      setIsLoading: vi.fn(),
      setError: vi.fn(),
      logout: vi.fn(),
      initialize: vi.fn(),
      refreshSession: vi.fn(),
      updateProfile: vi.fn(),
      login: vi.fn(), // Add login mock if needed by other parts
    });

    // Get a reference to the mocked track function
    mockAnalyticsTrack = vi.mocked(analytics.track);
  });

  afterEach(() => {
    vi.clearAllMocks(); // Clear mocks between tests
  });

  it('should render all form elements correctly', () => {
    renderRegisterForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should update email and password fields on input', async () => {
    renderRegisterForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'newuser@test.com');
    await user.type(passwordInput, 'Password!123');

    expect(emailInput).toHaveValue('newuser@test.com');
    expect(passwordInput).toHaveValue('Password!123');
  });

  it('should not call register if submitting with empty fields', async () => {
    renderRegisterForm();
    const form = screen.getByTestId('register-form');
    fireEvent.submit(form);

    // Assert store action was not called
    expect(mockRegister).not.toHaveBeenCalled();
    // Assert no store-related error message is shown
    expect(screen.queryByTestId('register-error-message')).not.toBeInTheDocument(); 
  });

  it('should call register and handle loading state on successful submission', async () => {
    const registerPromise = Promise.resolve({ id: 'user-new' }); // Simulate success
    mockRegister.mockReturnValue(registerPromise);
    
    renderRegisterForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'newuser@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith('newuser@test.com', 'Password!123');

    // Simulate loading state triggered by the (mocked) register action
    act(() => { useAuthStore.setState({ isLoading: true }); });

    // Check for loading state
    const loadingButton = await screen.findByRole('button', { name: /creating account.../i });
    expect(loadingButton).toBeInTheDocument();
    expect(loadingButton).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();

    // Wait for the promise to resolve
    await act(async () => { await registerPromise; });

    // Simulate end of loading state
    act(() => { useAuthStore.setState({ isLoading: false, error: null }); });

    // Check button is enabled and text reverted
    const revertedButton = await screen.findByRole('button', { name: /create account/i });
    expect(revertedButton).toBeEnabled();

    // Navigation should be handled by the store action, not asserted here directly unless needed.
  });

  it('should show error message on failed registration (API error)', async () => {
    const apiErrorMsg = 'Email already exists';
    const apiError = new Error(apiErrorMsg);
    const registerPromise = Promise.reject(apiError);
    mockRegister.mockReturnValue(registerPromise);

    renderRegisterForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'existing@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Simulate loading state
    act(() => { useAuthStore.setState({ isLoading: true }); });
    await screen.findByRole('button', { name: /creating account.../i });

    // Await promise rejection and simulate store update
    try {
      await registerPromise;
    } catch (e) {
      expect(e).toEqual(apiError);
      act(() => {
        useAuthStore.setState({ isLoading: false, error: e as Error }); 
      });
    }

    // Check for error message display
    const errorMessage = await screen.findByTestId('register-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent(apiErrorMsg);
    expect(mockNavigate).not.toHaveBeenCalled();

    // Check button reverted
    const revertedButton = await screen.findByRole('button', { name: /create account/i });
    expect(revertedButton).toBeEnabled();
  });

  it('should have correct link to sign in page', () => {
    renderRegisterForm();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('should call analytics.track when the "Sign in" link is clicked', async () => {
    render(<RegisterForm />, { wrapper: BrowserRouter }); // Ensure router context
    
    const signInLink = screen.getByRole('link', { name: /sign in/i });

    // Click the link
    await fireEvent.click(signInLink);

    // Assert analytics track was called
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Auth: Clicked Login Link');
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
  });

  it('should call analytics.track when form is submitted', async () => {
    render(<RegisterForm />)
    
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    // Fill form
    await fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    await fireEvent.change(passwordInput, { target: { value: 'password123' } })

    // Submit form
    await fireEvent.click(submitButton)

    // Assert analytics track was called BEFORE register attempt
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Auth: Submit Register Form')
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1)

    // Optional: Verify register was still called afterwards
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('test@example.com', 'password123')
    })
  })
}); 