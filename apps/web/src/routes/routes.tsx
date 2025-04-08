import { Navigate } from 'react-router-dom';
import { AppRoute } from '@paynless/types';
import { LoginPage } from '../pages/Login';
import { RegisterPage } from '../pages/Register';
import { DashboardPage } from '../pages/Dashboard';
import { ProfilePage } from '../pages/Profile';
import { SubscriptionPage } from '../pages/Subscription';
import { UserRole } from '@paynless/types';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { SubscriptionSuccessPage } from '../pages/SubscriptionSuccess';
import { RootRoute } from '../components/routes/RootRoute';

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
    allowedRoles: [UserRole.USER],
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