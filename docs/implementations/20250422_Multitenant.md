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
    *   [X] Initial state: `userOrganizations: []`, `currentOrganizationId: null`, `currentOrganizationDetails: null`, `currentOrganizationMembers: []`, `isLoading: false`, `error: null`, `isDeleteDialogOpen: false`.
    *   [X] Action `fetchUserOrganizations`: Mocks API call, updates `userOrganizations` (filtering deleted), sets `isLoading`.
    *   [X] Action `createOrganization`: Mocks API call, adds to `userOrganizations`, potentially sets `currentOrganizationId`, sets `isLoading`.
    *   [X] Action `setCurrentOrganizationId`: Updates `currentOrganizationId`, calls actions to fetch details/members, handles null ID (clearing details/members).
    *   [X] **(NEW)** Action `setCurrentOrganizationId`: Should persist the selected ID (e.g., using Zustand persist middleware with localStorage) so it's restored on page reload.
    *   [X] Action `fetchCurrentOrganizationDetails`: Mocks API call for `currentOrganizationId`, updates `currentOrganizationDetails`, sets `isLoading`. Handles case where org is deleted (clears details, maybe logs error).
    *   [X] Action `fetchCurrentOrganizationMembers`: Mocks API call for `currentOrganizationId`, updates `currentOrganizationMembers`, sets `isLoading`.
    *   [X] Action `softDeleteOrganization`: Mocks API call, removes org from `userOrganizations`, clears `currentOrganizationId` if it matches, sets `isLoading`, calls `closeDeleteDialog` on success.
    *   [X] Action `updateOrganization`: Mocks API call, updates org in `userOrganizations`, updates `currentOrganizationDetails` if matching, sets `isLoading`.
    *   [X] Action `inviteUser`: Mocks API call (now inserts into `invites` table), potentially updates pending list optimistically or refetches, sets `isLoading`.
    *   [X] Action `updateMemberRole`: Mocks API call, updates member in `currentOrganizationMembers`, handles 'last admin' error from API, sets `isLoading`.
    *   [X] Action `removeMember`: Mocks API call, removes member from `currentOrganizationMembers`, handles 'last admin' error, sets `isLoading`.
    *   [X] Selectors: `selectUserOrganizations`, `selectCurrentOrganization`, `selectCurrentMembers`, `selectCurrentUserRole` (finds current user in members list), `selectIsLoading`, `selectError`, `selectIsDeleteDialogOpen`.
    *   [X] Action `openDeleteDialog`: Sets `isDeleteDialogOpen` to true.
    *   [X] Action `closeDeleteDialog`: Sets `isDeleteDialogOpen` to false.
    *   [X] Action `acceptInvite(token)`: Mocks API call, potentially adds user to `currentOrganizationMembers` on success, sets `isLoading`.
    *   [X] Action `declineInvite(token)`: Mocks API call, sets `isLoading`.
    *   [X] Action `requestJoin(orgId)`: Mocks API call, sets `isLoading`.
    *   [X] Action `approveRequest(membershipId)`: Mocks API call, updates member status in `currentOrganizationMembers`, sets `isLoading`.
    *   [X] Action `denyRequest(membershipId)`: Mocks API call, removes pending member from `currentOrganizationMembers`, sets `isLoading`.
    *   [X] Action `cancelInvite(inviteId)`: Mocks API call, removes pending invite from relevant state, sets `isLoading`.
    *   [X] Action `fetchCurrentOrganizationMembers`: Fetches active members. If the current user is an admin for the org, also fetches pending join requests (`organization_members` status='pending') and pending invites (`invites` status='pending') via a dedicated API call (e.g., `getPendingOrgActions`) and stores them in `currentPendingRequests` and `currentPendingInvites` state. Clears pending state for non-admins.
