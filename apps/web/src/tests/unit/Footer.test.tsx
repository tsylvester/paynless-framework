import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Footer } from './Footer';
import { analytics } from '@paynless/analytics-client';

// Mock analytics
vi.mock('@paynless/analytics-client', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

// Keep ref to mock function
let mockAnalyticsTrack: vi.Mock;

// Basic test suite for the Footer component
describe('Footer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsTrack = vi.mocked(analytics.track);
  });

  // Helper function to render the Footer within a Router context
  const renderFooter = () => {
    return render(
      <BrowserRouter> 
        <Footer />
      </BrowserRouter>
    );
  };

  it('should render without crashing', () => {
    renderFooter();
    // Check if the footer element itself is rendered
    expect(screen.getByRole('contentinfo')).toBeInTheDocument(); 
  });

  it('should display the copyright notice', () => {
    renderFooter();
    // Use stringContaining to ignore the dynamic year but match the rest
    expect(screen.getByText(/Paynless Framework\. All rights reserved\./i)).toBeInTheDocument();
    // Alternative using regex to match the copyright symbol and year
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(`© ${currentYear} Paynless Framework. All rights reserved.`)).toBeInTheDocument();
  });

  it('should display navigation links', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /terms of service/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contact us/i })).toBeInTheDocument();
  });

  it('should have correct href attributes for links', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: /contact us/i })).toHaveAttribute('href', '/contact');
  });

  it.each([
    { linkName: /privacy policy/i, destination: '/privacy' },
    { linkName: /terms of service/i, destination: '/terms' },
    { linkName: /contact us/i, destination: '/contact' },
    { linkName: /Paynless Framework. All rights reserved./i, destination: 'https://paynless.app' },
  ])('should call analytics.track when link "$linkName" is clicked', async ({ linkName, destination }) => {
    renderFooter();
    
    const link = screen.getByRole('link', { name: linkName });
    await fireEvent.click(link);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Navigation: Clicked Footer Link', { destination });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
  });
}); 