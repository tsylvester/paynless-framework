import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { useNotificationStore, useAuthStore } from '@paynless/store';
import { Notifications } from './Notifications';
import type { Notification, User } from '@paynless/types';
import type { NotificationState } from '@paynless/store';

// --- Mock UI Components ---
vi.mock('@/components/ui/SimpleDropdown', () => ({
    SimpleDropdown: vi.fn(({ trigger, children, onOpenChange }) => {
        const [isOpen, setIsOpen] = React.useState(false);
        const handleTriggerClick = () => {
            const newState = !isOpen;
            setIsOpen(newState);
            onOpenChange?.(newState);
        };
        return (
            <div data-testid="mock-simple-dropdown">
                <div data-testid="mock-dropdown-trigger" onClick={handleTriggerClick}>{trigger}</div>
                {isOpen && <div data-testid="mock-dropdown-content">{children}</div>}
            </div>
        );
    }),
}));

vi.mock('@/components/ui/button', () => ({
    Button: vi.fn((props) => (
        <button {...props} />
    )),
}));

vi.mock('@/components/ui/badge', () => ({
    Badge: vi.fn((props) => <span {...props} />),
}));

// --- Mock Stores & Utils ---
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        Link: vi.fn(({ to, ...props }) => <a href={to} {...props} />),
    };
});

