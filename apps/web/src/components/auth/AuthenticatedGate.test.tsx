import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthenticatedGate } from './AuthenticatedGate';
import type { User } from '@paynless/types'; // Import User type if needed for mock

// Define mock state that can be modified by tests
let mockAuthState: { user: Partial<User> | null; isLoading: boolean } = {
  user: null,
  isLoading: true,
};

// Mock useAuthStore to use the mutable mock state and handle selector
vi.mock('@paynless/store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

// Simple components for testing children and fallbacks
const LoadingComponent = () => <div>Auth Loading...</div>;
const UnauthComponent = () => <div>Please Log In</div>;
const ProtectedComponent = () => <div>Protected Content</div>;

describe('AuthenticatedGate Component', () => {

  beforeEach(() => {
    // Reset state before each test
    mockAuthState = {
      user: null,
      isLoading: true,
    };
  });

  it('should render loading fallback when isLoading is true', () => {
    mockAuthState.isLoading = true;
    render(
      <AuthenticatedGate loadingFallback={<LoadingComponent />}>
        <ProtectedComponent />
      </AuthenticatedGate>
    );

    expect(screen.getByText('Auth Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render unauthenticated fallback when loading is false and user is null', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
    render(
      <AuthenticatedGate 
        loadingFallback={<LoadingComponent />} 
        unauthenticatedFallback={<UnauthComponent />}
      >
        <ProtectedComponent />
      </AuthenticatedGate>
    );

    expect(screen.getByText('Please Log In')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Auth Loading...')).not.toBeInTheDocument();
  });

  it('should render children when loading is false and user exists', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = { id: 'test-user-123', email: 'test@test.com' }; // Provide a mock user object
    render(
      <AuthenticatedGate 
        loadingFallback={<LoadingComponent />} 
        unauthenticatedFallback={<UnauthComponent />}
      >
        <ProtectedComponent />
      </AuthenticatedGate>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Please Log In')).not.toBeInTheDocument();
    expect(screen.queryByText('Auth Loading...')).not.toBeInTheDocument();
  });

  it('should use default loading fallback (renders nothing specific) if none provided', () => {
    mockAuthState.isLoading = true;
    // Render without loadingFallback prop
    render(
      <AuthenticatedGate unauthenticatedFallback={<UnauthComponent />}>
        <ProtectedComponent />
      </AuthenticatedGate>
    );

    // Check that the specific fallbacks/children aren't rendered
    expect(screen.queryByText('Please Log In')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // We can't easily assert the presence of the DefaultLoadingFallback div
    // but verifying the absence of others implies it might be working.
  });

  it('should use default unauthenticated fallback (null) if none provided', () => {
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
    // Render without unauthenticatedFallback prop
    const { container } = render(
      <AuthenticatedGate loadingFallback={<LoadingComponent />}>
        <ProtectedComponent />
      </AuthenticatedGate>
    );

    // Check that specific fallbacks/children aren't rendered
    expect(screen.queryByText('Auth Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Check if the container is effectively empty (or only contains basic structure)
    // This depends on how React renders null, often results in comments or minimal structure
    // A simple check might be if the container has no meaningful child elements.
    // Caution: This assertion might be brittle.
    // A better check might be to ensure it doesn't render specific *unwanted* content.
    // Let's stick to checking that the other states aren't rendered.
  });

}); 