import React from 'react';
import { Layout } from '../components/layout/Layout';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function DashboardPage() {
  const { user, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
        </div>
      </Layout>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return (
    <Layout>
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        
        <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">
              Welcome back, {user.firstName || user.email}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Your personalized dashboard.
            </p>
          </div>
          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Dashboard cards would go here */}
              <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900">Account Summary</h3>
                  <div className="mt-3 text-sm text-gray-500">
                    <p>User ID: {user.id}</p>
                    <p>Email: {user.email}</p>
                    <p>Role: {user.role}</p>
                    <p>Created: {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
                  <div className="mt-3 text-sm text-gray-500">
                    <p>No recent activity to display.</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
                  <div className="mt-3 text-sm text-gray-500">
                    <ul className="divide-y divide-gray-200">
                      <li className="py-2">
                        <a href="/profile" className="text-indigo-600 hover:text-indigo-900">
                          Edit profile
                        </a>
                      </li>
                      <li className="py-2">
                        <a href="/settings" className="text-indigo-600 hover:text-indigo-900">
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