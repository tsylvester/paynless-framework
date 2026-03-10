import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSidebar } from './app-sidebar';
import type { User, DialecticProject } from '@paynless/types';
import {
  mockSetAuthUser,
  mockSetAuthIsLoading,
  resetAuthStoreMock,
} from '../../mocks/authStore.mock';
import {
  mockSetState,
  resetAiStoreMock,
  getAiStoreState,
} from '../../mocks/aiStore.mock';
import {
  getDialecticStoreActions,
  setDialecticStateValues,
  resetDialecticStoreMock,
} from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/store', async () => {
  const authMock = await import('../../mocks/authStore.mock');
  const aiMock = await import('../../mocks/aiStore.mock');
  const dialecticMock = await import('../../mocks/dialecticStore.mock');
  return {
    __esModule: true,
    useAuthStore: vi.fn(authMock.mockedUseAuthStoreHookLogic),
    useAiStore: aiMock.useAiStore,
    useDialecticStore: vi.fn(dialecticMock.useDialecticStore),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock('@/components/sidebar/nav-main', () => ({
  NavMain: ({ items }: { items: Array<{ title: string; url: string; items?: Array<{ title: string; url: string }> }> }) => (
    <div data-testid="nav-main">
      {items.map((item) => (
        <div key={item.url}>
          {item.title}
          {item.items && item.items.map((nestedItem) => (
            <div key={nestedItem.url}>{nestedItem.title}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/sidebar/nav-projects', () => ({
  NavProjects: () => <div data-testid="nav-projects">Projects</div>,
}));

vi.mock('@/components/sidebar/nav-user', () => ({
  NavUser: ({ user }: { user: User | null }) => (
    <div data-testid="nav-user">{user ? user.email : 'No User'}</div>
  ),
}));

vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sidebar" className={className}>
      {children}
    </div>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-content">{children}</div>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-footer">{children}</div>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-header">{children}</div>
  ),
  SidebarMenuButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="sidebar-menu-button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const mockUseNavigate = vi.mocked(useNavigate);

describe('AppSidebar', () => {
  let queryClient: QueryClient;
  let mockNavigate: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStoreMock();
    resetAiStoreMock();
    resetDialecticStoreMock();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    mockNavigate = vi.fn();
    mockUseNavigate.mockReturnValue(mockNavigate);

    mockSetAuthUser(null);
    mockSetAuthIsLoading(false);

    mockSetState({
      chatsByContext: {
        personal: undefined,
        orgs: {},
      },
      isLoadingHistoryByContext: {
        personal: false,
        orgs: {},
      },
    });

    setDialecticStateValues({
      projects: [],
      isLoadingProjects: false,
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppSidebar />
        </QueryClientProvider>
      </MemoryRouter>
    );
  };

  it('should not call fetchDialecticProjects when user is not authenticated', async () => {
    mockSetAuthUser(null);
    mockSetAuthIsLoading(false);

    renderComponent();

    const actions = getDialecticStoreActions();
    await waitFor(() => {
      expect(actions.fetchDialecticProjects).not.toHaveBeenCalled();
    }, { timeout: 200 });
  });

  it('should call fetchDialecticProjects when user is authenticated', async () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);

    renderComponent();

    const actions = getDialecticStoreActions();
    await waitFor(() => {
      expect(actions.fetchDialecticProjects).toHaveBeenCalledTimes(1);
    });
  });

  it('should not call loadChatHistory when user is not authenticated', () => {
    mockSetAuthUser(null);
    mockSetAuthIsLoading(false);

    renderComponent();

    const aiState = getAiStoreState();
    expect(aiState.loadChatHistory).not.toHaveBeenCalled();
  });

  it('should call loadChatHistory when user is authenticated and conditions are met', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);

    renderComponent();

    const aiState = getAiStoreState();
    expect(aiState.loadChatHistory).toHaveBeenCalledWith('personal');
  });

  it('should not call loadChatHistory when personal chats are already loaded', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);
    mockSetState({
      chatsByContext: {
        personal: [],
        orgs: {},
      },
      isLoadingHistoryByContext: {
        personal: false,
        orgs: {},
      },
    });

    renderComponent();

    const aiState = getAiStoreState();
    expect(aiState.loadChatHistory).not.toHaveBeenCalled();
  });

  it('should render LOADING state when isLoading is true', () => {
    mockSetAuthUser(null);
    mockSetAuthIsLoading(true);

    renderComponent();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render NO_AUTH state when user is null and isLoading is false', () => {
    mockSetAuthUser(null);
    mockSetAuthIsLoading(false);

    renderComponent();

    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-menu-button')).toBeInTheDocument();
    expect(screen.getByTestId('nav-main')).toBeInTheDocument();
  });

  it('should render AUTHENTICATED state when user exists and isLoading is false', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);

    renderComponent();

    expect(screen.getByTestId('nav-user')).toBeInTheDocument();
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
    // AUTHENTICATED state renders two NavMain components (navMain and navSecondary)
    const navMainElements = screen.getAllByTestId('nav-main');
    expect(navMainElements).toHaveLength(2);
  });

  it('should call navigate with /login when Login button is clicked', () => {
    mockSetAuthUser(null);
    mockSetAuthIsLoading(false);

    renderComponent();

    const loginButton = screen.getByTestId('sidebar-menu-button');
    loginButton.click();

    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('should map projects correctly in navSecondary items', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    const mockProjects: DialecticProject[] = [
      {
        id: 'proj-1',
        project_name: 'Project 1',
        user_id: '123',
        selected_domain_id: 'domain-1',
        dialectic_domains: { name: 'Software' },
        selected_domain_overlay_id: null,
        initial_user_prompt: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [],
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
        repo_url: null,
      },
      {
        id: 'proj-2',
        project_name: 'Project 2',
        user_id: '123',
        selected_domain_id: 'domain-2',
        dialectic_domains: { name: 'Software' },
        selected_domain_overlay_id: null,
        initial_user_prompt: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [],
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
        repo_url: null,
      },
    ];
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);
    setDialecticStateValues({
      projects: mockProjects,
      isLoadingProjects: false,
    });

    renderComponent();

    // Verify both navMain and navSecondary are rendered (two NavMain components)
    const navMainElements = screen.getAllByTestId('nav-main');
    expect(navMainElements).toHaveLength(2);
    // Verify projects are mapped in navSecondary
    expect(screen.getByText('Project 1')).toBeInTheDocument();
    expect(screen.getByText('Project 2')).toBeInTheDocument();
  });

  it('should handle empty projects array without errors', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);
    setDialecticStateValues({
      projects: [],
      isLoadingProjects: false,
    });

    renderComponent();

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('should handle empty personal chats array without errors', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockSetAuthUser(mockUser);
    mockSetAuthIsLoading(false);
    mockSetState({
      chatsByContext: {
        personal: [],
        orgs: {},
      },
      isLoadingHistoryByContext: {
        personal: false,
        orgs: {},
      },
    });

    renderComponent();

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});

