# Implementation Plan: Refactor SIGNED_IN Event Handling (2025-04-30)

## 1. Problem Statement

The application currently uses Supabase's `onAuthStateChange` listener to manage user sessions. The `SIGNED_IN` event fires every time Supabase confirms a user session is active, which includes:
*   Initial sign-in after login/signup.
*   Session validation when switching browser tabs or refocusing the window.
*   Background token refreshes.

This causes several issues:
1.  **Unnecessary Navigation:** Logic intended for the *initial* sign-in (like checking for a replay URL or navigating to the dashboard) is triggered on every tab switch, potentially interrupting the user's workflow by redirecting them unexpectedly.
2.  **Excessive Data Fetching:** Initial data fetching (profile, notifications, subscriptions, organizations) is triggered repeatedly on session validation.
3.  **Redundant Subscriptions:** Real-time subscriptions (e.g., for notifications) might be re-established unnecessarily.

This leads to a poor user experience due to unexpected redirects and significant unnecessary network traffic. The goal is to differentiate the *initial* sign-in event from subsequent validations.

## 2. Proposed Solution: State Tracking

The core solution is to introduce a piece of state within the application (`authStore`) that tracks whether the *initial* sign-in process for the current application lifecycle (i.e., this browser tab instance) has been completed.

*   **New State Variable:** Introduce a boolean flag in `authStore`, named `isInitialAuthProcessed`, initialized to `false`.
*   **Refined Listener Logic:** Modify the `onAuthStateChange` callback:
    *   **On `SIGNED_IN`:**
        *   If `isInitialAuthProcessed` is `false`: This is the *first* sign-in. Perform all initial setup (update user state, check replay, navigate to replay/dashboard, fetch initial data, set up subscriptions), then set `isInitialAuthProcessed` to `true`.
        *   If `isInitialAuthProcessed` is `true`: This is a subsequent validation. Only update the user/session object if necessary. **Do not** navigate, fetch initial data, or re-subscribe.
    *   **On `SIGNED_OUT`:** Clear user state, unsubscribe, navigate to login, and importantly, **reset `isInitialAuthProcessed` to `false`**.
    *   **Other Events (`TOKEN_REFRESHED`, `USER_UPDATED`):** Handle minimally (e.g., update session, potentially refresh profile on `USER_UPDATED`). Do not trigger full initial setup or navigation.

## 3. Rationale & Maintaining Source of Truth

This approach represents a reasonable compromise:

*   **Supabase Remains Auth Source:** Core authentication state (user identity, session validity) is still solely determined by Supabase via the listener.
*   **`isInitialAuthProcessed` is App Lifecycle State:** This flag tracks the application's *internal* setup state for the current browser session, not authentication status itself. It adds context missing from the `SIGNED_IN` event.
*   **Standard Pattern:** This is a common way to handle ambiguous real-time auth events.

It respects Supabase as the auth authority while allowing the application to intelligently manage its one-time setup processes.

## 4. Detailed Implementation Plan

**(Management Strategy:** Use a dedicated feature branch, follow this plan as a checklist, commit incrementally, review code, and test thoroughly before merging.)

*   **[ ] Step 4.1: Update `authStore` State & Actions (`packages/store/src/authStore.ts`)**
    *   Add `isInitialAuthProcessed: boolean` to state type.
    *   Initialize `isInitialAuthProcessed` to `false` in `initialState`.
    *   Add internal action: `_setInitialAuthProcessed(processed: boolean): void`.
    *   Add selector: `selectIsInitialAuthProcessed(): boolean`.

*   **[ ] Step 4.2: Refactor `onAuthStateChange` Listener Callback (e.g., in `App.tsx` or `useAuthListener.ts`)**
    *   Import actions/selectors from `authStore`.
    *   In `SIGNED_IN` handler:
        *   Get `isInitialAuthProcessed` state.
        *   `if (!isInitialAuthProcessed)` block:
            *   Keep/centralize: Update user state.
            *   Keep/centralize: Check/navigate replay URL.
            *   Keep/centralize: Navigate dashboard (if no replay).
            *   Keep/centralize: Trigger initial data fetches (profile, notifications, etc.).
            *   Keep/centralize: Trigger subscription setup.
            *   **Add:** Call `_setInitialAuthProcessed(true)`.
        *   `else` block:
            *   Keep/Review: Update user state (if needed).
            *   **Remove:** Navigation, initial fetches, subscription setup triggers.
    *   In `SIGNED_OUT` handler:
        *   Keep: Existing cleanup logic.
        *   **Add:** Call `_setInitialAuthProcessed(false)`.
        *   **Add:** (See Step 4.3.8) Trigger clearing of organization store persistence.

