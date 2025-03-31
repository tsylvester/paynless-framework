import React from 'react';
import { Layout } from '../components/layout/Layout';
import { ArrowRight, Database, Lock, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function HomePage() {
  const { user } = useAuth();
  
  return (
    <Layout>
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl md:text-6xl">
            <span className="block">Welcome to</span>
            <span className="block text-indigo-600">API-Driven Application</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            A modern application built with React and Supabase, using API-first architecture
            to support web, iOS, and Android platforms.
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
              >
                Go to Dashboard
                <ArrowRight className="ml-2" size={20} />
              </Link>
            ) : (
              <>
                <div className="rounded-md shadow">
                  <Link
                    to="/register"
                    className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
                  >
                    Get Started
                  </Link>
                </div>
                <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                  <Link
                    to="/login"
                    className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                  >
                    Log In
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Features section */}
        <div className="py-12 bg-white">
          <div className="max-w-xl mx-auto px-4 sm:px-6 lg:max-w-7xl lg:px-8">
            <h2 className="sr-only">Our features</h2>
            <dl className="space-y-10 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-8">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <Server className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">API-First Design</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Built with a proper separation of concerns and API-first approach to support
                  multiple platforms from a single backend.
                </dd>
              </div>
              
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <Database className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Supabase Backend</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Powered by Supabase for database, authentication, storage, and real-time functionality
                  with PostgreSQL under the hood.
                </dd>
              </div>
              
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <Lock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Secure Authentication</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Industry-standard JWT-based authentication with proper security measures and
                  user management system.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </Layout>
  );
}