import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import type { User, UserRole } from '@paynless/types';

// Define mock state that can be modified by tests
let mockAuthState: { user: Partial<User> | null; isLoading: boolean } = {
  user: null,
  isLoading: true,
};

// Mock useAuthStore AND useOrganizationStore
vi.mock('@paynless/store', () => ({
  useAuthStore: () => mockAuthState, 
  // Provide a basic mock for useOrganizationStore to satisfy dependencies
  useOrganizationStore: () => ({ 
    currentOrganizationId: null,
    selectCurrentUserRoleInOrg: () => null, // Mock any functions called
    // Add other minimal state properties if needed by downstream components
  })
}));

const LoadingComponent = () => <div>Auth Loading...</div>;
const LoginComponent = () => <div>Login Page</div>;
const RegisterComponent = () => <div>Register Page</div>;
const HomePage = () => <div>Home Page</div>;
const ProtectedContent = () => <div>Protected Content</div>;

describe('ProtectedRoute Component', () => {

  beforeEach(() => {
    // Reset state before each test
    mockAuthState = { user: null, isLoading: true };
  });

  const renderWithRouter = (initialRoute: string, allowedRoles?: UserRole[]) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route path="/register" element={<RegisterComponent />} />
          <Route path="/" element={<HomePage />} />
          <Route 
            path="/protected" 
            element={
              <ProtectedRoute allowedRoles={allowedRoles}>
                <ProtectedContent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('should show loading spinner while auth state is loading', () => {
    mockAuthState.isLoading = true;
    renderWithRouter('/protected');
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // We could add a data-testid to the loading div if needed
  });

  it('should render Login Page if not authenticated and navigating to protected route', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
    renderWithRouter('/protected');
    
    // Expect the content of the redirected route
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render Login Page if not authenticated and already on login page (no redirect)', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
    renderWithRouter('/login'); // Start on the login page
    
    // Should just render the login page directly
    expect(screen.getByText('Login Page')).toBeInTheDocument(); 
  });

  it('should render Register Page if not authenticated and already on register page (no redirect)', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
    renderWithRouter('/register'); // Start on the register page
    
    // Should just render the register page directly
    expect(screen.getByText('Register Page')).toBeInTheDocument(); 
  });

  it('should render Home Page if user role is not allowed', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = { id: 'user-1', role: 'user' }; // User role
    renderWithRouter('/protected', ['admin']); // Only admin allowed
    
    // Expect the content of the redirected route
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children if user exists and no roles are specified', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = { id: 'user-1', role: 'user' };
    renderWithRouter('/protected'); // No allowedRoles specified
    
    // Expect protected content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });

  it('should render children if user exists and role is allowed', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = { id: 'user-1', role: 'admin' }; // Admin user
    renderWithRouter('/protected', ['admin']); // Admin allowed
    
    // Expect protected content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });
  
    it('should render children if user exists and role is one of the allowed roles', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = { id: 'user-1', role: 'user' }; // User role
    renderWithRouter('/protected', ['admin', 'user']); // Both allowed
    
    // Expect protected content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });

}); 