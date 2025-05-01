import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { LoginPage } from '../../pages/Login';

// --- Mocks ---

// ADD DIAGNOSTIC MOCK for the store FIRST
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(() => ({
    login: vi.fn(),
    isLoading: false,
    error: null,
  })),
  // Add mocks for other store hooks if Login.tsx imports them
}));

// Define the mock component 
const MockLoginForm = () => (
  <div data-testid="mock-login-form">
    <input type="email" placeholder="Email" />
    <input type="password" placeholder="Password" />
    <button>Log In</button>
  </div>
);

// Keep this mock as is for LoginForm
vi.mock('../components/auth/LoginForm', () => ({
    LoginForm: MockLoginForm, 
}));

// REMOVE Layout mock - LoginPage doesn't render it directly
// vi.mock('../components/layout/Layout', () => ({
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   Layout: ({ children }: { children: any }) => <div data-testid="layout">{children}</div>,
// }));

describe('LoginPage Component', () => {
  const renderLoginPage = () => {
    return render(
      <BrowserRouter> 
        <LoginPage />
      </BrowserRouter>
    );
  };

  it('should render the LoginForm component', () => {
    renderLoginPage();
    // Check if the mocked LoginForm is present (using its test ID)
    expect(screen.getByTestId('mock-login-form')).toBeInTheDocument();
    // Remove layout check
    // expect(screen.getByTestId('layout')).toBeInTheDocument(); 
  });

  // Renamed previous first test, keep this focused on mocked elements
  it('should render mocked form elements', () => { 
    renderLoginPage();
    // Check for elements known to be in the mocked LoginForm
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

}); 