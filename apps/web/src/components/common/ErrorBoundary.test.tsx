import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import ErrorBoundary from './ErrorBoundary'; // Adjust path
import { logger } from '@paynless/utils';

// Mock the logger used within the component
vi.mock('@paynless/utils', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('@paynless/utils');
  return {
    ...actual, // Spread actual to keep other exports if any
    logger: {
      ...actual.logger, // Spread actual logger to keep other methods if any
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(), // This will be the spy target
      debug: vi.fn(), // Added debug mock
    },
  };
});

// Component that throws an error
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Intentional Test Error');
  }
  return <div>Child Component Content</div>;
};

// --- Test Suite ---
describe('ErrorBoundary Component', () => {
  let consoleErrorSpy: SpyInstance<[message?: any, ...optionalParams: any[]], void>;
  const originalNodeEnv = process.env['NODE_ENV']; // Store original NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Reset NODE_ENV before each test to ensure clean state
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    // Restore original NODE_ENV after each test
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child Component Content')).toBeInTheDocument();
    // Check that no part of the default error UI is present
    expect(screen.queryByText(/Oops, something went wrong/i)).toBeNull();
  });

  it('renders default fallback UI when a child throws an error', () => {
    // Default environment (test) should behave like development for showing error details
    process.env['NODE_ENV'] = 'development';
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child Component Content')).toBeNull();
    // Check for the actual default fallback UI elements
    expect(screen.getByText(/Oops, something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/We encountered an error. Please try refreshing the page or contact support if the problem persists./i)).toBeInTheDocument();
    // In dev/test, error message should be visible
    expect(screen.getByText('Intentional Test Error')).toBeInTheDocument();
  });

  it('renders custom fallback ReactNode when provided and a child throws an error', () => {
    const customFallbackNode = <div data-testid="custom-fallback">Custom Fallback UI Here</div>;
    render(
      <ErrorBoundary fallback={customFallbackNode}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child Component Content')).toBeNull();
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom Fallback UI Here')).toBeInTheDocument();
    // Default fallback UI should not be present
    expect(screen.queryByText(/Oops, something went wrong/i)).toBeNull();
  });

  it('renders custom fallback string when provided and a child throws an error', () => {
    const customFallbackString = "A simple error string fallback.";
    render(
      <ErrorBoundary fallback={customFallbackString}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child Component Content')).toBeNull();
    expect(screen.getByText(customFallbackString)).toBeInTheDocument();
    // Default fallback UI should not be present
    expect(screen.queryByText(/Oops, something went wrong/i)).toBeNull();
  });

  it('calls logger.error with correct details when an error is caught', () => {
    const testError = new Error('Intentional Test Error');
    // Modify ThrowingComponent locally or create a new one for this specific error instance if needed
    const CustomThrowingComponent = () => { throw testError; };

    render(
      <ErrorBoundary>
        <CustomThrowingComponent />
      </ErrorBoundary>
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Uncaught error:',
      // Check for an object containing the error message and componentStack
      expect.objectContaining({
        error: testError.message, // Match the exact message
        componentStack: expect.any(String) // errorInfo.componentStack
      })
    );
  });

  it('does not display error details in production environment', () => {
    process.env['NODE_ENV'] = 'production'; // Simulate production
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Oops, something went wrong/i)).toBeInTheDocument();
    // Error details (<pre> tag) should NOT be visible in production
    expect(screen.queryByText('Intentional Test Error')).toBeNull();
  });

  it('displays error details in development environment', () => {
    process.env['NODE_ENV'] = 'development'; // Simulate development
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Oops, something went wrong/i)).toBeInTheDocument();
    // Error details (<pre> tag) SHOULD be visible in development
    expect(screen.getByText('Intentional Test Error')).toBeInTheDocument();
  });

  it('displays error details in test environment (default Vitest)', () => {
    // No need to set process.env['NODE_ENV'], Vitest default is 'test'
    // which should behave like 'development' for this component's logic
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Oops, something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText('Intentional Test Error')).toBeInTheDocument();
  });
}); 