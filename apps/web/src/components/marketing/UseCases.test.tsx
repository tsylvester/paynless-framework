import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { UseCases } from './UseCases.tsx';

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

describe('UseCases', () => {
  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <UseCases />
      </BrowserRouter>
    );
  };

  it('renders 4 segment cards with correct titles', () => {
    renderComponent();
    expect(screen.getByText('Vibecoders')).toBeInTheDocument();
    expect(screen.getByText('Indiehackers & Solo Developers')).toBeInTheDocument();
    expect(screen.getByText('Startups & Small Teams')).toBeInTheDocument();
    expect(screen.getByText('Agencies & Freelancers')).toBeInTheDocument();
  });

  it('renders correct one-liner for Vibecoders segment', () => {
    renderComponent();
    expect(screen.getByText("Stop burning money on 'please fix' — give your agent a real plan.")).toBeInTheDocument();
  });

  it('renders correct one-liner for Indiehackers segment', () => {
    renderComponent();
    expect(screen.getByText("You know how to code. You just don't know this stack yet.")).toBeInTheDocument();
  });

  it('renders correct one-liner for Startups segment', () => {
    renderComponent();
    expect(screen.getByText("Clock's ticking. You can't afford weeks of planning, or none at all.")).toBeInTheDocument();
  });

  it('renders correct one-liner for Agencies segment', () => {
    renderComponent();
    expect(screen.getByText("Your client won't pay for discovery. Your team pays the price.")).toBeInTheDocument();
  });

  it('renders 3 bullet items for each segment card', () => {
    renderComponent();
    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBe(12);
  });

  it('renders Vibe Coders card with link to /vibecoder', () => {
    renderComponent();
    const vibecoderCard = screen.getByText('Vibecoders').closest('a');
    expect(vibecoderCard).toHaveAttribute('href', '/vibecoder');
  });

  it('renders Indie Hackers card with link to /indiehacker', () => {
    renderComponent();
    const indiehackerCard = screen.getByText('Indiehackers & Solo Developers').closest('a');
    expect(indiehackerCard).toHaveAttribute('href', '/indiehacker');
  });

  it('renders Startups card with link to /startup', () => {
    renderComponent();
    const startupCard = screen.getByText('Startups & Small Teams').closest('a');
    expect(startupCard).toHaveAttribute('href', '/startup');
  });

  it('renders Agencies card with link to /agency', () => {
    renderComponent();
    const agencyCard = screen.getByText('Agencies & Freelancers').closest('a');
    expect(agencyCard).toHaveAttribute('href', '/agency');
  });

  it('renders segment-focused section heading', () => {
    renderComponent();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('Perfect For Every Builder')).not.toBeInTheDocument();
  });

  it('renders section badge text', () => {
    renderComponent();
    expect(screen.getByText('Built For You')).toBeInTheDocument();
  });

  it('renders 4 card icons', () => {
    renderComponent();
    const iconContainers = document.querySelectorAll('.w-12.h-12');
    expect(iconContainers.length).toBe(4);
  });

  it('renders cards with gradient backgrounds', () => {
    renderComponent();
    const cards = document.querySelectorAll('[class*="bg-gradient-to-br"]');
    expect(cards.length).toBe(4);
  });
});
