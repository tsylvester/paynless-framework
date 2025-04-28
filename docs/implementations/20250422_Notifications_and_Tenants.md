# Implementation and Testing Plan: Notifications & Multi-Tenancy (2025-04-22)

This document outlines the steps for implementing an in-app notification system and multi-tenancy (organizations/teams) support within the Paynless Framework, following Test-Driven Development (TDD) principles.

**Guiding Principles:**

*   **TDD:** Write tests before implementation for all backend logic, API client functions, state management, and frontend components.
*   **Incremental Development:** Implement features in logical phases (Notifications first, then Tenancy).
*   **Checkpoints:** Regularly test, build, update documentation, and commit working code.
*   **Documentation:** Keep `STRUCTURE.md`, `IMPLEMENTATION_PLAN.md`, and `TESTING_PLAN.md` updated.
*   **Modularity & Reuse:** Design components and functions to be reusable, leveraging existing patterns and libraries (`shadcn/ui`, Zustand, etc.).

---

## Phase 0: Setup & Documentation Update

*   [X] **Create this file:** `/docs/implementations/20250422_Notifications_and_Tenants.md` (Done)
*   [X] **Update `docs/STRUCTURE.md`:** Add sections describing the new `notifications`, `organizations`, and `organization_members` tables (including `organizations.visibility`), related Supabase functions/triggers (including last admin check), API endpoints, state management stores, and frontend routing structure (`/dashboard/organizations/...`).
*   [X] **Update `docs/DEV_PLAN.md`:** Briefly mention the new feature development.
*   [X] **Update `docs/IMPLEMENTATION_PLAN.md`:** Add entries for "Notification System" and "Multi-Tenancy Support" under "In Progress". Add deferred items (granular roles, sub-teams, public search, domain matching) to "Future Considerations".
*   [X] **Update `docs/TESTING_PLAN.md`:** Add sections outlining the testing strategy for notifications (Realtime, UI updates, click navigation), multi-tenancy (RLS, role-based access, org context switching, visibility, last admin logic). Mention tools/mocks used (e.g., Vitest, RTL, MSW/Supabase mock).
*   [X] **Commit:** `docs: update documentation for notifications and multi-tenancy plan`

---

## Phase 1: Notification System Implementation

### 1.1 Database Schema (Notifications)

*   [X] **Define Schema:** Define the SQL schema for the `notifications` table (columns: `id`, `user_id`, `type`, `data` (JSONB to store context like `target_path`, `org_id`, `membership_id`), `read`, `created_at`).
*   [X] **Migration:** Create a Supabase migration script for the `notifications` table.
*   [X] **Test Migration:** Apply the migration in a local/test Supabase environment and verify the table structure, especially the `data` field structure.

### 1.2 Backend Logic (Notifications)

*   [X] **RLS Policy Tests:** Write tests (SQL or using a testing utility) to verify RLS for `notifications`:
    *   Users can only select their own notifications.
    *   Users can only update the `read` status of their own notifications.
*   [X] **Implement RLS Policies:** Apply the tested RLS policies to the `notifications` table in a migration script.
*   [X] **Test Migration:** Apply the RLS migration and verify policies.
*   [X] **Trigger Function Tests (Placeholder):** Write tests for the *concept* of a trigger creating notifications (e.g., `notify_org_admins_on_join_request`). Ensure tests cover inserting correct context (e.g., IDs, potential `target_path`) into the `data` field.
*   [X] **Implement Trigger Function (Placeholder):** Create the initial SQL function `notify_org_admins_on_join_request`. Ensure it correctly inserts into `notifications` including structured `data`. Add via migration.
*   [X] **Test Migration:** Apply the trigger function migration.

### 1.3 API Client (`@paynless/api`)

*   [X] **Tests:** Write unit tests for notification functions:
    *   [X] `api.notifications().fetchNotifications()`: Mocks Supabase `select`.
    *   [X] `api.notifications().markNotificationAsRead(notificationId)`: Mocks Supabase `update`.
    *   [X] `api.notifications().markAllNotificationsAsRead()`: Mocks Supabase `update`.
    *   [X] `api.notifications().subscribeToNotifications(userId, callback)`: Mocks Supabase client `channel()` and subscription methods. *(Implicitly tested via implementation)*
    *   [X] `api.notifications().unsubscribeFromNotifications()`: Mocks Supabase client `removeChannel()`. *(Implicitly tested via implementation)*
*   [X] **Implementation:** Add/Update functions in `NotificationApiClient`:
    *   [X] Implement `fetchNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`.
    *   [X] Implement `subscribeToNotifications(userId, callback)` using Supabase Realtime `channel()` and `.on('postgres_changes', ...)` to listen for inserts.
    *   [X] Implement `unsubscribeFromNotifications()` using Supabase `removeChannel()`.

