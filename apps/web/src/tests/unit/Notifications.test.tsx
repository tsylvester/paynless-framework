/// <reference types="vitest/globals" />
import React from 'react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { useNotificationStore, useAuthStore } from '@paynless/store';
import { UserRole } from '@paynless/types';
import { Notifications } from '../../components/Notifications';
import type { Notification, User } from '@paynless/types';
import { api } from '@paynless/api-client'; // Import the actual api object to mock its methods
import { ApiClient, type ApiNotification } from "@paynless/api-client";
import { type RealtimeChannel } from "@supabase/supabase-js";

// Mocks
vi.mock('@paynless/store');

// Auto-mock the api client module (remove factory)
vi.mock('@paynless/api-client');

vi.mock('@paynless/utils', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        configure: vi.fn(),
    },
}));

// Mock navigate globally
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Typed mocks for stores
const mockUseNotificationStore = useNotificationStore as vi.MockedFunction<typeof useNotificationStore>;
const mockUseAuthStore = useAuthStore as vi.MockedFunction<typeof useAuthStore>;

// Mock Data (Keep as is)
const mockUser: User = {
    id: 'user-abc',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    avatarUrl: 'https://example.com/avatar.png',
    role: UserRole.USER,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};
const mockNotification1: Notification = {
    id: '1',
    user_id: mockUser.id,
    created_at: new Date().toISOString(),
    type: 'success',
    read: false,
    data: { subject: 'Subject 1', message: 'Message 1' },
};
const mockNotification2: Notification = {
    id: '2',
    user_id: mockUser.id,
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    type: 'warning',
    read: false,
    data: { subject: 'Subject 2', message: 'Message 2', target_path: '/billing' },
};

// Setup helpers for store state (Keep, but actions are mocked via api now)
const setupAuthState = (user: User | null) => {
    const defaultState = { user: null, session: null, profile: null, isAuthenticated: false, isLoading: false, error: null, /* other actions */ };
    const mockState = { ...defaultState, user: user, isAuthenticated: !!user, /* session/profile if user */ };
    mockUseAuthStore.mockReturnValue(mockState);
};
const setupNotificationStoreState = (notifications: Notification[], unreadCount: number) => {
     // Store mock only needs to return state now
     const storeState = {
        notifications: notifications,
        unreadCount: unreadCount,
        isLoading: false,
        error: null,
        // Keep actions in store state for optimistic updates, but API calls are mocked separately
        fetchNotifications: vi.fn(), // Mock implementation doesn't matter as api is called
        addNotification: vi.fn(), // This is still needed for the Realtime callback
        markNotificationRead: vi.fn(), // Needed for optimistic update
        markAllNotificationsAsRead: vi.fn(), // Needed for optimistic update
    };
    mockUseNotificationStore.mockReturnValue(storeState);
    // Return the state setters for tests that might need them (like addNotification)
    return { 
        addNotificationMock: storeState.addNotification, 
        markNotificationReadMock: storeState.markNotificationRead,
        markAllNotificationsAsReadMock: storeState.markAllNotificationsAsRead,
     }; 
};

// Mocks for navigate and store methods - moved outside describe block
const addNotificationMock: Mock = vi.fn();
const markNotificationReadMock: Mock = vi.fn();
const markAllNotificationsAsReadMock: Mock = vi.fn();

// Mocks for API Client methods - moved outside describe block
const fetchNotificationsMock: Mock = vi.fn().mockResolvedValue({ data: [], status: 200 });
const markNotificationAsReadMock: Mock = vi.fn().mockResolvedValue({ data: undefined, status: 200 });
const markAllNotificationsAsReadMock: Mock = vi.fn().mockResolvedValue({ data: undefined, status: 200 });

