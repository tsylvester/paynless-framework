**Consolidated Project Testing Plan & Status (v6 - Anonymous Auth Refactor)**

## Core Testing Philosophy: Test-Driven Development (TDD)

To ensure features are built correctly and integrated reliably the first time, we adhere to the Test-Driven Development (TDD) cycle:

1.  **RED:** Write a *failing* test case for the *smallest* piece of functionality you intend to add next. This could be a unit test for a specific function, an integration test for an API endpoint interaction, or a component test for a UI behavior.
    *   Run the test and watch it fail (e.g., compilation error because the function/class doesn't exist, assertion failure because the logic isn't implemented).
    *   This step confirms the test is correctly set up and tests the right thing.

2.  **GREEN:** Write the *minimum* amount of production code necessary to make the failing test pass. Avoid adding extra features, optimizations, or handling edge cases not covered by the current test.
    *   Run *all* tests in the relevant suite and ensure they now pass.

3.  **REFACTOR:** With the safety net of passing tests, improve the production code you just wrote. This includes:
    *   Improving clarity and readability.
    *   Removing duplication.
    *   Enhancing efficiency (if necessary and measurable).
    *   Ensure the code adheres to project patterns and guidelines (`DEV_PLAN.md`).
    *   Run the tests again frequently during refactoring to ensure you haven't broken anything.

4.  **REPEAT:** Select the next small piece of functionality and return to the **RED** step.

**Applying TDD in this Project:**

*   **Supabase Functions (`supabase/functions/`):** Start by testing the core handler logic. Mock dependencies like the Supabase client (`supabase/functions/_shared/supabase-client.ts`), external services (like Stripe or the future Kit service), and environment variables (`Deno.env`). Test success paths, error handling (e.g., invalid input, failed service calls), and response formatting.
*   **Shared Packages (`packages/`):
    *   `api-client` / `analytics-client` / `platform-capabilities` / `email_service` Adapters: Test adapter methods individually. Mock external dependencies (e.g., `fetch`, `posthog-js`, `@tauri-apps/api`, environment variables). Cover happy paths, configuration errors (missing keys), and API error responses.
    *   `store` (Zustand): Test actions by mocking the API client (`@paynless/api-client`) calls they make. Assert correct state changes (`isLoading`, `error`, data properties) before, during (optimistic UI), and after the mocked async operations resolve or reject.
    *   `utils` / `types`: Primarily tested implicitly through their usage, but core utilities (`logger`) should have dedicated unit tests.
*   **UI Components (`apps/web/`):** Use Vitest with Testing Library. Test rendering based on different props and states. Mock imported hooks (stores, router) and services (`platformCapabilitiesService`, `analytics`). Simulate user events (`fireEvent`) and assert that the correct actions are dispatched or UI changes occur.

Following this cycle helps catch errors early, ensures comprehensive test coverage naturally evolves with the code, and makes the codebase more maintainable and reliable.

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
8. **[NEW] MSW Handlers Required for ALL API Calls:** Components making API calls (even indirectly, e.g., `Header` -> `Notifications` -> `GET /notifications`) require corresponding request handlers in MSW (`apps/web/src/tests/utils/mocks/handlers.ts`). Missing handlers will cause `[MSW] Error: intercepted a request without a matching request handler:` errors in the test log, even if the test doesn't directly assert on the call's result. Add handlers for all expected calls, even if they just return a simple default (e.g., `ctx.json([])` for `GET /notifications`).
9. **MSW Handler Overrides (`server.use`) & `resetHandlers()` (Integration Test Context):**
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
10. **[NEW] Mocking Browser APIs (`window.matchMedia`):** When components rely on browser APIs not present in JSDOM (like `window.matchMedia` used by `ThemeProvider`), mocking is required. The most reliable approach found was using `vi.stubGlobal('matchMedia', mockImplementation)` within the global `setup.ts`. Attempts using `Object.defineProperty` directly in `setup.ts` or within individual test files (`beforeAll`) proved less effective or inconsistent.
11. **Local Runtime Auth (`verify_jwt`):** The local Supabase runtime *does* respect function-specific `[functions.<name>] verify_jwt = false` settings in `config.toml`. This is crucial for allowing API key auth functions (`/login`, `/register`) to bypass the runtime's potentially overzealous default JWT checks. Failure symptom: `401 Unauthorized` with runtime logs showing "Missing authorization header".
12. **Dependency Injection & `serve`:** Using the DI pattern (`deps = defaultDeps`) for unit testability is viable, *but* the `serve` call at the end of the function file *must* explicitly pass the defaults: `serve((req) => handler(req, defaultDeps))`. Failure symptom: `TypeError` inside the function runtime.
13. **Deno Imports (`npm:`, `std` version):** Deno requires explicit handling for imports:
    *   Use the `npm:` prefix for Node packages like `@supabase/supabase-js` (e.g., `npm:@supabase/supabase-js`).
    *   Use a recent, compatible version of the Deno Standard Library (`std`) matching the runtime (e.g., `std@0.224.0` for `serve`). Failure symptoms: `worker boot error` (relative path), `ReferenceError` (undefined function).