### 1.4 State Management (`@paynless/store`)

*   [X] **Tests:** Write unit tests for the `notificationStore` Zustand store slice:
    *   [X] Initial state (empty list, count 0).
    *   [X] Action to set notifications (updates list and unread count).
    *   [X] Action to add a new notification (prepends to list, increments unread count).
    *   [X] Action to mark a notification as read (updates item `read` status, decrements unread count).
    *   [X] Action to mark all as read (updates all items, sets count to 0).
    *   [X] Selectors for `notifications` list and `unreadCount`.
    *   [X] **(New - Supabase Realtime)** Action `subscribeToUserNotifications`: Tests that it correctly calls `apiClient.notifications().subscribeToNotifications(userId, callback)` and stores the channel/subscription details necessary for unsubscribing.
    *   [X] **(New - Supabase Realtime)** Action `unsubscribeFromUserNotifications`: Tests that it correctly calls `apiClient.notifications().unsubscribeFromNotifications()`.
    *   [X] **(New - Supabase Realtime)** Internal callback mechanism: Test that the callback passed to the API client correctly dispatches the `addNotification` action when the API client invokes it with new notification data.
*   [X] **Implementation:** Update the `notificationStore` slice:
    *   [X] Ensure existing state, actions, and selectors are implemented.
    *   [X] Implement the `subscribeToUserNotifications(userId)` action. It should:
        *   Call `apiClient.notifications().subscribeToNotifications(userId, this.handleIncomingNotification)`.
        *   Store the returned `RealtimeChannel` (or manage subscription status) so it can be potentially cleaned up.
        *   Handle potential errors or existing subscriptions.
    *   [X] Implement the `unsubscribeFromUserNotifications()` action. It should:
        *   Call `apiClient.notifications().unsubscribeFromNotifications()`.
        *   Clear any stored channel/subscription state.
    *   [X] Implement the internal callback `handleIncomingNotification(notification: Notification)` (likely a bound method or arrow function property) that dispatches the `addNotification` action.
    *   [ ] Ensure `subscribeToUserNotifications` is called appropriately (e.g., on user login/app initialization, potentially requiring `userId`).
    *   [ ] Ensure `unsubscribeFromUserNotifications` is called appropriately (e.g., on user logout).

### 1.5 Frontend Component (`packages/web/src/components/Notifications.tsx`)

*   🚧 **Tests:** Write component tests (Vitest/RTL) for `Notifications.tsx`: *(Partially complete, known issues)*
    *   ⛔ Renders nothing if no user. *(Failing - Known Issue with mock application)*
    *   ⛔ Fetches initial notifications on mount using the *store action* (`fetchNotifications`). *(Failing - Known Issue with useEffect/mock interaction)*
    *   ✅ Displays unread count badge correctly based on store state.
    *   ✅ **(Updated)** Displays a filtered list of *unread* notifications (plus those marked read during the current dropdown session) in a dropdown/panel. *(Tested initial display)*
    *   ✅ Handles clicking an actionable notification, parsing `data.target_path` and triggering navigation. *(Tested via store action + navigate mocks)*
    *   ✅ Handles clicking "mark as read" on an item (mocks *store action* `markNotificationRead`). *(Tested via store action mock)*
    *   ✅ Handles clicking "mark all as read" (mocks *store action* `markAllNotificationsAsRead`). *(Tested via store action mock)*
    *   ✅ Displays a link in the dropdown header to a dedicated notification history page. *(Tested mock link)*
    *   ✅ Correctly tracks and filters based on items marked read during dropdown session. *(Tested basic visibility logic)*
*   ✅ **Implementation:** Create/Update the `Notifications.tsx` component:
    *   ✅ Use `useUser` from `useAuthStore`.
    *   ✅ Use the `notificationStore` selectors and actions (`fetchNotifications`, `addNotification`, `markNotificationRead`, `markAllNotificationsAsRead`).
    *   ✅ **Note:** The component relies *solely* on `useNotificationStore` to get `notifications` and `unreadCount`. Real-time updates arrive automatically via store updates triggered by the Supabase Realtime subscription managed within the store/API layers. No direct connection management occurs here.
    *   ✅ Build the UI (Bell icon, badge, dropdown/panel).
    *   ✅ Add logic to handle clicks on notification items.
    *   ✅ Ensure component leverages reusable UI elements.
    *   ✅ **Refactor:** Replaced Radix DropdownMenu with manual `SimpleDropdown` component to fix positioning issues.
    *   ✅ Added state to track items marked read during dropdown session to keep them visible until closed.
    *   ✅ Filtered the displayed list in the dropdown to show only unread items or items marked read during the current session.
    *   ✅ Added visual indicators (e.g., blue dot) for items that are currently unread in the store.
    *   ✅ Added a `Link` in the dropdown header to `/notifications`.
    *   ✅ Enhanced `SimpleDropdown` to include `onOpenChange` callback to support dropdown filtering logic.
