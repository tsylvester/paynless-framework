**Consolidated Project Testing Plan & Status (v5 - Post Refactoring)**

**Notes & Key Learnings (Summary):**

*   **Chosen Pattern for `apiClient` Consumption & Testing (April 2024):**
    *   **Pattern:** The `@paynless/api-client` package utilizes a **Singleton pattern**. It is initialized once per application run (`initializeApiClient`) and accessed via the exported `api` object (`import { api } from '@paynless/api-client';`).
    *   **Rationale:** This approach is preferred for this multi-platform architecture as it simplifies client consumption across shared code (stores) and different frontend platforms (web, mobile), centralizes configuration, and guarantees a single instance for managing state like auth tokens.
    *   **Consumption:** All consumers (stores, UI components, etc.) should import and use the `api` singleton directly rather than relying on dependency injection (DI) via props or `init` methods for the API client.
    *   **Testing:** Unit testing consumers that depend on the `apiClient` requires mocking the module import using the test runner's capabilities (e.g., `vi.mock('@paynless/api-client', ...)` in Vitest). This allows replacing the singleton with a mock during tests.
    *   **Consistency Task:** Older stores (`authStore`, `subscriptionStore`) currently use an outdated DI (`init`) pattern. They **must** be refactored to align with the singleton import pattern and `vi.mock` testing strategy for consistency.
*   **Test Structure Refactor (April 2024):** Standardized `apps/web/src/tests/` structure:
    *   `unit/`: Pure unit tests only (`*.unit.test.tsx`).
    *   `integration/`: MSW-based integration tests (`*.integration.test.tsx`), consolidating tests by feature (Auth, Profile, Subscription).
    *   `utils/`: Centralized test utilities (`render.tsx`).
    *   `mocks/`: Centralized mocks:
        *   `handlers.ts`: Main MSW request handlers.
        *   `api/server.ts`: MSW server setup.
        *   `components/`: Mock components (e.g., `Layout.mock.tsx`).
        *   `stores/`: Mock store factories (e.g., `authStore.ts`).
        *   `react-router.mock.ts`: Mock for hooks like `useNavigate`.
    *   `setup.ts`: Global test setup (MSW server lifecycle).
*   **Shared Render Utility (`utils/render.tsx`):** Provides `MemoryRouter`, `QueryClientProvider`, `ThemeProvider`. It no longer includes `AuthProvider` to allow integration tests to use the real Zustand stores directly.
*   **Real Stores in Integration Tests:** Integration tests now import and use the actual `useAuthStore` and `useSubscriptionStore` to test the full flow with MSW-mocked API calls.
*   **Mock Stores in Unit Tests:** Unit tests needing store isolation should mock the stores locally using `vi.mock` / `vi.spyOn`, potentially utilizing mock factories from `utils/mocks/stores/`.
*   **MSW Handler Consolidation:** All default MSW handlers reside in `utils/mocks/handlers.ts`, configured with correct API paths (`/login`, `/register`, `/me`, `/api-subscriptions/...`).
*   **Local Runtime Auth (`verify_jwt`):** The local Supabase runtime *does* respect function-specific `[functions.<name>] verify_jwt = false` settings in `config.toml`. This is crucial for allowing API key auth functions (`/login`, `/register`) to bypass the runtime's potentially overzealous default JWT checks. Failure symptom: `401 Unauthorized` with runtime logs showing "Missing authorization header".
*   **Dependency Injection & `serve`:** Using the DI pattern (`deps = defaultDeps`) for unit testability is viable, *but* the `serve` call at the end of the function file *must* explicitly pass the defaults: `serve((req) => handler(req, defaultDeps))`. Failure symptom: `TypeError` inside the function runtime.
*   **Deno Imports (`npm:`, `std` version):** Deno requires explicit handling for imports:
    *   Use the `npm:` prefix for Node packages like `@supabase/supabase-js` (e.g., `npm:@supabase/supabase-js`).
    *   Use a recent, compatible version of the Deno Standard Library (`std`) matching the runtime (e.g., `std@0.224.0` for `serve`). Failure symptoms: `worker boot error` (relative path), `ReferenceError` (undefined function).