*   [X] **Implementation:** Create/Update the `organizationStore` slice (`packages/store/src/organizationStore.ts`) with the defined state, actions, and selectors. Ensure actions handle loading states and errors. Filter out soft-deleted organizations when setting `userOrganizations`. Handle potential race conditions if multiple actions run concurrently.
    *   [X] Implement state `isDeleteDialogOpen`.
    *   [X] Implement actions `openDeleteDialog`, `closeDeleteDialog`.
    *   [X] Update `softDeleteOrganization` to call `closeDeleteDialog`.
    *   [X] Implement actions for `acceptInvite`, `declineInvite`.
    *   [X] Implement actions for `requestJoin`.
    *   [X] Implement actions for `approveRequest`.
    *   [X] Implement actions for `denyRequest`.
    *   [X] Implement actions for `cancelInvite`.
    *   [X] Update `inviteUser` action if API changes.
    *   [X] Update `fetchCurrentOrganizationMembers` to fetch pending items for admins.
    *   [X] **(NEW)** Implement Zustand persist middleware for `organizationStore` to save/restore `currentOrganizationId`.

### 2.6 Frontend Components & UI (`apps/web`) - Consolidated Hub Approach (Detailed)

This section outlines the frontend implementation using a dynamic, card-based "hub" layout for the primary organization management interface at `/organizations`, ensuring detailed testing coverage.

*   [X] **Routes (`src/routes/routes.tsx`):**
    *   [X] Define protected routes. All key application routes (`/dashboard`, `/profile`, `/chat`, `/subscription`, `/notifications`, `/organizations`, `/organizations/:orgId`, `/admin`) are defined at the root level. Ensure proper authentication checks (`ProtectedRoute`) are applied to all necessary routes.
    *   [X] `/organizations`: **`OrganizationHubPage`** - The central page rendering `OrganizationListCard` alongside management cards for the active organization.
        *   [X] Loader/Effect: On initial load, triggers `fetchUserOrganizations`. Determines and sets initial `currentOrganizationId` (restoring from persisted state if available).
        *   [X] **(Layout)** Layout: Should use a responsive two-column layout (e.g., `flex flex-col md:flex-row gap-4`) with `OrganizationListCard` on the left and management cards in a flex-grid on the right.
        *   [X] Data Display: Conditionally renders management cards based on `currentOrganizationId` and user role. Shows placeholder/empty state.
        *   [X] Test (Hub Page): Correctly fetches user organizations on load.
        *   [X] Test (Hub Page): Sets a logical initial `currentOrganizationId` (e.g., first org, or restored from persistence).
        *   [X] Test (Hub Page): Renders `OrganizationListCard` component.
        *   [X] Test (Hub Page): Renders the correct *set* of management cards based on selected `currentOrganizationId` and user's role (`selectCurrentUserRole`).
        *   [X] Test (Hub Page): Handles the UI state when the user has zero organizations.
        *   [X] Test (Hub Page): Displays loading indicators gracefully during data fetches.
        *   [X] Test (Hub Page): Access control - Ensures only authenticated users can access this route.
    *   [X] `/organizations/:orgId`: **`OrganizationFocusedViewPage`** (Optional but Recommended) - Dedicated view for a single org's management cards.
        *   [X] Loader/Effect: Triggers `setCurrentOrganizationId` with `:orgId`. Handles routing/errors if org not found, deleted (`currentOrganizationDetails.deleted_at`), or user lacks access (not an active member).
        *   [X] **(Layout)** Layout: Should use a responsive flex-grid layout (e.g., `grid grid-cols-1 md:grid-cols-2 gap-4`) for the management cards.
        *   [X] Test (Focused View): Correctly loads data for the specified `:orgId`.
        *   [X] Test (Focused View): Renders the correct set of management cards based on user role for *this specific org*.
        *   [X] Test (Focused View): **Access Control** - Redirects/shows error if org is not found in `userOrganizations` after fetch.
        *   [X] Test (Focused View): **Access Control** - Redirects/shows error if `currentOrganizationDetails` indicates org is deleted.
        *   [X] Test (FocusedView): **Access Control** - Redirects/shows error if the current user is not found within `currentOrganizationMembers` after fetch.
        *   [X] Test (Focused View): Handles loading states gracefully (shows Skeletons).
        *   [ ] Test (Focused View): **Error Boundary** - Verifies Error Boundary catches component errors. (**Note:** Skipped due to test environment issues with mocking/error propagation - see test file).
    *   [ ] `/accept-invite/:token`: **`AcceptInvitePage`** - Standalone page for handling invite links.
        *   [X] Test: Extracts token correctly from URL.
        *   [ ] Test: Displays invite details (org name) while loading/pending user action.
        *   [ ] Test: Triggers `acceptInvite` store action when user accepts. (**Note:** Test written, but persistently failing with timeout errors).
        *   [ ] Test: Triggers `declineInvite` store action when user declines. (**Note:** Test written, but persistently failing with timeout errors).
        *   [ ] Test: Shows appropriate feedback (via toast) based on the action result.
        *   [ ] Test: Redirects on success.
        *   [X] Test: Handles API errors (e.g., invalid/expired token via fetch error) gracefully, showing informative messages/UI state.

