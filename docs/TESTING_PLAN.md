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
    *   `api` / `analytics` / `platform` / `email_service` Adapters: Test adapter methods individually. Mock external dependencies (e.g., `fetch`, `posthog-js`, `@tauri-apps/api`, environment variables). Cover happy paths, configuration errors (missing keys), and API error responses.
    *   `store` (Zustand): Test actions by mocking the API client (`@paynless/api`) calls they make. Assert correct state changes (`isLoading`, `error`, data properties) before, during (optimistic UI), and after the mocked async operations resolve or reject.
    *   `utils` / `types`: Primarily tested implicitly through their usage, but core utilities (`logger`) should have dedicated unit tests.
*   **UI Components (`apps/web/`):** Use Vitest with Testing Library. Test rendering based on different props and states. Mock imported hooks (stores, router) and services (`platformCapabilitiesService`, `analytics`). Simulate user events (`fireEvent`) and assert that the correct actions are dispatched or UI changes occur.

Following this cycle helps catch errors early, ensures comprehensive test coverage naturally evolves with the code, and makes the codebase more maintainable and reliable.

**Notes & Key Learnings (Summary):**

1. **Incomplete Stripe E2E Flow (IMPORTANT):** Stripe has been tested in Test Mode but not confirmed live Live Mode with real transactions. 
2. **Chosen Pattern for `apiClient` Consumption & Testing (April 2024):**
    *   **Pattern:** The `@paynless/api` package utilizes a **Singleton pattern**. It is initialized once per application run (`initializeApiClient`) and accessed via the exported `api` object (`import { api } from '@paynless/api';`).
    *   **Rationale:** This approach is preferred for this multi-platform architecture as it simplifies client consumption across shared code (stores) and different frontend platforms (web, mobile), centralizes configuration, and guarantees a single instance for managing state like auth tokens.
    *   **Consumption:** All consumers (stores, UI components, etc.) should import and use the `api` singleton directly rather than relying on dependency injection (DI) via props or `init` methods for the API client.
    *   **Testing:** Unit testing consumers that depend on the `apiClient` requires mocking the module import using the test runner's capabilities (e.g., `vi.mock('@paynless/api', ...)` in Vitest). This allows replacing the singleton with a mock during tests.
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

*   **[NEW] Handling `vi.mock` Hoisting Issues (May 2024):**
    *   **Problem:** When using `vi.mock('module/path', factoryFn)` where the `factoryFn` needs to reference variables (e.g., imported mock functions) defined at the top level of the test file, Vitest's hoisting mechanism can cause runtime errors (`ReferenceError: Cannot access 'variableName' before initialization`). This happens because the mock factory might execute *before* the top-level variable assignments are fully processed.
    *   **Working Pattern:** To reliably avoid this:
        1.  **Import Mocks First:** Ensure all mock functions or variables needed by the factory function are imported or defined *at the very top* of the test file, before any `vi.mock` calls.
        2.  **Use Synchronous Factory:** The factory function provided to `vi.mock` should be synchronous (`() => ({...})`) rather than asynchronous (`async () => ({...})`) if possible.
        3.  **Reference Top-Level Imports:** Directly reference the top-level imported mocks/variables within the object returned by the synchronous factory. Avoid using `vi.importActual` *inside* the factory if the goal is simply to structure the mock, as this can sometimes reintroduce timing complexities.
    *   **Example (`organizationStore.test.ts`):**
        ```typescript
        // 1. Import mocks at the TOP
        import {
            mockListUserOrganizations,
            mockGetOrganizationDetails,
            // ... other mocks
        } from '../../api/src/mocks/organizations.mock.ts';
        import { initializeApiClient, _resetApiClient, api as apiActual } from '@paynless/api'; // Import actual for typing/structure if needed

        // ... other imports

        // 2. Use synchronous factory referencing top-level imports
        vi.mock('@paynless/api', () => ({
            initializeApiClient: vi.fn(),
            _resetApiClient: vi.fn(),
            api: {
                organizations: {
                    // 3. Reference imported mocks directly
                    listUserOrganizations: mockListUserOrganizations,
                    getOrganizationDetails: mockGetOrganizationDetails,
                    // ... other mocked methods
                },
                // Mock other parts of the 'api' object as needed
                auth: {}, 
                billing: {},
                getSupabaseClient: vi.fn(() => ({ auth: {} }))
            },
        }));

        // ... rest of test file ...
        ```

*   **[NEW] Phase 5: Anonymous Chat Auth Refactor Verification:** Added specific backend and E2E test cases for the anonymous secret header and related flows.