vi.mock('@paynless/store');
vi.mock('@paynless/utils', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// --- Typed Mocks ---
const mockedUseNotificationStore = useNotificationStore as unknown as Mock;
const mockedUseAuthStore = useAuthStore as unknown as Mock;

// --- Test Data ---
const mockUser: User = { id: 'user-abc', email: 'test@example.com', role: 'user' };
const mockNotificationUnread: Notification = { id: 'uuid-unread', user_id: mockUser.id, created_at: new Date().toISOString(), type: 'info', read: false, data: { subject: 'Unread Subject', message: 'Unread message', target_path: '/profile' } };
const mockNotificationRead: Notification = { id: 'uuid-read', user_id: mockUser.id, created_at: new Date().toISOString(), type: 'warning', read: true, data: { subject: 'Read Subject', message: 'Read message' } };
const mockNotificationUnreadNoPath: Notification = { id: 'uuid-unread-no-path', user_id: mockUser.id, created_at: new Date().toISOString(), type: 'info', read: false, data: { subject: 'Unread No Path Subject', message: 'Unread no path message' } };

const renderNotifications = () => render(<MemoryRouter><Notifications /></MemoryRouter>);

describe("Notifications Component", () => {
    let mockFetchNotifications: Mock;
    let mockMarkNotificationRead: Mock;
    let mockMarkAllNotificationsAsRead: Mock;
    let mockStoreState: Partial<NotificationState>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockFetchNotifications = vi.fn();
        mockMarkNotificationRead = vi.fn();
        mockMarkAllNotificationsAsRead = vi.fn();

        mockedUseAuthStore.mockImplementation((selector: (state: { user: User | null }) => unknown) => selector({ user: mockUser }));

        mockStoreState = {
            notifications: [],
            unreadCount: 0,
            isLoading: false,
            error: null,
            subscribedUserId: null,
            fetchNotifications: mockFetchNotifications,
            addNotification: vi.fn(),
            markNotificationRead: mockMarkNotificationRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
            subscribeToUserNotifications: vi.fn(),
            unsubscribeFromUserNotifications: vi.fn(),
            handleIncomingNotification: vi.fn(),
        };
        mockedUseNotificationStore.mockReturnValue(mockStoreState);
    });

    it('should render trigger button when logged in', () => {
        renderNotifications();
        expect(screen.getByLabelText('Toggle Notifications')).toBeInTheDocument();
    });
    
    it('should render null when logged out', () => {
        mockedUseAuthStore.mockImplementation((selector: (state: { user: User | null }) => unknown) => selector({ user: null }));
        const { container } = renderNotifications();
        expect(container.firstChild).toBeNull();
    });

    it('should call fetchNotifications store action on mount if user is logged in', async () => {
        renderNotifications();
        await waitFor(() => {
            expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
        });
    });

    it('should display unread count badge correctly', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, unreadCount: 2 });
        renderNotifications();
        const badge = screen.getByLabelText('2 unread notifications');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('2');
    });

    it('should display "9+" when unread count exceeds 9', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, unreadCount: 10 });
        renderNotifications();
        const badge = screen.getByLabelText('10 unread notifications');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('9+');
    });

    it('should open dropdown on trigger click', () => {
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        expect(screen.getByTestId('mock-dropdown-content')).toBeInTheDocument();
    });

    it('should display only unread notifications initially in the dropdown', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread, mockNotificationRead, mockNotificationUnreadNoPath], unreadCount: 2 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        expect(screen.getByLabelText(/Notification: Unread Subject/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Notification: Unread No Path Subject/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/Notification: Read Subject/)).not.toBeInTheDocument();
    });

    it('should show blue dot indicator only for unread notifications', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread, mockNotificationRead], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        const unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const blueDot = unreadItem.querySelector('span[aria-hidden="true"].bg-blue-500');
        expect(blueDot).toBeInTheDocument();
    });

    it('should call markAllNotificationsAsRead store action when "Mark all as read" button is clicked', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        const markAllButton = screen.getByRole('button', { name: /Mark all notifications as read/i});
        fireEvent.click(markAllButton);
        expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledTimes(1);
    });

    it('should call markNotificationRead store action when an item\'s mark read button is clicked', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        const unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const markReadButton = within(unreadItem).getByRole('button', { name: /Mark notification "Unread Subject" as read/i });
        fireEvent.click(markReadButton);
        expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockNotificationUnread.id);
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should call navigate and markNotificationRead when an unread item with target_path is clicked', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        fireEvent.click(screen.getByLabelText(/Notification: Unread Subject/));
        expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockNotificationUnread.id);
        expect(mockNavigate).toHaveBeenCalledWith(mockNotificationUnread.data?.target_path);
    });

    it('should call markNotificationRead but NOT navigate when an unread item without target_path is clicked', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnreadNoPath], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        fireEvent.click(screen.getByLabelText(/Notification: Unread No Path Subject/));
        expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockNotificationUnreadNoPath.id);
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should render a link to the /notifications page', () => {
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        const link = screen.getByRole('link', { name: /Notifications/i });
        expect(link).toHaveAttribute('href', '/notifications');
    });

    it('should keep item visible after clicking its mark read button (locally read state)', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        const markReadButton = within(screen.getByLabelText(/Notification: Unread Subject/)).getByRole('button', { name: /Mark notification "Unread Subject" as read/i });
        fireEvent.click(markReadButton);
        expect(screen.getByLabelText(/Notification: Unread Subject/)).toBeInTheDocument();
    });
    
    it('should clear locally read items when dropdown is closed and reopened', () => {
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotificationUnread], unreadCount: 1 });
        renderNotifications();
        const trigger = screen.getByTestId('mock-dropdown-trigger');
        fireEvent.click(trigger); // open
        const markReadButton = within(screen.getByLabelText(/Notification: Unread Subject/)).getByRole('button', { name: /Mark notification "Unread Subject" as read/i });
        fireEvent.click(markReadButton); // mark as read
        fireEvent.click(trigger); // close
        fireEvent.click(trigger); // reopen
        const unreadItem = screen.getByLabelText(/Notification: Unread Subject/);
        const blueDot = unreadItem.querySelector('span[aria-hidden="true"].bg-blue-500');
        expect(blueDot).toBeInTheDocument();
    });

    it('constructs and navigates to the correct URL when a notification with projectId and sessionId is clicked', () => {
        const mockNotification: Notification = { 
            id: 'notif-1', 
            read: false, 
            created_at: new Date().toISOString(), 
            type: 'info', 
            user_id: mockUser.id,
            data: { projectId: 'proj-abc', sessionId: 'sess-xyz', message: 'Your contribution is ready!' } 
        };
        mockedUseNotificationStore.mockReturnValue({ ...mockStoreState, notifications: [mockNotification], unreadCount: 1 });
        renderNotifications();
        fireEvent.click(screen.getByTestId('mock-dropdown-trigger'));
        fireEvent.click(screen.getByText(/Your contribution is ready!/));
        expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-1');
        expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-abc/session/sess-xyz');
    });
}); 