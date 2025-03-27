# Auth Framework

A robust authentication system built with React, Vite, TypeScript, and Supabase. This framework provides user authentication with sign-in, sign-up, and sign-out functionality, along with email validation and password reset capabilities.

## File Structure

```
/
├── .env                 # Environment variables
├── .env.example         # Example environment variables
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── SignIn.tsx         # Sign in component
│   │   │   ├── SignUp.tsx         # Sign up component
│   │   │   ├── SignOut.tsx        # Sign out component
│   │   │   ├── ResetPassword.tsx  # Reset password component
│   │   │   └── UpdatePassword.tsx # Update password component
│   │   └── layout/
│   │       ├── Header.tsx         # Application header with navigation
│   │       ├── Footer.tsx         # Application footer
│   │       └── Layout.tsx         # Main layout wrapper
│   ├── context/
│   │   └── AuthContext.tsx        # Authentication context provider
│   ├── pages/
│   │   ├── Home.tsx               # Home page with auth status display
│   │   ├── Landing.tsx            # Landing page
│   │   ├── Profile.tsx            # User profile page
│   │   └── AuthCallbackPage.tsx   # Handle auth callbacks
│   ├── services/
│   │   └── supabase.ts            # Supabase client and methods
│   ├── types/
│   │   └── auth.types.ts          # Type definitions for auth components
│   ├── utils/
│   │   ├── logger.ts              # Logging utility
│   │   ├── network.ts             # Network status monitoring
│   │   └── retry.ts               # Retry mechanism for API calls
│   ├── App.tsx                    # Main app component with routing
│   ├── index.css                  # Global styles
│   └── main.tsx                   # Entry point
├── supabase/
│   └── migrations/                # SQL migrations for database setup
├── tests/
│   ├── auth.test.tsx              # Tests for auth components
│   └── setup.ts                   # Test environment setup
├── package.json                   # Project dependencies
├── tsconfig.json                  # TypeScript configuration
└── vite.config.ts                 # Vite configuration
```

## Core Framework Files (Do Not Modify)

These files are fundamental to the authentication system and should not be modified:

* `src/context/AuthContext.tsx` - Provides authentication state and methods
  * Arguments: `children` (ReactNode)
  * Outputs: AuthContext with authentication state and methods

* `src/services/supabase.ts` - Handles Supabase integration
  * Arguments: None
  * Outputs: Supabase client and authentication helper functions

* `src/utils/logger.ts` - Logging service
  * Arguments: Message string and optional arguments
  * Outputs: Formatted console logs with timestamp and level

* `src/types/auth.types.ts` - TypeScript interfaces for auth system
  * Arguments: None
  * Outputs: Type definitions for authentication components and state

## Available Functions

### Auth Context (`src/context/AuthContext.tsx`)

The `AuthProvider` component provides the authentication context and the following functions:

```typescript
// Get the current authentication state
const { user, session, isLoading, error, networkStatus, authStatus, isOnline } = useAuth();

// Sign in with email and password
signIn(email: string, password: string): Promise<void>

// Sign up with email and password
signUp(email: string, password: string): Promise<void>

// Sign out the current user
signOut(): Promise<void>

// Send password reset email
resetPassword(email: string): Promise<void>

// Update user password
updatePassword(password: string): Promise<void>

// Retry authentication process if it fails
retryAuth(): Promise<void>
```

### Supabase Service (`src/services/supabase.ts`)

```typescript
// Get Supabase client instance
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Get current user
getUser(): Promise<User | null>

// Get current session
getSession(): Promise<Session | null>

// Refresh the current session
refreshSession(): Promise<boolean>

// Safely sign out the user (handles offline state)
safeSignOut(): Promise<boolean>

// Categorize authentication errors
categorizeAuthError(error: any): AuthErrorType
```

### Logger Service (`src/utils/logger.ts`)

```typescript
// Log an informational message
logger.info(message: string, ...args: unknown[]): void

// Log a warning message
logger.warn(message: string, ...args: unknown[]): void

// Log an error message
logger.error(message: string, ...args: unknown[]): void

// Log a debug message (only in non-production)
logger.debug(message: string, ...args: unknown[]): void
```

### Network Monitor (`src/utils/network.ts`)

```typescript
// Get current network status
networkMonitor.getStatus(): ConnectionStatus

// Check if the device is online
networkMonitor.isOnline(): boolean

// Add a listener for network status changes
networkMonitor.addListener(listener: ConnectionListener): () => void
```

### Retry Mechanism (`src/utils/retry.ts`)

```typescript
// Execute a function with retry logic
withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>

// Check if an error is retryable
isRetryableError(error: any): boolean
```

## Component Props and Outputs

### Auth Components

* `SignIn.tsx`
  * Arguments: None
  * Outputs: Sign-in form component

* `SignUp.tsx`
  * Arguments: None
  * Outputs: Sign-up form component, success confirmation

* `SignOut.tsx`
  * Arguments: None
  * Outputs: Sign-out button (null if no user)

* `ResetPassword.tsx`
  * Arguments: None
  * Outputs: Password reset form, success confirmation

* `UpdatePassword.tsx`
  * Arguments: None
  * Outputs: Password update form, success confirmation

### Layout Components

* `Layout.tsx`
  * Arguments: `children` (ReactNode)
  * Outputs: Layout wrapper with header and footer

* `Header.tsx`
  * Arguments: None
  * Outputs: Application header with navigation and auth buttons

* `Footer.tsx`
  * Arguments: None
  * Outputs: Empty footer component

### Page Components

* `Home.tsx`
  * Arguments: None
  * Outputs: Home page with auth status and actions

* `Landing.tsx`
  * Arguments: None
  * Outputs: Landing page with app introduction

* `Profile.tsx`
  * Arguments: None
  * Outputs: User profile information (protected)

* `AuthCallbackPage.tsx`
  * Arguments: None
  * Outputs: Handles auth callback from email links

## Development Context

This application is a Vite app using React with TypeScript. It features a complete user authentication system using Supabase for authentication and database storage. The authentication system includes:

- Sign In functionality
- Sign Up with email verification
- Sign Out
- Password reset via email
- Password change within the app
- Email validation after email changes
- Offline mode support with proper error handling
- Network status monitoring
- Retry mechanism for API calls

The application uses Supabase's Row Level Security to ensure users can only access their own data. It follows best practices for separation of concerns, type safety, and comprehensive error handling.

## Setup and Deployment

1. Set up Supabase project and configure authentication settings
2. Update `.env` file with Supabase URL and anon key
3. Run Supabase migrations to create required tables and policies
4. Deploy to Netlify for hosting

## Testing

Comprehensive tests are included to verify the authentication functionality with both success and failure scenarios. Run tests with:

```bash
npm run test
```

Or in watch mode:

```bash
npm run test:watch
```