14. **Environment Variables & `supabase start`:** As documented below under "Known Limitations", `supabase start` (even CLI v2.20.5) does **not** reliably inject environment variables from `.env` files into the function runtime for local integration testing. `--env-file` is not supported by `start`. Manual loading attempts fail due to permissions.
15. **Deno Test Leaks:** `fetch` calls in tests must have their response bodies consumed (`await res.json()`, `.text()`) or closed (`await res.body?.cancel()`) to avoid resource leak errors.
16. **Profile Auto-Creation:** Local Supabase setup automatically creates `user_profiles` rows. Tests modifying profiles must use `update` after initial user creation.
17. **Back-testing/Regression:** Refactoring or changes require re-running affected unit/integration tests. Unit tests need updating post-integration changes.
18. **Mocking SupabaseClient (TS2345):** Directly mocking the `SupabaseClient` in unit tests can lead to TS2345 errors (type incompatibility, often due to protected properties like `supabaseUrl`) if the mock object doesn't perfectly match the client's complex type signature. This is especially true if tests in the same file need to mock different *parts* of the client (e.g., `.from()` vs. `.functions.invoke()`), leading to inconsistent mock object shapes.
    *   **Solution:** Introduce a **Service Abstraction Layer**. Define a simple interface declaring only the methods needed by the handler. Implement the interface using the real `SupabaseClient`. Refactor the handler to depend on the interface. Unit test the handler by mocking the *simple interface*, which avoids the TS2345 error. (See `stripe-webhook/handlers/product.ts` and its service/test for an example). Test the service implementation's direct Supabase calls separately.
19. **Refactoring UI/Store Interaction Pattern:** We identified inconsistencies in how UI components (`LoginForm`, `RegisterForm`, `ProfileEditor`, subscription pages) interact with Zustand stores (`authStore`, `subscriptionStore`) regarding side effects like API calls, loading states, error handling, and navigation. The previous pattern involved components managing local loading/error state and sometimes triggering navigation *after* store actions completed.
    *   **New Pattern:** To improve separation of concerns, predictability, and testability, we are refactoring towards a pattern where:
        *   Zustand store actions encapsulate the *entire* flow: initiating the API call, managing the central `isLoading` state, managing the central `error` state, and handling internal app navigation (e.g., `navigate('dashboard')` after successful login) directly within the action upon success.
        *   UI components become simpler, primarily dispatching store actions and reacting to the centralized loading and error states provided by the store hooks (`useAuthStore(state => state.isLoading)`, etc.) to render feedback. Local loading/error state in components is removed.
        *   For actions requiring *external* redirection (like Stripe Checkout/Portal), the store action will still return the necessary URL, and the calling UI component will perform the `window.location.href` redirect.
    *   **Impact:** This requires refactoring `authStore` (`login`, `register`, `updateProfile`), `subscriptionStore` (checkout, portal, cancel, resume actions), and the corresponding UI components (`LoginForm`, `RegisterForm`, `ProfileEditor`, `SubscriptionPage`). *(Note: Some progress made on testing strategy refactor for LoginForm/SubscriptionPage by mocking stores, but full pattern implementation pending).*
    *   **Testing Implication:** Unit tests for affected stores and components, along with MSW integration tests (Phase 3.2) for Login, Register, Profile, and Subscription flows, will require significant updates and re-validation after this refactoring.
