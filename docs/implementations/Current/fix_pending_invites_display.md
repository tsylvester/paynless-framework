# Implementation Checklist: Fix Pending Invite Display (Denormalization)

**Goal:** Resolve the 500 error when fetching pending organization invites and ensure the inviter's email and name (if available) are correctly displayed, using denormalization.

**Approach:** Store a snapshot of the inviter's email and name directly on the `invites` table record when the invite is created.

---

**Phase 0: Update Tests (Write Failing Tests First)**

*   [x] **Identify Impacted Tests:** Locate test files for:
    *   `supabase/functions/organizations/invites.ts` (`handleListPending`, `handleCreateInvite`)
    *   `packages/store/src/organizationStore.ts` (action fetching pending invites)
    *   `apps/web/src/components/organizations/PendingActionsCard.tsx`
    *   `packages/types/src/...` (Invite/PendingInvite related types)
*   [x] **Modify `handleListPending` Backend Tests:**
    *   Update assertions to expect a successful API response (status 200).
    *   Update assertions to expect invite objects with flat properties: `inviter_email` (string | null), `inviter_first_name` (string | null), `inviter_last_name` (string | null).
    *   Assert that the nested `invited_by_profile` object is **not** present.
    *   *Verified failing.*
*   [x] **Modify `handleCreateInvite` Backend Tests:**
    *   Update assertions to check that the `invites` record created contains populated `inviter_email`, `inviter_first_name`, `inviter_last_name` columns (mock profile fetch as needed).
    *   *Verified failing.*
*   [ ] **Modify Store Tests (`organizationStore`):**
    *   Mock the API response for pending invites/actions with the new flat structure (`inviter_email`, etc.).
    *   Assert that the store state (`currentPendingInvites`) is updated correctly with this structure.
    *   *Verify these tests fail.*
*   [ ] **Modify Frontend Tests (`PendingActionsCard.tsx`):**
    *   Update test props/mocks to use the flat invite structure.
    *   Verify the component renders the inviter's name using `inviter_first_name`/`inviter_last_name`, falling back to `inviter_email`.
    *   *Verify these tests fail.*

**Phase 1: Database Migration**

*   [x] **Create Migration File:** Run `supabase migration new add_inviter_details_to_invites`.
*   [x] **Edit Migration File:** Add SQL to `ALTER TABLE public.invites` to add `inviter_email text`, `inviter_first_name text`, `inviter_last_name text` columns and comments.
*   [x] **Apply Migration:** Run `supabase db push` (or deploy migration).

**Phase 2: Backend Function Changes (`supabase/functions/organizations/invites.ts`)**

*   [x] **Modify `handleCreateInvite`:** Fetches profile and includes denormalized fields in insert.
*   [x] **Modify `handleListPending`:** Removed bad join, selects denormalized fields.
*   [x] **Run Backend Tests:** Tests updated in Phase 0 now pass.

**Phase 3: Types & Frontend Changes**

*   [x] **Update Types (`@paynless/types`):**
    *   Modify `Invite`/`PendingInviteWithInviter` types: add flat `inviter_email`, `inviter_first_name`, `inviter_last_name`; remove nested `invited_by_profile`.
*   [x] **Update Frontend (`PendingActionsCard.tsx`):**
    *   Update display logic to use `invite.inviter_first_name`, `invite.inviter_last_name`, falling back to `invite.inviter_email`.
*   [x] **Run Frontend/Store Tests:** Verify tests updated in Phase 0 now pass.

**Phase 4: Final Checks & Refactor**

*   [ ] Manually test the invite creation and pending actions display in the application.
*   [ ] Review and refactor code/tests as needed.
*   [ ] Commit changes.

--- 