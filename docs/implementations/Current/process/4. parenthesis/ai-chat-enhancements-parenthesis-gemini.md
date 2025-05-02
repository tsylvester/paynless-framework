# AI Chat Enhancements: PARENTHESIS Implementation Plan

## Preamble

This document outlines the detailed, step-by-step implementation plan for the AI Chat Enhancements project, based on the synthesized requirements (SYNTHESIS #1, #2, #3) and user feedback. It follows a Test-Driven Development (TDD) approach (Red -> Green -> Refactor) and adheres to the existing monorepo architecture (`Backend (Supabase Functions) <-> API Client (@paynless/api) <-> State (@paynless/store) <-> Frontend (apps/web)`).

**Goal:** To guide the development team through the implementation process, ensuring all requirements are met, code quality is maintained, and features are delivered reliably.

**Legend:**

*   [ ] Step / Task not started.
*   [✅] Step / Task completed successfully.
*   [🚧] Step / Task in progress or partially completed.
*   [⏸️] Step / Task paused due to a discovery requiring backtracking or clarification.
*   [❓] Step / Task blocked due to uncertainty requiring resolution before proceeding.
*   [🚫] Step / Task blocked due to an unresolved problem or unmet dependency.

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

**Branch:** `feature/org-chat-enhancements`

---

## Phase 1: Core Backend & Data Model for Org Context

**Goal:** Establish the database structure, RLS policies, and basic backend API endpoints required to support organization-scoped chats alongside personal chats.

**Step 1.1: Database Schema Changes for Org & System Prompt Association**
    *   [ ] **Step 1.1.1: [DB] Define Migration Script**
        *   [ ] Create a new migration file in `supabase/migrations/` (e.g., `YYYYMMDDHHMMSS_add_org_chat_support.sql`).
        *   [ ] Add SQL to `ALTER TABLE public.chats`:
            *   `ADD COLUMN organization_id UUID NULL REFERENCES public.organizations(id) ON DELETE SET NULL;` (REQ-TECH-1.1)
            *   `ADD COLUMN system_prompt_id UUID NULL REFERENCES public.system_prompts(id) ON DELETE SET NULL;` (REQ-TECH-1.2)
        *   [ ] Add SQL to `ALTER TABLE public.organizations`:
            *   `ADD COLUMN allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true;` (REQ-TECH-1.3)
        *   [ ] Add SQL to create indexes:
            *   `CREATE INDEX IF NOT EXISTS idx_chats_organization_id ON public.chats (organization_id);` (Consider index type based on common queries, maybe include `updated_at` if sorting/filtering is common: `(organization_id, updated_at DESC)`).
            *   *Self-Correction:* Index on `system_prompt_id` might be less critical unless filtering by it is common, defer if not immediately needed.
        *   [ ] Add corresponding `DROP COLUMN` / `DROP INDEX` statements in the `DOWN` section of the migration script (or verify Supabase handles this).
    *   [ ] **Step 1.1.2: [DB] Apply Migration**
        *   [ ] Apply the migration to the development/staging Supabase instance using Supabase CLI (`supabase db push` or `supabase migration up`).
        *   [ ] **Stop:** Manually verify in the Supabase Studio table editor that the columns `organization_id`, `system_prompt_id` exist on `chats` and `allow_member_chat_creation` exists on `organizations` with the correct types, nullability, and default values. Verify indexes exist.
    *   [ ] **Step 1.1.3: [COMMIT] Commit Schema Changes**
        *   [ ] Stage the new migration file (`supabase/migrations/YYYYMMDDHHMMSS_add_org_chat_support.sql`).
        *   [ ] Commit with message: `feat(DB): Add organization_id, system_prompt_id to chats; add allow_member_chat_creation to orgs`

**Step 1.2: Implement RLS Policies for `chats` Table**
    *   [ ] **Step 1.2.1: [BE] Verify/Create Helper Functions**
        *   [ ] Check `supabase/migrations/` for existing SQL functions:
            *   `public.is_org_member(org_id UUID, check_user_id UUID, required_status TEXT)` - Should return true if `check_user_id` is an active member of `org_id`.
            *   `public.get_user_role(check_user_id UUID, org_id UUID)` - Should return the role ('admin' or 'member') of `check_user_id` in `org_id`.
        *   [ ] If they don't exist or are incorrect, create/update them in a new migration file. Ensure they use `auth.uid()` implicitly where appropriate for RLS context and handle `NULL` inputs gracefully. Add tests for these functions if possible (e.g., using `pg_prove` if setup, otherwise manual testing).
        *   [ ] Commit helper function changes if any: `feat(DB): Add/Update RLS helper functions is_org_member, get_user_role`
    *   [ ] **Step 1.2.2: [TEST-INT] Define RLS Test Plan (Manual)**
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
    *   [ ] **Step 1.2.3: [BE] Implement RLS Policies**
        *   [ ] Create a new migration file (e.g., `YYYYMMDDHHMMSS_add_chat_rls.sql`).
        *   [ ] Add SQL: `ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;`
        *   [ ] Add SQL to `CREATE POLICY "Allow SELECT on own personal chats or member org chats"` ON `public.chats` FOR `SELECT` USING (
            (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
            (`organization_id` IS NOT NULL AND public.is_org_member(`organization_id`, auth.uid(), 'active'))
          );` (REQ-TECH-2.1 - SELECT)
        *   [ ] Add SQL to `CREATE POLICY "Allow INSERT on own personal chats or permitted org chats"` ON `public.chats` FOR `INSERT` WITH CHECK (
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
        *   [ ] Add SQL to `CREATE POLICY "Allow DELETE on own personal chats or admin org chats"` ON `public.chats` FOR `DELETE` USING (
            (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
            (`organization_id` IS NOT NULL AND public.is_org_member(`organization_id`, auth.uid(), 'active') AND public.get_user_role(auth.uid(), `organization_id`) = 'admin')
          );` (REQ-TECH-2.1 - DELETE)
        *   [ ] Add SQL to `CREATE POLICY "Allow UPDATE on own personal chats or admin org chats (metadata)"` ON `public.chats` FOR `UPDATE` USING (
            (`organization_id` IS NULL AND `user_id` = auth.uid()) OR
            (`organization_id` IS NOT NULL AND public.is_org_member(`organization_id`, auth.uid(), 'active') AND public.get_user_role(auth.uid(), `organization_id`) = 'admin')
          ) WITH CHECK (
            -- RLS applies to the row being updated. Admins can update org chat metadata.
            -- Users can update their own personal chat metadata.
            -- This policy implicitly prevents members from updating org chat metadata.
            true
          );` (REQ-TECH-2.1 - UPDATE)
    *   [ ] **Step 1.2.4: [BE] Apply RLS Migration**
        *   [ ] Apply the RLS migration using Supabase CLI.
    *   [ ] **Step 1.2.5: [TEST-INT] Execute Manual RLS Tests**
        *   [ ] **Stop:** Log in to Supabase Studio and execute the SQL queries defined in Step 1.2.2 AS EACH TEST USER.
        *   [ ] Document the results. If any test fails, debug the RLS policy SQL (or helper functions). Drop the policy, modify the SQL in the migration file, re-apply, and re-test (GREEN).
    *   [ ] **Step 1.2.6: [REFACTOR] Review RLS Policies**
        *   [ ] Review the final RLS policies for clarity, potential performance bottlenecks (e.g., ensure helper functions are efficient), and security completeness.
    *   [ ] **Step 1.2.7: [COMMIT] Commit RLS Policies**
        *   [ ] Stage the RLS migration file (`supabase/migrations/YYYYMMDDHHMMSS_add_chat_rls.sql`) and potentially the helper function migration file.
        *   [ ] Commit with message: `feat(BE): Implement RLS policies for chats table w/ manual tests`

**Step 1.3: Update Backend API Endpoints (Read Operations)**
    *   [ ] **Step 1.3.1: [TEST-UNIT] Define API Client (`ai.api.ts`) Unit Tests for Reads**
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
    *   [ ] **Step 1.3.2: [API] Modify `AiApiClient` Read Methods**
        *   [ ] Open `packages/api/src/ai.api.ts`.
        *   [ ] Modify `getChatHistory(organizationId?: string | null, options?: FetchOptions)`:
            *   Accept optional `organizationId` and `options`.
            *   Construct endpoint URL.
            *   Call `this.apiClient.get(endpoint, options)`. Let `apiClient` handle token from store.
        *   [ ] Modify `getChatMessages(chatId: string, organizationId?: string | null, options?: FetchOptions)`:
            *   Accept `chatId`, optional `organizationId` and `options`.
            *   Construct endpoint URL.
            *   Call `this.apiClient.get(endpoint, options)`.
    *   [ ] **Step 1.3.3: [TEST-UNIT] Run API Client Read Tests & Refactor**
        *   [ ] Run the unit tests. Debug/modify until they pass (GREEN).
        *   [ ] **[REFACTOR]** Ensure consistent error handling and response typing. Use shared `api` singleton.
    *   [ ] **Step 1.3.4: [COMMIT] Commit API Client Read Method Updates**
        *   [ ] Stage changes in `packages/api/src/ai.api.ts` and its test file.
        *   [ ] Commit with message: `feat(API): Add optional organizationId param to AiApiClient read methods`
    *   [ ] **Step 1.3.5: [TEST-INT] Define Edge Function Integration Tests for Reads**
        *   [ ] Locate/create integration tests for Edge Functions.
        *   [ ] Write tests for `GET /chat-history`:
            *   Simulate requests with valid token and `?organizationId=OrgX`. Verify RLS filters correctly.
            *   Simulate requests with valid token and no `organizationId`. Verify only personal chats returned.
            *   Simulate requests with invalid token/permissions. Verify 4xx errors.
        *   [ ] Write tests for `GET /chat-details/:chatId`:
            *   Simulate requests with valid token, `chatId`, and matching `organizationId`. Verify messages returned.
            *   Simulate requests with valid token, `chatId` (personal), no `organizationId`. Verify messages returned.
            *   Simulate requests where `organizationId` doesn't match or user lacks access. Verify 404/403.
        *   [ ] Expect tests to fail (RED).
    *   [ ] **Step 1.3.6: [BE] Modify Read Edge Functions**
        *   [ ] Open `supabase/functions/chat-history/index.ts`.
        *   [ ] Get `organizationId` from query params. Get `userId` from auth context.
        *   [ ] Modify Supabase query:
            ```typescript
            // Auth handled by Supabase client automatically via token
            const { userId } = await getUser(req); // Assuming getUser handles auth verification
            if (!userId) return responses.unauthorized(); // Or handled by Supabase middleware

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
        *   [ ] Modify the Supabase client query for fetching messages (`supabaseClient.from('chat_messages').select(...).eq('chat_id', chatId)`).
        *   [ ] **Important:** Before fetching messages, perform a preliminary check on the `chats` table to ensure the user has access to the parent `chatId` *within the specified context* (personal or org). This prevents leaking information even if RLS on `chat_messages` relies on the parent chat access.
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

            // If access check passes, fetch messages
            const { data: messages, error: messagesError } = await supabaseClient
               .from('chat_messages')
               .select('*') // Assume RLS on chat_messages allows if user can access parent chat
               .eq('chat_id', chatId)
               .order('created_at', { ascending: true });
            // ... handle error and return messages
            ```
    *   [ ] **Step 1.3.7: [TEST-INT] Run Edge Function Read Tests & Refactor**
        *   [ ] Run the integration tests defined in Step 1.3.5. Debug/modify edge function logic until tests pass (GREEN).
        *   [ ] **[REFACTOR]** Review the edge function code. Ensure proper error handling (e.g., using `responses.ts` helpers), authentication checks (using `auth.ts` helpers), and clear Supabase query construction. Extract common logic if needed.
    *   [ ] **Step 1.3.8: [COMMIT] Commit Read Edge Function Updates**
        *   [ ] Stage `supabase/functions/chat-history/index.ts`, `supabase/functions/chat-details/index.ts`.
        *   [ ] Commit with message: `feat(BE): Update chat read Edge Functions to handle organizationId context w/ tests`

**Step 1.4: Update Backend API Endpoints (Write Operations - Delete & Chat Creation via `/chat`)**
    *   [ ] **Step 1.4.1: [TEST-UNIT] Define API Client (`ai.api.ts`) Unit Tests for Writes**
        *   [ ] Add/Update tests for `createChat`:
            *   Verify it calls `api.post` with `/chat`.
            *   Verify it sends `title`, `system_prompt_id`, and potentially `organizationId` in the request body.
            *   Verify it includes the `token` in `FetchOptions`.
        *   [ ] Add/Update tests for `deleteChat`:
            *   Verify calls `apiClient.delete` with `/chat-details/:chatId` or `/chat-details/:chatId?organizationId=...`.
            *   Verify uses singleton `apiClient`.
        *   [ ] Add/Update tests for `sendChatMessage`:
            *   Verify calls `apiClient.post` with `/chat`.
            *   Verify sends `message`, `providerId`, `promptId` (maps to `system_prompt_id`), `chatId` (optional), `organizationId` (optional, only if no `chatId`).
            *   Verify uses singleton `apiClient`.
        *   [ ] Mock `apiClient.post` and `apiClient.delete`. Expect failure (RED).
    *   [ ] **Step 1.4.2: [API] Modify `AiApiClient` Write Methods**
        *   [ ] **Remove `createChat` method.**
        *   [ ] Modify `deleteChat(chatId: string, organizationId?: string | null, options?: FetchOptions)`:
            *   Accept `chatId`, optional `organizationId` and `options`.
            *   Construct endpoint `/chat-details/${chatId}` or `/chat-details/${chatId}?organizationId=${organizationId}`.
            *   Call `this.apiClient.delete(endpoint, options)`.
        *   [ ] Modify `sendChatMessage(data: ChatApiRequest, options?: FetchOptions)`:
            *   Type `ChatApiRequest` should include optional `organizationId?: string | null`.
            *   Call `this.apiClient.post('/chat', data, options)`.
    *   [ ] **Step 1.4.3: [TEST-UNIT] Run API Client Write Tests & Refactor**
        *   [ ] Run unit tests. Debug until pass (GREEN).
        *   [ ] **[REFACTOR]** Align types, ensure `promptId` is correctly mapped/named if needed for backend (`system_prompt_id`).
    *   [ ] **Step 1.4.4: [COMMIT] Commit API Client Write Method Updates**
        *   [ ] Stage `packages/api/src/ai.api.ts` and test file.
        *   [ ] Commit: `refactor(API): Update AiApiClient sendMessage for creation; modify deleteChat signature`
    *   [ ] **Step 1.4.5: [TEST-INT] Define Edge Function Integration Tests for Writes**
        *   [ ] Write tests for `DELETE /chat-details/:chatId`: (Tests remain similar to before)
            *   Simulate delete requests for org/personal chats with correct/incorrect permissions/context. Verify RLS allows/denies. Check DB state.
        *   [ ] Write tests for `POST /chat`:
            *   **New Chat Scenario:** Simulate request with no `chatId`, but with `message`, `providerId`, `promptId` (as `system_prompt_id`), and `organizationId` (or null). Verify RLS on `chats` INSERT allows/denies. Verify `chats` record created. Verify `chat_messages` user message created. Verify AI call mocked/stubbed. Verify assistant message created. Verify response includes *new `chatId`* and assistant message.
            *   **Existing Chat Scenario:** Simulate request with `chatId`, `message`, `providerId`. Verify RLS on `chats` SELECT allows access. Verify user/assistant messages added to existing chat. Verify response contains assistant message.
        *   [ ] Expect tests to fail (RED).
    *   [ ] **Step 1.4.6: [BE] Implement/Modify Write Edge Functions**
        *   [ ] Modify `supabase/functions/chat-details/index.ts` to handle `DELETE`: (Logic remains similar, ensure RLS policy works)
            *   Get `chatId`, `organizationId`. Verify auth.
            *   Perform `supabaseClient.from('chats').delete().eq('id', chatId)`. RLS enforces permission.
            *   Return success/error.
        *   [ ] Modify `supabase/functions/chat/index.ts` (`POST /chat`):
            *   Read request body: `message`, `providerId`, `system_prompt_id` (map from `promptId` if needed), `chatId` (optional), `organizationId` (optional). Verify auth, get `userId`.
            *   **If `chatId` is null/missing (New Chat):**
                *   `INSERT INTO chats (user_id, organization_id, system_prompt_id, title)` -> RLS checks permission. Generate `title` (e.g., from first few words of `message`). Get `newChatId`.
                *   `INSERT INTO chat_messages (chat_id, user_id, role, content)` for user message.
                *   Construct history (just user message). Call AI Provider.
                *   `INSERT INTO chat_messages` for assistant response (with `ai_provider_id`, `token_usage`).
                *   Return `{ assistantMessage: {...}, chatId: newChatId }`.
            *   **If `chatId` is provided (Existing Chat):**
                *   Check user has SELECT access to `chatId` via RLS (`chats` table check). If not, return 403/404.
                *   `INSERT INTO chat_messages` for user message.
                *   Fetch *active* message history for `chatId`.
                *   Call AI Provider.
                *   `INSERT INTO chat_messages` for assistant response.
                *   Return `{ assistantMessage: {...} }` (chatId is already known).
    *   [ ] **Step 1.4.7: [TEST-INT] Run Edge Function Write Tests & Refactor**
        *   [ ] Run integration tests. Debug `/chat` and `/chat-details` DELETE logic until pass (GREEN).
        *   [ ] **[REFACTOR]** Ensure `/chat` handles both new/existing cases robustly. Clean up error handling. Ensure response format is consistent and includes `chatId` for new chats.
    *   [ ] **Step 1.4.8: [COMMIT] Commit Write Edge Function Updates**
        *   [ ] Stage `supabase/functions/chat/index.ts`, `supabase/functions/chat-details/index.ts`.
        *   [ ] Commit with message: `feat(BE): Modify POST /chat for creation; update DELETE /chat-details w/ tests`

**Phase 1 Complete Checkpoint:**
*   [ ] All Phase 1 tests (manual RLS, unit API Client, integration Edge Function) are passing.
*   [ ] Database schema is updated correctly.
*   [ ] RLS policies effectively enforce access control for personal and organization chats based on ownership, membership, role, and org settings.
*   [ ] Backend API endpoints (`/chat-history` GET, `/chat-details` GET/DELETE, `/chat` POST) correctly handle `organizationId` context, creation, and rely on RLS for permissions.
*   [ ] Code has been refactored, and commits made.
*   [ ] Run `npm test` in `packages/api`, run Edge Function tests. Restart dev server.

---
## Phase 2: State Management & Core UI Integration

**Goal:** Connect the frontend state (`@paynless/store`) and UI components (`apps/web`) to the organization context, enabling users to create, view, and manage chats within the correct scope.

**Architecture Note:** This phase heavily involves `packages/store` (Zustand) and `apps/web` (React components), ensuring data flows correctly from the API layer (updated in Phase 1) through the store to the UI. The `api` singleton from `@paynless/api` will be used within store actions.

**Step 2.1: Refactor State Management (`useAiStore`)**
    *   [ ] **Step 2.1.1: [TEST-UNIT] Define `useAiStore` Test Requirements for Org Context**
        *   [ ] Define test cases for the desired state structure. A partitioned approach seems best: `chatsByContext: { personal: Chat[], [orgId: string]: Chat[] }`, `messagesByChatId: { [chatId: string]: ChatMessage[] }`, `currentChatId: string | null`, `isLoadingByContext: { personal: boolean, [orgId: string]: boolean }`, etc.
        *   [ ] Define test cases for `selectChatHistoryList` selector:
            *   Mock `useOrganizationStore` to provide `currentOrganizationId`.
            *   Given `currentOrganizationId` is `null`, selector returns `state.chatsByContext.personal`.
            *   Given `currentOrganizationId` is 'org1', selector returns `state.chatsByContext.org1`.
            *   Handles empty lists gracefully.
        *   [ ] Define test cases for `selectCurrentChatMessages` selector: Returns messages from `state.messagesByChatId[state.currentChatId]`.
        *   [ ] Define test cases for actions (`loadChats`, `startNewChat`, `createChat`, `sendMessage`, `loadChatDetails`, `deleteChat`):
            *   Verify they accept `organizationId` where applicable.
            *   Verify they call the correct `api.ai()` methods with `organizationId`.
            *   Verify they update the correct state partitions (`chatsByContext`, `messagesByChatId`).
            *   Verify they manage loading states correctly (e.g., `isLoadingByContext`).
        *   [ ] Write these tests in `packages/store/src/aiStore.unit.test.ts`. Expect failure (RED).
    *   [ ] **Step 2.1.2: [STORE] Refactor `useAiStore` State Structure**
        *   [ ] Open `packages/store/src/aiStore.ts`.
        *   [ ] Modify state shape based on Step 2.1.1 (e.g., `chatsByContext`, `messagesByChatId`, `isLoadingByContext`, `newChatContext: string | null = null`).
        *   [ ] Update types in `packages/types/src/ai.types.ts` (`AiState`, `AiStore`).
    *   [ ] **Step 2.1.3: [STORE] Update `useAiStore` Selectors**
        *   [ ] Refactor `selectChatHistoryList`: Import `useOrganizationStore`. Return list based on `state.chatsByContext` and `useOrganizationStore.getState().currentOrganizationId`.
        *   [ ] Refactor `selectCurrentChatMessages`: Return `state.messagesByChatId[state.currentChatId] ?? []`.
        *   [ ] Add `selectIsHistoryLoading`: Return loading state based on `currentOrganizationId` and `state.isLoadingByContext`.
    *   [ ] **Step 2.1.4: [STORE] Update/Add `useAiStore` Actions**
        *   [ ] Modify `loadChats(organizationId: string | null)`:
            *   Accept `organizationId`. Set loading state `isLoadingByContext`. Call `api.ai().getChatHistory(token, organizationId)`. Update `chatsByContext[organizationId ?? 'personal']`. Clear loading state. Handle errors.
        *   [ ] Modify `startNewChat(organizationId: string | null)`:
            *   Accept `organizationId`. Set `state.currentChatId = null`, clear `currentChatMessages` (or rely on selector), set `state.newChatContext = organizationId`.
        *   [ ] Add `createChat(data: { title?: string; system_prompt_id?: string }, organizationId: string | null)`:
            *   Requires `token`. Calls `api.ai().createChat({ ...data, organizationId }, token)`.
            *   On success, adds the new chat to `chatsByContext`, sets `currentChatId`, clears `newChatContext`, potentially triggers `loadChatDetails`. Handles loading/errors. Returns the created `Chat`.
        *   [ ] Modify `sendMessage(data: { message: string; providerId: string; promptId: string; chatId?: string })`:
            *   Determine `organizationId`: if `!data.chatId`, use `state.newChatContext`; otherwise fetch chat from `state.chatsByContext` using `data.chatId` to find its `organizationId`.
            *   If it's a new chat (`!data.chatId`):
                *   Call `createChat` first (passing `system_prompt_id` from `data`). Get the `newChatId`.
                *   Then call `api.ai().sendChatMessage({ ...data, chatId: newChatId }, token, organizationId)`.
            *   If it's an existing chat:
                *   Call `api.ai().sendChatMessage(data, token, organizationId)`.
            *   Handle optimistic updates and final state updates for `messagesByChatId`. Handle loading/errors.
        *   [ ] Modify `sendMessage(data: { message: string; providerId: string; promptId: string /* Maps to system_prompt_id */; chatId?: string })`:
            *   Determine context: `currentChatId` or `newChatContext`.
            *   Prepare API payload: `chatApiRequest: ChatApiRequest`. Include `message`, `providerId`.
            *   If `!state.currentChatId` (new chat): add `organizationId: state.newChatContext`, `system_prompt_id: data.promptId` to `chatApiRequest`.
            *   Else (existing chat): add `chatId: state.currentChatId` to `chatApiRequest`.
            *   Optimistically add user message to `messagesByChatId`.
            *   Set `isLoadingAiResponse = true`.
            *   Call `api.ai().sendChatMessage(chatApiRequest)`.
            *   **On success:**
                *   Get `assistantMessage` and potentially `newChatId` from response.
                *   If `newChatId` exists:
                    *   Create a placeholder `Chat` object. Add to `chatsByContext`. Set `currentChatId = newChatId`. Clear `newChatContext`. **[ANALYTICS]** Trigger `new_chat_created` event here (pass `newChatId`, `organizationId`).
                *   Add `assistantMessage` to `messagesByChatId[currentChatId]`. Remove optimistic user message if needed, add final user message if backend returns it.
            *   Set `isLoadingAiResponse = false`. Handle errors (set `aiError`).
        *   [ ] Modify `loadChatDetails(chatId: string, organizationId: string | null)`:
            *   Accept context. Set `isDetailsLoading`. Call `api.ai().getChatMessages(chatId, organizationId)`. Update `messagesByChatId[chatId]`. Set `currentChatId = chatId`. Clear loading. Handle errors.
        *   [ ] Add `deleteChat(chatId: string, organizationId: string | null)`:
            *   Accept context. Call `api.ai().deleteChat(chatId, organizationId)`.
            *   On success: Remove chat from `chatsByContext`. If `chatId === currentChatId`, call `startNewChat(null)`. Handle loading/errors. **[ANALYTICS]** Trigger `chat_deleted` event (details in Step 2.5.3).
    *   [ ] **Step 2.1.5: [TEST-UNIT] Run `useAiStore` Tests & Refactor**
        *   [ ] Run tests. Debug until pass (GREEN). Focus on `sendMessage` logic for new/existing chats and response handling.
        *   [ ] **[REFACTOR]** Ensure state updates are clean. Handle API errors gracefully.
    *   [ ] **Step 2.1.6: [COMMIT] Commit `useAiStore` Refactoring**
        *   [ ] Stage `packages/store/src/aiStore.ts`, test file, types file.
        *   [ ] Commit: `refactor(STORE): Restructure useAiStore for organizational context w/ tests`
    *   [ ] **Step 2.1.7: (Optional) Refactor `useOrganizationStore`**
        *   [ ] Perform if needed. Commit: `refactor(STORE): Refactor useOrganizationStore for clarity (if applicable)`

**Step 2.2: Implement Chat Context Selection UI**
    *   [ ] **Step 2.2.1: [TEST-UNIT] Define `ChatContextSelector` Component Tests**
        *   [ ] Write tests in `apps/web/src/components/ai/ChatContextSelector.unit.test.tsx`.
        *   [ ] Test Cases: Renders `Select`, renders "Personal", renders org names from prop, displays correct value, calls `onContextChange` with `null` or `orgId`, handles loading/empty states. Expect failure (RED).
    *   [ ] **Step 2.2.2: [UI] Create `ChatContextSelector` Component**
        *   [ ] Create `apps/web/src/components/ai/ChatContextSelector.tsx`.
        *   [ ] Implement using `Select` from `shadcn/ui`. Props: `organizations`, `currentContextId`, `onContextChange`, `isLoading`. Render options.
    *   [ ] **Step 2.2.3: [TEST-UNIT] Run `ChatContextSelector` Tests & Refactor**
        *   [ ] Run tests. Debug until pass (GREEN).
        *   [ ] **[REFACTOR]** Ensure clarity, reusability, accessibility.
    *   [ ] **Step 2.2.4: [COMMIT] Commit `ChatContextSelector` Component**
        *   [ ] Stage component and test file.
        *   [ ] Commit: `feat(UI): Create reusable ChatContextSelector component w/ tests`
    *   [ ] **Step 2.2.5: [UI] Integrate `ChatContextSelector` for New Chat**
        *   [ ] In `AiChat.tsx` (or parent):
            *   Fetch orgs, `currentOrganizationId` from `useOrganizationStore`.
            *   Manage `nextChatOrgContext` local state, defaulting to `currentOrganizationId`.
            *   Render `<ChatContextSelector ... onContextChange={handleContextSelection} />`
            *   `handleContextSelection(newContextId)` function:
                *   `setNextChatOrgContext(newContextId)`.
                *   **[ANALYTICS]** Trigger `chat_context_selected` event (pass `newContextId`).
            *   "New Chat" button calls `useAiStore.getState().startNewChat(nextChatOrgContext)`.
    *   [ ] **Step 2.2.6: [TEST-INT] Test New Chat Context Selection (Manual)**
        *   [ ] Verify selector defaults correctly.
        *   [ ] Select "Personal", start new chat, send message. Verify chat created with `organization_id = null`.
        *   [ ] Select Org A, start new chat, send message. Verify chat created with `organization_id = OrgA.id`.
        *   [ ] Switch global context via `OrganizationSwitcher`. Verify selector updates.
    *   [ ] **Step 2.2.7: [COMMIT] Commit Chat Context Integration**
        *   [ ] Stage changes in parent component (e.g., `AiChat.tsx`).
        *   [ ] Commit: `feat(UI): Integrate ChatContextSelector for new chat creation`

**Step 2.3: Implement Segregated Chat History UI**
    *   [ ] **Step 2.3.1: [TEST-UNIT] Define `ChatHistory` Component Tests for Segregation**
        *   [ ] Write/Update tests in `apps/web/src/components/ai/ChatHistory.unit.test.tsx`.
        *   [ ] Test Cases: Fetches `currentOrganizationId`, calls `selectChatHistoryList`, renders "Personal" / "[Org Name]" sections (Tabs or headings), applies visual indicators to org chats, updates on context change, handles loading (Skeletons), handles errors (Boundary). Expect failure (RED).
    *   [ ] **Step 2.3.2: [UI] Modify `ChatHistory` Component**
        *   [ ] Open `apps/web/src/components/ai/ChatHistory.tsx`.
        *   [ ] Use `useOrganizationStore` (for `currentOrganizationId`, `currentOrganizationDetails.name`) and `useAiStore` (for `selectChatHistoryList`, `selectIsHistoryLoading`).
        *   [ ] Implement segregation (Tabs recommended). Filter list based on `currentOrganizationId`. Display org name.
        *   [ ] Add visual indicators to org chat items (modify `ChatItem` if needed).
        *   [ ] Use `useEffect` to call `loadChats(currentOrganizationId)` when `currentOrganizationId` changes.
    *   [ ] **Step 2.3.3: [UI] Implement Loading Skeletons and Error Boundary**
        *   [ ] Add `Skeleton` rendering when `isHistoryLoading`.
        *   [ ] Wrap list in `ErrorBoundary`.
    *   [ ] **Step 2.3.4: [TEST-UNIT] Run `ChatHistory` Tests & Refactor**
        *   [ ] Run tests. Debug until pass (GREEN).
        *   [ ] **[REFACTOR]** Review filtering, conditional rendering, `ChatItem` usage.
    *   [ ] **Step 2.3.5: [TEST-INT] Manual Testing for Chat History**
        *   [ ] Create personal and org chats (Org A, Org B).
        *   [ ] Verify display updates correctly when switching global context.
        *   [ ] Verify loading skeletons.
        *   [ ] Verify new chats appear dynamically (relies on `useAiStore` state updates).
    *   [ ] **Step 2.3.6: [COMMIT] Commit Segregated Chat History**
        *   [ ] Stage `ChatHistory.tsx`, test file, `ChatItem.tsx` (if changed), `ErrorBoundary.tsx`.
        *   [ ] Commit: `feat(UI): Implement segregated chat history view w/ context awareness, loading, and errors`

**Step 2.4: Display Active Chat Context & Handle Navigation**
    *   [ ] **Step 2.4.1: [TEST-UNIT] Define `AiChat` Component Tests for Context Display**
        *   [ ] Write/Update tests for `AiChat.tsx`. Test context display ("Personal" / "[Org Name] Chat"), system prompt loading, message rendering. Expect failure (RED).
    *   [ ] **Step 2.4.2: [UI] Modify `AiChat` Component for Context**
        *   [ ] Open `AiChat.tsx`. Get `currentChatId`, find chat details in `useAiStore.chatsByContext`. Get org name from `useOrganizationStore`.
        *   [ ] Display context header (REQ-ORG-1.2).
        *   [ ] Ensure click in `ChatHistory` calls `loadChatDetails` correctly (REQ-UX-1.3).
        *   [ ] Use `chat.system_prompt_id` for initial prompt selection (REQ-UX-1.5, REQ-UX-1.6).
    *   [ ] **Step 2.4.2b: [UI] Implement User Attribution Display**
        *   [ ] In `ChatMessageBubble.tsx` (or message rendering component):
            *   Check `message.role`. If 'user', potentially display user initials or a standard user icon. If 'assistant', display AI icon.
            *   In organization chats, if `message.role === 'user'`, use `message.user_id` to fetch user profile details (name/initials) from a shared cache or store if available, or display a generic indicator. *Decision:* Keep it simple for V1 - just differentiate user/assistant visually. Add initials if `user_profiles` are easily accessible in frontend state.
            *   *Action:* Add simple visual distinction (e.g., alignment, icon) between user and assistant messages. Add check for `message.user_id` and display initials if profile easily available.
    *   [ ] **Step 2.4.3: [UI] Implement Loading Skeletons and Error Boundary**
        *   [ ] Add `Skeleton` to message area when `isDetailsLoading`.
        *   [ ] Wrap main content in `ErrorBoundary`.
    *   [ ] **Step 2.4.4: [TEST-UNIT] Run `AiChat` Tests & Refactor**
        *   [ ] Run tests. Debug until pass (GREEN).
        *   [ ] **[REFACTOR]** Review context display logic, data fetching on navigation.
    *   [ ] **Step 2.4.5: [TEST-INT] Manual Testing for Navigation & Context Display**
        *   [ ] Click personal chat -> verify "Personal", messages, system prompt.
        *   [ ] Click org chat -> verify "[Org Name]", messages, system prompt.
        *   [ ] Verify loading skeletons. Test robustness switching chats.
    *   [ ] **Step 2.4.6: [COMMIT] Commit Active Context Display & Navigation**
        *   [ ] Stage `AiChat.tsx`, `ChatMessageBubble.tsx`, tests.
        *   [ ] Commit: `feat(UI): Display active chat context, user attribution, ensure correct state loading w/ loading & errors`

**Step 2.5: Implement Admin Controls UI**
    *   [ ] **Step 2.5.1: [TEST-UNIT] Define Admin Control Tests**
        *   [ ] **Chat Deletion Tests (`ChatHistory`/`ChatItem`):** Button visible only for admin on org chats in current context. Hidden otherwise. Click triggers confirmation/action.
        *   [ ] **Member Creation Toggle Tests (`OrganizationSettingsCard`):** Switch rendered, reflects fetched status, calls update action on toggle, disabled/hidden if not admin.
        *   [ ] **`useAiStore.deleteChat` Action Tests:** Calls `api.ai().deleteChat`, updates state, triggers analytics.
        *   [ ] **`useOrganizationStore.updateOrgSettings` Action Tests:** Calls `api.organizations().updateOrganization`, updates state, triggers analytics.
        *   [ ] Expect failure (RED).
    *   [ ] **Step 2.5.2: [UI] Implement Chat Deletion UI**
        *   [ ] In `ChatHistory.tsx` / `ChatItem.tsx`: Use `useOrganizationStore` to get `currentOrganizationId` and `currentUserRoleInOrg`.
        *   [ ] Conditionally render Delete button/menu item if `chat.organization_id === currentOrganizationId && currentUserRoleInOrg === 'admin'`.
        *   [ ] On click, show confirmation dialog (`AlertDialog` from `shadcn/ui`).
        *   [ ] On confirm, call `useAiStore.getState().deleteChat(chat.id, chat.organization_id)`.
    *   [ ] **Step 2.5.3: [ANALYTICS] Add `chat_deleted` Event**
        *   [ ] Implement in `useAiStore.deleteChat` action after successful API call. Include `context`, `deletedByRole`, `chatId`, `organizationId`.
    *   [ ] **Step 2.5.4: [UI] Implement Member Creation Toggle UI**
        *   [ ] Implement required backend/API first: `PUT /organizations/:orgId` endpoint and `api.organizations().updateOrganization`.
        *   [ ] In `OrganizationSettingsCard.tsx`:
            *   Fetch org details (including `allow_member_chat_creation`) using `useOrganizationStore`.
            *   Render `Switch` bound to this setting. Add label.
            *   On change, call `useOrganizationStore.getState().updateOrgSettings(orgId, { allow_member_chat_creation: newValue })`.
            *   Requires new API method `api.organizations().updateOrganization(orgId, data)` and backend `PUT /organizations/:orgId` endpoint (allowing update of specific fields like `name`, `visibility`, `allow_member_chat_creation` by admins). Implement these with TDD first.
            *   Disable/hide if user is not admin.
    *   [ ] **Step 2.5.5: [ANALYTICS] Add `member_chat_creation_toggled` Event**
        *   [ ] Implement in `useOrganizationStore.updateOrgSettings` action after successful API call. Include `organizationId`, `enabled`.
    *   [ ] **Step 2.5.6: [TEST-UNIT] Run Admin Control Tests & Refactor**
        *   [ ] Run tests for UI visibility, store actions, API client methods, backend endpoint. Debug until pass (GREEN).
        *   [ ] **[REFACTOR]** Review conditional logic, update flow, confirmation dialog usage.
    *   [ ] **Step 2.5.7: [TEST-INT] Manual Testing for Admin Controls**
        *   [ ] Test delete visibility/functionality as admin/member.
        *   [ ] Test settings toggle visibility/functionality as admin.
        *   [ ] Test member chat creation restriction: As member, try creating org chat when disabled (RLS should block).
        *   [ ] Verify analytics events.
    *   [ ] **Step 2.5.8: [COMMIT] Commit Admin Controls UI & Logic**
        *   [ ] Stage UI components, store actions, API methods, backend function, tests.
        *   [ ] Commit: `feat(FEAT): Implement admin delete chat UI and member chat creation toggle setting w/ tests & analytics`

**Phase 2 Complete Checkpoint:**
*   [ ] All Phase 2 tests passing.
*   [ ] Manual testing confirms all functionality from Step 2.1 to 2.5.
*   [ ] Code refactored, analytics integrated.
*   [ ] Run `npm test`, `npm run build`. Restart dev server.

## Phase 3: Core Chat Experience Enhancements

**Goal:** Implement key UX improvements identified in the requirements, focusing on core behavior fixes, Markdown support, and token tracking.

**Step 3.1: Fix Core Chat Behaviors**
    *   [ ] **Step 3.1.1: [TEST-UNIT] Define Tests for Core Behavior Fixes**
        *   [ ] **Default Loading (REQ-UX-1.1):** Test `AiChat` initial state sets default provider/prompt correctly (may need mocking of system defaults or user prefs if implemented).
        *   [ ] **Auto-Scroll (REQ-UX-1.4):** Add integration/component test for `MessageList` (or similar) component. Simulate adding new messages, assert `scrollTop` + `clientHeight` equals `scrollHeight` (or focuses the top of the new message). Test with short and long messages. *Self-Correction:* Focusing the *top* of the new message is harder to test precisely with `scrollTop`. An alternative is to ensure the *last element* is visible/in view, which usually achieves the goal. Let's test for last element visibility.
        *   [ ] **Dynamic History Update (REQ-UX-1.2):** Covered by `useAiStore` tests (action updates state) and `ChatHistory` tests (component re-renders from state). Add explicit test if needed.
        *   [ ] **System Prompt on Replay (REQ-UX-1.6):** Covered by `AiChat` tests (uses `chat.system_prompt_id`). Add explicit test if needed.
        *   [ ] Expect failure (RED).
    *   [ ] **Step 3.1.2: [UI] Implement Core Behavior Fixes**
        *   [ ] **Default Loading:** Ensure `AiChat` component correctly reads defaults (from store config, user prefs, or hardcoded) and sets initial state for provider/prompt selectors.
        *   [ ] **Auto-Scroll:** In the component displaying messages (e.g., `MessageList`), use `useEffect` dependency on message list length. Inside effect, get the container ref and the last message element ref. Use `lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });` to scroll the top of the last message into view.
        *   [ ] **Dynamic History/Replay:** Verify existing state logic handles these correctly. No new code likely needed if Phase 2 done right.
    *   [ ] **Step 3.1.3: [TEST-UNIT] Run Core Behavior Tests & Refactor**
        *   [ ] Run tests. Debug implementation until pass (GREEN). Pay close attention to scroll test reliability.
        *   [ ] **[REFACTOR]** Ensure scroll logic is clean and efficient. Extract to custom hook (`useScrollToBottom`) if complex.
    *   [ ] **Step 3.1.4: [COMMIT] Commit Core Behavior Fixes**
        *   [ ] Stage relevant component(s) (e.g., `AiChat.tsx`, `MessageList.tsx`) and test files.
        *   [ ] Commit: `fix(UI): Correct default loading, auto-scroll behavior, and dynamic history updates w/ tests`

**Step 3.2: Implement Markdown Rendering**
    *   [ ] **Step 3.2.1: [TEST-UNIT] Define Markdown Rendering Tests**
        *   [ ] Add tests for the message display component (`ChatMessageBubble`?).
        *   [ ] Test Cases: Input basic markdown (`**bold**`, `*italic*`, `- list`, `\n\`code\`````), verify rendered HTML contains correct tags (`<strong>`, `<em>`, `<li>`, `<code>`). Test handling of plain text, links, paragraphs. Expect failure (RED).
    *   [ ] **Step 3.2.2: [UI] Implement Markdown Rendering**
        *   [ ] Install `react-markdown` and potentially `remark-gfm` (for tables, strikethrough etc.): `pnpm add react-markdown remark-gfm` in `apps/web`.
        *   [ ] In the component rendering message content (`ChatMessageBubble`?):
            *   Import `ReactMarkdown` and `remarkGfm`.
            *   Replace direct rendering of `message.content` with `<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>`.
            *   Apply necessary styling for rendered markdown elements (check `shadcn/ui` theme or add custom CSS).
        *   [ ] **Security Note:** `react-markdown` handles sanitization by default. Ensure no dangerous plugins are added.
    *   [ ] **Step 3.2.3: [TEST-UNIT] Run Markdown Rendering Tests & Refactor**
        *   [ ] Run tests. Debug rendering/styling until pass (GREEN).
        *   [ ] **[REFACTOR]** Create a reusable `MarkdownRenderer` component if needed elsewhere. Ensure consistent styling.
    *   [ ] **Step 3.2.4: [COMMIT] Commit Markdown Rendering**
        *   [ ] Stage message component, test file, potentially styles.
        *   [ ] Commit: `feat(UI): Implement Markdown rendering for chat messages w/ tests`

**Step 3.3: Implement Token Usage Tracking & Display**
    *   [ ] **Step 3.3.1: [SETUP] Install Tokenizer Library**
        *   [ ] `pnpm add tiktoken` in `apps/web`.
    *   [ ] **Step 3.3.2: [TEST-UNIT] Define Token Estimation Tests**
        *   [ ] Create `apps/web/src/hooks/useTokenEstimator.unit.test.ts`.
        *   [ ] Test Cases: Hook takes text, returns estimated count using `tiktoken`. Test with sample strings, empty string, model variations if applicable. Mock `tiktoken` library. Expect failure (RED).
    *   [ ] **Step 3.3.3: [UI] Create `useTokenEstimator` Hook**
        *   [ ] Create `apps/web/src/hooks/useTokenEstimator.ts`.
        *   [ ] Import `getEncoding` from `tiktoken`. Initialize encoder (`encoding = getEncoding('cl100k_base')`).
        *   [ ] Hook takes `text: string`, returns `encoding.encode(text).length`. Handle errors/cleanup if needed. Memoize result.
    *   [ ] **Step 3.3.4: [TEST-UNIT] Run Token Estimator Hook Tests**
        *   [ ] Run tests. Debug hook until pass (GREEN).
    *   [ ] **Step 3.3.5: [UI] Integrate Token Estimator in Input**
        *   [ ] In the chat input component:
            *   Use `useTokenEstimator` hook with the current input value.
            *   Display the estimated count near the input field (REQ-UX-4.2). Update dynamically on type.
    *   [ ] **Step 3.3.6: [BE] Backend Token Parsing**
        *   [ ] In `supabase/functions/chat/index.ts` (message sending):
            *   After getting response from AI provider, attempt to parse `usage.prompt_tokens` and `usage.completion_tokens` (or similar fields based on provider API structure).
            *   Store this data (e.g., `{ prompt: number, completion: number, total: number }`) in the `token_usage` JSONB column when saving the `assistant` message to `public.chat_messages`. Requires adding `token_usage JSONB NULLABLE` to `chat_messages` table via migration (REQ-UX-4.4).
        *   [ ] **Add Migration:** Create migration to add `token_usage` column to `chat_messages`. Apply it.
    *   [ ] **Step 3.3.7: [API][STORE] Ensure Token Data Flow**
        *   [ ] Verify `ChatMessage` type in `packages/types` includes `token_usage?: { prompt: number, completion: number, total: number }`.
        *   [ ] Verify backend function returns `token_usage` in the response.
        *   [ ] Verify `AiApiClient.sendChatMessage` response includes it.
        *   [ ] Verify `useAiStore` updates `messagesByChatId` with the `token_usage` data. Add tests for this state update.
    *   [ ] **Step 3.3.8: [UI] Display Per-Message Token Count**
        *   [ ] In the message display component (`ChatMessageBubble`?):
            *   If `message.role === 'assistant'` and `message.token_usage`, display the completion count (e.g., "Tokens: {message.token_usage.completion}"). (REQ-UX-4.5).
    *   [ ] **Step 3.3.9: [TEST-UNIT] Define Cumulative Token Display Tests**
        *   [ ] Create test for a new component `ChatTokenUsageDisplay.tsx`.
        *   [ ] Test Cases: Takes `messages: ChatMessage[]` prop. Calculates sum of prompt tokens (from subsequent assistant message's `token_usage.prompt`), completion tokens, total tokens. Displays User/Assistant/Total counts correctly. Handles missing `token_usage` data. Expect failure (RED).
    *   [ ] **Step 3.3.10: [UI] Implement Cumulative Token Display**
        *   [ ] Create `apps/web/src/components/ai/ChatTokenUsageDisplay.tsx`.
        *   [ ] Implement logic to calculate cumulative counts based on the `messages` prop. Display User/Assistant/Total (REQ-UX-4.6).
        *   [ ] Integrate `ChatTokenUsageDisplay` into `AiChat.tsx`, passing the `currentChatMessages` from the store. Place it appropriately (e.g., footer).
    *   [ ] **Step 3.3.11: [TEST-UNIT] Run Cumulative Display Tests & Refactor**
        *   [ ] Run tests. Debug component logic until pass (GREEN).
        *   [ ] **[REFACTOR]** Optimize calculation if needed. Ensure clear display.
    *   [ ] **Step 3.3.12: [ANALYTICS] Add `token_usage_displayed` Event**
        *   [ ] Trigger this event when the `ChatTokenUsageDisplay` component mounts/updates or when per-message counts are rendered. Decide on granularity. Use `packages/analytics`.
    *   [ ] **Step 3.3.13: [TEST-INT] Manual Testing for Token Tracking**
        *   [ ] Send messages, verify estimated count updates.
        *   [ ] Verify assistant messages show completion tokens.
        *   [ ] Verify cumulative display updates correctly.
        *   [ ] Check database `chat_messages` table for persisted `token_usage` data.
        *   [ ] Verify analytics events.
    *   [ ] **Step 3.3.14: [COMMIT] Commit Token Tracking Feature**
        *   [ ] Stage hook, components, backend function, migration, store changes, tests, analytics calls.
        *   [ ] Commit: `feat(UX): Implement token estimation and usage display w/ tests & analytics`

**Step 3.4: Implement Chat Rewind/Reprompt (V1 - Replace)**
    *   [ ] **Step 3.4.1: [DB] Add `is_active_in_thread` Flag**
        *   [ ] Create migration to add `is_active_in_thread BOOLEAN NOT NULL DEFAULT true` to `public.chat_messages` (REQ-TECH-1.4).
        *   [ ] Add index if needed (e.g., `ON (chat_id, created_at) WHERE is_active_in_thread = true`).
        *   [ ] Apply migration.
    *   [ ] **Step 3.4.2: [TEST-UNIT] Define Rewind UI/Store Tests**
        *   [ ] Test UI element (button on user message) visibility/action (REQ-UX-5.1).
        *   [ ] Test action populates input with selected message (REQ-UX-5.2).
        *   [ ] Test "Resubmit" action trigger (REQ-UX-5.3).
        *   [ ] Test `useAiStore` action (`rewindAndSendMessage`) preparation logic.
        *   [ ] Test selectors (`selectCurrentChatMessages`) only return messages where `is_active_in_thread = true`. Expect failure (RED).
    *   [ ] **Step 3.4.3: [UI] Implement Rewind Trigger UI**
        *   [ ] Add a button/icon (e.g., "Edit" or "Rewind") to user message bubbles (`ChatMessageBubble`?).
        *   [ ] On click, call a new function in `AiChat.tsx` (e.g., `handleRewindSelect(messageId, messageContent)`).
        *   [ ] `handleRewindSelect`: Store `messageId` to rewind from in local state, set input field value to `messageContent`. Change submit button text to "Resubmit".
    *   [ ] **Step 3.4.4: [STORE] Update Selectors & Add Rewind Action**
        *   [ ] Modify `useAiStore.selectCurrentChatMessages` to filter `messagesByChatId[currentChatId]` by `message.is_active_in_thread === true`.
        *   [ ] Add new action `rewindAndSendMessage(originalMessageId: string, editedContent: string, providerId: string, promptId: string)`:
            *   Finds the original message index.
            *   Constructs history array *up to and including* the original message (but using `editedContent`).
            *   Calls a *new* API method `api.ai().rewindChat(chatId, originalMessageId, { message: editedContent, providerId, promptId }, options)`.
            *   On success, fetches updated chat details (or API returns new messages) and updates `messagesByChatId`, ensuring correct `is_active_in_thread` flags. Handles loading/errors. Trigger analytics.
    *   [ ] **Step 3.4.5: [API] Add `rewindChat` API Client Method**
        *   [ ] Add `rewindChat` method to `AiApiClient`.
        *   [ ] Calls a new backend endpoint, e.g., `POST /chat-details/:chatId/rewind`. Passes `originalMessageId`, new message data in body.
        *   [ ] Write unit tests for this method. Expect failure (RED). Run tests, implement, refactor (GREEN).
    *   [ ] **Step 3.4.6: [BE] Implement Rewind Backend Endpoint**
        *   [ ] Create `supabase/functions/chat-details/index.ts` handler for `POST /chat-details/:chatId/rewind`.
        *   [ ] Logic:
            *   Get `chatId`, `originalMessageId`, `editedContent`, `providerId`, `promptId` from request. Verify user access to chat via RLS.
            *   **Transaction Start:**
            *   Update `chat_messages`: `SET is_active_in_thread = false WHERE chat_id = :chatId AND created_at > (SELECT created_at FROM chat_messages WHERE id = :originalMessageId)`.
            *   Construct message history for AI call (fetching active messages up to `originalMessageId`). Replace user message content with `editedContent`.
            *   Call AI provider via `/chat` function logic (or reuse helper).
            *   Save new assistant response(s) with `is_active_in_thread = true`, `chat_id = :chatId`. Parse/save `token_usage`.
            *   **Transaction Commit.**
            *   Return new assistant message(s) or success indicator.
        *   [ ] Write integration tests for this endpoint. Expect failure (RED). Run tests, implement, refactor (GREEN).
    *   [ ] **Step 3.4.7: [UI] Implement Rewind Visual Indicator**
        *   [ ] If desired, add logic to detect gaps in `created_at` for active messages or store rewind points. Display indicator (e.g., horizontal line) (REQ-UX-5.5). Low priority.
    *   [ ] **Step 3.4.8: [ANALYTICS] Add `chat_rewind_used` Event**
        *   [ ] Trigger in `useAiStore.rewindAndSendMessage` action on success. Include `chatId`, `organizationId`. Use `packages/analytics`.
    *   [ ] **Step 3.4.9: [TEST-UNIT][TEST-INT] Run All Rewind Tests & Refactor**
        *   [ ] Ensure all tests (UI, Store, API, Backend) pass.
        *   [ ] **[REFACTOR]** Review transaction logic in backend, state updates in store, UI flow.
    *   [ ] **Step 3.4.10: [TEST-INT] Manual Testing for Rewind Feature**
        *   [ ] Rewind early message -> verify subsequent messages disappear, new response appears.
        *   [ ] Rewind latest message -> verify it's replaced.
        *   [ ] Check database `is_active_in_thread` flags.
        *   [ ] Verify token counts update correctly after rewind.
        *   [ ] Verify analytics.
    *   [ ] **Step 3.4.11: [COMMIT] Commit Rewind/Reprompt Feature**
        *   [ ] Stage UI, store, API, backend, migration, tests, analytics.
        *   [ ] Commit: `feat(FEAT): Implement chat rewind/reprompt (replace history) w/ tests & analytics`

**Phase 3 Complete Checkpoint:**
*   [ ] All Phase 3 tests passing.
*   [ ] Manual testing confirms core behaviors, markdown, token tracking, and rewind functionality.
*   [ ] Code refactored, analytics integrated.
*   [ ] Run `npm test`, `npm run build`. Restart dev server.

---

## Phase 4: Standardization, Cleanup & Testing

**Goal:** Ensure code quality, UI consistency using `shadcn/ui`, finalize testing procedures, and prepare for release.

**Step 4.1: UI Standardization (`shadcn/ui`)**
    *   [ ] **Step 4.1.1: [UI][REFACTOR] Review Components for ShadCN Consistency**
        *   [ ] Go through all components modified/created in `apps/web/src/components/ai/`, `apps/web/src/pages/AiChat.tsx`, and related areas.
        *   [ ] Replace any custom implementations of standard UI elements (Buttons, Selects, Dialogs, Inputs, Tabs, Skeletons, Switches, etc.) with the corresponding `shadcn/ui` components.
        *   [ ] Ensure consistent use of `shadcn/ui` styling, spacing, and theming utilities (`cn` function). (REQ-UX-2.1).
    *   [ ] **Step 4.1.2: [TEST-UNIT] Update Component Tests**
        *   [ ] Update unit/integration tests for components that were changed to use `shadcn/ui`. Ensure tests still pass and correctly reflect the new structure/props. Snapshot tests may need updating.
    *   [ ] **Step 4.1.3: [COMMIT] Commit UI Standardization**
        *   [ ] Stage modified components and tests.
        *   [ ] Commit: `style(UI): Ensure consistent shadcn/ui usage across chat features`

**Step 4.2: Final Code Review & Refactor**
    *   [ ] **Step 4.2.1: [REFACTOR] Code Review Sweep**
        *   [ ] Review all new/modified code across `supabase/functions/`, `packages/api/`, `packages/store/`, `packages/types/`, `apps/web/`.
        *   [ ] Check for: clarity, efficiency, adherence to project standards (`DEV_PLAN.md`), proper TypeScript usage (types, interfaces), error handling, logging (using `@paynless/utils logger`), potential race conditions, security considerations (input validation, RLS reliance), leftover TODOs/comments.
    *   [ ] **Step 4.2.2: [TEST-UNIT][TEST-INT] Test Coverage Review**
        *   [ ] Run code coverage reports (`npm run test:coverage` if configured).
        *   [ ] Identify critical paths or complex logic with low coverage.
        *   [ ] Add missing unit or integration tests to improve confidence. Focus on logic, edge cases, and error handling.
    *   [ ] **Step 4.2.3: [COMMIT] Commit Final Refactoring & Test Improvements**
        *   [ ] Stage refactored code and new/updated tests.
        *   [ ] Commit: `refactor: Final code cleanup and improvements for chat enhancements`

**Step 4.3: Final Manual Testing (Simulated E2E)**
    *   [ ] **Step 4.3.1: [TEST-E2E] Execute Comprehensive Manual Test Plan**
        *   [ ] Re-test all user flows defined in SYNTHESIS #2 (Admin, Member, Individual contexts).
        *   [ ] **Organization Context:**
            *   Create personal chat.
            *   Switch to Org A. Create org chat (as admin).
            *   Switch to Org B. Verify Org A chat not visible. Create Org B chat.
            *   Switch back to Org A. Verify Org A chat visible, Org B not.
            *   As Org A admin, disable member chat creation in settings.
            *   Log in as Org A member. Verify cannot create Org A chat.
            *   Log in as Org A admin. Re-enable member creation.
            *   Log in as Org A member. Verify *can* create Org A chat.
            *   Log in as Org A admin. Delete Org A chat created by member. Verify gone.
            *   Log in as Org A member. Verify chat is gone.
        *   [ ] **Core Chat Features:**
            *   Verify default provider/prompt load.
            *   Verify chat history loads correctly in each context.
            *   Test navigation between many chats.
            *   Test scrolling with long/short messages, fast submissions.
            *   Test Markdown rendering (bold, italic, list, code, link).
            *   Test token estimation, per-message display, cumulative display.
            *   Test Rewind/Reprompt: rewind early, rewind middle, rewind last. Verify history truncation.
        *   [ ] **Error Handling:**
            *   Simulate network errors (e.g., browser devtools offline mode) during message send/load. Verify error messages/boundaries.
            *   Attempt actions without permissions (e.g., member deleting org chat). Verify UI prevents or shows error.
            *   Test empty states (no chats, no messages).
        *   [ ] **UI Consistency:**
            *   Check `shadcn/ui` component usage, loading states (skeletons), context indicators.
    *   [ ] **Step 4.3.2: [FIX] Address Bugs Found**
        *   [ ] Create tickets/issues for any bugs found during testing.
        *   [ ] Fix critical bugs following TDD cycle.
    *   [ ] **Step 4.3.3: [COMMIT] Commit Bug Fixes**
        *   [ ] Commit fixes with appropriate messages: `fix: Address bugs found during final manual testing`

**Phase 4 Complete Checkpoint:**
*   [ ] All unit and integration tests passing.
*   [ ] Code coverage is satisfactory for critical paths.
*   [ ] Code has been reviewed and refactored for quality and consistency.
*   [ ] UI is standardized using `shadcn/ui`.
*   [ ] Comprehensive manual testing completed, critical bugs fixed.
*   [ ] Run `npm test`, `npm run build`. Restart dev server and perform quick smoke test.

---

## Phase 5: Stretch Goals (Optional - If Time Permits)

**Goal:** Implement `.md` file handling if core scope is complete, stable, and time allows.

**Step 5.1: .md Chat Export (Stretch)**
    *   [ ] **Step 5.1.1: [TEST-UNIT] Define Markdown Export Tests**
        *   [ ] Test utility function `formatChatToMarkdown(messages: ChatMessage[])`. Verify output format (e.g., "User:\n...", "Assistant:\n...") for various message sequences. Expect failure (RED).
    *   [ ] **Step 5.1.2: [UI] Implement Export Logic & UI**
        *   [ ] Add "Export as MD" button to `AiChat.tsx`.
        *   [ ] Create utility `formatChatToMarkdown` in `apps/web/src/lib/`. Implement formatting logic.
        *   [ ] On button click, call utility with `currentChatMessages`, create a `Blob`, generate a download link (`<a>` element), simulate click.
    *   [ ] **Step 5.1.3: [TEST-UNIT] Run Export Tests & Refactor**
        *   [ ] Run tests. Debug utility until pass (GREEN).
        *   [ ] **[REFACTOR]** Improve formatting, add options if needed.
    *   [ ] **Step 5.1.4: [TEST-INT] Manual Test Export**
        *   [ ] Export various chats. Verify file downloads and content format.
    *   [ ] **Step 5.1.5: [COMMIT] Commit Markdown Export Feature**
        *   [ ] Commit: `feat(STRETCH): Implement chat export to Markdown file w/ tests`

**Step 5.2: .md File Upload (Stretch - Requires Storage Setup)**
    *   [ ] **Step 5.2.1: [BE] Setup Supabase Storage**
        *   [ ] Create a new bucket (e.g., `chat_uploads`) in Supabase Studio.
        *   [ ] Define RLS policies for the bucket: Allow authenticated users to `INSERT` into a path like `user_id/*`. Allow `SELECT` only on own files. (Consult Supabase Storage RLS docs).
    *   [ ] **Step 5.2.2: [TEST-UNIT] Define Upload Component/Hook Tests**
        *   [ ] Test UI component renders file input (accepts `.md`).
        *   [ ] Test hook/logic calls Supabase storage client `upload` method on file selection. Handles success/error. Expect failure (RED).
    *   [ ] **Step 5.3.3: [UI] Implement Upload Component & Logic**
        *   [ ] Add file input button (restricted to `.md`) to chat input area.
        *   [ ] On file selection:
            *   Use Supabase client JS library (`supabase.storage.from('chat_uploads').upload(...)`) to upload file to user-specific path.
            *   On success, store file path/metadata temporarily (e.g., local state).
            *   Display indicator that file is attached. Allow removal.
    *   [ ] **Step 5.3.4: [BE][API][STORE] Modify Send Message Flow (Minimal V1)**
        *   [ ] Modify `sendMessage` (BE, API, Store) to optionally accept `attached_file_path: string`.
        *   [ ] Modify `chat_messages` table: Add `metadata JSONB NULLABLE` column if not present.
        *   [ ] Backend `chat` function: Save `attached_file_path` into `metadata` of the *user* message. (AI interaction with file content is out of scope for V1 stretch).
    *   [ ] **Step 5.3.5: [TEST-UNIT][TEST-INT] Run Upload Tests & Refactor**
        *   [ ] Run tests (UI, BE). Debug until pass (GREEN).
        *   [ ] **[REFACTOR]** Ensure secure upload, clear UI feedback.
    *   [ ] **Step 5.3.6: [TEST-INT] Manual Test Upload**
        *   [ ] Upload `.md` file. Verify UI indicator. Send message.
        *   [ ] Check `chat_messages` table `metadata` for file path.
        *   [ ] Check Supabase Storage bucket for uploaded file.
    *   [ ] **Step 5.3.7: [COMMIT] Commit Markdown Upload Feature**
        *   [ ] Commit: `feat(STRETCH): Implement basic .md file upload associated with chat messages (requires storage setup)`

**Phase 5 Complete Checkpoint:**
*   [ ] Stretch goals implemented (if applicable) and tested.
*   [ ] Core functionality remains stable.
*   [ ] Run `npm test`, `npm run build`.

---

## Post-Implementation

*   [ ] **Merge Branch:**
    *   [ ] Ensure feature branch is up-to-date with the main branch.
    *   [ ] Create Pull Request for `feature/org-chat-enhancements` into main.
    *   [ ] Perform final code review on PR. Address comments.
    *   [ ] Merge PR.
*   [ ] **Deployment:**
    *   [ ] Deploy changes to staging environment.
    *   [ ] Perform smoke testing on staging.
    *   [ ] Deploy changes to production environment.
    *   [ ] **REMINDER:** Communicate deployment to team. Remind them to pull changes, potentially run migrations locally if needed, restart servers.
*   [ ] **Monitoring:**
    *   [ ] Monitor application logs (Sentry, Supabase logs) for any new errors related to chat features.
    *   [ ] Monitor analytics dashboards (PostHog) for feature adoption (`chat_created`, `chat_rewind_used`, etc.) and any unexpected user behavior patterns.
*   [ ] **Documentation & Backlog:**
    *   [ ] Update user-facing documentation/guides for the new chat features.
    *   [ ] Update internal technical documentation if needed (e.g., architecture diagrams, store descriptions).
    *   [ ] Review "Out of Scope" items from SYNTHESIS #2. Create/update backlog items/tickets in project management tool for future implementation phases (Real-time collab, granular permissions, etc.).
*   [ ] **Feedback:**
    *   [ ] Announce new features to users/beta testers.
    *   [ ] Actively collect user feedback on the new organization features and chat enhancements. Use feedback to prioritize future backlog items.
*   [ ] **Commit Reminder:** Remind team to commit work regularly during future development.

