import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavMain } from './nav-main';
import { Home, Settings, type LucideIcon } from 'lucide-react';

// Mock UI components
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, defaultOpen, className }: { children: React.ReactNode; defaultOpen?: boolean; className?: string }) => (
    <div data-testid="collapsible" data-default-open={defaultOpen} className={className}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div data-testid="collapsible-trigger" onClick={onClick}>
      {children}
    </div>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}));

vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-group">{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-group-label">{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu-item">{children}</div>
  ),
  SidebarMenuButton: ({ children, tooltip, onClick, asChild }: { children: React.ReactNode; tooltip?: string; onClick?: () => void; asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <div onClick={onClick} data-testid="sidebar-menu-button-as-child">
          {children}
        </div>
      );
    }
    return (
      <button data-testid="sidebar-menu-button" data-tooltip={tooltip} onClick={onClick}>
        {children}
      </button>
    );
  },
  SidebarMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu-sub">{children}</div>
  ),
  SidebarMenuSubItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu-sub-item">{children}</div>
  ),
  SidebarMenuSubButton: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return children;
    }
    return <div data-testid="sidebar-menu-sub-button">{children}</div>;
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  const createIconMock = (name: string) => {
    const IconComponent = ({ className, ...props }: { className?: string; [key: string]: unknown }) => (
      <svg data-testid={`lucide-${name.toLowerCase()}`} className={className} {...props} />
    );
    IconComponent.displayName = name;
    return IconComponent;
  };
  
  return {
    ...actual,
    ChevronRight: createIconMock('ChevronRight'),
    Home: createIconMock('Home'),
    Settings: createIconMock('Settings'),
  };
});

// Mock window.location.assign
const mockAssign = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    assign: mockAssign,
  },
  writable: true,
});