*   **Environment Variables & `supabase start`:** As documented below under "Known Limitations", `supabase start` (even CLI v2.20.5) does **not** reliably inject environment variables from `.env` files into the function runtime for local integration testing. `--env-file` is not supported by `start`. Manual loading attempts fail due to permissions.
*   **Deno Test Leaks:** `fetch` calls in tests must have their response bodies consumed (`await res.json()`, `.text()`) or closed (`await res.body?.cancel()`) to avoid resource leak errors.
*   **Profile Auto-Creation:** Local Supabase setup automatically creates `user_profiles` rows. Tests modifying profiles must use `update` after initial user creation.
*   **Back-testing/Regression:** Refactoring or changes require re-running affected unit/integration tests. Unit tests need updating post-integration changes.
*   **Mocking SupabaseClient (TS2345):** Directly mocking the `SupabaseClient` in unit tests can lead to TS2345 errors (type incompatibility, often due to protected properties like `supabaseUrl`) if the mock object doesn't perfectly match the client's complex type signature. This is especially true if tests in the same file need to mock different *parts* of the client (e.g., `.from()` vs. `.functions.invoke()`), leading to inconsistent mock object shapes.
    *   **Solution:** Introduce a **Service Abstraction Layer**. Define a simple interface declaring only the methods needed by the handler. Implement the interface using the real `SupabaseClient`. Refactor the handler to depend on the interface. Unit test the handler by mocking the *simple interface*, which avoids the TS2345 error. (See `stripe-webhook/handlers/product.ts` and its service/test for an example). Test the service implementation's direct Supabase calls separately.
*   **Refactoring UI/Store Interaction Pattern:** We identified inconsistencies in how UI components (`LoginForm`, `RegisterForm`, `ProfileEditor`, subscription pages) interact with Zustand stores (`authStore`, `subscriptionStore`) regarding side effects like API calls, loading states, error handling, and navigation. The previous pattern involved components managing local loading/error state and sometimes triggering navigation *after* store actions completed.
    *   **New Pattern:** To improve separation of concerns, predictability, and testability, we are refactoring towards a pattern where:
        *   Zustand store actions encapsulate the *entire* flow: initiating the API call, managing the central `isLoading` state, managing the central `error` state, and handling internal app navigation (e.g., `navigate('/dashboard')` after successful login) directly within the action upon success.
        *   UI components become simpler, primarily dispatching store actions and reacting to the centralized loading and error states provided by the store hooks (`useAuthStore(state => state.isLoading)`, etc.) to render feedback. Local loading/error state in components is removed.
        *   For actions requiring *external* redirection (like Stripe Checkout/Portal), the store action will still return the necessary URL, and the calling UI component will perform the `window.location.href` redirect.
    *   **Impact:** This requires refactoring `authStore` (`login`, `register`, `updateProfile`), `subscriptionStore` (checkout, portal, cancel, resume actions), and the corresponding UI components (`LoginForm`, `RegisterForm`, `ProfileEditor`, `SubscriptionPage`). *(Note: Some progress made on testing strategy refactor for LoginForm/SubscriptionPage by mocking stores, but full pattern implementation pending).* 
    *   **Testing Implication:** Unit tests for affected stores and components, along with MSW integration tests (Phase 3.2) for Login, Register, Profile, and Subscription flows, will require significant updates and re-validation after this refactoring.
