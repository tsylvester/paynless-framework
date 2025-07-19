import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@paynless/store';
import { type AuthStore } from '@paynless/types';
import { LoginForm } from './LoginForm';

const mockLogin = vi.fn();
const mockHandleOAuthLogin = vi.fn();
const mockNavigate = vi.fn();

// Mock the store module
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore, 
  };
});

// Mock react-router-dom parts
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} role="link" {...props}>{children}</a>,
  };
});

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
  }
}));

describe('LoginForm Component', () => {
  const user = userEvent.setup();

  const renderLoginForm = (props = {}) => {
    return render(
      <BrowserRouter>
        <LoginForm {...props} />
      </BrowserRouter>
    );
  };

  const getInitialState = (): Partial<AuthStore> => ({
    isLoading: false,
    error: null,
    user: null,
    login: mockLogin,
    handleOAuthLogin: mockHandleOAuthLogin,
    // Ensure all functions from AuthStore are mocked or included if needed by the component
    // For example:
    register: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    updateEmail: vi.fn(),
    uploadAvatar: vi.fn(),
    fetchProfile: vi.fn(),
    checkEmailExists: vi.fn(),
    requestPasswordReset: vi.fn(),
    setUser: vi.fn(),
    setSession: vi.fn(),
    setProfile: vi.fn(),
    setIsLoading: vi.fn(),
    setError: vi.fn(),
    setNavigate: vi.fn(),
    navigate: null,
    session: null,
    profile: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockReset();
    mockHandleOAuthLogin.mockReset();
    // Reset the store state before each test
    act(() => {
      useAuthStore.setState(getInitialState(), true);
    });
  });

  it('should render all form elements correctly', () => {
    renderLoginForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('should update email and password fields on input', async () => {
    renderLoginForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    expect(emailInput).toHaveValue('test@example.com');
    expect(passwordInput).toHaveValue('password123');
  });

  it('should show error if submitting with empty fields', async () => {
    renderLoginForm();
    const form = screen.getByTestId('login-form');
    fireEvent.submit(form);
    expect(mockLogin).not.toHaveBeenCalled(); 
  });

  it('should call login and handle loading state on successful submission', async () => {
    const loginPromise = Promise.resolve(); 
    mockLogin.mockReturnValue(loginPromise);

    renderLoginForm();
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    
    // Trigger the login
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    
    // The component calls the store's login action.
    // The action itself should set isLoading to true.
    act(() => {
      useAuthStore.setState({ isLoading: true });
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');

    // Check for loading state
    const loadingButton = await screen.findByRole('button', { name: /signing in.../i });
    expect(loadingButton).toBeInTheDocument();
    expect(loadingButton).toBeDisabled();

    // Now, simulate the action completing
    act(() => {
      useAuthStore.setState({ isLoading: false });
    });
    
    await act(async () => { await loginPromise; });
    
    // Check button is enabled and text reverted
    const revertedButton = await screen.findByRole('button', { name: 'Sign in' });
    expect(revertedButton).toBeInTheDocument();
    expect(revertedButton).toBeEnabled();
  });
  
  it('should call handleOAuthLogin when the Google sign-in button is clicked', async () => {
    const googleLoginPromise = Promise.resolve();
    mockHandleOAuthLogin.mockReturnValue(googleLoginPromise);

    renderLoginForm();
    const googleButton = screen.getByRole('button', { name: /sign in with google/i });
    
    await user.click(googleButton);
    
    act(() => {
      useAuthStore.setState({ isLoading: true });
    });
    
    expect(mockHandleOAuthLogin).toHaveBeenCalledTimes(1);
    expect(mockHandleOAuthLogin).toHaveBeenCalledWith('google');

    const loadingButton = await screen.findByRole('button', { name: /signing in.../i });
    expect(loadingButton).toBeInTheDocument();
    expect(loadingButton).toBeDisabled();

    act(() => {
      useAuthStore.setState({ isLoading: false });
    });

    await act(async () => { await googleLoginPromise; });

    const revertedButton = await screen.findByRole('button', { name: 'Sign in' });
    expect(revertedButton).toBeInTheDocument();
    expect(revertedButton).toBeEnabled();
  });

  it('should show error message on failed login (invalid credentials)', async () => {
    const loginErrorMsg = 'Invalid credentials';
    const loginError = new Error(loginErrorMsg);
    mockLogin.mockRejectedValue(loginError);

    renderLoginForm();
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    
    act(() => {
      useAuthStore.setState({ isLoading: true });
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    
    // Simulate store setting error after promise rejection
    await act(async () => {
      try {
        await mockLogin.mock.results[0].value;
      } catch (e) {
        useAuthStore.setState({ error: e as Error, isLoading: false });
      }
    });

    expect(await screen.findByTestId('login-error-message')).toHaveTextContent(loginErrorMsg);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('should show error message on API error during login', async () => {
    const apiErrorMsg = 'Network Error';
    const apiError = new Error(apiErrorMsg);
    mockLogin.mockRejectedValue(apiError);

    renderLoginForm();

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    act(() => {
      useAuthStore.setState({ isLoading: true });
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      try {
        await mockLogin.mock.results[0].value;
      } catch (e) {
        useAuthStore.setState({ error: e as Error, isLoading: false });
      }
    });

    expect(await screen.findByTestId('login-error-message')).toHaveTextContent(apiErrorMsg);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('should disable inputs and button while loading', async () => {
    renderLoginForm();

    act(() => {
      useAuthStore.setState({ isLoading: true });
    });

    expect(screen.getByRole('button', { name: /signing in.../i })).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDisabled();
  });

  it('should have correct links for forgot password and sign up', () => {
    renderLoginForm();
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
  });
}); 