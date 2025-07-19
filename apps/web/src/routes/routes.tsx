import { Navigate, RouteObject, createBrowserRouter } from 'react-router-dom';
import { lazy } from 'react';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { RootRoute } from '../components/routes/RootRoute';
// Import the new wrapper and the demo component
//import { TauriOnlyWrapper } from '../components/routes/TauriOnlyWrapper';
import { WalletBackupDemoCard } from '../components/demos/WalletBackupDemo/WalletBackupDemoCard';
import { ConfigFileManager } from '@/components/features/ConfigFileManager';

// Lazy load all page components
const DashboardPage = lazy(() => import('../pages/Dashboard').then(module => ({ default: module.DashboardPage })));
const LoginPage = lazy(() => import('../pages/Login').then(module => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('../pages/Register').then(module => ({ default: module.RegisterPage })));
const ChatPage = lazy(() => import('../pages/Chat').then(module => ({ default: module.ChatPage })));
const ProfilePage = lazy(() => import('../pages/Profile').then(module => ({ default: module.ProfilePage })));
const SubscriptionPage = lazy(() => import('../pages/Subscription').then(module => ({ default: module.SubscriptionPage })));
const SubscriptionSuccessPage = lazy(() => import('../pages/SubscriptionSuccess').then(module => ({ default: module.SubscriptionSuccessPage })));
const AiChatPage = lazy(() => import('../pages/AiChat')); // Default export
const NotificationsPage = lazy(() => import('../pages/Notifications')); // Default export
const AcceptInvitePage = lazy(() => import('../pages/AcceptInvitePage').then(module => ({ default: module.AcceptInvitePage })));
const OrganizationHubPage = lazy(() => import('../pages/OrganizationHubPage').then(module => ({ default: module.OrganizationHubPage })));
const OrganizationFocusedViewPage = lazy(() => import('../pages/OrganizationFocusedViewPage').then(module => ({ default: module.OrganizationFocusedViewPage })));
const TransactionHistoryPage = lazy(() => import('../pages/TransactionHistory').then(module => ({ default: module.TransactionHistoryPage })));
const HomePage = lazy(() => import('../pages/Home').then(module => ({ default: module.HomePage })));
const DialecticProjectsPage = lazy(() => import('../pages/DialecticProjectsPage').then(module => ({ default: module.DialecticProjectsPage })));
const CreateDialecticProjectPage = lazy(() => import('../pages/CreateDialecticProjectPage').then(module => ({ default: module.CreateDialecticProjectPage })));
const DialecticProjectDetailsPage = lazy(() => import('../pages/DialecticProjectDetailsPage').then(module => ({ default: module.DialecticProjectDetailsPage })));
const DialecticSessionDetailsPage = lazy(() => import('../pages/DialecticSessionDetailsPage').then(module => ({ default: module.DialecticSessionDetailsPage })));
//import { ForgotPassword } from '../pages/ForgotPassword';
//import { ResetPassword } from '../pages/ResetPassword';
//import { VerifyEmail } from '../pages/VerifyEmail';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootRoute />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      /*{
        path: 'forgot-password',
        element: <ForgotPassword />,
      },
      {
        path: 'reset-password',
        element: <ResetPassword />,
      },
      {
        path: 'verify-email',
        element: <VerifyEmail />,
      },*/
      {
        path: 'accept-invite/:token',
        element: <AcceptInvitePage />,
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'subscription',
        element: (
          <ProtectedRoute>
            <SubscriptionPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'subscription/success',
        element: (
          <ProtectedRoute>
            <SubscriptionSuccessPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'transaction-history',
        element: (
          <ProtectedRoute>
            <TransactionHistoryPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'chat',
        element: (
          <ProtectedRoute>
            <AiChatPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'new',
        element: (
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'notifications',
        element: (
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'chat/:chatId',
        element: (
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizations',
        element: (
          <ProtectedRoute>  
            <OrganizationHubPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizations/:orgId',
        element: (
          <ProtectedRoute>
            <OrganizationFocusedViewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dialectic',
        element: (
          <ProtectedRoute>
            <DialecticProjectsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dialectic/new',
        element: (
          <ProtectedRoute>
            <CreateDialecticProjectPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dialectic/:projectId',
        element: (
          <ProtectedRoute>
            <DialecticProjectDetailsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dialectic/:projectId/session/:sessionId',
        element: (
          <ProtectedRoute>
            <DialecticSessionDetailsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <div>Admin Page Content Placeholder</div>
          </ProtectedRoute>
        ),
      },
      // --- Tauri Only Routes (Dev/Debug) --- 
      // TEMPORARILY COMMENT OUT WRAPPER FOR TESTING REDIRECT
      // {
      //   element: <TauriOnlyWrapper />, 
      //   children: [
      //     // ... other routes inside ...
      //   ]
      // },

      // --- Temporarily place route outside wrapper --- 
      {
        path: 'dev/wallet', 
        element: (
          <ProtectedRoute>
             <WalletBackupDemoCard />
          </ProtectedRoute>
        )
      },
      {
        path: 'dev/config', 
        element: (
          <ProtectedRoute>
             <ConfigFileManager />
          </ProtectedRoute>
        )
      },
      // --- End Temporary Placement --- 

      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);