# API-Driven Application

This project is a modern API-driven application built with React and Supabase. It features user authentication, profile management, and Stripe-based subscriptions, following a clear separation of concerns.

## Development Context

This application is designed to follow these principles:
- Full separation of concerns 
- API-first architecture
- Secure, safe, reliable, robust development practices
- No code duplication
- Well-structured code with proper documentation
- Event-driven architecture instead of delays or timeouts
- Comprehensive logging
- Proper TypeScript typing system
- Clear organization of types and interfaces

When implementing features:
- Never duplicate or replicate existing functionality
- Create reusable components that can be used across the application
- Use separation of concerns to keep files focused and maintainable
- Document all code with clear, concise comments
- Use proper TypeScript types and interfaces
- Always implement full, production-ready features rather than placeholders or mock code
- Use logging for error handling and debugging
- Use events instead of timeouts for asynchronous operations
- Scan the codebase to prevent duplication of functionality
- Follow established patterns and conventions consistently

## Architecture Overview

The architecture follows these principles:
- Clear separation between frontend (React) and backend (Supabase Edge Functions)
- RESTful API endpoints (Edge Functions) serve business logic
- Frontend consumes the API via a layered structure (UI -> Service -> API Client)
- Stateless authentication using JWT tokens managed via Supabase Auth
- Consistent error handling and response formatting via `BaseApiClient`
- State management primarily using Zustand stores

## API Endpoints (Supabase Edge Functions)

The application exposes the following primary API endpoints through Supabase Edge Functions:

### Authentication (`/login`, `/register`, `/logout`, `/session`, `/refresh`, `/reset-password`)
- Handles user sign-up, login, logout, session validation/refresh, and password reset.

### Profile Management (`/me`, `/profile/:id`)
- Allows fetching and updating the current user's profile (`/me`).
- Allows fetching other users' profiles (`/profile/:id`).

### Subscriptions & Billing (`/api-subscriptions/...`, `/stripe-webhook`)
- `GET /api-subscriptions/plans`: Fetches available Stripe subscription plans.
- `GET /api-subscriptions/current`: Fetches the current user's subscription status.
- `POST /api-subscriptions/checkout`: Creates a Stripe Checkout session.
- `POST /api-subscriptions/billing-portal`: Creates a Stripe Customer Portal session.
- `POST /api-subscriptions/:id/cancel`: Cancels a subscription.
- `POST /api-subscriptions/:id/resume`: Resumes a subscription.
- `GET /api-subscriptions/usage/:metric`: Fetches usage metrics (if applicable).
- `POST /stripe-webhook`: Handles incoming webhook events from Stripe (e.g., payment success, subscription updates).

## Database Schema (Simplified)

The core database tables likely include:

- `public.user_profiles`
  - `id` (uuid, references `auth.users.id`)
  - `first_name` (text)
  - `last_name` (text)
  - `role` (text, e.g., 'user', 'admin')
  - `created_at` (timestampz)
  - `updated_at` (timestampz)

- `public.subscription_plans`
  - `id` (uuid or text)
  - `stripe_price_id` (text)
  - `name` (text)
  - `description` (text)
  - `amount` (integer, smallest currency unit e.g., cents)
  - `currency` (text, e.g., 'usd')
  - `interval` (text, e.g., 'month', 'year')
  - `interval_count` (integer)
  - `metadata` (jsonb)

- `public.user_subscriptions`
  - `id` (uuid)
  - `user_id` (uuid, references `auth.users.id`)
  - `stripe_customer_id` (text)
  - `stripe_subscription_id` (text)
  - `status` (text, e.g., 'active', 'canceled', 'trialing')
  - `current_period_start` (timestampz)
  - `current_period_end` (timestampz)
  - `cancel_at_period_end` (boolean)
  - `plan_id` (references `subscription_plans.id`)

*(Note: Actual schema might have variations, refer to migrations)*

## Project Structure