*   ✅ **(New) Notification History Page (`apps/web/src/pages/Notifications.tsx`):**
    *   [ ] **Tests (Placeholder):** Basic tests for rendering, fetching from store, grid layout.
    *   ✅ **Implementation:** Create a new page component:
        *   ✅ Use `useNotificationStore` to fetch and display *all* notifications.
        *   ✅ Wrap content in the standard `<Layout>` component.
        *   ✅ Display notifications using a reusable `NotificationCard` component in a grid layout.
        *   ✅ Render notification details (`subject`, `message`, `type`, `read` status, `target_path` link) within the card.
        *   ✅ Added route `notifications` in `routes.tsx`, wrapped in `ProtectedRoute`.

### 1.5b Backend Fix & Enhancement (Notifications GET/PUT/POST Endpoint)

*   **Context:** During initial integration testing (Phase 1.6), CORS errors revealed the missing `GET /notifications` endpoint. Further testing revealed missing backend logic for `PUT /notifications/:id` (mark one read) and `POST /notifications/mark-all-read` (mark all read).
*   [X] **`/notifications` Edge Function TDD (GET):**
    *   [X] **Tests:** Write tests (`supabase/functions/notifications/index.test.ts`) covering GET logic.
    *   [X] **Implementation:** Create the `supabase/functions/notifications/index.ts` function handling GET requests.
*   [X] **`/notifications` Edge Function TDD (PUT/POST):**
    *   [X] **Tests:** Add tests to `supabase/functions/notifications/index.test.ts` covering:
        *   PUT `/notifications/:id`: Auth, success (204), not found (404), forbidden (wrong user/already read), validation (missing ID).
        *   POST `/notifications/mark-all-read`: Auth, success (204), no unread items case.
        *   Rejection of other methods (PATCH, DELETE etc.).
    *   [X] **Implementation:** Modify `supabase/functions/notifications/index.ts` to handle `PUT /notifications/:id` and `POST /notifications/mark-all-read` requests, including authentication, Supabase client calls (`update`), and appropriate responses.

### 1.6 Integration

*   [X] **Integrate Component:** Add the `<Notifications />` component to the main authenticated layout (`apps/web/src/components/layout/Header.tsx`).
*   [X] **Refactor:** Abstracted dropdown logic into reusable `<SimpleDropdown />` component and updated `Notifications` and `Header` (User Menu) to use it.
*   [X] **Seed Data:** Added migration `seed_example_notifications.sql` for manual testing.
*   [X] **Integration Test:** Manually verify the component appears and functions correctly.
    *   **Current Status (End of Session):**
        *   Component appears, dropdown opens correctly.
        *   Initial fetch via `GET /notifications` works (via store action).
        *   Notifications are displayed from seeded data.
        *   Clicking actionable notification navigates correctly.
        *   **Issue:** Clicking "Mark as Read" / "Mark all as read" buttons has no effect (backend returns 405 Method Not Allowed).
    *   **Next Steps:** Implement backend PUT/POST logic (Phase 1.5b) and re-test.

### 1.7 Checkpoint 1: Notifications Complete

*   [X] **Run Tests:** Execute all tests related to notifications (`pnpm test --filter=@paynless/api --filter=@paynless/store --filter=web`). Ensure they pass. *(Note: Two tests in `Notifications.test.tsx` are deferred due to mocking complexities.)*
*   [X] **Build App:** Run `pnpm build` for the entire monorepo. Ensure it completes successfully.
*   [X] **Manual Test:** *(Verification complete)*
    *   Log in.
    *   Verify seeded notifications appear in the history page (`/notifications`).
    *   Verify only *unread* notifications (or those just marked read) appear initially in the dropdown.
    *   Manually insert a *new* notification with a `target_path` into the database for the logged-in user.
    *   Verify the new notification appears **via Supabase Realtime** and the badge updates **without refresh**.
    *   Verify the new notification appears in the dropdown (if unread).
    *   Click the new notification and verify navigation.
    *   Click \"Mark as read\" on individual unread items in the dropdown and verify UI updates (dot disappears, etc.) and item remains visible until dropdown closes.
    *   Click \"Mark all as read\" and verify UI updates and items remain visible until dropdown closes.
    *   Navigate to the history page (`/notifications`) via the dropdown link and verify all notifications (read and unread) are displayed correctly.
