import React from 'react'; // Add React import for JSX
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Header } from '../../components/layout/Header';
import { useAuthStore } from '@paynless/store';
import { analytics } from '@paynless/analytics-client';
import { render } from '../utils/render';
import { themes, getDarkTheme } from '../../config/themes'; // Import theme config if needed for mock
import { useTheme } from '../../hooks/useTheme'; // Import the actual hook type/signature if needed for mocking
import type { ColorMode, ThemeState } from '@paynless/types'; // Import ColorMode and ThemeState types

// Mock the useTheme hook
const mockSetColorMode = vi.fn();
const mockSetTheme = vi.fn();
// Define default value with explicit types
const defaultThemeMockValue: ThemeState = {
  colorMode: 'light', // Use literal type
  currentTheme: themes['light'],
  setColorMode: mockSetColorMode,
  setTheme: mockSetTheme,
};
vi.mock('../../hooks/useTheme', () => ({
  // Provide a baseline mock implementation
  useTheme: vi.fn(() => defaultThemeMockValue),
}));

// Mock react-router-dom (Diagnostic Link Mock)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/' }),
  // Revert Link mock to render an anchor tag, using simple spread
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: any }) => {
    return (
      <a href={to} {...props}> 
        {children}
      </a>
    );
  },
}));

// Mock the auth store
vi.mock('@paynless/store', async (importOriginal) => {
    const original = await importOriginal<typeof import('@paynless/store')>();
    // Return the basic structure, state will be set by mockReturnValue
    return {
        ...original,
        useAuthStore: vi.fn(), // Just the mock function initially
    };
});

// Keep a reference to the mock logout function accessible in tests
let logoutMock: vi.Mock;

// Helper function for window.matchMedia mock
const createMatchMedia = (width: number) => {
  return (query: string): MediaQueryList => {
    const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);

    let matches = false;
    // Simulate screen smaller than Tailwind sm breakpoint (640px)
    if (maxWidthMatch && width <= parseInt(maxWidthMatch[1], 10)) {
      matches = true;
    } else if (minWidthMatch && width >= parseInt(minWidthMatch[1], 10)) {
       // This mock treats anything >= 640 as "not small"
       // Check if query min-width is less than current width
      matches = parseInt(minWidthMatch[1], 10) <= width;
    } else if (query.includes('prefers-color-scheme: dark')) {
        // Respect prefers-color-scheme for theme provider init if needed
        // Forcing false here unless specifically testing dark mode preference
        matches = false;
    }

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList; // Use type assertion
  };
};