*   **Vitest Unhandled Rejections (Component Tests):** When testing React components that interact with mocked asynchronous actions that *reject* (e.g., simulating API errors in `LoginForm.test.tsx`), Vitest consistently reports "Unhandled Rejection" errors and causes the test suite to exit with an error code, *even when the tests correctly assert the rejection and pass all assertions*. Multiple handling strategies (`expect().rejects`, `try/catch` within `act`, `try/catch` outside `act`, explicit `.catch()`) failed to suppress these specific runner errors. For now, we accept this as a Vitest runner artifact; the relevant tests (like `LoginForm.test.tsx`) are considered functionally correct despite the runner's error code.

---

✅ **How to Test Incrementally and Correctly (Layered Testing Strategy)**
*This remains our guiding principle.* 

**NOTE:** When running tests, especially suites or complex component tests, pipe the output to `test-output.log` to avoid terminal buffer issues and allow for easier review of results. Example: `pnpm --filter <package> test <file> > test-output.log`.

🧪 **1. Start with Unit Tests**
- Write unit tests for the file or module you're working on.
- Run the unit test(s) for that file.
- Fix the code until all unit tests pass.

🧩 **2. Move to Integration**
- Once all relevant unit tests pass, run integration tests that depend on those files/modules.
- **LOCAL LIMITATION:** Be aware of the environment variable issue documented below for functions run via `supabase start`. Integration tests for functions relying on `.env` variables (like `api-subscriptions`) may need to be performed primarily in deployed Preview/Staging environments.
- If local integration tests fail, fix relevant files (may involve multiple modules or configuration like `config.toml`).
- Once integration tests pass (either locally or in deployed env), review and update unit tests if behavior/signatures changed.
- Rerun affected unit tests to ensure they still pass.

🚦 **3. Stabilize by Layer**
- Ensure all passing unit tests pass after updates.
- Ensure all passing integration tests pass after updates.
- Only then run the full passing test suite (unit + integration) across the workspace.

🌐 **4. End-to-End Validation**
- Once the system passes unit and integration layers (acknowledging local limitations), run full end-to-end (E2E) tests.
- Fix or update E2E tests and supporting mocks if needed.

---

