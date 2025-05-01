import { Outlet } from 'react-router-dom';
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
        <Outlet /> 
      </Layout>
    </>
  );
  // OLD Logic: Always render HomePage for the root route
  // return <HomePage />;
} 