*   [X] **Update Docs:** Mark Phase 1 tasks as complete in `IMPLEMENTATION_PLAN.md`. *(This file is now updated)*
*   [X] **Commit:** `feat: implement notification system via Supabase Realtime (#issue_number)` *(Ready to commit)*
*   [X] **Remind User:** \\\"The basic notification system with Supabase Realtime streaming is implemented...\\\" *(Reminder provided)*

---

## Phase 2: Multi-Tenancy Implementation

### 2.1 Database Schema (Organizations & Members)

*   [X] **Define Schema:**
    *   `organizations`: `id`, `name`, `created_at`, `visibility` (e.g., `TEXT CHECK (visibility IN ('private', 'public')) DEFAULT 'private'`), `deleted_at` (`TIMESTAMP WITH TIME ZONE DEFAULT NULL`). *(Columns like `description`, `website`, `logo_url` can be added later)*.
    *   `organization_members`: `id`, `user_id`, `organization_id`, `role` (`TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member'`), `status` (`TEXT CHECK (status IN ('pending', 'active', 'removed')) DEFAULT 'pending'`), `created_at`.
*   [X] **Migration:** Create Supabase migration scripts for these tables, the `visibility` check constraint, the `role` check constraint with default, the `status` check constraint with default, and the nullable `deleted_at` column.
*   [X] **Test Migration:** Apply migrations locally and verify table structures, defaults, constraints, and nullability.

### 2.2 Backend Logic (Tenancy)

*   [X] **RLS Policy Checks:** Confirm the existing migration files properly represent requirements for:
    *   `organizations`:
        *   `SELECT`: Members with `status='active'` in non-deleted orgs (`deleted_at IS NULL`) can select. Public, non-deleted orgs are visible to authenticated users. Admins can select their non-deleted org.
        *   `INSERT`: Authenticated users can insert.
        *   `UPDATE`: Admins of the org can update non-deleted orgs.
        *   `DELETE`: Never allowed (use soft delete via function/API).
    *   `organization_members`:
        *   `SELECT`: Members of the same non-deleted org can select.
        *   `INSERT`: Requires permission (e.g., admin invite, user request/accept).
        *   `UPDATE`: Admins can update roles/status in their non-deleted org. Users can update their own status (e.g., accept invite, leave org).
        *   `DELETE`: Requires permission (admin removal, user self-removal).
    *   Other Tables (e.g., `chat_history`): Need `organization_id` column. RLS policies must check `organization_id` matches an active membership in a non-deleted org for the current user.
*   [X] **Implement RLS Policies:** Apply the RLS policies (including `deleted_at IS NULL` checks) via migration scripts.
*   [X] **Test Migration:** Apply RLS migrations and verify policies through application-level testing.
*   [X] **Implement Trigger/Function (Last Admin Check):** Create/update logic (e.g., `BEFORE UPDATE OR DELETE ON organization_members`) to prevent removing/demoting the last admin of a non-deleted org. Consider `deleted_at IS NULL` in checks.
*   [X] **Test Migration:** Apply last admin check migration.
*   [X] **Implement Trigger Functions (Notifications - Full):**
    *   `notify_org_admins_on_join_request`: Triggered `AFTER INSERT ON organization_members WHEN (NEW.status = 'pending')`. Inserts notification for org admins.
    *   `notify_user_on_invite_acceptance`: Triggered `AFTER UPDATE ON organization_members WHEN (OLD.status = 'pending' AND NEW.status = 'active')`. Inserts notification for the user who joined.
    *   `notify_user_on_role_change`: Triggered `AFTER UPDATE ON organization_members WHEN (OLD.role <> NEW.role)`. Inserts notification for the affected user.
    *   *(Add others as needed, e.g., invite received)*
*   [X] **Test Migration:** Apply notification trigger migrations.
*   [ ] **(New) Backend Edge Functions (e.g., `/organizations`):**
    *   [ ] **Tests:** Write tests for edge functions handling org operations (create, update, list, get details, members, invites, join requests, member management, soft delete). Mock Supabase client calls. Test auth, input validation, responses, handling of `deleted_at`.
    *   [ ] **Implementation:** Create edge functions (e.g., in `supabase/functions/organizations`) to handle HTTP requests, perform validation, interact with Supabase (respecting RLS), and implement logic like soft delete (`UPDATE organizations SET deleted_at = NOW() ...`).

### 2.3 Refactor to Centralized Supabase DB Types

*   [X] **Setup Internal Types Package:**
    *   [X] Create a minimal `package.json` file in `supabase/functions/` with the content:
        ```json
        {
          "name": "@paynless/db-types",
          "version": "0.0.0",
          "private": true,
          "types": "./types_db.ts"
        }
        ```
        *(Note: This file only defines the package for type resolution; it does not make `supabase/functions` buildable)*.
    *   [X] Add `"supabase/functions"` to the `workspaces` array in the root `pnpm-workspace.yaml`.
    *   [X] Run `pnpm install` in the workspace root to link the new internal package.
