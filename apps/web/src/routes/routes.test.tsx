import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Suspense } from 'react';
import {
  mockedUseAuthStoreHookLogic,
  resetAuthStoreMock,
} from '../mocks/authStore.mock';

vi.mock('@paynless/store', () => ({
  useAuthStore: mockedUseAuthStoreHookLogic,
}));

vi.mock('../pages/SegmentLandingPageRoute', () => ({
  SegmentLandingPageRoute: () => (
    <div data-testid="segment-landing-page-route">Segment Landing Page</div>
  ),
}));

vi.mock('../pages/Home', () => ({
  HomePage: () => <div data-testid="home-page">Home Page</div>,
}));

vi.mock('../pages/Login', () => ({
  LoginPage: () => <div data-testid="login-page">Login Page</div>,
}));

vi.mock('../pages/Register', () => ({
  RegisterPage: () => <div data-testid="register-page">Register Page</div>,
}));

vi.mock('../pages/Dashboard', () => ({
  DashboardPage: () => <div data-testid="dashboard-page">Dashboard Page</div>,
}));

vi.mock('../components/routes/RootRoute', async () => {
  const { Outlet: RouterOutlet } = await import('react-router-dom');
  return {
    RootRoute: () => (
      <div data-testid="root-route">
        <RouterOutlet />
      </div>
    ),
  };
});

vi.mock('../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}));

async function renderRoute(initialPath: string) {
  const { router } = await import('./routes');
  
  const memoryRouter = createMemoryRouter(router.routes, {
    initialEntries: [initialPath],
  });

  return render(
    <Suspense fallback={<div>Loading...</div>}>
      <RouterProvider router={memoryRouter} />
    </Suspense>
  );
}

describe('routes.tsx', () => {
  beforeEach(() => {
    resetAuthStoreMock();
    vi.clearAllMocks();
  });

  describe('segment landing page routes', () => {
    it('renders SegmentLandingPageRoute for /vibecoder', async () => {
      await renderRoute('/vibecoder');
      await waitFor(() => {
        expect(screen.getByTestId('segment-landing-page-route')).toBeInTheDocument();
      });
    });

    it('renders SegmentLandingPageRoute for /indiehacker', async () => {
      await renderRoute('/indiehacker');
      await waitFor(() => {
        expect(screen.getByTestId('segment-landing-page-route')).toBeInTheDocument();
      });
    });

    it('renders SegmentLandingPageRoute for /startup', async () => {
      await renderRoute('/startup');
      await waitFor(() => {
        expect(screen.getByTestId('segment-landing-page-route')).toBeInTheDocument();
      });
    });

    it('renders SegmentLandingPageRoute for /agency', async () => {
      await renderRoute('/agency');
      await waitFor(() => {
        expect(screen.getByTestId('segment-landing-page-route')).toBeInTheDocument();
      });
    });

    it('segment routes are public (no ProtectedRoute wrapper around segment content)', async () => {
      await renderRoute('/vibecoder');
      await waitFor(() => {
        expect(screen.getByTestId('segment-landing-page-route')).toBeInTheDocument();
      });
      const segmentElement = screen.getByTestId('segment-landing-page-route');
      const protectedRouteWrapper = segmentElement.closest('[data-testid="protected-route"]');
      expect(protectedRouteWrapper).toBeNull();
    });
  });

  describe('public routes', () => {
    it('renders HomePage at /', async () => {
      await renderRoute('/');
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });
    });

    it('renders LoginPage at /login', async () => {
      await renderRoute('/login');
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('renders RegisterPage at /register', async () => {
      await renderRoute('/register');
      await waitFor(() => {
        expect(screen.getByTestId('register-page')).toBeInTheDocument();
      });
    });
  });

  describe('protected routes', () => {
    it('wraps /dashboard with ProtectedRoute', async () => {
      await renderRoute('/dashboard');
      await waitFor(() => {
        expect(screen.getByTestId('protected-route')).toBeInTheDocument();
      });
    });
  });

  describe('catch-all redirect', () => {
    it('redirects unknown multi-segment routes to /', async () => {
      await renderRoute('/foo/bar/nonexistent');
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });
    });
  });
});
