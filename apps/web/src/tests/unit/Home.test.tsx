import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from './Home';
import { useAuthStore } from '@paynless/store';
import React from 'react';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Mock react-router-dom Link
vi.mock('react-router-dom', () => ({
  // Keep other exports if needed, mock Link specifically
  Link: ({ to, children, ...props }: { to: string, children: React.ReactNode }) => 
    <a href={to} data-testid={`link-${to}`} {...props}>{children}</a>,
}));

vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
}));

// --- Test Suite ---
describe('HomePage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should render main heading, description, and features', () => {
    // Doesn't matter if user is logged in or out for static content
    vi.mocked(useAuthStore).mockReturnValue({ user: null });
    render(<HomePage />);
    
    expect(screen.getByText(/Welcome to the/i)).toBeInTheDocument();
    expect(screen.getByText(/Paynless Framework/i)).toBeInTheDocument();
    expect(screen.getByText(/A modern application built with React/i)).toBeInTheDocument();
    
    // Check feature titles
    expect(screen.getByText(/API-First Design/i)).toBeInTheDocument();
    expect(screen.getByText(/Supabase Backend/i)).toBeInTheDocument();
    expect(screen.getByText(/Secure Authentication/i)).toBeInTheDocument();
  });

  describe('When user is logged out', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({ user: null });
    });

    it('should render "Get Started" and "Log In" links', () => {
      render(<HomePage />);
      const getStartedLink = screen.getByTestId('link-/register');
      const logInLink = screen.getByTestId('link-/login');
      
      expect(getStartedLink).toBeInTheDocument();
      expect(getStartedLink).toHaveAttribute('href', '/register');
      expect(getStartedLink).toHaveTextContent(/Get Started/i);
      
      expect(logInLink).toBeInTheDocument();
      expect(logInLink).toHaveAttribute('href', '/login');
      expect(logInLink).toHaveTextContent(/Log In/i);
    });

    it('should NOT render "Go to Dashboard" link', () => {
      render(<HomePage />);
      expect(screen.queryByTestId('link-/dashboard')).not.toBeInTheDocument();
    });
  });

  describe('When user is logged in', () => {
    beforeEach(() => {
      // Mock a basic user object
      vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'user-123' } });
    });

    it('should render "Go to Dashboard" link', () => {
      render(<HomePage />);
      const dashboardLink = screen.getByTestId('link-/dashboard');
      
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
      expect(dashboardLink).toHaveTextContent(/Go to Dashboard/i);
    });

    it('should NOT render "Get Started" and "Log In" links', () => {
      render(<HomePage />);
      expect(screen.queryByTestId('link-/register')).not.toBeInTheDocument();
      expect(screen.queryByTestId('link-/login')).not.toBeInTheDocument();
    });
  });
}); 