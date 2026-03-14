import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SegmentLandingPageRoute } from './SegmentLandingPageRoute.tsx';
import {
  mockedUseAuthStoreHookLogic,
  resetAuthStoreMock,
} from '../mocks/authStore.mock';

vi.mock('@paynless/store', () => ({
  useAuthStore: mockedUseAuthStoreHookLogic,
}));

vi.mock('../components/marketing/SegmentLandingPage', () => ({
  SegmentLandingPage: ({ content }: { content: { headline: string } }) => (
    <div data-testid="segment-landing-page">{content.headline}</div>
  ),
}));

function renderWithSegment(segment: string) {
  return render(
    <MemoryRouter initialEntries={[`/for/${segment}`]}>
      <Routes>
        <Route path="/for/:segment" element={<SegmentLandingPageRoute />} />
        <Route path="/" element={<div data-testid="home-redirect">Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SegmentLandingPageRoute', () => {
  beforeEach(() => {
    resetAuthStoreMock();
  });

  describe('valid slugs render SegmentLandingPage with correct content', () => {
    it('renders SegmentLandingPage for vibecoder', () => {
      renderWithSegment('vibecoder');
      expect(screen.getByTestId('segment-landing-page')).toBeInTheDocument();
      expect(screen.getByText('Vibecoders')).toBeInTheDocument();
    });

    it('renders SegmentLandingPage for indiehacker', () => {
      renderWithSegment('indiehacker');
      expect(screen.getByTestId('segment-landing-page')).toBeInTheDocument();
      expect(screen.getByText('Indiehackers & Solo Developers')).toBeInTheDocument();
    });

    it('renders SegmentLandingPage for startup', () => {
      renderWithSegment('startup');
      expect(screen.getByTestId('segment-landing-page')).toBeInTheDocument();
      expect(screen.getByText('Startups & Small Teams')).toBeInTheDocument();
    });

    it('renders SegmentLandingPage for agency', () => {
      renderWithSegment('agency');
      expect(screen.getByTestId('segment-landing-page')).toBeInTheDocument();
      expect(screen.getByText('Agencies & Freelancers')).toBeInTheDocument();
    });
  });

  describe('invalid slugs redirect to /', () => {
    it('redirects to / for invalid-slug', () => {
      renderWithSegment('invalid-slug');
      expect(screen.getByTestId('home-redirect')).toBeInTheDocument();
      expect(screen.queryByTestId('segment-landing-page')).not.toBeInTheDocument();
    });

    it('redirects to / for random string', () => {
      renderWithSegment('foobar');
      expect(screen.getByTestId('home-redirect')).toBeInTheDocument();
    });

    it('redirects to / for numeric segment', () => {
      renderWithSegment('12345');
      expect(screen.getByTestId('home-redirect')).toBeInTheDocument();
    });
  });
});
