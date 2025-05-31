import { Navigate, RouteObject, createBrowserRouter } from 'react-router-dom';
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
import { AcceptInvitePage } from '../pages/AcceptInvitePage';
import { OrganizationHubPage } from '../pages/OrganizationHubPage';
import { OrganizationFocusedViewPage } from '../pages/OrganizationFocusedViewPage';
import { TransactionHistoryPage } from '../pages/TransactionHistory';
import { HomePage } from '../pages/Home';
import { DialecticProjectsPage } from '../pages/DialecticProjectsPage';
import { CreateDialecticProjectPage } from '../pages/CreateDialecticProjectPage';
import { DialecticProjectDetailsPage } from '../pages/DialecticProjectDetailsPage';
//import { ForgotPassword } from '../pages/ForgotPassword';
//import { ResetPassword } from '../pages/ResetPassword';
//import { VerifyEmail } from '../pages/VerifyEmail';

// Import the new wrapper and the demo component
//import { TauriOnlyWrapper } from '../components/routes/TauriOnlyWrapper';
import { WalletBackupDemoCard } from '../components/demos/WalletBackupDemo/WalletBackupDemoCard';
import { ConfigFileManager } from '@/components/features/ConfigFileManager';

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
        path: 'notifications',
        element: (
          <ProtectedRoute>
            <NotificationsPage />
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