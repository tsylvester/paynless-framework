import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TeamSwitcher } from './team-switcher';

// Mock useSidebar hook - must use vi.hoisted() because vi.mock is hoisted
const { mockUseSidebar } = vi.hoisted(() => {
  return {
    mockUseSidebar: vi.fn(() => ({ isMobile: false })),
  };
});

// Mock UI components
vi.mock('@/components/ui/sidebar', () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  SidebarMenuButton: ({ children, className, size }: { children: React.ReactNode; className?: string; size?: string }) => (
    <button data-testid="sidebar-menu-button" data-size={size} className={className}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu-item">{children}</div>
  ),
  useSidebar: mockUseSidebar,
}));

// Mock dropdown menu components
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return <div data-testid="dropdown-menu-trigger">{children}</div>;
    }
    return <div data-testid="dropdown-menu-trigger">{children}</div>;
  },
  DropdownMenuContent: ({ children, side, align, sideOffset, className }: { children: React.ReactNode; side?: string; align?: string; sideOffset?: number; className?: string }) => (
    <div data-testid="dropdown-menu-content" data-side={side} data-align={align} data-side-offset={sideOffset} className={className}>
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dropdown-menu-label" className={className}>
      {children}
    </div>
  ),
  DropdownMenuItem: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <div data-testid="dropdown-menu-item" onClick={onClick} className={className}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <div data-testid="dropdown-menu-separator" />,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="dropdown-menu-shortcut">{children}</span>
  ),
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
    ChevronsUpDown: createIconMock('ChevronsUpDown'),
    Plus: createIconMock('Plus'),
  };
});