// Mock Supabase Realtime Client (simplified)
const mockChannel: RealtimeChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback?: (status: string, err?: Error) => void) => {
        // Simulate connection success
        if (callback) {
            setTimeout(() => callback("SUBSCRIBED"), 0);
        }
        return mockChannel; // Return mockChannel for chaining
    }),
    unsubscribe: vi.fn().mockReturnThis(), // Added unsubscribe mock
} as any; // Cast to any to simplify mock setup for missing methods
const mockSupabaseClient = {
    channel: vi.fn().mockReturnValue(mockChannel),
};

// Instantiate the ApiClient mock with the mocked Supabase client
vi.mocked(ApiClient).mockImplementation(() => ({
    fetchNotifications: fetchNotificationsMock,
    markNotificationAsRead: markNotificationAsReadMock,
    markAllNotificationsAsRead: markAllNotificationsAsReadMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseClient: (): any => mockSupabaseClient, // Return the mock client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiClient: null as any, // Placeholder to satisfy type checker
}));

// Render helper uses store setup helpers
const renderNotifications = (
    initialAuthState: { user: User | null } = { user: mockUser },
    initialNotificationState: { notifications: Notification[], unreadCount: number } = { notifications: [mockNotification1, mockNotification2], unreadCount: 2 }
) => {
    // Setup mocks based on initial state parameters
    const setupAuthState = (user: User | null) => {
        vi.mocked(useAuthStore).mockReturnValue({ user });
    };

    // Removed setupNotificationStoreState call from here - mocks are in outer scope

    setupAuthState(initialAuthState.user ?? null);
    // Removed storeMocks variable declaration

    // Mocks for store methods, accessible in the test scope
    vi.mocked(useNotificationStore).mockReturnValue({
        notifications: initialNotificationState.notifications, // Use parameter directly
        unreadCount: initialNotificationState.unreadCount, // Use parameter directly
        addNotification: addNotificationMock, // Access from outer scope
        markNotificationRead: markNotificationReadMock, // Access from outer scope
        markAllNotificationsAsRead: markAllNotificationsAsReadMock, // Access from outer scope
    });
    // Keep useAuthStore mock setup here as it depends on the helper's parameter
    vi.mocked(useAuthStore).mockReturnValue({ user: initialAuthState.user });

    // Get the render result
    const renderResult = render(
        <MemoryRouter>
            <Notifications />
        </MemoryRouter>
    );

    return {
        ...renderResult,
        // Store mocks are no longer returned from here
    };
};

