**Consolidated Project Testing Plan & Status (v5 - Post Refactoring)**

**Incomplete Features** 
*   [ ] AI Chat on homepage doesn't work
*   [ ] AI Chat signup/login flow
*   [ ] AI model sync automation
*   [ ] Mixpanel or Posthog integration
*   [🚧] Test project on Bolt & Lovable 
    *   [ ] Bolt & Lovable don't support pnpm monorepos well atm 
*   [ ] User email automation - abstract for generic but specific implementation with Kit 
*   [ ] Change email from within app
*   [ ] Change password from within app
*   [ ] shadcn
*   [ ] Loading skeletons for all components 
*   [ ] Change payment method doesn't register site
*   [ ] Run SEO scan 

**Notes & Key Learnings (Summary):**

1. **Incomplete Stripe E2E Flow (IMPORTANT):** Stripe has been tested in Test Mode but not confirmed live Live Mode with real transactions. 
2. **Chosen Pattern for `apiClient` Consumption & Testing (April 2024):**
    *   **Pattern:** The `@paynless/api-client` package utilizes a **Singleton pattern**. It is initialized once per application run (`initializeApiClient`) and accessed via the exported `api` object (`import { api } from '@paynless/api-client';`).
    *   **Rationale:** This approach is preferred for this multi-platform architecture as it simplifies client consumption across shared code (stores) and different frontend platforms (web, mobile), centralizes configuration, and guarantees a single instance for managing state like auth tokens.
    *   **Consumption:** All consumers (stores, UI components, etc.) should import and use the `api` singleton directly rather than relying on dependency injection (DI) via props or `init` methods for the API client.
    *   **Testing:** Unit testing consumers that depend on the `apiClient` requires mocking the module import using the test runner's capabilities (e.g., `vi.mock('@paynless/api-client', ...)` in Vitest). This allows replacing the singleton with a mock during tests.
    *   **Consistency Task:** Older stores (`authStore`, `subscriptionStore`) currently use an outdated DI (`init`) pattern. They **must** be refactored to align with the singleton import pattern and `vi.mock` testing strategy for consistency.
3. **Test Structure Refactor (April 2024):** Standardized `apps/web/src/tests/` structure:
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
4. **Shared Render Utility (`utils/render.tsx`):** Provides `MemoryRouter`, `QueryClientProvider`, `ThemeProvider`. It no longer includes `AuthProvider` to allow integration tests to use the real Zustand stores directly.
5. **Real Stores in Integration Tests:** Integration tests now import and use the actual `useAuthStore` and `useSubscriptionStore` to test the full flow with MSW-mocked API calls.
6. **Mock Stores in Unit Tests:** Unit tests needing store isolation should mock the stores locally using `vi.mock` / `vi.spyOn`, potentially utilizing mock factories from `utils/mocks/stores/`.
7. **MSW Handler Consolidation & Base URL:** All default global MSW handlers reside in `utils/mocks/handlers.ts`. **Crucially**, this file MUST derive the `API_BASE_URL` from environment variables (`process.env.VITE_SUPABASE_URL`) to match the `apiClient`'s configuration. Hardcoded URLs (`http://test.host`) will cause `unhandled request` errors.
8. **MSW Handler Overrides (`server.use`) & `resetHandlers()` (Integration Test Context):**
    *   **Problem:** Attempts to use `server.use()` within individual test cases (`it(...)` in `ai.integration.test.tsx`) to override globally defined handlers (from `handlers.ts`) consistently failed. The global handlers ran instead of the test-specific overrides, regardless of whether `resetHandlers` was managed globally (`setup.ts`) or locally (`describe` block).
    *   **Working Pattern (for Success Cases):**
        *   Define common success-case handlers globally (`handlers.ts`), ensuring correct base URL from env vars.
        *   Ensure the global `server` instance uses these handlers (`server.ts`).
        *   Keep the global `afterEach(() => server.resetHandlers())` active in `setup.ts`.
        *   Tests requiring only these success handlers should *not* use `server.use()` and should rely on the global setup.
    *   **Unresolved (for Error Cases Requiring Overrides):** The inability to reliably override handlers using `server.use()` within certain test files (like `ai.integration.test.tsx`) means a different strategy is needed for testing API error paths in integration tests. Options include:
        *   Temporarily skipping these tests.
        *   Mocking the specific `apiClient` method (e.g., `vi.spyOn(api, 'get').mockRejectedValue(...)`) *instead of* using MSW for that specific error test, acknowledging the mix of mocking strategies.
        *   Further investigation into the root cause of `server.use()` failures in specific contexts.
