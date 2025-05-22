'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@paynless/utils';

interface Props {
  children: ReactNode;
  fallback?: ReactNode; // Optional custom fallback component
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error assuming logger takes message and context/error object
    logger.error('[ErrorBoundary] Uncaught error:', { error: error.message, componentStack: errorInfo.componentStack });
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Default fallback UI
      return (
        <div className="p-4 text-center text-red-600 bg-red-50 border border-red-200 rounded-md">
          <h2 className="text-lg font-semibold">Oops, something went wrong.</h2>
          <p className="text-sm">
            We encountered an error. Please try refreshing the page or contact support if the problem persists.
          </p>
          {/* Conditionally render error details based on environment */}
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <pre className="mt-2 text-xs text-left whitespace-pre-wrap bg-red-100 p-2 rounded">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 