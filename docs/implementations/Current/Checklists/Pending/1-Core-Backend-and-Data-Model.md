# AI Chat Enhancements: PARENTHESIS Implementation Plan

## Preamble

This document outlines the detailed, step-by-step implementation plan for the AI Chat Enhancements project, based on the synthesized requirements (SYNTHESIS #1, #2, #3) and user feedback. It follows a Test-Driven Development (TDD) approach (Red -> Green -> Refactor) and adheres to the existing monorepo architecture (`Backend (Supabase Functions) <-> API Client (@paynless/api) <-> State (@paynless/store) <-> Frontend (apps/web)`).

**Goal:** To guide the development team through the implementation process, ensuring all requirements are met, code quality is maintained, and features are delivered reliably.

## Legend

*   [ ] Each work step will be uniquely named for easy reference 
    *   [ ] Worksteps will be nested as shown
        *   [ ] Nesting can be as deep as logically required 
*   [✅] Represents a completed step or nested set
*   [🚧] Represents an incomplete or partially completed step or nested set
*   [⏸️] Represents a paused step where a discovery has been made that requires backtracking 
*   [❓] Represents an uncertainty that must be resolved before continuing 
*   [🚫] Represents a blocked, halted, stopped step or nested set that has some unresolved problem or prior dependency to resolve before continuing

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

* **[DB]:** Database Schema Change (Migration)
* **[RLS]:** Row-Level Security Policy
* **[BE]:** Backend Logic (Edge Function / RLS / Helpers)
* **[API]:** API Client Library (`@paynless/api`)
* **[STORE]:** State Management (`@paynless/store`)
* **[UI]:** Frontend Component (`apps/web`)
* **[TEST-UNIT]:** Unit Test Implementation/Update
* **[TEST-INT]:** Integration Test Implementation/Update (API, Store-Component, RLS)
* **[ANALYTICS]:** Analytics Integration (`@paynless/analytics`)
* **[REFACTOR]:** Code Refactoring Step
* **[COMMIT]:** Checkpoint for Git Commit

**Core Principles:**

*   **TDD:** Write failing tests before implementation code (RED), write code to make tests pass (GREEN), then refactor (REFACTOR).
*   **Modularity:** Build reusable components, functions, and modules.
*   **Architecture:** Respect the existing API <-> Store <-> UI flow and the `api` Singleton pattern.
*   **Explicitness:** Leave nothing to assumption. Detail every sub-step.
*   **Testing:** Unit tests (`[TEST-UNIT]`) for isolated logic, Integration tests (`[TEST-INT]`) for interactions (API-Store, Store-UI, Backend Endpoints). E2E tests (`[TEST-E2E]`) are optional/manual for this phase.
*   **Analytics:** Integrate `packages/analytics` for all relevant user interactions (`[ANALYTICS]`).
*   **Commits:** Commit frequently after Green/Refactor stages with clear messages (`[COMMIT]`).
*   **Checkpoints:** Stop, run tests (`npm test`), build (`npm run build`), restart dev server after significant steps/phases.

**Reference Requirements:** Use REQ-XXX codes from SYNTHESIS #2 PRD for traceability.

**Branch:** `feature/ai-chat-org-integration` 

---

## Phase 1: Database & Backend Foundation

**Goal:** Establish the database structure, RLS policies, and basic backend API endpoints required to support organization-scoped chats alongside personal chats, including support for rewind and token tracking.

### STEP-1.1: Database Schema Updates [DB] [🚧]

#### STEP-1.1.1: Create Migration Script for Organization Integration [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file (filename format, up/down scripts)
* [ ] Create migration script to add `organization_id` column to `chats` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_organization_id_to_chats.sql`
  * [ ] Add `organization_id UUID NULLABLE REFERENCES public.organizations(id) ON DELETE SET NULL` (REQ-TECH-1.1)
  * [ ] Add index on `(organization_id, updated_at)` for efficient filtering (Gemini: `idx_chats_organization_id ON public.chats (organization_id)`)
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] **Stop:** Manually verify column and index in Supabase Studio.
* [ ] Commit changes with message "feat(DB): Add organization_id to chats table"

#### STEP-1.1.2: Create Migration Script for System Prompt Integration [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `system_prompt_id` column to `chats` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_system_prompt_id_to_chats.sql`
  * [ ] Add `system_prompt_id UUID NULLABLE REFERENCES public.system_prompts(id) ON DELETE SET NULL` (REQ-TECH-1.2)
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] **Stop:** Manually verify column in Supabase Studio.
* [ ] Commit changes with message "feat(DB): Add system_prompt_id to chats table"