```
/src
│
├── /api                  # API client implementations
│   └── /clients          # Specific API clients
│       ├── /auth         # Authentication API clients (index, login, register, etc.)
│       ├── base.api.ts   # Base API client (Axios setup, interceptors)
│       ├── profile.api.ts # Profile API client (getMyProfile, getProfile, updateMyProfile)
│       └── stripe.api.ts # Stripe/Subscription API client
│
├── /components           # UI components
│   ├── /auth            # Auth forms, ProtectedRoute
│   ├── /layout          # Main layout components (Layout, Header, Sidebar)
│   └── /profile         # Profile editor/display components
│
├── /config               # Configuration files (if any)
│
├── /context              # React context providers
│   ├── subscription.context.tsx # Context for subscription state (may overlap with store)
│   └── theme.context.tsx    # Theme context
│
├── /hooks                # Custom React hooks
│   ├── useAuth.ts       # Convenience hook for auth store
│   ├── useAuthSession.ts # Hook for managing session refresh
│   └── useSubscription.ts # Hook for subscription context
│
├── /pages                # Page components
│   ├── Home.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── Profile.tsx
│   ├── Subscription.tsx
│   └── SubscriptionSuccess.tsx
│
├── /routes               # Routing configuration
│   └── routes.tsx       # Route definitions
│
├── /services             # Business logic services (connect UI/stores to API clients)
│   ├── /auth            # Auth services (index, login, register, etc.)
│   ├── profile.service.ts # Profile service (getCurrentUserProfile, update, etc.)
│   └── subscription.service.ts # Subscription service
│
├── /store                # Zustand store implementations
│   ├── authStore.ts     # Authentication state (user, session, loading)
│   └── subscriptionStore.ts # Subscription state (plans, user sub, loading)
│
├── /types                # TypeScript types and interfaces
│   ├── api.types.ts
│   ├── auth.types.ts
│   ├── profile.types.ts
│   ├── subscription.types.ts
│   ├── route.types.ts
│   └── theme.types.ts
│
├── /utils                # Utility functions
│   ├── logger.ts        # Logging utility
│   ├── supabase.ts      # Supabase client setup (if used directly)
│   └── stripe.ts        # Stripe utilities (e.g., isStripeTestMode)
│
├── App.tsx               # Main App component (providers, routing setup)
├── main.tsx              # Application entry point
├── index.css             # Global styles
└── vite-env.d.ts       # Vite environment types
```

## Edge Functions

Located in `/supabase/functions`:

```
/supabase/functions
│
├── /_shared             # Shared utilities (CORS, Auth helpers, Stripe client)
│
├── /login               # Login endpoint
├── /register            # Registration endpoint
├── /logout              # Logout endpoint
├── /session             # Session validation endpoint
├── /refresh             # Token refresh endpoint
├── /reset-password      # Password reset endpoint
├── /me                  # Current user profile endpoint (GET, PUT)
├── /profile             # Other user profile endpoint (GET by ID)
├── /api-subscriptions   # Subscription management endpoints (plans, checkout, portal, etc.)
└── /stripe-webhook      # Stripe webhook handler
```

## Core Framework Files (Do Not Modify Generally)

The following files form the core of the API interaction and utility setup:
- `/src/api/clients/base.api.ts`
- `/src/utils/logger.ts`

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Supabase Project URL and Anon Key.
3. Ensure Docker is running.
4. Run `npm install` (or `yarn` or `pnpm install`) to install dependencies.
5. Start the local Supabase stack: `supabase start`
6. Apply database migrations: `supabase db reset` (if starting fresh) or ensure migrations are up-to-date.
7. Run `npm run dev` to start the development server.

## Supabase Setup

1. Create a new Supabase project.
2. Link your local repository: `supabase link --project-ref YOUR_PROJECT_REF`
3. Set up required environment variables in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Ensure database migrations in `supabase/migrations` define the necessary tables (`user_profiles`, `subscription_plans`, `user_subscriptions`) and the trigger to create user profiles.

## API Implementation Layering

The application follows a clear layered architecture for API interactions:
1. UI Components/Pages (`/src/pages`, `/src/components`) → Trigger actions (e.g., login, fetch profile).
2. Hooks/Stores (`/src/hooks`, `/src/store`) → Manage state and call Service Layer methods.
3. Service Layer (`/src/services`) → Implements application-specific logic, calls API Client methods.
4. API Client Layer (`/src/api/clients`) → Handles HTTP requests to specific backend endpoints, uses `BaseApiClient`.
5. Backend API (Supabase Edge Functions) → Receives requests, interacts with Supabase Auth/DB, Stripe.

## State Management

The application uses Zustand for global state management:
1. State slices are defined in stores (`/src/store/authStore.ts`, `/src/store/subscriptionStore.ts`).
2. Stores include state variables and actions to modify state or interact with services.
3. Components access state and actions using the generated hooks (e.g., `useAuthStore()`, `useSubscriptionStore()`).
4. The `persist` middleware is used to save parts of the state (like auth session) to `localStorage`.
5. A `SubscriptionContext` also exists, potentially overlapping with `subscriptionStore`. Evaluate if both are needed.

## Contributing

To contribute to this project:
1. Ensure you understand the architecture and follow the established patterns.
2. Avoid duplicating existing functionality; utilize services and stores.
3. Use proper TypeScript types for all data structures.
4. Document new components, services, functions, and complex logic.
5. Test changes thoroughly, considering edge cases.