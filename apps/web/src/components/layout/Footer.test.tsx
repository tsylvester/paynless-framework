import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Footer } from './Footer';

// Basic test suite for the Footer component
describe('Footer Component', () => {
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
    expect(screen.getByText(/API App\. All rights reserved\./i)).toBeInTheDocument();
    // Alternative using regex to match the copyright symbol and year
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(`© ${currentYear} API App. All rights reserved.`)).toBeInTheDocument();
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

}); 