*   **[ ] Step 4.3: Implement Organization Preference Persistence**
    *   **[ ] Step 4.3.1 (DB):** Add `last_selected_org_id` (UUID, nullable, FK to `organizations.id`) column to `user_profiles` table. Create and test Supabase migration script.
    *   **[ ] Step 4.3.2 (Backend):** Create/Update backend endpoint (e.g., in `user-profile` function or a new `preferences` function) to handle `PUT /users/me/preferences` or similar, allowing authenticated users to update their `last_selected_org_id` in the `user_profiles` table. Ensure proper RLS allows users to update their own profile.
    *   **[ ] Step 4.3.3 (API Client):** Add/Update API client method (e.g., in `@paynless/api` -> `UserApiClient` or a new `PreferencesApiClient`) to call the endpoint from Step 4.3.2.
    *   **[ ] Step 4.3.4 (Auth/User Store):** Ensure the initial user profile fetch action (triggered after initial `SIGNED_IN` in Step 4.2) retrieves the `last_selected_org_id` field.
    *   **[ ] Step 4.3.5 (Organization Store - Init):** Modify `organizationStore` initialization logic. This might involve listening to changes in the user profile state (from `authStore` or a dedicated `userStore`). When the profile (including `last_selected_org_id`) loads after login, set `currentOrganizationId` in `organizationStore` to this value if it exists.
    *   **[ ] Step 4.3.6 (Organization Store - Persist):** Configure the `persist` middleware for `organizationStore`. 
        *   Persist *only* the `currentOrganizationId` state slice to `localStorage`.
        *   Use a simple, static storage key (e.g., `organization-store-selection`).
    *   **[ ] Step 4.3.7 (Organization Store - Update):** Modify the `setCurrentOrganizationId` action in `organizationStore`:
        *   Update the local state (`currentOrganizationId`) as it does now (this will trigger the persist middleware).
        *   If the user is authenticated, trigger the API client method (from Step 4.3.3) to update the `last_selected_org_id` in the backend database.
    *   **[ ] Step 4.3.8 (Auth Store - Logout Trigger):** In the `SIGNED_OUT` handler refactored in Step 4.2, add a call to clear the persisted `organizationStore` state. This might involve importing `useOrganizationStore` and calling `useOrganizationStore.persist.clearStorage()`.

*   **[ ] Step 4.4: Review Data Fetching Actions (Other Stores)**
    *   *Enhancement:* Consider adding checks within fetch actions (`fetchProfile`, etc.) to prevent re-fetching if data is already present and fresh (e.g., based on timestamp or simple presence check).

*   **[ ] Step 4.5: Clean Up Old/Competing Logic**
    *   Search codebase (esp. `useEffect` hooks in components) for redundant logic triggered by auth state changes (navigation, data fetching, subscriptions). Also look for any old logic attempting to persist organization selection.
    *   Remove/comment out redundant logic, ensuring the listener and stores are the single points of control.

*   **[ ] Step 4.6: Update Tests**
    *   Update `authStore` tests for new flag/action/logout clearing trigger.
    *   **Add:** Update/Add tests for the backend preferences endpoint.
    *   **Add:** Update/Add tests for the API client preferences method.
    *   **Add:** Update `organizationStore` tests:
        *   Verify initialization from fetched preference.
        *   Verify `setCurrentOrganizationId` calls the backend update API.
        *   Verify persistence configuration and clearing on logout trigger.
    *   Update integration/component tests for login/logout flows to mock/verify the flags, preference fetching/setting, and ensure actions run only on the *first* simulated `SIGNED_IN`.
    *   Ensure logout tests verify flag reset and organization persistence clearing.

*   **[ ] Step 4.7: Verification & Testing (Manual & Automated)**
    *   Test login (with/without replay), signup, logout, session persistence (close/reopen tab).
    *   Critically verify navigation and data fetching behavior on tab switching/window focus changes (should *not* trigger initial setup).
    *   **Add:** Verify organization selection:
        *   Select Org A -> Refresh -> Org A should still be selected.
        *   Select Org B -> Close Tab -> Reopen Tab -> Login -> Org B should be selected (from backend pref).
        *   Select Org C -> Logout -> Login as different user -> Different user's preference (or null) should be selected, *not* Org C.
        *   Test edge cases (e.g., user has no preference set yet).
    *   Ensure all automated tests pass.

*   **[ ] Step 4.8: Documentation**
    *   Add comments explaining the `isInitialAuthProcessed` logic in the listener.
    *   **Add:** Document the `last_selected_org_id` preference storage and update flow.
    *   **Add:** Explain the interaction between backend preference and client-side persistence for `currentOrganizationId`.
    *   Update relevant architecture docs if needed. 