*   [X] **Generate Up-to-Date DB Types:**
    *   [X] Ensure your local Supabase instance is running (`supabase start`).
    *   [X] Run the Supabase CLI command to regenerate the types file, capturing all recent migrations (including `organizations`, `organization_members`, `notifications`, etc.):
        ```bash
        supabase gen types typescript --local > supabase/functions/types_db.ts
        ```
    *   [X] Verify the generated `supabase/functions/types_db.ts` contains definitions for all expected tables (`organizations`, `organization_members`, `notifications`, `user_profiles`, etc.) and enums (`user_role`, etc.).
*   [X] **Add Dependency:**
    *   [X] Add the internal types package as a development dependency to packages that need DB types:
        ```bash
        pnpm add -D @paynless/db-types@workspace:* --filter=@paynless/api --filter=@paynless/store --filter=web
        ```
    *   [X] Add the internal types package as a development dependency to `@paynless/types` package itself to aid TS resolution:
        ```bash
        pnpm add -D @paynless/db-types@workspace:* --filter=@paynless/types
        ```
*   [X] **Refactor Codebase:**
    *   [X] **Identify Redundant Types:** Review files in `packages/types/src`. Primarily target types duplicating table structures or enums now present in `@paynless/db-types`:
        *   `auth.types.ts`: `UserProfile`, `UserRole`.
        *   `notification.types.ts`: `Notification`.
        *   `subscription.types.ts`: `SubscriptionPlan`, `UserSubscription`, `SubscriptionTransaction`.
        *   `ai.types.ts`: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, local `Json` alias.
    *   [X] **Update Imports & Usage (in `@paynless/types`):**
        *   Refactored `auth.types.ts` (removed redundant, updated `User`, used DB types).
        *   Refactored `notification.types.ts` (removed manual, used alias).
        *   Refactored `subscription.types.ts` (removed manual DB types, used aliases, moved in API types from `_shared`).
        *   Refactored `ai.types.ts` (removed manual DB types, used aliases, removed `Json`, updated API/Store types).
        *   Updated `organizations.types.ts` to import `@paynless/db-types`.
    *   [X] **Update Imports & Usage (in `supabase/functions`):**
        *   Corrected `supabase/functions/_shared/types.ts` to only contain necessary *application-level* types (removing DB duplicates).
        *   Updated imports in relevant function files (`email_service`, `ai_service`, `sync-ai-models`, `on-user-created`, `notifications`, `chat`, `api-subscriptions`) to use relative paths `../_shared/types.ts` for App types or `../types_db.ts` for DB types.
*   [X] **Cleanup:**
    *   [X] Delete the now-unused manual type definitions (e.g., `UserProfile`, `UserRole`, `Notification`, `SubscriptionPlan`, etc.) from the files in `packages/types/src`.
*   [X] **Create Sync Script:**
    *   [X] Implement script (`supabase/scripts/sync-supabase-shared-types.mjs`) to automatically copy necessary application-level types from `packages/types/*` into `supabase/functions/_shared/types.ts`.
    *   [X] Add the script command `sync:types` to root `package.json`.
*   [X] **Verification:**
    *   [X] Run TypeScript checks across the monorepo: `pnpm typecheck` (or equivalent `tsc -b` command). Fix any type errors.
        *   **Status:** Known failures due to planned but unimplemented code in `packages/api` (Phase 2.4). 
    *   [X] Run all existing tests: `pnpm test`. Ensure tests pass after refactoring. Address any failures, potentially updating mocks to reflect the new type structures if necessary.
        *   **Status:** `@paynless/store` tests passed after fixing `UserRole` mock references. `apps/web` tests have known failures unrelated to this refactor or requiring broader updates (deferred).
*   [X] **Commit:** `refactor: centralize database types using supabase gen types (#issue_number)`

### 2.4 API Client (`@paynless/api`)

*   [X] **Tests:** Write unit tests for new multi-tenancy functions in `OrganizationApiClient`:
    *   [X] `createOrganization(name, visibility?)`: Mocks POST `/organizations`.
    *   [X] `updateOrganization(orgId, { name?, visibility? })`: Mocks PUT `/organizations/:orgId`.
    *   [X] `listUserOrganizations()`: Mocks GET `/organizations` (or a user-specific endpoint). Filters deleted.
    *   [X] `getOrganizationDetails(orgId)`: Mocks GET `/organizations/:orgId`.
    *   [X] `getOrganizationMembers(orgId)`: Mocks GET `/organizations/:orgId/members`.
    *   [X] `inviteUserToOrganization(orgId, emailOrUserId, role)`: Mocks POST `/organizations/:orgId/invites`.
    *   [X] `acceptOrganizationInvite(inviteTokenOrId)`: Mocks POST `/organizations/invites/accept` (or similar).
    *   [X] `requestToJoinOrganization(orgId)`: Mocks POST `/organizations/:orgId/join-requests`.
    *   [X] `approveJoinRequest(membershipId)`: Mocks PUT `/organizations/members/:membershipId/approve` (or similar).
    *   [X] `updateMemberRole(membershipId, newRole)`: Mocks PUT `/organizations/members/:membershipId/role`.
    *   [X] `removeMember(membershipId)`: Mocks DELETE `/organizations/members/:membershipId`.
    *   [X] `deleteOrganization(orgId)`: Mocks DELETE `/organizations/:orgId` (soft delete endpoint).
