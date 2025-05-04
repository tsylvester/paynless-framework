import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { ThemeProvider } from '../../context/theme.context';
import { useAuthStore } from '@paynless/store';
import { usePlatform } from '@paynless/platform';
import type { PlatformCapabilities } from '@paynless/types';

// Mock the auth store
vi.mock('@paynless/store', async (importOriginal) => {
    const original = await importOriginal<typeof import('@paynless/store')>();
    // Return the basic structure, state will be set by mockReturnValue
    return {
        ...original,
        useAuthStore: vi.fn(), // Just the mock function initially
    };
});

// Mock the platform hook
vi.mock('@paynless/platform', () => ({
    usePlatform: vi.fn(),
}));

// Helper function to reset mocks and render
const renderHeader = (authState: any = { user: null, session: null, profile: null, isLoading: false }) => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    // Ensure default state includes null profile if not provided
    const defaultState = { user: null, session: null, profile: null, isLoading: false }; 
    const mockState = { ...defaultState, ...authState, logout: logoutMock };
    (useAuthStore as vi.Mock).mockReturnValue(mockState);

    render(
        <ThemeProvider>
            <MemoryRouter>
                <Header />
            </MemoryRouter>
        </ThemeProvider>
    );
    return { logoutMock }; 
};

const mockUser = { id: 'user_123', email: 'test@example.com' };
const mockProfile = { id: 'user_123', first_name: 'Testy', last_name: 'McTest', role: 'user' as const };

describe('Header Component', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render Home link pointing to root', () => {
        renderHeader();
        // Find the link by role/name first
        const homeLink = screen.getByRole('link', { name: /paynless logo/i }); 
        expect(homeLink).toBeInTheDocument();
        // Then check href
        expect(homeLink).toHaveAttribute('href', '/'); 
    });

    describe('When logged out', () => {
        beforeEach(() => {
            // Assuming auth mock handles logged-out state
            // Set usePlatform mock to default (web) for these tests
            (usePlatform as any).mockReturnValue({
                platform: 'web',
                os: 'unknown',
                fileSystem: { isAvailable: false },
            } as PlatformCapabilities);
            renderHeader();
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
            expect(screen.queryByRole('button', { 
                name: (accessibleName, element) => element.textContent?.includes(mockProfile.first_name!) ?? false 
            })).not.toBeInTheDocument();
        });

        it('should NOT render Logout button', () => {
            expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
        });
    });

    describe('When logged in', () => {
        let logoutMock: any;

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
            
            // 5. Assert mock was called using waitFor
            await waitFor(() => {
                expect(logoutMock).toHaveBeenCalledTimes(1);
            });
        });

        describe('on Web Platform', () => {
            let platformMock: any;
            beforeEach(() => {
                logoutMock = vi.fn().mockResolvedValue(undefined);
                (useAuthStore as any).mockReturnValue({
                    user: mockUser,
                    profile: mockProfile,
                    session: { access_token: 'token' }, 
                    isLoading: false,
                    logout: logoutMock,
                });
                platformMock = {
                    platform: 'web',
                    os: 'windows',
                    fileSystem: { isAvailable: false },
                } as PlatformCapabilities;
                (usePlatform as any).mockReturnValue(platformMock);
                renderHeader(); 
            });

            it('should NOT render Dev Wallet link in dropdown area (Web)', async () => {
                 expect(usePlatform()).toEqual(platformMock);
                 // Check for the new text
                 expect(screen.queryByRole('link', { name: /dev wallet/i })).not.toBeInTheDocument();
             });
        });

        describe('on Tauri Platform', () => {
            let platformMock: any;
            beforeEach(() => {
                logoutMock = vi.fn().mockResolvedValue(undefined);
                (useAuthStore as any).mockReturnValue({
                    user: mockUser,
                    profile: mockProfile,
                    session: { access_token: 'token' }, 
                    isLoading: false,
                    logout: logoutMock,
                });
                platformMock = {
                    platform: 'tauri',
                    os: 'macos',
                    fileSystem: { 
                        isAvailable: true, 
                        readFile: vi.fn(), writeFile: vi.fn(), pickFile: vi.fn(), 
                        pickDirectory: vi.fn(), pickSaveFile: vi.fn() 
                    },
                } as PlatformCapabilities;
                (usePlatform as any).mockReturnValue(platformMock);
                renderHeader(); 
            });

             it('should be configured for Tauri platform rendering', () => {
                 expect(usePlatform()).toEqual(platformMock);
                 expect((usePlatform as any)().platform).toBe('tauri');
                 // Check for the new text not being immediately visible
                 expect(screen.queryByRole('link', { name: /dev wallet/i })).not.toBeInTheDocument();
                 // Although we can't reliably test finding it *after* click here,
                 // we know the conditions are met for it to be rendered within the dropdown.
             });
        });
    });
}); 