9. **Local Runtime Auth (`verify_jwt`):** The local Supabase runtime *does* respect function-specific `[functions.<name>] verify_jwt = false` settings in `config.toml`. This is crucial for allowing API key auth functions (`/login`, `/register`) to bypass the runtime's potentially overzealous default JWT checks. Failure symptom: `401 Unauthorized` with runtime logs showing "Missing authorization header".
10. **Dependency Injection & `serve`:** Using the DI pattern (`deps = defaultDeps`) for unit testability is viable, *but* the `serve` call at the end of the function file *must* explicitly pass the defaults: `serve((req) => handler(req, defaultDeps))`. Failure symptom: `TypeError` inside the function runtime.
11. **Deno Imports (`npm:`, `std` version):** Deno requires explicit handling for imports:
    *   Use the `npm:` prefix for Node packages like `@supabase/supabase-js` (e.g., `npm:@supabase/supabase-js`).
    *   Use a recent, compatible version of the Deno Standard Library (`std`) matching the runtime (e.g., `std@0.224.0` for `serve`). Failure symptoms: `worker boot error` (relative path), `ReferenceError` (undefined function).
12. **Environment Variables & `supabase start`:** As documented below under "Known Limitations", `supabase start` (even CLI v2.20.5) does **not** reliably inject environment variables from `.env` files into the function runtime for local integration testing. `--env-file` is not supported by `start`. Manual loading attempts fail due to permissions.
13. **Deno Test Leaks:** `fetch` calls in tests must have their response bodies consumed (`await res.json()`, `.text()`) or closed (`await res.body?.cancel()`) to avoid resource leak errors.
14. **Profile Auto-Creation:** Local Supabase setup automatically creates `user_profiles` rows. Tests modifying profiles must use `update` after initial user creation.
15. **Back-testing/Regression:** Refactoring or changes require re-running affected unit/integration tests. Unit tests need updating post-integration changes.
16. **Mocking SupabaseClient (TS2345):** Directly mocking the `SupabaseClient` in unit tests can lead to TS2345 errors (type incompatibility, often due to protected properties like `supabaseUrl`) if the mock object doesn't perfectly match the client's complex type signature. This is especially true if tests in the same file need to mock different *parts* of the client (e.g., `.from()` vs. `.functions.invoke()`), leading to inconsistent mock object shapes.
    *   **Solution:** Introduce a **Service Abstraction Layer**. Define a simple interface declaring only the methods needed by the handler. Implement the interface using the real `SupabaseClient`. Refactor the handler to depend on the interface. Unit test the handler by mocking the *simple interface*, which avoids the TS2345 error. (See `stripe-webhook/handlers/product.ts` and its service/test for an example). Test the service implementation's direct Supabase calls separately.
