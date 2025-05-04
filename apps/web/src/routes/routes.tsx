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
//import { ForgotPassword } from '../pages/ForgotPassword';
//import { ResetPassword } from '../pages/ResetPassword';
//import { VerifyEmail } from '../pages/VerifyEmail';
import { HomePage } from '../pages/Home';

// Import the new wrapper and the demo component
import { TauriOnlyWrapper } from '../components/routes/TauriOnlyWrapper';
import { WalletBackupDemoCard } from '../components/demos/WalletBackupDemo/WalletBackupDemoCard';

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
        path: 'admin',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <div>Admin Page Content Placeholder</div>
          </ProtectedRoute>
        ),
      },
      // --- Tauri Only Routes (Dev/Debug) --- 
      {
        element: <TauriOnlyWrapper />, // Apply the wrapper
        children: [
          {
            path: 'dev/wallet-backup',
            element: <WalletBackupDemoCard /> // The actual demo page
          },
          // Add other Tauri-only dev routes here in the future
        ]
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);