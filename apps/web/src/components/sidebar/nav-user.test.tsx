import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavUser } from './nav-user';
import {
  resetAuthStoreMock,
  internalMockAuthStoreGetState,
} from '../../mocks/authStore.mock';
import { useNotificationStore, type NotificationState } from '@paynless/store';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeState, Theme } from '@paynless/types';

// Mock stores
vi.mock('@paynless/store', async () => {
  const authMock = await import('../../mocks/authStore.mock');
  return {
    __esModule: true,
    useAuthStore: vi.fn(authMock.mockedUseAuthStoreHookLogic),
    useNotificationStore: vi.fn(),
  };
});

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useTheme hook
const mockSetColorMode = vi.fn();
const mockSetTheme = vi.fn();
const createMockTheme = (): Theme => ({
  name: 'light',
  colors: {
    primary: '#000000',
    secondary: '#000000',
    background: '#ffffff',
    surface: '#ffffff',
    textPrimary: '#000000',
    textSecondary: '#000000',
    border: '#000000',
    successBackground: '#000000',
    successForeground: '#000000',
    attentionBackground: '#000000',
    attentionForeground: '#000000',
  },
  isDark: false,
});
vi.mock('../../hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    currentTheme: createMockTheme(),
    colorMode: 'light',
    setColorMode: mockSetColorMode,
    setTheme: mockSetTheme,
  })),
}));

