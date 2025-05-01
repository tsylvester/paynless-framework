import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
// Remove MemoryRouter import, App provides its own RouterProvider
// import { MemoryRouter } from 'react-router-dom'; 
import App from '../../App';
// Keep imports commented out for now, will import after mock
// import { useAuthStore, useSubscriptionStore } from '@paynless/store';

// --- Mocks ---

// Simpler global mock for the store module
vi.mock('@paynless/store', () => ({
    useAuthStore: vi.fn(),
    useSubscriptionStore: vi.fn(),
}));

// Now import the mocked hooks
import { useAuthStore, useSubscriptionStore } from '@paynless/store';

// Mock child components rendered by AppContent
vi.mock('../../components/layout/Header', () => ({ Header: () => <div>Mock Header</div> }));
vi.mock('../../components/layout/Footer', () => ({ Footer: () => <div>Mock Footer</div> }));
vi.mock('../../components/integrations/ChatwootIntegration', () => ({ ChatwootIntegration: () => <div>Mock Chatwoot</div> }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => <div data-testid="mock-toaster">Mock Toaster</div> }));

// --- Test Suite ---
describe('App Component', () => {

    beforeEach(() => {
        // Reset all mocks including the store hooks
        vi.resetAllMocks(); 

        // Reset global mocks
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({ 
            matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
        })));

        // No default store config needed here, will be set in each test
    });

    it('should render Header and Footer when not loading', async () => {
        // Configure mocks specifically for this test
        const mockSetNavigateFn = vi.fn();
        // Use vi.mocked directly on the imported hooks
        vi.mocked(useAuthStore).mockReturnValue({
            user: null, session: null, isLoading: false, initialize: vi.fn(), setNavigate: mockSetNavigateFn 
        });

        const mockSetTestModeFn = vi.fn(); 
        // Use `any` for state and selector types for simplicity in mock
        vi.mocked(useSubscriptionStore).mockImplementation((selector?: (state: any) => any) => {
            const state: any = { 
                setTestMode: mockSetTestModeFn, 
                isTestMode: false 
            };
            if (typeof selector === 'function') {
                // Handle selector for setTestMode if needed by AppContent
                if (selector.toString().includes('state.setTestMode')) return mockSetTestModeFn;
                return selector(state); 
            }
            return state;
        });

        await act(async () => {
            render(<App />);
        });

        // Explicitly wait for the loading spinner to disappear
        await waitFor(() => {
           expect(screen.queryByRole('status')).not.toBeInTheDocument();
        });

        // Now that the spinner is gone, check for the main content synchronously
        expect(screen.getByText('Mock Header')).toBeInTheDocument();
        expect(screen.getByText('Mock Footer')).toBeInTheDocument();
        expect(screen.getByText('Mock Chatwoot')).toBeInTheDocument();
        expect(screen.getByTestId('mock-toaster')).toBeInTheDocument();
    });

    it('should render loading spinner when auth is loading', async () => { 
        // Configure mocks specifically for this test
        vi.mocked(useAuthStore).mockReturnValue({
            user: null, session: null, isLoading: true, initialize: vi.fn(), setNavigate: vi.fn() 
        });

        const mockSetTestModeFn = vi.fn(); 
        // Use `any` for state and selector types for simplicity in mock
        vi.mocked(useSubscriptionStore).mockImplementation((selector?: (state: any) => any) => {
            const state: any = { 
                setTestMode: mockSetTestModeFn, 
                isTestMode: false 
            };
            if (typeof selector === 'function') {
                // Handle selector for setTestMode if needed by AppContent
                if (selector.toString().includes('state.setTestMode')) return mockSetTestModeFn;
                return selector(state); 
            }
            return state;
        });

        await act(async () => {
          render(<App />);
        });

        // Assertions
        expect(await screen.findByRole('status')).toBeInTheDocument(); 
        expect(screen.queryByText('Mock Header')).not.toBeInTheDocument();
        expect(screen.queryByText('Mock Footer')).not.toBeInTheDocument();
    });

});
