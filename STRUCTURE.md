# Project Structure & Architecture

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


## API Endpoints (Supabase Edge Functions)

The application exposes the following primary API endpoints through Supabase Edge Functions:

### Authentication & Core User
- `/login`: Handles user sign-up via email/password.
- `/register`: Handles user registration via email/password.
- `/logout`: Handles user logout.
- `/session`: Fetches current session information.
- `/refresh`: Refreshes the authentication token.
- `/reset-password`: Handles the password reset flow.
- `/me`: Fetches the profile for the currently authenticated user.
- `/profile`: Updates the profile for the currently authenticated user.
- `/ping`: Simple health check endpoint.

### Subscriptions & Billing
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

### AI Chat
- `/ai-providers`: Fetches the list of available/active AI providers.
- `/system-prompts`: Fetches the list of available/active system prompts for AI chat.
- `/chat`: Handles sending a user message to an AI provider, managing context, and saving the conversation.
- `/chat-history`: Fetches the list of chat conversations for the authenticated user.
- `/chat-details/:chatId`: Fetches all messages for a specific chat conversation.
- `/sync-ai-models`: (Admin/Internal) Placeholder function intended to synchronize AI models from providers with the `ai_providers` table.

### Internal / Triggers
- `/on-user-created`: Function triggered by Supabase Auth on new user creation (likely for profile creation or sync).

*(Note: This list is based on the `supabase/functions/` directory structure and inferred functionality. Specific HTTP methods and request/response details require reading the function code.)*

## Database Schema (Simplified)

The core database tables defined in `supabase/migrations/` include:

*(Note: This schema description was copied from the previous README and is marked as simplified. It reflects the state when last updated and may require verification against the actual migration files for complete accuracy. RLS policies are also applied but not detailed here.)*

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


## Project Structure (Monorepo)

The project is organized as a monorepo using pnpm workspaces:

```
/
├── apps/                   # Individual applications / Frontends
│   ├── web/                # React Web Application (Vite + React Router)
│   │   └── src/
│   │       ├── assets/         # (May contain static assets like images, fonts) - *Verify if used*
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
│   │       ├── index.css       # Global styles
│   │       └── main.tsx        # Application entry point (renders App)
│   ├── ios/                # iOS Application (Placeholder) //do not remove
│   ├── android/            # Android Application (Placeholder) //do not remove
│   └── desktop/            # Desktop Application (Tauri/Rust) 
│   └── linux/              # Desktop Application (Placeholder) //do not remove
│   └── macos/              # Desktop Application (Placeholder) //do not remove
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
│   │   ├── on-user-created/  # Auth Hook: Triggered after user signs up (e.g., create profile)
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
│   │   ├── deno.jsonc
│   │   ├── deno.lock
│   │   ├── README.md         # Functions-specific README
│   │   └── types_db.ts       # Generated DB types
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
├── on-user-created/     # Auth Hook: Triggered after user signs up (e.g., create profile)
├── ping/                # Simple health check endpoint
├── profile/             # Handles updating the current user's profile
├── refresh/             # Handles session token refresh
├── register/            # Handles user registration
├── reset-password/      # Handles password reset flow
├── session/             # Handles session validation/information
├── stripe-webhook/      # Handles incoming Stripe events
├── sync-ai-models/      # [Admin/Internal] Syncs AI models from providers to DB (Placeholder/Inactive?)
├── sync-stripe-plans/   # [Admin/Internal] Syncs Stripe Products/Prices to DB
└── system-prompts/      # Fetches active system prompts
```

## Core Packages & Exports (For AI Assistants)

This section details the key exports from the shared packages to help AI tools understand the available functionality. *(Note: Details require inspecting package source code)*

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


### 5. `supabase/functions/_shared/` (Backend Shared Utilities)

Contains shared Deno code used by multiple Edge Functions (CORS handling, Supabase client creation, auth helpers, Stripe client initialization). Refer to the files within this directory for specific utilities. 