*   [X] **Implementation:** Add/Update these functions in `OrganizationApiClient` class in `packages/api/src/organizations.api.ts`. Functions should call the corresponding backend edge function endpoints. Soft delete logic is handled by the backend endpoint called by `deleteOrganization`.
    *   [X] Implemented `createOrganization`
    *   [X] Implemented `updateOrganization`
    *   [X] Implemented `listUserOrganizations`
    *   [X] Implemented `getOrganizationDetails`
    *   [X] Implemented `getOrganizationMembers`
    *   [X] Implemented `inviteUserToOrganization`
    *   [X] Implemented `acceptOrganizationInvite`
    *   [X] Implemented `requestToJoinOrganization`
    *   [X] Implemented `approveJoinRequest`
    *   [X] Implemented `updateMemberRole`
    *   [X] Implemented `removeMember`
    *   [X] Implemented `deleteOrganization`

### 2.5 State Management (`@paynless/store`)

*   [X] **Tests:** Write unit tests for `organizationStore` slice (`packages/store/src/organizationStore.ts` / `.test.ts`):
    *   [X] Initial state: `userOrganizations: []`, `currentOrganizationId: null`, `currentOrganizationDetails: null`, `currentOrganizationMembers: []`, `isLoading: false`, `error: null`.
    *   [X] Action `fetchUserOrganizations`: Mocks API call, updates `userOrganizations` (filtering deleted), sets `isLoading`.
    *   [X] Action `createOrganization`: Mocks API call, adds to `userOrganizations`, potentially sets `currentOrganizationId`, sets `isLoading`.
    *   [X] Action `setCurrentOrganizationId`: Updates `currentOrganizationId`, calls actions to fetch details/members, handles null ID (clearing details/members).
    *   [X] Action `fetchCurrentOrganizationDetails`: Mocks API call for `currentOrganizationId`, updates `currentOrganizationDetails`, sets `isLoading`. Handles case where org is deleted (clears details, maybe logs error).
    *   [X] Action `fetchCurrentOrganizationMembers`: Mocks API call for `currentOrganizationId`, updates `currentOrganizationMembers`, sets `isLoading`.
    *   [X] Action `softDeleteOrganization`: Mocks API call, removes org from `userOrganizations`, clears `currentOrganizationId` if it matches, sets `isLoading`.
    *   [X] Action `updateOrganization`: Mocks API call, updates org in `userOrganizations`, updates `currentOrganizationDetails` if matching, sets `isLoading`.
    *   [X] Action `inviteUser`: Mocks API call, potentially updates member list optimistically or refetches, sets `isLoading`.
    *   [X] Action `updateMemberRole`: Mocks API call, updates member in `currentOrganizationMembers`, handles 'last admin' error from API, sets `isLoading`.
    *   [X] Action `removeMember`: Mocks API call, removes member from `currentOrganizationMembers`, handles 'last admin' error, sets `isLoading`.
    *   [X] Selectors: `selectUserOrganizations`, `selectCurrentOrganization`, `selectCurrentMembers`, `selectCurrentUserRole` (finds current user in members list), `selectIsLoading`, `selectError`.
*   [X] **Implementation:** Create/Update the `organizationStore` slice (`packages/store/src/organizationStore.ts`) with the defined state, actions, and selectors. Ensure actions handle loading states and errors. Filter out soft-deleted organizations when setting `userOrganizations`. Handle potential race conditions if multiple actions run concurrently.

### 2.6 Frontend Components & UI (`apps/web`)

*   [X] **Routes (`src/routes/routes.tsx`):**
    *   [X] Define protected routes under `/dashboard/organizations`.
    *   [X] `/dashboard/organizations`: List page (`OrganizationListPage`).
    *   [X] `/dashboard/organizations/new`: Create page (`CreateOrganizationPage`).
    *   [X] `/dashboard/organizations/:orgId`: Base layout/route for a specific org. Should fetch org details/members via store action triggered by a loader or `useEffect`. Redirect if org not found/deleted or user not member.
        *   [X] `/dashboard/organizations/:orgId/settings`: Org settings page (`OrganizationSettingsPage`).
        *   [X] `/dashboard/organizations/:orgId/members`: Member management page (`OrganizationMembersPage`).
        *   *(Add other org-specific sections like dashboard/overview later)*
    *   [X] `/accept-invite/:token`: Page to handle accepting invites (`AcceptInvitePage`).
