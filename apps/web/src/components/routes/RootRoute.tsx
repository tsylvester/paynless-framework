import { Outlet } from 'react-router-dom';
import { NavigateInjector } from '../../App';

// Root route component that handles layout and renders nested routes
export function RootRoute() {
  // It should render the basic layout/structure common to all pages, 
  // or just the Outlet if layout is handled higher up or within specific child routes.
  // We also render NavigateInjector here so it has access to the router context.
  return (
    <>
      <NavigateInjector />
      {/* Render the matched child route element here */}
      <Outlet /> 
    </>
  );
  // OLD Logic: Always render HomePage for the root route
  // return <HomePage />;
} 