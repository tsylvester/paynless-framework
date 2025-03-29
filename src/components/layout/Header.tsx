import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { Shield, User, LogOut, ChevronDown, History, MessageSquare, CreditCard } from 'lucide-react';

const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { subscription } = useSubscription();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const location = useLocation();

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleSignOut = async () => {
    await signOut();
    setDropdownOpen(false);
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Determine if user has premium subscription
  const isPremium = subscription && subscription.subscription_plan_id !== 'free';

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and App Name */}
          <div className="flex">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <Shield className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">Mystic Soul</span>
            </Link>
          </div>

          {/* Nav Links */}
          {user && (
            <div className="hidden sm:flex sm:items-center space-x-4">
              <Link 
                to="/" 
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  isActive('/') 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Chat
                </div>
              </Link>
              
              <Link 
                to="/history" 
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  isActive('/history') 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center">
                  <History className="h-4 w-4 mr-1" />
                  History
                </div>
              </Link>

              <Link 
                to="/subscription" 
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  isActive('/subscription') 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center">
                  <CreditCard className="h-4 w-4 mr-1" />
                  Subscription
                  {isPremium && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                      Premium
                    </span>
                  )}
                </div>
              </Link>
            </div>
          )}

          {/* Auth Buttons */}
          <div className="flex items-center">
            {user ? (
              <div className="relative ml-3">
                <div>
                  <button
                    onClick={toggleDropdown}
                    className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 bg-gray-100 px-4 py-2 rounded-md"
                    aria-expanded="false"
                    aria-haspopup="true"
                  >
                    <span className="sr-only">Open user menu</span>
                    <span className="mr-2">{user.email}</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Dropdown menu */}
                {dropdownOpen && (
                  <div 
                    className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu"
                  >
                    <div className="py-1" role="none">
                      <Link 
                        to="/profile" 
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setDropdownOpen(false)}
                        role="menuitem"
                      >
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                      <Link 
                        to="/subscription" 
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setDropdownOpen(false)}
                        role="menuitem"
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Subscription
                        {isPremium && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                            Premium
                          </span>
                        )}
                      </Link>
                      <Link 
                        to="/history" 
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 sm:hidden"
                        onClick={() => setDropdownOpen(false)}
                        role="menuitem"
                      >
                        <History className="mr-2 h-4 w-4" />
                        Chat History
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex space-x-4">
                <Link
                  to="/signin"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;