// Mock UI components
vi.mock('@/components/ui/sidebar', () => ({
  SidebarMenuButton: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sidebar-menu-button" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: vi.fn(({ children, onClick, className, ...props }: { children: React.ReactNode; onClick?: () => void; className?: string; [key: string]: unknown }) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  )),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: vi.fn(({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  )),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>
      {children}
    </div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img data-testid="avatar-image" src={src} alt={alt} />
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/SimpleDropdown', () => ({
  SimpleDropdown: vi.fn(({ trigger, children, onOpenChange, align, contentClassName }: { 
    trigger: React.ReactNode; 
    children: React.ReactNode; 
    onOpenChange?: (open: boolean) => void;
    align?: string;
    contentClassName?: string;
  }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const handleTriggerClick = () => {
      const newState = !isOpen;
      setIsOpen(newState);
      onOpenChange?.(newState);
    };
    return (
      <div data-testid="simple-dropdown" data-align={align} data-content-class={contentClassName}>
        <div data-testid="dropdown-trigger" onClick={handleTriggerClick}>
          {trigger}
        </div>
        {isOpen && <div data-testid="dropdown-content">{children}</div>}
      </div>
    );
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  const createIconMock = (name: string) => {
    const IconComponent = ({ className, size, ...props }: { className?: string; size?: number; [key: string]: unknown }) => (
      <svg data-testid={`lucide-${name.toLowerCase()}`} className={className} data-size={size} {...props} />
    );
    IconComponent.displayName = name;
    return IconComponent;
  };
  
  return {
    ...actual,
    Bell: createIconMock('Bell'),
    Moon: createIconMock('Moon'),
    Sun: createIconMock('Sun'),
    ChevronsUpDown: createIconMock('ChevronsUpDown'),
    Sparkles: createIconMock('Sparkles'),
    CreditCard: createIconMock('CreditCard'),
    LogOut: createIconMock('LogOut'),
    BadgeCheck: createIconMock('BadgeCheck'),
  };
});

const mockedUseNotificationStore = vi.mocked(useNotificationStore);
const mockedUseTheme = vi.mocked(useTheme);

describe('NavUser', () => {
  let queryClient: QueryClient;
  let mockFetchNotifications: () => Promise<void>;
  let mockLogout: () => Promise<void>;
  let mockNotificationState: NotificationState;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStoreMock();
    mockNavigate.mockClear();
    mockSetColorMode.mockClear();
    mockSetTheme.mockClear();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    mockFetchNotifications = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
    mockLogout = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);

    mockNotificationState = {
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      subscribedUserId: null,
      fetchNotifications: mockFetchNotifications,
      addNotification: vi.fn(),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
      markAllNotificationsAsRead: vi.fn().mockResolvedValue(undefined),
      subscribeToUserNotifications: vi.fn(),
      unsubscribeFromUserNotifications: vi.fn(),
      handleIncomingNotification: vi.fn(),
    };

    mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => {
      return selector ? selector(mockNotificationState) : mockNotificationState;
    });

    // Reset useTheme mock to default light mode
    const defaultThemeState: ThemeState = {
      currentTheme: createMockTheme(),
      colorMode: 'light',
      setColorMode: mockSetColorMode,
      setTheme: mockSetTheme,
    };
    mockedUseTheme.mockReturnValue(defaultThemeState);

    // Set up logout mock in auth store state
    const authState = internalMockAuthStoreGetState();
    authState.logout = mockLogout;
  });

  const renderComponent = (user: { email: string; avatar?: string; name?: string }) => {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NavUser user={user} />
        </QueryClientProvider>
      </MemoryRouter>
    );
  };

  describe('User prop rendering', () => {
    it('should display user email', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('should render avatar with image when avatar prop is provided', () => {
      const user = { email: 'test@example.com', avatar: '/avatar.jpg', name: 'Test User' };
      renderComponent(user);

      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).toBeInTheDocument();
      expect(avatarImage).toHaveAttribute('src', '/avatar.jpg');
      expect(avatarImage).toHaveAttribute('alt', 'Test User');
    });

    it('should render avatar fallback with initials from email when no avatar', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const fallback = screen.getByTestId('avatar-fallback');
      expect(fallback).toBeInTheDocument();
      expect(fallback).toHaveTextContent('TE');
    });

    it('should generate correct initials from email first two characters', () => {
      const user = { email: 'john.doe@example.com' };
      renderComponent(user);

      const fallback = screen.getByTestId('avatar-fallback');
      expect(fallback).toHaveTextContent('JO');
    });

    it('should uppercase initials', () => {
      const user = { email: 'alice@example.com' };
      renderComponent(user);

      const fallback = screen.getByTestId('avatar-fallback');
      expect(fallback).toHaveTextContent('AL');
    });
  });

  describe('Notifications button', () => {
    it('should render notifications button with Bell icon', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const bellIcon = screen.getByTestId('lucide-bell');
      expect(bellIcon).toBeInTheDocument();
    });

    it('should display unread count badge', () => {
      mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => {
        const state: NotificationState = {
          ...mockNotificationState,
          unreadCount: 5,
        };
        return selector ? selector(state) : state;
      });

      const user = { email: 'test@example.com' };
      renderComponent(user);

      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('5');
    });

    it('should display zero unread count', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('0');
    });

    it('should navigate to /notifications when clicked', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Notifications');
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/notifications');
    });

    it('should have correct aria-label', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Notifications');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Theme toggle button', () => {
    it('should render Moon icon in light mode', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const moonIcon = screen.getByTestId('lucide-moon');
      expect(moonIcon).toBeInTheDocument();
      expect(moonIcon).toHaveAttribute('data-size', '20');
    });

    it('should render Sun icon in dark mode', () => {
      const mockTheme: Theme = {
        ...createMockTheme(),
        name: 'dark',
        isDark: true,
      };
      const mockThemeState: ThemeState = {
        currentTheme: mockTheme,
        colorMode: 'dark',
        setColorMode: mockSetColorMode,
        setTheme: mockSetTheme,
      };
      mockedUseTheme.mockReturnValue(mockThemeState);

      const user = { email: 'test@example.com' };
      renderComponent(user);

      const sunIcon = screen.getByTestId('lucide-sun');
      expect(sunIcon).toBeInTheDocument();
      expect(sunIcon).toHaveAttribute('data-size', '20');
    });

    it('should have correct aria-label in light mode', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Switch to dark mode');
      expect(button).toBeInTheDocument();
    });

    it('should have correct aria-label in dark mode', () => {
      const mockTheme: Theme = {
        ...createMockTheme(),
        name: 'dark',
        isDark: true,
      };
      const mockThemeState: ThemeState = {
        currentTheme: mockTheme,
        colorMode: 'dark',
        setColorMode: mockSetColorMode,
        setTheme: mockSetTheme,
      };
      mockedUseTheme.mockReturnValue(mockThemeState);

      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Switch to light mode');
      expect(button).toBeInTheDocument();
    });

    it('should toggle color mode from light to dark when clicked', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Switch to dark mode');
      fireEvent.click(button);

      expect(mockSetColorMode).toHaveBeenCalledWith('dark');
    });

    it('should toggle color mode from dark to light when clicked', () => {
      const mockTheme: Theme = {
        ...createMockTheme(),
        name: 'dark',
        isDark: true,
      };
      const mockThemeState: ThemeState = {
        currentTheme: mockTheme,
        colorMode: 'dark',
        setColorMode: mockSetColorMode,
        setTheme: mockSetTheme,
      };
      mockedUseTheme.mockReturnValue(mockThemeState);

      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Switch to light mode');
      fireEvent.click(button);

      expect(mockSetColorMode).toHaveBeenCalledWith('light');
    });
  });

  describe('Dropdown', () => {
    it('should render dropdown trigger with user email', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('should render ChevronsUpDown icon in trigger', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const chevronIcon = screen.getByTestId('lucide-chevronsupdown');
      expect(chevronIcon).toBeInTheDocument();
    });

    it('should open dropdown when trigger is clicked', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const trigger = screen.getByTestId('dropdown-trigger');
      fireEvent.click(trigger);

      expect(screen.getByTestId('dropdown-content')).toBeInTheDocument();
    });

    it('should close dropdown when trigger is clicked again', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const trigger = screen.getByTestId('dropdown-trigger');
      fireEvent.click(trigger);
      expect(screen.getByTestId('dropdown-content')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByTestId('dropdown-content')).not.toBeInTheDocument();
    });

    it('should hide notification and theme buttons when dropdown is open', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const trigger = screen.getByTestId('dropdown-trigger');
      fireEvent.click(trigger);

      const buttonsContainer = screen.getByLabelText('Notifications').closest('div');
      expect(buttonsContainer).toHaveClass('hidden');
    });
  });

  describe('Dropdown menu items', () => {
    const openDropdown = () => {
      const trigger = screen.getByTestId('dropdown-trigger');
      fireEvent.click(trigger);
    };

    it('should render "Upgrade to Pro" button with Sparkles icon', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
      expect(screen.getByTestId('lucide-sparkles')).toBeInTheDocument();
    });

    it('should navigate to /subscription when "Upgrade to Pro" is clicked', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      const button = screen.getByText('Upgrade to Pro');
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/subscription');
    });

    it('should render "Billing" button with CreditCard icon', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      expect(screen.getByText('Billing')).toBeInTheDocument();
      expect(screen.getByTestId('lucide-creditcard')).toBeInTheDocument();
    });

    it('should navigate to /subscription when "Billing" is clicked', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      const button = screen.getByText('Billing');
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/subscription');
    });

    it('should render "Notifications" button with Bell icon and unread count', () => {
      mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => {
        const state: NotificationState = {
          ...mockNotificationState,
          unreadCount: 3,
        };
        return selector ? selector(state) : state;
      });

      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      expect(screen.getByText('Notifications (3)')).toBeInTheDocument();
      expect(screen.getAllByTestId('lucide-bell').length).toBeGreaterThan(0);
    });

    it('should navigate to /notifications when "Notifications" menu item is clicked', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      const button = screen.getByText('Notifications (0)');
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/notifications');
    });

    it('should render "Log out" button with LogOut icon', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      expect(screen.getByText('Log out')).toBeInTheDocument();
      expect(screen.getByTestId('lucide-logout')).toBeInTheDocument();
    });

    it('should call logout and navigate to /login when "Log out" is clicked', async () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);
      openDropdown();

      const button = screen.getByText('Log out');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
      });
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('useQuery integration', () => {
    it('should call fetchNotifications when component mounts', async () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
      });
    });

    it('should call fetchNotifications even when unreadCount is already set', async () => {
      mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => {
        const state: NotificationState = {
          ...mockNotificationState,
          unreadCount: 5,
        };
        return selector ? selector(state) : state;
      });

      const user = { email: 'test@example.com' };
      renderComponent(user);

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Store interactions', () => {
    it('should use unreadCount from notification store', () => {
      mockedUseNotificationStore.mockImplementation((selector: (state: NotificationState) => unknown) => {
        const state: NotificationState = {
          ...mockNotificationState,
          unreadCount: 7,
        };
        return selector ? selector(state) : state;
      });

      const user = { email: 'test@example.com' };
      renderComponent(user);

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent('7');
    });

    it('should use logout from auth store', async () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const trigger = screen.getByTestId('dropdown-trigger');
      fireEvent.click(trigger);

      const logoutButton = screen.getByText('Log out');
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('should use colorMode from theme hook', () => {
      const mockTheme: Theme = {
        ...createMockTheme(),
        name: 'dark',
        isDark: true,
      };
      const mockThemeState: ThemeState = {
        currentTheme: mockTheme,
        colorMode: 'dark',
        setColorMode: mockSetColorMode,
        setTheme: mockSetTheme,
      };
      mockedUseTheme.mockReturnValue(mockThemeState);

      const user = { email: 'test@example.com' };
      renderComponent(user);

      const sunIcon = screen.getByTestId('lucide-sun');
      expect(sunIcon).toBeInTheDocument();
    });

    it('should use setColorMode from theme hook', () => {
      const user = { email: 'test@example.com' };
      renderComponent(user);

      const button = screen.getByLabelText('Switch to dark mode');
      fireEvent.click(button);

      expect(mockSetColorMode).toHaveBeenCalledWith('dark');
    });
  });
});

