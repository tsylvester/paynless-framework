import { Navigate } from 'react-router-dom';
import { AppRoute } from '../types/route.types';
import { HomePage } from '../pages/Home';
import { LoginPage } from '../pages/Login';
import { RegisterPage } from '../pages/Register';
import { DashboardPage } from '../pages/Dashboard';
import { ProfilePage } from '../pages/Profile';
import { SubscriptionPage } from '../pages/Subscription';
import { UserRole } from '../types/auth.types';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { SubscriptionSuccessPage } from '../pages/SubscriptionSuccess';
import { useAuth } from '../hooks/useAuth';

// Root route component that handles both authenticated and unauthenticated states
function RootRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/dashboard" replace /> : <HomePage />;
}

export const routes: AppRoute[] = [
  {
    path: '/',
    element: <RootRoute />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/dashboard',
    element: <ProtectedRoute><DashboardPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/profile',
    element: <ProtectedRoute><ProfilePage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/subscription',
    element: <ProtectedRoute><SubscriptionPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/subscription/success',
    element: <ProtectedRoute><SubscriptionSuccessPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={[UserRole.ADMIN]}><div>Admin Page</div></ProtectedRoute>,
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];