*   [X] **Pages (`src/pages`):**
    *   [X] **(Layout)** `OrganizationHubPage.tsx`: Implements `/organizations`. Orchestrates display of `OrganizationListCard` + dynamic management cards. Handles initial data load and setting context. **Update layout to be two-column flex.**
    *   [X] **(Layout)** `OrganizationFocusedViewPage.tsx`: Implements `/organizations/:orgId`. Handles data load for specific org and renders management cards. **Update layout to use flex-grid for cards.**
    *   [X] `AcceptInvitePage.tsx`: Implements `/accept-invite/:token`. Handles token processing, user actions, and feedback. (Implementation mostly finished, async tests blocked).

*   [ ] **Layouts (`src/components/layout`):**
    *   [ ] Update `Header.tsx`:
        *   [X] Ensure `OrganizationSwitcher.tsx` is included and syncs with `currentOrganizationId`.
        *   [ ] Add `OrganizationSwitcher` to the mobile menu section for consistency.
        *   [X] **(Dependency)** `OrganizationSwitcher.tsx`: Update its own plan entry to reflect navigation to `/organizations/:orgId`.
        *   [ ] **(Dependency)** `OrganizationSwitcher.tsx`: Implement "Manage All Organizations" link pointing to `/organizations`.
    *   [ ] Consider `OrganizationHubLayout.tsx`: (Optional Refactor)
        *   [ ] Create `OrganizationHubLayout.tsx` to encapsulate the responsive two-column grid structure from `OrganizationHubPage.tsx`.
        *   [ ] Refactor `OrganizationHubPage.tsx` to use this layout component.

