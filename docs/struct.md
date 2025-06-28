# Project Structure & Architecture

## Architecture Overview

The architecture follows these principles:
- Clear separation between frontend (React) and backend (Supabase Edge Functions)
- RESTful API endpoints (Edge Functions) serve business logic
- Frontend consumes the API via a layered structure (UI -> Service -> API Client)
- Stateless authentication using JWT tokens managed via Supabase Auth
- Consistent error handling and response formatting via `apiClient`
- State management primarily using Zustand stores
- **Platform Abstraction:** A dedicated layer (`packages/platform`) abstracts platform-specific capabilities (like desktop filesystem access) allowing shared UI code to adapt gracefully across different environments (Web, Desktop).

### Core Pattern: API Client Singleton

**Decision (April 2025):** To ensure consistency and simplify integration across multiple frontend platforms (web, mobile) and shared packages (like Zustand stores), the `@paynless/api` package follows a **Singleton pattern**.

*   **Initialization:** The client is configured and initialized *once* per application lifecycle using `initializeApiClient(config)`. Each platform provides the necessary configuration.
*   **Access:** All parts of the application (stores, UI components, platform-specific code) access the single, pre-configured client instance by importing the exported `api` object: `import { api } from '@paynless/api';`.
*   **No DI for Stores:** Shared stores (Zustand) should *not* use dependency injection (e.g., an `init` method) to receive the API client. They should import and use the `api` singleton directly.
*   **Testing:** Unit testing components or stores that use the `api` singleton requires mocking the module import using the test framework's capabilities (e.g., `vi.mock('@paynless/api', ...)`).
*   **Consistency Note:** Older stores (`authStore`, `subscriptionStore`) may still use an outdated DI pattern and require refactoring to align with this singleton approach.


## API Endpoints (Supabase Edge Functions)

The application exposes the following primary API endpoints through Supabase Edge Functions:

### Authentication & Core User
- `/login`: Handles user sign-in via email/password.
- `/register`: Handles user registration via email/password.
- `/logout`: Handles user logout.
- `/session`: Fetches current session information. *(Needs verification if still used)*
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
- `/on-user-created`: Function triggered by Supabase Auth on new user creation (handles profile creation and **optional email marketing sync**).

### Notifications
- `GET /notifications`: Fetches notifications for the current user.
- `PUT /notifications/:notificationId`: Marks a specific notification as read.
- `POST /notifications/mark-all-read`: Marks all user's notifications as read.

### Multi-Tenancy (Organizations)
- `POST /organizations`: Creates a new organization.
- `GET /organizations`: Lists organizations the current user is a member of (supports pagination).
- `GET /organizations/:orgId`: Fetches details for a specific organization.
- `PUT /organizations/:orgId`: Updates organization details (name, visibility) (Admin only).
- `DELETE /organizations/:orgId`: Soft-deletes an organization (Admin only).
- `GET /organizations/:orgId/members`: Lists members of a specific organization (supports pagination).
- `PUT /organizations/:orgId/members/:membershipId/role`: Updates a member's role (Admin only).
- `DELETE /organizations/:orgId/members/:memberId`: Removes a member from an organization (Admin or self).
- `POST /organizations/:orgId/invites`: Invites a user (by email or user_id) to an organization (Admin only).
- `GET /organizations/:orgId/pending`: Lists pending invites and join requests for an organization (Admin only).
- `DELETE /organizations/:orgId/invites/:inviteId`: Cancels a pending invite (Admin only).
- `POST /organizations/:orgId/requests`: Creates a request to join a public organization.
- `PUT /organizations/members/:membershipId/status`: Approves or denies a pending join request (Admin only).
- `GET /organizations/invites/:token/details`: Fetches details for a specific invite token (Invited user only).
- `POST /organizations/invites/:token/accept`: Accepts an organization invitation (Invited user only).
- `POST /organizations/invites/:token/decline`: Declines an organization invitation (Invited user only).

*(Note: This list is based on the `supabase/functions/` directory structure and verified function handlers. Specific request/response details require inspecting function code or the `api` package.)*

## Database Schema (Simplified)

The core database tables defined in `supabase/migrations/` include:

*(Note: This schema description is based on previous documentation and may require verification against the actual migration files (`supabase/migrations/`) for complete accuracy, especially regarding constraints, defaults, and RLS policies.)*

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

### [NEW] Notifications & Multi-Tenancy Schema

- **`public.notifications`** (Stores in-app notifications for users)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, NOT NULL, FK references `auth.users(id) ON DELETE CASCADE`)
  - `type` (text, NOT NULL) - *e.g., 'organization_invite', 'org_join_request', 'org_role_changed'*
  - `data` (jsonb, nullable) - *Stores context like `subject`, `message`, `target_path`, `org_id`, `inviter_name` etc.*
  - `read` (boolean, NOT NULL, default `false`)
  - `created_at` (timestamptz, NOT NULL, default `now()`)
  - *Indexes:* (`user_id`, `created_at` DESC), (`user_id`, `read`)

- **`public.organizations`** (Represents a team, workspace, or organization)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `name` (text, NOT NULL)
  - `visibility` (text, NOT NULL, CHECK (`visibility` IN ('private', 'public')), default `'private'`)
  - `deleted_at` (timestamp with time zone, default `NULL`) - *For soft deletion*
  - `created_at` (timestamp with time zone, default `now()` NOT NULL)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`) - *Added*

- **`public.organization_members`** (Junction table linking users to organizations)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, NOT NULL, FK references `auth.users(id) ON DELETE CASCADE`)
  - `organization_id` (uuid, NOT NULL, FK references `organizations(id) ON DELETE CASCADE`)
  - `role` (text, NOT NULL, CHECK (`role` IN ('admin', 'member')))
  - `status` (text, NOT NULL, CHECK (`status` IN ('pending', 'active', 'removed')))
  - `created_at` (timestamp with time zone, default `now()` NOT NULL)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`) - *Added*
  - *Indexes:* (`user_id`), (`organization_id`), (`user_id`, `organization_id`) UNIQUE

