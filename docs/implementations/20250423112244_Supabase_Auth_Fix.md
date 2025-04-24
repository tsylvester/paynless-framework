# Implementation Plan: Refactor authStore to Supabase Standards (20250423112244)

**Objective:** Refactor `packages/store/src/authStore.ts` to use `supabase.auth.onAuthStateChange` as the primary driver for managing user, session, and loading state, resolving timing inconsistencies observed post-login.

**Guiding Principles:**

*   **TDD:** Write failing tests first, then implement the minimum code to pass, then refactor.
*   **Incremental Changes:** Modify the store in phases, ensuring the app remains functional at checkpoints.
*   **Minimal External Impact:** Aim to minimize changes required in consuming components (`Header.tsx`, `ProtectedRoute.tsx`, `App.tsx`, etc.) beyond ensuring they rely on the finalized `isLoading` and `user`/`session` state.
*   **Supabase Best Practices:** Align state management directly with `onAuthStateChange` events.
*   **Checkpoints:** Regularly test, build, and commit working states.
*   **Zustand Source of Truth:** Zustand (`authStore`) remains the app's source of truth for reactive auth state, but its state will be derived from and synchronized with Supabase via `onAuthStateChange`.
*   **Plan Adherence:** Continuously refer back to this plan, `DEV_PLAN.md`, and `STRUCTURE.md` to ensure alignment with architecture and patterns. Collaborate and cross-check assumptions.

---

## Phase 0: Preparation & Planning

*   [x] **Create File:** Create this file: `docs/implementations/20250423112244_Supabase_Auth_Fix.md` (Replace timestamp).
*   [x] **Understand Current State:** Review `packages/store/src/authStore.ts`, specifically the `initialize`, `login`, `register`, and `logout` actions, noting how they currently manage `user`, `session`, `profile`, and `isLoading` state.
    *   Identify direct `localStorage` interactions within `authStore` and plan for their integration/refactoring.
*   [x] **Review Dependencies:**
    *   Confirm how `apiClient` (`packages/api-client/src/apiClient.ts`) accesses the Supabase client (`this.supabase`).
    *   Confirm how `authStore` currently interacts with `apiClient`.
*   [x] **Plan Supabase Client Access:** Decide how the `authStore` listener logic will access the `supabase-js` client instance.
    *   **Option A (Preferred):** Add a getter to `apiClient` (e.g., `api.getSupabaseClient()`) and call the listener setup from `App.tsx` *after* `initializeApiClient` has run.
    *   **Option B (Alternative):** `authStore` creates its own Supabase client (less ideal, potentially duplicates connections/state).
    *   *Decision:* Proceed with Option A.
*   [x] **Update Docs (Initial):** Briefly mention this refactoring effort in `docs/DEV_PLAN.md` under "Current Development Focus".
*   [x] **Commit:** `refactor(auth): begin authStore alignment with Supabase standards`

---

## Phase 1: Listener Setup & Basic State Synchronization

**Goal:** Implement the core `onAuthStateChange` listener and have it manage the initial `isLoading` flag and the `session` state.

*   [x] **1.1 Add Supabase Client Getter to `apiClient`:**
    *   **File:** `packages/api-client/src/apiClient.ts`
    *   **TDD:** (Minimal test needed) Ensure the getter exists and returns the client instance.
    *   **Implement:** Add a public method `getSupabaseClient()` to the `ApiClient` class that returns `this.supabase`. Update the exported `api` object to include this getter.
    *   **Refactor:** N/A.
    *   **Test:** Run related unit test. -> *Tests fixed and passed.*
    *   **Enhance Test Coverage:** Add basic unit tests for `api.post`, `api.put`, and `api.delete` methods in `apiClient.test.ts` to ensure comprehensive coverage of the core request logic. *(Current step)*
*   [x] **1.2 Test Listener Logic:**
    *   **File:** Create `packages/store/src/authStore.listener.test.ts` (or add to existing tests).
    *   **TDD (RED):** Write tests simulating `onAuthStateChange` events (`INITIAL_SESSION` with session, `INITIAL_SESSION` with null, `SIGNED_IN`, `SIGNED_OUT`) and assert that the correct `set` calls are made within the listener callback to update `session` and `isLoading`. Mock the Supabase client and its `auth.onAuthStateChange` method. Mock `set` from Zustand.