#### STEP-1.1.3: Create Migration Script for Member Chat Creation Toggle [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `allow_member_chat_creation` column to `organizations` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_allow_member_chat_creation_to_organizations.sql`
  * [ ] Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true` (REQ-TECH-1.3)
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] **Stop:** Manually verify column in Supabase Studio.
* [ ] Commit changes with message "feat(DB): Add allow_member_chat_creation to organizations table"

#### STEP-1.1.4: Create Migration Script for Chat Rewind/Reprompt Support [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `is_active_in_thread` column to `chat_messages` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_is_active_flag_to_chat_messages.sql`
  * [ ] Add `is_active_in_thread BOOLEAN NOT NULL DEFAULT true` (REQ-TECH-1.4)
  * [ ] Add index `ON (chat_id, created_at) WHERE is_active_in_thread = true` (Suggested by Gemini Phase 3)
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] **Stop:** Manually verify column and index in Supabase Studio.
* [ ] Commit changes with message "feat(DB): Add is_active_in_thread to chat_messages table"

#### STEP-1.1.5: Create Migration Script for Token Tracking Support [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `token_usage` column to `chat_messages` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_token_usage_to_chat_messages.sql`
  * [ ] Add `token_usage JSONB NULLABLE` (REQ-UX-4.4 - From Gemini Phase 3)
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] **Stop:** Manually verify column in Supabase Studio.
* [ ] Commit changes with message "feat(DB): Add token_usage to chat_messages table"

### STEP-1.2: Database Helper Functions [BE] [🚧]

#### STEP-1.2.1: Create or Update Helper Function for Checking Organization Membership [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the `is_org_member` helper function
* [ ] Create or update the `is_org_member` function in a migration script:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_create_or_update_is_org_member_function.sql`
  * [ ] Function signature: `is_org_member(org_id UUID, user_id UUID, status TEXT DEFAULT 'active', role TEXT DEFAULT NULL)` (Claude version seems more flexible than Gemini's `required_status TEXT`)
  * [ ] Implementation: Query `organization_members` to check if the user has the specified status and role (if provided) in the organization. Ensure it uses `auth.uid()` implicitly where needed for RLS. Handle `NULL` inputs gracefully.
  * [ ] Return type: `BOOLEAN`
* [ ] Run the unit test to verify the function behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(BE): Create/update is_org_member helper function"

#### STEP-1.2.2: Create or Update Helper Function for Getting User Role [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the `get_user_role` helper function
* [ ] Create or update the `get_user_role` function in a migration script:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_create_or_update_get_user_role_function.sql`
  * [ ] Function signature: `get_user_role(user_id UUID, org_id UUID)`
  * [ ] Implementation: Query `organization_members` to get the user's role in the organization. Ensure it uses `auth.uid()` implicitly where needed for RLS. Handle `NULL` inputs gracefully.
  * [ ] Return type: `TEXT` (will be 'admin', 'member', or NULL if not a member)
* [ ] Run the unit test to verify the function behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(BE): Create/update get_user_role helper function"

### STEP-1.3: Row-Level Security (RLS) Implementation [RLS] [🚧]

#### STEP-1.3.1: [TEST-INT] Define RLS Test Plan (Manual) - *From Gemini 1.2.2*
*   [ ] Since automated RLS tests are not available, define manual SQL queries to execute in Supabase Studio SQL Editor *as different test users*.
*   [ ] Test Users Needed:
    *   User A (Regular User)
    *   User B (Regular User)
    *   User C (Admin of Org X)
    *   User D (Member of Org X)
    *   User E (Member of Org Y)
    *   User F (Inactive/Pending Member of Org X)
