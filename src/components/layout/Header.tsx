import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  LogOut, 
  Menu, 
  X, 
  MessageCircle, 
  Bell, 
  Calendar as CalendarIcon,
  MapPin,
  Users,
  Layout as LayoutIcon,
  User,
  CreditCard,
  Search,
  Home,
  UserPlus,
  Building2
} from 'lucide-react';
import { ThemeSelector } from '../theme/ThemeSelector';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Check if a route is active
  const isActive = (path: string) => {
    return location.pathname === path;
  };
  
  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-primary font-bold text-xl">
                <Home className="h-6 w-6" />
              </Link>
            </div>
            <nav className="hidden sm:ml-6 sm:flex sm:space-x-4">
              <Link
                to="/feed"
                className={`${isActive('/feed') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Feed
              </Link>
              <Link
                to="/dashboard"
                className={`${isActive('/dashboard') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Dashboard
              </Link>              
              <Link
                to="/discover"
                className={`${isActive('/discover') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Discover
              </Link>
              <Link
                to="/notifications"
                className={`${isActive('/notifications') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Notifications
              </Link>
              <Link
                to="/messages"
                className={`${location.pathname.startsWith('/messages') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Messages
              </Link>
              <Link
                to="/calendar"
                className={`${isActive('/calendar') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Calendar
              </Link>
              <Link
                to="/events"
                className={`${isActive('/events') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Events
              </Link>
              <Link
                to="/locations"
                className={`${isActive('/locations') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Locations
              </Link>
              <Link
                to="/my-content"
                className={`${isActive('/my-content') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                My Content
              </Link>
              <Link
                to="/communities"
                className={`${isActive('/communities') 
                  ? 'border-primary text-textPrimary' 
                  : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Communities
              </Link>
            </nav>
          </div>
          
          <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
            <ThemeSelector />
            
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-surface"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.firstName || user.email}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <span className="text-sm text-textSecondary">
                    {user.firstName || user.email}
                  </span>
                </button>
                
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface rounded-lg shadow-lg border border-border z-50">
                    <div className="py-1">
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-sm text-textSecondary hover:bg-primary/10 hover:text-primary"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <User className="inline-block h-4 w-4 mr-2" />
                        Profile
                      </Link>
                      <Link
                        to="/subscription"
                        className="block px-4 py-2 text-sm text-textSecondary hover:bg-primary/10 hover:text-primary"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <CreditCard className="inline-block h-4 w-4 mr-2" />
                        Subscription
                      </Link>
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-textSecondary hover:bg-primary/10 hover:text-primary"
                      >
                        <LogOut className="inline-block h-4 w-4 mr-2" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex space-x-4">
                <Link
                  to="/login"
                  className="text-textPrimary hover:text-primary px-3 py-2 rounded-md text-sm font-medium"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-primary text-white hover:bg-opacity-90 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
          
          <div className="-mr-2 flex items-center sm:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-textSecondary hover:text-textPrimary hover:bg-surface focus:outline-none"
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="sm:hidden bg-surface">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              to="/feed"
              className={`${isActive('/feed') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
            >
              Feed
            </Link>
            <Link
              to="/discover"
              className={`${isActive('/discover') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <UserPlus className="h-5 w-5 mr-2" />
              Discover
            </Link>
            <Link
              to="/notifications"
              className={`${isActive('/notifications') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <Bell className="h-5 w-5 mr-2" />
              Notifications
            </Link>
            <Link
              to="/messages"
              className={`${location.pathname.startsWith('/messages') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <MessageCircle className="h-5 w-5 mr-2" />
              Messages
            </Link>
            <Link
              to="/calendar"
              className={`${isActive('/calendar') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <CalendarIcon className="h-5 w-5 mr-2" />
              Calendar
            </Link>
            <Link
              to="/events"
              className={`${isActive('/events') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <LayoutIcon className="h-5 w-5 mr-2" />
              Events
            </Link>
            <Link
              to="/locations"
              className={`${isActive('/locations') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <MapPin className="h-5 w-5 mr-2" />
              Locations
            </Link>
            <Link
              to="/my-content"
              className={`${isActive('/my-content') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <LayoutIcon className="h-5 w-5 mr-2" />
              My Content
            </Link>
            <Link
              to="/communities"
              className={`${isActive('/communities') 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium flex items-center`}
            >
              <Building2 className="h-5 w-5 mr-2" />
              Communities
            </Link>
          </div>
          
          <div className="pt-4 pb-3 border-t border-border">
            <div className="px-4">
              <ThemeSelector />
            </div>
            {user ? (
              <>
                <div className="flex items-center px-4 mt-4">
                  <div className="flex-shrink-0">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.firstName || user.email}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-textPrimary">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-sm font-medium text-textSecondary">{user.email}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-base font-medium text-textSecondary hover:text-textPrimary hover:bg-surface"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <User className="inline-block h-5 w-5 mr-2" />
                    Profile
                  </Link>
                  <Link
                    to="/subscription"
                    className="block px-4 py-2 text-base font-medium text-textSecondary hover:text-textPrimary hover:bg-surface"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <CreditCard className="inline-block h-5 w-5 mr-2" />
                    Subscription
                  </Link>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleLogout();
                    }}
                    className="block w-full text-left px-4 py-2 text-base font-medium text-textSecondary hover:text-textPrimary hover:bg-surface"
                  >
                    <LogOut className="inline-block h-5 w-5 mr-2" />
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-1">
                <Link
                  to="/login"
                  className="block px-4 py-2 text-base font-medium text-textSecondary hover:text-textPrimary hover:bg-surface"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="block px-4 py-2 text-base font-medium text-textSecondary hover:text-textPrimary hover:bg-surface"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Backdrop for user menu */}
      {isUserMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsUserMenuOpen(false)}
        />
      )}
    </header>
  );
}