describe('NavMain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssign.mockClear();
  });

  beforeAll(() => {
    // Mock HTMLElement methods that might be needed for Radix UI components
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  const renderComponent = (props: {
    items: Array<{
      title: string;
      url: string;
      icon?: LucideIcon;
      isActive?: boolean;
      items?: Array<{ title: string; url: string }>;
    }>;
    hideLogo?: boolean;
    subtitle?: string;
  }) => {
    return render(
      <MemoryRouter>
        <NavMain {...props} />
      </MemoryRouter>
    );
  };

  describe('Logo rendering', () => {
    it('should render logo when hideLogo is false (default)', () => {
      renderComponent({
        items: [],
      });

      const logoLink = screen.getByRole('link', { name: /paynless logo/i });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute('href', '/');
      const logo = screen.getByAltText('Paynless Logo');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/logos/app_icon_240x240.png');
    });

    it('should not render logo when hideLogo is true', () => {
      renderComponent({
        items: [],
        hideLogo: true,
      });

      const logoLink = screen.queryByRole('link', { name: /paynless logo/i });
      expect(logoLink).not.toBeInTheDocument();
    });

    it('should link logo to home page', () => {
      renderComponent({
        items: [],
      });

      const logoLink = screen.getByRole('link');
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });

  describe('Subtitle rendering', () => {
    it('should render default subtitle "Platform" when not provided', () => {
      renderComponent({
        items: [],
      });

      const subtitle = screen.getByTestId('sidebar-group-label');
      expect(subtitle).toHaveTextContent('Platform');
    });

    it('should render custom subtitle when provided', () => {
      renderComponent({
        items: [],
        subtitle: 'Custom Subtitle',
      });

      const subtitle = screen.getByTestId('sidebar-group-label');
      expect(subtitle).toHaveTextContent('Custom Subtitle');
    });
  });

  describe('Simple items (no sub-items)', () => {
    it('should render items without sub-items', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
        },
        {
          title: 'Settings',
          url: '/settings',
        },
      ];

      renderComponent({ items });

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should render icon if provided', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
          icon: Home,
        },
      ];

      renderComponent({ items });

      const homeIcon = screen.getByTestId('lucide-home');
      expect(homeIcon).toBeInTheDocument();
    });

    it('should not render chevron when no sub-items', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
        },
      ];

      renderComponent({ items });

      const chevrons = screen.queryAllByTestId('lucide-chevronright');
      expect(chevrons).toHaveLength(0);
    });

    it('should navigate to URL when clicked using window.location.assign', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
        },
      ];

      renderComponent({ items });

      const button = screen.getByText('Home').closest('button');
      expect(button).toBeInTheDocument();
      
      if (button) {
        fireEvent.click(button);
        expect(mockAssign).toHaveBeenCalledWith('/home');
      }
    });

    it('should render tooltip on menu button', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
        },
      ];

      renderComponent({ items });

      const button = screen.getByTestId('sidebar-menu-button');
      expect(button).toHaveAttribute('data-tooltip', 'Home');
    });
  });

  describe('Items with sub-items', () => {
    it('should render collapsible items with sub-items', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          items: [
            { title: 'Profile', url: '/settings/profile' },
            { title: 'Account', url: '/settings/account' },
          ],
        },
      ];

      renderComponent({ items });

      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByTestId('collapsible')).toBeInTheDocument();
    });

    it('should render chevron icon when item has sub-items', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          items: [
            { title: 'Profile', url: '/settings/profile' },
          ],
        },
      ];

      renderComponent({ items });

      const chevrons = screen.getAllByTestId('lucide-chevronright');
      expect(chevrons.length).toBeGreaterThan(0);
    });

    it('should render collapsible trigger and content structure', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          items: [
            { title: 'Profile', url: '/settings/profile' },
          ],
        },
      ];

      renderComponent({ items });

      const collapsible = screen.getByTestId('collapsible');
      expect(collapsible).toBeInTheDocument();
      expect(screen.getByTestId('collapsible-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('collapsible-content')).toBeInTheDocument();
    });

    it('should set defaultOpen when isActive is true', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          isActive: true,
          items: [
            { title: 'Profile', url: '/settings/profile' },
          ],
        },
      ];

      renderComponent({ items });

      const collapsible = screen.getByTestId('collapsible');
      expect(collapsible).toHaveAttribute('data-default-open', 'true');
    });

    it('should render all sub-items', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          items: [
            { title: 'Profile', url: '/settings/profile' },
            { title: 'Account', url: '/settings/account' },
            { title: 'Security', url: '/settings/security' },
          ],
        },
      ];

      renderComponent({ items });

      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Security')).toBeInTheDocument();
    });

    it('should link sub-items to their URLs', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          items: [
            { title: 'Profile', url: '/settings/profile' },
          ],
        },
      ];

      renderComponent({ items });

      const profileLink = screen.getByText('Profile').closest('a');
      expect(profileLink).toBeInTheDocument();
      expect(profileLink).toHaveAttribute('href', '/settings/profile');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty items array', () => {
      renderComponent({ items: [] });

      const menu = screen.getByTestId('sidebar-menu');
      expect(menu).toBeInTheDocument();
      expect(menu).toBeEmptyDOMElement();
    });

    it('should handle items with empty sub-items array', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          items: [],
        },
      ];

      renderComponent({ items });

      expect(screen.getByText('Settings')).toBeInTheDocument();
      const chevrons = screen.queryAllByTestId('lucide-chevronright');
      expect(chevrons).toHaveLength(0);
    });

    it('should handle items with both icon and sub-items', () => {
      const items = [
        {
          title: 'Settings',
          url: '/settings',
          icon: Settings,
          items: [
            { title: 'Profile', url: '/settings/profile' },
          ],
        },
      ];

      renderComponent({ items });

      const settingsIcon = screen.getByTestId('lucide-settings');
      expect(settingsIcon).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByTestId('collapsible')).toBeInTheDocument();
    });

    it('should handle multiple items', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
          icon: Home,
        },
        {
          title: 'Settings',
          url: '/settings',
          icon: Settings,
          items: [
            { title: 'Profile', url: '/settings/profile' },
          ],
        },
        {
          title: 'About',
          url: '/about',
        },
      ];

      renderComponent({ items });

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    it('should handle items with undefined sub-items', () => {
      const items = [
        {
          title: 'Home',
          url: '/home',
          items: undefined,
        },
      ];

      renderComponent({ items });

      expect(screen.getByText('Home')).toBeInTheDocument();
      const chevrons = screen.queryAllByTestId('lucide-chevronright');
      expect(chevrons).toHaveLength(0);
    });
  });
});