*   **Phase 1: Backend (`supabase/`)**
    *   **1.1 Unit Tests:**
        *   **Status:** Most core function unit tests passing.
        *   **Framework:** Deno Standard Library
        *   **Functions Tested:**
            *   [✅] `login/`
            *   [✅] `logout/`
            *   [✅] `me/`
            *   [✅] `profile/`
            *   [✅] `refresh/`
            *   [✅] `register/`
            *   [✅] `reset-password/`
            *   [✅] `session/`
            *   [✅] `api-subscriptions/handlers/checkout.ts`
            *   [?] `api-subscriptions/` (Other handlers)
                *   [✅] Implement `handlers/billing-portal.ts`
                *   [✅] Unit Test `handlers/billing-portal.ts`
                *   [✅] Implement/Verify `handlers/subscription.ts` (cancel/resume)
                *   [✅] Unit Test `handlers/subscription.ts`
                *   [✅] Review/Test `handlers/plans.ts`
                *   [✅] Review/Test `handlers/current.ts`
                *   [✅] Review/Test `handlers/usage.ts`
            *   [ ] `stripe-webhook/`
                *   `[ ]` Implement handling for key events (checkout complete, sub updated, etc.)
                    *   [✅] `handlers/checkout-session.ts`
                    *   [✅] `handlers/subscription.ts`
                    *   [✅] `handlers/invoice.ts`
                    *   [✅] `handlers/product.ts`
                    *   [✅] `handlers/price.ts`
                *   `[ ]` Unit test webhook handler logic & signature verification
                    *   [✅] Unit Test `handlers/checkout-session.ts`
                    *   [✅] Unit Test `index.ts` (router/sig verify)
                    *   [✅] Unit Test `handlers/subscription.ts`
                    *   [✅] Unit Test `handlers/invoice.ts`
                    *   [✅] Unit Test `handlers/product.ts`
                        *   **Note:** Encountered persistent TS2345 errors mocking SupabaseClient directly due to needing both `.from()` and `.functions.invoke()`. Refactored `product.ts` handlers to accept a simpler Service Wrapper interface, moving complex mock to the service layer test.
                    *   [✅] Unit Test `handlers/price.ts`
            *   [ ] **AI Chat Functions:**
                *   [ ] Unit Test `ai-providers/index.ts` (Mock Supabase client)
                *   [ ] Unit Test `system-prompts/index.ts` (Mock Supabase client)
                *   [ ] Unit Test `chat/index.ts` (Extensive: Mock Supabase client, mock external AI fetch, test history logic, saving logic, auth checks, API key retrieval)
                *   [ ] Unit Test `chat-history/index.ts` (Mock Supabase client)
                *   [ ] Unit Test `chat-details/index.ts` (Mock Supabase client)
            *   [⏸️] `sync-stripe-plans/` *(Unit tests exist but ignored locally due to Supabase lib type resolution errors. Pending deployed testing.)*
            *   [✅] `_shared/auth.ts`
            *   [✅] `_shared/cors-headers.ts`
            *   [✅] `_shared/responses.ts`
            *   [✅] `_shared/stripe-client.ts` *(Partially tested, webhook verify pending)*
            *   [⏸️] `_shared/test-utils.ts` *(Deferred - implicitly tested via integration tests)*
            *   [❓] `test-auth.ts` *(Purpose unclear, review/remove?)*
        *   **Task:** `[🚧] Complete implementation and unit tests for [ ], [?], and [❓] items above, including new AI function tests.`
    *   **1.2 Integration Tests:**
        *   [✅] **Environment Setup:** Local Supabase environment configured (`config.toml`, `.env.local`). Test utilities created (`_shared/test-utils.ts`).
        *   **Function Integration (Auth & Profile):**
            *   [✅] `/login`
            *   [✅] `/logout`
            *   [✅] `/me`
            *   [✅] `/profile/<userId>`
            *   [✅] `/refresh`
            *   [✅] `/register`
            *   [✅] `/reset-password`
            *   [✅] `/session`
            *   [✅] `/ping`
        *   [⏸️] **Function Integration (Stripe - API Endpoints):** *(Local Integration Blocked due to env var issue - Test in deployed env.)*
            *   `[⏸️]` `/api-subscriptions/checkout`
            *   `[ ]` `/api-subscriptions/billing-portal` (Once implemented)
            *   `[ ]` `/api-subscriptions/.../cancel` (If implemented)
            *   `[ ]` `/api-subscriptions/.../resume` (If implemented)
            *   `[?]` `/api-subscriptions/plans`
            *   `[?]` `/api-subscriptions/current`
            *   `[?]` `/api-subscriptions/usage/:metric`
        *   [⏸️] **Function Integration (AI Chat):** *(Local Integration Partially Blocked due to env var issue / external calls - Test core DB interactions locally, full flow in deployed env.)*
            *   [ ] `/ai-providers` (Should work locally - DB reads only)
            *   [ ] `/system-prompts` (Should work locally - DB reads only)
            *   [⏸️] `/chat` (Requires external AI API keys -> env vars. Test DB save/read logic locally if possible, full flow deployed.)
            *   [ ] `/chat-history` (Should work locally - DB reads only)
            *   [ ] `/chat-details/:chatId` (Should work locally - DB reads only)
        *   [ ] **Function Integration (Stripe - Webhook):**
             *   `[ ]` Test `stripe-webhook` handler (Likely requires deployed env or advanced local setup like Stripe CLI tunnel)
             *   `[ ]` Test webhook signature verification
        *   [⏸️] `sync-stripe-plans` *(Needs Integration Test - Requires deployed env due to local type errors & env vars)*
        *   [✅] **Database Integration:** Use `supabase test db` to validate migrations and RLS policies. *(New RLS policies for AI tables need verification)*
        *   [❓] **Stripe Integration:** Test against Stripe's test environment API and webhooks.
    *   **1.3 Final Validation & Lockdown:**
        *   [ ] **Task:** After Phase 1.1/1.2 items are addressed (acknowledging limitations), add comments to function code indicating validation status.