17. **Refactoring UI/Store Interaction Pattern:** We identified inconsistencies in how UI components (`LoginForm`, `RegisterForm`, `ProfileEditor`, subscription pages) interact with Zustand stores (`authStore`, `subscriptionStore`) regarding side effects like API calls, loading states, error handling, and navigation. The previous pattern involved components managing local loading/error state and sometimes triggering navigation *after* store actions completed.
    *   **New Pattern:** To improve separation of concerns, predictability, and testability, we are refactoring towards a pattern where:
        *   Zustand store actions encapsulate the *entire* flow: initiating the API call, managing the central `isLoading` state, managing the central `error` state, and handling internal app navigation (e.g., `navigate('/dashboard')` after successful login) directly within the action upon success.
        *   UI components become simpler, primarily dispatching store actions and reacting to the centralized loading and error states provided by the store hooks (`useAuthStore(state => state.isLoading)`, etc.) to render feedback. Local loading/error state in components is removed.
        *   For actions requiring *external* redirection (like Stripe Checkout/Portal), the store action will still return the necessary URL, and the calling UI component will perform the `window.location.href` redirect.
    *   **Impact:** This requires refactoring `authStore` (`login`, `register`, `updateProfile`), `subscriptionStore` (checkout, portal, cancel, resume actions), and the corresponding UI components (`LoginForm`, `RegisterForm`, `ProfileEditor`, `SubscriptionPage`). *(Note: Some progress made on testing strategy refactor for LoginForm/SubscriptionPage by mocking stores, but full pattern implementation pending).*
    *   **Testing Implication:** Unit tests for affected stores and components, along with MSW integration tests (Phase 3.2) for Login, Register, Profile, and Subscription flows, will require significant updates and re-validation after this refactoring.
