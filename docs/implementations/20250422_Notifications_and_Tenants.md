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

### 1.3 API Client (`@paynless/api-client`)

*   [X] **Tests:** Write unit tests for new notification functions:
    *   `fetchNotifications(userId)`: Mocks Supabase `select`.
    *   `markNotificationAsRead(notificationId)`: Mocks Supabase `update`.
    *   `markAllNotificationsAsRead(userId)`: Mocks Supabase `update`.
*   [X] **Implementation:** Add the `fetchNotifications`, `markNotificationAsRead`, and `markAllNotificationsAsRead` functions to the API client package, using the singleton Supabase client.

### 1.4 State Management (`@paynless/store`)

*   [ ] **Tests:** Write unit tests for the notification Zustand store slice:
    *   Initial state (empty list, count 0).
    *   Action to set notifications (updates list and unread count).
    *   Action to add a new notification (prepends to list, increments unread count).
    *   Action to mark a notification as read (updates item `read` status, decrements unread count).
    *   Action to mark all as read (updates all items, sets count to 0).
    *   Selectors for `notifications` list and `unreadCount`.
*   [ ] **Implementation:** Create the `notificationStore` slice in `@paynless/store` with the tested state, actions, and selectors.

### 1.5 Frontend Component (`packages/web/src/components/Notifications.tsx`)

*   [ ] **Tests:** Write component tests (Vitest/RTL) for `Notifications.tsx`:
    *   Renders nothing if no user.
    *   Fetches initial notifications on mount (mock API client/store action).
    *   Displays unread count badge correctly based on store state.
    *   Displays list of notifications in a dropdown/panel (mock store state).
    *   Handles clicking an actionable notification, parsing `data.target_path` and triggering navigation (mock `react-router` navigate).
    *   Handles clicking "mark as read" on an item (mocks API client/store action).
    *   Handles clicking "mark all as read" (mocks API client/store action).
    *   Sets up Supabase Realtime subscription on mount (mock Supabase client `.channel()` and `.on()`).
    *   Handles incoming new notification payload from Realtime (mocks store action).
    *   Cleans up Realtime subscription on unmount (mock Supabase client `.removeChannel()`).
*   [ ] **Implementation:** Create the `Notifications.tsx` component:
    *   Use `useUser` hook (or equivalent) to get user ID.
    *   Use the `notificationStore` selectors and actions.
    *   Call API client functions for fetching/updating.
    *   Implement the Supabase Realtime subscription logic within `useEffect`, ensuring cleanup.
    *   Build the UI (Bell icon, badge, dropdown/panel).
    *   Add logic to handle clicks on notification items, check `data.target_path`, and navigate using `useNavigate` from `react-router`.
    *   Ensure component leverages reusable UI elements from `shadcn/ui`.

### 1.6 Integration

*   [ ] **Integrate Component:** Add the `<Notifications />` component to the main authenticated layout (`AppLayout.tsx` or similar).
*   [ ] **Integration Test:** Manually verify the component appears in the header for logged-in users and is not present for logged-out users or on public pages.

### 1.7 Checkpoint 1: Notifications Complete

*   [ ] **Run Tests:** Execute all tests related to notifications (`pnpm test --filter=@paynless/api-client --filter=@paynless/store --filter=web`). Ensure they pass.
*   [ ] **Build App:** Run `pnpm build` for the entire monorepo. Ensure it completes successfully.
*   [ ] **Manual Test:**
    *   Log in.
    *   Manually insert a notification with a `target_path` (e.g., `/dashboard/organizations/some-org-id/members`) into the database.
    *   Verify the notification appears and the badge updates.
    *   Click the notification and verify navigation to the specified path occurs.
    *   Mark notifications as read and verify UI/DB updates.
*   [ ] **Update Docs:** Mark Phase 1 tasks as complete in `IMPLEMENTATION_PLAN.md`.
*   [ ] **Commit:** `feat: implement notification system with linking (#issue_number)` (Replace `#issue_number` if applicable)
*   [ ] **Remind User:** "The basic notification system with linking is implemented. Remember to update and run impacted tests as we proceed. Please review and commit the changes: `git add . && git commit -m 'feat: implement notification system with linking'`"

---

