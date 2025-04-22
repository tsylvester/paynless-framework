/// <reference types="vitest/globals" />
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Removed unused afterEach
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { useNotificationStore, useAuthStore } from '@paynless/store';
import { UserRole } from '@paynless/types';
import { Notifications } from '../../components/Notifications';
import type { Notification, User } from '@paynless/types';

// Mocks
vi.mock('@paynless/store');

// --- Mock Supabase Client --- (Added)
// import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'; // Removed type import

const mockSupabaseChannel: any = { // Removed Partial type, Added any
    on: vi.fn().mockReturnThis(), // Chainable
    subscribe: vi.fn((callback?: (status: string, err?: Error) => void): any => { // Keep err param type for clarity, Added any return type
        // Optionally simulate subscription callback
        if (callback) {
            // Simulate successful subscription after a delay
            setTimeout(() => callback('SUBSCRIBED'), 0);
        }
        // Rely on implicit return type for mock
        return mockSupabaseChannel;
    }),
};
const mockSupabaseClient: any = { // Removed Partial type, Added any
    channel: vi.fn().mockReturnValue(mockSupabaseChannel), // Removed cast
    removeChannel: vi.fn(),
};
// --- End Mock Supabase Client ---

vi.mock('@paynless/api-client', () => ({
    // Provide the 'api' export with necessary mocked methods
    api: {
        // Mock any direct methods if needed (e.g., api.notifications.markRead)
        // For this component, we primarily need the Supabase client access
        getSupabaseClient: vi.fn(() => mockSupabaseClient), // Removed cast
        // Mock other api subgroups if necessary (e.g., billing: {}, ai: {})
        billing: {
            // Add specific billing mocks if they were needed elsewhere
        },
        ai: {
            // Add specific AI mocks if they were needed elsewhere
        },
        // Add mock for notifications api if separate
        notifications: { // Assuming direct calls like api.notifications.fetch...
            fetchNotifications: vi.fn().mockResolvedValue([]), // Mock fetch as needed
            markNotificationAsRead: vi.fn().mockResolvedValue(undefined),
            markAllNotificationsAsRead: vi.fn().mockResolvedValue(undefined),
        }
    }
}));
vi.mock('@paynless/utils', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        configure: vi.fn(), // Include if configure is called anywhere
    },
    // Add other exports from @paynless/utils if they are needed by imports
}));

// --- Mock navigate globally ---
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        useNavigate: () => mockNavigate, // Provide the mock globally
    };
});
// --- End mock navigate ---

// Typed mocks
const mockUseNotificationStore = useNotificationStore as vi.MockedFunction<typeof useNotificationStore>;
const mockUseAuthStore = useAuthStore as vi.MockedFunction<typeof useAuthStore>;

// --- Mock Data ---

const mockUser: User = {
    id: 'user-abc',
    // user_id: 'user-abc', // Assuming user_id might be needed if User type mirrors auth.users - Removed as per User type
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    avatarUrl: 'https://example.com/avatar.png',
    role: UserRole.USER,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Add other fields defined in the actual User type
};

const mockNotification1: Notification = {
    id: '1',
    user_id: mockUser.id,
    created_at: new Date().toISOString(),
    type: 'success',
    read: false,
    data: { // Change body to message
        subject: 'Subject 1', // Keep subject if needed by component, otherwise remove
        message: 'Message 1', // <-- Changed
    },
};

const mockNotification2: Notification = {
    id: '2',
    user_id: mockUser.id,
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    type: 'warning',
    read: false,
    data: { // Change body to message
        subject: 'Subject 2', // Keep subject if needed by component, otherwise remove
        message: 'Message 2', // <-- Changed
        target_path: '/billing' // Changed link to target_path
    },
};

