import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './Home';
import { useAuthStore, useAiStore } from '@paynless/store';
import type { User } from '@paynless/types';

// Mock IntersectionObserver for framer-motion
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;

// --- Mocks ---
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useAiStore: vi.fn(),
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

    expect(screen.getByText('AI-Powered Planning Engine')).toBeInTheDocument();
    expect(screen.getByText('Build Plans That')).toBeInTheDocument();
    expect(screen.getByText('Actually Work')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Describe your goals and watch multiple AI models collaborate/
      )
    ).toBeInTheDocument();
  });


  it('should not call loadAiConfig or startNewChat when user is not authenticated', () => {
    const loadAiConfig = vi.fn();
    const startNewChat = vi.fn();
    mockUseAiStore.mockReturnValue({
      loadAiConfig,
      startNewChat,
      availableProviders: [],
    });
    mockUseAuthStore.mockReturnValue({ user: null });

    renderComponent();

    expect(loadAiConfig).not.toHaveBeenCalled();
    expect(startNewChat).not.toHaveBeenCalled();
  });

  it('should call loadAiConfig and startNewChat when user is authenticated', () => {
    const loadAiConfig = vi.fn();
    const startNewChat = vi.fn();
    mockUseAiStore.mockReturnValue({
      loadAiConfig,
      startNewChat,
      availableProviders: [],
    });
    const mockUser: User = {
      id: '123',
      email: 'test@test.com',
      created_at: new Date().toISOString(),
    };
    mockUseAuthStore.mockReturnValue({ user: mockUser });

    renderComponent();

    expect(loadAiConfig).toHaveBeenCalledTimes(1);
    expect(startNewChat).toHaveBeenCalledTimes(1);
  });

  describe('User Authentication', () => {
    it('should show "Get Started" button when user is logged out', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      const heroSection = screen.getByTestId('hero-section');
      const getStartedLink = within(heroSection).getByRole('link', {
        name: /Get Started/i,
      });
      expect(getStartedLink).toBeInTheDocument();
      expect(getStartedLink).toHaveAttribute('href', '/register');
    });

    it('should show "Go to Dashboard" button when user is logged in', () => {
      const mockUser: User = {
        id: '123',
        email: 'test@test.com',
        created_at: new Date().toISOString(),
      };
      mockUseAuthStore.mockReturnValue({ user: mockUser });
      renderComponent();

      const heroSection = screen.getByTestId('hero-section');
      const dashboardLink = within(heroSection).getByRole('link', { name: /Go to Dashboard/i });
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });
  });

  describe('Navigation Badges', () => {
    it('should render navigation badges section with 5 links', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      const badgesContainer = screen.getByTestId('navigation-badges');
      const vibeCoderLink = within(badgesContainer).getByRole('link', { name: /Vibecoders/i });
      const indieHackerLink = within(badgesContainer).getByRole('link', { name: /Indiehackers/i });
      const startupLink = within(badgesContainer).getByRole('link', { name: /Startups/i });
      const agencyLink = within(badgesContainer).getByRole('link', { name: /Agencies/i });
      const pricingLink = within(badgesContainer).getByRole('link', { name: /Pricing/i });

      expect(vibeCoderLink).toBeInTheDocument();
      expect(indieHackerLink).toBeInTheDocument();
      expect(startupLink).toBeInTheDocument();
      expect(agencyLink).toBeInTheDocument();
      expect(pricingLink).toBeInTheDocument();
    });

    it('should have badge links pointing to correct routes', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      const badgesContainer = screen.getByTestId('navigation-badges');
      expect(within(badgesContainer).getByRole('link', { name: /Vibecoders/i })).toHaveAttribute('href', '/vibecoder');
      expect(within(badgesContainer).getByRole('link', { name: /Indiehackers/i })).toHaveAttribute('href', '/indiehacker');
      expect(within(badgesContainer).getByRole('link', { name: /Startups/i })).toHaveAttribute('href', '/startup');
      expect(within(badgesContainer).getByRole('link', { name: /Agencies/i })).toHaveAttribute('href', '/agency');
      expect(within(badgesContainer).getByRole('link', { name: /Pricing/i })).toHaveAttribute('href', '/pricing');
    });

    it('should position badges in Hero section', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      const badgesContainer = screen.getByTestId('navigation-badges');
      expect(badgesContainer).toBeInTheDocument();
      expect(badgesContainer.closest('section')).toBeInTheDocument();
    });
  });

  describe('PricingSection', () => {
    it('should render PricingSection component', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      expect(screen.getByTestId('pricing-section')).toBeInTheDocument();
    });
  });

  describe('Section Order', () => {
    it('should render sections in correct order: Hero → ProcessSteps → StatsSection → FeatureCards → UseCases → PricingSection → CTASection', () => {
      mockUseAuthStore.mockReturnValue({ user: null });
      renderComponent();

      const container = screen.getByTestId('homepage-container');
      const sections = container.querySelectorAll('[data-testid]');
      const sectionIds = Array.from(sections).map((s) => s.getAttribute('data-testid'));

      expect(sectionIds).toContain('hero-section');
      expect(sectionIds).toContain('process-steps');
      expect(sectionIds).toContain('stats-section');
      expect(sectionIds).toContain('feature-cards');
      expect(sectionIds).toContain('use-cases');
      expect(sectionIds).toContain('pricing-section');
      expect(sectionIds).toContain('cta-section');

      const heroIndex = sectionIds.indexOf('hero-section');
      const pricingIndex = sectionIds.indexOf('pricing-section');
      const ctaIndex = sectionIds.indexOf('cta-section');
      const useCasesIndex = sectionIds.indexOf('use-cases');

      expect(heroIndex).toBe(0);
      expect(pricingIndex).toBeGreaterThan(useCasesIndex);
      expect(ctaIndex).toBeGreaterThan(pricingIndex);
    });
  });
}); 