import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, type LinkProps } from 'react-router-dom';
import '@testing-library/jest-dom';

import { NotificationCard } from './NotificationCard';
import type { Notification } from '@paynless/types';

// Mock the Link component to check its 'to' prop, and forward a ref to avoid warnings
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    // The mock Link now uses React.forwardRef to correctly handle the ref passed by the Radix Slot in the Button component.
    const MockLink = React.forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => (
      <a ref={ref} href={props.to as string} {...props} />
    ));
    MockLink.displayName = 'MockLink'; // Add a display name for better debugging
    return {
        ...actual,
        Link: MockLink,
    };
});

// Helper to render the component within a MemoryRouter, as it uses <Link>
const renderCard = (notification: Notification) => {
    return render(
        <MemoryRouter>
            <NotificationCard notification={notification} />
        </MemoryRouter>
    );
};

describe('NotificationCard Component', () => {

    const baseNotification: Omit<Notification, 'data' | 'id' | 'read'> = {
        user_id: 'user-123',
        created_at: new Date('2024-01-01T12:00:00Z').toISOString(),
        type: 'test-type',
    };

    it('should render the subject and message correctly', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-1',
            read: false,
            data: { subject: 'Test Subject', message: 'This is a test message.' },
        };
        renderCard(notification);
        expect(screen.getByText('Test Subject')).toBeInTheDocument();
        expect(screen.getByText('This is a test message.')).toBeInTheDocument();
    });

    it('should display an "Unread" badge for unread notifications', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-2',
            read: false,
            data: {},
        };
        renderCard(notification);
        expect(screen.getByText('Unread')).toBeInTheDocument();
    });

    it('should display a "Read" badge for read notifications', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-3',
            read: true,
            data: {},
        };
        renderCard(notification);
        expect(screen.getByText('Read')).toBeInTheDocument();
    });

    it('should render a "View Details" link for notifications with an explicit target_path', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-4',
            read: false,
            data: { target_path: '/explicit/path' },
        };
        renderCard(notification);
        const link = screen.getByRole('link', { name: /View Details/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/explicit/path');
    });

    it('should construct and render a "View Details" link for Dialectic notifications', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-5',
            read: false,
            data: { projectId: 'proj-abc', sessionId: 'sess-xyz' },
        };
        renderCard(notification);
        const link = screen.getByRole('link', { name: /View Details/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/dialectic/proj-abc/session/sess-xyz');
    });

    it('should not render a "View Details" link if no path information is available', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-6',
            read: false,
            data: { message: 'Just a message, no link.' },
        };
        renderCard(notification);
        expect(screen.queryByRole('link', { name: /View Details/i })).not.toBeInTheDocument();
    });

    it('should render default text when data object is null', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-7',
            read: false,
            data: null,
        };
        const { container } = renderCard(notification);
        expect(screen.getByText('System Notification')).toBeInTheDocument();
        // The message is conditionally rendered and should not be present.
        // We query for the message paragraph element and expect it to be null.
        const messageElement = container.querySelector('p.text-muted-foreground.mb-3');
        expect(messageElement).toBeNull();
    });

    it('should display the notification type', () => {
        const notification: Notification = {
            ...baseNotification,
            id: 'noti-8',
            read: false,
            data: {},
        };
        renderCard(notification);
        expect(screen.getByText('test-type')).toBeInTheDocument();
    });
}); 