# Paynless Framework Application

The Paynless Framework is a modern API-based application framework built with React, Supabase, Stripe, and ChatGPT. The Paynless Framework is intended for multi-environment deployment on the web, iOS, and Android. 

Whether hand-coding or vibe coding, with the Paynless Framework your user authentication, database, profiles, subscriptions, and AI agent implementation is ready immediately. 

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
- Consistent error handling and response formatting via `apiClient`
- State management primarily using Zustand stores

## API Endpoints (Supabase Edge Functions)

The application exposes the following primary API endpoints through Supabase Edge Functions:

### Authentication (`/login`, `/register`, `/logout`, `/session`, `/refresh`)
- Handles user sign-up, login, logout, session validation/refresh.
- `/reset-password`: Likely handles password reset requests.
- `/test-auth`: (Internal/debug?) Endpoint for testing auth.

### Profile Management (`/me`, `/profile`)
- Allows fetching and updating the current user's profile (`/me`).
- `/profile`: Likely involved in profile operations (specifics TBD).

### Subscriptions & Billing (`/api-subscriptions`, `/stripe-webhook`)
- `/api-subscriptions`: Main router for subscription actions.
  - `GET /current`: Fetches the current user's subscription status.
  - `GET /plans`: Fetches available Stripe subscription plans.
  - `POST /checkout`: Creates a Stripe Checkout session.
  - `POST /billing-portal`: Creates a Stripe Customer Portal session.
  - `POST /:subscriptionId/cancel`: Cancels a specific subscription.
  - `POST /:subscriptionId/resume`: Resumes a specific subscription.
  - `GET /usage/:metric`: Fetches usage metrics for a specific metric.
- `/stripe-webhook`: Handles incoming webhook events from Stripe.

### Users (`/api-users`)
- Manages user-related operations (details TBD).

*(Note: Endpoint specifics require reading function code. This is based on folder names.)*

## Database Schema (Simplified)

*(This section appears reasonably up-to-date based on typical Supabase/Stripe integrations. Keep as is unless specific schema changes are known.)*

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

## Project Structure (`src` directory)

```
/src
│
├── /api                  # API client implementations
│   ├── /clients          # Specific API clients
│   │   └── stripe.api.ts # Stripe/Subscription API client
│   └── apiClient.ts      # Base API client (fetch wrapper, error handling)
│
├── /components           # Reusable UI components (structure TBD)
│   └── /layout          # Main layout components (e.g., Footer.tsx)
│
├── /config               # Configuration files (structure TBD)
│
├── /context              # React context providers (structure TBD)
│
├── /hooks                # Custom React hooks
│   ├── useAuthSession.ts # Hook for managing session refresh logic
│   ├── useSubscription.ts # Hook for subscription context/store access
│   └── useTheme.ts      # Hook for theme management
│
├── /pages                # Page-level components
│   ├── Dashboard.tsx
│   ├── Home.tsx
│   ├── Login.tsx        # (Likely placeholder/wrapper for auth logic)
│   ├── Profile.tsx
│   ├── Register.tsx     # (Likely placeholder/wrapper for auth logic)
│   ├── Subscription.tsx
│   └── SubscriptionSuccess.tsx
│
├── /routes               # Routing configuration (structure TBD)
│
├── /services             # Business logic services
│   └── subscription.service.ts # Service for subscription-related operations
│
├── /store                # Zustand store implementations
│   ├── authStore.ts     # Authentication state (user, session, profile, login/register/logout/refresh actions)
│   └── subscriptionStore.ts # Subscription state (plans, user sub, actions)
│
├── /types                # TypeScript types and interfaces
│   ├── api.types.ts
│   ├── auth.types.ts
│   ├── global.d.ts
│   ├── profile.types.ts  # (Assuming based on usage, not listed in dir)
│   ├── route.types.ts
│   ├── subscription.types.ts
│   └── theme.types.ts
│
├── /utils                # Utility functions (structure TBD)
│   └── logger.ts        # Logging utility (assuming based on usage)
│
├── App.tsx               # Main App component (providers, routing setup)
├── index.css             # Global styles & Tailwind CSS variable definitions
├── main.tsx              # Application entry point
└── vite-env.d.ts       # Vite environment types
```

## Edge Functions (`supabase/functions`)

```
/supabase/functions
│
├── /_shared             # Shared Deno utilities (CORS, Auth helpers, etc.)
│
├── /api-subscriptions   # Handles subscription actions (checkout, portal, plans, current)
├── /api-users           # Handles user management actions
├── /login               # Handles user login
├── /logout              # Handles user logout
├── /me                  # Handles fetching/updating the current user's profile
├── /profile             # Handles profile-related actions (details TBD)
├── /refresh             # Handles session token refresh
├── /register            # Handles user registration
├── /reset-password      # Handles password reset flow
├── /session             # Handles session validation/information
├── /stripe-webhook      # Handles incoming Stripe events
└── test-auth.ts         # Standalone test script for auth?
```

