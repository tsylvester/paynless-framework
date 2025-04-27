# Development Plan & Guidelines

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

## Branch Hygiene

- Main is the prod branch
-- This deploys to paynless.app
-- This branch must always be fully tested, stable, and working
-- No broken or incomplete features or functions
-- Main has test-mode set to false
-- Main has logging set to Error
-- Main has all relevant API keys inserted & integrations working 

- Development is the development branch. 
-- This branch is in testing for feature addition, bug fixes, etc. 
-- May have broken or incomplete features or functions
-- Dev has test-mode set to true
-- Dev has logging configured to your local prefs 
-- Dev may be missing relevant API keys 

- For new features, bug fixes, etc
-- Branch development
-- Use a folder structure that identifies your work
-- e.g. development/feature/add-[feature_name]
-- Write all unit and integration tests and run them in your branch
-- Only merge to development once your tests pass locally
-- Once the work is merged to development with working tests, we'll do E2E testing
-- Once the work passes E2E we'll merge to main (prod) and it'll be deployed

## Contributing

To contribute to this project:
1. Ensure you understand the architecture and follow the established patterns.
2. Avoid duplicating existing functionality; utilize services and stores.
3. Use proper TypeScript types for all data structures.
4. Document new components, services, functions, and complex logic.
5. Test changes thoroughly, considering edge cases. 

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Supabase Project URL and Anon Key.
3. Ensure Docker is running.
4. Run `npm install` (or `yarn` or `pnpm install`) to install dependencies.
5. Start the local Supabase stack: `supabase start`
6. Apply database migrations: `supabase db reset` (if starting fresh) or ensure migrations in `supabase/migrations` are up-to-date.
7. Run `npm run dev` from the root or the specific app directory (e.g., `cd apps/web && npm run dev`) to start the development server.

## Current Development Focus

*   Implementing In-App Notifications System.
*   Implementing Multi-Tenancy support (Organizations/Teams).
*   Refactoring older stores (`authStore`, `subscriptionStore`) to use the API Client Singleton pattern.
*   Refactoring `authStore` to align with Supabase `onAuthStateChange` for improved reliability.
*   Stabilizing and enhancing AI Chat features.
*   Improving test coverage across all packages.

## Recent Developments

*   **Centralized Database Types (Refactor):**
    *   Refactored the codebase to use Supabase-generated types (`supabase/functions/types_db.ts`) as the single source of truth for database schema definitions.
    *   Created an internal workspace package (`@paynless/db-types` pointing to `types_db.ts`) for easier type resolution.
    *   Added this internal package as a dependency to `@paynless/types`, `api-client`, `store`, and `web`.
    *   Removed manually defined, redundant DB type definitions from `packages/types/src` and updated affected files to use aliases pointing to `@paynless/db-types`.
    *   Updated Supabase Edge Functions (`supabase/functions/*`) to import DB types directly from `../types_db.ts` and application-level types from `../_shared/types.ts`.
    *   Cleaned `supabase/functions/_shared/types.ts` to only contain necessary application-level types.
    *   Created a Node.js script (`supabase/scripts/sync-supabase-shared-types.mjs`) to automatically synchronize required application-level types from `packages/types` into `supabase/functions/_shared/types.ts`.
    *   Added a combined script `sync:types` to the root `package.json` to run both `supabase gen types ...` and the new sync script, ensuring consistency.

## Supabase Setup

1. Create a new Supabase project.
2. Link your local repository: `supabase link --project-ref YOUR_PROJECT_REF --password YOUR_PASSWORD`
3. Set up required environment variables in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, etc.). Refer to `.env.example`.
4. Ensure database migrations in `supabase/migrations` define the necessary tables (`user_profiles`, `subscription_plans`, `user_subscriptions`) and the trigger to create user profiles.

### Activating Email Marketing Sync Trigger (Manual Step)

This project uses an optional feature to sync new users to an email marketing provider (like Kit) immediately after they sign up. This is achieved via a database trigger on `auth.users` that calls a helper SQL function (`handle_user_created`), which in turn invokes the `on-user-created` Edge Function.