- **`public.invites`** (Stores invitations for users to join organizations)
  - `id` (uuid PK DEFAULT `gen_random_uuid()`)
  - `invite_token` (TEXT UNIQUE NOT NULL DEFAULT `extensions.uuid_generate_v4()`)
  - `organization_id` (UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE)
  - `invited_email` (TEXT NOT NULL)
  - `invited_user_id` (UUID NULLABLE REFERENCES auth.users(id) ON DELETE SET NULL)
  - `role_to_assign` (TEXT NOT NULL CHECK (`role_to_assign` IN ('admin', 'member')))
  - `invited_by_user_id` (UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL)
  - `status` (TEXT NOT NULL CHECK (`status` IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT `'pending'`)
  - `created_at` (TIMESTAMPTZ DEFAULT `now()` NOT NULL)
  - `expires_at` (TIMESTAMPTZ NULL)
  - *Indexes:* (`invite_token`), (`organization_id`), (`invited_email`), (`invited_user_id`), (`status`), (`organization_id`, `invited_email` where `status`='pending'), (`organization_id`, `invited_user_id` where `status`='pending')

### [NEW] Backend Logic (Notifications & Tenancy)

- **Row-Level Security (RLS):**
  - `notifications`: Users can only access their own notifications.
  - `organizations`: Users can only SELECT/UPDATE/DELETE non-deleted orgs they are active members of (role-based permissions for UPDATE/DELETE). Authenticated users can INSERT.
  - `organization_members`: Users can SELECT memberships for orgs they are members of. Admins can manage memberships within their org (INSERT/UPDATE/DELETE, respecting last admin check). Users can DELETE their own membership (leave).
  - `invites`: Admins can manage invites (SELECT/INSERT/UPDATE/DELETE) for their org. Invited users (matched by ID or email) can SELECT/UPDATE (status only) their own pending invites.
  - *Existing Tables*: RLS on tables like `chats`, `chat_messages`, etc., **needs review** to ensure they correctly scope data based on the user's `currentOrganizationId` or active organization memberships, possibly via helper functions or policy adjustments.
- **Triggers/Functions:**
  - **Notification Triggers:** Database triggers (`handle_new_invite_notification`, `handle_new_join_request`, `handle_member_role_change`, `handle_member_removed`) create entries in `notifications` upon specific events in `invites` or `organization_members`.
  - **Invite Management Triggers:**
    - `restrict_invite_update_fields`: Prevents non-admins from changing fields other than `status` on invites.
    - `link_pending_invites_on_signup`: Updates `invites.invited_user_id` when a user signs up with a matching email.
  - **Membership Management:**
    - **Last Admin Check:** A trigger prevents the last active admin of a non-deleted organization from being removed or demoted.
  - **Helper Functions:**
    - `is_org_member(org_id, user_id, status, role)`: Checks membership status/role in an org (used by RLS).
    - `is_org_admin(org_id)`: Checks if current user is admin of org (used by RLS).
    - `check_existing_member_by_email(org_id, email)`: Checks if email belongs to existing member/pending request (used by backend).

## Project Structure (Monorepo)

The project is organized as a monorepo using pnpm workspaces:

```
/
├── apps/                   # Individual applications / Frontends
│   ├── web/                # React Web Application (Vite + React Router)
│   │   └── src/
│   │       ├── assets/         # Static assets (images, fonts, etc.)
│   │       ├── components/     # UI Components specific to web app
│   │       │   ├── ai/
│   │       │   ├── auth/
│   │       │   ├── common/       # Shared common components (e.g., ErrorBoundary)
│   │       │   ├── debug/        # [NEW] Components for debugging/development
│   │       │   ├── demos/        # [NEW] Demonstration components
│   │       │   │   └── WalletBackupDemo/ # Example of platform capabilities
│   │       │   │       ├── FileActionButtons.tsx
│   │       │   │       ├── GenerateMnemonicButton.tsx
│   │       │   │       ├── MnemonicInputArea.tsx
│   │       │   │       ├── StatusDisplay.tsx
│   │       │   │       └── WalletBackupDemoCard.tsx
│   │       │   ├── features/     # [NEW] Feature-specific components (e.g. feature flags)
│   │       │   ├── integrations/
│   │       │   ├── layout/       # Includes header, sidebar
│   │       │   ├── marketing/
│   │       │   ├── notifications/ # << NEW DIR
│   │       │   │   ├── Notifications.tsx # Component for displaying notifications list
│   │       │   │   └── NotificationCard.tsx # Component for individual notification display
│   │       │   ├── organizations/ # << Existing
│   │       │   │   ├── AdminBadge.tsx
│   │       │   │   ├── CreateOrganizationForm.tsx
│   │       │   │   ├── CreateOrganizationModal.tsx
│   │       │   │   ├── DeleteOrganizationDialog.tsx
│   │       │   │   ├── InviteMemberCard.tsx
│   │       │   │   ├── MemberListCard.tsx
│   │       │   │   ├── OrganizationDetailsCard.tsx
│   │       │   │   ├── OrganizationListCard.tsx
│   │       │   │   ├── OrganizationSettingsCard.tsx
│   │       │   │   ├── OrganizationSwitcher.tsx
│   │       │   │   └── PendingActionsCard.tsx
│   │       │   ├── profile/
│   │       │   ├── routes/
│   │       │   ├── subscription/
│   │       │   └── ui/           # Re-exported shadcn/ui components
│   │       │   └── Notifications.tsx # << CORRECTED: Top-level component for notifications
│   │       │   └── NotificationCard.tsx # << NEW: Component for individual notification display
│   │       ├── config/         # App-specific config (e.g., routes)
│   │       ├── context/        # React context providers
│   │       ├── hooks/          # Custom React hooks
│   │       ├── lib/            # Utility functions (e.g., cn)
│   │       ├── pages/          # Page components (routed via React Router)
│   │       │   ├── AcceptInvitePage.tsx
│   │       │   ├── AiChat.tsx
│   │       │   ├── Dashboard.tsx
│   │       │   ├── Home.tsx
│   │       │   ├── Login.tsx
│   │       │   ├── Notifications.tsx # Page-level component (distinct from component/notifications/)
│   │       │   ├── OrganizationFocusedViewPage.tsx
│   │       │   ├── OrganizationHubPage.tsx
│   │       │   ├── Profile.tsx
│   │       │   ├── Register.tsx
│   │       │   ├── Subscription.tsx
│   │       │   └── SubscriptionSuccess.tsx
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
│   ├── windows/            # Windows Application (Tauri/Rust)
│   ├── linux/              # Linux Application (Placeholder) //do not remove
│   └── macos/              # Mac Application (Placeholder) //do not remove
│
├── packages/               # Shared libraries/packages
│   ├── api/                # Frontend API client logic (Singleton)
│   │   └── src/
│   │       ├── apiClient.ts      # Base API client (fetch wrapper, singleton)
│   │       ├── ai.api.ts         # AI Chat specific client methods
│   │       ├── notifications.api.ts # Notification fetching/updates/realtime
│   │       ├── organizations.api.ts # Organization & Member management methods
│   │       └── stripe.api.ts     # Stripe/Subscription specific client methods (Filename corrected)
│   ├── analytics/          # Frontend analytics client logic (PostHog, Null adapter)
│   │   └── src/
│   │       ├── index.ts          # Main service export & factory
│   │       ├── nullAdapter.ts    # No-op analytics implementation
│   │       └── posthogAdapter.ts # PostHog implementation
│   ├── store/              # Zustand global state stores
│   │   └── src/
│   │       ├── authStore.ts        # Auth state & actions
│   │       ├── subscriptionStore.ts # Subscription state & actions
│   │       └── aiStore.ts          # AI Chat state & actions
│   │       ├── notificationStore.ts # In-app notification state & actions
│   │       └── organizationStore.ts # Organization/Multi-tenancy state & actions
│   ├── types/              # Shared TypeScript types and interfaces
│   │   └── src/
│   │       ├── api.types.ts
│   │       ├── auth.types.ts
│   │       ├── subscription.types.ts
│   │       ├── ai.types.ts
│   │       ├── analytics.types.ts
│   │       ├── platform.types.ts
│   │       ├── email.types.ts    # [NEW] Email marketing types
│   │       ├── theme.types.ts
│   │       ├── route.types.ts
│   │       ├── vite-env.d.ts
│   │       └── index.ts            # Main export for types
│   ├── platform/           # Service for abstracting platform-specific APIs (FS, etc.)
│   │   └── src/
│   │       ├── context.tsx     # PlatformProvider context and usePlatform hook, Tauri event listener
│   │       ├── events.ts       # Event emitter and types for cross-component communication (e.g., file drop)
│   │       ├── index.ts        # Main service export, platform/OS detection, provider loading
│   │       ├── tauri.ts        # Tauri platform provider (uses Tauri plugins for native features like FS/Dialog)
│   │       └── web.ts          # Web platform provider (implements capabilities for standard browser)
│   └── utils/              # Shared utility functions
│       └── src/
│           └── logger.ts         # Logging utility (singleton)
│
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Backend API)
│   │   ├── _shared/          # Shared Deno utilities for functions
│   │   │   ├── auth.ts           # Auth helpers
│   │   │   ├── cors-headers.ts   # CORS header generation
│   │   │   ├── email_service/    # Email marketing service
│   │   │   │   ├── factory.ts      # Selects email service implementation
│   │   │   │   ├── kit_service.ts  # Kit implementation (planned)
│   │   │   │   └── no_op_service.ts # No-op implementation (planned)
│   │   │   ├── responses.ts      # Standardized response helpers
│   │   │   └── stripe-client.ts  # Stripe client initialization
│   │   ├── node_modules/     # Function dependencies (managed by Deno/npm) - Added
│   │   ├── api-subscriptions/ # Subscription management endpoints
│   │   ├── ai-providers/     # Fetch AI providers
│   │   ├── chat/             # Handle AI chat message exchange
│   │   ├── chat-details/     # Fetch messages for a specific chat
│   │   ├── chat-history/     # Fetch user's chat list
│   │   ├── login/
│   │   ├── logout/
│   │   ├── me/               # User profile fetch
│   │   ├── notifications/    # Notification backend logic
│   │   ├── on-user-created/  # Auth Hook: Triggered after user signs up
│   │   ├── organizations/    # Organization backend logic
│   │   ├── ping/             # Health check
│   │   ├── profile/          # User profile update
│   │   ├── register/
│   │   ├── reset-password/
│   │   ├── session/
│   │   ├── stripe-webhook/   # Stripe event handler
│   │   ├── sync-ai-models/   # Sync AI models to DB (Placeholder)
│   │   ├── sync-stripe-plans/ # Sync Stripe plans to DB
│   │   ├── system-prompts/   # Fetch system prompts
│   │   ├── tools/            # Internal tooling scripts (e.g., env sync)
│   │   ├── deno.jsonc        # Deno config
│   │   ├── deno.lock         # Deno lock file
│   │   ├── README.md         # Functions-specific README
│   │   └── types_db.ts       # Generated DB types
│   └── migrations/         # Database migration files (YYYYMMDDHHMMSS_*.sql)
│
├── .env                    # Local environment variables (Supabase/Stripe/Kit keys, etc. - UNTRACKED)
├── .env.example            # Example environment variables
├── netlify.toml            # Netlify deployment configuration
├── package.json            # Root package file (pnpm workspaces config)
├── pnpm-lock.yaml          # pnpm lock file
├── pnpm-workspace.yaml     # pnpm workspace definition
├── tsconfig.base.json      # Base TypeScript configuration for the monorepo
├── tsconfig.json           # Root tsconfig (references base)
├── tsconfig.node.json      # [NEW] TS config for Node scripts
└── README.md               # Project root README
```

## Edge Functions (`supabase/functions/`)

```
supabase/functions/
│
├── _shared/             # Shared Deno utilities
│   ├── auth.ts
│   ├── cors-headers.ts
│   ├── email_service/   # Email marketing service
│   │   ├── factory.ts
│   │   ├── kit_service.ts
│   │   └── no_op_service.ts
│   ├── responses.ts
│   └── stripe-client.ts
│
├── api-subscriptions/   # Handles subscription actions (checkout, portal, plans, current, cancel, resume, usage)
├── ai-providers/        # Fetches active AI providers
├── chat/                # Handles AI chat message exchange, context management, history saving
├── chat-details/        # Fetches messages for a specific chat
├── chat-history/        # Fetches the list of chats for the authenticated user
├── login/               # Handles user login
├── logout/              # Handles user logout
├── me/                  # Handles fetching the current user's profile
├── notifications/       # [NEW] Notification backend logic
├── on-user-created/     # Auth Hook: Triggered after user signs up (e.g., create profile, email sync)
├── organizations/       # [NEW] Organization backend logic
├── ping/                # Simple health check endpoint
├── profile/             # Handles updating the current user's profile
├── register/            # Handles user registration
├── reset-password/      # Handles password reset flow
├── session/             # Handles session validation/information (needs verification)
├── stripe-webhook/      # Handles incoming Stripe events
├── sync-ai-models/      # [Admin/Internal] Syncs AI models from providers to DB (Placeholder/Inactive?)
├── sync-stripe-plans/   # [Admin/Internal] Syncs Stripe plans to DB
├── system-prompts/      # Fetches active system prompts
└── tools/               # [NEW] Internal tooling scripts (e.g., env sync)
```

## Core Packages & Exports (For AI Assistants)

### 1. `packages/api` (API Interaction)

Manages all frontend interactions with the backend Supabase Edge Functions. It follows a **Singleton pattern**.

- **`initializeApiClient(config: ApiInitializerConfig): void`**: Initializes the singleton instance. Must be called once at application startup.
  - `config: { supabaseUrl: string; supabaseAnonKey: string; }`
- **`api` object (Singleton Accessor)**: Provides methods for making API requests. Import and use this object directly: `import { api } from '@paynless/api';`
  - **`api.get<ResponseType>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a GET request.
  - **`api.post<ResponseType, RequestBodyType>(endpoint: string, body: RequestBodyType, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a POST request.
  - **`api.put<ResponseType, RequestBodyType>(endpoint: string, body: RequestBodyType, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a PUT request.
  - **`api.delete<ResponseType>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a DELETE request.
  - **`api.billing()`**: Accessor for the `StripeApiClient` instance.
  - **`api.ai()`**: Accessor for the `AiApiClient` instance.
  - **`api.notifications()`**: [NEW] Accessor for the `NotificationApiClient` instance.
  - **`api.organizations()`**: [NEW] Accessor for the `OrganizationApiClient` instance.

- **`FetchOptions` type** (defined in `@paynless/types`): Extends standard `RequestInit`.
  - `{ isPublic?: boolean; token?: string; }` (Plus standard `RequestInit` properties like `headers`, `method`, `body`)
    - `isPublic: boolean` (Optional): If true, the request is made without an Authorization header (defaults to false). The API client *always* includes the `apikey` header.
    - `token: string` (Optional): Explicitly provide an auth token to use, otherwise the client attempts to get it from the `authStore` if `isPublic` is false.

- **`ApiResponse<T>` type** (defined in `@paynless/types`): Standard response wrapper.
  - `{ status: number; data?: T; error?: ApiErrorType; }`

- **`ApiError` class** (defined in `@paynless/api`): Custom error class used internally by the client.
- **`AuthRequiredError` class** (defined in `@paynless/types`): Specific error for auth failures detected by the client.

#### `StripeApiClient` (Accessed via `api.billing()`)
Methods for interacting with Stripe/Subscription related Edge Functions.

- `createCheckoutSession(priceId: string, isTestMode: boolean, successUrl: string, cancelUrl: string, options?: FetchOptions): Promise<ApiResponse<CheckoutSessionResponse>>`
  - Creates a Stripe Checkout session.
  - Requires `successUrl` and `cancelUrl` for redirection.
  - Returns the session URL (in `data.sessionUrl`) or error.
- `createPortalSession(isTestMode: boolean, returnUrl: string, options?: FetchOptions): Promise<ApiResponse<PortalSessionResponse>>`
  - Creates a Stripe Customer Portal session.
  - Requires `returnUrl` for redirection after portal usage.
  - Returns the portal URL (in `data.url`) or error.
- `getSubscriptionPlans(options?: FetchOptions): Promise<ApiResponse<SubscriptionPlan[]>>`
  - Fetches available subscription plans (e.g., from `subscription_plans` table).
  - Returns `SubscriptionPlan[]` in the `data` field. (Updated response description)
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
  - `token` (Optional): Uses token if provided, otherwise assumes public access (`isPublic: true` in options).
- `getSystemPrompts(token?: string): Promise<ApiResponse<SystemPrompt[]>>`
  - Fetches the list of active system prompts.
  - `token` (Optional): Uses token if provided, otherwise assumes public access (`isPublic: true` in options).
- `sendChatMessage(data: ChatApiRequest, options: FetchOptions): Promise<ApiResponse<ChatMessage>>`
  - Sends a chat message to the backend `/chat` function.
  - `data: ChatApiRequest ({ message: string, providerId: string, promptId: string, chatId?: string })`
  - `options: FetchOptions` (Must include `token` for authenticated user).
- `getChatHistory(token: string): Promise<ApiResponse<Chat[]>>`
  - Fetches the list of chat conversations for the authenticated user.
  - `token` (Required): User's auth token.
- `getChatMessages(chatId: string, token: string): Promise<ApiResponse<ChatMessage[]>>`
  - Fetches all messages for a specific chat.
  - `chatId` (Required): ID of the chat.
  - `token` (Required): User's auth token.

#### [NEW] `NotificationApiClient` (Accessed via `api.notifications()`)
Methods for interacting with Notification related Edge Functions.

- `fetchNotifications(token: string): Promise<ApiResponse<Notification[]>>`
  - Fetches notifications for the authenticated user.
- `markNotificationRead(notificationId: string, token: string): Promise<ApiResponse<void>>`
  - Marks a specific notification as read.
- `markAllNotificationsAsRead(token: string): Promise<ApiResponse<void>>`
  - Marks all user's notifications as read.
- `subscribeToNotifications(handler: (payload: RealtimePostgresChangesPayload<Notification>) => void): Promise<Subscription | null>`
  - Subscribes to real-time notification updates via Supabase Realtime.
- `unsubscribeFromNotifications(subscription: Subscription | null): Promise<void>`
  - Unsubscribes from real-time notification updates.

#### [NEW] `OrganizationApiClient` (Accessed via `api.organizations()`)
Methods for interacting with Organization related Edge Functions.

- `createOrganization(data: CreateOrganizationRequest, token: string): Promise<ApiResponse<Organization>>`
  - Creates a new organization.
- `listUserOrganizations(pagination: PaginationParams, token: string): Promise<ApiResponse<PaginatedResponse<OrganizationMember>>>`
  - Lists organizations the user is a member of (paginated).
- `getOrganizationDetails(orgId: string, token: string): Promise<ApiResponse<OrganizationDetails>>`
  - Fetches details for a specific organization (including members, pending actions).
- `updateOrganization(orgId: string, data: UpdateOrganizationRequest, token: string): Promise<ApiResponse<Organization>>`
  - Updates organization details (admin only).
- `deleteOrganization(orgId: string, token: string): Promise<ApiResponse<void>>`
  - Soft-deletes an organization (admin only).
- `getOrganizationMembers(orgId: string, pagination: PaginationParams, token: string): Promise<ApiResponse<PaginatedResponse<OrganizationMember>>>`
  - Lists members of a specific organization (paginated).
- `updateMemberRole(orgId: string, membershipId: string, newRole: OrganizationRole, token: string): Promise<ApiResponse<OrganizationMember>>`
  - Updates a member's role (admin only).
- `removeMember(orgId: string, memberId: string, token: string): Promise<ApiResponse<void>>`
  - Removes a member from an organization (admin or self).
- `inviteUserByEmail(orgId: string, email: string, role: OrganizationRole, token: string): Promise<ApiResponse<Invite>>`
  - Invites a user by email (admin only).
- `getInviteDetails(inviteToken: string): Promise<ApiResponse<InviteDetails>>`
  - Fetches details for a specific invite token (invited user or org admin).
- `acceptOrganizationInvite(inviteToken: string, token: string): Promise<ApiResponse<OrganizationMember>>`
  - Accepts an organization invitation (invited user).
- `declineOrganizationInvite(inviteToken: string, token: string): Promise<ApiResponse<void>>`
  - Declines an organization invitation (invited user).
- `cancelInvite(orgId: string, inviteId: string, token: string): Promise<ApiResponse<void>>`
  - Cancels a pending invite (admin only).
- `requestToJoinOrganization(orgId: string, token: string): Promise<ApiResponse<OrganizationMember>>`
  - Creates a request to join a public organization.
- `getPendingOrgActions(orgId: string, token: string): Promise<ApiResponse<PendingOrgActions>>`
  - Fetches pending invites and join requests (admin only).
- `approveJoinRequest(orgId: string, membershipId: string, token: string): Promise<ApiResponse<OrganizationMember>>`
  - Approves a pending join request (admin only).
- `denyJoinRequest(orgId: string, membershipId: string, token: string): Promise<ApiResponse<void>>`
  - Denies a pending join request (admin only).
- `leaveOrganization(orgId: string, membershipId: string, token: string): Promise<ApiResponse<void>>`
  - Allows a user to leave an organization.

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
- **Actions** (Access via `useAuthStore.getState().actionName` or destructure `const { actionName } = useAuthStore();`):
  - `setNavigate(navigateFn: NavigateFunction): void`
    - Injects the navigation function from the UI framework (e.g., React Router).
  - `setUser(user: User | null): void`
  - `setSession(session: Session | null): void`
  - `setProfile(profile: UserProfile | null): void`
  - `setIsLoading(isLoading: boolean): void`
  - `setError(error: Error | null): void`
  - `login(email: string, password: string): Promise<User | null>`
    - Calls `/login` endpoint, updates state, handles internal navigation on success (including potential action replay).
    - Returns user object on success, null on failure.
  - `register(email: string, password: string): Promise<User | null>`
    - Calls `/register` endpoint, updates state, handles internal navigation on success (including potential action replay).
    - Returns user object on success, null on failure.
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
  - `isTestMode: boolean` (Set via `setTestMode` action, typically from env var)
  - `error: Error | null`
- **Actions**:
  - `setUserSubscription(subscription: UserSubscription | null): void`
  - `setAvailablePlans(plans: SubscriptionPlan[]): void`
  - `setIsLoading(isLoading: boolean): void`
  - `setTestMode(isTestMode: boolean): void`
  - `setError(error: Error | null): void`
  - `loadSubscriptionData(): Promise<void>`
    - Fetches available plans (`/api-subscriptions/plans`) and current user subscription (`/api-subscriptions/current`).
    - Requires authenticated user (uses token from `authStore`).
  - `refreshSubscription(): Promise<boolean>`
    - Calls `loadSubscriptionData` again. Returns true on success, false on failure.
  - `createCheckoutSession(priceId: string): Promise<string | null>`
    - Calls `api.billing().createCheckoutSession`. Requires success/cancel URLs derived from `window.location`.
    - Returns the Stripe Checkout session URL on success, null on failure.
    - Requires authenticated user.
  - `createBillingPortalSession(): Promise<string | null>`
    - Calls `api.billing().createPortalSession`. Requires return URL derived from `window.location`.
    - Returns the Stripe Customer Portal URL on success, null on failure.
    - Requires authenticated user.
  - `cancelSubscription(subscriptionId: string): Promise<boolean>`
    - Calls `api.billing().cancelSubscription`, then `refreshSubscription`. Returns true on success, false on failure.
    - Requires authenticated user.
  - `resumeSubscription(subscriptionId: string): Promise<boolean>`
    - Calls `api.billing().resumeSubscription`, then `refreshSubscription`. Returns true on success, false on failure.
    - Requires authenticated user.
  - `getUsageMetrics(metric: string): Promise<SubscriptionUsageMetrics | null>`
    - Calls `api.billing().getUsageMetrics`. Returns usage metrics object on success, null on failure.
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
- **Actions**:
  - `loadAiConfig(): Promise<void>`
    - Fetches AI providers (`/ai-providers`) and system prompts (`/system-prompts`).
  - `sendMessage(data: ChatApiRequest): Promise<ChatMessage | null>`
    - Handles sending a message via `api.ai().sendChatMessage`. Requires `token` in `FetchOptions` provided to API client.
    - Manages optimistic UI updates for user message.
    - Updates `currentChatMessages` and `currentChatId`.
    - If `AuthRequiredError` is caught, attempts to store pending action and navigate to `/login`.
    - Returns the received `ChatMessage` on success, null on API error or if auth redirect occurs.
  - `loadChatHistory(): Promise<void>`
    - Fetches the user's chat list via `api.ai().getChatHistory`.
    - Updates `chatHistoryList`.
    - Requires authenticated user (token obtained from `authStore`).
  - `loadChatDetails(chatId: string): Promise<void>`
    - Fetches messages for a specific chat via `api.ai().getChatMessages`.
    - Updates `currentChatId` and `currentChatMessages`.
    - Requires authenticated user (token obtained from `authStore`).
  - `startNewChat(): void`
    - Resets `currentChatId` and `currentChatMessages`.
  - `clearAiError(): void`
    - Sets `aiError` state to null.

#### [NEW] `useNotificationStore` (Hook)
Manages in-app notification state.

- **State Properties**:
  - `notifications: Notification[]`
  - `unreadCount: number` (Derived from `notifications`)
  - `isLoading: boolean`
  - `error: Error | null`
  - `realtimeSubscription: Subscription | null` (Internal)
- **Actions**:
  - `loadNotifications(): Promise<void>`
    - Fetches notifications using `api.notifications().fetchNotifications`.
    - Updates `notifications` and `unreadCount`.
    - Requires authenticated user.
  - `markNotificationRead(notificationId: string): Promise<void>`
    - Optimistically updates UI and calls `api.notifications().markNotificationRead`.
    - Requires authenticated user.
  - `markAllNotificationsAsRead(): Promise<void>`
    - Optimistically updates UI and calls `api.notifications().markAllNotificationsAsRead`.
    - Requires authenticated user.
  - `subscribeToNotifications(): Promise<void>`
    - Initializes real-time subscription using `api.notifications().subscribeToNotifications`.
    - Handles incoming notification payloads to update state.
    - Requires authenticated user.
  - `unsubscribeFromNotifications(): Promise<void>`
    - Cleans up real-time subscription.

#### [NEW] `useOrganizationStore` (Hook)
Manages multi-tenancy (organizations) state.

- **State Properties**:
  - `organizationsList: OrganizationMember[]` (User's memberships)
  - `currentOrganizationId: string | null`
  - `currentOrganizationDetails: OrganizationDetails | null` (Includes org data, members, pending actions)
  - `listPagination: PaginationState`
  - `memberPagination: PaginationState`
  - `isLoadingList: boolean`
  - `isLoadingDetails: boolean`
  - `isLoadingAction: boolean` (For specific member/invite actions)
  - `error: string | null`
  - `inviteDetails: InviteDetails | null` (For invite acceptance flow)
  - `isCreateModalOpen: boolean`
  - `isInviteModalOpen: boolean`
  - `isSettingsModalOpen: boolean`
- **Actions**:
  - `loadUserOrganizations(page?: number, limit?: number): Promise<void>`
    - Fetches user's org memberships using `api.organizations().listUserOrganizations`.
  - `selectOrganization(orgId: string | null): Promise<void>`
    - Sets `currentOrganizationId`. If `orgId` is not null, calls `loadOrganizationDetails`.
  - `loadOrganizationDetails(orgId: string): Promise<void>`
    - Fetches full org details using `api.organizations().getOrganizationDetails`.
  - `createOrganization(data: CreateOrganizationRequest): Promise<Organization | null>`
    - Calls `api.organizations().createOrganization`, refreshes list, selects new org.
  - `updateOrganization(orgId: string, data: UpdateOrganizationRequest): Promise<boolean>`
    - Calls `api.organizations().updateOrganization`, refreshes details.
  - `deleteOrganization(orgId: string): Promise<boolean>`
    - Calls `api.organizations().deleteOrganization`, refreshes list, clears selection if needed.
  - `loadOrganizationMembers(orgId: string, page?: number, limit?: number): Promise<void>`
    - Fetches org members (if needed separately) using `api.organizations().getOrganizationMembers`.
  - `updateMemberRole(orgId: string, membershipId: string, newRole: OrganizationRole): Promise<boolean>`
    - Calls `api.organizations().updateMemberRole`, refreshes details.
  - `removeMember(orgId: string, memberId: string): Promise<boolean>`
    - Calls `api.organizations().removeMember`, refreshes details.
  - `inviteUserByEmail(orgId: string, email: string, role: OrganizationRole): Promise<boolean>`
    - Calls `api.organizations().inviteUserByEmail`, refreshes details.
  - `loadInviteDetails(inviteToken: string): Promise<void>`
    - Calls `api.organizations().getInviteDetails`.
  - `acceptInvite(inviteToken: string): Promise<OrganizationMember | null>`
    - Calls `api.organizations().acceptOrganizationInvite`, refreshes list, selects new org.
  - `declineInvite(inviteToken: string): Promise<boolean>`
    - Calls `api.organizations().declineOrganizationInvite`.
  - `cancelInvite(orgId: string, inviteId: string): Promise<boolean>`
    - Calls `api.organizations().cancelInvite`, refreshes details.
  - `requestToJoin(orgId: string): Promise<boolean>`
    - Calls `api.organizations().requestToJoinOrganization`, refreshes details.
  - `approveJoinRequest(orgId: string, membershipId: string): Promise<boolean>`
    - Calls `api.organizations().approveJoinRequest`, refreshes details.
  - `denyJoinRequest(orgId: string, membershipId: string): Promise<boolean>`
    - Calls `api.organizations().denyJoinRequest`, refreshes details.
  - `leaveOrganization(orgId: string, membershipId: string): Promise<boolean>`
    - Calls `api.organizations().leaveOrganization`, refreshes list, clears selection if needed.
  - `setCreateModalOpen(isOpen: boolean): void`
  - `setInviteModalOpen(isOpen: boolean): void`
  - `setSettingsModalOpen(isOpen: boolean): void`
  - `setListPagination(pagination: Partial<PaginationState>): void`
  - `setMemberPagination(pagination: Partial<PaginationState>): void`
  - `clearError(): void`

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

- **`api.types.ts`**: `ApiResponse`, `ApiErrorType`, `FetchOptions`, `AuthRequiredError`, `PaginationParams`, `PaginatedResponse`, etc. (Added pagination types)
- **`auth.types.ts`**: `User`, `Session`, `UserProfile`, `UserProfileUpdate`, `AuthStore`, `AuthResponse`, etc.
- **`subscription.types.ts`**: `SubscriptionPlan`, `UserSubscription`, `SubscriptionStore`, `SubscriptionUsageMetrics`, `CheckoutSessionResponse`, `PortalSessionResponse`, `SubscriptionPlansResponse`, etc.
- **`ai.types.ts`**: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, `ChatApiRequest`, `AiState`, `AiStore`, etc.
- **`notification.types.ts`**: [NEW] `Notification`, `NotificationStore`, `NotificationData`.
- **`organization.types.ts`**: [NEW] `Organization`, `OrganizationMember`, `OrganizationRole`, `OrganizationVisibility`, `Invite`, `InviteStatus`, `MembershipStatus`, `OrganizationStore`, `CreateOrganizationRequest`, `UpdateOrganizationRequest`, `InviteDetails`, `OrganizationDetails`, `PendingOrgActions`.
- **`analytics.types.ts`**: `AnalyticsClient`, `AnalyticsEvent`, `AnalyticsUserTraits`.
- **`platform.types.ts`**: `PlatformCapabilities`, `FileSystemCapabilities`, `PlatformContextType`, `PlatformEvent`. (Updated)
- **`email.types.ts`**: `SubscriberInfo`, `EmailMarketingService`. **[NEW]**
- **`theme.types.ts`**: Types related to theming.
- **`route.types.ts`**: Types related to application routing.
- **`vite-env.d.ts`**: Vite environment types.

### 5. `packages/platform` (Platform Abstraction)

Provides a service to abstract platform-specific functionalities (like filesystem access) for use in shared UI code.

- **`getPlatformCapabilities(): Promise<PlatformCapabilities>`**: (Exported from `index.ts`) Detects the current platform (web, tauri, etc.) and asynchronously returns an object describing available capabilities (e.g., `fileSystem`). Result is memoized.
- **`PlatformProvider` Component & `usePlatform` Hook**: (Exported from `index.ts`, defined in `context.tsx`) Wraps the application (or parts of it) to provide capability state (`capabilities: PlatformCapabilities | null`, `isLoadingCapabilities: boolean`, `capabilityError: Error | null`) via the hook. Consumers use the hook to access state and check capability availability (e.g., `capabilities.fileSystem.isAvailable`) before rendering UI or calling methods.
- **`platformEventEmitter`**: (Exported from `index.ts`, defined in `events.ts`) A `mitt` event emitter instance used for decoupled communication, primarily for broadcasting drag-and-drop events (`file-drop`, `file-drag-hover`, `file-drag-cancel`) from the Tauri listener in `context.tsx` to consuming components like `DropZone`.
- **Providers (Internal - Loaded dynamically by `index.ts`)**:
  - `web.ts`: Implements capabilities available in a standard web browser (FS is `isAvailable: false`).
  - `tauri.ts`: Implements capabilities available in the Tauri desktop environment using standard Tauri plugins (`fs`, `dialog`).
- **`resetMemoizedCapabilities(): void`**: (Exported from `index.ts`) Clears the cached capabilities result (useful for testing).

### 6. `supabase/functions/_shared/` (Backend Shared Utilities)

Contains shared Deno code used by multiple Edge Functions (CORS handling, Supabase client creation, auth helpers, Stripe client initialization, **email marketing service**). Refer to the files within this directory for specific utilities.

## Core Packages Breakdown

### `@paynless/api`
- **Purpose:** Provides typed methods for interacting with the backend Supabase Edge Functions. Implemented as a **Singleton** initialized once per app.
- **Key Classes/Methods:**
  - `ApiClient`: Base class handling fetch, auth headers, error handling, response parsing.
  - `StripeApiClient`: Methods like `getCurrentSubscription`, `createCheckoutSession`, `createBillingPortalSession`, `getPlans`.
  - `AiApiClient`: Methods like `sendMessage`, `getChatHistory`, `getChatDetails`, `getAiProviders`, `getSystemPrompts`.
  - `NotificationApiClient`: Methods like `fetchNotifications`, `markNotificationRead`, `markAllNotificationsAsRead`, `subscribeToNotifications`, `unsubscribeFromNotifications`.
  - `OrganizationApiClient`: Methods like `createOrganization`, `updateOrganization`, `listUserOrganizations`, `getOrganizationDetails`, `getOrganizationMembers`, `inviteUserByEmail`, `acceptOrganizationInvite`, `declineOrganizationInvite`, `requestToJoinOrganization`, `approveJoinRequest`, `updateMemberRole`, `removeMember`, `leaveOrganization`, `deleteOrganization`, `cancelInvite`, `denyJoinRequest`, `getPendingOrgActions`, `getInviteDetails`.

### `@paynless/store`
- **Purpose:** Manages global application state using Zustand.
- **Key Stores:**
  - `useAuthStore`: Handles user authentication state, profile data, login/register/logout actions, profile updates.
  - `useSubscriptionStore`: Manages subscription status, available plans, and actions like initiating checkout or portal sessions.
  - `useAiStore`: Manages AI chat state including providers, prompts, conversation history, current messages, and sending messages.
  - `useNotificationStore`: Manages in-app notifications, unread count, fetching/marking read, and handling realtime updates via Supabase channels.
  - `useOrganizationStore`: Manages multi-tenancy state including user's organizations list, current organization context (ID, details, members, pending actions), pagination, invite details, and actions for all organization/member/invite/request operations. Also manages related UI state (modals).

### `@paynless/types`
- **Purpose:** Centralizes TypeScript type definitions (interfaces, types) used across the monorepo.
  - **`api.types.ts`**: `ApiResponse`, `ApiErrorType`, `FetchOptions`, `AuthRequiredError`, `PaginationParams`, `PaginatedResponse`, etc. (Added pagination types)
  - **`auth.types.ts`**: `User`, `Session`, `UserProfile`, `UserProfileUpdate`, `AuthStore`, `AuthResponse`, etc.
  - **`subscription.types.ts`**: `SubscriptionPlan`, `UserSubscription`, `SubscriptionStore`, `SubscriptionUsageMetrics`, `CheckoutSessionResponse`, `PortalSessionResponse`, `SubscriptionPlansResponse`, etc.
  - **`ai.types.ts`**: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, `ChatApiRequest`, `AiState`, `AiStore`, etc.
  - **`notification.types.ts`**: [NEW] `Notification`, `NotificationStore`, `NotificationData`.
  - **`organization.types.ts`**: [NEW] `Organization`, `OrganizationMember`, `OrganizationRole`, `OrganizationVisibility`, `Invite`, `InviteStatus`, `MembershipStatus`, `OrganizationStore`, `CreateOrganizationRequest`, `UpdateOrganizationRequest`, `InviteDetails`, `OrganizationDetails`, `PendingOrgActions`.
  - **`analytics.types.ts`**: `AnalyticsClient`, `AnalyticsEvent`, `AnalyticsUserTraits`.
  - **`platform.types.ts`**: `PlatformCapabilities`, `FileSystemCapabilities`.
  - **`email.types.ts`**: `SubscriberInfo`, `EmailMarketingService`. **[NEW]**
  - **`theme.types.ts`**: Types related to theming.
  - **`route.types.ts`**: Types related to application routing.
  - **`vite-env.d.ts`**: Vite environment types.