*   [ ] Test Data Needed:
    *   Personal Chat P1 (owned by User A)
    *   Personal Chat P2 (owned by User B)
    *   Org Chat O1 (org_id = Org X)
    *   Org Chat O2 (org_id = Org Y)
*   [ ] **SELECT Test Cases:**
    *   User A `SELECT * FROM chats`: Should see P1 only.
    *   User C `SELECT * FROM chats`: Should see O1 only (or potentially own personal chats if policy allows).
    *   User D `SELECT * FROM chats`: Should see O1 only.
    *   User E `SELECT * FROM chats`: Should see O2 only.
    *   User F `SELECT * FROM chats`: Should see *no* org chats.
*   [ ] **INSERT Test Cases (Relates to `POST /chat` first message):**
    *   User A attempts to create chat with `organization_id = NULL`: Should succeed via RLS check on `chats` insert.
    *   User A attempts to create chat with `organization_id = Org X`: Should FAIL via RLS check.
    *   User C attempts to create chat with `organization_id = Org X`: Should SUCCEED via RLS check.
    *   User D attempts to create chat with `organization_id = Org X` (WHEN `allow_member_chat_creation = true`): Should SUCCEED via RLS check.
    *   User D attempts to create chat with `organization_id = Org X` (WHEN `allow_member_chat_creation = false`): Should FAIL via RLS check.
    *   User F attempts to create chat with `organization_id = Org X`: Should FAIL via RLS check.
*   [ ] **DELETE Test Cases:**
    *   User A `DELETE FROM chats WHERE id = P1.id`: Should SUCCEED.
    *   User A `DELETE FROM chats WHERE id = P2.id`: Should FAIL (0 rows affected).
    *   User A `DELETE FROM chats WHERE id = O1.id`: Should FAIL.
    *   User C `DELETE FROM chats WHERE id = O1.id`: Should SUCCEED.
    *   User D `DELETE FROM chats WHERE id = O1.id`: Should FAIL.
