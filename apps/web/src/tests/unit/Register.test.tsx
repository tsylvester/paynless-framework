import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { RegisterPage } from './Register';

// Mock the RegisterForm component to isolate the RegisterPage test
vi.mock('../components/auth/RegisterForm', () => ({
  RegisterForm: () => (
    <div>
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      <input type="password" placeholder="Confirm Password" />
      <button>Register</button>
    </div>
  ),
}));

// Mock the Layout component
vi.mock('../components/layout/Layout', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Layout: ({ children }: { children: any }) => <div data-testid="layout">{children}</div>,
}));


describe('RegisterPage Component', () => {
  const renderRegisterPage = () => {
    return render(
      <BrowserRouter> 
        <RegisterPage />
      </BrowserRouter>
    );
  };

  it('should render without crashing', () => {
    renderRegisterPage();
    // Check if the mocked Layout is present
    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });

  it('should render the RegisterForm component', () => {
    renderRegisterPage();
    // Check for elements known to be in the mocked RegisterForm
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

}); 