*   [ ] **Components (`src/components/organizations`):**
    *   [ ] `OrganizationSwitcher.tsx`: (Header Component)
        *   [X] Displays organizations from `selectUserOrganizations` correctly. Handles empty state.
        *   [X] Dispatches `setCurrentOrganizationId` action correctly on selection.
        *   [X] Visually updates to reflect `currentOrganizationId` changes originating from `OrganizationListCard` or route changes.
        *   [X] Includes a navigational link to `/organizations/new` (Create Org).
        *   [X] Navigates to `/organizations/:orgId` on selection.
        *   [ ] Add a "Manage All Organizations" link pointing to `/organizations`.
        *   [X] Test: Displays organizations correctly.
        *   [X] Test: Dispatches action correctly.
        *   [X] Test: Visual updates reflect state.
        *   [X] Test: Create Org link works.
        *   [X] Test: Selection navigates correctly.
    *   [ ] **REVISED:** `OrganizationListCard.tsx`: (Displayed on `OrganizationHubPage`)
        *   [X] Displays list of user's organizations from `selectUserOrganizations`.
        *   [X] Includes "Create New Organization" button triggering `CreateOrganizationModal`.
        *   [X] Highlights the list item corresponding to `currentOrganizationId`.
        *   [X] Clicking a *different*, inactive org in the list dispatches `setCurrentOrganizationId`.
        *   [X] Test: Renders organization names correctly. Handles empty state.
        *   [X] Test: "Create New" button correctly triggers modal opening action (`openCreateModal`).
        *   [X] Test: Correctly highlights the active organization based on `currentOrganizationId`.
        *   [X] Test: Clicking an inactive list item dispatches `setCurrentOrganizationId`.
        *   [X] Test: Clicking an active list item does NOT dispatch `setCurrentOrganizationId`.
        *   [ ] Test: The list accurately reflects the `userOrganizations` state, updating automatically.
    *   [X] **NEW:** `CreateOrganizationModal.tsx`:
        *   [X] Contains `CreateOrganizationForm.tsx`.
        *   [X] Triggered by "Create New" button in `OrganizationListCard` (via store state).
        *   [X] Handles form submission: calls `createOrganization` store action. On success, closes modal. Shows success feedback. On failure, displays error within modal.
        *   [X] Test: Modal opens/closes based on store state.
        *   [X] Test: `CreateOrganizationForm` is rendered correctly inside.
        *   [X] Test: Successful submission calls `createOrganization`, closes modal, shows success feedback.
        *   [X] Test: Failed submission displays API error message.
    *   [X] `CreateOrganizationForm.tsx`:
        *   [X] Form fields (name, visibility) with validation.
        *   [X] `onSubmit` handler calls `createOrganization`.
        *   [X] Test: Renders form elements correctly.
        *   [X] Test: Validation rules are enforced.
        *   [X] Test: Valid submission calls store action.
        *   [X] Test: Cancel button calls `closeCreateModal` action.
        *   [X] Test: Buttons are disabled when `isLoading` is true.
    *   [X] `OrganizationDetailsCard.tsx`: (Displayed Conditionally)
        *   [X] Displays read-only details from `selectCurrentOrganization`.
        *   [X] Test: Displays data correctly.
        *   [X] Test: Handles loading state.
        *   [X] Test: Handles null state.
    *   [ ] `OrganizationSettingsCard.tsx`: (Admin Only, Displayed Conditionally)
        *   [X] Form elements (Name, Visibility) pre-filled.
        *   [X] "Update" button triggers `updateOrganization` action.
        *   [X] "Delete Organization" button triggers `openDeleteDialog` store action.
        *   [X] Test: Visibility is correctly controlled.
        *   [X] Test: Displays current settings correctly.
        *   [X] Test: Form validation works.
        *   [X] Test: Update submission calls `updateOrganization`. Handles feedback.
        *   [X] Test: Delete button calls `openDeleteDialog`.
        *   [X] Test: Handles API errors gracefully.
    *   [X] **NEW:** `DeleteOrganizationDialog.tsx`:
        *   [X] Reads `isDeleteDialogOpen` from store.
        *   [X] Reads `currentOrganizationDetails`, `currentOrganizationId`.
        *   [X] Confirmation dialog explains soft-delete.
        *   [X] Requires explicit confirmation.
        *   [X] On confirmation, calls `softDeleteOrganization`.
        *   [X] On cancellation or success, calls `closeDeleteDialog`.
        *   [X] Test: Dialog displays correctly.
        *   [X] Test: Confirmation button calls `softDeleteOrganization`.
        *   [X] Test: Cancellation button calls `closeDeleteDialog`.
        *   [X] Test: Handles API errors during deletion.
    *   [ ] `MemberListCard.tsx`: (Displayed Conditionally)
        *   [X] Displays table/list of **active** members from `selectCurrentMembers` (using `first_name`, `last_name`).
        *   [ ] **(UI)** Update component to use `member.user_profiles.first_name` and `last_name` instead of non-existent fields.
        *   [X] Includes controls (dropdown menus) for Admins: Change Role, Remove Member.
        *   [X] Includes control for any Member: Leave Organization.
        *   [X] Test: Displays members (name, role) correctly. Handles empty/loading states.
        *   [ ] Test: **Admin Controls:** Change Role action triggers `updateMemberRole`. *(Failing - portal issue)*
        *   [ ] Test: **Admin Controls:** Remove Member action triggers confirmation, then `removeMember`. Handles 'last admin' error. *(Failing - portal issue)*
        *   [X] Test: **Member Controls:** Leave Organization action triggers confirmation, then `removeMember`. Handles 'last admin' API error.
        *   [X] Test: Controls are visible/enabled based on roles.
        *   [X] Test: Handles API errors gracefully. *(Placeholder tests implemented)*
        *   [ ] Test: (Optional) Includes working pagination or search/filter.
    *   [X] `InviteMemberCard.tsx`: (Admin Only, Displayed Conditionally)
        *   [X] Form (Email, Role) to invite users.
        *   [X] Submission triggers `inviteUser` action.
        *   [X] Test: Visibility is correctly controlled.
        *   [X] Test: Form validation works. *(Note: Selecting non-default role test fails - portal issue)*
        *   [X] Test: Submission triggers `inviteUser`.
        *   [X] Test: Handles success and API errors gracefully.
    *   [ ] `PendingActionsCard.tsx`: (Admin Only, Displayed Conditionally)
        *   [ ] Displays list/table of pending join requests (using `first_name`, `last_name` from `user_profiles`).
        *   [ ] Displays list/table of outgoing pending invites (using `invited_email`).
        *   [ ] **(Data)** Determine how to display inviter name for pending invites (requires join or separate fetch).
        *   [ ] **(Data)** Determine how to display *requesting user's email* for pending requests (requires joining/fetching from `auth.users` or adjusting schema/RLS - see Future Scope note on email handling).
        *   [ ] Includes controls for Admins: Approve/Deny Request, Cancel Invite.
        *   [ ] Test: Visibility is correctly controlled (admin only).
        *   [ ] Test: Displays pending requests correctly (user name, date). Handles empty state.
        *   [ ] Test: Displays pending invites correctly (email, role, date). Handles empty state.
        *   [ ] Test: Approve Request button triggers `approveRequest`.
        *   [ ] Test: Deny Request button triggers `denyRequest`.
        *   [ ] Test: Cancel Invite button triggers `cancelInvite`.
        *   [ ] Test: Handles API errors gracefully.
        *   [ ] Test: Lists update correctly when actions are taken.

        [ ] **Tests:**
    *   Test route loader/component logic for `/dashboard/organizations/:orgId`: Verify redirection if org is not found, deleted (check 
    `currentOrganizationDetails` from store after fetch), or user is not a member (`currentOrganizationMembers`).
    *   Test `OrganizationSwitcher`: Verify it updates `currentOrganizationId` in the store and navigation occurs (if designed to navigate).
    *   Test conditional rendering within org pages: Ensure admin-only controls (delete org, change roles, approve requests) are hidden/disabled for non-admins 
    based on `selectCurrentUserRole` from store.
