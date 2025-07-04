import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { Notifications as NotificationsPage } from './Notifications'; // Rename to avoid confusion
import { useNotificationStore } from '@paynless/store';
import type { Notification } from '@paynless/types';
import type { NotificationState } from '@paynless/store';

// Mock the store
vi.mock('@paynless/store', () => ({
    useNotificationStore: vi.fn(),
}));

const mockedUseNotificationStore = useNotificationStore;

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
        mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => selector({
            notifications: [],
            fetchNotifications: mockFetchNotifications,
        } as unknown as NotificationState));

        render(<NotificationsPage />);

        expect(screen.getByRole('heading', { name: /notification history/i })).toBeInTheDocument();
        expect(screen.getByText(/you have no notifications/i)).toBeInTheDocument();
        
        await waitFor(() => {
            expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
        });
    });

    it('displays notifications from the store and does not fetch again', () => {
        const mockNotifications: Notification[] = [
            { id: '1', data: { message: 'First notification' }, created_at: new Date().toISOString(), type: 'info', user_id: 'user-1', read: false },
            { id: '2', data: { message: 'Second notification' }, created_at: new Date().toISOString(), type: 'info', user_id: 'user-1', read: false },
        ];

        mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => selector({
            notifications: mockNotifications,
            fetchNotifications: mockFetchNotifications,
        } as unknown as NotificationState));

        render(<NotificationsPage />);

        expect(screen.getByRole('heading', { name: /notification history/i })).toBeInTheDocument();
        expect(screen.queryByText(/you have no notifications/i)).not.toBeInTheDocument();
        
        const cards = screen.getAllByTestId('mock-notification-card');
        expect(cards).toHaveLength(2);
        expect(screen.getByText('First notification')).toBeInTheDocument();
        expect(screen.getByText('Second notification')).toBeInTheDocument();

        expect(mockFetchNotifications).not.toHaveBeenCalled();
    });
});