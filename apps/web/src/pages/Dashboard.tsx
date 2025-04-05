import { Layout } from '../components/layout/Layout';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@paynless/store';

export function DashboardPage() {
  // Get user AND profile from the store
  const { user, profile, isLoading } = useAuthStore(state => ({ 
    user: state.user,
    profile: state.profile,
    isLoading: state.isLoading 
  }));
  
  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  // Determine the name to display, prioritizing profile, then user, then email
  const displayName = profile?.first_name || user.first_name || user.email;
  // Determine role, prioritizing profile, then user (User object might not have role)
  const displayRole = profile?.role || user.role || 'user'; // Default to 'user' if unknown

  return (
    <Layout>
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-textPrimary">Dashboard</h1>
        
        <div className="mt-6 bg-surface shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-textPrimary">
              Welcome back, {displayName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-textSecondary">
              Your personalized dashboard.
            </p>
          </div>
          <div className="border-t border-border px-4 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Dashboard cards would go here */}
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">Account Summary</h3>
                  <div className="mt-3 text-sm text-textSecondary">
                    <p>User ID: {user.id}</p>
                    <p>Email: {user.email}</p>
                    {/* Display role from profile or fallback */}
                    <p>Role: {displayRole}</p> 
                    <p>Created: {new Date(user.created_at || profile?.created_at || Date.now()).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">Recent Activity</h3>
                  <div className="mt-3 text-sm text-textSecondary">
                    <p>No recent activity to display.</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">Quick Actions</h3>
                  <div className="mt-3 text-sm text-textSecondary">
                    <ul className="divide-y divide-border">
                      <li className="py-2">
                        <a href="/profile" className="text-primary hover:text-primary/90">
                          Edit profile
                        </a>
                      </li>
                      <li className="py-2">
                        <a href="/settings" className="text-primary hover:text-primary/90">
                          Account settings
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}