import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { RegisterPage } from '../../pages/Register';

// Mock the RegisterForm component to isolate the RegisterPage test
vi.mock('../../components/auth/RegisterForm', () => ({
  RegisterForm: () => (
    <div data-testid="mock-register-form">
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      {/* Keep mock simple for page test */}
      <button>Register</button>
    </div>
  ),
}));

// REMOVE Layout mock - RegisterPage doesn't render it directly
// vi.mock('../components/layout/Layout', () => ({
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   Layout: ({ children }: { children: any }) => <div data-testid="layout">{children}</div>,
// }));


describe('RegisterPage Component', () => {
  const renderRegisterPage = () => {
    return render(
      <BrowserRouter> 
        <RegisterPage />
      </BrowserRouter>
    );
  };

  it('should render the RegisterForm component', () => {
    renderRegisterPage();
    // Check if the mocked RegisterForm is present (using its test ID)
    expect(screen.getByTestId('mock-register-form')).toBeInTheDocument();
    // Remove layout check
    // expect(screen.getByTestId('layout')).toBeInTheDocument(); 
  });

  // Keep this test focused on checking elements within the mock form
  it('should render mocked form elements', () => { 
    renderRegisterPage();
    // Check for elements known to be in the mocked RegisterForm
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    // Removed 'Confirm Password' as it's not in the simplified mock
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

}); 