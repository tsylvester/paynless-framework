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
import NotificationsPage from '../pages/Notifications';
import { CreateOrganizationPage } from '../pages/CreateOrganization';
import { OrganizationListPage } from '../pages/OrganizationList';
import { OrganizationSettingsPage } from '../pages/OrganizationSettingsPage';
import { OrganizationMembersPage } from '../pages/OrganizationMembersPage';
import { AcceptInvitePage } from '../pages/AcceptInvitePage';

// Placeholder components for organization routes
const OrgLayout = () => <div>Organizations Layout (Placeholder - wraps list, create, and manage)</div>;
const OrgManageLayout = () => <div>Manage Organization Layout (Placeholder - wraps settings, members)</div>;
const OrgOverviewPage = () => <div>Organization Overview (Placeholder)</div>;

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
    // Add children routes for dashboard sections
    children: [
      {
        path: 'organizations',
        element: <ProtectedRoute><OrgLayout /></ProtectedRoute>,
        requireAuth: true,
        children: [
          {
            path: '',
            index: true,
            element: <ProtectedRoute><OrganizationListPage /></ProtectedRoute>,
            requireAuth: true,
          },
          {
            path: 'new',
            element: <ProtectedRoute><CreateOrganizationPage /></ProtectedRoute>,
            requireAuth: true,
          },
          {
            path: ':orgId',
            element: <ProtectedRoute><OrgManageLayout /></ProtectedRoute>,
            requireAuth: true,
            children: [
              {
                path: '',
                index: true,
                element: <ProtectedRoute><OrgOverviewPage /></ProtectedRoute>,
                requireAuth: true,
              },
              {
                path: 'settings',
                element: <ProtectedRoute><OrganizationSettingsPage /></ProtectedRoute>,
                requireAuth: true,
              },
              {
                path: 'members',
                element: <ProtectedRoute><OrganizationMembersPage /></ProtectedRoute>,
                requireAuth: true,
              },
            ]
          }
        ]
      }
    ]
  },
  {
    path: 'chat',
    element: <ProtectedRoute><AiChatPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'profile',
    element: <ProtectedRoute><ProfilePage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: 'notifications',
    element: <ProtectedRoute><NotificationsPage /></ProtectedRoute>,
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
    path: 'accept-invite/:token',
    element: <AcceptInvitePage />,
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