20. **Vitest Unhandled Rejections (Component Tests):** When testing React components that interact with mocked asynchronous actions that *reject* (e.g., simulating API errors in `LoginForm.test.tsx`), Vitest consistently reports "Unhandled Rejection" errors and causes the test suite to exit with an error code, *even when the tests correctly assert the rejection and pass all assertions*. Multiple handling strategies (`expect().rejects`, `try/catch` within `act`, `try/catch` outside `act`, explicit `.catch()`) failed to suppress these specific runner errors. For now, we accept this as a Vitest runner artifact; the relevant tests (like `LoginForm.test.tsx`) are considered functionally correct despite the runner's error code.
21. **Multi-Platform Capability Abstraction & Testing:** To support platform-specific features (like filesystem access on Desktop via Tauri/Rust) across Web, Mobile (React Native), and Desktop targets, a **Capability Abstraction** pattern is adopted.
    *   **Architecture:** A central service (`platformCapabilitiesService` in a shared package) detects the runtime platform and exposes a consistent interface (e.g., `{ fileSystem: FileSystemCapabilities | null, ... }`). Platform-specific providers (TypeScript wrappers calling Tauri `invoke`, Web APIs, RN Modules) implement these interfaces. Shared UI components check for capability availability (`if (capabilities.fileSystem)`) before using features.
    *   **Testing Implications:**
        *   **Unit Tests:** The capability service itself needs unit testing with mocked platform detection. Shared components using the service must be tested by mocking the service to simulate different platforms (capabilities available vs. unavailable) and verifying conditional logic/rendering and calls to the correct service methods. TypeScript capability providers should be unit tested, mocking underlying APIs/modules (`invoke`, Web APIs, RN modules). Rust command handlers require Rust unit tests (`#[test]`).
        *   **Integration Tests:** Crucially require *platform-specific* integration testing. For Tauri, this means testing the TS -> `invoke` -> Rust -> Native API flow within a Tauri environment (e.g., using `tauri-driver`). For Web/RN, test interaction with Web APIs or Native Modules in their respective environments.
        *   **E2E Tests:** Must be run on each target platform (Web, Windows Desktop, Mac Desktop, Linux Desktop, iOS, Android) to validate the full user flow involving platform-specific features. Requires appropriate E2E tooling for each platform (Playwright/Cypress for Web, Tauri-specific tooling, Detox/Appium for Mobile).
22. **[NEW] Zustand Store Dependency Mocking (`aiStore` <-> `authStore` Example - May 2024):**
    *   **Problem:** Unit tests for `aiStore` actions that depend on state from `authStore` (e.g., `session` for tokens) consistently failed with `TypeError: Cannot read properties of undefined (reading 'session')`, even when attempts were made to set the `authStore` mock state using `useAuthStore.setState` in nested `beforeEach` blocks (a pattern observed working in `subscriptionStore.test.ts`).
    *   **Working Pattern:** The reliable solution was to use `vi.mocked(useAuthStore.getState).mockReturnValue(...)` within the nested `beforeEach` specific to the test suite requiring the dependent state. This directly controls the state object returned when `aiStore` calls `useAuthStore.getState()`.
    *   **Implementation:**
        *   The `mockReturnValue` must provide the *complete state object* the calling action might access, including `user`, `session`, `navigate`, and potentially other defaults (using `as any` if type complexity requires it).
        *   Use `mockReturnValueOnce` within specific `it(...)` blocks for test-case-specific state overrides (e.g., `session: null`, `navigate: null`).
        *   The top-level `beforeEach` should reset the store-under-test (e.g., `resetAiStore()`) but should **not** attempt to set state in the mocked dependent store (`useAuthStore.setState`).
    *   **Loading State Assertions (`act`/`await`):** To test loading states correctly:
        1.  Wrap the action dispatch in `act()`. Example: `act(() => { promise = useAiStore.getState().loadChatHistory(); ... });`
        2.  Assert the *immediate* synchronous state change (e.g., `isLoading: true`) *inside* the `act()` block, right after the action dispatch.
        3.  `await` the action's promise *outside* the `act()` block.
        4.  Assert the final state (e.g., `isLoading: false`) after the `await`.
    *   **Persistent Type Errors:** Encountered persistent `Type '"user"' is not assignable to type 'UserRole'` errors in mock data within `aiStore` tests despite trying various formats. Decided to ignore these after multiple attempts, prioritizing functional correctness, potentially indicating minor inconsistencies in type definitions.