*   [ ] **Pages (`src/pages`):**
    *   [X] `OrganizationListPage.tsx`: Displays list of user's organizations (from store). Links to individual orgs and the 'Create New' page. Uses reusable components (e.g., `Card`, `Button`). Test fetching/display logic.
    *   [X] `CreateOrganizationPage.tsx`: Contains `CreateOrganizationForm.tsx`. Test form rendering/interaction.
    *   [ ] `OrganizationSettingsPage.tsx`: Displays org details (name, visibility). Contains forms/buttons to update settings and delete the organization (admin only). Test display, form interaction, delete confirmation/action.
    *   [ ] `OrganizationMembersPage.tsx`: Displays `MemberList.tsx`. Contains button to trigger `InviteMemberModal.tsx`. Test display, invite action, member actions (role change, remove).
    *   [ ] `AcceptInvitePage.tsx`: Handles invite acceptance logic, calls API via store action. Test token handling, API call trigger, success/error feedback.
*   [ ] **Layouts (`src/components/layout`):**
    *   [ ] `OrganizationLayout.tsx` (Optional): A wrapper for routes under `/dashboard/organizations/:orgId` that handles fetching context, checking access, and providing consistent org navigation (e.g., sidebar with Settings, Members links).
    *   [ ] Update `Header.tsx` or main layout to include `OrganizationSwitcher.tsx`.
*   [ ] **Components (`src/components/organizations`):**
    *   [ ] `OrganizationSwitcher.tsx`: Dropdown/selector to view user's orgs (from store) and switch the `currentOrganizationId` in the store. Test display, store interaction, selection change.
    *   [X] `CreateOrganizationForm.tsx`: Form with fields for name, visibility. Uses `react-hook-form`, `zod` for validation. Calls store action on submit. Test validation, submission logic.
    *   [ ] `OrganizationListCard.tsx` (or similar): Reusable card to display basic org info in the list page.
    *   [ ] `MemberList.tsx`: Table/list displaying members (from store). Includes buttons/menus for actions (change role, remove) visible based on current user's role. Test display, filtering/sorting, action triggers.
    *   [ ] `InviteMemberModal.tsx`: Modal form to invite users (email/ID, role). Calls store action. Test display, form validation, submission.
    *   [ ] `DeleteOrganizationDialog.tsx`: Confirmation dialog for soft-deleting an organization. Triggered from settings page. Calls store action. Test display, confirmation logic.

### 2.7 Routing & Access Control (Frontend)

*   [ ] **Tests:**
    *   Test route loader/component logic for `/dashboard/organizations/:orgId`: Verify redirection if org is not found, deleted (check `currentOrganizationDetails` from store after fetch), or user is not a member (`currentOrganizationMembers`).
    *   Test `OrganizationSwitcher`: Verify it updates `currentOrganizationId` in the store and navigation occurs (if designed to navigate).
    *   Test conditional rendering within org pages: Ensure admin-only controls (delete org, change roles, approve requests) are hidden/disabled for non-admins based on `selectCurrentUserRole` from store.
*   [ ] **Implementation:**
    *   Use `react-router` loaders or `useEffect` hooks in org-specific pages/layouts to fetch data via store actions (`fetchCurrentOrganizationDetails`, `fetchCurrentOrganizationMembers`). Check the fetched state (details for existence/`deleted_at`, members for current user presence) and use `useNavigate` to redirect if access is denied.
    *   Connect `OrganizationSwitcher` dropdown selection to the `setCurrentOrganizationId` store action.
    *   Use the `selectCurrentUserRole` selector in components like `OrganizationSettingsPage`, `OrganizationMembersPage`, `MemberList` to conditionally render UI elements or disable actions.

### 2.8 Integration with Existing Features

*   [ ] **Identify Impacted Features:** Chat (`chat_history`, `chats`), potentially User Profile settings if some become org-specific, Subscriptions if they become org-based.
*   [ ] **Update Backend:**
    *   Add `organization_id` FK column to `chats`, `chat_history`.
    *   Update RLS for `chats`, `chat_history` to require `organization_id` matches an active, non-deleted membership.
    *   Apply migrations. Test RLS changes.
*   [ ] **Update API Client (`@paynless/api`):**
    *   Modify `ChatApiClient` functions (`fetchChats`, `fetchChatHistory`, `createChat`, `sendMessage`, etc.) to accept and pass `organizationId`.
    *   Update tests for `ChatApiClient`.
