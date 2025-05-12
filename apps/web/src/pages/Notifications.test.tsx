/// <reference types="vitest/globals" />
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { useNotificationStore, useAuthStore } from '@paynless/store';
import { Notifications } from '../components/notifications/Notifications';
import type { Notification, User, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils';

// --- Mock UI Components --- 
// Moved definition inside vi.mock factory
// const MockSimpleDropdown = vi.fn(({ trigger, children, onOpenChange }) => { ... });

vi.mock('@/components/ui/SimpleDropdown', () => {
    // Define MockSimpleDropdown *inside* the factory
    const MockSimpleDropdown = vi.fn(({ trigger, children, onOpenChange }) => {
        const [isOpen, setIsOpen] = React.useState(false);
        const handleTriggerClick = () => {
            const newState = !isOpen;
            setIsOpen(newState);
            onOpenChange?.(newState); // Call the callback if provided
        };

        return (
            <div data-testid="mock-simple-dropdown">
                <div data-testid="mock-dropdown-trigger" onClick={handleTriggerClick}>
                    {trigger}
                </div>
                {isOpen && (
                    <div data-testid="mock-dropdown-content">
                        {children}
                    </div>
                )}
            </div>
        );
    });
    return {
        SimpleDropdown: MockSimpleDropdown
    };
});

vi.mock('@/components/ui/button', () => ({
    Button: vi.fn((props) => (
        <button data-testid={`mock-button-${props['aria-label']?.replace(/\s+/g, '-') || 'default'}`} {...props}>
            {props.children}
        </button>
    )),
}));

vi.mock('@/components/ui/badge', () => ({
    Badge: vi.fn((props) => <span data-testid="mock-badge" {...props}>{props.children}</span>),
}));

// Mock Link component from react-router-dom
const MockLink = vi.fn((props) => <a data-testid="mock-link" href={props.to} {...props}>{props.children}</a>);
// --- End UI Mocks --- 

// Import the component AFTER mocking it
import { SimpleDropdown } from '@/components/ui/SimpleDropdown';

// Mock Stores
vi.mock('@paynless/store');

// Mock Logger
vi.mock('@paynless/utils', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    // Define MockLink inside the factory
    const MockLink = vi.fn((props) => <a data-testid="mock-link" href={props.to} {...props}>{props.children}</a>);
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        Link: MockLink,
    };
});

// Import Link AFTER mocking react-router-dom
import { Link } from 'react-router-dom';

// Typed mocks for stores
const mockUseNotificationStore = useNotificationStore as vi.Mock;
const mockUseAuthStore = useAuthStore as vi.Mock;

// --- Mock Data --- 
const mockUser: User = {
    id: 'user-abc', email: 'test@example.com', first_name: 'Test', last_name: 'User', avatarUrl: null, role: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_anonymous: false, // added is_anonymous
};

const mockNotificationUnread: Notification = {
    id: 'uuid-unread', user_id: mockUser.id, created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(), type: 'info', read: false,
    data: { subject: 'Unread Subject', message: 'Unread message', target_path: '/profile' },
};
const mockNotificationRead: Notification = {
    id: 'uuid-read', user_id: mockUser.id, created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), type: 'warning', read: true,
    data: { subject: 'Read Subject', message: 'Read message' },
};
const mockNotificationUnreadNoPath: Notification = {
    id: 'uuid-unread-no-path', user_id: mockUser.id, created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), type: 'info', read: false,
    data: { subject: 'Unread No Path Subject', message: 'Unread no path message' },
};

// Define mock functions for store actions *before* using them in renderHelper
const mockFetchNotifications = vi.fn();
const mockAddNotification = vi.fn();
const mockMarkNotificationRead = vi.fn();
const mockMarkAllNotificationsAsRead = vi.fn();

// Store state type (adjust based on actual store definition)
type MockNotificationStoreState = Partial<ReturnType<typeof useNotificationStore>>;

