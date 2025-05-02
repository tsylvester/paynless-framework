import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Remove MemoryRouter import, App provides its own RouterProvider
// import { MemoryRouter } from 'react-router-dom'; 
import App from '../../App';
import * as PaynlessStore from '@paynless/store';
import { useAuthStore, useSubscriptionStore } from '@paynless/store';
import type { AuthStore, SubscriptionStore } from '@paynless/types';
import { createMockAuthStore } from '@/tests/utils/mocks/stores';

// --- Mocks ---

// Mock child components rendered by AppContent
vi.mock('../../components/layout/Header', () => ({ Header: () => <div>Mock Header</div> }));
vi.mock('../../components/layout/Footer', () => ({ Footer: () => <div>Mock Footer</div> }));
vi.mock('../../components/integrations/ChatwootIntegration', () => ({ ChatwootIntegration: () => <div>Mock Chatwoot</div> }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => <div data-testid="mock-toaster">Mock Toaster</div> }));

// --- Test Suite ---
describe('App Component', () => {
    let mockAuthStoreInstance: ReturnType<typeof createMockAuthStore>;
    let authStoreSpy: ReturnType<typeof vi.spyOn> | undefined;
    let subscriptionStoreSpy: ReturnType<typeof vi.spyOn> | undefined;

    beforeEach(() => {
        vi.resetAllMocks(); 

        // Reset global mocks
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({ 
            matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
        })));
        
        // Keep subscription store mock simple for now (if needed)
        const mockSetTestModeFn = vi.fn(); 
        subscriptionStoreSpy = vi.spyOn(PaynlessStore, 'useSubscriptionStore').mockImplementation(<S,>(selector?: (state: SubscriptionStore) => S): S | SubscriptionStore => {
            const state: SubscriptionStore = {
                isTestMode: false,
                setTestMode: mockSetTestModeFn,
            };
            if (typeof selector === 'function') {
                return selector(state);
            }
            return state;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        authStoreSpy = undefined;
        subscriptionStoreSpy = undefined;
    });

    it('should render Header and Footer when not loading', async () => {
        // Create mock auth store instance with isLoading: false
        mockAuthStoreInstance = createMockAuthStore({ isLoading: false, user: null, session: null });

        // Spy on useAuthStore to return state from our instance
        authStoreSpy = vi.spyOn(PaynlessStore, 'useAuthStore').mockImplementation(<S,>(selector?: (state: AuthStore) => S): S | AuthStore => {
            const state = mockAuthStoreInstance.getState();
            return selector ? selector(state) : state;
        });

        await act(async () => {
            render(<App />);
        });

        // Wait for the main content (e.g., Mock Header) to appear
        expect(await screen.findByText('Mock Header')).toBeInTheDocument();
        
        // Assert the rest
        expect(screen.getByText('Mock Footer')).toBeInTheDocument();
        expect(screen.getByText('Mock Chatwoot')).toBeInTheDocument();
        expect(screen.getByTestId('mock-toaster')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument(); // Spinner should be gone
    });

    it('should render loading spinner when auth is loading', async () => { 
        // Create mock auth store instance with isLoading: true
        mockAuthStoreInstance = createMockAuthStore({ isLoading: true, user: null, session: null });

        // Spy on useAuthStore to return state from our instance
        authStoreSpy = vi.spyOn(PaynlessStore, 'useAuthStore').mockImplementation(<S,>(selector?: (state: AuthStore) => S): S | AuthStore => {
            const state = mockAuthStoreInstance.getState();
            return selector ? selector(state) : state;
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
