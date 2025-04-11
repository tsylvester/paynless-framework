
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

### Core Pattern: API Client Singleton

**Decision (April 2024):** To ensure consistency and simplify integration across multiple frontend platforms (web, mobile) and shared packages (like Zustand stores), the `@paynless/api-client` package follows a **Singleton pattern**.

*   **Initialization:** The client is configured and initialized *once* per application lifecycle using `initializeApiClient(config)`. Each platform provides the necessary configuration (e.g., how to retrieve auth tokens).
*   **Access:** All parts of the application (stores, UI components, platform-specific code) access the single, pre-configured client instance by importing the exported `api` object: `import { api } from '@paynless/api-client';`.
*   **No DI for Stores:** Shared stores (Zustand) should *not* use dependency injection (e.g., an `init` method) to receive the API client. They should import and use the `api` singleton directly.
*   **Testing:** Unit testing components or stores that use the `api` singleton requires mocking the module import using the test framework's capabilities (e.g., `vi.mock('@paynless/api-client', ...)`).
*   **Consistency Note:** Older stores (`authStore`, `subscriptionStore`) may still use an outdated DI pattern and require refactoring to align with this singleton approach.


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

### Authentication & Core User (`/login`, `/register`, `/logout`, `/session`, `/refresh`, `/me`, `/profile`)
- `/login`: Handles user sign-up via email/password.
- `/register`: Handles user registration via email/password.
- `/logout`: Handles user logout.
- `/session`: Fetches current session information.
- `/refresh`: Refreshes the authentication token.
- `/reset-password`: Handles the password reset flow.
- `/me`: Fetches the profile for the currently authenticated user.
- `/profile`: Updates the profile for the currently authenticated user.
- `/ping`: Simple health check endpoint.

### Subscriptions & Billing (`/api-subscriptions`, `/stripe-webhook`, `/sync-stripe-plans`)
- `/api-subscriptions`: Main router for subscription actions.
  - `GET /current`: Fetches the current user's subscription status.
  - `GET /plans`: Fetches available Stripe subscription plans.
  - `POST /checkout`: Creates a Stripe Checkout session.
  - `POST /billing-portal`: Creates a Stripe Customer Portal session.
  - `POST /:subscriptionId/cancel`: Cancels a specific subscription.
  - `POST /:subscriptionId/resume`: Resumes a specific subscription.
  - `GET /usage/:metric`: Fetches usage metrics for a specific metric.
- `/stripe-webhook`: Handles incoming webhook events from Stripe (e.g., checkout completed, subscription updates).
- `/sync-stripe-plans`: (Admin/Internal) Function to synchronize Stripe Products/Prices with the `subscription_plans` table.

### AI Chat (`/ai-providers`, `/system-prompts`, `/chat`, `/chat-history`, `/chat-details`, `/sync-ai-models`)
- `/ai-providers`: Fetches the list of available/active AI providers (e.g., OpenAI models).
- `/system-prompts`: Fetches the list of available/active system prompts for AI chat.
- `/chat`: Handles sending a user message to an AI provider, managing context, and saving the conversation.
- `/chat-history`: Fetches the list of chat conversations for the authenticated user.
- `/chat-details/:chatId`: Fetches all messages for a specific chat conversation.
- `/sync-ai-models`: (Admin/Internal) Placeholder function intended to synchronize AI models from providers with the `ai_providers` table.

*(Note: This list is based on the `supabase/functions/` directory structure and inferred functionality. Specific HTTP methods and request/response details require reading the function code.)*

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
  - `user_id` (uuid, UNIQUE, NOT NULL, references `public.user_profiles(id) ON DELETE CASCADE`) - *Made UNIQUE*
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

- **`public.ai_providers`** (Stores information about supported AI models/providers)
  - `id` (uuid, PK)
  - `name` (text, NOT NULL, e.g., "OpenAI GPT-4o")
  - `api_identifier` (text, NOT NULL, UNIQUE, e.g., "openai-gpt-4o") - *Internal identifier*
  - `description` (text, nullable)
  - `is_active` (boolean, NOT NULL, default `true`)
  - `config` (jsonb, nullable) - *Non-sensitive config, excludes API keys*
  - `created_at`, `updated_at` (timestamptz)