**Prerequisites:**
*   Ensure the `on-user-created` Edge Function has been deployed (`supabase functions deploy on-user-created`).
*   Ensure your root `.env` file contains the following variables with their correct values:
    *   `VITE_SUPABASE_URL` (Your Supabase project URL, e.g., `https://<project-ref>.supabase.co`)
    *   `VITE_SUPABASE_SERVICE_ROLE_KEY` (Your Supabase service role key)
    *   Email marketing provider credentials (e.g., `EMAIL_MARKETING_PROVIDER`, `EMAIL_MARKETING_API_KEY`, `EMAIL_MARKETING_TAG_ID`, etc., as defined in `.env.example`)

**To generate and apply the necessary SQL:**

1.  Navigate to the scripts directory in your terminal:
    `cd supabase/scripts`
2.  Run the Deno script to *generate* the SQL:
    `deno run --allow-env --allow-read apply_email_sync_trigger.ts`
3.  The script will print a multi-part SQL command block to your console.
4.  **Copy** the entire SQL block (starting from `DROP TRIGGER...` down to the `COMMENT ON TRIGGER...`).
5.  Go to your **Supabase Project Dashboard** (for the environment you want to apply this to - local or remote).
6.  Navigate to the **SQL Editor**.
7.  **Paste** the copied SQL block into the editor.
8.  Click **Run**.

This will create the necessary `handle_user_created` SQL function and the `on_user_created_hook` trigger in your database.

**To deactivate the trigger and function (if needed):**

Run the following SQL commands directly in your Supabase project's SQL Editor:
```sql
DROP TRIGGER IF EXISTS on_user_created_hook ON auth.users;
DROP FUNCTION IF EXISTS handle_user_created();
```
You can also delete the trigger manually through the Supabase GUI under the Database -> Triggers menu (and the function under Database -> Functions).

### Manually Invoking `sync-ai-models`

This project includes an Edge Function (`sync-ai-models`) responsible for fetching the latest available AI models from configured providers (like OpenAI, Anthropic, Google) and updating the `ai_models` table in the database.

**Currently, there is no automated scheduling (like a cron job) set up for this function.** To update the AI models in your database, you need to invoke this function manually using the Supabase CLI.

**Prerequisites:**

1.  **Link Project:** Ensure your local CLI is linked to your Supabase project:
    ```bash
    supabase link --project-ref YOUR_PROJECT_REF
    ```
2.  **Deploy Function:** Ensure the `sync-ai-models` Edge Function has been deployed:
    ```bash
    supabase functions deploy sync-ai-models
    ```
3.  **(Optional) Set API Keys:** For the function to fetch models from providers, ensure the relevant API keys (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) are set as environment variables for the function in your Supabase project settings (or locally in `.env.local` if invoking locally, though local invocation might have limitations). Go to Project Settings -> Edge Functions -> `sync-ai-models` -> Secrets.

**To Manually Invoke:**

*   Run the following command from your project's root directory:
    ```bash
    supabase functions invoke sync-ai-models
    ```

*   *(Note: You might need to add `--project-ref YOUR_PROJECT_REF` if you have multiple linked projects or are not in the root directory).* 
*   Check the command output and your Supabase function logs for success or errors.

*(Future Work: Set up automated scheduling, likely via a manual Cron Function Hook in the Supabase Dashboard UI, once that process is fully verified or alternative automation becomes available).* 

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

## Handling External Service Integrations & API Keys (Backend/Functions)

When integrating optional, third-party services (like email marketing - Kit) that rely on API keys within Supabase Edge Functions:

1.  **API Key Management:**
    *   API keys **MUST** be stored in the local `.env` file for development and configured as secure environment variables in deployment environments (e.g., Supabase Function settings).
    *   Placeholders for these keys **MUST** be added to `.env.example` (e.g., `KIT_API_KEY=""`, `KIT_FORM_ID=""`).
    *   API keys **MUST NEVER** be committed directly into the codebase or version control.

2.  **Conditional Activation:**
    *   The functionality associated with the external service **MUST** be activated *only* if the required API key(s) and any other necessary configuration (like a Form ID) are present in the environment variables (`Deno.env.get('KEY_NAME')`).
    *   The code responsible for initializing or using the service (typically a factory or the service adapter itself) **MUST** check for the existence and validity (if possible) of these environment variables.