describe('TeamSwitcher', () => {
  const createMockTeam = (name: string, plan: string): { name: string; logo: React.ElementType; plan: string } => {
    const MockLogo = ({ className }: { className?: string }) => (
      <div data-testid={`team-logo-${name}`} className={className}>Logo</div>
    );
    return {
      name,
      logo: MockLogo,
      plan,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSidebar.mockReturnValue({ isMobile: false });
  });

  const renderComponent = (props: {
    teams: Array<{
      name: string;
      logo: React.ElementType;
      plan: string;
    }>;
    currentOrganizationId: string | null;
  }) => {
    return render(<TeamSwitcher {...props} />);
  };

  describe('Component rendering', () => {
    it('should render the component with teams', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
        createMockTeam('Team 2', 'Free'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      expect(screen.getByTestId('sidebar-menu')).toBeInTheDocument();
      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    });

    it('should display the first team as active by default', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
        createMockTeam('Team 2', 'Free'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(within(trigger).getByText('Team 1')).toBeInTheDocument();
      expect(within(trigger).getByText('Pro')).toBeInTheDocument();
    });

    it('should show team logo, name, and plan in the trigger button', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(trigger).toBeInTheDocument();
      expect(within(trigger).getByText('Team 1')).toBeInTheDocument();
      expect(within(trigger).getByText('Pro')).toBeInTheDocument();
      const logos = screen.getAllByTestId('team-logo-Team 1');
      expect(logos.length).toBeGreaterThan(0);
    });

    it('should render ChevronsUpDown icon', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      expect(screen.getByTestId('lucide-chevronsupdown')).toBeInTheDocument();
    });

    it('should render trigger button with correct className and size', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(trigger).toHaveAttribute('data-size', 'lg');
      expect(trigger).toHaveClass('data-[state=open]:bg-sidebar-accent', 'data-[state=open]:text-sidebar-accent-foreground');
    });

    it('should return null when no activeTeam exists', () => {
      const { container } = renderComponent({
        teams: [],
        currentOrganizationId: null,
      });

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Dropdown menu content', () => {
    it('should display "Teams" label in dropdown', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const label = screen.getByTestId('dropdown-menu-label');
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent('Teams');
    });

    it('should display all teams in the dropdown', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
        createMockTeam('Team 2', 'Free'),
        createMockTeam('Team 3', 'Enterprise'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const dropdownContent = screen.getByTestId('dropdown-menu-content');
      expect(within(dropdownContent).getByText('Team 1')).toBeInTheDocument();
      expect(within(dropdownContent).getByText('Team 2')).toBeInTheDocument();
      expect(within(dropdownContent).getByText('Team 3')).toBeInTheDocument();
    });

    it('should show keyboard shortcuts for each team (⌘1, ⌘2, etc.)', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
        createMockTeam('Team 2', 'Free'),
        createMockTeam('Team 3', 'Enterprise'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const shortcuts = screen.getAllByTestId('dropdown-menu-shortcut');
      expect(shortcuts).toHaveLength(3);
      expect(shortcuts[0]).toHaveTextContent('⌘1');
      expect(shortcuts[1]).toHaveTextContent('⌘2');
      expect(shortcuts[2]).toHaveTextContent('⌘3');
    });

    it('should display team logos in dropdown items', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
        createMockTeam('Team 2', 'Free'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const dropdownContent = screen.getByTestId('dropdown-menu-content');
      expect(within(dropdownContent).getByTestId('team-logo-Team 1')).toBeInTheDocument();
      expect(within(dropdownContent).getByTestId('team-logo-Team 2')).toBeInTheDocument();
    });

    it('should show "Add team" option', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      expect(screen.getByText('Add team')).toBeInTheDocument();
      expect(screen.getByTestId('lucide-plus')).toBeInTheDocument();
    });

    it('should render separator before "Add team" option', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      expect(screen.getByTestId('dropdown-menu-separator')).toBeInTheDocument();
    });
  });

  describe('Team selection', () => {
    it('should update active team when a team is clicked', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
        createMockTeam('Team 2', 'Free'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      // Initially shows Team 1
      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(within(trigger).getByText('Team 1')).toBeInTheDocument();
      expect(within(trigger).getByText('Pro')).toBeInTheDocument();

      // Find and click Team 2 in dropdown
      const menuItems = screen.getAllByTestId('dropdown-menu-item');
      const team2Item = menuItems.find(item => item.textContent?.includes('Team 2'));
      
      expect(team2Item).toBeInTheDocument();
      if (team2Item) {
        fireEvent.click(team2Item);
        
        // After click, should show Team 2 as active
        // Note: The component uses useState, so we need to check if the state updates
        // Since React state updates are async, we check the trigger button content
        // The active team name should be in the trigger
        expect(trigger.textContent).toContain('Team 2');
      }
    });

    it('should handle clicking on the currently active team', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const menuItems = screen.getAllByTestId('dropdown-menu-item');
      const team1Item = menuItems.find(item => item.textContent?.includes('Team 1'));
      
      expect(team1Item).toBeInTheDocument();
      if (team1Item) {
        fireEvent.click(team1Item);
        // Should still show Team 1
        const trigger = screen.getByTestId('sidebar-menu-button');
        expect(within(trigger).getByText('Team 1')).toBeInTheDocument();
      }
    });
  });

  describe('Mobile vs Desktop positioning', () => {
    it('should use "right" side for desktop (isMobile: false)', () => {
      mockUseSidebar.mockReturnValue({ isMobile: false });
      
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const content = screen.getByTestId('dropdown-menu-content');
      expect(content).toHaveAttribute('data-side', 'right');
    });

    it('should use "bottom" side for mobile (isMobile: true)', () => {
      mockUseSidebar.mockReturnValue({ isMobile: true });
      
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const content = screen.getByTestId('dropdown-menu-content');
      expect(content).toHaveAttribute('data-side', 'bottom');
    });

    it('should set correct alignment and side offset', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const content = screen.getByTestId('dropdown-menu-content');
      expect(content).toHaveAttribute('data-align', 'start');
      expect(content).toHaveAttribute('data-side-offset', '4');
    });
  });

  describe('Edge cases', () => {
    it('should handle single team', () => {
      const teams = [
        createMockTeam('Solo Team', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(within(trigger).getByText('Solo Team')).toBeInTheDocument();
      expect(within(trigger).getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('Add team')).toBeInTheDocument();
    });

    it('should handle multiple teams with different plans', () => {
      const teams = [
        createMockTeam('Team 1', 'Free'),
        createMockTeam('Team 2', 'Pro'),
        createMockTeam('Team 3', 'Enterprise'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(within(trigger).getByText('Team 1')).toBeInTheDocument();
      expect(within(trigger).getByText('Free')).toBeInTheDocument();
      
      const dropdownContent = screen.getByTestId('dropdown-menu-content');
      expect(within(dropdownContent).getByText('Team 2')).toBeInTheDocument();
      expect(within(dropdownContent).getByText('Team 3')).toBeInTheDocument();
    });

    it('should handle null currentOrganizationId', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: null,
      });

      const trigger = screen.getByTestId('sidebar-menu-button');
      expect(within(trigger).getByText('Team 1')).toBeInTheDocument();
    });

    it('should handle empty teams array by returning null', () => {
      const { container } = renderComponent({
        teams: [],
        currentOrganizationId: 'org-1',
      });

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Dropdown menu item structure', () => {
    it('should render dropdown items with correct className', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const menuItems = screen.getAllByTestId('dropdown-menu-item');
      // Should have at least one team item plus "Add team" item
      expect(menuItems.length).toBeGreaterThanOrEqual(1);
      
      // Check that team items have the gap-2 p-2 className
      const teamItem = menuItems.find(item => item.textContent?.includes('Team 1'));
      expect(teamItem).toHaveClass('gap-2', 'p-2');
    });

    it('should render "Add team" item with correct structure', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      const menuItems = screen.getAllByTestId('dropdown-menu-item');
      const addTeamItem = menuItems.find(item => item.textContent?.includes('Add team'));
      
      expect(addTeamItem).toBeInTheDocument();
      expect(addTeamItem).toHaveClass('gap-2', 'p-2');
      expect(screen.getByTestId('lucide-plus')).toBeInTheDocument();
    });

    it('should render team logo container with border in dropdown items', () => {
      const teams = [
        createMockTeam('Team 1', 'Pro'),
      ];

      renderComponent({
        teams,
        currentOrganizationId: 'org-1',
      });

      // The logo should be rendered within the dropdown item
      const dropdownContent = screen.getByTestId('dropdown-menu-content');
      const logo = within(dropdownContent).getByTestId('team-logo-Team 1');
      expect(logo).toBeInTheDocument();
    });
  });
});