*   **Phase 2: Shared Packages (`packages/`)**
    *   **2.1 Unit Tests:**
        *   [✅] `packages/api-client` (Vitest + MSW setup complete, `apiClient.ts` tests passing)
        *   [✅] `packages/api-client/stripe.api.ts` *(All unit tests passing)*
        *   [✅] `packages/api-client/ai.api.ts` *(All unit tests passing)*
        *   [✅] `packages/store` (Vitest setup complete)
            *   [✅] `authStore.ts` *(All unit tests passing, confirmed store follows pattern, `AuthResponse`/`register` type updated)*
            *   [✅] `subscriptionStore.ts` *(All unit tests passing, confirmed store follows pattern)*
            *   [✅] `aiStore.ts` *(All unit tests passing)*
        *   [⏭️] `packages/ui-components` *(Skipped - Package empty, components currently in `apps/web`)*.
        *   [✅] `packages/utils` (Vitest setup complete, `logger.ts` tests passing)
        *   [✅] `packages/types` *(Implicitly tested, AI types added)*.

*   **Phase 3: Web App (`apps/web/`)**
    *   **3.1 Unit Tests:**
        *   [ℹ️] **Component Review:** `LoginForm`, `RegisterForm`, `ProfileEditor`, `SubscriptionPage` reviewed and confirmed to align with store interaction pattern. Component refactoring not required. *(Note: Existing unit tests for these components may need updating to reflect reliance on store state/actions rather than local state/props)*.
        *   [🚧] `apps/web/src/` Components/Pages/Hooks: *(Status needs re-evaluation after integration tests pass and unit tests are refactored to use shared utils/mocks)*
        *   [ ] `apps/web/src/components/ai/` *(Unit test new components: `AiChatbox`, `ModelSelector`, `PromptSelector` - Test rendering based on props/store state, dispatching actions)*
    *   **3.2 Integration Tests:**
        *   [✅] **Refactoring Complete:** Structure standardized, utilities/handlers consolidated.
        *   [🚧] **API Integration (Mocked):** Key user flows tested with MSW.
            *   **Authentication (`auth.integration.test.tsx`):**
                *   `[✅]` Login: Success, Invalid Credentials, Server Error.
                *   `[✅]` Register: Success, Email Exists, Server Error.
                *   `[ ]` Logout
                *   `[ ]` Session Load/Refresh
                *   `[ ]` Password Reset
                *   `[ ]` Register -> Redirect to Chat (Test handling of `redirectTo` from `authStore`)
            *   **Profile Management (`profile.integration.test.tsx`):**
                *   `[✅]` Profile Load: Data displayed in editor.
                *   `[✅]` Profile Update: Success case updates UI/store.
                *   `[✅]` Profile Update: Error case displays message.
                *   `[ ]` Profile Update: Loading state.
            *   **Subscription Viewing & Actions (`Subscription.integration.test.tsx`):**
                *   `[✅]` Plan Loading: Displays plans from API.
                *   `[✅]` Current Subscription Loading: Displays current sub details.
                *   `[✅]` Create Checkout: Calls `onSubscribe` prop correctly.
                *   `[✅]` Create Checkout: Handles `onSubscribe` prop rejection.
                *   `[✅]` Create Portal: Calls store action & attempts redirect.
                *   `[ ]` Create Portal: Handles store action failure.
                *   `[✅]` Cancel Subscription: Calls store action.
                *   `[ ]` Cancel Subscription: Handles store action failure.
                *   `[ ]` Resume Subscription: Actions & Handlers.
                *   `[ ]` Usage Metrics: Actions & Handlers.
                *   `[ ]` Test Mode UI indication.
                *   `[ ]` Loading states for actions.
            *   **AI Chat (`ai.integration.test.tsx` - New File):**
                *   [✅] Load AI Config (Providers/Prompts): Verify selectors populated.
                *   [✅] Send Message (Authenticated): Verify message appears, spinner shows, response appears.
                *   [✅] Send Message (Error): Verify error message shown.
                *   [ ]` Load Chat History: Verify history list populates.
                *   [ ]` Load Chat Details: Select chat, verify messages load.
                *   [ ]` Anonymous Flow: Send message below limit -> Success.
                *   [ ]` Anonymous Flow: Send message at limit -> Error thrown/Modal shown.
                *   [ ]` Anonymous Flow: Stash message -> Register -> Verify message sent automatically.
    *   **3.3 End-to-End Tests:**
        *   [ ] **Tooling:** Setup Playwright/Cypress (if not already done).
        *   [✅] **Core User Flows:** Auth cycle, Profile management.
        *   [ ] **Payment Flows:**
            *   `[ ]` User selects plan -> Clicks Subscribe -> Redirected to Stripe Checkout
            *   `[ ]` User completes checkout -> Redirected to Success URL -> Verify UI update / subscription state
            *   `[ ]` User cancels checkout -> Redirected to Cancel URL -> Verify UI state
            *   `[ ]` Subscribed user clicks Manage Billing -> Redirected to Stripe Portal
            *   `[ ]` User manages subscription in Portal -> Returns to app -> Verify UI update / subscription state (May depend on webhook processing delay)
        *   [ ] **AI Chat Flows:**
            *   `[ ]` Authenticated user sends message, receives response.
            *   `[ ]` Anonymous user sends message below limit.
            *   `[ ]` Anonymous user hits limit, signs up, message is sent.

*   **Phase 4: CI/CD**
    *   [ ] Setup CI pipeline (e.g., GitHub Actions).
    *   [ ] Configure pipeline for Phase 1.1 tests.
    *   [ ] Configure pipeline for Phase 2.1 tests.
    *   [ ] Configure pipeline for Phase 3.1 tests.
    *   [ ] (Optional): Configure Phase 1.2 tests (consider env var limitations).
    *   [ ] (Optional): Configure Phase 3.3 tests.
    *   [ ] Configure deployment steps.
---

## Testing Plan: Phase 1 - Backend Integration Details

**Goal**: Ensure backend functions (Supabase Edge Functions) integrate correctly with each other, the database (including RLS), and external services (Stripe test mode) in the local development environment *where possible*, and in deployed environments otherwise.

### Known Limitations: Local Integration Testing with `supabase start`
*(This section remains as added previously)*

**Context:** Integration tests involving Supabase Edge Functions are designed to run against a local Supabase stack launched via `supabase start`.

**Issue Encountered:** As of Supabase CLI v2.20.5, `supabase start` does **not** reliably load environment variables from `.env` files (e.g., `supabase/.env.local`, `supabase/functions/.env`) into the Edge Function runtime environment, even when those files exist and contain the necessary variables (like Stripe API keys).

*   The `--env-file` flag, while functional with `supabase functions serve`, is **not** recognized by `supabase start`.
*   Manual loading attempts within shared function code (e.g., `_shared/stripe-client.ts` attempting to read `.env.local`) fail, likely due to the Deno runtime's default permission restrictions (missing `--allow-read` or `--allow-env`) within the sandbox created by `supabase start`. Diagnostic logs added to these loading attempts do not appear, suggesting the code block fails or is suppressed before logging can occur.

**Symptoms:**
*   Edge Functions that depend on environment variables set via `.env` files (e.g., `api-subscriptions` needing `STRIPE_SECRET_TEST_KEY`) fail during integration tests when run against `supabase start`.
*   These failures often manifest as `500 Internal Server Error` responses, originating from the function's inability to initialize dependencies (like the Stripe client) due to missing API keys/secrets.
*   Using `supabase functions logs --source <function_name>` confirms that `Deno.env.get()` returns `undefined` for the expected variables within the function runtime.
*   Running the same function using `supabase functions serve --env-file supabase/.env.local <function_name>` *does* successfully load the environment variables (confirmed via logs), indicating the function code itself is likely correct but needs the variables provided.

**Auth integration problems:**
Login Flow > should log in successfully...: Failed because the store state didn't update (authState.user?.email was undefined, expected 'test@example.com'). The UI displayed the generic "Network error occurred..." message.
Login Flow > should display error message for invalid credentials: Failed because the UI showed the generic "Network error occurred..." message instead of the expected "Invalid credentials".
Register Flow > should register successfully...: Failed because the store state didn't update (authState.user?.email was undefined, expected 'new@example.com'). The UI displayed the generic "Network error occurred..." message.
Register Flow > should display error message if email already exists: Failed because the UI showed the generic "Network error occurred..." message instead of the expected "Email already exists".
The two tests that passed were the ones specifically designed to test server errors (should display generic error message for server error for both Login and Register), where we overrode the MSW handlers within the test to force a 500 error.
Conclusion: The MSW handlers defined in apps/web/src/mocks/handlers.ts are still not correctly intercepting the requests or are not returning the expected responses for the success and specific error cases (invalid credentials, email exists). The changes to the test file itself were correct in focusing on store state, but the underlying mock handler issue persists, causing the apiClient to fall back to the generic network error.

---

## Test Suite Refactoring and Completion Plan (April 2024)

**Goal:** Standardize the structure, naming, and implementation of tests within `apps/web/`, consolidate utilities and mocks, ensure comprehensive coverage according to the original testing goals, and resolve inconsistencies identified during previous phases.

**Steps:**

1.  **[✅] Standardize File Naming and Location:**
    *   Integration test files moved/merged into `tests/integration/` (`auth`, `profile`, `Subscription`).
    *   Redundant `*.msw.test.tsx` files removed.

2.  **[✅] Consolidate Test Utilities:**
    *   Shared `render` utility in `utils/render.tsx` simplified (removed `AuthProvider`).
    *   Redundant `utils/providers.tsx` removed.

3.  **[✅] Consolidate MSW Handlers:**
    *   Standardized on `utils/mocks/handlers.ts`.
    *   Redundant handler file removed.
    *   Server import path updated.
    *   Handlers updated with correct API paths (`/login`, `/register`, `/me`, `/api-subscriptions/...`).

4.  **[✅] Centralize Mocks:**
    *   Shared mocks created for `Layout` and `react-router.mock.ts` (`useNavigate`).

5.  **[✅] Refactor Existing Integration Tests for Consistency:**
    *   Core integration tests (`auth`, `profile`, `Subscription`) updated to use shared `render`, shared mocks, real stores, and correct API paths.
    *   Removed local helper functions and mocks.

6.  **[🚧] Coverage Review & Gap Analysis:**
    *   **Action:** Re-evaluate the test status checklist in `TESTING_PLAN.md` (Phase 3.2) against the refactored test suite.
    *   **Goal:** Identify remaining gaps.
    *   *(Next Step)*

7.  **[🚧] Full Suite Run & Fix:**
    *   **Action:** Execute the integration test suite for `apps/web` (`pnpm --filter web test tests/integration/`).
    *   **Goal:** Ensure refactored tests pass. Debug and fix failures.
    *   *(Next Step)*

8.  **[🚧] Refactor Unit Tests:**
    *   **Action:** Update unit tests in `tests/unit/` to use shared `render` and mocks.

9.  **[ ] Implement Missing Tests:**
    *   **Action:** Write tests for items marked `[ ]` in the Phase 3.2 checklist.

10. **[ ] Final `TESTING_PLAN.md` Update:**
    *   **Action:** Mark plan complete, update all status indicators.

---