3.  **Graceful Degradation Pattern:**
    *   Follow the established pattern using a shared service directory (e.g., `supabase/functions/_shared/email_service/`) and shared types (`packages/types`):
        *   **Interface:** Define a common TypeScript interface for the service's capabilities (e.g., `EmailMarketingService` with `addSubscriber`).
        *   **No-Op Adapter:** Implement a `NoOp` adapter (e.g., `no_op_service.ts`) that fulfills the interface but performs no actions (or logs that it's skipping). This is the default behavior.
        *   **Specific Adapter(s):** Implement adapters for each actual service (e.g., `kit_service.ts`). These adapters read the necessary API keys from environment variables in their constructor or relevant methods. If keys are missing, they should ideally log a warning and behave like the `NoOp` adapter or handle the situation gracefully without throwing errors that break the calling flow.
        *   **Factory:** Create a factory function (e.g., `getEmailMarketingService` in `factory.ts`) that checks for the presence of API keys in environment variables. It returns an instance of the *specific adapter* if the keys are found, otherwise it returns an instance of the *`NoOp` adapter*.
        *   **Consumer:** The code using the service (e.g., the `on-user-created` function) imports only the factory and the interface type. It calls the factory to get *an* implementation and interacts with it purely through the interface methods (`await emailService.addSubscriber(...)`).

4.  **Extensibility:**
    *   To add a new provider (e.g., Mailchimp):
        *   Add `MAILCHIMP_API_KEY`, etc., to `.env.example`.
        *   Create `mailchimp_service.ts` implementing the shared interface.
        *   Update the `factory.ts` to check for Mailchimp keys and return a `MailchimpEmailService` instance if present.
        *   The consuming code (e.g., `on-user-created`) does not need to change.

**Benefits:** This approach ensures the application remains functional even if optional services aren't configured, provides a clear and consistent pattern for developers, and makes adding new backend integrations straightforward.

## Handling Frontend Analytics Integration (`packages/analytics-client`)

The frontend analytics integration (`packages/analytics-client`) follows a similar pattern to ensure graceful degradation and extensibility:

1.  **Environment Variables:** Configuration relies on Vite environment variables (prefixed with `VITE_`):
    *   `VITE_ANALYTICS_PROVIDER`: Specifies the provider (e.g., `'posthog'`, `'none'`).
    *   `VITE_POSTHOG_KEY`: PostHog API key (required if provider is `posthog`).
    *   `VITE_POSTHOG_HOST`: PostHog instance host (defaults to `https://app.posthog.com`).
    *   Add corresponding entries to `.env.example`.

2.  **Singleton Export:** The package initializes *once* on import and exports a single `analytics` object conforming to the `AnalyticsClient` interface (defined in `packages/types`).

3.  **Usage:** Components and stores should import and use this singleton directly:
    ```typescript
    import { analytics } from '@paynless/analytics-client';

    // Example usage:
    analytics.identify(userId, { email });
    analytics.track('Button Clicked', { buttonName: 'Submit' });
    ```

4.  **Pattern Implementation:**
    *   **Interface:** `AnalyticsClient` (in `packages/types`) defines the standard methods (`init`, `identify`, `track`, `reset`).
    *   **Null Adapter (`nullAdapter.ts`):** Implements `AnalyticsClient` with empty methods. This is the default if no provider is configured or if configuration is invalid.
    *   **Specific Adapter(s) (`posthogAdapter.ts`):** Implements `AnalyticsClient` using a specific library (e.g., `posthog-js`). It includes an `init` method called by the factory.
    *   **Factory Logic (in `index.ts`):** Reads environment variables. If `VITE_ANALYTICS_PROVIDER` is `posthog` and `VITE_POSTHOG_KEY` is present, it instantiates and initializes `PostHogAdapter`. Otherwise, it instantiates `NullAnalyticsAdapter`.
    *   The resulting instance is exported as the `analytics` singleton.

5.  **Extensibility:**
    *   To add a new frontend analytics provider (e.g., Mixpanel):
        *   Add required `VITE_MIXPANEL_TOKEN`, etc., to `.env.example`.
        *   Create `mixpanelAdapter.ts` implementing `AnalyticsClient` and its `init` method.
        *   Update the factory logic in `packages/analytics-client/src/index.ts` to check for `VITE_ANALYTICS_PROVIDER === 'mixpanel'` and the required key, then instantiate and initialize the `MixpanelAdapter`.
        *   Consuming code (`analytics.track(...)`) remains unchanged.

**Benefits:** This ensures analytics calls are seamlessly ignored if not configured, simplifies usage across the frontend, and provides a clear path for adding other analytics providers.
