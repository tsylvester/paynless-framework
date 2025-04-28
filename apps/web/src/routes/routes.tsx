import { Navigate } from 'react-router-dom';
import { AppRoute } from '@paynless/types';
import { LoginPage } from '../pages/Login';
import { RegisterPage } from '../pages/Register';
import { DashboardPage } from '../pages/Dashboard';
import { ProfilePage } from '../pages/Profile';
import { SubscriptionPage } from '../pages/Subscription';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { SubscriptionSuccessPage } from '../pages/SubscriptionSuccess';
import { RootRoute } from '../components/routes/RootRoute';
import AiChatPage from '../pages/AiChat';
import Notifications from '../pages/Notifications';

export const routes: AppRoute[] = [
  {
    path: '/',
    element: <RootRoute />,
  },
  {
    path: 'login',
    element: <LoginPage />,
  },
  {
    path: 'register',
    element: <RegisterPage />,
  },
  {
    path: 'dashboard',
    element: <ProtectedRoute><DashboardPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'chat',
    element: <ProtectedRoute><AiChatPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'notifications',
    element: <ProtectedRoute><Notifications /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'profile',
    element: <ProtectedRoute><ProfilePage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'subscription',
    element: <ProtectedRoute><SubscriptionPage /></ProtectedRoute>,
    requireAuth: true,
    allowedRoles: ['user'],
  },
  {
    path: 'subscriptionsuccess',
    element: <ProtectedRoute><SubscriptionSuccessPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'admin',
    element: <ProtectedRoute allowedRoles={['admin']}><div>Admin Page</div></ProtectedRoute>,
    requireAuth: true,
    allowedRoles: ['admin'],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];