import React from 'react';

// Simple mock Layout component
export const Layout = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="mock-layout">{children}</div>;
}; 