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
import { SocialFeedPage } from '../pages/social/SocialFeed';
import { PostDetailPage } from '../pages/social/PostDetail';
import { UserProfilePage } from '../pages/social/UserProfile';
import { MessagingPage } from '../pages/messaging/Messaging';
import { ConversationPage } from '../pages/messaging/Conversation';
import { DiscoverUsersPage } from '../pages/DiscoverUsers';
import { NotificationsPage } from '../pages/Notifications';
import { CalendarPage } from '../pages/Calendar';
import { EventsPage } from '../pages/Events';
import { LocationsPage } from '../pages/Locations';
import { MyContentPage } from '../pages/MyContent';
import { CommunitiesPage } from '../pages/Communities';
import { useAuth } from '../hooks/useAuth';

// Root route component that handles both authenticated and unauthenticated states
function RootRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/feed" replace /> : <HomePage />;
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
  // Feed Routes
  {
    path: '/feed',
    element: <ProtectedRoute><SocialFeedPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/feed/post/:postId',
    element: <ProtectedRoute><PostDetailPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/feed/profile/:userId',
    element: <ProtectedRoute><UserProfilePage /></ProtectedRoute>,
    requireAuth: true,
  },
  // Messaging Routes
  {
    path: '/messages',
    element: <ProtectedRoute><MessagingPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/messages/:conversationId',
    element: <ProtectedRoute><ConversationPage /></ProtectedRoute>,
    requireAuth: true,
  },
  // New Routes
  {
    path: '/discover',
    element: <ProtectedRoute><DiscoverUsersPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/notifications',
    element: <ProtectedRoute><NotificationsPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/calendar',
    element: <ProtectedRoute><CalendarPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/events',
    element: <ProtectedRoute><EventsPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/locations',
    element: <ProtectedRoute><LocationsPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/my-content',
    element: <ProtectedRoute><MyContentPage /></ProtectedRoute>,
    requireAuth: true,
  },
  {
    path: '/communities',
    element: <ProtectedRoute><CommunitiesPage /></ProtectedRoute>,
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