## Core Framework Files (Review these for API/Util understanding)

This section details the key functions, methods, and store actions within the core files.

### 1. `/src/api/apiClient.ts` (Core Fetch Wrapper)

This file provides a centralized `fetch` wrapper for interacting with the backend Supabase Edge Functions.

- **`api` object:** Exported object containing convenient methods for HTTP requests.
  - `api.get<T>(endpoint: string, options?: FetchOptions): Promise<T>`
  - `api.post<T>(endpoint: string, body: unknown, options?: FetchOptions): Promise<T>`
  - `api.put<T>(endpoint: string, body: unknown, options?: FetchOptions): Promise<T>`
  - `api.delete<T>(endpoint: string, options?: FetchOptions): Promise<T>`
    - `endpoint`: Path to the Edge Function (e.g., '/login').
    - `body`: Request payload for POST/PUT.
    - `options`: Optional `FetchOptions` (extends standard `RequestInit`) including:
      - `isPublic?: boolean`: If true, doesn't add the Authorization header.
      - Standard `fetch` options like `headers`, `signal`, etc.
    - Returns: A promise resolving to the data payload (`T`) from the `data` field of the JSON response, or throws `ApiError` on failure.
- **`ApiError` class:** Custom error class thrown on API failures.
  - `message: string`
  - `code?: string | number` (HTTP status or backend error code)

### 2. `/src/store/authStore.ts` (Core Auth Logic)

Manages authentication state (user, session, profile) using Zustand.

- **`useAuthStore` hook:** Accesses the store's state and actions.
  - **State:**
    - `user: User | null`
    - `session: Session | null`
    - `profile: UserProfile | null`
    - `isLoading: boolean`
    - `error: Error | null`
  - **Actions:**
    - `setUser(user: User | null): void`
    - `setSession(session: Session | null): void`
    - `setProfile(profile: UserProfile | null): void`
    - `setIsLoading(isLoading: boolean): void`
    - `setError(error: Error | null): void`
    - `login(email: string, password: string): Promise<User | null>`: Calls `/login` endpoint, updates state.
    - `register(email: string, password: string): Promise<User | null>`: Calls `/register` endpoint, updates state.
    - `logout(): Promise<void>`: Calls `/logout` endpoint, clears state.
    - `initialize(): Promise<void>`: Checks persisted session, fetches profile if valid, updates state.
    - `refreshSession(): Promise<void>`: Calls `/refresh` endpoint using refresh token, updates state (including user/profile).

### 3. `/src/store/subscriptionStore.ts` (Core Subscription Logic)