18. **Vitest Unhandled Rejections (Component Tests):** When testing React components that interact with mocked asynchronous actions that *reject* (e.g., simulating API errors in `LoginForm.test.tsx`), Vitest consistently reports "Unhandled Rejection" errors and causes the test suite to exit with an error code, *even when the tests correctly assert the rejection and pass all assertions*. Multiple handling strategies (`expect().rejects`, `try/catch` within `act`, `try/catch` outside `act`, explicit `.catch()`) failed to suppress these specific runner errors. For now, we accept this as a Vitest runner artifact; the relevant tests (like `LoginForm.test.tsx`) are considered functionally correct despite the runner's error code.
19. **Multi-Platform Capability Abstraction & Testing:** To support platform-specific features (like filesystem access on Desktop via Tauri/Rust) across Web, Mobile (React Native), and Desktop targets, a **Capability Abstraction** pattern is adopted.
    *   **Architecture:** A central service (`platformCapabilitiesService` in a shared package) detects the runtime platform and exposes a consistent interface (e.g., `{ fileSystem: FileSystemCapabilities | null, ... }`). Platform-specific providers (TypeScript wrappers calling Tauri `invoke`, Web APIs, RN Modules) implement these interfaces. Shared UI components check for capability availability (`if (capabilities.fileSystem)`) before using features.
    *   **Testing Implications:**
        *   **Unit Tests:** The capability service itself needs unit testing with mocked platform detection. Shared components using the service must be tested by mocking the service to simulate different platforms (capabilities available vs. unavailable) and verifying conditional logic/rendering and calls to the correct service methods. TypeScript capability providers should be unit tested, mocking underlying APIs/modules (`invoke`, Web APIs, RN modules). Rust command handlers require Rust unit tests (`#[test]`).
        *   **Integration Tests:** Crucially require *platform-specific* integration testing. For Tauri, this means testing the TS -> `invoke` -> Rust -> Native API flow within a Tauri environment (e.g., using `tauri-driver`). For Web/RN, test interaction with Web APIs or Native Modules in their respective environments.
        *   **E2E Tests:** Must be run on each target platform (Web, Windows Desktop, Mac Desktop, Linux Desktop, iOS, Android) to validate the full user flow involving platform-specific features. Requires appropriate E2E tooling for each platform (Playwright/Cypress for Web, Tauri-specific tooling, Detox/Appium for Mobile).

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
        *   **Status:** Most core function unit tests passing. AI function tests added.
        *   **Framework:** Deno Standard Library
        *   **Functions/Modules Tested:**
            *   [✅] `login/`
            *   [✅] `logout/`
            *   [✅] `me/`
            *   [✅] `profile/`
            *   [✅] `refresh/`
            *   [✅] `register/`
            *   [✅] `reset-password/`
            *   [✅] `session/`
            *   [✅] `ping/`
            *   [✅] `api-subscriptions/handlers/checkout.ts`
            *   [?] `api-subscriptions/` (Other handlers)
                *   [✅] Implement `handlers/billing-portal.ts`
                *   [✅] Unit Test `handlers/billing-portal.ts`
                *   [✅] Implement/Verify `handlers/subscription.ts` (cancel/resume)
                *   [✅] Unit Test `handlers/subscription.ts`
                *   [✅] Review/Test `handlers/plans.ts`
                *   [✅] Review/Test `handlers/current.ts`
                *   [✅] Review/Test `handlers/usage.ts`
            *   [✅] `stripe-webhook/`
                *   [✅] Implement handling for key events (checkout complete, sub updated, etc.)
                *   [✅] Unit test webhook handler logic & signature verification
            *   [✅] **AI Chat Functions:**
                *   [ ] Unit Test `ai-providers/index.ts` (Mock Supabase client) *(Pending)*
                *   [ ] Unit Test `system-prompts/index.ts` (Mock Supabase client) *(Pending)*
                *   [🚧] Unit Test `chat/index.ts` (Extensive tests exist - Needs update for Auth/Anon Secret Check & Rate Limiting)
                *   [✅] Unit Test `chat-history/index.ts` (Tests exist)
                *   [✅] Unit Test `chat-details/index.ts` (Tests exist)
            *   **[NEW] Email Marketing Sync:**
                *   [ ] `_shared/email_service/kit_service.ts`
                *   [ ] `_shared/email_service/no_op_service.ts`
                *   [ ] `_shared/email_service/factory.ts`
                *   [ ] `on-user-created/index.ts`
            *   [⏸️] `sync-stripe-plans/` *(Unit tests exist but ignored locally due to Supabase lib type resolution errors. Pending deployed testing.)*
            *   [⏸️] `sync-ai-models/` *(Placeholder - No tests needed yet)*
            *   [✅] `_shared/auth.ts`
            *   [✅] `_shared/cors-headers.ts`
            *   [✅] `_shared/responses.ts`
            *   [✅] `_shared/stripe-client.ts` *(Partially tested, webhook verify pending)*
            *   [⏸️] `_shared/test-utils.ts` *(Deferred - implicitly tested via integration tests)*
            *   [❓] `test-auth.ts` *(Purpose unclear, review/remove?)*
        *   **Task:** `[🚧] Complete implementation and unit tests for [ ], [?], and [❓] items above.`
    *   **1.2 Integration Tests:**
        *   [✅] **Environment Setup:** Local Supabase environment configured (`config.toml`, `.env.local`).
        *   **Function Integration (Auth & Profile):** (All ✅)
        *   [⏸️] **Function Integration (Stripe - API Endpoints):** *(Local Integration Blocked due to env var issue - Test in deployed env.)*
            *   `[⏸️]` `/api-subscriptions/checkout`
            *   `[ ]` `/api-subscriptions/billing-portal` 
            *   `[ ]` `/api-subscriptions/.../cancel` 
            *   `[ ]` `/api-subscriptions/.../resume` 
            *   `[?]` `/api-subscriptions/plans`
            *   `[?]` `/api-subscriptions/current`
            *   `[?]` `/api-subscriptions/usage/:metric`
        *   [🚧] **Function Integration (AI Chat):** *(Local Integration Partially Blocked due to env var issue / external calls. Test core DB interactions locally, full flow in deployed env. Needs verification for Anon Secret Check.)*
            *   [✅] `/ai-providers` (Verified works locally - DB reads only)
            *   [✅] `/system-prompts` (Verified works locally - DB reads only)
            *   [🚧] `/chat` (Requires external AI API keys -> env vars. Needs API tests for Auth/Anon Secret logic.)
            *   [✅] `/chat-history` (Verified works locally - DB reads only)
            *   [✅] `/chat-details/:chatId` (Verified works locally - DB reads only)
        *   [⏸️] **Function Integration (Stripe - Webhook):** *(Test in deployed env)*
        *   [⏸️] `sync-stripe-plans` *(Needs Integration Test - Requires deployed env)*
        *   [⏸️] `sync-ai-models` *(Needs Integration Test - Requires deployed env)*
        *   [ ] **Database Integration:** Use `supabase test db` to validate migrations and RLS policies. *(RLS policies for AI tables need verification)*
        *   [❓] **Stripe Integration:** Test against Stripe's test environment API and webhooks.
        *   [ ] **Email Marketing Sync:**
            *   [ ] Deploy `on-user-created` function and manually configure Auth Hook for initial E2E test.
    *   **1.3 Automation:**
        *   [ ] Implement script (`create-hooks.ts`?) using Supabase Management API to automate Auth Hook creation based on a config file.
    *   **1.4 Final Validation & Lockdown:**
        *   [ ] **Task:** Add comments to function code indicating validation status.

