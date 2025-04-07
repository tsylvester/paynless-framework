import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { useAuthStore } from '@paynless/store';

// Mock the auth store
vi.mock('@paynless/store', async (importOriginal) => {
    const original = await importOriginal<typeof import('@paynless/store')>();
    // Mock the specific hook/state needed by App
    return {
        ...original,
        useAuthStore: vi.fn().mockReturnValue({
            user: null,
            session: null,
            isLoading: false,
            initialize: vi.fn().mockResolvedValue(undefined),
        }),
    };
});

// Mock child components to isolate App logic if needed
// Assume named exports for these components
vi.mock('./components/layout/Header', () => ({ Header: () => <div>Mock Header</div> }));
vi.mock('./components/layout/Footer', () => ({ Footer: () => <div>Mock Footer</div> }));
// Remove the AppRoutes mock
// vi.mock('./routes/AppRoutes', () => ({ default: () => <div>Mock App Routes</div> }));

describe('App Component', () => {
    // Rename test and update assertion
    it('should render Header, Footer, and LoginPage when logged out', () => {
        // Ensure user is logged out for this test case
        (useAuthStore as vi.Mock).mockReturnValue({
            user: null,
            session: null,
            isLoading: false,
            initialize: vi.fn(),
        });

        render(<App />); 

        expect(screen.getByText('Mock Header')).toBeInTheDocument();
        // Check for text specific to the LoginPage
        expect(screen.getByText('Welcome Back')).toBeInTheDocument(); 
        expect(screen.getByText('Mock Footer')).toBeInTheDocument();
    });

    it('should call authStore.initialize on mount', () => {
        const initializeMock = vi.fn().mockResolvedValue(undefined);
        (useAuthStore as vi.Mock).mockReturnValue({
            user: null,
            session: null,
            isLoading: false,
            initialize: initializeMock,
        });
        
        render(<App />);

        expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    // TODO: Add tests for loading state if App shows a loader
    // TODO: Add tests for different auth states if App renders differently
}); 