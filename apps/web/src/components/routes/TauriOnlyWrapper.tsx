import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Wrapper component to restrict access to routes intended only for the Tauri environment
export const TauriOnlyWrapper: React.FC = () => {
  const { platformCapabilities, isLoadingCapabilities, capabilityError } = usePlatform();

  if (isLoadingCapabilities) {
    // Optional: Show a generic loading skeleton while checking platform
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (capabilityError) {
    // Optional: Show an error if platform detection failed
    return (
      <Alert variant="destructive" className="m-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Platform Detection Error</AlertTitle>
        <AlertDescription>
          Could not determine the application platform: {capabilityError.message}
        </AlertDescription>
      </Alert>
    );
  }

  // If capabilities are loaded and platform is Tauri, render the nested routes
  if (platformCapabilities?.platform === 'tauri') {
    return <Outlet />;
  }

  // Otherwise, redirect to home page (or show an access denied message)
  // Redirecting is often cleaner UX than showing a dead page.
  return <Navigate to="/" replace />;

  /* Alternative: Show message instead of redirecting
  return (
    <Alert variant="default" className="m-4">
      <Info className="h-4 w-4" />
      <AlertTitle>Desktop App Required</AlertTitle>
      <AlertDescription>
        This feature is only available in the desktop application.
      </AlertDescription>
    </Alert>
  );
  */
}; 