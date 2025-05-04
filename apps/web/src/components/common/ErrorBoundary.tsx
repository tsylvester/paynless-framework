import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { logger } from '@paynless/utils'; // Optional: for logging errors

interface Props {
  children: ReactNode;
  fallbackMessage?: string; // Optional custom fallback message
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
    logger.error("[ErrorBoundary] Uncaught error:", { error, errorInfo });
  }

  public override render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            {this.props.fallbackMessage || 'This part of the application encountered an error.'}
            {/* Optional: Show error details in development */}
            {process.env['NODE_ENV'] === 'development' && this.state.error && (
              <pre className="mt-2 text-xs whitespace-pre-wrap">
                {this.state.error.toString()}
                {/* <br /> */}
                {/* {this.state.error.stack} */}
              </pre>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 