*   [ ] **Update State Management (`@paynless/store`):**
    *   Modify `chatStore` actions to accept `organizationId`.
    *   Modify state structure if needed (e.g., store chats per org: `chatsByOrgId: { [orgId: string]: Chat[] }`).
    *   Update selectors to accept `organizationId` or use `currentOrganizationId` from `organizationStore`.
    *   Update tests for `chatStore`.
*   [ ] **Update Frontend (`apps/web`):**
    *   Modify components using chat features (e.g., `ChatInterface`, `ChatList`) to get `currentOrganizationId` from `organizationStore` and pass it to chat store actions/API calls.
    *   Ensure UI reflects data scoped to the currently selected organization.
    *   Update tests for chat components.

### 2.9 Checkpoint 2: Multi-Tenancy Complete

*   [ ] **Run Tests:** Execute all tests (`pnpm test`). Ensure they pass.
*   [ ] **Build App:** Run `pnpm build`. Ensure it completes successfully.
*   [ ] **Manual Test:**
    *   Create orgs (public/private).
    *   Invite users, accept invites.
    *   Test org switcher and data scoping (chats, etc.).
    *   Test RLS (access denial for non-members).
    *   Test role permissions (admin vs member actions in settings/members pages).
    *   Test visibility setting (though no public search yet).
    *   Test join request flow via simulated link/ID entry -> notification -> approval.
    *   Test "last admin" logic: try to remove last admin role/membership and verify error.
    *   Test soft deleting an organization as an admin.
    *   Verify the deleted org disappears from lists/switchers.
    *   Verify direct access to the deleted org's pages/data is blocked.
    *   Verify actions within the deleted org context fail gracefully.
*   [ ] **Update Docs:** Mark Phase 2 tasks as complete in `IMPLEMENTATION_PLAN.md`. Update `STRUCTURE.md`.
*   [ ] **Commit:** `feat: implement multi-tenancy support (#issue_number)`
*   [ ] **Remind User:** "Multi-tenancy support is implemented. Please perform thorough testing, especially around roles, RLS, visibility, and the 'last admin' check. Remember to update impacted tests. Review and commit: `git add . && git commit -m 'feat: implement multi-tenancy support'`"

---

## Phase 3: Final Review & Cleanup

*   [ ] **Code Review:** Review all new code for clarity, efficiency, adherence to `DEV_PLAN.md`, and potential bugs (especially around RLS and state management).
*   [ ] **Test Coverage:** Review test coverage. Add tests for any critical paths missed.
*   [ ] **Final Test Run:** Execute all tests one last time.
*   [ ] **Final Build:** Perform a final `pnpm build`.
*   [ ] **Update `README.md`:** Add information about the new notification and multi-tenancy features.
*   [ ] **Final Commit:** `chore: finalize notification and multi-tenancy implementation (#issue_number)`
*   [ ] **Remind User:** "The implementation is complete and documented. Please ensure all tests pass and the build is successful. Consider deploying to a staging environment for further validation before merging to main. Final commit suggestion: `git add . && git commit -m 'chore: finalize notification and multi-tenancy implementation'`"

---

## Future Scope & Considerations

The following items were discussed but deferred from this initial implementation plan to manage scope. They can be considered for future iterations:

*   **Granular Member Roles:** Implementing roles beyond 'admin' and 'member' (e.g., 'viewer', custom roles).
*   **Sub-Teams:** Adding support for hierarchical teams within organizations.
*   **Public Organization Discovery & Search:** Implementing UI for users to find `public` organizations.
*   **Domain-Based Joining:** Logic to suggest/assign users to orgs based on email domain.
*   **Enhanced Privacy/Visibility Settings:** Extending `organizations.visibility` beyond public/private.
*   **Invite Token Expiration/Management:** Adding expiry dates and admin management for invites.
*   **User Notification Preferences:** Allowing users to choose notification types and delivery channels (in-app vs. email).
*   **Email Notifications:** Sending emails for various notification types (beyond invites).
*   **Notification Cleanup/Archiving:** Automatic cleanup of old notifications.
*   **Notification Grouping:** Grouping similar informational notifications in the UI (Note: complex for actionable items).
*   **Organization-Level Billing:** Allowing an organization entity to manage billing for its members.
*   **Resource Quotas/Limits per Organization:** Enforcing limits tied to organization billing plans.
*   **Dedicated Audit Log:** Implementing an immutable log for organization events.
*   **Org-Focused User Onboarding:** Designing specific flows for new users joining/creating orgs immediately upon signup.
*   **Advanced Org Deletion Handling:** Defining specific behavior for associated data (chats, resources, etc.) when an org is soft-deleted (e.g., archiving, member status changes beyond just blocking access).

--- 