## Phase 2: Multi-Tenancy Implementation

### 2.1 Database Schema (Organizations & Members)

*   [ ] **Define Schema:**
    *   `organizations`: `id`, `name`, `created_at`, `visibility` (e.g., `TEXT CHECK (visibility IN ('private', 'public')) DEFAULT 'private'`), `deleted_at` (`TIMESTAMP WITH TIME ZONE DEFAULT NULL`), add other org profile fields later.
    *   `organization_members`: `id`, `user_id`, `organization_id`, `role` (`TEXT CHECK (role IN ('admin', 'member'))`), `status` (`TEXT CHECK (status IN ('pending', 'active', 'removed'))`), `created_at`.
*   [ ] **Migration:** Create Supabase migration scripts for these tables, the `visibility` column/enum, and the `deleted_at` column.
*   [ ] **Test Migration:** Apply migrations locally and verify table structures, default values, and nullability.

### 2.2 Backend Logic (Tenancy)

*   [ ] **RLS Policy Tests:** Write tests (SQL or utility) for RLS on:
    *   `organizations`: Test access based on membership status (`active`), `deleted_at IS NULL`, and potentially `visibility`. Admins might have broader select/update access within their non-deleted org. Test creation policy.
    *   `organization_members`: Test access based on membership (in a non-deleted org) and role. Test self-removal vs admin removal.
    *   Other Tables (e.g., `chat_history`): Test RLS policies requiring `organization_id` matching an active membership in a non-deleted org for the current user.
*   [ ] **Implement RLS Policies:** Apply the tested RLS policies (including `deleted_at IS NULL` checks where appropriate) via migration scripts.
*   [ ] **Test Migration:** Apply RLS migrations and verify.
*   [ ] **Trigger/Function Tests (Last Admin Check):** Write tests for logic preventing the last admin from leaving or being demoted in a non-deleted org.
*   [ ] **Implement Trigger/Function (Last Admin Check):** Create/update logic considering `deleted_at IS NULL`.
*   [ ] **Test Migration:** Apply last admin check migration.
*   [ ] **Trigger Function Tests (Notifications - Full):**
    *   Update tests for `notify_org_admins_on_join_request` (for non-deleted orgs).
    *   Write tests for new notification triggers (e.g., `notify_on_role_change`, `notify_on_member_removed`) for non-deleted orgs.
*   [ ] **Implement Trigger Functions (Notifications - Full):** Finalize/implement notification triggers.
*   [ ] **Test Migration:** Apply notification trigger migrations.

### 2.3 API Client (`@paynless/api-client`)

*   [ ] **Tests:** Write unit tests for new multi-tenancy functions:
    *   `createOrganization(name, visibility?)`
    *   `updateOrganization(orgId, { name?, visibility? })` (Admin action, checks org not deleted)
    *   `listUserOrganizations(userId)` (Filters out deleted orgs)
    *   `getOrganizationDetails(orgId)` (Checks org not deleted)
    *   `getOrganizationMembers(orgId)` (Checks org not deleted)
    *   `inviteUserToOrganization(orgId, emailOrUserId, role)` (Checks org not deleted)
    *   `acceptOrganizationInvite(inviteTokenOrId)`
    *   `requestToJoinOrganization(orgId)` (Checks org not deleted)
    *   `approveJoinRequest(membershipId)` (Admin action, checks org not deleted)
    *   `updateMemberRole(membershipId, newRole)` (Admin action, handles 'last admin' error, checks org not deleted)
    *   `removeMember(membershipId)` (Admin or self action, handles 'last admin' error, checks org not deleted)
    *   `deleteOrganization(orgId)` (Admin action, performs soft delete by setting `deleted_at`)
*   [ ] **Implementation:** Add/Update these functions in the API client. Ensure appropriate checks for `deleted_at` are performed implicitly by RLS or explicitly where needed. Implement soft delete logic for `deleteOrganization`.

### 2.4 State Management (`@paynless/store`)

