import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavProjects } from './nav-projects';
import type { DialecticProject } from '@paynless/types';
import {
  setDialecticStateValues,
  getDialecticStoreActions,
  resetDialecticStoreMock,
} from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/store', async () => {
  const dialecticMock = await import('../../mocks/dialecticStore.mock');
  return {
    __esModule: true,
    useDialecticStore: vi.fn(dialecticMock.useDialecticStore),
  };
});

// Mock UI components
vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sidebar-group" className={className}>
      {children}
    </div>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-group-label">{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  SidebarMenuButton: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <div data-testid="sidebar-menu-button-as-child">
          {children}
        </div>
      );
    }
    return (
      <div data-testid="sidebar-menu-button">{children}</div>
    );
  },
  SidebarMenuItem: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sidebar-menu-item" className={className}>
      {children}
    </div>
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
    Loader2: createIconMock('Loader2'),
  };
});

describe('NavProjects', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDialecticStoreMock();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NavProjects />
        </QueryClientProvider>
      </MemoryRouter>
    );
  };

  const createMockProject = (overrides?: Partial<DialecticProject>): DialecticProject => {
    return {
      id: 'project-1',
      user_id: 'user-1',
      project_name: 'Test Project',
      selected_domain_id: 'domain-1',
      dialectic_domains: { name: 'General' },
      selected_domain_overlay_id: null,
      repo_url: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      process_template_id: null,
      dialectic_process_templates: null,
      isLoadingProcessTemplate: false,
      processTemplateError: null,
      contributionGenerationStatus: 'idle',
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
      ...overrides,
    };
  };

  describe('Loading state', () => {
    it('should render Loader2 spinner when isLoading is true', () => {
      setDialecticStateValues({
        projects: [],
        isLoadingProjects: true,
      });

      renderComponent();

      const loader = screen.getByTestId('lucide-loader2');
      expect(loader).toBeInTheDocument();
      expect(loader).toHaveClass('animate-spin');
    });

    it('should not render projects list when isLoading is true', () => {
      setDialecticStateValues({
        projects: [createMockProject()],
        isLoadingProjects: true,
      });

      renderComponent();

      const menu = screen.queryByTestId('sidebar-menu');
      expect(menu).not.toBeInTheDocument();
    });
  });

  describe('Empty projects list', () => {
    it('should render SidebarGroup with empty menu when projects array is empty', () => {
      setDialecticStateValues({
        projects: [],
        isLoadingProjects: false,
      });

      renderComponent();

      const group = screen.getByTestId('sidebar-group');
      expect(group).toBeInTheDocument();
      const menu = screen.getByTestId('sidebar-menu');
      expect(menu).toBeInTheDocument();
      expect(menu).toBeEmptyDOMElement();
    });

    it('should render SidebarGroupLabel with "Projects" text', () => {
      setDialecticStateValues({
        projects: [],
        isLoadingProjects: false,
      });

      renderComponent();

      const label = screen.getByTestId('sidebar-group-label');
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent('Projects');
    });
  });

  describe('Projects list rendering', () => {
    it('should render single project when projects array has one item', () => {
      const project = createMockProject({
        id: 'project-1',
        project_name: 'My Project',
      });

      setDialecticStateValues({
        projects: [project],
        isLoadingProjects: false,
      });

      renderComponent();

      expect(screen.getByText('My Project')).toBeInTheDocument();
    });

    it('should render all projects when projects array has multiple items', () => {
      const project1 = createMockProject({
        id: 'project-1',
        project_name: 'Project One',
      });
      const project2 = createMockProject({
        id: 'project-2',
        project_name: 'Project Two',
      });
      const project3 = createMockProject({
        id: 'project-3',
        project_name: 'Project Three',
      });

      setDialecticStateValues({
        projects: [project1, project2, project3],
        isLoadingProjects: false,
      });

      renderComponent();

      expect(screen.getByText('Project One')).toBeInTheDocument();
      expect(screen.getByText('Project Two')).toBeInTheDocument();
      expect(screen.getByText('Project Three')).toBeInTheDocument();
    });

    it('should render correct number of menu items matching projects count', () => {
      const project1 = createMockProject({ id: 'project-1', project_name: 'Project One' });
      const project2 = createMockProject({ id: 'project-2', project_name: 'Project Two' });

      setDialecticStateValues({
        projects: [project1, project2],
        isLoadingProjects: false,
      });

      renderComponent();

      const menuItems = screen.getAllByTestId('sidebar-menu-item');
      expect(menuItems).toHaveLength(2);
    });
  });

  describe('Project links', () => {
    it('should link each project to /dialectic/{project.id}', () => {
      const project = createMockProject({
        id: 'project-123',
        project_name: 'Test Project',
      });

      setDialecticStateValues({
        projects: [project],
        isLoadingProjects: false,
      });

      renderComponent();

      const link = screen.getByText('Test Project').closest('a');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/dialectic/project-123');
    });

    it('should create correct links for multiple projects', () => {
      const project1 = createMockProject({ id: 'project-1', project_name: 'Project One' });
      const project2 = createMockProject({ id: 'project-2', project_name: 'Project Two' });

      setDialecticStateValues({
        projects: [project1, project2],
        isLoadingProjects: false,
      });

      renderComponent();

      const link1 = screen.getByText('Project One').closest('a');
      expect(link1).toHaveAttribute('href', '/dialectic/project-1');

      const link2 = screen.getByText('Project Two').closest('a');
      expect(link2).toHaveAttribute('href', '/dialectic/project-2');
    });
  });

  describe('Project names', () => {
    it('should display project_name for each project', () => {
      const project = createMockProject({
        id: 'project-1',
        project_name: 'Custom Project Name',
      });

      setDialecticStateValues({
        projects: [project],
        isLoadingProjects: false,
      });

      renderComponent();

      expect(screen.getByText('Custom Project Name')).toBeInTheDocument();
    });

    it('should display different project names correctly', () => {
      const project1 = createMockProject({ id: 'project-1', project_name: 'Alpha Project' });
      const project2 = createMockProject({ id: 'project-2', project_name: 'Beta Project' });

      setDialecticStateValues({
        projects: [project1, project2],
        isLoadingProjects: false,
      });

      renderComponent();

      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
      expect(screen.getByText('Beta Project')).toBeInTheDocument();
    });
  });

  describe('SidebarGroup className', () => {
    it('should have group-data-[collapsible=icon]:hidden className', () => {
      setDialecticStateValues({
        projects: [],
        isLoadingProjects: false,
      });

      renderComponent();

      const group = screen.getByTestId('sidebar-group');
      expect(group).toHaveClass('group-data-[collapsible=icon]:hidden');
    });
  });

  describe('SidebarGroupLabel', () => {
    it('should display "Projects" text', () => {
      setDialecticStateValues({
        projects: [],
        isLoadingProjects: false,
      });

      renderComponent();

      const label = screen.getByTestId('sidebar-group-label');
      expect(label).toHaveTextContent('Projects');
    });
  });

  describe('useQuery integration', () => {
    it('should call fetchDialecticProjects when component mounts', async () => {
      setDialecticStateValues({
        projects: [],
        isLoadingProjects: false,
      });

      renderComponent();

      const actions = getDialecticStoreActions();
      await waitFor(() => {
        expect(actions.fetchDialecticProjects).toHaveBeenCalledTimes(1);
      });
    });

    it('should call fetchDialecticProjects even when projects are already loaded', async () => {
      const project = createMockProject();
      setDialecticStateValues({
        projects: [project],
        isLoadingProjects: false,
      });

      renderComponent();

      const actions = getDialecticStoreActions();
      await waitFor(() => {
        expect(actions.fetchDialecticProjects).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('SidebarMenuItem className', () => {
    it('should have px-1 className on each menu item', () => {
      const project1 = createMockProject({ id: 'project-1', project_name: 'Project One' });
      const project2 = createMockProject({ id: 'project-2', project_name: 'Project Two' });

      setDialecticStateValues({
        projects: [project1, project2],
        isLoadingProjects: false,
      });

      renderComponent();

      const menuItems = screen.getAllByTestId('sidebar-menu-item');
      menuItems.forEach((item) => {
        expect(item).toHaveClass('px-1');
      });
    });
  });
});