// Initial state setup helpers
const setupAuthState = (user: User | null) => {
    // Default state structure matching AuthStore state
    const defaultState = {
        user: null,
        session: null, // Add session if needed by component logic
        profile: null, // Add profile if needed
        isAuthenticated: false,
        isLoading: false,
        error: null,
        fetchUser: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
        // Mock other necessary auth state/actions
    };
    const mockState = {
        ...defaultState,
        user: user,
        isAuthenticated: !!user,
        // Conditionally add session/profile if user exists and needed
        ...(user && { session: { access_token: 'mock-token', user: user /* ... other session props */ } }),
        ...(user && { profile: { id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role /* ... other profile props */} }),
    };
    mockUseAuthStore.mockReturnValue(mockState);
};

// Correctly return the store object AND mock actions
const setupNotificationState = (notifications: Notification[], unreadCount: number) => {
    // Create mocks for actions first
    const fetchNotificationsMock = vi.fn().mockResolvedValue(undefined);
    const addNotificationMock = vi.fn();
    const markNotificationReadMock = vi.fn().mockResolvedValue(undefined);
    const markAllNotificationsAsReadMock = vi.fn().mockResolvedValue(undefined);

    const storeState = {
        notifications: notifications,
        unreadCount: unreadCount,
        isLoading: false,
        error: null,
        // Assign the mocks to the state object
        fetchNotifications: fetchNotificationsMock,
        addNotification: addNotificationMock,
        markNotificationRead: markNotificationReadMock,
        markAllNotificationsAsRead: markAllNotificationsAsReadMock,
    };
    mockUseNotificationStore.mockReturnValue(storeState);
    // Return the mocks separately for assertions
    return {
        fetchNotificationsMock,
        addNotificationMock,
        markNotificationReadMock,
        markAllNotificationsAsReadMock,
    };
};

// New render helper function
const renderNotifications = (
    initialAuthState: { user?: User | null } = { user: mockUser }, // Default to logged in user
    initialNotificationState: { notifications: Notification[], unreadCount: number } = { notifications: [mockNotification1, mockNotification2], unreadCount: 2 } // Default state
) => {
    setupAuthState(initialAuthState.user ?? null); // Pass user or null
    const notificationMocks = setupNotificationState(initialNotificationState.notifications, initialNotificationState.unreadCount);

    render(
        <MemoryRouter>
            <Notifications />
        </MemoryRouter>
    );

    // Return the mocked actions for assertions
    return { ...notificationMocks };
};