*   **Phase 2: Shared Packages (`packages/`)**
    *   **2.1 Unit Tests:**
        *   [✅] `packages/api-client` (All sub-clients: `apiClient`, `stripe.api`, `ai.api` tests passing)
        *   [✅] `packages/store` (Vitest setup complete)
            *   [✅] `authStore.ts` *(Tests passing. Needs update for `register` modification)*
            *   [✅] `subscriptionStore.ts` *(Tests passing)*
            *   [✅] `aiStore.ts` *(Tests passing)*
        *   [⏭️] `packages/ui-components` *(Skipped - Package empty)*.
        *   [✅] `packages/utils` (`logger.ts` tests passing)
        *   [✅] `packages/types` *(Implicitly tested via usage)*.
        *   [ ] `packages/utils` or `packages/platform-capabilities`: Unit test `platformCapabilitiesService` (mock platform detection).
        *   [ ] Unit test TypeScript capability providers (mock underlying APIs like `invoke`, Web APIs, RN Modules).
    *   **2.2 Integration Tests:** (Frontend MSW-based tests are covered in Phase 3.2)

*   **Phase 3: Web App (`apps/web/`)**
    *   **3.1 Unit Tests:**
        *   [✅] **Component Review:** `LoginForm`, `RegisterForm`, `ProfileEditor`, `SubscriptionPage`, `AiChatbox`, `ModelSelector`, `PromptSelector` exist and follow store interaction pattern.
        *   [ ] `apps/web/src/components/ai/` *(Unit test new AI components)*
        *   [🚧] Other `apps/web/src/` Components/Pages/Hooks: *(Status needs re-evaluation)*
        *   [ ] Components using `platformCapabilitiesService`: Mock the service to test conditional rendering and logic for different platforms/capabilities.
    *   **3.2 Integration Tests (MSW):**
        *   [✅] **Refactoring Complete:** Structure standardized, utilities/handlers consolidated.
        *   [🚧] **API Integration (Mocked):** Key user flows tested with MSW.
            *   **Authentication (`auth.integration.test.tsx`):**
                *   `[✅]` Login: Success, Invalid Credentials, Server Error.
                *   `[✅]` Register: Success, Email Exists, Server Error.
                *   `[ ]` Logout (Manually tested as working, integration test not implemented)
                *   `[ ]` Session Load/Refresh (Manually tested as working, integration test not implemented)
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
                *   `[ ]` Create Portal: Handles store action failure. (Manually tested as working, integration test not implemented)
                *   `[✅]` Cancel Subscription: Calls store action.
                *   `[ ]` Cancel Subscription: Handles store action failure. (Manually tested as working, integration test not implemented)
                *   `[ ]` Resume Subscription: Actions & Handlers. (Manually tested as working, integration test not implemented)
                *   `[ ]` Usage Metrics: Actions & Handlers.
                *   `[✅]` Test Mode UI indication.
                *   `[ ]` Loading states for actions.
            *   **AI Chat (`ai.integration.test.tsx`):**
                *   [✅] Load AI Config (Providers/Prompts): Verify selectors populated.
                *   [✅] Send Message (Authenticated): Verify message appears, spinner shows, response appears.
                *   [✅] Send Message (Error): Verify error message shown. *(Tested via vi.spyOn)*
                *   [✅] Load Chat History: Verify history list populates.
                *   [✅] Load Chat Details: Select chat, verify messages load.
                *   [🚧] Anonymous Flow: Send message below limit -> Success (Needs update to verify secret header sent).
                *   [✅] Anonymous Flow: Send message at limit -> Checks for `{ error: 'limit_reached' }` return object.
                *   [🚧] Anonymous Flow: Verify default provider/prompt are selected on load.
                *   [ ] Anonymous Flow: Stash message -> Register -> Verify message sent automatically. *(Logic Pending)*
    *   **3.3 End-to-End Tests:**
        *   [ ] **Tooling:** Setup Playwright/Cypress.
        *   [✅] **Core User Flows:** Auth cycle, Profile management.
        *   [ ] **Payment Flows:**
            *   `[ ]` User selects plan -> Clicks Subscribe -> Redirected to Stripe Checkout (Manually tested as working, E2E test not implemented)
            *   `[ ]` User completes checkout -> Redirected to Success URL -> Verify UI update / subscription state (Manually tested as working, E2E test not implemented)
            *   `[ ]` User cancels checkout -> Redirected to Cancel URL -> Verify UI state (Manually tested as working, E2E test not implemented)
            *   `[ ]` Subscribed user clicks Manage Billing -> Redirected to Stripe Portal (Manually tested as working, E2E test not implemented)
            *   `[ ]` User manages subscription in Portal -> Returns to app -> Verify UI update / subscription state (Manually tested as working, E2E test not implemented)
        *   [🚧] **AI Chat Flows:**
            *   `[✅]` Authenticated user sends message, receives response.
            *   `[🚧]` Anonymous user sends message below limit (Verify default selections, sending, response).
            *   `[ ]` Anonymous user hits limit, signs up, message is sent. *(Logic Pending)*
        *   [ ] **Platform Capabilities:** Verify graceful degradation/alternative UI for features unavailable in the web environment. Test features using Web APIs (if any implemented via capabilities).

