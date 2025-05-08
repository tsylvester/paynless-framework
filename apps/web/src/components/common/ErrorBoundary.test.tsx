import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary'; // Adjust path
import { logger } from '@paynless/utils';

// Mock the logger used within the component
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Component that throws an error
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Intentional Test Error');
  }
  return <div>Child Component Content</div>;
};

// --- Test Suite ---
describe('ErrorBoundary Component', () => {
  // Spy on console.error to suppress expected error messages in test output
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error output during tests, as React logs caught errors
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); 
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore(); 
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child Component Content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('renders default fallback UI when a child throws an error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child Component Content')).toBeNull();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('This part of the application encountered an error.')).toBeInTheDocument();
  });

  it('renders custom fallback message when provided and a child throws an error', () => {
    const customMessage = 'Custom error message here.';
    render(
      <ErrorBoundary fallbackMessage={customMessage}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child Component Content')).toBeNull();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(customMessage)).toBeInTheDocument();
    expect(screen.queryByText('This part of the application encountered an error.')).toBeNull();
  });

  it('calls logger.error when an error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    // Check if the mocked logger.error was called
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Uncaught error:',
      expect.any(Error), // The actual error object
      expect.objectContaining({ componentStack: expect.any(String) }) // The errorInfo object
    );
  });

  it('does not display error details in production by default', () => {
    // Default NODE_ENV in Vitest is usually 'test' or 'development', 
    // but ErrorBoundary checks specifically for 'development' to show details.
    // So, in a non-'development' simulated environment, details should be hidden.
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/Intentional Test Error/i)).toBeNull();
  });

  // Temporarily set NODE_ENV for this specific test
  it('displays error details in development environment', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // Simulate development
    
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Intentional Test Error/i)).toBeInTheDocument();
    
    process.env.NODE_ENV = originalNodeEnv; // Restore original NODE_ENV
  });
}); 