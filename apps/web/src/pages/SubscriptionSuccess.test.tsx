import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubscriptionSuccessPage } from './SubscriptionSuccess';
import { useAuthStore } from '@paynless/store';
import { useSubscriptionStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom'; // Use MemoryRouter

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Mock react-router-dom useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock Zustand stores - Just mock the functions exist
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useSubscriptionStore: vi.fn(), // No implementation here
}));

// Define the mock function (can be here or inside describe)
const mockRefreshSubscription = vi.fn(); 

// Helper function for rendering with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

// --- Test Suite --- 
describe('SubscriptionSuccessPage Component', () => {

  beforeEach(() => {
    vi.useFakeTimers(); 
    vi.resetAllMocks();
    
    // Default: User is logged in
    vi.mocked(useAuthStore).mockReturnValue({ id: 'user-123' }); 
    
    // Set mock implementation for useSubscriptionStore HERE
    vi.mocked(useSubscriptionStore).mockImplementation((selector) => {
      const state = {
        refreshSubscription: mockRefreshSubscription,
        // Add other state properties if the component selects them
      };
      return selector ? selector(state) : state;
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers(); 
    vi.useRealTimers(); 
  });

  it('should render success message and icon', () => {
    // Capture the render result, specifically the container
    const { container } = renderWithRouter(<SubscriptionSuccessPage />); 
    expect(screen.getByRole('heading', { name: /Thank you/i })).toBeInTheDocument();
    expect(screen.getByText(/Your subscription has been processed successfully/i)).toBeInTheDocument();
    // Use the container returned from render
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    // Optional: Check class for more specificity if needed
    // expect(icon).toHaveClass('lucide-circle-check-big');
  });

  it('should call refreshSubscription on mount if user exists', () => {
    renderWithRouter(<SubscriptionSuccessPage />);
    expect(mockRefreshSubscription).toHaveBeenCalledTimes(1);
  });

  it('should NOT call refreshSubscription on mount if user does not exist', () => {
    // Override the authStore mock for this specific test
    vi.mocked(useAuthStore).mockReturnValue(null); // No user
    renderWithRouter(<SubscriptionSuccessPage />);
    expect(mockRefreshSubscription).not.toHaveBeenCalled();
  });

  it('should automatically navigate to /subscription after 5 seconds', () => {
    renderWithRouter(<SubscriptionSuccessPage />);
    expect(mockNavigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/subscription');
  });

  it('should navigate to /subscription when "click here" button is clicked', () => {
    renderWithRouter(<SubscriptionSuccessPage />);
    const button = screen.getByRole('button', { name: /click here/i });
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/subscription');
  });
  
  it('should clear the timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { unmount } = renderWithRouter(<SubscriptionSuccessPage />);
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    clearTimeoutSpy.mockRestore(); 
  });
}); 