*   [ ] **Tests:** Write unit tests for `organizationStore` slice:
    *   State: `userOrganizations` (list should not include deleted ones), `currentOrganizationId`, `currentOrganizationDetails`, `currentOrganizationMembers`, `isLoading`, `error`.
    *   Actions: `fetchUserOrganizations` (should filter deleted), `setCurrentOrganizationId` (should potentially clear if org becomes deleted), `fetchOrganizationDetails`, `fetchCurrentOrganizationMembers`, `softDeleteOrganization` (removes org from local state after successful API call).
    *   Selectors for current org details, memberships, members, current user's role in current org.
*   [ ] **Implementation:** Create/Update the `organizationStore` slice to handle filtering/removal of soft-deleted orgs from the UI state.

### 2.5 Frontend Components & UI

*   [ ] **Organization Creation:**
    *   **Tests:** Test the creation form component (validation, API call mock, visibility option).
    *   **Implementation:** Build `CreateOrganizationForm.tsx` (likely used within the new org routing structure). Leverage reusable Form components.
*   [ ] **Organization Switcher:**
    *   **Tests:** Test dropdown component, fetching orgs (mock store), dispatching action to change current org and trigger navigation (mock store, router).
    *   **Implementation:** Build `OrganizationSwitcher.tsx` (in header/sidebar). Integrate with `organizationStore` and `react-router`.
*   [ ] **Organization Pages (`/dashboard/organizations/:orgId/...`):**
    *   **Tests:** Test main layout/routing for this section. Test placeholder components for `/dashboard/organizations/:orgId/dashboard` (or overview), `/settings`, `/members`.
    *   **Implementation:** Set up nested routing. Build basic page structure for org sections.
*   [ ] **Organization Settings:**
    *   **Tests:** Test components for viewing/editing org name, visibility. Test Delete Organization button/modal (admin only). Mock API calls/store state.
    *   **Implementation:** Build components within `/dashboard/organizations/:orgId/settings`. Add a 'Delete Organization' section/button visible only to admins, triggering a confirmation modal and calling `apiClient.deleteOrganization` / store action.
*   [ ] **Member Management:**
    *   **Tests:** Test components for viewing members, inviting users (modal), changing roles, removing members. Mock API calls/store state. Test handling 'last admin' error display. Test admin-only controls.
    *   **Implementation:** Build `MemberList.tsx`, `InviteMemberModal.tsx`, etc., within `/dashboard/organizations/:orgId/members`. Use `organizationStore`. Leverage reusable Table/Modal components.
*   [ ] **Invite/Join Request Handling:**
    *   **Tests:** Test UI for accepting invites (e.g., dedicated page `/accept-invite/:token`) or approving requests (e.g., action triggered from notification link leading to member list/modal). Mock API calls.
    *   **Implementation:** Build necessary pages/components. Ensure flow for "Request to Join" assumes user obtained `orgId` via external means (link/manual input) for this phase.

### 2.6 Routing & Access Control (Frontend)

*   [ ] **Tests:** Write tests for route guards or logic within components:
    *   Ensure `/dashboard/organizations/:orgId/...` routes redirect if org is deleted or user is not an active member.
    *   Ensure organization context (`currentOrganizationId`) is set correctly when navigating these routes.
    *   Ensure actions (settings edit, inviting) are disabled/hidden based on user's role in the current org (from `organizationStore`).
*   [ ] **Implementation:**
    *   Implement route guards/checks considering `deleted_at` status (fetched via `organizationStore`).
    *   Ensure `OrganizationSwitcher` correctly updates state and potentially navigates user.
    *   Apply role-based conditional rendering using `organizationStore` data.

### 2.7 Integration with Existing Features

*   [ ] **Identify Impacted Features:** Review existing features (Chat, User Profile, Subscriptions?) to see which need to become organization-scoped.
*   [ ] **Update Backend:** Modify Supabase queries/RLS for identified features to include `WHERE organization_id = current_org_id`. Add `organization_id` columns via migration where needed. Test these RLS changes.
*   [ ] **Update API Client:** Modify relevant API client functions to accept `organizationId`. Test these changes.
*   [ ] **Update Frontend:** Modify components using these features to pass the `currentOrganizationId` from the store to API calls. Test these components to ensure they filter data correctly based on the selected org.
*   [ ] **Update Existing Tests:** Modify tests for impacted features to mock and account for the `organizationId` parameter and context.

### 2.8 Checkpoint 2: Multi-Tenancy Complete

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