import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';
import { useAuthStore } from '@paynless/store';

// Mock the auth store
vi.mock('@paynless/store', async (importOriginal) => {
    const original = await importOriginal<typeof import('@paynless/store')>();
    // Return the basic structure, state will be set by mockReturnValue
    return {
        ...original,
        useAuthStore: vi.fn(), // Just the mock function initially
    };
});

// Helper function to reset mocks and render
const renderHeader = (authState: any = { user: null, session: null, profile: null, isLoading: false }) => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    // Ensure default state includes null profile if not provided
    const defaultState = { user: null, session: null, profile: null, isLoading: false }; 
    const mockState = { ...defaultState, ...authState, logout: logoutMock };
    (useAuthStore as vi.Mock).mockReturnValue(mockState);

    render(
        <MemoryRouter>
            <Header />
        </MemoryRouter>
    );
    return { logoutMock }; 
};

describe('Header Component', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render Home link pointing to root', () => {
        renderHeader();
        // Find the link by its href attribute, as the SVG icon gives it no default accessible name.
        // Note: The link destination is always "/", redirection logic based on auth state
        // likely occurs elsewhere (e.g., in AppRoutes).
        const homeLink = screen.getByRole('link', { name: '' }); // Still has no accessible name from SVG
        expect(homeLink).toBeInTheDocument();
        expect(homeLink).toHaveAttribute('href', '/');
        // We could also check if it contains an SVG element if needed for more specificity
        // expect(homeLink.querySelector('svg.lucide-home')).toBeInTheDocument(); 
    });

    describe('When logged out', () => {
        beforeEach(() => {
            renderHeader({ user: null, session: null, isLoading: false });
        });

        it('should render Login link', async () => {
            await waitFor(() => {
                expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
            });
        });

        it('should render Register link', async () => {
            await waitFor(() => {
                expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
            });
        });

        it('should NOT render Dashboard link', async () => {
            await waitFor(() => {
                expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
            });
        });

        it('should NOT render user menu button', () => {
            // Ensure the button identifiable by the user's name is not present
            expect(screen.queryByRole('button', { 
                name: (accessibleName, element) => element.textContent?.includes('Testy') ?? false 
            })).not.toBeInTheDocument();
        });

        it('should NOT render Logout button', () => {
            expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
        });
    });

    describe('When logged in', () => {
        const mockUser = { id: 'user_123', email: 'test@example.com' };
        const mockProfile = { id: 'user_123', first_name: 'Testy', last_name: 'McTest', role: 'user', avatarUrl: null }; // Define mock profile
        let logoutMock: vi.Mock;

        beforeEach(() => {
            // Pass user AND profile to the mock state
            const mocks = renderHeader({ 
                user: mockUser, 
                profile: mockProfile, // Add profile here
                session: { access_token: 'token' }, 
                isLoading: false 
            });
            logoutMock = mocks.logoutMock;
        });

        it('should NOT render Login link', () => {
            expect(screen.queryByRole('link', { name: /login/i })).not.toBeInTheDocument();
        });

        it('should NOT render Register link', () => {
            expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument();
        });

        it('should render Dashboard link', () => {
             expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
        });

        it('should render user menu button', () => {
            // Find the button by checking its text content (using profile first name)
            expect(screen.getByRole('button', { 
                name: (accessibleName, element) => element.textContent?.includes(mockProfile.first_name) ?? false 
            })).toBeInTheDocument(); 
        });

        it('should show dropdown and call authStore.logout when Logout button is clicked', async () => {
            // 1. Find and click the user menu button using text content check (using profile first name)
            const userMenuButton = screen.getByRole('button', { 
                name: (accessibleName, element) => element.textContent?.includes(mockProfile.first_name) ?? false 
            });
            await fireEvent.click(userMenuButton);

            // 2. Verify dropdown links are now visible
            expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
            expect(screen.getByRole('link', { name: /subscription/i })).toBeInTheDocument();

            // 3. Find the logout button (also visible in the dropdown)
            const logoutButton = screen.getByRole('button', { name: /logout/i });
            expect(logoutButton).toBeInTheDocument();

            // 4. Click logout
            await fireEvent.click(logoutButton);
            
            // 5. Assert mock was called
            expect(logoutMock).toHaveBeenCalledTimes(1);
        });
    });
}); 