// --- Tests ---
describe('Notifications Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockClear();
        // Note: Initial setup moved inside renderNotifications or individual tests
    });

    // Test using the new helper
    it('should call fetchNotifications on mount when user is logged in', async () => {
        const { fetchNotificationsMock } = renderNotifications({ user: mockUser }, { notifications: [], unreadCount: 0 });
        await waitFor(() => {
            expect(fetchNotificationsMock).toHaveBeenCalledTimes(1);
        });
    });

    it('should display unread count badge correctly', async () => {
        renderNotifications({ user: mockUser }, { notifications: [mockNotification1, mockNotification2], unreadCount: 2 });
        await waitFor(() => {
            const badge = screen.getByLabelText('2 unread notifications');
            expect(badge).toBeInTheDocument();
            expect(badge).toHaveTextContent('2');
        });
    });

     it('should display notification list when dropdown is opened', async () => {
        renderNotifications(); // Use default state

        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);

        await waitFor(() => {
            expect(screen.getByText(mockNotification1.data?.message ?? '')).toBeInTheDocument();
        });
        expect(screen.getByText(mockNotification2.data?.message ?? '')).toBeInTheDocument();
    });

    it('should call markNotificationRead when "mark as read" is clicked', async () => {
        const { markNotificationReadMock } = renderNotifications();

        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);

        // Keep waitFor here as interaction depends on list rendering
        const markReadButton = await waitFor(() => {
            expect(screen.getByText(mockNotification1.data?.message ?? '')).toBeInTheDocument();
            return screen.getByRole('button', { name: `Mark notification ${mockNotification1.id} as read` });
        });
        fireEvent.click(markReadButton);

        expect(markNotificationReadMock).toHaveBeenCalledTimes(1);
        expect(markNotificationReadMock).toHaveBeenCalledWith(mockNotification1.id);
    });

    it('should call markAllNotificationsAsRead when "mark all as read" is clicked', async () => {
        const { markAllNotificationsAsReadMock } = renderNotifications();

        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);

        // Keep waitFor here as interaction depends on list rendering
        const markAllButton = await waitFor(() => {
            expect(screen.getByText(mockNotification1.data?.message ?? '')).toBeInTheDocument();
            return screen.getByRole('button', { name: /Mark all as read/i });
        });
        fireEvent.click(markAllButton);

        expect(markAllNotificationsAsReadMock).toHaveBeenCalledTimes(1);
    });

    it('should call navigate when an actionable notification item is clicked', async () => {
        const { markNotificationReadMock } = renderNotifications(
            { user: mockUser },
            { notifications: [mockNotification2], unreadCount: 1 } // Only actionable notification
        );

        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);

        // Keep waitFor here
        const notificationItem = await waitFor(() =>
            screen.getByText(mockNotification2.data?.message ?? '')
        );
        fireEvent.click(notificationItem);

        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(mockNotification2.data?.target_path);
        expect(markNotificationReadMock).toHaveBeenCalledTimes(1);
        expect(markNotificationReadMock).toHaveBeenCalledWith(mockNotification2.id);
    });

    it('should NOT call navigate when a non-actionable notification item is clicked', async () => {
        const { markNotificationReadMock } = renderNotifications(
             { user: mockUser },
             { notifications: [mockNotification1], unreadCount: 1 } // Only non-actionable
         );

        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);

        // Keep waitFor here
        const notificationItem = await waitFor(() =>
            screen.getByText(mockNotification1.data?.message ?? '')
        );
        fireEvent.click(notificationItem);

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(markNotificationReadMock).toHaveBeenCalledTimes(1);
        expect(markNotificationReadMock).toHaveBeenCalledWith(mockNotification1.id);
    });

     // --- Realtime Tests ---
    it('should setup Supabase Realtime subscription on mount', async () => {
        renderNotifications({ user: mockUser }, { notifications: [], unreadCount: 0 });

        await waitFor(() => {
            expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
                expect.stringContaining(`notifications-user-${mockUser.id}`),
                expect.any(Object)
            );
            expect(mockSupabaseChannel.subscribe).toHaveBeenCalled();
        });
    });

    it('should call addNotification when a new notification payload is received', async () => {
        const { addNotificationMock } = renderNotifications({ user: mockUser }, { notifications: [], unreadCount: 0 });

        await waitFor(() => {
            expect(mockSupabaseChannel.subscribe).toHaveBeenCalled();
        });

        const onCallback = mockSupabaseChannel.on.mock.calls.find(
            (call: any) => call[0] === 'postgres_changes' && call[1].event === 'INSERT'
        )?.[2];

        expect(onCallback).toBeDefined();

        const newNotificationPayload = {
            new: {
                id: 'new-notif',
                user_id: mockUser.id,
                created_at: new Date().toISOString(),
                type: 'info',
                read: false,
                data: { message: 'New Realtime Message' },
            } as Notification // Cast here for type safety if needed
        };

        if (onCallback) {
            onCallback(newNotificationPayload);
        }

        expect(addNotificationMock).toHaveBeenCalledTimes(1);
        expect(addNotificationMock).toHaveBeenCalledWith(newNotificationPayload.new);
    });

    it('should remove Supabase Realtime channel on unmount', async () => {
        const { unmount } = render( // Use direct render here as we need unmount handle
            <MemoryRouter><Notifications /></MemoryRouter>
        );
        // Ensure state is set *before* direct render for unmount test
        setupAuthState(mockUser);
        setupNotificationState([], 0);

        await waitFor(() => {
            expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(1);
            expect(mockSupabaseChannel.subscribe).toHaveBeenCalledTimes(1);
        });

        unmount();

        expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(1);
        expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockSupabaseChannel);
    });

});