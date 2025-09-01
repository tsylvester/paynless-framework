import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@paynless/store'; // Import actual store
import { RegisterForm } from './RegisterForm';

// Mock the register function that will be injected
const mockRegister = vi.fn();
const mockSubscribe = vi.fn()

// Define baseline initial state (adjust if needed)
const authStoreInitialState = {
  isLoading: false,
  error: null as Error | null,
  user: null,
  session: null,
  profile: null,
  register: mockRegister, // Inject mock function
  subscribeToNewsletter: mockSubscribe,
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
      debug: vi.fn(),
  }
}));

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
    mockSubscribe.mockReset();
    // Reset the ACTUAL store state
    act(() => {
      useAuthStore.setState({
        ...authStoreInitialState,
        register: mockRegister, // Ensure mock is injected
        subscribeToNewsletter: mockSubscribe,
      }, true);
    });
  });

  it('should render all form elements correctly', () => {
    renderRegisterForm();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /receive system notices/i})).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should update email and password fields on input', async () => {
    renderRegisterForm();
    const emailInput = screen.getByPlaceholderText('you@example.com');
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
    expect(mockSubscribe).not.toHaveBeenCalled();
    // Assert no store-related error message is shown
    expect(screen.queryByTestId('register-error-message')).not.toBeInTheDocument();
  });

  it('should call register and subscribe on successful submission when checked', async () => {
    const registerPromise = Promise.resolve({ id: 'user-new' }); // Simulate success
    mockRegister.mockReturnValue(registerPromise);

    renderRegisterForm();
    const emailInput = screen.getByPlaceholderText('you@example.com');
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });
    const subscribeCheckbox = screen.getByRole('checkbox', { name: /receive system notices/i });

    // Ensure checkbox is checked by default, or click it
    if (!subscribeCheckbox.hasAttribute('data-state') || subscribeCheckbox.getAttribute('data-state') !== 'checked') {
        await user.click(subscribeCheckbox);
    }
    expect(subscribeCheckbox).toHaveAttribute('data-state', 'checked');


    await user.type(emailInput, 'newuser@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith('newuser@test.com', 'Password!123');

    // Wait for async actions within the component to trigger
    await act(async () => {
      await registerPromise;
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith('newuser@test.com');
  });

  it('should call register but not subscribe on successful submission when unchecked', async () => {
    const registerPromise = Promise.resolve({ id: 'user-new' }); // Simulate success
    mockRegister.mockReturnValue(registerPromise);

    renderRegisterForm();
    const emailInput = screen.getByPlaceholderText('you@example.com');
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });
    const subscribeCheckbox = screen.getByRole('checkbox', { name: /receive system notices/i });

    // Uncheck the box
    await user.click(subscribeCheckbox);
    expect(subscribeCheckbox).not.toHaveAttribute('data-state', 'checked');

    await user.type(emailInput, 'anotheruser@test.com');
    await user.type(passwordInput, 'Password!456');
    await user.click(submitButton);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith('anotheruser@test.com', 'Password!456');

    // Wait for async actions
    await act(async () => {
      await registerPromise;
    });

    expect(mockSubscribe).not.toHaveBeenCalled();
  });


  it('should toggle subscribe checkbox on click', async () => {
    renderRegisterForm();
    const subscribeCheckbox = screen.getByRole('checkbox', { name: /receive system notices/i });

    // Default is checked
    expect(subscribeCheckbox).toHaveAttribute('data-state', 'checked');

    // First click, unchecks
    await user.click(subscribeCheckbox);
    expect(subscribeCheckbox).not.toHaveAttribute('data-state', 'checked');


    // Second click, re-checks
    await user.click(subscribeCheckbox);
    expect(subscribeCheckbox).toHaveAttribute('data-state', 'checked');
  });


  it('should show error message on failed registration (API error)', async () => {
    const apiErrorMsg = 'Email already exists';
    const apiError = new Error(apiErrorMsg);

    // We need to mock the implementation to simulate the store action's behavior.
    // A real store action would catch an error, update the state, and then the
    // calling promise would settle.
    mockRegister.mockImplementation(async () => {
      act(() => {
        useAuthStore.setState({ isLoading: false, error: apiError });
      });
      throw apiError;
    });


    renderRegisterForm();
    const emailInput = screen.getByPlaceholderText('you@example.com');
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(emailInput, 'existing@test.com');
    await user.type(passwordInput, 'Password!123');
    await user.click(submitButton);

    expect(mockRegister).toHaveBeenCalledTimes(1);

    // The most important assertion is that the user sees the error message.
    // `findBy` will wait for the element to appear.
    const errorMessage = await screen.findByTestId('register-error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent(apiErrorMsg);

    // And ensure the form is usable again.
    const revertedButton = await screen.findByRole('button', { name: /create account/i });
    expect(revertedButton).toBeEnabled();

    // Finally, check that side-effects like navigation or subscription did not occur.
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('should have correct link to sign in page', () => {
    renderRegisterForm();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

}); 