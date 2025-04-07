**Consolidated Project Testing Plan & Status (v4 - Reflecting Local Integration Limitations)**

**Notes & Key Learnings (Summary):**

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
            *   [⏸️] `sync-stripe-plans/` *(Unit tests exist but ignored locally due to Supabase lib type resolution errors. Pending deployed testing.)*
            *   [✅] `_shared/auth.ts`
            *   [✅] `_shared/cors-headers.ts`
            *   [✅] `_shared/responses.ts`
            *   [✅] `_shared/stripe-client.ts` *(Partially tested, webhook verify pending)*
            *   [⏸️] `_shared/test-utils.ts` *(Deferred - implicitly tested via integration tests)*
            *   [❓] `test-auth.ts` *(Purpose unclear, review/remove?)*
        *   **Task:** `[🚧] Complete implementation and unit tests for [ ], [?], and [❓] items above.`
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
        *   [ ] **Function Integration (Stripe - Webhook):**
             *   `[ ]` Test `stripe-webhook` handler (Likely requires deployed env or advanced local setup like Stripe CLI tunnel)
             *   `[ ]` Test webhook signature verification
        *   [⏸️] `sync-stripe-plans` *(Needs Integration Test - Requires deployed env due to local type errors & env vars)*
        *   [❓] **Database Integration:** Use `supabase test db` to validate migrations and RLS policies.
        *   [❓] **Stripe Integration:** Test against Stripe's test environment API and webhooks.
    *   **1.3 Final Validation & Lockdown:**
        *   [ ] **Task:** After Phase 1.1/1.2 items are addressed (acknowledging limitations), add comments to function code indicating validation status.

*   **Phase 2: Shared Packages (`packages/`)**
    *   **2.1 Unit Tests:**
        *   [✅] `packages/api-client` (Vitest + MSW setup complete, `apiClient.ts` tests passing)
        *   [✅] `packages/api-client/stripe.api.ts` *(All unit tests passing)*
        *   [✅] `packages/store` (Vitest setup complete, `authStore.ts` passing)
            *   [✅] `subscriptionStore.ts` *(All unit tests passing)*
        *   [⏭️] `packages/ui-components` *(Skipped - Package empty, components currently in `apps/web`)*.
        *   [✅] `packages/utils` (Vitest setup complete, `logger.ts` tests passing)
        *   [✅] `packages/types` *(Implicitly tested)*.

*   **Phase 3: Web App (`apps/web/`)**
    *   **3.1 Unit Tests:**
        *   [⏸️] `apps/web/src/App.tsx` *(Basic tests passing; deferred further tests pending child component testing)*
        *   [✅] `apps/web/src/components/layout/Header.tsx` 
        *   [✅] `apps/web/src/components/layout/Footer.tsx` 
        *   [🚧] `apps/web/src/components/` (Other components, e.g., Subscription UI)
            *   [✅] `auth/LoginForm.tsx`
            *   [✅] `auth/RegisterForm.tsx`
            *   [✅] `auth/AuthenticatedGate.tsx`
            *   [✅] `auth/ProtectedRoute.tsx`
            *   [✅] `profile/ProfileEditor.tsx`
            *   [✅] `routes/RootRoute.tsx`
        *   [🚧] `apps/web/src/pages/` (Start with auth: LoginPage, RegisterPage, then Subscription flow pages)
            *   [✅] `LoginPage.tsx` (Basic render test)
            *   [✅] `RegisterPage.tsx` (Basic render test)
        *   [🚧] `apps/web/src/hooks/` (Any hooks related to subscription flow)
            *   [✅] `useAuthSession.ts`
            *   [⏭️] `useSubscription.ts` (Skipped - Simple wrapper for store, tested via store tests)
    *   **3.2 Integration Tests:**
        *   [ ] **Component Integration:** Test interactions between subscription-related components.
        *   [ ] **API Integration (Mocked):** Test subscription data fetching and action calls against MSW.
    *   **3.3 End-to-End Tests:**
        *   [ ] **Tooling:** Setup Playwright/Cypress (if not already done).
        *   [✅] **Core User Flows:** Auth cycle, Profile management.
        *   [ ] **Payment Flows:** 
            *   `[ ]` User selects plan -> Clicks Subscribe -> Redirected to Stripe Checkout
            *   `[ ]` User completes checkout -> Redirected to Success URL -> Verify UI update / subscription state
            *   `[ ]` User cancels checkout -> Redirected to Cancel URL -> Verify UI state
            *   `[ ]` Subscribed user clicks Manage Billing -> Redirected to Stripe Portal
            *   `[ ]` User manages subscription in Portal -> Returns to app -> Verify UI update / subscription state (May depend on webhook processing delay)

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

**Consequence:**
*   Full local integration testing (`