- **`public.system_prompts`** (Stores reusable system prompts for AI chat)
  - `id` (uuid, PK)
  - `name` (text, NOT NULL, e.g., "Helpful Assistant")
  - `prompt_text` (text, NOT NULL)
  - `is_active` (boolean, NOT NULL, default `true`)
  - `created_at`, `updated_at` (timestamptz)

- **`public.chats`** (Represents a single AI chat conversation thread)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, nullable, FK references `auth.users(id) ON DELETE SET NULL`) - *Nullable for potential anonymous chats*
  - `title` (text, nullable) - *e.g., Auto-generated from first message*
  - `created_at`, `updated_at` (timestamptz)

- **`public.chat_messages`** (Stores individual messages within a chat)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `chat_id` (uuid, NOT NULL, FK references `chats(id) ON DELETE CASCADE`)
  - `user_id` (uuid, nullable, FK references `auth.users(id) ON DELETE SET NULL`) - *Tracks sender if needed*
  - `role` (text, NOT NULL) - *e.g., 'user', 'assistant', 'system'*
  - `content` (text, NOT NULL) - *The message text*
  - `ai_provider_id` (uuid, nullable, FK references `ai_providers(id)`) - *Logs which provider generated the response*
  - `system_prompt_id` (uuid, nullable, FK references `system_prompts(id)`) - *Logs which system prompt was used*
  - `token_usage` (jsonb, nullable) - *Stores request/response tokens from AI API*
  - `created_at` (timestamptz)

*(Note: This reflects the schema after applying all migrations in `supabase/migrations/` as of the last update. RLS policies are also applied but not detailed here.)*

## Project Structure (Monorepo)

The project is organized as a monorepo using pnpm workspaces:

