import React from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Landing: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 py-12">
      <div className="text-center max-w-4xl">
        <div className="flex justify-center">
          <Shield className="h-16 w-16 text-blue-600 mb-4" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
          Welcome to Auth Framework
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          A robust authentication system built with React, Vite, TypeScript, and Supabase.
        </p>

        {user ? (
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/profile"
              className="px-6 py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              View Profile
            </Link>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/signin"
              className="px-6 py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Landing;