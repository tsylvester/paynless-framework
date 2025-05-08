import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Mocks --- 
// Store mock MUST be hoisted
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(() => ({
    login: vi.fn(),
    isLoading: false,
    error: null,
  })),
  // Add mocks for other store hooks if Login.tsx imports them
}));

// REMOVE LoginForm mock
// const MockLoginForm = () => (...);
// vi.mock('../components/auth/LoginForm', () => ({...})); 

// Now import the component under test AFTER mocks
import { LoginPage } from '../../pages/Login';

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

  // Updated test: Check for real form elements/identifiers
  it('should render the login form container and heading', () => {
    renderLoginPage();
    // Check for the form itself using its test id
    expect(screen.getByTestId('login-form')).toBeInTheDocument(); 
    // Check for the heading within the form
    expect(screen.getByRole('heading', { name: /Welcome Back/i })).toBeInTheDocument();
  });

  // Updated test: Check for REAL form input elements
  it('should render email, password inputs, and submit button', () => { 
    renderLoginPage();
    // Check for elements using their labels or accessible roles
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    // Check placeholders if needed, using the actual ones
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument(); // Regex for bullet points
  });

}); 