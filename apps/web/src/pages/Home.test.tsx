import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './Home';
import { useAuthStore, useAiStore } from '@paynless/store';
import type { User } from '@paynless/types';

// --- Mocks ---
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useAiStore: vi.fn(),
}));

vi.mock('../components/dialectic/CreateDialecticProjectForm', () => ({
  CreateDialecticProjectForm: () => <div data-testid="create-dialectic-project-form" />,
}));

const mockUseAuthStore = useAuthStore as unknown as Mock;
const mockUseAiStore = useAiStore as unknown as Mock;

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for AI store for all tests
    mockUseAiStore.mockReturnValue({
      loadAiConfig: vi.fn(),
      startNewChat: vi.fn(),
      availableProviders: [],
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
  };

  it('should render the main hero section content', () => {
    mockUseAuthStore.mockReturnValue({ user: null });
    renderComponent();

    expect(screen.getByText('Automate Software Planning')).toBeInTheDocument();
    expect(screen.getByText('Paynless Coding')).toBeInTheDocument();
    expect(
      screen.getByText('Build Better Software Faster')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Generate requirements, user stories, and detailed implementation plans in seconds.'
      )
    ).toBeInTheDocument();
  });

  it('should render the dialectic project creation section', () => {
    mockUseAuthStore.mockReturnValue({ user: null });
    renderComponent();
    expect(screen.getByTestId('create-dialectic-project-form')).toBeInTheDocument();
    expect(screen.getByText('Describe what you want to build or upload an .md project file.')).toBeInTheDocument();
  });


  it('should call loadAiConfig and startNewChat on mount', () => {
    const loadAiConfig = vi.fn();
    const startNewChat = vi.fn();
    mockUseAiStore.mockReturnValue({
      loadAiConfig,
      startNewChat,
      availableProviders: [],
    });
    mockUseAuthStore.mockReturnValue({ user: null });

    renderComponent();

    expect(loadAiConfig).toHaveBeenCalledTimes(1);
    expect(startNewChat).toHaveBeenCalledTimes(1);
  });

  describe('User Authentication', () => {
    it('should show "Get Started" button when user is logged out', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      const getStartedLink = screen.getByRole('link', {
        name: /Get Started/i,
      });
      expect(getStartedLink).toBeInTheDocument();
      expect(getStartedLink).toHaveAttribute('href', '/register');
    });

    it('should show "Try It Now" button when user is logged in', () => {
      const mockUser: User = {
        id: '123',
        email: 'test@test.com',
        created_at: new Date().toISOString(),
      };
      mockUseAuthStore.mockReturnValue({ user: mockUser });
      renderComponent();

      const dashboardLink = screen.getByRole('link', { name: /Try It Now/i });
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });
  });
}); 