describe('Header Component', () => {
    beforeEach(() => {
        // Reset the mock before each test
        logoutMock = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render Home link pointing to root', () => {
        // Setup mock state for this specific test (logged out)
        const defaultState = { user: null, session: null, profile: null, isLoading: false, logout: logoutMock };
        (useAuthStore as vi.Mock).mockReturnValue(defaultState);
        
        render(<Header />);
        
        // --- Use getByRole to find the home link based on its href --- 
        // Since the mock renders <a>, role 'link' applies.
        // The link only contains an SVG, so it has no accessible name by default.
        // We could target by href, but getByRole is often preferred.
        // Let's find the link with href="/"
        const homeLinks = screen.getAllByRole('link'); // Get all links
        const homeLink = homeLinks.find(link => link.getAttribute('href') === '/');

        expect(homeLink).toBeInTheDocument(); // Check if the link was found
        expect(homeLink).toHaveAttribute('href', '/');
        // Optional: Check if it contains the SVG icon (might be fragile depending on mock)
        // Check if the link element contains an SVG child
        expect(homeLink?.querySelector('svg')).toBeInTheDocument(); 
    });

    describe('When logged out', () => {
        beforeEach(() => {
            // Setup mock state for this describe block
            const defaultState = { user: null, session: null, profile: null, isLoading: false, logout: logoutMock }; 
            (useAuthStore as vi.Mock).mockReturnValue(defaultState);
            
            render(<Header />);
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
            // Update the selector if needed, 'Testy' might not be present when logged out
             expect(screen.queryByRole('button', { 
                 name: (accessibleName, element) => !!element.querySelector('img[alt*="User Avatar"]') || !!element.querySelector('svg.lucide-user')
             })).not.toBeInTheDocument();
        });

        it('should NOT render Logout button', () => {
            expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
        });
    });

    describe('When logged in', () => {
        const mockUser = { id: 'user_123', email: 'test@example.com' };
        const mockProfile = { id: 'user_123', first_name: 'Testy', last_name: 'McTest', role: 'user', avatarUrl: null }; 

        beforeEach(() => {
            // Setup mock state for this describe block
            const mockState = { 
                user: mockUser, 
                profile: mockProfile, 
                session: { access_token: 'token' }, 
                isLoading: false,
                logout: logoutMock // Use the mock function defined outside
            };
            (useAuthStore as vi.Mock).mockReturnValue(mockState);
            
            render(<Header />);
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

        it('should show dropdown, contain correct links, and call authStore.logout when Logout button is clicked', async () => {
            // 1. Find and click the user menu button 
            const userMenuButton = screen.getByRole('button', {
                name: (accessibleName, element) => element.textContent?.includes(mockProfile.first_name) ?? false 
            });
            await fireEvent.click(userMenuButton);

            // 2. Verify dropdown links are now visible and have correct hrefs
            const profileLink = screen.getByRole('link', { name: /profile/i });
            const subscriptionLink = screen.getByRole('link', { name: /subscription/i });
            
            expect(profileLink).toBeInTheDocument();
            expect(profileLink).toHaveAttribute('href', '/profile'); // Added href check
            
            expect(subscriptionLink).toBeInTheDocument();
            expect(subscriptionLink).toHaveAttribute('href', '/subscription'); // Added href check

            // 3. Find the logout button (also visible in the dropdown)
            const logoutButton = screen.getByRole('button', { name: /logout/i });
            expect(logoutButton).toBeInTheDocument();

            // 5. Click logout
            await fireEvent.click(logoutButton);
            
            // 6. Assert mock was called using waitFor
            await waitFor(() => {
                expect(logoutMock).toHaveBeenCalledTimes(1);
            });
        });
        
        // New test specifically for analytics on logout
        it('should call analytics.track when Logout button is clicked', async () => {
            // 1. Find and click the user menu button 
            const userMenuButton = screen.getByRole('button', {
                name: (accessibleName, element) => element.textContent?.includes(mockProfile.first_name) ?? false 
            });
            await fireEvent.click(userMenuButton);

            // 2. Find the logout button
            const logoutButton = screen.getByRole('button', { name: /logout/i });
            expect(logoutButton).toBeInTheDocument();

            // 3. Setup analytics spy
            const trackSpy = vi.spyOn(analytics, 'track').mockImplementation(() => {});

            // 4. Click logout
            await fireEvent.click(logoutButton);
            
            // 5. Assert analytics spy
            expect(trackSpy).toHaveBeenCalledTimes(1);
            expect(trackSpy).toHaveBeenCalledWith('Auth: Clicked Logout');

            // 6. Restore spy
            trackSpy.mockRestore();
        });
    });

    describe('Theme Toggle', () => {
        // Access the mock function from the useTheme mock setup
        const setColorModeMock = mockSetColorMode; 

        beforeEach(() => {
            // Reset mocks used in this suite
            setColorModeMock.mockClear();
            // Reset useTheme mock to default before each test
            vi.mocked(useTheme).mockReturnValue(defaultThemeMockValue);
            // Default render state (logged out) - tests can override auth state if needed
            const defaultAuthState = { user: null, session: null, profile: null, isLoading: false, logout: logoutMock };
            (useAuthStore as vi.Mock).mockReturnValue(defaultAuthState);
        });
        
        // --- Light Mode Tests ---
        describe('when in light mode', () => {
            beforeEach(() => {
                // Ensure default light mode mock is active and render
                vi.mocked(useTheme).mockReturnValue(defaultThemeMockValue);
                render(<Header />); 
            });

            it('should render the theme toggle button with correct label', () => {
                expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
            });

            it('should display Moon icon', () => {
                const button = screen.getByRole('button', { name: /switch to dark mode/i });
                expect(button.querySelector('.lucide-moon')).toBeInTheDocument();
                expect(button.querySelector('.lucide-sun')).not.toBeInTheDocument();
            });
            
            it('should call setColorMode with "dark" when clicked', async () => {
                const button = screen.getByRole('button', { name: /switch to dark mode/i });
                await fireEvent.click(button);
                expect(setColorModeMock).toHaveBeenCalledTimes(1);
                expect(setColorModeMock).toHaveBeenCalledWith('dark');
            });
        });

        // --- Dark Mode Tests ---
        describe('when in dark mode', () => {
            // Define dark value with explicit types
            const darkThemeMockValue: ThemeState = {
                ...defaultThemeMockValue,
                colorMode: 'dark', // Use literal type
                currentTheme: getDarkTheme(themes['light']), 
            };

            beforeEach(() => {
                // Override useTheme mock for dark mode tests and render
                vi.mocked(useTheme).mockReturnValue(darkThemeMockValue);
                render(<Header />); 
            });

            it('should render the theme toggle button with correct label', () => {
                expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
            });

            it('should display Sun icon', () => {
                const button = screen.getByRole('button', { name: /switch to light mode/i });
                expect(button.querySelector('.lucide-sun')).toBeInTheDocument();
                expect(button.querySelector('.lucide-moon')).not.toBeInTheDocument();
            });
            
            it('should call setColorMode with "light" when clicked', async () => {
                const button = screen.getByRole('button', { name: /switch to light mode/i });
                await fireEvent.click(button);
                expect(setColorModeMock).toHaveBeenCalledTimes(1);
                expect(setColorModeMock).toHaveBeenCalledWith('light');
            });
        });
    });

    describe('Mobile Menu', () => {
        let matchMediaSpy: vi.SpyInstance;

        beforeEach(() => {
            // Mock window.matchMedia to simulate a small screen (e.g., 500px wide)
            matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(createMatchMedia(500));
            
            // Setup logged-in state for checking nav link visibility
            const mockState = { 
                user: { id: 'user_mob', email: 'mob@test.com' }, 
                profile: { id: 'user_mob', first_name: 'Mob', last_name: 'Test', role: 'user', avatarUrl: null }, 
                session: { access_token: 'token' }, 
                isLoading: false,
                logout: logoutMock
            };
            (useAuthStore as vi.Mock).mockReturnValue(mockState);

            // Reset theme mock to default light mode
            vi.mocked(useTheme).mockReturnValue(defaultThemeMockValue);
            
            render(<Header />);
        });

        afterEach(() => {
            // Restore original matchMedia implementation
            matchMediaSpy.mockRestore();
        });

        it('should display hamburger menu icon on small screens', () => {
            // Check for hamburger button
            const hamburgerButton = screen.getByRole('button', { name: /open main menu/i });
            expect(hamburgerButton).toBeInTheDocument();
            expect(hamburgerButton.querySelector('.lucide-menu')).toBeInTheDocument();

            // REMOVED check for desktop nav display style
        });

        // Test opening the menu
        it('should open mobile menu when hamburger icon is clicked', async () => {
            // Find and click the hamburger button
            const hamburgerButton = screen.getByRole('button', { name: /open main menu/i });
            await fireEvent.click(hamburgerButton);

            // Check for the close button (X icon)
            const closeButton = screen.getByRole('button', { name: /open main menu/i }); 
            expect(closeButton.querySelector('.lucide-x')).toBeInTheDocument();
            expect(closeButton.querySelector('.lucide-menu')).not.toBeInTheDocument();

            // Find the mobile menu container 
            // It's the div adjacent to the main header content, rendered when isMenuOpen is true
            // We can find it by looking for content unique to it, like the mobile chat link's parent
            // Or find the specific div using a more complex selector if needed, but let's try finding content within it.
            // A simpler way: Find the element containing the mobile-specific theme toggle button.
            const mobileMenuContainer = screen.getByRole('button', { name: /switch to dark mode/i }).closest('.sm\:hidden');
            expect(mobileMenuContainer).toBeInTheDocument(); // Ensure the container exists

            // Check for a link expected *within* the mobile menu container
            // Assert type for within
            const chatLink = within(mobileMenuContainer as HTMLElement).getByRole('link', { name: /chat/i });
            expect(chatLink).toBeInTheDocument();
            expect(chatLink).toHaveAttribute('href', '/chat');
        });

        // TODO: Add tests for closing menu, logged-out links, theme toggle within menu, etc.
    });
}); 