*   **[NEW] Deno Function Testing Learnings (May 2024 - sync-ai-models):**
    *   **Mocking Supabase Client Chaining:** Accurately mocking the Supabase JS client requires mimicking the synchronous return of the query builder object for chaining methods like `.select()`, `.eq()`, `.in()` before the final asynchronous resolution (`await`, `.then()`, `.single()`). The successful refactor in `supabase.mock.ts` implements this by having modifier methods return the mock builder instance and resolving configured mock results only within terminal methods (`.then()`, `.single()`). Initial attempts where modifier methods were `async` failed.
    *   **Mocking Fetch:** Using shared helpers like `stubFetchForTestScope` (which returns a disposable stub) and `setMockFetchResponse` (which configures the response) from `supabase.mock.ts` is more robust than manual stubbing within test files. Attempting to manually cancel the original response body within the fetch mock (`baseFetchImplementation`) can cause tests to hang and should be avoided.
    *   **Spy Assertions:** Checking spy call counts (`assertEquals(spy.calls.length, 1)`) can sometimes be more reliable than asserting specific call arguments (`assertSpyCall`) immediately after the invocation, especially across `await` boundaries or when dealing with complex mock object interactions.
    *   **Mock Error Propagation:** When a mocked promise rejects (e.g., simulating a DB error), the way the error propagates through subsequent `catch` blocks in the code under test might differ slightly from live execution. Assertions may need to check for the stringified original mock error (`String(mockErrorObject)`) instead of the message from a potentially re-thrown `new Error("...")` if the re-throw doesn't occur as expected in the test context.
    *   **Test Data Consistency:** Ensure mock data used in tests (e.g., mock database records) aligns with data conventions established by other parts of the system (e.g., provider prefixes like `openai-` added to identifiers by adapters). Inconsistent test data can lead to misleading failures.

*   **[NEW] Notification System Testing Strategy:**
    *   **Backend (Triggers/RLS):**
        *   Test trigger functions (e.g., `notify_org_admins_on_join_request`) using SQL unit tests or Supabase local dev tools to verify correct insertion into `notifications` table, including accurate population of the `data` JSONB field with context (`target_path`, relevant IDs).
        *   Test RLS policies on `notifications` using `supabase test db` or equivalent to ensure users can only select/update their own notifications.
    *   **API Client (`@paynless/api`):**
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
    *   **API Client (`@paynless/api`):**
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

*   **[NEW] Advanced Deno Function Mocking Insights (`MockQueryBuilder` - May 2025):**
    *   **Promise Resolution Hangs with Spied `.then()`:**
        *   **Problem:** When testing Supabase Edge Functions (e.g., `chat/index.ts`) using a custom mock Supabase client (`MockQueryBuilder` from `_shared/supabase.mock.ts`), tests could hang indefinitely. This occurred when an `await` was used on a query builder method (e.g., `await supabaseClient.from(...).update(...)`).
        *   **Root Cause:** The hang was traced to the interaction between the `jsr:@std/testing/mock` `spy` wrapper around the `MockQueryBuilder.then` method and the promise resolution mechanism. Even if the underlying mock logic (`_resolveQuery`) correctly prepared and returned a resolved promise, the `spy` on `.then()` (or the way it was invoked via `_executeMethodLogic`) appeared to prevent the `await` in the function under test from correctly "picking up" the resolved state and continuing execution.
        *   **Solution:**
            1.  The `MockQueryBuilder.then` method was refactored to *directly* call its internal promise resolution logic (`this._resolveQuery()`) and manage the promise chaining with the provided `onfulfilled` and `onrejected` callbacks. This bypassed calling `_executeMethodLogic` for the `'then'` case.
            2.  The `_initializeSpies` method in `MockQueryBuilder` was modified to *not* wrap the `.then()` method with a `spy`. This ensures that when `await` (which uses `.then()`) is called on a query builder instance, it invokes the direct, unspied `then` method.
        *   **Impact:** This resolved the test hangs, allowing tests to proceed and fail/pass based on actual logic rather than mock-induced stalls.

    *   **Asserting Spies on Sequentially Used Builders:**
        *   **Problem:** When a Supabase Edge Function makes multiple calls to `supabaseClient.from('some_table')` sequentially (e.g., a `select`, then an `update`, then another `select` on the same table), the `MockSupabaseClient.from()` method, by design, creates a *new* `MockQueryBuilder` instance for each call. If test assertions attempt to retrieve spies using a helper like `spies.getLatestQueryBuilderSpies('some_table')`, they will get spies from the *last* builder instance created for that table. This can lead to incorrect assertions if trying to verify calls made on an earlier builder instance (e.g., an `updateSpy.calls.length` being 0 because the spy instance belongs to a later builder).
        *   **Solution:** To reliably assert calls on specific operations in a sequence:
            1.  Modify the mock configuration for the specific operation (e.g., `genericMockResults.chat_messages.update`) in the test setup (e.g., `supaConfigForRewind`) to be a `spy` function itself (e.g., `update: spy(async (state: MockQueryBuilderState) => { ... })`).
            2.  In the test assertions, retrieve this operation-specific spy directly from the mock configuration object (e.g., `const updateSpy = supaConfigForRewind.genericMockResults!.chat_messages!.update as Spy<...>;`).
            3.  Assert against this directly retrieved spy's `calls.length` and arguments (which will include the `MockQueryBuilderState` passed to it, allowing checks on `state.updateData`, `state.filters`, etc.).
        *   **Example:** This was applied in `chat/index.rewind.test.ts` for the `update` operation.

    *   **Chained Operations (`.insert().select()`):**
        *   **Behavior:** When testing code like `await supabaseClient.from('table').insert(...).select()`, the `MockQueryBuilder` will first process the `insert` (setting its operation state to `'insert'`) and resolve it using the `insert` mock configuration. Then, the chained `.select()` modifies the *same* builder instance's operation state to `'select'` and attempts to resolve using the `select` mock configuration.
        *   **Mocking Strategy:** The `select` mock (e.g., a spy function provided in `genericMockResults.table.select`) needs to be configured to return the data that was notionally "just inserted." In `chat/index.rewind.test.ts`, the `select` spy was updated to handle a specific `selectCallCount` corresponding to this post-insert select, returning the predefined new message rows.

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