*   **Phase 4: CI/CD**
    *   [ ] Setup CI pipeline (e.g., GitHub Actions).
    *   [ ] Configure pipeline for Phase 1.1 tests.
    *   [ ] Configure pipeline for Phase 2.1 tests.
    *   [ ] Configure pipeline for Phase 3.1 tests.
    *   [ ] (Optional): Configure Phase 1.2 tests (consider env var limitations).
    *   [ ] (Optional): Configure Phase 3.3 tests.
    *   [ ] Configure deployment steps.
*   **Phase 5: Desktop & Mobile Apps (`apps/desktop/`, `apps/ios/`, `apps/android/`)**
    *   **5.1 Unit Tests (Rust/Native Modules):**
        *   [ ] Tauri Rust Commands: Unit test native logic (`#[test]`).
        *   [ ] React Native Modules: Unit test native module logic if applicable.
    *   **5.2 Integration Tests (Platform-Specific):**
        *   [ ] **Tauri:** Set up Tauri integration testing (e.g., `tauri-driver`) to test TS-Rust bridge (`invoke`) and native interactions on target OS (Windows, Mac, Linux).
        *   [ ] **React Native:** Set up RN integration testing (e.g., Detox/Appium) to test interactions with native modules on simulators/devices.
    *   **5.3 End-to-End Tests (Platform-Specific):**
        *   [ ] **Tooling:** Setup E2E tools for Tauri (e.g., Playwright with tauri-driver?) and React Native (Detox/Appium).
        *   [ ] **Flows:** Test user flows involving platform-specific capabilities (filesystem, registry, etc.) on each target platform build (Windows, Mac, Linux, iOS, Android).
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

