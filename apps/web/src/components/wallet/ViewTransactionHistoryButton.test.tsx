import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ViewTransactionHistoryButton } from './ViewTransactionHistoryButton';

describe('ViewTransactionHistoryButton', () => {
  it('should render a button with the correct text', () => {
    render(
      <MemoryRouter>
        <ViewTransactionHistoryButton />
      </MemoryRouter>
    );
    // The user changed the text to "Transaction History"
    const buttonElement = screen.getByRole('link', { name: /transaction history/i });
    expect(buttonElement).toBeInTheDocument();
  });

  it('should be a link pointing to /transaction-history', () => {
    render(
      <MemoryRouter>
        <ViewTransactionHistoryButton />
      </MemoryRouter>
    );
    const linkElement = screen.getByRole('link', { name: /transaction history/i });
    expect(linkElement).toHaveAttribute('href', '/transaction-history');
  });

  // Optional: Test click navigation if your setup allows for interaction testing easily
  // For example, with user-event:
  /*
  it('should navigate to /transaction-history when clicked', async () => {
    const user = userEvent.setup();
    let testLocation;
    render(
      <MemoryRouter initialEntries={['/']}>
        <ViewTransactionHistoryButton />
        <Routes>
          <Route path="/transaction-history" element={<div data-testid="history-page">History Page</div>} />
          <Route path="*" element={<LocationDisplay location={testLocation} />} />
        </Routes>
      </MemoryRouter>
    );

    const buttonElement = screen.getByRole('link', { name: /transaction history/i });
    await user.click(buttonElement);
    
    // This assertion depends on how you capture location or check for rendered content
    // For instance, if using a helper to expose location or checking for content of the new page:
    expect(screen.getByTestId('history-page')).toBeInTheDocument();
  });

  // Helper component to display current location (if needed for more complex navigation tests)
  /*
  const LocationDisplay = ({ location }) => {
    location.current = useLocation();
    return null;
  };
  */
}); 