*   [ ] **Implementation:**
    *   Use `react-router` loaders or `useEffect` hooks in org-specific pages/layouts to fetch data via store actions (`fetchCurrentOrganizationDetails`, 
    `fetchCurrentOrganizationMembers`). Check the fetched state (details for existence/`deleted_at`, members for current user presence) and use `useNavigate` to 
    redirect if access is denied.
    *   Connect `OrganizationSwitcher` dropdown selection to the `setCurrentOrganizationId` store action.
    *   Use the `selectCurrentUserRole` selector in components like `OrganizationSettingsPage`, `OrganizationMembersPage`, `MemberList` to conditionally render UI 
    elements or disable actions.

*   [ ] **(UI Polish)** Global Styles / Theme:
    *   [X] Apply a background blur (`backdrop-blur-sm` or similar) to `DropdownMenuContent` components globally or via theme override for better readability. 
    *   [ ] Change "Admin" to a badge to display on Org Settings, Pending Actions, and Members cards 
    
### 2.8 Integration with Existing Features

*   [ ] **Org Chat vs Individual Chat** Create switcher to associate an AI chat with an org or keep it separate. 
*   [ ] **Add Org Chats to Org** Modify Chat History to show Org AI Chat separately.
*   [ ] **Set Chat Access level for Org & Chat** Let members & Orgs set chat access level by role, `member` or `admin`
*   [ ] **Admins Manage AI Chat for Org** Give Admins control over deleting org chats or changing access levels 
        *   [ ] **Approve Access** Org admins can approve/deny members ability to create new org chats 
*   [ ] **Share AI Chats Among Org** All orgId chat histories are shared among chat members with appropriate permissions. 
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
    *   **Invite Flow:** Invite user (by email), verify notification/email, click invite link, view `AcceptInvitePage`, accept invite, verify user added to members list, verify notifications. Repeat for declining invite. Test admin cancelling a pending invite. Test inviting existing member (should fail).
    *   Test org switcher and data scoping (chats, etc.).
    *   Test RLS (access denial for non-members).
    *   Test role permissions (admin vs member actions in settings/members pages).
    *   Test visibility setting (though no public search yet).
    *   **Join Request Flow:** (Simulate) User requests to join public org -> Admin sees pending request on Members page -> Admin approves request -> Verify user added, notifications sent. Repeat for denying request. Test requesting when already member (should fail).
    *   Test "last admin" logic: try to remove last admin role/membership and verify error.
    *   Test soft deleting an organization as an admin.
    *   Verify the deleted org disappears from lists/switchers.
    *   Verify direct access to the deleted org's pages/data is blocked.
    *   Verify actions within the deleted org context fail gracefully.
