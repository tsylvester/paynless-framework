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

*   **[ ] Step 4.3: Review Data Fetching Actions (Other Stores)**
    *   *Enhancement:* Consider adding checks within fetch actions (`fetchProfile`, etc.) to prevent re-fetching if data is already present and fresh (e.g., based on timestamp or simple presence check).

*   **[ ] Step 4.4: Clean Up Old/Competing Logic**
    *   Search codebase (esp. `useEffect` hooks in components) for redundant logic triggered by auth state changes (navigation, data fetching, subscriptions).
    *   Remove/comment out redundant logic, ensuring the listener is the single point of control for initial setup.

*   **[ ] Step 4.5: Update Tests**
    *   Update `authStore` tests for new flag/action.
    *   Update integration/component tests for login/logout flows to mock/verify the flag and ensure actions run only on the *first* simulated `SIGNED_IN`.
    *   Ensure logout tests verify the flag reset.

*   **[ ] Step 4.6: Verification & Testing (Manual & Automated)**
    *   Test login (with/without replay), signup, logout, session persistence (close/reopen tab).
    *   Critically verify navigation and data fetching behavior on tab switching/window focus changes (should *not* trigger initial setup).
    *   Ensure all automated tests pass.

*   **[ ] Step 4.7: Documentation**
    *   Add comments explaining the `isInitialAuthProcessed` logic in the listener.
    *   Update relevant architecture docs if needed. 