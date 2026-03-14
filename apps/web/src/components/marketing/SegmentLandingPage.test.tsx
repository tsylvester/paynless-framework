import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@paynless/store';
import { SegmentLandingPage } from './SegmentLandingPage.tsx';
import { SegmentContent } from '@paynless/types';

const IntersectionObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => []),
}));
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

const mockContent: SegmentContent = {
  slug: 'vibecoder',
  headline: 'Vibecoders',
  oneLiner: "Stop burning money on 'please fix' — give your AI agent a real plan.",
  painStatement: 'Test pain statement for vibecoders',
  scenario: 'Jamie used Bolt to build a custom to-do list and calorie tracker. It worked great until she tried to convert the webpage into an iOS app.',
  exampleInput: 'Create an iOS combined to-do list and calorie tracker',
  featuredDocs: [
    { tabLabel: 'Business Case', content: '# Business Case\n\nThis is the business case content.' },
    { tabLabel: 'Work Plan', content: '# Work Plan\n\nThis is the work plan content.' },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Proposal', description: 'Describe what you want in plain language.' },
    { stage: 2, title: 'Review', description: 'AI critiques the proposal and identifies gaps.' },
    { stage: 3, title: 'Refinement', description: 'Get architecture and stack decisions.' },
    { stage: 4, title: 'Planning', description: 'Receive a structured master plan.' },
    { stage: 5, title: 'Implementation', description: 'Get a work plan your AI agent can follow.' },
  ],
  faqItems: [
    { question: "But I've already tried AI tools — they just break things.", answer: 'Generic AI tools lose context after a few prompts.' },
    { question: 'What if my project is too simple for all this planning?', answer: 'Even simple projects benefit from clear scope.' },
  ],
  ctaRef: 'vibecoder',
  gradient: 'from-blue-500/20 to-cyan-500/20',
};

const authStoreInitialState = {
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  error: null,
};

describe('SegmentLandingPage', () => {
  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <SegmentLandingPage content={mockContent} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useAuthStore.setState(authStoreInitialState, true);
    });
  });

  it('renders hero section with segment headline and one-liner', () => {
    renderComponent();
    expect(screen.getByText('Vibecoders')).toBeInTheDocument();
    expect(screen.getByText("Stop burning money on 'please fix' — give your AI agent a real plan.")).toBeInTheDocument();
  });

  it('renders scenario blockquote with segment story', () => {
    renderComponent();
    expect(screen.getByText(/Jamie used Bolt to build a custom to-do list/)).toBeInTheDocument();
  });

  it('renders tabbed doc reader with 2 tabs matching featured doc labels', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: 'Business Case' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Work Plan' })).toBeInTheDocument();
  });

  it('renders all 18 document titles in the See All section', () => {
    renderComponent();
    expect(screen.getByText('Business Case', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Feature Specifications', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Success Metrics', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Technical Approach', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Business Case Critique', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Dependency Map', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Non-Functional Requirements', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Risk Register', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Technical Feasibility', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Product Requirements', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('System Architecture', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Tech Stack', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Master Plan', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Milestones', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Technical Requirements', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Work Plan', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Recommendations', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
    expect(screen.getByText('Updated Master Plan', { selector: '[data-testid="doc-title"]' })).toBeInTheDocument();
  });

  it('renders 5 how-it-works steps with segment-specific descriptions', () => {
    renderComponent();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Describe what you want in plain language.')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('AI critiques the proposal and identifies gaps.')).toBeInTheDocument();
    expect(screen.getByText('Refinement')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Implementation')).toBeInTheDocument();
    expect(screen.getByText('Get a work plan your AI agent can follow.')).toBeInTheDocument();
  });

  it('renders FAQ items with questions and answers', () => {
    renderComponent();
    expect(screen.getByText("But I've already tried AI tools — they just break things.")).toBeInTheDocument();
    expect(screen.getByText('Generic AI tools lose context after a few prompts.')).toBeInTheDocument();
    expect(screen.getByText('What if my project is too simple for all this planning?')).toBeInTheDocument();
    expect(screen.getByText('Even simple projects benefit from clear scope.')).toBeInTheDocument();
  });

  it('CTA links include correct ref param for the segment', () => {
    renderComponent();
    const ctaLinks = screen.getAllByRole('link', { name: /get started free/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/register?ref=vibecoder');
    });
  });

  it('shows Go to Dashboard when user is logged in', () => {
    act(() => {
      useAuthStore.setState({ user: { id: 'user-123' } }, true);
    });
    renderComponent();
    const dashboardLinks = screen.getAllByRole('link', { name: /go to dashboard/i });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /get started free/i })).not.toBeInTheDocument();
  });

  it('shows Get Started Free when user is not logged in', () => {
    renderComponent();
    const ctaLinks = screen.getAllByRole('link', { name: /get started free/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /go to dashboard/i })).not.toBeInTheDocument();
  });
});