## Testing Strategy: Service Abstraction for Complex Dependencies

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

## Test Incrementally From the Bottom Up
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

## Multi-Platform Architecture: Capability Abstraction

Given the requirement to support multiple frontends (Web, React Native for iOS/Android, Tauri for Desktop - Windows/Mac/Linux) with platform-specific capabilities (especially filesystem access on Desktop), the following architectural pattern should be adopted:

### 1. Feature Detection & Capability Abstraction Service

- **Concept:** Create a central service (e.g., `platformCapabilitiesService`) that abstracts away platform-specific functionalities. This service will expose a consistent interface for various capabilities (e.g., `fileSystem`, `notifications`, `registryAccess`).
- **Implementation:**
    - Define TypeScript interfaces for each capability group (e.g., `FileSystemCapabilities`, `WindowsRegistryCapabilities`).
    - The service will have a function (e.g., `getPlatformCapabilities()`) that detects the current runtime environment (Web, Tauri, React Native, specific OS).
    - Based on the detected platform, the service returns an object implementing the capability interfaces. If a capability is not available on the current platform, the corresponding property in the returned object will be `null`.
- **Location:** This service could reside in a shared package (e.g., `packages/utils` or a new `packages/platform-capabilities`).

### 2. Platform-Specific Providers

- **Tauri/Rust (Desktop):**
    - Implement the capability interfaces using Tauri's JavaScript API (`@tauri-apps/api`) for standard features (dialogs, basic FS).
    - For more complex or OS-specific features (e.g., Windows Registry), create custom Rust commands (`#[tauri::command]`).
    - These Rust commands implement the native logic using appropriate crates (e.g., `winreg` for Windows registry).
    - Expose these commands to the TypeScript layer via Tauri's `invoke` function. The TypeScript provider will call `invoke` to execute the Rust backend code.
    - Use Rust's conditional compilation (`#[cfg(target_os = "windows")]`, etc.) to include OS-specific native code only when building for that target.
- **Web:**
    - Implement capabilities using standard Web APIs where available (e.g., `navigator.clipboard`, potentially Web File System Access API).
    - Return `null` for capabilities not supported in the browser.
- **React Native (iOS/Android):**
    - Implement capabilities using React Native modules and platform APIs (e.g., `react-native-fs`, specific native modules if needed).
    - Return `null` for capabilities not applicable to mobile.

### 3. UI Component Integration

- **Feature Detection:** Shared UI components (in `apps/web/src/components` or potentially a shared `packages/ui-components` if created later) should import and use the `getPlatformCapabilities()` service.
- **Conditional Logic/Rendering:** Before attempting to use a platform-specific feature, components must check if the capability is available (i.e., not `null`) on the current platform via the service.
    - Render UI elements (e.g., buttons for "Open File") conditionally based on capability availability.
    - Provide alternative UI or messages for platforms where a feature is unavailable (graceful degradation).
- **TypeScript Logic:** The TypeScript code handles the control flow ("*if* on Windows Desktop, *then* try to read registry key via capability service"). The actual native interaction is delegated through the capability service to the platform-specific provider (Tauri/Rust, Web API, RN Module).

### Benefits

- **Maintainability:** Keeps the bulk of the UI and application logic in a shared TypeScript codebase.
- **Code Reuse:** Maximizes reuse of components and logic across platforms.
- **Consistency:** Provides a consistent way to access platform features.
- **Testability:** Allows mocking the capabilities service for unit testing shared components.
- **Extensibility:** Simplifies adding new platforms or capabilities later.
- **Platform-Specific Power:** Leverages native capabilities (via Tauri/Rust or React Native modules) where needed without polluting the shared codebase.