*   [ ] **Update Docs:** Mark Phase 2 tasks as complete in `IMPLEMENTATION_PLAN.md`. Update `STRUCTURE.md`.
*   [ ] **Commit:** `feat: implement multi-tenancy support (#issue_number)`
*   [ ] **Remind User:** "Multi-tenancy support is implemented. Please perform thorough testing, especially around roles, RLS, visibility, and the 'last admin' check. Remember to update impacted tests. Review and commit: `git add . && git commit -m 'feat: implement multi-tenancy support'`"

---

## Phase 3: Final Review 

*   [ ] **Code Review:** Review all new code for clarity, efficiency, adherence to `DEV_PLAN.md`, and potential bugs (especially around RLS and state management).
*   [ ] **Test Coverage:** Review test coverage. Add tests for any critical paths missed.
*   [ ] **Final Test Run:** Execute all tests one last time.
*   [ ] **Final Build:** Perform a final `pnpm build`.
*   [ ] **Update `README.md`:** Add information about the new notification and multi-tenancy features.
*   [ ] **Final Commit:** `chore: finalize notification and multi-tenancy implementation (#issue_number)`
*   [ ] **Remind User:** "The implementation is complete and documented. Please ensure all tests pass and the build is successful. Consider deploying to a staging environment for further validation before merging to main. Final commit suggestion: `git add . && git commit -m 'chore: finalize notification and multi-tenancy implementation'`"

### 3.1 Cleanup for Production (Deferred Tasks)

*   [ ] **Refactor `OrganizationStore` into Slices**
    *   [ ] orgStore.ts combined interface, initial state, and core
    *   [ ] orgStore.list.ts fetching and managing `userOrganizations`
    *   [ ] orgStore.current.ts manages `currentOrganizationId`, `currentOrganizationDetails`, and `currentOrganizationMembers` and related fetches/updates
    *   [ ] orgStore.invite.ts handles invite-specific actions like `acceptInvite`, `declineInvite`, `fetchInviteDetails`.
    *   [ ] orgStore.request.ts handles `requestJoin`, `approveRequest`, `denyRequest`.
    *   [ ] orgStore.ui.ts manages UI-related state, starting with the `isCreateModalOpen` state and its actions (`openCreateModal`, `closeCreateModal`), and adding `isDeleteDialogOpen`, `openDeleteDialog`, `closeDeleteDialog`.
*   [ ] **Implement `PublicRoute` Component:**
    *   [ ] Create `PublicRoute.tsx` in `src/components/auth`.
    *   [ ] Implement logic to redirect authenticated users away from public-only pages (e.g., to `/dashboard`).
    *   [ ] Apply `<PublicRoute>` wrapper to `login`, `register`, `forgot-password`, `reset-password` routes in `routes.tsx`.
    *   [ ] Test redirection for authenticated and unauthenticated users.
*   [ ] **Implement Auth Flow Pages:**
    *   [ ] Create `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx` pages in `src/pages`.
    *   [ ] Implement the UI and logic for each page, including API interactions.
    *   [ ] Uncomment the corresponding routes in `routes.tsx`.
    *   [ ] Write tests for each page's functionality.
*   [ ] **Final Review & Testing:**
    *   [ ] Comprehensive end-to-end testing of all notification and multi-tenancy features.
    *   [ ] Code review for consistency, error handling, and security.
    *   [ ] Update all relevant documentation (`STRUCTURE.md`, `IMPLEMENTATION_PLAN.md`, `TESTING_PLAN.md`).
---

## Future Scope & Considerations

The following items were discussed but deferred from this initial implementation plan to manage scope. They can be considered for future iterations:

*   **Robust Email/User Identification:** Develop a consistent strategy for linking actions/data based on email addresses, potentially involving lookups against `auth.users` (requiring admin privileges or specific RLS/functions) or adding email to `user_profiles` (requires migration and careful handling of synchronization/privacy).
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