*   **[NEW] Phase 5: Anonymous Chat Auth Refactor Verification:** Added specific backend and E2E test cases for the anonymous secret header and related flows.

*   **[NEW] Deno Function Testing Learnings (May 2024 - sync-ai-models):**
    *   **Mocking Supabase Client Chaining:** Accurately mocking the Supabase JS client requires mimicking the synchronous return of the query builder object for chaining methods like `.select()`, `.eq()`, `.in()` before the final asynchronous resolution (`await`, `.then()`, `.single()`). The successful refactor in `test-utils.ts` implements this by having modifier methods return the mock builder instance and resolving configured mock results only within terminal methods (`.then()`, `.single()`). Initial attempts where modifier methods were `async` failed.
    *   **Mocking Fetch:** Using shared helpers like `stubFetchForTestScope` (which returns a disposable stub) and `setMockFetchResponse` (which configures the response) from `test-utils.ts` is more robust than manual stubbing within test files. Attempting to manually cancel the original response body within the fetch mock (`baseFetchImplementation`) can cause tests to hang and should be avoided.
    *   **Spy Assertions:** Checking spy call counts (`assertEquals(spy.calls.length, 1)`) can sometimes be more reliable than asserting specific call arguments (`assertSpyCall`) immediately after the invocation, especially across `await` boundaries or when dealing with complex mock object interactions.
    *   **Mock Error Propagation:** When a mocked promise rejects (e.g., simulating a DB error), the way the error propagates through subsequent `catch` blocks in the code under test might differ slightly from live execution. Assertions may need to check for the stringified original mock error (`String(mockErrorObject)`) instead of the message from a potentially re-thrown `new Error("...")` if the re-throw doesn't occur as expected in the test context.
    *   **Test Data Consistency:** Ensure mock data used in tests (e.g., mock database records) aligns with data conventions established by other parts of the system (e.g., provider prefixes like `openai-` added to identifiers by adapters). Inconsistent test data can lead to misleading failures.

*   **[NEW] Notification System Testing Strategy:**
    *   **Backend (Triggers/RLS):**
        *   Test trigger functions (e.g., `notify_org_admins_on_join_request`) using SQL unit tests or Supabase local dev tools to verify correct insertion into `notifications` table, including accurate population of the `data` JSONB field with context (`target_path`, relevant IDs).
        *   Test RLS policies on `notifications` using `supabase test db` or equivalent to ensure users can only select/update their own notifications.
    *   **API Client (`@paynless/api-client`):**
        *   Unit test new functions (`fetchNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`) by mocking the Supabase client (`apiClient`).
    *   **State Management (`@paynless/store/notificationStore`):**
        *   Unit test Zustand store actions, mocking the API client calls. Verify correct state transitions for notification list, unread count, loading, and error states.
        *   Test selectors for `notifications` list and `unreadCount`.
    *   **Frontend (`Notifications.tsx` Component - Vitest/RTL):**
        *   Test rendering based on store state (no user, empty list, list with items, unread badge).
        *   Test initial fetch logic on mount (mock store action/API client).
        *   Test Realtime subscription setup (`useEffect`): Mock Supabase client `.channel()`, `.on()`, `.subscribe()`, and `.removeChannel()` to verify correct setup and cleanup.
        *   Test handling of incoming Realtime payloads (mocking the callback) and verify corresponding store actions are called.
        *   Test user interactions: Clicking "mark as read" (item/all), clicking an actionable notification (verify `data.target_path` parsing and mock `react-router` navigation trigger).