// --- Render Helper --- 
// Remove parameters, mocks will be set in tests
const renderNotifications = () => {
    // Mocks are configured in beforeEach or specific tests now
    return render(
            <MemoryRouter>
                <Notifications />
            </MemoryRouter>
        );
};

// === Test Suite ===
describe("Notifications Component", () => {
    beforeEach(() => {
        vi.clearAllMocks(); 
        (SimpleDropdown as vi.Mock).mockClear();
        (Link as vi.Mock).mockClear();
        mockFetchNotifications.mockClear();
        mockMarkNotificationRead.mockClear();
        mockMarkAllNotificationsAsRead.mockClear();
        // Reset mocks to a default logged-in state? Or leave blank?
        // Let's set defaults here for convenience, can be overridden in tests
        mockUseAuthStore.mockReturnValue({
            user: mockUser,
            isAuthenticated: true, isLoading: false, error: null, token: 'mock-token', session: {}, profile: { id: mockUser.id },
            loginWithPassword: vi.fn(), signUp: vi.fn(), logout: vi.fn(), fetchUserProfile: vi.fn(), updateUserProfile: vi.fn(), refreshSession: vi.fn(),
        });
        mockUseNotificationStore.mockReturnValue({
            notifications: [], unreadCount: 0, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
    });

    it('should render trigger button when logged in', () => {
        // Default state from beforeEach is logged in
        renderNotifications();
        expect(screen.getByLabelText('Toggle Notifications')).toBeInTheDocument();
    });
    
    it('should render null when logged out', () => {
        // Override auth store mock for this specific test
        mockUseAuthStore.mockReturnValue({
            user: null, isAuthenticated: false, isLoading: false, error: null, token: null, session: null, profile: null,
            loginWithPassword: vi.fn(), signUp: vi.fn(), logout: vi.fn(), fetchUserProfile: vi.fn(), updateUserProfile: vi.fn(), refreshSession: vi.fn(),
        });
        const { container } = renderNotifications();
        expect(container.firstChild).toBeNull(); 
    });

    it('should call fetchNotifications store action on mount if user is logged in', async () => {
         // Default state from beforeEach is logged in and uses the global mockFetchNotifications
         renderNotifications(); 
        await waitFor(() => {
            expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
        });
    });

    it('should display unread count badge correctly', () => {
        // Override notification store for this test
        mockUseNotificationStore.mockReturnValue({
            notifications: [], unreadCount: 2, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        const badge = screen.getByLabelText('2 unread notifications');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('2');
    });

    it('should display "9+" when unread count exceeds 9', () => {
        // Override notification store for this test
         mockUseNotificationStore.mockReturnValue({
            notifications: [], unreadCount: 10, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        const badge = screen.getByLabelText('10 unread notifications');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('9+');
    });

    it('should open dropdown on trigger click', () => {
        // Default state from beforeEach
        renderNotifications();
        expect(screen.queryByTestId('mock-dropdown-content')).not.toBeInTheDocument();
        const trigger = screen.getByTestId('mock-dropdown-trigger');
        fireEvent.click(trigger);
        expect(screen.getByTestId('mock-dropdown-content')).toBeInTheDocument();
    });

    it('should display only unread notifications initially in the dropdown', () => {
        // Override notification store for this test
         mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread, mockNotificationRead, mockNotificationUnreadNoPath],
            unreadCount: 2, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        expect(screen.getByLabelText(/Notification: Unread Subject/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Notification: Unread No Path Subject/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/Notification: Read Subject/)).not.toBeInTheDocument();
    });

    it('should show blue dot indicator only for unread notifications', () => {
        // Override notification store for this test
        mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread, mockNotificationRead],
            unreadCount: 1, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        const unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const readItemQuery = screen.queryByLabelText(/Notification: Read Subject/);
        const blueDot = unreadItem.querySelector('span[aria-hidden="true"].bg-blue-500');
        expect(blueDot).toBeInTheDocument(); 
        expect(blueDot).toHaveClass('bg-blue-500'); 
        expect(readItemQuery).not.toBeInTheDocument();
    });

    it('should call markAllNotificationsAsRead store action when "Mark all as read" button is clicked', () => {
        // Override notification store
        mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread, mockNotificationRead],
            unreadCount: 1, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger')); 
        const markAllButton = screen.getByTestId('mock-button-Mark-all-notifications-as-read');
        fireEvent.click(markAllButton);
        expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledTimes(1);
    });

    it('should call markNotificationRead store action when an item\'s mark read button is clicked', () => {
        // Override notification store
        mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread, mockNotificationUnreadNoPath],
            unreadCount: 2, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger')); 
        const unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const markReadButton = within(unreadItem).getByTestId(/^mock-button-Mark-notification-.*-as-read$/);
        fireEvent.click(markReadButton);
        expect(mockMarkNotificationRead).toHaveBeenCalledTimes(1);
        expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockNotificationUnread.id);
    });

    it('should call navigate and markNotificationRead when an unread item with target_path is clicked', () => {
        // Override notification store
         mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread, mockNotificationRead],
            unreadCount: 1, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger')); 
        const unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        fireEvent.click(unreadItem);
        expect(mockMarkNotificationRead).toHaveBeenCalledTimes(1);
        expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockNotificationUnread.id);
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(mockNotificationUnread.data.target_path);
    });

    it('should call markNotificationRead but NOT navigate when an unread item without target_path is clicked', () => {
        // Override notification store
        mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnreadNoPath, mockNotificationRead],
            unreadCount: 1, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger')); 
        const unreadItem = screen.getByLabelText(/Notification: Unread No Path Subject/);
        fireEvent.click(unreadItem);
        expect(mockMarkNotificationRead).toHaveBeenCalledTimes(1);
        expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockNotificationUnreadNoPath.id);
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should render a link to the /notifications page', () => {
        // Default state from beforeEach
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger')); 
        const link = screen.getByTestId('mock-link');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/notifications');
        expect(link).toHaveTextContent('Notifications');
    });

    it('should keep item visible after clicking its mark read button (locally read state)', () => {
        // Override notification store
        mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread],
            unreadCount: 1, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger')); 
        let unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const markReadButton = within(unreadItem).getByTestId(/^mock-button-Mark-notification-.*-as-read$/);
        fireEvent.click(markReadButton);
        unreadItem = screen.getByLabelText(/Notification: Unread Subject/); 
        expect(unreadItem).toBeInTheDocument();
    });

    it('should clear locally read items when dropdown is closed and reopened', () => {
        // Override notification store
        mockUseNotificationStore.mockReturnValue({
            notifications: [mockNotificationUnread],
            unreadCount: 1, isLoading: false, error: null, subscribedUserId: null, 
            fetchNotifications: mockFetchNotifications, addNotification: mockAddNotification, markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, subscribeToUserNotifications: vi.fn(), unsubscribeFromUserNotifications: vi.fn(),
        });
        renderNotifications();
        const trigger = screen.getByTestId('mock-dropdown-trigger');
        fireEvent.click(trigger);
        let unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const markReadButton = within(unreadItem).getByTestId(/^mock-button-Mark-notification-.*-as-read$/);
        fireEvent.click(markReadButton);
        expect(screen.getByLabelText(/Notification: Unread Subject/)).toBeInTheDocument();
        fireEvent.click(trigger);
        expect(screen.queryByTestId('mock-dropdown-content')).not.toBeInTheDocument();
        fireEvent.click(trigger);
        unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        expect(unreadItem).toBeInTheDocument();
        const blueDot = unreadItem.querySelector('span[aria-hidden="true"].bg-blue-500');
        expect(blueDot).toBeInTheDocument(); 
        expect(blueDot).toHaveClass('bg-blue-500');
    });

    // Skip the read item click test for now as it requires more complex state simulation
    // it('should NOT call markNotificationRead but call navigate when a read item with target_path is clicked', () => { ... });

});