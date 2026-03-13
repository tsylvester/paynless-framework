import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PricingPage } from './PricingPage.tsx';

const IntersectionObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => []),
}));
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

const mockUser = vi.fn();
vi.mock('@paynless/store', () => ({
  useAuthStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockUser() }),
}));

describe('PricingPage', () => {
  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    mockUser.mockReturnValue(null);
  });

  it('renders page heading "Pricing"', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /Choose Your Plan/i })).toBeInTheDocument();
  });

  it('renders Free plan card', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /^Free$/i })).toBeInTheDocument();
    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.getByText(/100k tokens\/mo/i)).toBeInTheDocument();
  });

  it('renders Monthly plan cards', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /^Monthly$/i })).toBeInTheDocument();
    expect(screen.getByText(/\$19\.99/)).toBeInTheDocument();
    expect(screen.getByText(/1M tokens\/mo/i)).toBeInTheDocument();
  });

  it('renders Annual plan cards with savings callout', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /^Annual$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/save/i).length).toBeGreaterThan(0);
  });

  it('renders One-time purchase options', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /Top-Up/i })).toBeInTheDocument();
  });

  it('CTA buttons link to /register?ref=pricing when not authenticated', () => {
    mockUser.mockReturnValue(null);
    renderComponent();
    const ctaLinks = screen.getAllByRole('link', { name: /Get Started Free/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach(link => {
      expect(link).toHaveAttribute('href', '/register?ref=pricing');
    });
  });

  it('CTA buttons link to /subscription when authenticated', () => {
    mockUser.mockReturnValue({ id: 'test-user-id' });
    renderComponent();
    const manageLinks = screen.getAllByRole('link', { name: /Manage Subscription/i });
    expect(manageLinks.length).toBeGreaterThan(0);
    manageLinks.forEach(link => {
      expect(link).toHaveAttribute('href', '/subscription');
    });
  });

  it('renders FAQ section', () => {
    renderComponent();
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument();
    expect(screen.getByText(/How do I cancel my subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/What payment methods do you accept/i)).toBeInTheDocument();
  });

  it('is accessible without authentication (public page)', () => {
    mockUser.mockReturnValue(null);
    renderComponent();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Choose Your Plan/i })).toBeInTheDocument();
  });

  it('displays signup bonus callout', () => {
    renderComponent();
    expect(screen.getByText(/1M tokens free on signup/i)).toBeInTheDocument();
  });
});