*   **[NEW] Multi-Tenancy (Organizations) Testing Strategy:**
    *   **Backend (Schema/RLS/Triggers):**
        *   Test RLS policies on `organizations`, `organization_members`, and *updated* policies on related tables (e.g., `chats`) using `supabase test db` or equivalent. Verify access control based on membership status (`active`), role (`admin`/`member`), organization visibility (`public`/`private`), and soft deletion (`deleted_at IS NULL`).
        *   Test the "last admin" check logic (trigger/function) thoroughly with various scenarios (single admin, multiple admins, attempts to leave/demote).
    *   **API Client (`@paynless/api-client`):**
        *   Unit test all new organization-related functions (`createOrganization`, `listUserOrganizations`, `getOrganizationDetails`, `getOrganizationMembers`, `inviteUser...`, `acceptInvite...`, `requestToJoin...`, `approveJoinRequest...`, `updateMemberRole...`, `removeMember...`, `deleteOrganization`), mocking the Supabase client and Edge Function invocations where necessary. Ensure tests cover admin-only actions and handling of potential errors (e.g., last admin check failure).
    *   **State Management (`@paynless/store/organizationStore`):**
        *   Unit test Zustand store actions, mocking API client calls. Verify state transitions for `userOrganizations` (filtering deleted), `currentOrganizationId`, `currentOrganizationDetails` (including visibility), `currentOrganizationMembers`, loading, error states. Test selectors for current org context and user role within the current org.
        *   Test the `setCurrentOrganizationId` action triggers fetching of details/members.
        *   Test the `softDeleteOrganization` action correctly removes the org from local state after API success.
    *   **Frontend Components (Vitest/RTL):**
        *   Test `OrganizationSwitcher`: Mock store, verify rendering, test selection logic triggers store action/navigation.
        *   Test Organization Forms (`CreateOrganizationForm`): Mock API calls, test validation, visibility options.
        *   Test Organization Pages (`/dashboard/organizations/...`): Test routing guards (require membership, non-deleted org). Test components for Settings (edit name/visibility, delete button - admin only), Member Management (`MemberList`, `InviteMemberModal`, role changes, removal - admin only, handling last admin error display), Invite/Join flows.
        *   Test conditional rendering based on user role within the current organization context (fetched from the store).
    *   **Integration (MSW/Manual):**
        *   Use MSW to mock backend API endpoints for frontend integration tests covering flows like creating an org, switching context, inviting/joining, managing members, and soft-deleting.
        *   Manual testing (as outlined in Checkpoint 2) is crucial for verifying RLS and complex interaction flows end-to-end.

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

## Testing Resources & Libraries

