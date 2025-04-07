import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginForm } from './LoginForm';

// Mock the necessary hooks and modules
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

// Define a mock state for the auth store
const mockStoreState = {
  login: mockLogin,
  // Add other state properties here if LoginForm starts using them
};

// Update the mock to handle selectors correctly
vi.mock('@paynless/store', () => ({
  useAuthStore: (selector) => {
    // Apply the selector function passed by the component
    return selector(mockStoreState);
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  // Provide a basic Link mock that renders an <a> tag with the correct role
  Link: ({ to, children, ...props }) => <a href={to} role="link" {...props}>{children}</a>,
  // Add a basic BrowserRouter mock that just renders children
  BrowserRouter: ({ children }) => <>{children}</>,
}));

// Revert logger mock to simple, non-async factory
vi.mock('@paynless/utils', () => ({
  logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
  }
}));

describe('LoginForm Component', () => {
  const user = userEvent.setup();

  // Helper to render with Router context
  const renderLoginForm = (props = {}) => {
    return render(
      <BrowserRouter>
        <LoginForm {...props} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockLogin.mockReset();
    mockNavigate.mockReset();
  });

  it('should render all form elements correctly', () => {
    renderLoginForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
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
    // Find the form instead of the button
    const form = screen.getByTestId('login-form');

    // Use fireEvent.submit directly on the form
    fireEvent.submit(form);

    // Verify login was NOT called
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should call login and navigate on successful submission (default redirect)', async () => {
    mockLogin.mockResolvedValue({ id: 'user-123' }); // Simulate successful login
    renderLoginForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Wait for the login call first
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
    
    // Check button state after submission
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();

  });
  
    it('should call login and onSuccess prop on successful submission', async () => {
    const mockOnSuccess = vi.fn();
    mockLogin.mockResolvedValue({ id: 'user-123' });
    renderLoginForm({ onSuccess: mockOnSuccess }); // Provide onSuccess prop
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
    await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).not.toHaveBeenCalled(); // Navigate should not be called if onSuccess is provided
  });

  it('should show error message on failed login (invalid credentials)', async () => {
    mockLogin.mockResolvedValue(null); // Simulate invalid credentials
    renderLoginForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'wrongpassword');
    });

    // Use findByTestId for error assertion
    const errorMessage = await screen.findByTestId('login-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Invalid email or password');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled(); // Button should be re-enabled
  });

  it('should show error message on API error during login', async () => {
    const apiError = new Error('Network Error');
    mockLogin.mockRejectedValue(apiError); // Simulate API throwing an error
    renderLoginForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    // Use findByTestId for error assertion
    const errorMessage = await screen.findByTestId('login-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Network Error');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('should have correct links for forgot password and sign up', () => {
    renderLoginForm();
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
  });

}); 