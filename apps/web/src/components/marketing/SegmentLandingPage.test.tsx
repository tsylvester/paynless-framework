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
    expect(screen.getByText('Vibecoders')).toBeTruthy();
    expect(screen.getByText("Stop burning money on 'please fix' — give your AI agent a real plan.")).toBeTruthy();
  });

  it('renders scenario blockquote with segment story', () => {
    renderComponent();
    expect(screen.getByText(/Jamie used Bolt to build a custom to-do list/)).toBeTruthy();
  });

  it('renders tabbed doc reader with 2 tabs matching featured doc labels', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: 'Business Case' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Work Plan' })).toBeTruthy();
  });

  it('renders all 18 document titles in the See All section', () => {
    renderComponent();
    expect(screen.getByRole('link', { name: 'Business Case' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Feature Specifications' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Success Metrics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Technical Approach' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Business Case Critique' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dependency Map' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Non-Functional Requirements' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Risk Register' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Technical Feasibility' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Product Requirements' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'System Architecture' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tech Stack' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Master Plan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Milestones' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Technical Requirements' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Work Plan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Recommendations' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Updated Master Plan' })).toBeTruthy();
  });

  it('renders 5 how-it-works steps with segment-specific descriptions', () => {
    renderComponent();
    expect(screen.getByText('Proposal')).toBeTruthy();
    expect(screen.getByText('Describe what you want in plain language.')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('AI critiques the proposal and identifies gaps.')).toBeTruthy();
    expect(screen.getByText('Refinement')).toBeTruthy();
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('Implementation')).toBeTruthy();
    expect(screen.getByText('Get a work plan your AI agent can follow.')).toBeTruthy();
  });

  it('renders FAQ items with questions and answers', () => {
    renderComponent();
    expect(screen.getByText("But I've already tried AI tools — they just break things.")).toBeTruthy();
    expect(screen.getByText('Generic AI tools lose context after a few prompts.')).toBeTruthy();
    expect(screen.getByText('What if my project is too simple for all this planning?')).toBeTruthy();
    expect(screen.getByText('Even simple projects benefit from clear scope.')).toBeTruthy();
  });

  it('CTA links include correct ref param for the segment', () => {
    renderComponent();
    const ctaLinks = screen.getAllByRole('link', { name: /get started free/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/register?ref=vibecoder');
    });
  });

  it('shows Go to Dashboard when user is logged in', () => {
    act(() => {
      useAuthStore.setState({ user: { id: 'user-123' } }, true);
    });
    renderComponent();
    const dashboardLinks = screen.getAllByRole('link', { name: /go to dashboard/i });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /get started free/i })).toBeNull();
  });

  it('shows Get Started Free when user is not logged in', () => {
    renderComponent();
    const ctaLinks = screen.getAllByRole('link', { name: /get started free/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /go to dashboard/i })).toBeNull();
  });
});