*   [x] **1.3 Implement Listener Setup Function:**
    *   **File:** `packages/store/src/authStore.ts`
    *   **TDD (GREEN):** Implement an exported function `initAuthListener(supabaseClient)` that takes a Supabase client instance. Inside this function, set up the `supabaseClient.auth.onAuthStateChange` listener.
    *   **Refactor:** N/A.
    *   **Test:** Run tests from 1.2 - they should now pass.
*   [x] **1.4 Implement Listener Callback Logic (isLoading, session):**
    *   **File:** `packages/store/src/authStore.ts` (within the listener callback created in 1.3).
    *   **TDD (GREEN):** Implement the logic within the callback:
        *   On `INITIAL_SESSION`: Set `session` (to provided session or null). Set `isLoading` to `false`.
        *   On `SIGNED_IN`: Set `session`. Ensure `isLoading` remains `false` (or is already false).
        *   On `SIGNED_OUT`: Set `session` to `null`. Ensure `isLoading` remains `false`.
        *   Handle other events like `TOKEN_REFRESHED` (update session).
        *   *(Within the callback logic for `INITIAL_SESSION` and `SIGNED_IN` with a valid session)*: Trigger the check for and replay of pending actions stored in localStorage (logic to be moved from `login`/`register` in Phase 3).
    *   **Refactor:** N/A.
    *   **Test:** Run tests from 1.2 - they should now pass.
*   [x] **1.5 Integrate Listener Setup:**
    *   **File:** `apps/web/src/App.tsx` (or potentially `main.tsx` if `apiClient` initialization happens there).
    *   **TDD:** (Integration test focus) Ensure the listener is called on app startup.
    *   **Implement:** Find where `initializeApiClient` is called. Immediately after, import `initAuthListener` from `@paynless/store` and `api` from `@paynless/api-client`. Call `initAuthListener(api.getSupabaseClient())`. Ensure this happens early in the app lifecycle, likely within a `useEffect` with an empty dependency array in `AppContent` or similar root component, *after* `apiClient` is initialized.
    *   **Refactor:** N/A.
*   [x] **1.6 Checkpoint 1:**
    *   **Run Unit Tests:** `pnpm test --filter=@paynless/store authStore.listener.test.ts` (or similar). Ensure they pass.
    *   **Run Unit Tests:** `pnpm test --filter=@paynless/api-client apiClient.test.ts` (or similar). Ensure they pass.
    *   **Build App:** `pnpm build`. Ensure it completes successfully.
    *   **Manual Test:** Load the app when logged out. Verify UI renders correctly (no infinite loading spinners). Log in. Log out. Refresh the page while logged in. Verify the app loads correctly and reflects the auth state without excessive delays or spinners (beyond the initial load). Check console for listener logs.
    *   **Commit:** `refactor(auth): implement onAuthStateChange listener for session/loading state (#issue_number)`

---

## Phase 2: Integrating Profile Fetching via Listener

**Goal:** Fetch the user profile (`/me`) automatically when the listener confirms a valid session.

*   [x] **2.1 Test Listener Profile Fetch Logic:**
    *   **File:** `packages/store/src/authStore.listener.test.ts`
    *   **TDD (RED):** Add/modify tests for the listener callback. Simulate `INITIAL_SESSION` or `SIGNED_IN` with a valid session. Mock `api.get('/me')`. Assert that `api.get('/me')` is called. Assert that `set` is called with the correct `profile` data on `/me` success. Assert `error` state is handled on `/me` failure.