Manages subscription state (plans, user's subscription) using Zustand.

- **`useSubscriptionStore` hook:** Accesses the store's state and actions.
  - **State:**
    - `userSubscription: UserSubscription | null`
    - `availablePlans: SubscriptionPlan[]`
    - `isSubscriptionLoading: boolean`
    - `hasActiveSubscription: boolean`
    - `isTestMode: boolean`
    - `error: Error | null`
  - **Actions:**
    - `setUserSubscription(subscription: UserSubscription | null): void`
    - `setAvailablePlans(plans: SubscriptionPlan[]): void`
    - `setIsLoading(isLoading: boolean): void`
    - `setError(error: Error | null): void`
    - `loadSubscriptionData(): Promise<void>`: Fetches plans and user subscription using `subscriptionService`.
    - `refreshSubscription(): Promise<void>`: Reloads subscription data.
    - `createCheckoutSession(priceId: string, successUrl: string, cancelUrl: string): Promise<string | null>`: Calls `subscriptionService` to get Stripe Checkout URL.
    - `createBillingPortalSession(returnUrl: string): Promise<string | null>`: Calls `subscriptionService` to get Stripe Billing Portal URL.
    - `cancelSubscription(subscriptionId: string): Promise<boolean>`: Calls `subscriptionService` to cancel, then refreshes state.
    - `resumeSubscription(subscriptionId: string): Promise<boolean>`: Calls `subscriptionService` to resume, then refreshes state.
    - `getUsageMetrics(metric: string): Promise<any>`: Calls `subscriptionService` to fetch usage data.

### 4. `/src/services/subscription.service.ts`

Provides methods encapsulating subscription-related business logic, often acting as an intermediary between the store and the API clients or direct fetch calls.

- **`SubscriptionService` class:** (Instantiated as `subscriptionService`)
  - `getSubscriptionPlans(): Promise<SubscriptionPlan[]>`: Uses `stripeApiClient`.
  - `getUserSubscription(userId: string): Promise<UserSubscription | null>`: Uses `stripeApiClient`.
  - `createCheckoutSession(userId: string, priceId: string, successUrl: string, cancelUrl: string): Promise<string | null>`: Uses `stripeApiClient`.
  - `createBillingPortalSession(userId: string, returnUrl: string): Promise<string | null>`: Uses `stripeApiClient`.
  - `hasActiveSubscription(userId: string): Promise<boolean>`: Calls `getUserSubscription` internally.
  - `cancelSubscription(userId: string, subscriptionId: string): Promise<boolean>`: Uses `fetch` directly to call `/api-subscriptions/:id/cancel`.
  - `resumeSubscription(userId: string, subscriptionId: string): Promise<boolean>`: Uses `fetch` directly to call `/api-subscriptions/:id/resume`.
  - `getUsageMetrics(userId: string, metric: string): Promise<any>`: Uses `fetch` directly to call `/api-subscriptions/usage/:metric`.
  *(Note: Some methods use `fetch` directly, others use `stripeApiClient`)*

### 5. `/src/api/clients/stripe.api.ts`

Frontend client specifically for interacting with backend endpoints related to Stripe actions (which then talk to Stripe).

- **`StripeApiClient` class:** (Instantiated as `stripeApiClient`)
  - `createCheckoutSession(planId: string): Promise<ApiResponse<{ url: string }>>`: Calls `api.post('/checkout', ...)`.
  - `createPortalSession(): Promise<ApiResponse<{ url: string }>>`: Calls `api.post('/portal', ...)`.
  - `getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlan[]>>`: Calls `api.get('/plans')`.
  - `getUserSubscription(userId: string): Promise<ApiResponse<UserSubscription>>`: Calls `api.get('/current')`.
  - `cancelSubscription(): Promise<ApiResponse<void>>`: Calls `api.post('/cancel', ...)`.
  *(Note: Returns `ApiResponse<T>` which includes `data`, `status`, and optional `error`)*

### 6. `/supabase/functions/_shared/*` (Core Backend Utilities)

Contains shared Deno code used by multiple Edge Functions (CORS handling, Supabase client creation, auth helpers, Stripe client initialization).

## Getting Started

*(Keep as is - seems standard)*

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Supabase Project URL and Anon Key.
3. Ensure Docker is running.
4. Run `npm install` (or `yarn` or `pnpm install`) to install dependencies.
5. Start the local Supabase stack: `supabase start`
6. Apply database migrations: `supabase db reset` (if starting fresh) or ensure migrations are up-to-date.
7. Run `npm run dev` to start the development server.

## Supabase Setup

*(Keep as is - seems standard)*

1. Create a new Supabase project.
2. Link your local repository: `supabase link --project-ref YOUR_PROJECT_REF --password YOUR_PASSWORD`
3. Set up required environment variables in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Ensure database migrations in `supabase/migrations` define the necessary tables (`user_profiles`, `subscription_plans`, `user_subscriptions`) and the trigger to create user profiles.

## API Implementation Layering

*(Keep as is - describes the intended architecture)*

The application follows a clear layered architecture for API interactions:
1. UI Components/Pages (`/src/pages`, `/src/components`) → Trigger actions (e.g., login, fetch profile).
2. Hooks/Stores (`/src/hooks`, `/src/store`) → Manage state and call Service Layer methods.
3. Service Layer (`/src/services`) → Implements application-specific logic, calls API Client methods.
4. API Client Layer (`/src/api/clients`) → Handles HTTP requests to specific backend endpoints, uses `apiClient`.
5. Backend API (Supabase Edge Functions) → Receives requests, interacts with Supabase Auth/DB, Stripe.

## State Management

*(Update based on identified stores)*

The application uses Zustand for global state management:
1. State slices are defined in stores (`/src/store/authStore.ts`, `/src/store/subscriptionStore.ts`).
2. Stores include state variables and actions to modify state or interact with services/API clients.
3. Components access state and actions using the generated hooks (e.g., `useAuthStore()`).
4. The `persist` middleware is used to save parts of the state (like auth session) to `localStorage`.

## Contributing

*(Keep as is - standard contribution guidelines)*

To contribute to this project:
1. Ensure you understand the architecture and follow the established patterns.
2. Avoid duplicating existing functionality; utilize services and stores.
3. Use proper TypeScript types for all data structures.
4. Document new components, services, functions, and complex logic.
5. Test changes thoroughly, considering edge cases.