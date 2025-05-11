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
    // Find the paragraph containing the copyright notice
    const copyrightParagraph = screen.getByText((content, element) => {
      // Check if the element is a paragraph and contains the copyright symbol
      return element?.tagName.toLowerCase() === 'p' && content.includes('©');
    });
    expect(copyrightParagraph).toBeInTheDocument();
    // Check the full text content using a regex to match the dynamic year and structure
    const currentYear = new Date().getFullYear();
    // Simple regex, removing unnecessary escapes
    expect(copyrightParagraph.textContent).toMatch(`© ${currentYear} Paynless Framework. All rights reserved.`);
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