*   [x] **2.2 Implement Listener Profile Fetch:**
    *   **File:** `packages/store/src/authStore.ts` (within the listener callback).
    *   **TDD (GREEN):** Modify the callback logic for `INITIAL_SESSION` and `SIGNED_IN`:
        *   If a valid `session` is received:
            *   Call `api.get<UserProfile>('/me', { token: session.access_token })`. *(Note: Still need to pass token explicitly here as this runs before internal state might be ready)*.
            *   On success, call `set({ profile: response.data })`.
            *   On failure, call `set({ error: new Error('Failed to fetch profile'), profile: null })` and log the error.
        *   If `session` is null (e.g., `SIGNED_OUT`, `INITIAL_SESSION` with no session):
            *   Call `set({ profile: null })`.
    *   **Refactor:** N/A.
    *   **Test:** Run tests from 2.1 - ensure they pass.
*   [x] **2.3 Checkpoint 2:**
    *   **Run Unit Tests:** `pnpm test --filter=@paynless/store authStore.listener.test.ts`. Ensure they pass.
    *   **Build App:** `pnpm build`. Ensure it completes successfully.
    *   **Manual Test:** Log in. Refresh the page. Verify profile information (e.g., name in header) appears correctly after the initial load. Log out and log back in, verify profile appears. Check console logs for `/me` calls triggered by the listener.
    *   **Commit:** `refactor(auth): fetch profile via onAuthStateChange listener (#issue_number)`

---

## Phase 3: Refactoring Auth Actions (`login`, `register`, `logout`)

**Goal:** Modify actions to trigger Supabase JS methods and handle only immediate errors/loading, delegating final state updates (`user`, `session`, `profile`) to the listener.

*   [x] **3.1 Test Refactored `login` Action:**
    *   **File:** `packages/store/src/authStore.login.test.ts` (or relevant test file).
    *   **TDD (RED):** Modify tests for the `login` action:
        *   Mock `supabase.auth.signInWithPassword` (requires access to the Supabase client instance - potentially pass it to actions or mock the getter).
        *   Assert `isLoading` is set to `true` at the start and `false` at the end (success or error).
        *   Assert `supabase.auth.signInWithPassword` is called with correct credentials.
        *   Assert that on *success* from `signInWithPassword`, the action *does not* directly call `set` with `user`, `session`, or `profile`.
        *   Assert that on *failure* from `signInWithPassword`, the action *does* call `set` with the appropriate `error` object and `isLoading: false`.
*   [x] **3.2 Implement Refactored `login` Action:**
    *   **File:** `packages/store/src/authStore.ts`
    *   **TDD (GREEN):** Modify the `login` action:
        *   Set `isLoading: true`, `error: null`.
        *   Call `await supabase.auth.signInWithPassword({ email, password })`. (Need access to the client instance).
        *   Remove the previous `api.post('/login')` call and the subsequent manual `set` calls for user/session/profile on success.
        *   In the `catch` block, set `error` state based on the error from `signInWithPassword`.
        *   In a `finally` block (or at end of try/catch), set `isLoading: false`.
        *   *(Keep replay logic for now, but it might need adjustment later)*.
        *   *(Keep navigation logic)*.
    *   **Refactor:** N/A.
    *   **Test:** Run tests from 3.1. Ensure they pass.
*   [x] **3.3 Test Refactored `register` Action:**
    *   **File:** `packages/store/src/authStore.register.test.ts` (or relevant).
    *   **TDD (RED):** Similar to 3.1, but mock `supabase.auth.signUp` and test the `register` action.
*   [x] **3.4 Implement Refactored `register` Action:**
    *   **File:** `packages/store/src/authStore.ts`
    *   **TDD (GREEN):** Similar to 3.2, modify `register` to call `supabase.auth.signUp` and remove manual state setting on success, handling only errors/loading within the action.
    *   **Refactor:** N/A.
    *   **Test:** Run tests from 3.3. Ensure they pass.
*   [x] **3.5 Test Refactored `logout` Action:**
    *   **File:** `packages/store/src/authStore.logout.test.ts` (or relevant).
    *   **TDD (RED):** Modify tests for `logout`:
        *   Mock `supabase.auth.signOut`.
        *   Assert `signOut` is called.
        *   Assert action *does not* directly clear user/session/profile state.
        *   Assert error handling for `signOut` failure.
*   [x] **3.6 Implement Refactored `logout` Action:**
    *   **File:** `packages/store/src/authStore.ts`
    *   **TDD (GREEN):** Modify `logout` action: