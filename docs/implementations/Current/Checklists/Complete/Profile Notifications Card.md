# Profile Notifications Management

This document provides a complete, verified, and end-to-end implementation plan for managing user newsletter subscriptions. This feature has two primary components:
1.  A one-time **Welcome Modal** presented to new users (especially those signing up via OAuth) to give them an explicit opportunity to opt-in to email updates.
2.  A permanent **Notification Settings Card** in the user's profile, allowing them to manage their subscription status at any time.

## Legend

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api` - includes interface definition, implementation, and mocks)
*   `[STORE]` State Management (`@paynless/store` - includes interface definition, actions, etc.)
*   `[UI]` Frontend Component (e.g., in `apps/web`)
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update
*   `[REFACTOR]` Code Refactoring Step
*   `[COMMIT]` Checkpoint for Git Commit

---

## Implementation Plan: Profile Notifications

### Phase 1: Backend and Data Model Foundation

This phase establishes the necessary database schema and backend logic to support the new features.

*   `[✅]` 1. **[DB] Update `user_profiles` Table Schema**
    *   `[✅]` 1.a. **Action:** Create a new SQL migration file.
    *   `[✅]` 1.b. **Details:** Add two `boolean` columns to the `public.user_profiles` table:
        *   `is_subscribed_to_newsletter`: `boolean`, `default false`, `not null`.
        *   `has_seen_welcome_modal`: `boolean`, `default false`, `not null`.

*   `[✅]` 2. **[RLS] Update `user_profiles` Row-Level Security Policy**
    *   `[✅]` 2.a. **Action:** Modify the existing RLS `UPDATE` policy for the `user_profiles` table.
    *   `[✅]` 2.b. **Details:** Add `is_subscribed_to_newsletter` and `has_seen_welcome_modal` to the list of columns that a user is permitted to update for their own profile (`auth.uid() = id`).

*   `[✅]` 3. **[API] Update Shared `Profile` Type Definition**
    *   `[✅]` 3.a. **File:** `packages/types/src/auth.types.ts`
    *   `[✅]` 3.b. **Action:** Add the corresponding new properties to the `UserProfile` and `UserProfileUpdate` types.
    *   `[✅]` 3.c. **Note:** This was completed by running the type generation script and manual updates.

*   `[✅]` 4. **[BE] Enhance Profile Update Logic**
    *   `[✅]` 4.a. **File:** `supabase/functions/me/index.ts`
    *   `[✅]` 4.b. **Action:** Refactor the `POST` handler to use the central `email_service` to manage newsletter subscriptions when the `is_subscribed_to_newsletter` flag is changed.
        *   `[✅]` 4.b.i. The handler will first retrieve the user's current profile to detect a state change in `is_subscribed_to_newsletter`.
        *   `[✅]` 4.b.ii. It will then use the `getEmailMarketingService` factory to get an instance of the correct email provider.
        *   `[✅]` 4.b.iii. When the flag changes from `false` to `true`, it will invoke `emailService.addUserToList(userData)`.
        *   `[✅]` 4.b.iv. When the flag changes from `true` to `false`, it will invoke `emailService.removeUser(email)`.
    *   `[✅]` 4.c. **Note:** This logic already exists in the current implementation of the `me` function.

*   `[✅]` 5. **[API] Update Frontend Profile API Client**
    *   `[✅]` 5.a. **File:** `packages/api/src/users.api.ts`
    *   `[✅]` 5.b. **Action:** Ensure the `updateOwnProfile` function in the `UserApiClient` correctly passes the new boolean flags in the request body to the `/me` edge function.

*   `[✅]` 6. **[TEST-INT] Create Comprehensive Profile Update Integration Tests**
    *   `[✅]` 6.a. **File:** `supabase/functions/me/me.integration.test.ts`
    *   `[✅]` 6.b. **Action:** Write a comprehensive suite of integration tests for the `/me` endpoint's `POST` handler. These tests will validate all updatable profile fields and related side effects.
        *   `[✅]` 6.b.i. **Test Setup:** Ensure a clean test environment with a test user and their profile created before each test. Mock the `email_service` to spy on its methods.
        *   `[✅]` 6.b.ii. **Basic Profile Updates:**
            *   `[✅]` 6.b.ii.1. Test updating `first_name` and `last_name` and verify the changes are persisted correctly.
            *   `[✅]` 6.b.ii.2. Test updating `last_selected_org_id` and verify the change is persisted.
            *   `[✅]` 6.b.ii.3. Test updating `profile_privacy_setting` to each valid value (`private`, `public`, `members_only`) and verify persistence.
            *   `[✅]` 6.b.ii.4. Test updating `chat_context` with a valid JSON object and verify persistence.
        *   `[✅]` 6.b.iii. **Newsletter Subscription Logic:**
            *   `[✅]` 6.b.iii.1. Test changing `is_subscribed_to_newsletter` from `false` to `true`. Assert that `emailService.addUserToList` is called *once* with the correct user data.
            *   `[✅]` 6.b.iii.2. Test changing `is_subscribed_to_newsletter` from `true` to `false`. Assert that `emailService.removeUser` is called *once* with the correct email.
            *   `[✅]` 6.b.iii.3. Test updating the profile with `is_subscribed_to_newsletter: true` when it is already `true`. Assert that `emailService.addUserToList` is *not* called.
            *   `[✅]` 6.b.iii.4. Test updating the profile with `is_subscribed_to_newsletter: false` when it is already `false`. Assert that `emailService.removeUser` is *not* called.
        *   `[✅]` 6.b.iv. **Welcome Modal Flag:**
            *   `[✅]` 6.b.iv.1. Test updating `has_seen_welcome_modal` from `false` to `true` and verify the change is persisted. Assert no email service interaction occurs.
        *   `[✅]` 6.b.v. **Combined Updates & Edge Cases:**
            *   `[✅]` 6.b.v.1. Test updating multiple fields at once (e.g., `first_name`, `last_name`, and `is_subscribed_to_newsletter` to `true`). Verify all changes are persisted and `emailService.addUserToList` is called correctly.
            *   `[✅]` 6.b.v.2. Test sending an empty payload `{}`. The request should succeed and return the unchanged profile.
        *   `[✅]` 6.b.vi. **Security & Authorization:**
            *   `[✅]` 6.b.vi.1. Test making a `POST` request to `/me` without an authentication token. Assert the request fails with a `401 Unauthorized` status.
    *   `[✅]`   6.c. **TDD GREEN** Verify that all the tests pass. 

### Phase 2: Frontend - Welcome Modal

This phase implements the one-time modal for new users.

*   `[✅]` 7. **[UI] Create `WelcomeModal` Component**
    *   `[✅]` 7.a. **File:** `apps/web/src/components/modals/WelcomeModal.tsx`
    *   `[✅]` 7.b. **Details:** The component will check if the user is already subscribed, and not display itself for the first time if the user's `is_subscribed_to_newsletter` is already true. 
    *   `[✅]` 7.c. **Details:** The component will contain a welcome message, a `Checkbox` for the newsletter opt-in (checked by default), and a "Continue" `Button`.

*   `[✅]` 8. **[TEST-UNIT] Create `WelcomeModal` Unit Tests**
    *   `[✅]` 8.a. **File:** `apps/web/src/components/modals/WelcomeModal.test.tsx`
    *   `[✅]` 8.b. **Action:** Write tests to verify the component renders correctly and that interacting with the checkbox and button calls the appropriate `authStore` action.

*   `[✅]` 9. **[STORE] Update `authStore` for Modal Lifecycle**
    *   `[✅]` 9.a. **File:** `packages/store/src/authStore.ts`
    *   `[✅]` 9.b. **State:** Add `showWelcomeModal: boolean` to the `AuthState`, default `false`.
    *   `[✅]` 9.c. **Action:** Create a new action, `updateSubscriptionAndDismissWelcome(subscribe: boolean)`. This action will:
        *   `[✅]` Call the `updateProfile` method with `has_seen_welcome_modal: true` and `is_subscribed_to_newsletter: subscribe`.
        *   `[✅]` Set `showWelcomeModal` to `false` in the store state upon success.
    *   `[✅]` 9.d. **[TEST-UNIT]** Add unit tests for this new action.

*   `[✅]` 10. **[UI] Implement Modal Trigger Logic**
    *   `[✅]` 10.a. **File:** `apps/web/src/App.tsx`.
    *   `[✅]` 10.b. **Action:** Use a `useEffect` hook that listens for changes to `authStore.profile`.
    *   `[✅]` 10.c. **Logic:** If `profile` is loaded and `profile.has_seen_welcome_modal === false`, set `authStore.setState({ showWelcomeModal: true })`.
    *   `[✅]` 10.d. **[TEST-UNIT]** Add unit tests for this new logic.

### Phase 3: Frontend - Profile Management Card

This phase implements the permanent setting for users to manage their subscription.

*   `[✅]` 11. **[UI] Create `NotificationSettingsCard` Component**
    *   `[✅]` 11.a. **File:** `apps/web/src/components/profile/NotificationSettingsCard.tsx`
    *   `[✅]` 11.b. **Details:** The component will be a UI card containing a `Switch` control. The label for the switch will be "System notices and updates". Its `checked` state will be bound to `authStore.profile.is_subscribed_to_newsletter`.

*   `[✅]` 12. **[TEST-UNIT] Create `NotificationSettingsCard` Unit Tests**
    *   `[✅]` 12.a. **File:** `apps/web/src/components/profile/NotificationSettingsCard.test.tsx`
    *   `[✅]` 12.b. **Action:** Write tests to verify the switch correctly reflects the store's state and that toggling it calls the correct action.

*   `[✅]` 13. **[STORE] Add `toggleNewsletterSubscription` Action to `authStore`**
    *   `[✅]` 13.a. **File:** `packages/store/src/authStore.ts`
    *   `[✅]` 13.b. **Action:** Create `toggleNewsletterSubscription(isSubscribed: boolean)`. This action will call the `updateProfile` method, passing the new `is_subscribed_to_newsletter` value.
    *   `[✅]` 13.c. **[TEST-UNIT]** Add unit tests for this new action.

*   `[✅]` 14. **[UI] Integrate Card into Profile Page**
    *   `[✅]` 14.a. **File:** `apps/web/src/pages/Profile.tsx`
    *   `[✅]` 14.b. **Action:** Import and render the `<NotificationSettingsCard />` component within the page layout.

### Phase 4: Finalization and Verification

*   `[ ]` 15. **[TEST-E2E] Create End-to-End Tests**
    *   `[ ]` 15.a. **Scenario 1 (New User):** A new user signs up with Google, is redirected to the dashboard, sees the welcome modal, accepts the newsletter, and verifies the setting is "on" in their profile page.
    *   `[ ]` 15.b. **Scenario 2 (Existing User):** An existing user navigates to their profile page, toggles the notification switch off, reloads the page to confirm it's still off, then toggles it back on.

*   `[ ]` 16. **[DOCS] Update User Documentation**
    *   `[ ]` 16.a. **Action:** If applicable, update any user-facing guides or FAQs to explain how to manage notification settings.

*   `[ ]` 17. **[COMMIT] Final Commit**
    *   `[ ]` 17.a. **Action:** Commit all changes using a conventional commit message, e.g., `feat(user): implement newsletter subscription management`.
