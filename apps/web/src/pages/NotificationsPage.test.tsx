import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { Notifications as NotificationsPage } from './Notifications'; // Rename to avoid confusion
import type { Notification } from '@paynless/types';

const mockUseNotificationStore = vi.hoisted(() => vi.fn());

// Mock the store
vi.mock('@paynless/store', () => ({
    useNotificationStore: mockUseNotificationStore,
}));

// Mock the child component
vi.mock('@/components/notifications/NotificationCard', () => ({
    NotificationCard: vi.fn(({ notification }) => (
        <div data-testid="mock-notification-card">
            {notification.data.message}
        </div>
    )),
}));

// Mock the logger
vi.mock('@paynless/utils', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

describe('Notifications Page', () => {
    const mockFetchNotifications = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the heading and fetches notifications if the store is empty', async () => {
        mockUseNotificationStore.mockReturnValue({
            notifications: [],
            fetchNotifications: mockFetchNotifications,
        });

        render(<NotificationsPage />);

        expect(screen.getByRole('heading', { name: /Notifications/i })).toBeDefined();
        expect(screen.getByText(/No notifications yet/i)).toBeDefined();
        
        await waitFor(() => {
            expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
        });
    });

    it('displays notifications from the store and does not fetch again', () => {
        const mockNotifications: Notification[] = [
            { id: '1', data: { message: 'First notification' }, created_at: new Date().toISOString(), type: 'info', user_id: 'user-1', read: false, is_internal_event: false, link_path: null, message: null, title: null },
            { id: '2', data: { message: 'Second notification' }, created_at: new Date().toISOString(), type: 'info', user_id: 'user-1', read: false, is_internal_event: false, link_path: null, message: null, title: null },
        ];

        mockUseNotificationStore.mockReturnValue({
            notifications: mockNotifications,
            fetchNotifications: mockFetchNotifications,
        });

        render(<NotificationsPage />);

        expect(screen.getByRole('heading', { name: /Notifications/i })).toBeDefined();
        expect(screen.queryByText(/No notifications yet/i)).toBeNull();
        
        const cards = screen.getAllByTestId('mock-notification-card');
        expect(cards).toHaveLength(2);
        expect(screen.getByText(/First notification/i)).toBeDefined();
        expect(screen.getByText(/Second notification/i)).toBeDefined();

        expect(mockFetchNotifications).not.toHaveBeenCalled();
    });
});