// === Test Suite ===
describe("Notifications Component", () => {
    // Clear mocks before each test
    beforeEach(() => {
        vi.clearAllMocks(); // Clears all mocks

        // Re-setup necessary mocks for ApiClient instance as clearAllMocks clears implementation
        vi.mocked(ApiClient).mockImplementation(() => ({
            fetchNotifications: fetchNotificationsMock,
            markNotificationAsRead: markNotificationAsReadMock,
            markAllNotificationsAsRead: markAllNotificationsAsReadMock,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getSupabaseClient: (): any => mockSupabaseClient,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            apiClient: null as any, // Placeholder
        }));
    });

    it('should render without crashing', () => {
        const { container } = renderNotifications({ user: mockUser });
        expect(container).toBeDefined();
    });

    it('should fetch initial notifications on mount if user is logged in', async () => {
        renderNotifications({ user: mockUser });
        await waitFor(() => {
            expect(fetchNotificationsMock).toHaveBeenCalledTimes(1);
        });
    });

    it('should subscribe to notifications on mount if user is logged in', async () => {
        renderNotifications({ user: mockUser });
        await waitFor(() => {
            expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
            expect(mockChannel.subscribe).toHaveBeenCalledWith(
                expect.any(Function) // Check callback function passed
            );
        });
    });

    it('should call addNotification when the API subscription callback is invoked', async () => {
        renderNotifications({ user: mockUser }, { notifications: [], unreadCount: 0 });
        let capturedCallback: (notification: Notification) => void;

        await waitFor(() => {
            expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
            capturedCallback = mockChannel.subscribe.mock.calls[0][0];
            expect(capturedCallback).toBeDefined();
        });

        const newNotification: Notification = { id: '3', user_id: mockUser.id, type: 'info', data: { message: 'Test notification' }, read: false, created_at: new Date().toISOString() };
        capturedCallback!(newNotification);
        expect(addNotificationMock).toHaveBeenCalledWith(newNotification);
    });

    it('should unsubscribe from notifications on unmount', async () => {
        const { unmount } = renderNotifications({ user: mockUser });
        await waitFor(() => {
            expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(1);
        });
        unmount();
        expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(1);
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
        renderNotifications(); // Use default state with mock data
        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);
        // Use findByText which incorporates waitFor
        expect(await screen.findByText('Message 1')).toBeInTheDocument();
        expect(await screen.findByText('Message 2')).toBeInTheDocument();
    });

    it('should call api.notifications().markNotificationAsRead when "mark as read" is clicked', async () => {
        renderNotifications(); 
        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);
        const markReadButton = await screen.findByRole('button', { name: `Mark notification ${mockNotification1.id} as read` });
        fireEvent.click(markReadButton);
        expect(markNotificationAsReadMock).toHaveBeenCalledTimes(1);
        expect(markNotificationAsReadMock).toHaveBeenCalledWith(mockNotification1.id);
    });

    it('should call api.notifications().markAllNotificationsAsRead when "mark all" is clicked', async () => {
        renderNotifications();
        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);
        const markAllButton = await screen.findByRole('button', { name: /Mark all as read/i });
        fireEvent.click(markAllButton);
        expect(markAllNotificationsAsReadMock).toHaveBeenCalledTimes(1);
    });

    it('should call navigate and mark as read when actionable item is clicked', async () => {
        renderNotifications(
            { user: mockUser },
            { notifications: [mockNotification2], unreadCount: 1 }
        );
        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);
        const notificationItem = await screen.findByText('Message 2');
        fireEvent.click(notificationItem);
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(mockNotification2.data!['target_path']);
        expect(markNotificationAsReadMock).toHaveBeenCalledTimes(1);
        expect(markNotificationAsReadMock).toHaveBeenCalledWith(mockNotification2.id);
    });

    it('should NOT call navigate but mark read when non-actionable item is clicked', async () => {
        renderNotifications(
             { user: mockUser },
             { notifications: [mockNotification1], unreadCount: 1 }
         );
        const trigger = screen.getByRole('button', { name: /Notifications/i });
        fireEvent.click(trigger);
        const notificationItem = await screen.findByText('Message 1');
        fireEvent.click(notificationItem);
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(markNotificationAsReadMock).toHaveBeenCalledTimes(1);
        expect(markNotificationAsReadMock).toHaveBeenCalledWith(mockNotification1.id);
    });

    it('should mark a notification as read when clicked', async () => {
        const initialNotifications = [mockNotification1];
        renderNotifications({ user: mockUser }, { notifications: initialNotifications, unreadCount: 1 });

        const notificationItem = await screen.findByText(/New message/);
        fireEvent.click(notificationItem);

        await waitFor(() => {
            expect(markNotificationAsReadMock).toHaveBeenCalledTimes(1);
            expect(markNotificationAsReadMock).toHaveBeenCalledWith(mockNotification1.id);
        });
    });

    it('should mark all notifications as read when the button is clicked', async () => {
        renderNotifications({ user: mockUser }, { notifications: [mockNotification1], unreadCount: 1 });

        const dropdownToggle = screen.getByRole('button', { name: /toggle notifications dropdown/i });
        fireEvent.click(dropdownToggle);

        const markAllButton = await screen.findByRole('button', { name: /Mark all as read/i });
        fireEvent.click(markAllButton);

        await waitFor(() => {
            expect(markAllNotificationsAsReadMock).toHaveBeenCalledTimes(1);
        });
    });
});