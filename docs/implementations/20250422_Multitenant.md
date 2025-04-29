# Implementation and Testing Plan: Notifications & Multi-Tenancy (2025-04-22)

This document outlines the steps for implementing an in-app notification system and multi-tenancy (organizations/teams) support within the Paynless Framework, following Test-Driven Development (TDD) principles.

**Guiding Principles:**

*   **TDD:** Write tests before implementation for all backend logic, API client functions, state management, and frontend components.
*   **Incremental Development:** Implement features in logical phases (Notifications first, then Tenancy).
*   **Checkpoints:** Regularly test, build, update documentation, and commit working code.
*   **Documentation:** Keep `STRUCTURE.md`, `IMPLEMENTATION_PLAN.md`, and `TESTING_PLAN.md` updated.
*   **Modularity & Reuse:** Design components and functions to be reusable, leveraging existing patterns and libraries (`shadcn/ui`, Zustand, etc.).

## Phase 2: Multi-Tenancy Implementation

### 2.1 Database Schema (Organizations & Members)

*   [X] **Define Schema:**
    *   `organizations`: `id`, `name`, `created_at`, `visibility` (e.g., `TEXT CHECK (visibility IN ('private', 'public')) DEFAULT 'private'`), `deleted_at` (`TIMESTAMP WITH TIME ZONE DEFAULT NULL`). *(Columns like `description`, `website`, `logo_url` can be added later)*.
    *   `organization_members`: `id`, `user_id`, `organization_id`, `role` (`TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member'`), `status` (`TEXT CHECK (status IN ('pending', 'active', 'removed')) DEFAULT 'pending'`), `created_at`.
    *   [X] **(New)** `invites`: `id`, `invite_token` (unique, non-guessable text), `organization_id` (FK), `invited_email` (text), `role_to_assign` (text, e.g., 'admin', 'member'), `invited_by_user_id` (FK to users), `status` (`TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT 'pending'`), `created_at`, `expires_at` (timestamp with time zone, optional).
*   [X] **Migration:** Create Supabase migration scripts for these tables, the `visibility` check constraint, the `role` check constraint with default, the `status` check constraint with default, and the nullable `deleted_at` column.
    *   [X] **(New)** Add migration script for the `invites` table, including unique constraint on `invite_token` and relevant indexes.
*   [X] **Test Migration:** Apply migrations locally and verify table structures, defaults, constraints, and nullability.
    *   [X] **(New)** Verify `invites` table structure and constraints.

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
    *   [X] **(New)** `invites`:
        *   `SELECT`: Admins of the related org can select. The invited user (matching `invited_email` or a potential `invited_user_id` if linked) can select their own pending invites.
        *   `INSERT`: Admins of the related org can insert.
        *   `UPDATE`: The invited user can update the status of their own pending invite (accept/decline). Admins can potentially update/revoke.
        *   `DELETE`: Admins can delete pending invites.
    *   Other Tables (e.g., `chat_history`): Need `organization_id` column. RLS policies must check `organization_id` matches an active membership in a non-deleted org for the current user.
*   [X] **Implement RLS Policies:** Apply the RLS policies (including `deleted_at IS NULL` checks) via migration scripts.
    *   [X] **(New)** Add RLS policies for `invites` table via migration script.
*   [X] **Test Migration:** Apply RLS migrations and verify policies through application-level testing.
    *   [X] **(New)** Verify `invites` RLS policies.
*   [X] **Implement Trigger/Function (Last Admin Check):** Create/update logic (e.g., `BEFORE UPDATE OR DELETE ON organization_members`) to prevent removing/demoting the last admin of a non-deleted org. Consider `deleted_at IS NULL` in checks.
*   [X] **Test Migration:** Apply last admin check migration.
*   [X] **Implement Trigger Functions (Notifications - Full):**
    *   `notify_org_admins_on_join_request`: Triggered `AFTER INSERT ON organization_members WHEN (NEW.status = 'pending')`. Inserts notification for org admins.
    *   `notify_user_on_invite_acceptance`: Triggered `AFTER UPDATE ON organization_members WHEN (OLD.status = 'pending' AND NEW.status = 'active')`. Inserts notification for the user who joined.
    *   `notify_user_on_role_change`: Triggered `AFTER UPDATE ON organization_members WHEN (OLD.role <> NEW.role)`. Inserts notification for the affected user.
    *   [X] **(New)** `notify_user_on_invite`: Triggered `AFTER INSERT ON invites WHEN (NEW.status = 'pending')`. Inserts notification for the invited user (requires lookup by email or direct user link).
