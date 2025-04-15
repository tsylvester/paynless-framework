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