*   [ ] **UPDATE Test Cases:** (Focus on `title`, `system_prompt_id` initially)
    *   User A `UPDATE chats SET title = 'New' WHERE id = P1.id`: Should SUCCEED.
    *   User A `UPDATE chats SET title = 'New' WHERE id = P2.id`: Should FAIL.
    *   User A `UPDATE chats SET title = 'New' WHERE id = O1.id`: Should FAIL.
    *   User C `UPDATE chats SET title = 'New', system_prompt_id = ... WHERE id = O1.id`: Should SUCCEED.
    *   User D `UPDATE chats SET title = 'New' WHERE id = O1.id`: Should FAIL (Members shouldn't edit org chat metadata unless specifically allowed later).

#### STEP-1.3.2: Implement RLS Policy for SELECT Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create migration script to add/modify RLS policy for `chats` table SELECT operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_select_rls_policy.sql`
  * [ ] Enable RLS: `ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;` (If not already enabled)
  * [ ] Policy: `CREATE POLICY "Allow SELECT on own personal chats or member org chats"` ON `public.chats` FOR `SELECT` USING (
      (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
      (`organization_id` IS NOT NULL AND public.is_org_member(`organization_id`, auth.uid(), 'active'))
    );` (REQ-TECH-2.1 - SELECT)
  * [ ] Include down migration script to reverse changes
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(RLS): Implement chat table SELECT policy for organization context"

#### STEP-1.3.3: Implement RLS Policy for INSERT Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create migration script to add/modify RLS policy for `chats` table INSERT operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_insert_rls_policy.sql`
  * [ ] Policy: `CREATE POLICY "Allow INSERT on own personal chats or permitted org chats"` ON `public.chats` FOR `INSERT` WITH CHECK (
      (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
      (
        `organization_id` IS NOT NULL AND
        public.is_org_member(`organization_id`, auth.uid(), 'active') AND
        (
          public.get_user_role(auth.uid(), `organization_id`) = 'admin' OR
          (
            public.get_user_role(auth.uid(), `organization_id`) = 'member' AND
            (SELECT allow_member_chat_creation FROM public.organizations WHERE id = `organization_id`)
          )
        )
      )
    );` (REQ-TECH-2.1 - INSERT)
  * [ ] Include down migration script to reverse changes
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(RLS): Implement chat table INSERT policy for organization context"

#### STEP-1.3.4: Implement RLS Policy for UPDATE Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create migration script to add/modify RLS policy for `chats` table UPDATE operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_update_rls_policy.sql`
  * [ ] Policy: `CREATE POLICY "Allow UPDATE on own personal chats or admin org chats (metadata)"` ON `public.chats` FOR `UPDATE` USING (
      (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
      (`organization_id` IS NOT NULL AND public.is_org_member(`organization_id`, auth.uid(), 'active') AND public.get_user_role(auth.uid(), `organization_id`) = 'admin')
    ) WITH CHECK (
      -- RLS applies to the row being updated. Admins can update org chat metadata.
      -- Users can update their own personal chat metadata.
      -- This policy implicitly prevents members from updating org chat metadata.
      true
    );` (REQ-TECH-2.1 - UPDATE)
  * [ ] Include down migration script to reverse changes
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(RLS): Implement chat table UPDATE policy for organization context"

#### STEP-1.3.5: Implement RLS Policy for DELETE Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create migration script to add/modify RLS policy for `chats` table DELETE operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_delete_rls_policy.sql`
  * [ ] Policy: `CREATE POLICY "Allow DELETE on own personal chats or admin org chats"` ON `public.chats` FOR `DELETE` USING (
      (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
      (`organization_id` IS NOT NULL AND public.is_org_member(`organization_id`, auth.uid(), 'active') AND public.get_user_role(auth.uid(), `organization_id`) = 'admin')
    );` (REQ-TECH-2.1 - DELETE)
  * [ ] Include down migration script to reverse changes
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(RLS): Implement chat table DELETE policy for organization context"

#### STEP-1.3.6: [TEST-INT] Execute Manual RLS Tests - *Based on Gemini 1.2.5*
*   [ ] **Stop:** Log in to Supabase Studio and execute the SQL queries defined in Step 1.3.1 AS EACH TEST USER.
*   [ ] Document the results. If any test fails, debug the RLS policy SQL (or helper functions). Drop the policy, modify the SQL in the migration file, re-apply, and re-test (GREEN).

#### STEP-1.3.7: Review RLS on Chat Messages [TEST-UNIT] [COMMIT]
* [ ] Create a unit test or manual test plan for the chat_messages RLS policies
* [ ] Create migration script to update RLS policies for `chat_messages` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chat_messages_rls_policies.sql`
  * [ ] Modify policies to ensure they correctly inherit access permissions from the parent `chats` record (via `chat_id`)
  * [ ] Update SELECT policy to follow the same rules as the `chats` table SELECT policy
  * [ ] Update INSERT policy to follow the same rules as the `chats` table SELECT policy (if user can view the chat, they can add messages)
  * [ ] For DELETE and UPDATE operations, add special handling for the rewind/reprompt feature (users should be able to modify/delete their own messages, check `is_active_in_thread`?)
  * [ ] Include down migration script to reverse changes
* [ ] Run the test(s) to verify the policy behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Test the policies with various scenarios
* [ ] Commit changes with message "feat(RLS): Update chat_messages RLS policies for organization context and rewind feature"

#### STEP-1.3.8: [REFACTOR] Review RLS Policies
*   [ ] Review the final RLS policies for clarity, potential performance bottlenecks (e.g., ensure helper functions are efficient), and security completeness.

#### STEP-1.3.9: [COMMIT] Commit RLS Policies
*   [ ] Stage the RLS migration files (`YYYYMMDDHHMMSS_update_chats_*.sql`, `YYYYMMDDHHMMSS_update_chat_messages_rls_policies.sql`) and potentially the helper function migration files.
*   [ ] Commit with message: `feat(RLS): Implement/Update RLS policies for chats and chat_messages tables w/ tests`

### STEP-1.4: Update Backend API Endpoints (Read Operations)

    *   [ ] **Step 1.4.1: [TEST-UNIT] Define API Client (`ai.api.ts`) Unit Tests for Reads**
        *   [ ] Locate tests for `AiApiClient` in `packages/api/src/ai.api.unit.test.ts` (create if none exist).
        *   [ ] Add/Update tests for `getChatHistory`:
            *   Verify it calls `apiClient.get` with `/chat-history` or `/chat-history?organizationId=...`.
            *   Verify it passes `organizationId` correctly.
            *   Verify it uses the singleton `apiClient` implicitly handling auth.
        *   [ ] Add/Update tests for `getChatMessages`:
            *   Verify it calls `apiClient.get` with `/chat-details/:chatId` or `/chat-details/:chatId?organizationId=...`.
            *   Verify it passes `chatId` and `organizationId` correctly.
            *   Verify it uses the singleton `apiClient`.
        *   [ ] Mock the base `apiClient.get` method using `vi.mock`. Expect tests to fail (RED).
    *   [ ] **Step 1.4.2: [API] Modify `AiApiClient` Read Methods**
        *   [ ] Open `packages/api/src/ai.api.ts`.
        *   [ ] Modify `getChatHistory(organizationId?: string | null, options?: FetchOptions)`:
            *   Accept optional `organizationId` and `options`.
            *   Construct endpoint URL.
            *   Call `this.apiClient.get(endpoint, options)`. Let `apiClient` handle token from store.
        *   [ ] Modify `getChatMessages(chatId: string, organizationId?: string | null, options?: FetchOptions)`:
            *   Accept `chatId`, optional `organizationId` and `options`.
            *   Construct endpoint URL.
            *   Call `this.apiClient.get(endpoint, options)`.
    *   [ ] **Step 1.4.3: [TEST-UNIT] Run API Client Read Tests & Refactor**
        *   [ ] Run the unit tests. Debug/modify until they pass (GREEN).
        *   [ ] **[REFACTOR]** Ensure consistent error handling and response typing. Use shared `api` singleton.
    *   [ ] **Step 1.4.4: [COMMIT] Commit API Client Read Method Updates**
        *   [ ] Stage changes in `packages/api/src/ai.api.ts` and its test file.
        *   [ ] Commit with message: `feat(API): Add optional organizationId param to AiApiClient read methods`
    *   [ ] **Step 1.4.5: [TEST-INT] Define Edge Function Integration Tests for Reads**
        *   [ ] Locate/create integration tests for Edge Functions.
        *   [ ] Write tests for `GET /chat-history`:
            *   Simulate requests with valid token and `?organizationId=OrgX`. Verify RLS filters correctly.
            *   Simulate requests with valid token and no `organizationId`. Verify only personal chats returned.
            *   Simulate requests with invalid token/permissions. Verify 4xx errors.
        *   [ ] Write tests for `GET /chat-details/:chatId`:
            *   Simulate requests with valid token, `chatId`, and matching `organizationId`. Verify messages returned.
            *   Simulate requests with valid token, `chatId` (personal), no `organizationId`. Verify messages returned.
            *   Simulate requests where `organizationId` doesn't match or user lacks access. Verify 404/403.
            *   Verify only messages where `is_active_in_thread = true` are returned (for rewind).
        *   [ ] Expect tests to fail (RED).
    *   [ ] **Step 1.4.6: [BE] Modify Read Edge Functions**
        *   [ ] Open `supabase/functions/chat-history/index.ts`.
        *   [ ] Get `organizationId` from query params. Get `userId` from auth context.
        *   [ ] Modify Supabase query to filter by `organization_id` when provided (as per Claude STEP-2.4.2):\
            ```typescript
            // ... Auth check ...
            const supabaseClient = createSupabaseClient(req);
            const url = new URL(req.url);
            const organizationId = url.searchParams.get('organizationId');

            let query = supabaseClient.from('chats').select('*');
            if (organizationId) {
              // RLS POLICY enforces SELECT access based on user's membership in organizationId
              query = query.eq('organization_id', organizationId);
            } else {
              // RLS POLICY enforces SELECT access based on user_id == auth.uid() for personal chats
              query = query.is('organization_id', null).eq('user_id', userId); // Explicit user check might be redundant but safe
            }
            query = query.order('updated_at', { ascending: false });
            const { data: chats, error } = await query;
            // ... handle error and return response
            ```
        *   [ ] Open `supabase/functions/chat-details/index.ts`.
        *   [ ] Get `chatId` from path parameters and `organizationId` from query parameters.
        *   [ ] Perform preliminary access check on the `chats` table using RLS (as per Gemini).\
            ```typescript
            // ... Auth check ...
            const supabaseClient = createSupabaseClient(req);
            const chatId = context.params.chatId; // Assuming Deno framework context
            const url = new URL(req.url);
            const organizationId = url.searchParams.get('organizationId');

    // Preliminary access check using RLS on 'chats'
    let chatCheckQuery = supabaseClient.from('chats').select('id').eq('id', chatId).maybeSingle();
    // RLS implicitly filters based on organizationId (if present) or user_id (if null)
    // We don't need to add explicit .eq('organization_id', ...) here as RLS handles it.
    const { data: chatAccess, error: chatAccessError } = await chatCheckQuery;

            if (chatAccessError || !chatAccess) {
               return responses.notFound('Chat not found or access denied');
            }
            ```
        *   [ ] Modify the Supabase client query for fetching messages to include `organizationId` validation and filter for `is_active_in_thread = true` (as per Claude STEP-2.4.3):\
            ```typescript
            // ... Inside access check block ...

            // If access check passes, fetch messages
            const { data: messages, error: messagesError } = await supabaseClient
               .from('chat_messages')
               .select('*') // Assume RLS on chat_messages allows if user can access parent chat
               .eq('chat_id', chatId)
               .eq('is_active_in_thread', true) // Only fetch active messages
               .order('created_at', { ascending: true });
            // ... handle error and return messages
            ```
    *   [ ] **Step 1.4.7: [TEST-INT] Run Edge Function Read Tests & Refactor**
        *   [ ] Run the integration tests defined in Step 1.4.5. Debug/modify edge function logic until tests pass (GREEN).
        *   [ ] **[REFACTOR]** Review the edge function code. Ensure proper error handling (e.g., using `responses.ts` helpers), authentication checks (using `auth.ts` helpers), and clear Supabase query construction. Extract common logic if needed.
    *   [ ] **Step 1.4.8: [COMMIT] Commit Read Edge Function Updates**
        *   [ ] Stage `supabase/functions/chat-history/index.ts`, `supabase/functions/chat-details/index.ts`.
        *   [ ] Commit with message: `feat(BE): Update chat read Edge Functions for org context & rewind w/ tests`

### STEP-1.5: Update Backend API Endpoints (Write Operations - Delete & Chat Creation via `/chat`)

#### STEP-1.5.1: [TEST-INT] Define Edge Function Integration Tests for Writes
* [ ] Write tests for `DELETE /chat-details/:chatId`: (Tests remain similar to before)
    *   Simulate delete requests for org/personal chats with correct/incorrect permissions/context. Verify RLS allows/denies. Check DB state.
* [ ] Write tests for `POST /chat`:
    *   **New Chat Scenario:** Simulate request with no `chatId`, but with `message`, `providerId`, `system_prompt_id`, and `organizationId` (or null). Verify RLS on `chats` INSERT allows/denies. Verify `chats` record created. Verify `chat_messages` user message created. Verify AI call mocked/stubbed. Verify assistant message created. Verify response includes *new `chatId`* and assistant message.
    *   **Existing Chat Scenario:** Simulate request with `chatId`, `message`, `providerId`. Verify RLS on `chats` SELECT allows access. Verify user/assistant messages added to existing chat. Verify response contains assistant message.
    *   **Rewind Scenario (From Gemini Phase 3):** Test the `POST /chat-details/:chatId/rewind` endpoint.
* [ ] Example Test Paths (Based on OpenAI 1.5.1):
    *   `supabase/functions/chat/test/chat.integration.test.ts`
    *   `supabase/functions/chat-details/test/chatDetails.integration.test.ts` (Include rewind tests here)
* [ ] Expect tests to fail (RED).

#### STEP-1.5.2: [BE] Modify Write Edge Functions
* [ ] Modify `supabase/functions/chat-details/index.ts` to handle `DELETE` (as per Claude STEP-2.4.4):\
    *   Get `chatId`, `organizationId`. Verify auth.
    *   Perform `supabaseClient.from('chats').delete().eq('id', chatId)`. RLS enforces permission.
    *   Return success/error.
* [ ] Modify `supabase/functions/chat/index.ts` (`POST /chat`) to handle creation, update, rewind, and token tracking (as per Claude STEP-2.4.1):\
    *   Read request body: `message`, `providerId`, `system_prompt_id` (optional), `chatId` (optional), `organizationId` (optional), `rewindFromMessageId` (optional).\
    *   Verify auth, get `userId`.\
    *   **If `rewindFromMessageId` is present:**\
        *   Start Transaction.\
        *   Update `chat_messages`: `SET is_active_in_thread = false WHERE chat_id = :chatId AND created_at > (SELECT created_at FROM chat_messages WHERE id = :rewindFromMessageId)`.\
        *   Fetch active history up to the original message.\
        *   Replace user message content with new `message`.\
        *   Call AI Provider (ensure history context is correct).\
        *   Save new assistant response with `is_active_in_thread = true`, `token_usage`.\
        *   Commit Transaction.\
        *   Return `{ assistantMessage: {...} }`.
    *   **Else If `chatId` is null/missing (New Chat):**\
        *   `INSERT INTO chats (user_id, organization_id, system_prompt_id, title)` -> RLS checks permission. Generate `title`. Get `newChatId`.\
        *   `INSERT INTO chat_messages (chat_id, user_id, role, content)` for user message.\
        *   Construct history. Call AI Provider.\
        *   `INSERT INTO chat_messages` for assistant response (with `token_usage`).\
        *   Return `{ assistantMessage: {...}, chatId: newChatId }`.
    *   **Else (`chatId` is provided - Existing Chat Update):**\
        *   Check user has SELECT access to `chatId` via RLS.\
        *   `INSERT INTO chat_messages` for user message.\
        *   Fetch *active* message history for `chatId`.\
        *   Call AI Provider.\
        *   `INSERT INTO chat_messages` for assistant response (with `token_usage`).\
        *   Return `{ assistantMessage: {...} }`.
* [ ] **Step 1.5.7: [TEST-INT] Run Edge Function Write Tests & Refactor**
    *   [ ] Run integration tests. Debug `/chat` and `/chat-details` DELETE logic until pass (GREEN).\
    *   [ ] **[REFACTOR]** Ensure `/chat` handles new/existing/rewind cases robustly. Clean up error handling. Ensure response format is consistent. Refactor AI call logic if needed.
* [ ] **Step 1.5.8: [COMMIT] Commit Write Edge Function Updates**
    *   [ ] Stage `supabase/functions/chat/index.ts`, `supabase/functions/chat-details/index.ts`.
    *   [ ] Commit with message: `feat(BE): Modify POST /chat & DELETE /chat-details for org context, rewind, tokens w/ tests`

**Phase 1 Complete Checkpoint:**
*   [ ] All Phase 1 tests (manual RLS, unit API Client, integration Edge Function) are passing.
*   [ ] Database schema is updated correctly for org context, rewind, and token tracking.
*   [ ] RLS policies effectively enforce access control for personal and organization chats based on ownership, membership, role, and org settings.
*   [ ] Backend API endpoints (`/chat-history` GET, `/chat-details` GET/DELETE, `/chat` POST) correctly handle `organizationId` context, creation, rewind, tokens, and rely on RLS for permissions.
*   [ ] Code has been refactored, and commits made.
*   [ ] Run `npm test` in `packages/api`, run Edge Function tests. Restart dev server.

</rewritten_file> 