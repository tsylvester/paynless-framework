import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { LoginPage } from '../../pages/Login';

// Mock the LoginForm component to isolate the LoginPage test
vi.mock('../components/auth/LoginForm', () => ({
  LoginForm: () => (
    <div>
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      <button>Log In</button>
    </div>
  ),
}));

// Mock the Layout component (optional, but can simplify)
// Alternatively, ensure Layout dependencies like authStore are mocked if needed
vi.mock('../components/layout/Layout', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Layout: ({ children }: { children: any }) => <div data-testid="layout">{children}</div>,
}));


describe('LoginPage Component', () => {
  const renderLoginPage = () => {
    return render(
      <BrowserRouter> 
        <LoginPage />
      </BrowserRouter>
    );
  };

  it('should render without crashing', () => {
    renderLoginPage();
    // Check if the mocked Layout is present
    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });

  it('should render the LoginForm component', () => {
    renderLoginPage();
    // Check for elements known to be in the mocked LoginForm
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

}); 