import { Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import { NavigateInjector } from '../../App';
import { Layout } from '../layout/Layout';

// Root route component that handles layout and renders nested routes
export function RootRoute() {
  // Render the main layout and the Outlet within it.
  // NavigateInjector is rendered outside the Layout, 
  // but it might be better inside if it needs layout context (unlikely).
  return (
    <>
      <NavigateInjector />
      <Layout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        }>
          <Outlet /> 
        </Suspense>
      </Layout>
    </>
  );
  // OLD Logic: Always render HomePage for the root route
  // return <HomePage />;
} 