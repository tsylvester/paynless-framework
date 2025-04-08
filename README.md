# Paynless Framework Application

The Paynless Framework is a modern API-based application framework monorepo built with React, Supabase, Stripe, and ChatGPT. The Paynless Framework is intended for multi-environment deployment on the web, iOS, and Android. 

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

## Next Features
- AI Chat integration
-- OpenAI, Claude, Gemini, Perplexity, DeepSeek, etc
-- Selectable AI 
-- Selectable system prompts 
-- Save chats 
-- Continue chats

- User interaction detection
-- Mixpanel endpoints

- User email integration
-- Feature updates 
-- Reactivation 

- Change email from within app
- Change password from within app
- Add loading skeletons to everything

### Testing Strategy: Service Abstraction for Complex Dependencies

**Context:** When unit testing Supabase Edge Functions that depend on the `SupabaseClient`, directly mocking the client can be challenging, especially if the function uses multiple distinct parts of the client (e.g., both database access via `.from()` and function invocation via `.functions.invoke()`).

**Problem Encountered:** We encountered persistent TypeScript errors (specifically TS2345) when trying to pass mock `SupabaseClient` objects (even using casting like `as any` or `as unknown as SupabaseClient`) into handler functions. The type checker flagged mismatches due to the complexity of the real `SupabaseClient` class (including internal/protected properties) compared to our simplified mock objects, particularly when the *shape* of the required mock differed between tests in the same file.

**Solution:** To overcome this and improve testability, we introduced a **Service Abstraction Layer** for handlers dealing with such complex dependencies:
1.  **Define an Interface:** Create a specific interface (e.g., `ISomeSpecificService`) that declares *only* the high-level methods the handler needs (e.g., `updateRecordStatus(...)`, `invokeAnotherFunction(...)`).
2.  **Implement the Service:** Create a class (e.g., `SomeSpecificService`) that implements this interface, encapsulating the actual `SupabaseClient` calls (`.from().update()`, `.functions.invoke()`) within its methods.
3.  **Inject the Service:** Refactor the Edge Function handler to depend on the *interface* (`ISomeSpecificService`) instead of the raw `SupabaseClient`.
4.  **Mock the Interface:** In the handler's unit test, create a simple mock object that implements the service interface using spy functions (e.g., `{ updateRecordStatus: spy(...), invokeAnotherFunction: spy(...) }`). This mock is easily type-compatible with the interface.