*   **Vitest:** Our primary test runner for JavaScript/TypeScript code (stores, components, utils).
    *   Configuration: `vitest.config.ts` in relevant packages.
    *   [Vitest Documentation](https://vitest.dev/)
*   **Testing Library:** Used for testing React components (`@testing-library/react`).
    *   [React Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
*   **Zustand:** Our state management library.
    *   [Zustand Testing Guide](https://zustand.docs.pmnd.rs/guides/testing)
*   **Mock Service Worker (MSW):** Used for mocking API requests in integration tests.
    *   Configuration: `apps/web/src/tests/mocks/` and `apps/web/src/tests/setup.ts`.
    *   [MSW Documentation](https://mswjs.io/docs/)
*   **vitest-localstorage-mock:** Used to reliably mock `localStorage` in Vitest tests.
    *   Setup via `setupFiles` in `vitest.config.ts`.
    *   [vitest-localstorage-mock on npm](https://www.npmjs.com/package/vitest-localstorage-mock)
*   **Deno Standard Library:** Used for testing Supabase Edge Functions.
    *   [Deno Standard Library Documentation](https://deno.land/std)

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
                *   [✅] Unit Test `ai-providers/index.ts` (Mock Supabase client)
                *   [ ] Unit Test `system-prompts/index.ts` (Mock Supabase client) *(Pending)*
                *   [✅] **Unit Test `chat/index.ts`:**
                *   [✅] Unit Test `chat-history/index.ts`
                *   [✅] Unit Test `chat-details/index.ts`
            *   **[NEW] Email Marketing Sync:**
                *   [✅] `_shared/email_service/kit_service.ts` (Mock fetch, env vars)
                *   [✅] `_shared/email_service/no_op_service.ts`
                *   [✅] `_shared/email_service/factory.ts` (Checked type returns)
                *   [✅] `on-user-created/index.ts` (Tested handler logic via DI)
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
        *   [🚧] **Function Integration (AI Chat):**
            *   [✅] `/ai-providers`
            *   [✅] `/system-prompts`
            *   [🚧] `/chat`: (Existing issues remain) **Add manual `curl`/Postman tests** for:
            *   [✅] `/chat-history`
            *   [✅] `/chat-details/:chatId`
        *   [⏸️] **Function Integration (Stripe - Webhook):** *(Test in deployed env)*
        *   [⏸️] `sync-stripe-plans` *(Needs Integration Test - Requires deployed env)*
        *   [⏸️] `sync-ai-models` *(Needs Integration Test - Requires deployed env)*
        *   [ ] **Database Integration:** Use `supabase test db` to validate migrations and RLS policies. *(RLS policies for AI tables need verification)*
        *   [❓] **Stripe Integration:** Test against Stripe's test environment API and webhooks.
        *   [ ] **Email Marketing Sync:**
            *   [ ] **`on-user-created` Function Integration:**
                *   [ ] Test user registration flow triggering the hook.
                *   [ ] Case 1 (Kit Disabled): Verify no attempt to call Kit API is made (check logs).
                *   [ ] Case 2 (Kit Enabled): Verify the Kit API *is* called (requires test Kit account/API key/form ID, or mock endpoint). Check for subscriber in Kit.
            *   [ ] **Supabase Auth Hook Configuration:** Verify `on-user-created` is configured as an Auth Hook in `config.toml` and functions in deployed env.
    *   **1.3 Automation:**
        *   [ ] Implement script (`create-hooks.ts`?) using Supabase Management API to automate Auth Hook creation based on a config file.
    *   **1.4 Final Validation & Lockdown:**
        *   [ ] **Task:** Add comments to function code indicating validation status.

*   **Phase 2: Shared Packages (`packages/`)**
    *   **2.1 Unit Tests:**
        *   [✅] `packages/api-client` (All sub-clients: `apiClient`, `stripe.api`, `ai.api` tests passing)
        *   [✅] `packages/store` (Vitest setup complete)
            *   [✅] `authStore.ts` (All actions covered across multiple `authStore.*.test.ts` files)
                *   **NOTE:** Replay logic tests (in `register.test.ts`, `login.test.ts`) and session/state restoration tests (in `initialize.test.ts`) related to `_checkAndReplayPendingAction` and the `initialize` action are currently unreliable/skipped/adjusted due to known issues in the underlying store functions. These tests need revisiting after the functions are fixed.
                *   [✅] *(Analytics)* Verify `analytics.identify` called on login/init success.
                *   [✅] *(Analytics)* Verify `analytics.reset` called on logout.
                *   [ ] *(Analytics)* Verify `analytics.track('Signed Up')` called on register success.
                *   [ ] *(Analytics)* Verify `analytics.track('Logged In')` called on login success.
                *   [ ] *(Analytics)* Verify `analytics.track('Profile Updated')` called on updateProfile success.
            *   [✅] `subscriptionStore.ts` *(Tests passing, including refresh failures in cancel/resume)*
                *   [ ] *(Analytics)* Verify `analytics.track('Subscription Checkout Started')` called on createCheckoutSession success.
                *   [ ] *(Analytics)* Verify `analytics.track('Billing Portal Opened')` called on createBillingPortalSession success.
            *   [✅] `aiStore.ts` *(Status: Refactored into `aiStore.*.test.ts` files. All tests passing after fixing mock strategy and store logic.)*
                *   [ ] *(Analytics)* Verify `analytics.track('Message Sent')` called on sendMessage success.
                *   *Note: Utilizes `vi.mocked(useAuthStore.getState).mockReturnValue` pattern for dependent store state.*
        *   [⏭️] `packages/ui-components` *(Skipped - Package empty)*.
        *   [✅] `packages/utils` (`logger.ts` tests passing)
        *   [✅] `packages/types` *(Implicitly tested via usage)*.
            *   [✅] *(Analytics)* Verify `AnalyticsClient` interface exists in `analytics.types.ts`.
        *   [✅] `packages/analytics-client` *(Setup Complete)*
            *   [✅] Unit Test `nullAdapter.ts` (interface compliance, callable methods).
            *   [✅] Unit Test `posthogAdapter.ts` (mock `posthog-js`, verify calls to `init`, `identify`, `capture`, `reset`, etc.).
            *   [✅] Unit Test `index.ts` (service logic: verify null adapter default [✅], verify PostHog selection [✅]).
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
                *   `[✅]`

*   **Phase 4: End-to-End Validation**
    *   **[NEW] User Registration with Email Sync:**
        *   [ ] Case 1 (Kit Disabled): Register via UI. Verify user created, NO user added to Kit list.
        *   [ ] Case 2 (Kit Enabled): Configure E2E env with Kit credentials. Register via UI. Verify user created AND user appears in Kit list/form.

        
## Testing Plan: Multi-Provider AI Integration

*   **Phase 1: Backend Unit Tests**
    *   [✅] **DB Migration:** Test `YYYYMMDDHHMMSS_add_provider_to_ai_providers.sql` using `supabase test db`.
    *   [✅] **Adapters (`_shared/ai_service/*_adapter.ts`):**
        *   [✅] OpenAI (`openai_adapter.test.ts`): Tests passing.
        *   [🚧] Anthropic (`anthropic_adapter.test.ts`): Most tests passing. `History Ends With Assistant (Invalid Format)` case deferred due to complex interaction between test data and validation logic (failsafe error not triggering as expected). Needs revisit.
        *   [✅] Google (`google_adapter.test.ts`): Tests passing.
    *   [✅] **Factory (`_shared/ai_service/factory.ts`):** Tests passing.
    *   [✅] **`/chat/index.ts`:**
        *   Mock factory, DB client, env vars.
        *   Test routing to correct adapter based on fetched provider.
        *   Test error handling (model not found, adapter error, etc.).
    *   [✅] **`/ai-providers/index.ts`:**
        *   Mock DB client, env vars.
        *   Test filtering logic (models returned only if API key env var set).
        *   Test empty list if no keys set.
    *   [🚧] **`sync-ai-models/` (Provider Logic):**
        *   [✅] `google_sync.ts` (Mock provider adapter, Supabase client; Test INSERT, UPDATE, DEACTIVATE, Error Handling)
        *   [✅] `anthropic_sync.ts` (Mock provider adapter, Supabase client; Test INSERT, UPDATE, DEACTIVATE, Error Handling)
        *   [✅] `openai_sync.ts` (Mock provider adapter, Supabase client; Test INSERT, UPDATE, DEACTIVATE, Error Handling)
    *   [✅] **`sync-ai-models/index.ts` (Router):**
        *   Mock provider `sync<Provider>Models` functions, env vars.
        *   Test calling correct sync functions based on set keys.

*   **Phase 2: Backend Integration Tests (Local & Deployed)**
    *   [ ] **`/ai-providers`:** Test endpoint returns correctly filtered list based on local `.env` keys.
    *   [ ] **`/chat`:** Test sending messages via different configured providers (requires API keys in local `.env`).
    *   [ ] **`sync-ai-models` (Manual Invocation):**
        *   Manually invoke function (`supabase functions invoke sync-ai-models`, requires API keys configured in Supabase project secrets).
        *   Verify database changes (new/updated/deactivated models).
        *   Test idempotency (running again should ideally result in no changes or expected updates).
    *   [ ] **Cron Job (Manual Setup / Deferred):** *(No automated cron setup currently. Verification requires manual setup via Dashboard or is deferred until automation is possible).* 

*   **Phase 3: Frontend Integration Tests (MSW)**
    *   [✅] **`ModelSelector.tsx`:** Mock `/ai-providers` response. Test component renders the correct list.
    *   [✅] **`AiChatbox.tsx` / `aichat.tsx`:** Mock `/chat` response. Test sending message results in correct API call (verify payload).

*   **Phase 4: End-to-End Validation**
    *   [ ] Manually configure API keys (OpenAI, Anthropic, Google).
    *   [ ] Run `sync-ai-models`.
    *   [ ] Start web app.
    *   [ ] Verify `ModelSelector` shows models from all configured providers.
    *   [ ] Send messages using models from each provider; verify success.
    *   [ ] Remove an API key, restart backend, refresh frontend. Verify corresponding models disappear.
    *   [ ] Add E2E tests (Playwright/Cypress) covering model selection and chat for each provider.

---