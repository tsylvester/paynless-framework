import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@paynless/store'
import { useTheme } from '../../hooks/useTheme'
import {
  LogOut,
  Menu,
  X,
  User,
  CreditCard,
  Home,
  Sun,
  Moon,
} from 'lucide-react'

export function Header() {
  const { user, profile, logout } = useAuthStore((state) => ({
    user: state.user,
    profile: state.profile,
    logout: state.logout,
  }))

  const { colorMode, setColorMode } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('login')
  }

  // Check if a route is active
  const isActive = (path: string) => {
    return location.pathname === path
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-primary font-bold text-xl">
                <Home className="h-6 w-6" />
              </Link>
            </div>
            {user && (
              <nav className="hidden sm:ml-6 sm:flex sm:space-x-4">
                <Link
                  to="/dashboard"
                  className={`${
                    isActive('/dashboard')
                      ? 'border-primary text-textPrimary'
                      : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/chat"
                  className={`${
                    isActive('/chat')
                      ? 'border-primary text-textPrimary'
                      : 'border-transparent text-textSecondary hover:border-border hover:text-textPrimary'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Chat
                </Link>
              </nav>
            )}
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
            <button
              onClick={() =>
                setColorMode(colorMode === 'light' ? 'dark' : 'light')
              }
              className="p-2 rounded-lg text-textSecondary hover:bg-surface hover:text-textPrimary"
              aria-label={
                colorMode === 'light'
                  ? 'Switch to dark mode'
                  : 'Switch to light mode'
              }
            >
              {colorMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-surface"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {profile?.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt={profile.first_name || user.email || 'User Avatar'}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <span className="text-sm text-textSecondary">
                    {profile?.first_name || user.email}
                  </span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface rounded-lg shadow-xl border border-border z-50">
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
                          setIsUserMenuOpen(false)
                          handleLogout()
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
                  className="bg-primary text-white dark:text-black hover:bg-opacity-90 px-3 py-2 rounded-md text-sm font-medium"
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
        <div className="sm:hidden bg-surface border-t border-border">
          <div className="flex justify-end px-4 pt-2">
            <button
              onClick={() =>
                setColorMode(colorMode === 'light' ? 'dark' : 'light')
              }
              className="p-2 rounded-lg text-textSecondary hover:bg-surface hover:text-textPrimary"
              aria-label={
                colorMode === 'light'
                  ? 'Switch to dark mode'
                  : 'Switch to light mode'
              }
            >
              {colorMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
          {user ? (
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/chat"
                className={`${
                  isActive('/chat')
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary'
                } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
                onClick={() => setIsMenuOpen(false)}
              >
                Chat
              </Link>
            </div>
          ) : (
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/login"
                className="block pl-3 pr-4 py-2 border-l-4 text-base font-medium border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="block pl-3 pr-4 py-2 border-l-4 text-base font-medium border-transparent text-textSecondary hover:bg-surface hover:border-border hover:text-textPrimary"
              >
                Register
              </Link>
            </div>
          )}

          <div className="pt-4 pb-3 border-t border-border">
            {user && profile && (
              <>
                <div className="flex items-center px-4 mt-4">
                  <div className="flex-shrink-0">
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt={profile.first_name || user.email || 'User Avatar'}
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
                      {profile.first_name} {profile.last_name}
                    </div>
                    <div className="text-sm font-medium text-textSecondary">
                      {user.email}
                    </div>
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
                      setIsMenuOpen(false)
                      handleLogout()
                    }}
                    className="block w-full text-left px-4 py-2 text-base font-medium text-textSecondary hover:text-textPrimary hover:bg-surface"
                  >
                    <LogOut className="inline-block h-5 w-5 mr-2" />
                    Logout
                  </button>
                </div>
              </>
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
  )
}
