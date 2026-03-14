import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PricingSection } from './PricingSection.tsx';

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

describe('PricingSection', () => {
  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <PricingSection />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    mockUser.mockReturnValue(null);
  });

  it('renders section heading', () => {
    renderComponent();
    expect(screen.getByText('Simple, Transparent Pricing')).toBeInTheDocument();
  });

  it('displays "1M tokens on signup" messaging', () => {
    renderComponent();
    expect(screen.getByText(/1M tokens free on signup/i)).toBeInTheDocument();
  });

  it('displays free tier info (100k tokens/mo)', () => {
    renderComponent();
    expect(screen.getByText(/100k tokens\/mo/i)).toBeInTheDocument();
  });

  it('displays base paid tier ($19.99 for 1M tokens/mo)', () => {
    renderComponent();
    expect(screen.getByText(/\$19\.99/)).toBeInTheDocument();
  });

  it('displays "more options available" text with link to /pricing', () => {
    renderComponent();
    expect(screen.getByText(/Extra, Premium, Annual/i)).toBeInTheDocument();
    const pricingLink = screen.getByRole('link', { name: /see all pricing options/i });
    expect(pricingLink).toHaveAttribute('href', '/pricing');
  });

  it('CTA shows "Get Started Free" when not authenticated', () => {
    mockUser.mockReturnValue(null);
    renderComponent();
    expect(screen.getByRole('link', { name: /Get Started Free/i })).toBeInTheDocument();
  });

  it('CTA shows "View Plans" when authenticated', () => {
    mockUser.mockReturnValue({ id: 'test-user-id' });
    renderComponent();
    expect(screen.getByRole('link', { name: /View Plans/i })).toBeInTheDocument();
  });

  it('renders link to /pricing', () => {
    renderComponent();
    const links = screen.getAllByRole('link');
    const pricingLinks = links.filter(link => link.getAttribute('href') === '/pricing');
    expect(pricingLinks.length).toBeGreaterThan(0);
  });
});
