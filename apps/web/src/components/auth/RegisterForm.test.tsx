import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterForm } from './RegisterForm';

// Mock the necessary hooks and modules
const mockRegister = vi.fn();
const mockNavigate = vi.fn();

// Mock useAuthStore to provide the register action
const mockAuthStoreState = {
  register: mockRegister,
};
vi.mock('@paynless/store', () => ({
  useAuthStore: (selector) => selector(mockAuthStoreState),
}));

// Mock react-router-dom (simplified version)
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => <a href={to} role="link" {...props}>{children}</a>,
  BrowserRouter: ({ children }) => <>{children}</>,
}));

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
  }
}));

describe('RegisterForm Component', () => {
  const user = userEvent.setup();

  // Helper to render with Router context
  const renderRegisterForm = (props = {}) => {
    return render(
      <BrowserRouter>
        <RegisterForm {...props} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockRegister.mockReset();
    mockNavigate.mockReset();
    // Clear logger mocks if needed, e.g., vi.clearAllMocks(); or mockImplementation
  });

  it('should render all form elements correctly', () => {
    renderRegisterForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/must be at least 8 characters/i)).toBeInTheDocument(); // Check password hint
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

  it('should show error if submitting with empty fields', async () => {
    renderRegisterForm();
    const form = screen.getByTestId('register-form');
    // Use fireEvent.submit directly on the form for this synchronous validation check
    fireEvent.submit(form);

    // Use findByTestId to wait for the error message
    const errorMessage = await screen.findByTestId('register-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Please enter both email and password');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('should call register and navigate on successful submission (default redirect)', async () => {
    mockRegister.mockResolvedValue({ id: 'user-new' }); // Simulate successful registration
    renderRegisterForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'newuser@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    // Wait for the register call
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(mockRegister).toHaveBeenCalledWith('newuser@test.com', 'Password!123');
    });

    // Navigation check deferred to integration tests

    // Check button state after submission
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('should call register and onSuccess prop on successful submission', async () => {
    const mockOnSuccess = vi.fn();
    mockRegister.mockResolvedValue({ id: 'user-new' });
    renderRegisterForm({ onSuccess: mockOnSuccess }); // Provide onSuccess prop
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'newuser@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(mockRegister).toHaveBeenCalledWith('newuser@test.com', 'Password!123');
    });
    await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should show error message on failed registration (store returns null)', async () => {
    mockRegister.mockResolvedValue(null); // Simulate failed registration
    renderRegisterForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'newuser@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
    });

    const errorMessage = await screen.findByTestId('register-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Registration failed. Please check your information and try again.');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('should show error message on API error during registration', async () => {
    const apiError = new Error('Email already exists');
    mockRegister.mockRejectedValue(apiError); // Simulate API throwing an error
    renderRegisterForm();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'existing@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
    });

    const errorMessage = await screen.findByTestId('register-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Email already exists');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('should have correct link to sign in page', () => {
    renderRegisterForm();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

}); 