**Benefits:**
*   **Resolves Type Errors:** Completely bypasses the TS2345 errors related to mocking the complex `SupabaseClient` in the handler's unit test.
*   **Focuses Tests:** Handler unit tests focus on verifying the handler's logic (calling the correct service method with correct arguments, handling results), while the service implementation's logic (correctly using the `SupabaseClient`) can be tested separately (though its tests might face the original mocking challenge, it's solved in one place).
*   **Maintainability:** Follows the Dependency Inversion Principle, decoupling handlers from the specific implementation details of the `SupabaseClient`.

**(Example:** See `supabase/functions/stripe-webhook/services/product_webhook_service.ts` and its usage in `supabase/functions/stripe-webhook/handlers/product.ts` and `product.test.ts`.)

Test Incrementally From the Bottom Up
1. Start with Unit Tests
- Write unit tests for the file or module you're working on.
- Run the unit test(s) for that file.
- Fix the code until all unit tests pass.

2. Move to Integration
- Once all relevant unit tests pass, run integration tests that depend on those files/modules.
- If integration tests fail, fix the relevant files — this may require updating multiple modules.
- Once integration tests pass, review and update your unit tests if the behavior or signatures changed.
- Rerun affected unit tests to ensure they still pass with the integrated logic.

Why? Integration fixes may change interfaces or logic that your unit tests previously assumed.

3. Stabilize by Layer
- Ensure all unit tests pass after updates.
- Ensure all integration tests pass after updates.
- Only then run the full test suite (unit + integration) across the workspace.

4. End-to-End Validation
- Once the system passes unit and integration layers, run full end-to-end (E2E) tests.
- Fix or update E2E tests and supporting mocks if needed.

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

*(Note: Endpoint specifics require reading function code. This is based on folder names.)*

## Database Schema (Simplified)

The core database tables defined in `supabase/migrations/` include:

- **`public.user_profiles`** (Stores public profile information for users)
  - `id` (uuid, PK, references `auth.users(id) ON DELETE CASCADE`)
  - `first_name` (text, nullable)
  - `last_name` (text, nullable)
  - `role` (public.user_role enum [`'user'`, `'admin'`], NOT NULL, default `'user'`)
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.subscription_plans`** (Stores available subscription plans, mirrors Stripe Products/Prices)
  - `id` (uuid, PK, default `uuid_generate_v4()`)
  - `stripe_price_id` (text, UNIQUE, NOT NULL) - *Corresponds to Stripe Price ID (e.g., `price_...`)*
  - `stripe_product_id` (text, nullable) - *Corresponds to Stripe Product ID (e.g., `prod_...`)*
  - `name` (text, NOT NULL)
  - `description` (jsonb, nullable) - *Structured as `{ "subtitle": "...", "features": ["...", "..."] }`*
  - `amount` (integer, NOT NULL) - *Amount in smallest currency unit (e.g., cents)*
  - `currency` (text, NOT NULL) - *3-letter ISO code (e.g., `'usd'`)*
  - `interval` (text, NOT NULL) - *One of `'day'`, `'week'`, `'month'`, `'year'`*
  - `interval_count` (integer, NOT NULL, default `1`)
  - `active` (boolean, NOT NULL, default `true`) - *Whether the plan is offered*
  - `metadata` (jsonb, nullable) - *For additional plan details*
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.user_subscriptions`** (Stores user subscription information linked to Stripe)
  - `id` (uuid, PK, default `uuid_generate_v4()`)
  - `user_id` (uuid, NOT NULL, references `public.user_profiles(id) ON DELETE CASCADE`)
  - `stripe_customer_id` (text, UNIQUE, nullable)
  - `stripe_subscription_id` (text, UNIQUE, nullable)
  - `status` (text, NOT NULL) - *e.g., `'active'`, `'canceled'`, `'trialing'`, `'past_due'`, `'free'`*
  - `plan_id` (uuid, nullable, references `public.subscription_plans(id)`)
  - `current_period_start` (timestamp with time zone, nullable)
  - `current_period_end` (timestamp with time zone, nullable)
  - `cancel_at_period_end` (boolean, nullable, default `false`)
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.subscription_transactions`** (Logs Stripe webhook events for processing and auditing)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, NOT NULL, references `auth.users(id) ON DELETE CASCADE`)
  - `stripe_event_id` (text, UNIQUE, NOT NULL) - *Idempotency key*
  - `event_type` (text, NOT NULL) - *e.g., `'checkout.session.completed'`*
  - `status` (text, NOT NULL, default `'processing'`) - *Processing status*
  - `stripe_checkout_session_id` (text, nullable)
  - `stripe_subscription_id` (text, nullable)
  - `stripe_customer_id` (text, nullable)
  - `stripe_invoice_id` (text, nullable)
  - `stripe_payment_intent_id` (text, nullable)
  - `amount` (integer, nullable) - *Smallest currency unit*
  - `currency` (text, nullable)
  - `user_subscription_id` (uuid, nullable, references `public.user_subscriptions(id) ON DELETE SET NULL`)
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

*(Note: This reflects the schema after applying all migrations in `supabase/migrations/`. RLS policies are also applied but not detailed here.)*

## Project Structure (Monorepo)

The project is organized as a monorepo using npm workspaces:

```
/
├── apps/                   # Individual applications
│   ├── web/                # React Web Application (Vite)
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── hooks/
│   │       ├── context/
│   │       ├── routes/
│   │       ├── config/
│   │       ├── tests/            # Web App Tests
│   │       │   ├── unit/         # Unit tests (*.unit.test.tsx)
│   │       │   ├── integration/  # Integration tests (*.integration.test.tsx)
│   │       │   │   ├── auth.integration.test.tsx
│   │       │   │   ├── profile.integration.test.tsx
│   │       │   │   └── Subscription.integration.test.tsx
│   │       │   ├── e2e/          # End-to-end tests (Placeholder)
│   │       │   ├── utils/        # Shared test utilities (render, etc.)
│   │       │   ├── mocks/        # Shared mocks (MSW handlers, components)
│   │       │   │   ├── handlers.ts # Main MSW request handlers
│   │       │   │   ├── api/
│   │       │   │   │   └── server.ts # MSW server setup
│   │       │   │   ├── components/ # Mock React components
│   │       │   │   └── stores/     # Mock Zustand stores
│   │       │   └── setup.ts      # Vitest global setup (MSW server start, etc.)
│   │       └── ... (other src files: App.tsx, main.tsx, etc.)
│   ├── ios/                # iOS Application (Details TBD)
│   └── android/            # Android Application (Details TBD)
│
├── packages/               # Shared libraries/packages
│   ├── api-client/         # Frontend API client logic
│   │   └── src/
│   │       ├── apiClient.ts      # Base API client (fetch wrapper, error handling)
│   │       └── stripe.api.ts     # Stripe/Subscription specific API client
│   ├── store/              # Zustand global state stores
│   │   └── src/
│   │       ├── authStore.ts        # Auth state (user, session, profile, actions)
│   │       └── subscriptionStore.ts # Subscription state (plans, user sub, actions)
│   ├── types/              # Shared TypeScript types and interfaces
│   │   └── src/
│   │       ├── api.types.ts
│   │       ├── auth.types.ts
│   │       ├── subscription.types.ts
│   │       ├── theme.types.ts
│   │       ├── route.types.ts
│   │       └── index.ts            # Main export for types
│   ├── ui-components/      # Reusable React UI components (Placeholder)
│   │   └── src/
│   │       └── index.ts            # Export point for components
│   └── utils/              # Shared utility functions
│       └── src/
│           └── logger.ts         # Logging utility
│
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Backend API)
│   │   ├── _shared/          # Shared Deno utilities for functions
│   │   ├── login/
│   │   ├── register/
│   │   ├── logout/
│   │   ├── refresh/
│   │   ├── session/
│   │   ├── me/               # User profile fetch/update
│   │   ├── profile/          # Other profile actions?
│   │   ├── api-subscriptions/ # Subscription management endpoints
│   │   ├── stripe-webhook/   # Stripe event handler
│   │   └── ... (other functions)
│   └── migrations/         # Database migration files
│
├── .env                    # Local environment variables (Supabase keys, etc.)
├── .env.example            # Example environment variables
├── package.json            # Root package file (workspaces config)
├── tsconfig.base.json      # Base TypeScript configuration for the monorepo
└── README.md               # This file
```

## Edge Functions (`supabase/functions/`)

```
supabase/functions/
│
├── _shared/             # Shared Deno utilities (CORS, Auth helpers, etc.)
│
├── api-subscriptions/   # Handles subscription actions (checkout, portal, plans, current, cancel, resume, usage)
├── login/               # Handles user login
├── logout/              # Handles user logout
├── me/                  # Handles fetching/updating the current user's profile
├── profile/             # Handles profile-related actions (details TBD)
├── refresh/             # Handles session token refresh
├── register/            # Handles user registration
├── reset-password/      # Handles password reset flow
├── session/             # Handles session validation/information
├── stripe-webhook/      # Handles incoming Stripe events
└── test-auth.ts         # Standalone test script for auth?
```

## Core Packages & Exports (For AI Assistants)

This section details the key exports from the shared packages to help AI tools understand the available functionality.

### 1. `packages/api-client` (API Interaction)

#### `src/apiClient.ts` (Base Fetch Wrapper)
Provides a centralized `fetch` wrapper for interacting with Supabase Edge Functions.

- **`initializeApiClient(config: ApiClientConfig): void`**: Initializes the client.
  - `config: { baseUrl: string; supabaseAnonKey: string; }`
- **`api` object**: Methods for HTTP requests. Requires token in options if not public.
  - `api.get<T>(endpoint: string, options?: FetchOptions): Promise<T>`
  - `api.post<T>(endpoint: string, body: unknown, options?: FetchOptions): Promise<T>`
  - `api.put<T>(endpoint: string, body: unknown, options?: FetchOptions): Promise<T>`
  - `api.delete<T>(endpoint: string, options?: FetchOptions): Promise<T>`
- **`FetchOptions` type**: Extends `RequestInit`.
  - `{ isPublic?: boolean; token?: string; }`
- **`ApiError` class**: Custom error thrown on API failures.
  - `message: string`
  - `code?: string | number`

#### `src/stripe.api.ts` (Stripe-Related API Client)
Client for backend endpoints related to Stripe actions.

- **`StripeApiClient` class**:
  - `constructor(getToken: () => string | undefined)`: Needs function to get auth token.
  - `createCheckoutSession(priceId: string, isTestMode: boolean): Promise<ApiResponse<{ sessionId: string }>>`
  - `createPortalSession(isTestMode: boolean): Promise<ApiResponse<{ url: string }>>`
  - `getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlan[]>>`
  - `getUserSubscription(userId: string): Promise<ApiResponse<UserSubscription>>`
  - `cancelSubscription(subscriptionId: string): Promise<ApiResponse<void>>`
  - `resumeSubscription(subscriptionId: string): Promise<ApiResponse<void>>`
  - `getUsageMetrics(metric: string): Promise<ApiResponse<SubscriptionUsageMetrics>>`
  *(Note: Returns `ApiResponse<T>` defined in `@paynless/types`)*

### 2. `packages/store` (Global State Management)

Uses Zustand for state management with persistence for session data.

#### `src/authStore.ts` (Authentication State)
Manages user, session, and profile state.

- **`useAuthStore` hook**: Accesses the store's state and actions.
  - **State**:
    - `user: User | null`
    - `session: Session | null`
    - `profile: UserProfile | null`
    - `isLoading: boolean`
    - `error: Error | null`
  - **Actions**:
    - `setUser(user: User | null): void`
    - `setSession(session: Session | null): void`
    - `setProfile(profile: UserProfile | null): void`
    - `setIsLoading(isLoading: boolean): void`
    - `setError(error: Error | null): void`
    - `login(email: string, password: string): Promise<User | null>`
    - `register(email: string, password: string): Promise<User | null>`
    - `logout(): Promise<void>`
    - `initialize(): Promise<void>` (Checks persisted session, fetches profile)
    - `refreshSession(): Promise<void>` (Uses refresh token)
    - `updateProfile(profileData: UserProfileUpdate): Promise<boolean>`

#### `src/subscriptionStore.ts` (Subscription State)
Manages subscription plans and the user's current subscription status.

- **`useSubscriptionStore` hook**: Accesses the store's state and actions.
  - **State**:
    - `userSubscription: UserSubscription | null`
    - `availablePlans: SubscriptionPlan[]`
    - `isSubscriptionLoading: boolean`
    - `hasActiveSubscription: boolean`
    - `isTestMode: boolean`
    - `error: Error | null`
  - **Actions**:
    - `setUserSubscription(subscription: UserSubscription | null): void`
    - `setAvailablePlans(plans: SubscriptionPlan[]): void`
    - `setIsLoading(isLoading: boolean): void`
    - `setError(error: Error | null): void`
    - `loadSubscriptionData(userId: string): Promise<void>` (User ID is optional, taken from `authStore` if available)
    - `refreshSubscription(): Promise<void>`
    - `createCheckoutSession(priceId: string): Promise<string>` (Returns Stripe Session ID)
    - `createBillingPortalSession(): Promise<string | null>` (Returns Stripe Portal URL)
    - `cancelSubscription(subscriptionId: string): Promise<boolean>`
    - `resumeSubscription(subscriptionId: string): Promise<boolean>`
    - `getUsageMetrics(metric: string): Promise<SubscriptionUsageMetrics | null>`

### 3. `packages/utils` (Shared Utilities)

#### `src/logger.ts` (Logging Utility)
Provides a singleton logger instance for consistent application logging.

- **`logger` instance**: Singleton instance of `Logger`.
  - `logger.debug(message: string, metadata?: LogMetadata): void`
  - `logger.info(message: string, metadata?: LogMetadata): void`
  - `logger.warn(message: string, metadata?: LogMetadata): void`
  - `logger.error(message: string, metadata?: LogMetadata): void`
- **`Logger` class**:
  - `Logger.getInstance(): Logger`
  - `logger.configure(config: Partial<LoggerConfig>): void`
- **`LogLevel` enum**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **`LoggerConfig` interface**: `{ minLevel: LogLevel; enableConsole: boolean; captureErrors: boolean; }`
- **`LogMetadata` interface**: `{ [key: string]: unknown; }`

### 4. `packages/types` (Shared TypeScript Types)

Contains centralized type definitions used across the monorepo.

- **`src/api.types.ts`**: General API response types (`ApiResponse`, etc.).
- **`src/auth.types.ts`**: Types for authentication (`User`, `Session`, `UserProfile`, `AuthStore`, etc.).
- **`src/subscription.types.ts`**: Types for subscriptions (`SubscriptionPlan`, `UserSubscription`, `SubscriptionStore`, etc.).
- **`src/theme.types.ts`**: Types related to theming.
- **`src/route.types.ts`**: Types related to application routing.
- **`src/index.ts`**: Exports all types from the package.

### 5. `packages/ui-components` (Reusable UI Components)

Intended for shared React components.

- **`src/index.ts`**: Currently empty. Add component exports here (e.g., `export * from './Button';`).

### 6. `supabase/functions/_shared/` (Backend Shared Utilities)

Contains shared Deno code used by multiple Edge Functions (CORS handling, Supabase client creation, auth helpers, Stripe client initialization). Refer to the files within this directory for specific utilities.

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Supabase Project URL and Anon Key.
3. Ensure Docker is running.
4. Run `npm install` (or `yarn` or `pnpm install`) to install dependencies.
5. Start the local Supabase stack: `supabase start`
6. Apply database migrations: `supabase db reset` (if starting fresh) or ensure migrations in `supabase/migrations` are up-to-date.
7. Run `npm run dev` from the root or the specific app directory (e.g., `cd apps/web && npm run dev`) to start the development server.

## Supabase Setup

1. Create a new Supabase project.
2. Link your local repository: `supabase link --project-ref YOUR_PROJECT_REF --password YOUR_PASSWORD`
3. Set up required environment variables in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, etc.). Refer to `.env.example`.
4. Ensure database migrations in `supabase/migrations` define the necessary tables (`user_profiles`, `subscription_plans`, `user_subscriptions`) and the trigger to create user profiles.

## API Implementation Layering

The application follows a clear layered architecture for API interactions:
1. UI Components/Pages (`apps/web/src/pages`, `packages/ui-components`) → Trigger actions.
2. Hooks/Stores (`packages/store/src/*`) → Manage state and call API Client methods.
3. API Client Layer (`packages/api-client/src/*`) → Handles HTTP requests to specific backend endpoints, uses base `apiClient`.
4. Backend API (Supabase Edge Functions at `supabase/functions/*`) → Receives requests, interacts with Supabase Auth/DB, Stripe.

## State Management

The application uses Zustand for global state management:
1.  State slices are defined in stores within `packages/store/src/` (e.g., `authStore.ts`, `subscriptionStore.ts`).
2.  Stores include state variables and actions to modify state or interact with API clients.
3.  Components access state and actions using the generated hooks (e.g., `useAuthStore()`, `useSubscriptionStore()`).
4.  The `persist` middleware is used to save parts of the state (like auth session) to `localStorage`.

**Action Handling Pattern:**

To ensure a clear separation of concerns, predictability, and testability, the following pattern is used for handling user interactions that trigger asynchronous operations (like API calls):

*   **Store Actions as Flow Controllers:** Store actions (e.g., `authStore.login`, `subscriptionStore.createCheckoutSession`) are responsible for the entire flow associated with the action. This includes:
    *   Setting a centralized loading state (e.g., `authStore.isLoading = true`).
    *   Making the necessary API call via the `api-client`.
    *   Handling the success case: Updating relevant store state (e.g., setting `user`, `session`), clearing loading/error states. For actions resulting in internal navigation (like login/register), the store action itself triggers the navigation (e.g., using an injected `navigate` function or via effects).
    *   Handling the error case: Catching errors from the API client, setting a centralized error state (e.g., `authStore.error = caughtError`), and clearing the loading state. Errors are generally *not* re-thrown from the store action unless a specific downstream reaction is needed.
*   **UI Components as Dispatchers/Viewers:** React components:
    *   Dispatch the relevant store action when the user interacts (e.g., `onClick={() => login(email, password)}`).
    *   Subscribe to the centralized loading and error states from the store (e.g., `const isLoading = useAuthStore(state => state.isLoading);`).
    *   Use these states to render appropriate UI feedback (e.g., disabling buttons, showing spinners, displaying error messages). Components generally do not manage their own local state for loading or errors related to store actions.
    *   For actions requiring *external* redirection (like Stripe Checkout/Portal), the store action returns the URL, and the component performs the `window.location.href = url` redirect.
*   **Benefits:** This keeps UI components focused on presentation and user input, centralizes business logic and side-effect handling within the stores, simplifies state management, and makes both unit and integration testing more straightforward.

## URL Handling Convention (Monorepo Standard)

To ensure consistency and prevent subtle bugs when constructing URLs for API calls or routing, the following convention **MUST** be followed throughout the Paynless Framework monorepo:

1.  **Base URLs:**
    *   Any variable, configuration setting, or function parameter representing a base URL (e.g., `config.baseUrl` in `apiClient`, `VITE_SUPABASE_URL` in `.env`) **MUST NOT** end with a trailing slash (`/`).
    *   *Correct:* `http://localhost:54321`, `https://api.example.com/v1`
    *   *Incorrect:* `http://localhost:54321/`, `https://api.example.com/v1/`

2.  **Endpoint Paths / Relative Paths:**
    *   Any string representing a specific API endpoint path passed to client methods (like `api.get`, `api.post`, etc.) or a relative path used for routing **MUST NOT** start with a leading slash (`/`).
    *   These paths should represent the route *relative* to the relevant base URL or current path context.
    *   *Correct:* `auth/login`, `api-subscriptions/checkout`, `users/${userId}/profile`, `details`
    *   *Incorrect:* `/auth/login`, `/api-subscriptions/checkout`, `/details`

3.  **URL Construction (API Client):**
    *   When combining a base URL and an endpoint path within API client logic (like `packages/api-client`), use simple string concatenation with a single slash in between: `` `${baseUrl}/${endpoint}` ``.
    *   This relies on the base URL not having a trailing slash (Rule 1) and the endpoint path not having a leading slash (Rule 2).

**Rationale:** This approach is simple, predictable, and avoids ambiguities encountered with the standard `URL` constructor when base URLs contain paths. It ensures consistency across different packages and environments.

## Contributing

To contribute to this project:
1. Ensure you understand the architecture and follow the established patterns.
2. Avoid duplicating existing functionality; utilize services and stores.
3. Use proper TypeScript types for all data structures.
4. Document new components, services, functions, and complex logic.
5. Test changes thoroughly, considering edge cases.