```
/
├── apps/                   # Individual applications / Frontends
│   ├── web/                # React Web Application (Vite + React Router)
│   │   └── src/
│   │       ├── assets/
│   │       ├── components/     # UI Components specific to web app
│   │       ├── config/         # App-specific config (e.g., routes)
│   │       ├── context/        # React context providers
│   │       ├── hooks/          # Custom React hooks
│   │       ├── lib/            # Utility functions (e.g., cn)
│   │       ├── pages/          # Page components (routed via React Router)
│   │       ├── routes/         # Route definitions and protected routes
│   │       ├── tests/          # Web App Tests (Vitest)
│   │       │   ├── unit/         # Unit tests (*.unit.test.tsx)
│   │       │   ├── integration/  # Integration tests (*.integration.test.tsx)
│   │       │   ├── e2e/          # End-to-end tests (Placeholder)
│   │       │   ├── utils/        # Shared test utilities (render, etc.)
│   │       │   ├── mocks/        # Shared mocks (MSW handlers, components, stores)
│   │       │   └── setup.ts      # Vitest global setup (MSW server start, etc.)
│   │       ├── App.tsx         # Root application component
│   │       └── main.tsx        # Application entry point (renders App)
│   ├── ios/                # iOS Application (Placeholder)
│   ├── android/            # Android Application (Placeholder)
│   └── desktop/            # Desktop Application (Placeholder)
│
├── packages/               # Shared libraries/packages
│   ├── api-client/         # Frontend API client logic (Singleton)
│   │   └── src/
│   │       ├── apiClient.ts      # Base API client (fetch wrapper)
│   │       ├── stripe.api.ts     # Stripe/Subscription specific client methods
│   │       └── ai.api.ts         # AI Chat specific client methods
│   ├── store/              # Zustand global state stores
│   │   └── src/
│   │       ├── authStore.ts        # Auth state & actions
│   │       ├── subscriptionStore.ts # Subscription state & actions
│   │       └── aiStore.ts          # AI Chat state & actions
│   ├── types/              # Shared TypeScript types and interfaces
│   │   └── src/
│   │       ├── api.types.ts
│   │       ├── auth.types.ts
│   │       ├── subscription.types.ts
│   │       ├── ai.types.ts       # Added AI types
│   │       ├── theme.types.ts
│   │       ├── route.types.ts
│   │       └── index.ts            # Main export for types
│   ├── ui-components/      # Reusable React UI components (Placeholder)
│   │   └── src/
│   │       └── index.ts
│   └── utils/              # Shared utility functions
│       └── src/
│           └── logger.ts         # Logging utility
│
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Backend API)
│   │   ├── _shared/          # Shared Deno utilities for functions
│   │   ├── api-subscriptions/ # Subscription management endpoints
│   │   ├── ai-providers/     # Fetch AI providers
│   │   ├── chat/             # Handle AI chat message exchange
│   │   ├── chat-details/     # Fetch messages for a specific chat
│   │   ├── chat-history/     # Fetch user's chat list
│   │   ├── login/
│   │   ├── logout/
│   │   ├── me/               # User profile fetch
│   │   ├── ping/             # Health check
│   │   ├── profile/          # User profile update
│   │   ├── refresh/
│   │   ├── register/
│   │   ├── reset-password/
│   │   ├── session/
│   │   ├── stripe-webhook/   # Stripe event handler
│   │   ├── sync-ai-models/   # Sync AI models to DB (Placeholder)
│   │   ├── sync-stripe-plans/ # Sync Stripe plans to DB
│   │   ├── system-prompts/   # Fetch system prompts
│   │   ├── tools/            # Internal tooling scripts (e.g., env sync)
│   │   └── ... (other utility/config files like deno.jsonc, types_db.ts)
│   └── migrations/         # Database migration files (YYYYMMDDHHMMSS_*.sql)
│
├── .env                    # Local environment variables (Supabase/Stripe keys, etc. - UNTRACKED)
├── .env.example            # Example environment variables
├── netlify.toml            # Netlify deployment configuration
├── package.json            # Root package file (pnpm workspaces config)
├── pnpm-lock.yaml          # pnpm lock file
├── pnpm-workspace.yaml     # pnpm workspace definition
├── tsconfig.base.json      # Base TypeScript configuration for the monorepo
├── tsconfig.json           # Root tsconfig (references base)
└── README.md               # This file
```

## Edge Functions (`supabase/functions/`)

```
supabase/functions/
│
├── _shared/             # Shared Deno utilities (CORS, Auth helpers, etc.)
│
├── api-subscriptions/   # Handles subscription actions (checkout, portal, plans, current, cancel, resume, usage)
├── ai-providers/        # Fetches active AI providers
├── chat/                # Handles AI chat message exchange, context management, history saving
├── chat-details/        # Fetches messages for a specific chat ID
├── chat-history/        # Fetches the list of chats for the authenticated user
├── login/               # Handles user login
├── logout/              # Handles user logout
├── me/                  # Handles fetching the current user's profile
├── ping/                # Simple health check endpoint
├── profile/             # Handles updating the current user's profile
├── refresh/             # Handles session token refresh
├── register/            # Handles user registration
├── reset-password/      # Handles password reset flow
├── session/             # Handles session validation/information
├── stripe-webhook/      # Handles incoming Stripe events
├── sync-ai-models/      # [Admin/Internal] Syncs AI models from providers to DB (Placeholder)
├── sync-stripe-plans/   # [Admin/Internal] Syncs Stripe Products/Prices to DB
└── system-prompts/      # Fetches active system prompts
```

## Core Packages & Exports (For AI Assistants)

This section details the key exports from the shared packages to help AI tools understand the available functionality.

### 1. `packages/api-client` (API Interaction)

Manages all frontend interactions with the backend Supabase Edge Functions. It follows a **Singleton pattern**.

- **`initializeApiClient(config: ApiInitializerConfig): void`**: Initializes the singleton instance. Must be called once at application startup.
  - `config: { supabaseUrl: string; supabaseAnonKey: string; }`