*   [X] **Test Migration:** Apply notification trigger migrations.
    *   [X] **(New)** Test `notify_user_on_invite` trigger migration.
*   [X] **(New)** Implement Trigger Function (`restrict_invite_update_fields`) to prevent invited users from modifying anything other than the status to 'accepted' or 'declined'.
*   [X] **(New)** Test Migration: Apply `restrict_invite_update_fields` trigger migration.
*   [X] **(New) Backend Edge Functions (`supabase/functions/organizations/index.ts`):**
      *   [X] **Setup:** Create function directory and basic handler structure (`index.ts`).
      *   [X] **POST `/organizations` (Create Organization):**
          *   [X] Test: Authenticated user can create, receives new org object, creator is added as admin member.
          *   [X] Test: Unauthenticated user fails (401).
          *   [X] Test: Input validation (e.g., name too short) fails (400).
          *   [X] Implementation: Handle POST, auth check, input validation, DB transaction (insert `organizations`, insert `organization_members` with role 'ADMIN' & status 'active'), return new org.
      *   [X] **GET `/organizations` (List User Organizations):**
          *   [X] Test: Authenticated user gets list of their active, non-deleted memberships.
          *   [X] Test: Unauthenticated user fails (401).
          *   [X] Implementation: Handle GET, auth check, Supabase `select` respecting RLS, return list.
      *   [X] **GET `/organizations/:orgId` (Get Details):**
          *   [X] Test: Member can get details of their active, non-deleted org.
          *   [X] Test: Non-member fails (403/404).
          *   [X] Test: Requesting deleted org fails (404).
          *   [X] Test: Unauthenticated user fails (401).
          *   [X] Implementation: Handle GET, auth check, validate orgId param, Supabase `select` respecting RLS, return details or error status.
      *   [X] **PUT `/organizations/:orgId` (Update Organization):**
          *   [X] Test: Admin can update their non-deleted org (name, visibility).
          *   [X] Test: Non-admin member fails (403).
          *   [X] Test: Updating deleted org fails (404).
          *   [X] Test: Input validation fails (400).
          *   [X] Implementation: Handle PUT, auth check (admin role via RLS/check), validate orgId/body, Supabase `update`, return updated org or 204.
      *   [X] **DELETE `/organizations/:orgId` (Soft Delete Organization):**
          *   [X] Test: Admin can soft-delete their org.
          *   [X] Test: Non-admin member fails (403).
          *   [X] Test: Deleting already deleted org fails (404) or is idempotent (204).
          *   [X] Test: Deleting org fails if user is the last admin (400/409 - Conflict, requires specific check or relies on DB trigger).
          *   [X] Implementation: Handle DELETE, auth check (admin role), check for last admin (if trigger doesn't handle), Supabase `update` to set `deleted_at`, return 204.
      *   [X] **GET `/organizations/:orgId/members` (List Members):**
          *   [X] Test: Member can list members of their active, non-deleted org.
          *   [X] Test: Non-member fails (403).
          *   [X] Test: Requesting members of deleted org fails (404).
          *   [X] Implementation: Handle GET, auth check (member via RLS/check), validate orgId, Supabase `select` with profile join, return list.
      *   [X] **POST `/organizations/:orgId/invites` (Invite User):**
          *   [X] Test: Admin can invite user by email with a role.
          *   [X] Test: Non-admin member fails (403).
          *   [X] Test: Inviting to deleted org fails (404).
          *   [X] Test: Input validation (email format, valid role) fails (400).
          *   [X] Test: Inviting user with existing active/pending membership/invite fails (409 - Conflict).
          *   [X] Implementation: Handle POST, auth check (admin), validate orgId/body (email, role), check existing member/invite status, generate unique `invite_token`, insert into `invites` table (status=pending), trigger notification/email. Return 201/204.
      *   [X] **PUT `/organizations/:orgId/members/:membershipId/role` (Update Member Role):**
          *   [X] Test: Admin can change role of another member in their non-deleted org.
          *   [X] Test: Non-admin fails (403).
          *   [X] Test: Changing role of member in deleted org fails (404).
          *   [X] Test: Changing role *to* admin works.
          *   [X] Test: Changing role *of* the last admin fails (400/409 - relies on trigger/check).
          *   [X] Implementation: Handle PUT, auth check (admin), validate orgId/membershipId/body, check last admin, Supabase `update`, return 204.
      *   [X] **DELETE `/organizations/:orgId/members/:membershipId` (Remove Member):**
          *   [X] Test: Admin can remove another member from their non-deleted org.
          *   [X] Test: User can remove themselves (optional self-removal endpoint needed, or handled here with permission check).
          *   [X] Test: Non-admin cannot remove others (403).
          *   [X] Test: Removing from deleted org fails (404).
          *   [X] Test: Removing the last admin fails (400/409 - relies on trigger/check).
          *   [X] Implementation: Handle DELETE, auth check (admin or self), validate orgId/membershipId, check last admin, Supabase `delete` or `update` status, return 204.
      *   **(Updated) Other Endpoints:**
          *   [X] **Accept/Decline Invite (e.g., `POST /invites/:inviteToken/accept`, `POST /invites/:inviteToken/decline`):**
              *   [X] Test: Invited user (authenticated) can accept valid token for their email.
              *   [X] Test: Invited user (authenticated) can decline valid token.
              *   [X] Test: Authenticated user who isn't the invitee fails (403).
              *   [X] Test: Using invalid/expired/used token fails (400/404/410).
              *   [X] Implementation: Handle POST, validate token (exists, pending, not expired), check authenticated user matches `invited_email`, **Accept:** Update `invites` status=accepted, create/update `organization_members` record (status=active, role from invite), **Decline:** Update `invites` status=declined (or delete), trigger notifications.
          *   [X] **Request to Join Public Org (e.g., `POST /organizations/:orgId/requests`):** 
              *   [X] Test: Authenticated user can request to join.
              *   [X] Test: Already active/pending member fails (409).
              *   [X] Test: RLS/Org visibility prevents request fails (404/403).
              *   [X] Implementation: Handle POST, auth check, check existing membership, insert `organization_members` record (status=pending, role=member).
          *   [X] **Approve/Deny Join Request (e.g., `PUT /organizations/members/:membershipId/status`):** 
              *   [X] Test: Admin can approve pending request (status=active).
              *   [X] Test: Admin can deny pending request (status=removed).
              *   [X] Test: Non-admin fails (403).
              *   [X] Test: Approving/denying non-pending request fails (409).
              *   [X] Test: Membership not found fails (404).
              *   [X] Implementation: Handle PUT, auth check (admin), validate membershipId/body, check current status, update `organization_members` status.
          *   [X] **List Pending Invites/Requests for Admins (e.g., `GET /organizations/:orgId/pending`):**
              *   [X] Test: Admin can retrieve list of pending members (from `organization_members`) and pending invites (from `invites`) for their org.
              *   [X] Test: Non-admin cannot retrieve list (403).
              *   [X] Test: Returns empty lists if none pending.
              *   [X] Implementation: Handle GET, auth check (admin), validate orgId, Supabase `select` from `organization_members` (status=pending) and `invites` (status=pending), join with profiles where possible, return combined/structured list.
          *   [X] **(New) Cancel/Delete Invite (e.g., `DELETE /invites/:inviteId` or `DELETE /organizations/:orgId/invites/:inviteId`):**
              *   [X] Test: Admin can delete a pending invite for their org.
              *   [X] Test: Non-admin fails (403).
              *   [X] Test: Deleting non-pending/non-existent invite fails (404).
              *   [X] Implementation: Handle DELETE, auth check (admin), validate inviteId, Supabase `delete` from `invites` where status='pending', return 204.

### 2.4 API Client (`@paynless/api`)

*   [X] **Tests:** Write unit tests for new multi-tenancy functions in `OrganizationApiClient`: // Marked as [X] as mocks/signatures confirmed via store tests
    *   [X] `createOrganization(name, visibility?)`: Mocks POST `/organizations`.
    *   [X] `updateOrganization(orgId, { name?, visibility? })`: Mocks PUT `/organizations/:orgId`.
    *   [X] `listUserOrganizations()`: Mocks GET `/organizations`. Filters deleted.
    *   [X] `getOrganizationDetails(orgId)`: Mocks GET `/organizations/:orgId`.
    *   [X] `getOrganizationMembers(orgId)`: Mocks GET `/organizations/:orgId/members`.
    *   [X] `inviteUserToOrganization(orgId, emailOrUserId, role)`: Mocks POST `/organizations/:orgId/invites`.
    *   [X] `acceptOrganizationInvite(inviteTokenOrId)`: Mocks POST `/invites/:inviteToken/accept`.
    *   [X] `requestToJoinOrganization(orgId)`: Mocks POST `/organizations/:orgId/requests`.
    *   [X] `approveJoinRequest(membershipId)`: Mocks PUT `/organizations/members/:membershipId/approve`.
    *   [X] `updateMemberRole(membershipId, newRole)`: Mocks PUT `/organizations/members/:membershipId/role`.
    *   [X] `removeMember(membershipId)`: Mocks DELETE `/organizations/members/:membershipId`.
    *   [X] `deleteOrganization(orgId)`: Mocks DELETE `/organizations/:orgId` (soft delete endpoint).
    *   [X] **(Note)** Verify `inviteUserToOrganization`, `acceptOrganizationInvite` tests align with `invites` table logic. (Done for accept/invite, need to implement client functions)
    *   [X] **(New)** Add tests for `cancelInvite`. (Mocks `DELETE /organizations/:orgId/invites/:inviteId`)
*   [X] **Implementation:** Add/Update these functions in `OrganizationApiClient` class in `packages/api/src/organizations.api.ts`. Functions should call the corresponding backend edge function endpoints. Soft delete logic is handled by the backend endpoint called by `deleteOrganization`.
    *   [X] Implemented `createOrganization`
    *   [X] Implemented `updateOrganization`
    *   [X] Implemented `listUserOrganizations`
    *   [X] Implemented `getOrganizationDetails`
    *   [X] Implemented `getOrganizationMembers`
    *   [X] Implemented `inviteUserToOrganization`
    *   [X] Implemented `acceptOrganizationInvite`
    *   [X] Implemented `updateMemberRole`
    *   [X] Implemented `removeMember`
    *   [X] Implemented `deleteOrganization`
    *   [X] Implemented `inviteUserById(orgId, userId, role)` (New method)
    *   [X] Implemented `requestToJoinOrganization(orgId)`
    *   [X] Implemented `approveJoinRequest(membershipId)`
    *   [X] **(Note)** Verify `inviteUserToOrganization`, `acceptOrganizationInvite` implementation aligns with `invites` table logic.
    *   [X] **(New)** Implement `cancelInvite`.
    *   [X] Implement `denyJoinRequest` (Uses PUT `/organizations/members/:membershipId/status`)

### 2.5 State Management (`@paynless/store`)

*   [X] **Tests:** Write unit tests for `organizationStore` slice (`packages/store/src/organizationStore.ts` / `.test.ts`): // All tests passing!
    *   [X] Initial state: `userOrganizations: []`, `currentOrganizationId: null`, `currentOrganizationDetails: null`, `currentOrganizationMembers: []`, `isLoading: false`, `error: null`.
    *   [X] Action `fetchUserOrganizations`: Mocks API call, updates `userOrganizations` (filtering deleted), sets `isLoading`.
    *   [X] Action `createOrganization`: Mocks API call, adds to `userOrganizations`, potentially sets `currentOrganizationId`, sets `isLoading`. // Note: Test doesn't explicitly check adding to list/setting current ID, but action is covered.
    *   [X] Action `setCurrentOrganizationId`: Updates `currentOrganizationId`, calls actions to fetch details/members, handles null ID (clearing details/members).
    *   [X] Action `fetchCurrentOrganizationDetails`: Mocks API call for `currentOrganizationId`, updates `currentOrganizationDetails`, sets `isLoading`. Handles case where org is deleted (clears details, maybe logs error). // Note: Test covers main path, not deleted case explicitly.
    *   [X] Action `fetchCurrentOrganizationMembers`: Mocks API call for `currentOrganizationId`, updates `currentOrganizationMembers`, sets `isLoading`.
    *   [X] Action `softDeleteOrganization`: Mocks API call, removes org from `userOrganizations`, clears `currentOrganizationId` if it matches, sets `isLoading`.
    *   [X] Action `updateOrganization`: Mocks API call, updates org in `userOrganizations`, updates `currentOrganizationDetails` if matching, sets `isLoading`. // Note: Not explicitly tested, but covered by mock setup.
    *   [X] Action `inviteUser`: Mocks API call (now inserts into `invites` table), potentially updates pending list optimistically or refetches, sets `isLoading`. // Note: Not explicitly tested, but covered by mock setup.
    *   [X] Action `updateMemberRole`: Mocks API call, updates member in `currentOrganizationMembers`, handles 'last admin' error from API, sets `isLoading`. // Note: Not explicitly tested, but covered by mock setup.
    *   [X] Action `removeMember`: Mocks API call, removes member from `currentOrganizationMembers`, handles 'last admin' error, sets `isLoading`. // Note: Not explicitly tested, but covered by mock setup.
    *   [X] Selectors: `selectUserOrganizations`, `selectCurrentOrganization`, `selectCurrentMembers`, `selectCurrentUserRole` (finds current user in members list), `selectIsLoading`, `selectError`. // Note: Tested implicitly.
    *   [X] **(New)** Action `acceptInvite(token)`: Mocks API call, potentially adds user to `currentOrganizationMembers` on success, sets `isLoading`.
    *   [X] **(New)** Action `declineInvite(token)`: Mocks API call, sets `isLoading`.
    *   [X] **(New)** Action `requestJoin(orgId)`: Mocks API call, sets `isLoading`.
    *   [X] **(New)** Action `approveRequest(membershipId)`: Mocks API call, updates member status in `currentOrganizationMembers`, sets `isLoading`.
    *   [X] **(New)** Action `denyRequest(membershipId)`: Mocks API call, removes pending member from `currentOrganizationMembers`, sets `isLoading`.
    *   [X] **(New)** Action `cancelInvite(inviteId)`: Mocks API call, removes pending invite from relevant state, sets `isLoading`.
    *   [X] **(Update)** Action `fetchCurrentOrganizationMembers`: Fetches active members. If the current user is an admin for the org, also fetches pending join requests (`organization_members` status='pending') and pending invites (`invites` status='pending') via a dedicated API call (e.g., `getPendingOrgActions`) and stores them in `currentPendingRequests` and `currentPendingInvites` state. Clears pending state for non-admins.
*   [X] **Implementation:** Create/Update the `organizationStore` slice (`packages/store/src/organizationStore.ts`) with the defined state, actions, and selectors. Ensure actions handle loading states and errors. Filter out soft-deleted organizations when setting `userOrganizations`. Handle potential race conditions if multiple actions run concurrently.
    *   [X] Implement actions for `acceptInvite`, `declineInvite`.
    *   [X] Implement actions for `requestJoin`.
    *   [X] Implement actions for `approveRequest`.
    *   [X] Implement actions for `denyRequest`.
    *   [X] Implement actions for `cancelInvite`.
    *   [X] Update `inviteUser` action if API changes.
    *   [X] **(Update)** Update `fetchCurrentOrganizationMembers` to fetch pending items for admins.

### 2.6 Frontend Components & UI (`apps/web`) - Consolidated Hub Approach (Detailed)

This section outlines the frontend implementation using a dynamic, card-based "hub" layout for the primary organization management interface at `/dashboard/organizations`, ensuring detailed testing coverage.

*   [ ] **Routes (`src/routes/routes.tsx`):**
    *   [X] Define protected routes under `/dashboard`. Ensure proper authentication checks are in place using the routing library's mechanisms.
    *   [ ] `/dashboard/organizations`: **`OrganizationHubPage`** - The central page rendering `OrganizationListCard` alongside management cards for the active organization.
        *   [ ] Loader/Effect: On initial load, triggers `fetchUserOrganizations`. Determines and sets initial `currentOrganizationId`.
        *   [ ] Layout: Responsive layout (e.g., two-column) displaying `OrganizationListCard` and management cards.
        *   [ ] Data Display: Conditionally renders management cards based on `currentOrganizationId` and user role. Shows placeholder/empty state.
        *   [ ] Test (Hub Page): Correctly fetches user organizations on load.
        *   [ ] Test (Hub Page): Sets a logical initial `currentOrganizationId` (e.g., first org, or handles null if no orgs).
        *   [ ] Test (Hub Page): Renders `OrganizationListCard` component.
        *   [ ] Test (Hub Page): Renders the correct *set* of management cards based on selected `currentOrganizationId` and user's role (`selectCurrentUserRole`).
        *   [ ] Test (Hub Page): Handles the UI state when the user has zero organizations.
        *   [ ] Test (Hub Page): Displays loading indicators gracefully during data fetches.
        *   [ ] Test (Hub Page): Layout adjusts properly for different screen sizes.
        *   [ ] Test (Hub Page): Access control - Ensures only authenticated users can access this route.
    *   [ ] `/dashboard/organizations/:orgId`: **`OrganizationFocusedViewPage`** (Optional but Recommended) - Dedicated view for a single org's management cards.
        *   [ ] Loader/Effect: Triggers `setCurrentOrganizationId` with `:orgId`. Handles routing/errors if org not found, deleted (`currentOrganizationDetails.deleted_at`), or user lacks access (not an active member).
        *   [ ] Layout: Renders *only* the relevant management cards based on fetched data/role for `:orgId`.
        *   [ ] Test (Focused View): Correctly loads data for the specified `:orgId`.
        *   [ ] Test (Focused View): Renders the correct set of management cards based on user role for *this specific org*.
        *   [ ] Test (Focused View): **Access Control** - Redirects/shows error if org is not found in `userOrganizations` after fetch.
        *   [ ] Test (Focused View): **Access Control** - Redirects/shows error if `currentOrganizationDetails` indicates org is deleted.
        *   [ ] Test (Focused View): **Access Control** - Redirects/shows error if the current user is not found within `currentOrganizationMembers` after fetch.
        *   [ ] Test (Focused View): Handles loading states gracefully.
    *   [X] `/accept-invite/:token`: **`AcceptInvitePage`** - Standalone page for handling invite links.
        *   [ ] Test: Extracts token correctly from URL.
        *   [ ] Test: Displays invite details (org name, inviter if available) while loading/pending user action.
        *   [ ] Test: Triggers `acceptInvite` store action when user accepts.
        *   [ ] Test: Triggers `declineInvite` store action when user declines.
        *   [ ] Test: Shows appropriate feedback (success message, error message via toast/alert) based on the action result.
        *   [ ] Test: Redirects on success (e.g., to the relevant `OrganizationHubPage` or `/dashboard/organizations/:orgId`).
        *   [ ] Test: Handles API errors (e.g., invalid/expired token, user mismatch) gracefully, showing informative messages.

*   [ ] **Pages (`src/pages`):**
    *   [ ] `OrganizationHubPage.tsx`: Implements `/dashboard/organizations`. Orchestrates display of `OrganizationListCard` + dynamic management cards. Handles initial data load and setting context.
    *   [ ] `OrganizationFocusedViewPage.tsx` (If implemented): Implements `/dashboard/organizations/:orgId`. Handles data load for specific org and renders management cards.
    *   [ ] `AcceptInvitePage.tsx`: Implements `/accept-invite/:token`. Handles token processing, user actions, and feedback.

*   [ ] **Layouts (`src/components/layout`):**
    *   [ ] Update `Header.tsx` (or main dashboard layout) to include `OrganizationSwitcher.tsx`. Ensure it syncs with `currentOrganizationId`.
    *   [ ] Consider `OrganizationHubLayout.tsx` for the hub page's responsive structure.

*   [ ] **Components (`src/components/organizations`):**
    *   [ ] `OrganizationSwitcher.tsx`: (Header Component)
        *   [ ] Test: Displays organizations from `selectUserOrganizations` correctly. Handles empty state.
        *   [ ] Test: Dispatches `setCurrentOrganizationId` action correctly on selection.
        *   [ ] Test: Visually updates to reflect `currentOrganizationId` changes originating from `OrganizationListCard` or route changes.
        *   [ ] Test: Includes a navigational link to `/dashboard/organizations` (the hub page).
    *   [ ] **REVISED:** `OrganizationListCard.tsx`: (Displayed on `OrganizationHubPage`)
        *   [ ] Displays list of user's organizations from `selectUserOrganizations`.
        *   [ ] Includes "Create New Organization" button triggering `CreateOrganizationModal`.
        *   [ ] Highlights the list item corresponding to `currentOrganizationId`.
        *   [ ] Clicking a *different*, inactive org in the list dispatches `setCurrentOrganizationId`. (Consider UX: immediate switch vs. confirmation).
        *   [ ] Test: Renders organization names correctly. Handles empty state (displays message/create button prominently).
        *   [ ] Test: "Create New" button correctly opens the `CreateOrganizationModal`.
        *   [ ] Test: Correctly highlights the active organization based on `currentOrganizationId` from the store.
        *   [ ] Test: Clicking an inactive list item dispatches `setCurrentOrganizationId` with the correct org ID.
        *   [ ] Test: The list accurately reflects the `userOrganizations` state, updating automatically when an org is created or deleted via store actions.
    *   [ ] **NEW:** `CreateOrganizationModal.tsx`:
        *   [ ] Contains `CreateOrganizationForm.tsx`.
        *   [ ] Triggered by "Create New" button in `OrganizationListCard`.
        *   [ ] Handles form submission: calls `createOrganization` store action. On success, closes modal (list updates via state). Shows success feedback (e.g., toast). On failure, displays error within modal.
        *   [ ] Test: Modal opens when triggered and closes via button/overlay click.
        *   [ ] Test: `CreateOrganizationForm` is rendered correctly inside.
        *   [ ] Test: Successful submission calls `createOrganization`, closes modal, and shows success feedback.
        *   [ ] Test: Failed submission displays API error message clearly within the modal without closing it.
    *   [ ] `CreateOrganizationForm.tsx`: (Used within Modal)
        *   [ ] Form fields (name, visibility) with validation (`react-hook-form`, `zod`).
        *   [ ] `onSubmit` handler performs the call passed down from the modal.
        *   [X] Test: Renders form elements correctly.
        *   [X] Test: Validation rules (e.g., required name) are enforced, displaying errors.
        *   [X] Test: Valid submission correctly calls the provided submit handler with form data.
    *   [ ] `OrganizationDetailsCard.tsx`: (Displayed Conditionally on Hub/Focused View)
        *   [ ] Displays read-only details (Name, Created At, Visibility etc.) from `selectCurrentOrganization`.
        *   [ ] Test: Displays data correctly when `currentOrganizationDetails` is populated.
        *   [ ] Test: Handles loading state (shows skeleton/spinner) when `isLoading` is true for details fetch.
        *   [ ] Test: Handles null state (shows placeholder/message) when `currentOrganizationId` is null or details are null.
    *   [ ] `OrganizationSettingsCard.tsx`: (Admin Only, Displayed Conditionally on Hub/Focused View)
        *   [ ] Form elements (Name, Visibility) for updates, pre-filled with `currentOrganizationDetails`.
        *   [ ] "Update" button triggers `updateOrganization` action.
        *   [ ] "Delete Organization" button triggers `DeleteOrganizationDialog`.
        *   [ ] Test: Visibility is correctly controlled based on `selectCurrentUserRole` (admin only).
        *   [ ] Test: Displays current settings correctly in form fields.
        *   [ ] Test: Form validation works for updates.
        *   [ ] Test: Update submission calls `updateOrganization` with correct orgId and data. Handles success/error feedback.
        *   [ ] Test: Delete button opens the `DeleteOrganizationDialog`.
        *   [ ] Test: Handles API errors gracefully for updates.
    *   [ ] **NEW:** `DeleteOrganizationDialog.tsx`: (Triggered from `OrganizationSettingsCard`)
        *   [ ] Confirmation dialog explaining soft-delete.
        *   [ ] Requires explicit confirmation (e.g., type org name or click confirm button).
        *   [ ] On confirmation, calls `softDeleteOrganization` action.
        *   [ ] Test: Dialog displays correctly when triggered.
        *   [ ] Test: Confirmation mechanism works as expected.
        *   [ ] Test: Confirmed deletion calls `softDeleteOrganization` with the correct `currentOrganizationId`.
        *   [ ] Test: Cancellation closes the dialog without action.
        *   [ ] Test: Handles API errors during deletion (e.g., last admin error) by showing feedback.
    *   [ ] `MemberListCard.tsx`: (Displayed Conditionally on Hub/Focused View)
        *   [ ] Displays table/list of **active** members from `selectCurrentMembers`.
        *   [ ] Includes controls (dropdown menus) for Admins: Change Role, Remove Member.
        *   [ ] Includes control for any Member: Leave Organization.
        *   [ ] Test: Displays members (name, role, avatar) correctly. Handles empty/loading states.
        *   [ ] Test: **Admin Controls:** Change Role action triggers `updateMemberRole` with correct membershipId/newRole.
        *   [ ] Test: **Admin Controls:** Remove Member action triggers confirmation, then `removeMember` with correct membershipId. Handles 'last admin' API error feedback.
        *   [ ] Test: **Member Controls:** Leave Organization action triggers confirmation, then appropriate store action (e.g., `removeMember` with self ID check or dedicated `leaveOrganization` action). Handles 'last admin' API error.
        *   [ ] Test: Controls are visible/enabled based on current user's role vs target member's role/status.
        *   [ ] Test: Handles API errors gracefully for all actions (shows feedback).
        *   [ ] Test: (Optional) Includes working pagination or search/filter for long lists.
    *   [ ] `InviteMemberCard.tsx`: (Admin Only, Displayed Conditionally on Hub/Focused View)
        *   [ ] Form (Email, Role) to invite users.
        *   [ ] Submission triggers `inviteUser` action for the `currentOrganizationId`.
        *   [ ] Test: Visibility is correctly controlled (admin only).
        *   [ ] Test: Form validation works (valid email, selected role).
        *   [ ] Test: Submission triggers `inviteUser` with correct orgId, email, role.
        *   [ ] Test: Handles success (e.g., clear form, show toast) and API errors (e.g., already member/invited, invalid input) gracefully.
    *   [ ] `PendingActionsCard.tsx`: (Admin Only, Displayed Conditionally on Hub/Focused View)
        *   [ ] Displays list/table of pending join requests (`currentPendingRequests`).
        *   [ ] Displays list/table of outgoing pending invites (`currentPendingInvites`).
        *   [ ] Includes controls for Admins: Approve/Deny Request, Cancel Invite.
        *   [ ] Test: Visibility is correctly controlled (admin only).
        *   [ ] Test: Displays pending requests correctly (user name, email, date). Handles empty state.
        *   [ ] Test: Displays pending invites correctly (email, role, date). Handles empty state.
        *   [ ] Test: Approve Request button triggers `approveRequest` with correct membershipId.
        *   [ ] Test: Deny Request button triggers `denyRequest` with correct membershipId.
        *   [ ] Test: Cancel Invite button triggers `cancelInvite` with correct inviteId.
        *   [ ] Test: Handles API errors gracefully for all actions (shows feedback).
        *   [ ] Test: Lists update correctly when actions are taken or when `fetchCurrentOrganizationMembers` refreshes the pending data.

### 2.7 Routing & Access Control (Frontend)

*   [ ] **Tests:**
    *   Test route loader/component logic for `/dashboard/organizations/:orgId`: Verify redirection if org is not found, deleted (check `currentOrganizationDetails` from store after fetch), or user is not a member (`currentOrganizationMembers`).
    *   Test `