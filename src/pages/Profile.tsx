import React from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Calendar } from 'lucide-react';

const Profile: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  // Format date for better display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const createdAt = user.created_at ? formatDate(user.created_at) : 'N/A';

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center py-10 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl w-full">
        <div className="flex items-center mb-8">
          <div className="bg-blue-100 p-4 rounded-full">
            <User className="h-10 w-10 text-blue-600" />
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-gray-800">User Profile</h1>
            <p className="text-gray-600">Your account information</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-start">
              <Mail className="h-5 w-5 text-gray-500 mt-1 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-500">Email Address</p>
                <p className="mt-1 text-lg text-gray-800">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-start">
              <Calendar className="h-5 w-5 text-gray-500 mt-1 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-500">Account Created</p>
                <p className="mt-1 text-lg text-gray-800">{createdAt}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Account Actions</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="/auth/reset-password"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Change Password
              </a>
              <button
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Update Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;