- **`api` object (Singleton Accessor)**: Provides methods for making API requests. Import and use this object directly: `import { api } from '@paynless/api-client';`
  - **`api.get<ResponseType>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a GET request.
  - **`api.post<ResponseType, RequestBodyType>(endpoint: string, body: RequestBodyType, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a POST request.
  - **`api.put<ResponseType, RequestBodyType>(endpoint: string, body: RequestBodyType, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a PUT request.
  - **`api.delete<ResponseType>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a DELETE request.
  - **`api.billing()`**: Accessor for the `StripeApiClient` instance.
  - **`api.ai()`**: Accessor for the `AiApiClient` instance.

- **`FetchOptions` type** (defined in `@paynless/types`): Extends standard `RequestInit`.
  - `{ isPublic?: boolean; token?: string; }`
    - `isPublic: boolean` (Optional): If true, the request is made without an Authorization header (defaults to false).
    - `token: string` (Optional): Explicitly provide an auth token to use, otherwise the client attempts to get it from the `authStore`.

- **`ApiResponse<T>` type** (defined in `@paynless/types`): Standard response wrapper.
  - `{ status: number; data?: T; error?: ApiErrorType; }`

- **`ApiError` class**: Custom error class used internally by the client.
  - `constructor(message: string, code?: string | number)`

#### `StripeApiClient` (Accessed via `api.billing()`) 
Methods for interacting with Stripe/Subscription related Edge Functions.

- `createCheckoutSession(priceId: string, isTestMode: boolean, successUrl: string, cancelUrl: string, options?: FetchOptions): Promise<ApiResponse<CheckoutSessionResponse>>`
  - Creates a Stripe Checkout session.
  - Requires `successUrl` and `cancelUrl` for redirection.
  - Returns the session URL (in `data.sessionUrl`) or error.
- `createPortalSession(isTestMode: boolean, options?: FetchOptions): Promise<ApiResponse<PortalSessionResponse>>`
  - Creates a Stripe Customer Portal session.
  - Returns the portal URL or error.
- `getSubscriptionPlans(options?: FetchOptions): Promise<ApiResponse<SubscriptionPlansResponse>>`
  - Fetches available subscription plans (e.g., from `subscription_plans` table).
  - Returns `{ plans: SubscriptionPlan[] }` in the `data` field.
- `getUserSubscription(options?: FetchOptions): Promise<ApiResponse<UserSubscription>>`
  - Fetches the current user's subscription details.
- `cancelSubscription(subscriptionId: string, options?: FetchOptions): Promise<ApiResponse<void>>`
  - Cancels an active subscription via the backend.
- `resumeSubscription(subscriptionId: string, options?: FetchOptions): Promise<ApiResponse<void>>`
  - Resumes a canceled subscription via the backend.
- `getUsageMetrics(metric: string, options?: FetchOptions): Promise<ApiResponse<SubscriptionUsageMetrics>>`
  - Fetches usage metrics for a specific subscription metric.

#### `AiApiClient` (Accessed via `api.ai()`)
Methods for interacting with AI Chat related Edge Functions.

- `getAiProviders(token?: string): Promise<ApiResponse<AiProvider[]>>`
  - Fetches the list of active AI providers.
  - `token` (Optional): Uses token if provided, otherwise assumes public access.
- `getSystemPrompts(token?: string): Promise<ApiResponse<SystemPrompt[]>>`
  - Fetches the list of active system prompts.
  - `token` (Optional): Uses token if provided, otherwise assumes public access.
- `sendChatMessage(data: ChatApiRequest, options: FetchOptions): Promise<ApiResponse<ChatMessage>>`
  - Sends a chat message to the backend `/chat` function.
  - `data: { message: string, providerId: string, promptId: string, chatId?: string }`
  - `options: FetchOptions` (Must specify `isPublic: true` for anonymous or provide `token` for authenticated).
- `getChatHistory(token: string): Promise<ApiResponse<Chat[]>>`
  - Fetches the list of chat conversations for the authenticated user.
  - `token` (Required): User's auth token.
- `getChatMessages(chatId: string, token: string): Promise<ApiResponse<ChatMessage[]>>`
  - Fetches all messages for a specific chat.
  - `chatId` (Required): ID of the chat.
  - `token` (Required): User's auth token.

### 2. `packages/store` (Global State Management)

Uses Zustand for state management with persistence for session data.

#### `useAuthStore` (Hook)
Manages user authentication, session, and profile state.

- **State Properties** (Access via `useAuthStore(state => state.propertyName)`):
  - `user: User | null`
  - `session: Session | null`
  - `profile: UserProfile | null`
  - `isLoading: boolean`
  - `error: Error | null`
  - `navigate: NavigateFunction | null` (Internal function for routing, set via `setNavigate`)
- **Actions** (Access via `useAuthStore(state => state.actionName)` or destructure `const { actionName } = useAuthStore();`):
  - `setNavigate(navigateFn: NavigateFunction): void`
    - Injects the navigation function from the UI framework (e.g., React Router).
  - `setUser(user: User | null): void`
  - `setSession(session: Session | null): void`
  - `setProfile(profile: UserProfile | null): void`
  - `setIsLoading(isLoading: boolean): void`
  - `setError(error: Error | null): void`
  - `login(email: string, password: string): Promise<User | null>`
    - Calls `/login` endpoint, updates state, handles internal navigation on success.
    - Returns user object on success, null on failure.
  - `register(email: string, password: string): Promise<{ success: boolean; user: User | null; redirectTo: string | null }>`
    - Calls `/register` endpoint, updates state, handles internal navigation on success (checking for stashed chat messages).
    - Returns success status, user object, and determined redirect path.
  - `logout(): Promise<void>`
    - Calls `/logout` endpoint, clears local state.
  - `initialize(): Promise<void>`
    - Checks persisted session, calls `/me` endpoint to verify token and fetch user/profile.
  - `refreshSession(): Promise<void>`
    - Calls `/refresh` endpoint using the refresh token, updates state.
  - `updateProfile(profileData: UserProfileUpdate): Promise<boolean>`
    - Calls `/profile` endpoint (PUT), updates local profile state on success.
    - Returns true on success, false on failure.

#### `useSubscriptionStore` (Hook)
Manages subscription plans and the user's current subscription status.

- **State Properties**:
  - `userSubscription: UserSubscription | null`
  - `availablePlans: SubscriptionPlan[]`
  - `isSubscriptionLoading: boolean`
  - `hasActiveSubscription: boolean` (Derived from `userSubscription.status`)
  - `isTestMode: boolean` (Initialized from `VITE_STRIPE_TEST_MODE` env var)
  - `error: Error | null`
- **Actions**:
  - `setUserSubscription(subscription: UserSubscription | null): void`
  - `setAvailablePlans(plans: SubscriptionPlan[]): void`
  - `setIsLoading(isLoading: boolean): void`
  - `setError(error: Error | null): void`
  - `loadSubscriptionData(): Promise<void>`
    - Fetches available plans (`/api-subscriptions/plans`) and current user subscription (`/api-subscriptions/current`).
    - Requires authenticated user (uses token from `authStore`). (Note: `userId` param is currently unused in implementation).
  - `refreshSubscription(): Promise<void>`
    - Calls `loadSubscriptionData` again.
  - `createCheckoutSession(priceId: string): Promise<string | null>`
    - Calls `api.billing().createCheckoutSession`.
    - Returns the Stripe Checkout session URL on success, null on failure.
    - Requires authenticated user.
  - `createBillingPortalSession(): Promise<string | null>`
    - Calls `api.billing().createPortalSession`.
    - Returns the Stripe Customer Portal URL on success, null on failure.
    - Requires authenticated user.
  - `cancelSubscription(subscriptionId: string): Promise<boolean>`
    - Calls `api.billing().cancelSubscription`, then `refreshSubscription`.
    - Returns true on success, false on failure.
    - Requires authenticated user.
  - `resumeSubscription(subscriptionId: string): Promise<boolean>`
    - Calls `api.billing().resumeSubscription`, then `refreshSubscription`.
    - Returns true on success, false on failure.
    - Requires authenticated user.
  - `getUsageMetrics(metric: string): Promise<SubscriptionUsageMetrics | null>`
    - Calls `api.billing().getUsageMetrics`.
    - Returns usage metrics object on success, null on failure.
    - Requires authenticated user.

#### `useAiStore` (Hook)
Manages AI chat state, including providers, prompts, messages, and history.

- **State Properties**:
  - `availableProviders: AiProvider[]`
  - `availablePrompts: SystemPrompt[]`
  - `currentChatMessages: ChatMessage[]`
  - `currentChatId: string | null`
  - `chatHistoryList: Chat[]`
  - `isLoadingAiResponse: boolean` (True while waiting for AI message response)
  - `isConfigLoading: boolean` (True while loading providers/prompts)
  - `isHistoryLoading: boolean` (True while loading chat history list)
  - `isDetailsLoading: boolean` (True while loading messages for a specific chat)
  - `aiError: string | null` (Stores error messages related to AI operations)
  - `anonymousMessageCount: number`
  - `anonymousMessageLimit: number` (Constant, e.g., 3)
- **Actions**:
  - `loadAiConfig(): Promise<void>`
    - Fetches AI providers (`/ai-providers`) and system prompts (`/system-prompts`).
  - `sendMessage(data: { message: string, providerId: string, promptId: string, chatId?: string, isAnonymous: boolean }): Promise<ChatMessage | { error: 'limit_reached' } | null>`
    - Handles sending a message via `api.ai().sendChatMessage`.
    - Manages optimistic UI updates for user message.
    - Updates `currentChatMessages` and `currentChatId`.
    - Handles anonymous user limit check, returning `{ error: 'limit_reached' }` if exceeded.
    - Returns the received `ChatMessage` on success, null on API error.
  - `loadChatHistory(): Promise<void>`
    - Fetches the user's chat list via `api.ai().getChatHistory`.
    - Updates `chatHistoryList`.
    - Requires authenticated user.
  - `loadChatDetails(chatId: string): Promise<void>`
    - Fetches messages for a specific chat via `api.ai().getChatMessages`.
    - Updates `currentChatId` and `currentChatMessages`.
    - Requires authenticated user.
  - `startNewChat(): void`
    - Resets `currentChatId`, `currentChatMessages`, and potentially `anonymousMessageCount`.
  - `incrementAnonymousCount(): void` (Internal helper, called by `sendMessage`)
  - `resetAnonymousCount(): void` (Internal helper)
  - `clearAiError(): void`
    - Sets `aiError` state to null.

### 3. `packages/utils` (Shared Utilities)

#### `logger.ts` (Logging Utility)
Provides a singleton logger instance (`logger`) for consistent application logging.

- **`logger` instance** (Singleton, import `logger` from `@paynless/utils`):
  - `logger.debug(message: string, metadata?: LogMetadata): void`
  - `logger.info(message: string, metadata?: LogMetadata): void`
  - `logger.warn(message: string, metadata?: LogMetadata): void`
  - `logger.error(message: string, metadata?: LogMetadata): void`
- **Configuration**:
  - `logger.configure(config: Partial<LoggerConfig>): void`
    - `config: { minLevel?: LogLevel; enableConsole?: boolean; captureErrors?: boolean; }`
- **`LogLevel` enum**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **`LogMetadata` interface**: `{ [key: string]: unknown; }` (For structured logging data)

### 4. `packages/types` (Shared TypeScript Types)

Contains centralized type definitions used across the monorepo. Exports all types via `index.ts`.

- **`api.types.ts`**: `ApiResponse`, `ApiError`, `FetchOptions`, etc.
- **`auth.types.ts`**: `User`, `Session`, `UserProfile`, `UserProfileUpdate`, `AuthStore`, `AuthResponse`, etc.
- **`subscription.types.ts`**: `SubscriptionPlan`, `UserSubscription`, `SubscriptionStore`, `SubscriptionUsageMetrics`, `CheckoutSessionResponse`, `PortalSessionResponse`, `SubscriptionPlansResponse`, etc.
- **`ai.types.ts`**: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, `ChatApiRequest`, `AiState`, `AiActions`, etc.
- **`theme.types.ts`**: Types related to theming.
- **`route.types.ts`**: Types related to application routing.

### 5. `packages/ui-components` (Reusable UI Components)

Intended for shared React components, but currently **empty** or unused. Components are likely defined within `apps/web/src/components/`.

- **`src/index.ts`**: (File not found or empty)

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

## Setup Guide

This guide covers setting up the Paynless Framework using automated tools like Bolt/Lovable or manually.

### 1. Fork on GitHub
1.  Visit the [Subscription](/subscription) page (or contact the admin) to get access to the Paynless Framework Github Organization team.
2.  Open the Github Organization page for Paynless Framework.
3.  Click the "Fork" button in the top-right corner.
4.  Choose your GitHub account to create the fork under.

### 2. Load into Bolt or Lovable
*   **Using [Bolt.new](https://bolt.new):**
    *   Go to `bolt.new/~/[YOUR GITHUB ROUTE without https://]` (replace with your forked repo path).
    *   Click "Connect to Supabase" and follow the authentication flow.
    *   Click "Deploy" and follow the Netlify deployment flow.
    *   To save progress: Click "Export" then "Download", open the .zip locally, sync changes to your GitHub fork, then reopen the bolt.new URL.
    *   Your project is deployed on Netlify via Bolt!
*   **Using [Lovable.dev](https://lovable.dev):**
    *   Start an empty project.
    *   Click "Sync your project to github" and connect your forked repository.
    *   Click "Connect to Supabase" and follow the authentication flow.
    *   Click "Publish" and follow the Netlify deployment flow.
    *   Your project is deployed on Netlify via Lovable!

*Note: Using Bolt or Lovable often handles Supabase/Netlify connection and initial deployment for you, simplifying the manual steps below.*

### 3. Setup Your Project Manually

#### 3a. Connect to Supabase
1.  Sign in to your [Supabase](https://supabase.com/) account.
2.  Create a new project or use an existing one.
3.  Navigate to your Project Settings > Integrations > GitHub.
4.  Follow the instructions to connect your GitHub account and select your forked repository.
5.  Ensure you set up the required environment variables in your Supabase project settings (refer to `.env.example` in the repository for the list, e.g., `STRIPE_SECRET_KEY`). Supabase might automatically detect some during the GitHub connection process.
6.  Run the database migrations from the `supabase/migrations` folder using the Supabase CLI or dashboard SQL editor to set up your schema.
7.  **How to Set up Supabase CLI and Deploy:**
    *   Install the Supabase CLI globally: `npm install -g supabase`
    *   Log in to the CLI: `supabase login`
    *   Link your local project to your Supabase project: `supabase link --project-ref <your-project-ref> --password <your-database-password>`
        (Find your project ref in your Supabase dashboard URL).
    *   Push local database changes (like migrations) to your Supabase project: `supabase db push`
    *   Deploy all Edge Functions: `supabase functions deploy --no-verify-jwt`
        *   The `--no-verify-jwt` flag is important here because functions like `login` and `register` need to be accessed without a pre-existing user JWT.
        *   Alternatively, deploy functions individually, using the flag only for public ones:
            *   `supabase functions deploy login --no-verify-jwt`
            *   `supabase functions deploy register --no-verify-jwt`
            *   `supabase functions deploy <function_name>` (for others)

#### 3b. Connect to Netlify (for Web App)
1.  Sign in to your [Netlify](https://netlify.com/) account.
2.  Click "Add new site" > "Import an existing project".
3.  Connect to GitHub and authorize Netlify.
4.  Select your forked Paynless Framework repository.
5.  Configure the build settings:
    *   Base directory: `/` (or leave blank if using `netlify.toml`)
    *   Build command: `pnpm install && pnpm -r clean && tsc -b packages/api-client packages/store --verbose && pnpm --filter @paynless/web build` (or use `netlify.toml`)
    *   Publish directory: `apps/web/dist` (or use `netlify.toml`)
6.  Add required environment variables (like `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under Site settings > Build & deploy > Environment.
7.  **Add Redirect for Client-Side Routing:** To ensure direct links or refreshes work correctly with React Router, create a file named `_redirects` in the `apps/web/public` directory with the following content:
    ```
    /*    /index.html    200
    ```
    Alternatively, add the equivalent rule to a `netlify.toml` file in your repository root (Recommended).
8.  Deploy the site.

### 4. Set Up Stripe Products & Webhooks
1.  In your [Stripe](https://stripe.com/) dashboard, create Products and corresponding Prices that match the plans you want to offer.
2.  Set up a Stripe Webhook endpoint:
    *   Go to Developers > Webhooks > Add endpoint.
    *   The endpoint URL should be your deployed Supabase function URL for the webhook handler: `<your-supabase-project-url>/functions/v1/stripe-webhook`
    *   Select the events to listen for. Essential events include:
        *   `checkout.session.completed`
        *   `invoice.paid`
        *   `invoice.payment_failed`
        *   `customer.subscription.updated`
        *   `customer.subscription.deleted`
3.  After creating the webhook, copy the Webhook Signing Secret.
4.  Add this secret as an environment variable named `STRIPE_WEBHOOK_SECRET` to your Supabase project (in the `.env` file for local development via `supabase start`, and in the Supabase Dashboard under Project Settings > Functions for deployed functions).

### 5. Set Up OpenAI API Key
1.  If you plan to use the AI Chat features, you'll need an API key from OpenAI (or another supported provider).
2.  Visit [OpenAI](https://openai.com/) and create an account or sign in.
3.  Navigate to the API Keys section of your OpenAI account settings.
4.  Create a new secret key.
5.  Add this key as an environment variable named `OPENAI_API_KEY`:
    *   For local development: Add it to your root `.env` file (and optionally sync to `supabase/.env.local` using the sync script).
    *   For deployed functions: Add it to your Supabase Project Settings > Functions > Secrets.
6.  Other AI providers (like Anthropic, Gemini) will require similar steps with their respective keys (e.g., `ANTHROPIC_API_KEY`).

### 6. Load into Your Dev Environment
*   **Using [Bolt.new](https://bolt.new):**
    *   Visit [bolt.new](https://bolt.new).
    *   Paste the URL of your forked GitHub repository.
    *   Bolt should clone the repository and set up a development environment.
*   **Using [Lovable.dev](https://lovable.dev):**
    *   Sign in to [lovable.dev](https://lovable.dev).
    *   Connect your GitHub account if you haven't already.
    *   Import your forked repository into Lovable.
*   **Using [Cursor](https://cursor.sh) or Local Dev:**
    *   Ensure you have Git and Node.js (with pnpm) installed.
    *   Clone your forked repository to your local machine (`git clone <your-fork-url>`).
    *   Open the cloned repository folder in your preferred editor (like Cursor).
    *   Install dependencies: Run `pnpm install` in the integrated terminal at the project root.
    *   Copy `.env.example` to `.env` (at the root) and fill in your Supabase/Stripe keys.
    *   (Optional) Sync env vars to `supabase/.env.local` by running: `node supabase/functions/tools/sync-envs.js`
    *   Start the local Supabase stack: `supabase start`
    *   Apply migrations: `supabase db reset` (if first time) or `supabase migration up`
    *   Deploy functions locally: `supabase functions deploy --no-verify-jwt`
    *   Start the web app dev server: `pnpm --filter web dev`

---\nCongratulations, you now have a working app with user auth, profiles, database, and subscriptions ready to go!\n\n
