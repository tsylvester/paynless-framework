import { vi } from 'vitest';

// Create persistent mocks for react-router-dom hooks
export const mockNavigate = vi.fn();

// You can add mocks for other hooks like useParams, useLocation if needed
// export const mockUseParams = vi.fn().mockReturnValue({});
// export const mockUseLocation = vi.fn().mockReturnValue({ pathname: '/' });

// Actual mock setup for the module
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual, // Keep actual components like MemoryRouter, Link etc.
    useNavigate: () => mockNavigate,
    // useParams: () => mockUseParams(),
    // useLocation: () => mockUseLocation(),
  };
}); 