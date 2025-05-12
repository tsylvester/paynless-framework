# PARENTHESIS Implementation Plan: AI Chat Enhancements

This document presents the detailed **PARENTHESIS (implementation plan)** for the AI Chat Enhancements project. It translates the PRD and high-level design into a comprehensive, step-by-step checklist following a **Test-Driven Development (TDD) RED→GREEN→REFACTOR** workflow. Each step includes clear **STOP / TEST / BUILD / COMMIT** markers and identifies impacted files and required tests.

## Legend
* [ ] pending
* [✅] complete
* [🚧] in progress
* [⏸️] paused
* [❓] uncertainty
* [🚫] blocked

---

## Phase 0: Project Setup & Planning

0.1 Confirm Development Environment Prerequisites  
  * STOP ➔ Verify Node.js (>=16.0), pnpm, Git installed.  
  * TEST ➔ Run `node -v`, `pnpm -v`, `git --version` and confirm versions meet requirements.  
  * BUILD ➔ N/A  
  * COMMIT ➔ N/A

0.2 Create Feature Branch  
  * STOP ➔ From `main`, create and switch to `feature/org-chat-enhancements`.  
  * TEST ➔ Run `git branch` to confirm `feature/org-chat-enhancements` is current.  
  * BUILD ➔ N/A  
  * COMMIT ➔ N/A

0.3 Install and Pin New Dependencies  
  * STOP ➔ Add to root `package.json` dependencies:  
    - `tiktoken` for client-side token estimation  
    - `react-markdown` for Markdown rendering  
  * TEST ➔ Run `pnpm install` | cat; ensure no errors.  
  * BUILD ➔ N/A  
  * COMMIT ➔ "chore: add tiktoken and react-markdown dependencies"

0.4 Validate CI & Development Tooling  
  * STOP ➔ Ensure existing CI pipeline runs all tests and builds successfully on new branch.  
  * TEST ➔ Push an empty commit (`git commit --allow-empty`) and observe CI run.  
  * BUILD ➔ N/A  
  * COMMIT ➔ N/A

---

## Phase 1: Database & Backend Foundation

### 1.1 Database Schema Migrations
1.1.1 [ ] STOP ➔ Create Supabase migration SQL file (`supabase/migrations/YYYYMMDDHHMMSS_add_org_and_system_prompt_to_chats.sql`):  
  - Add `organization_id UUID NULLABLE REFERENCES public.organizations(id) ON DELETE SET NULL` to `public.chats`.  
  - Create index on `public.chats(organization_id)`.  
  - Add `system_prompt_id UUID NULLABLE REFERENCES public.system_prompts(id) ON DELETE SET NULL` to `public.chats`.  
  - Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true` to `public.organizations`.
1.1.2 [ ] TEST ➔ Review migration SQL for correctness.  
  - Verify column names, data types, constraints, and indexes.  
1.1.3 [ ] BUILD ➔ Apply migration to the live Supabase database:  
  `supabase db push`  
  Verify in Supabase Studio that columns and index exist.  
1.1.4 [ ] COMMIT ➔ "feat(DB): Add organization_id, system_prompt_id to chats; allow_member_chat_creation to organizations"

### 1.2 RLS Policy Implementation for Chats
1.2.1 [ ] STOP ➔ Draft RLS policies in a new migration file (`supabase/migrations/YYYYMMDDHHMMSS_rls_chats_policies.sql`):  
  - CREATE POLICY "Chats SELECT" ON `public.chats` FOR SELECT USING (  
      `(organization_id IS NULL AND user_id = auth.uid()) OR public.is_org_member(organization_id, auth.uid(), 'active')`  
    );  
  - CREATE POLICY "Chats INSERT" ON `public.chats` FOR INSERT WITH CHECK (  
      `(organization_id IS NULL AND user_id = auth.uid()) OR (`  
      `public.is_org_member(organization_id, auth.uid(), 'active') AND (`  
      `public.get_user_role(auth.uid(), organization_id) = 'admin' OR (`  
      `public.get_user_role(auth.uid(), organization_id) = 'member' AND (`  
      `(SELECT allow_member_chat_creation FROM public.organizations WHERE id = organization_id)`  
      `)`  
      `)`  
      `)`  
    );  
  - CREATE POLICY "Chats UPDATE" ON `public.chats` FOR UPDATE USING (  
      /* allow owner or org admin to update title/system_prompt_id */  
      `(organization_id IS NULL AND user_id = auth.uid()) OR (`  
      `public.is_org_member(organization_id, auth.uid(), 'active') AND public.get_user_role(auth.uid(), organization_id) = 'admin'`  
      `)`  
    );  
  - CREATE POLICY "Chats DELETE" ON `public.chats` FOR DELETE USING (  
      `(organization_id IS NULL AND user_id = auth.uid()) OR (`  
      `public.is_org_member(organization_id, auth.uid(), 'active') AND public.get_user_role(auth.uid(), organization_id) = 'admin'`  
      `)`  
    );
1.2.2 [ ] TEST ➔ Write Edge Function integration tests simulating SELECT/INSERT/UPDATE/DELETE under:  
  - Personal chat owner scenario.  
  - Org member scenario (member & admin roles, creation toggled on/off).  
  - Unauthorized user scenario.  
  Store tests in:  
  `supabase/functions/chat-history/test/chatHistory.integration.test.ts`  
  `supabase/functions/chat/test/chat.integration.test.ts`
1.2.3 [ ] BUILD ➔ Apply RLS migration via `supabase db push`.  
1.2.4 [ ] COMMIT ➔ "feat(BE): Implement RLS policies for chats table"

### 1.3 Helper SQL Functions
1.3.1 [ ] STOP ➔ Create helper functions migration (`supabase/migrations/YYYYMMDDHHMMSS_create_org_helpers.sql`):  
  - Function `is_org_member(org_id UUID, user_id UUID, status TEXT) RETURNS BOOLEAN`.  
  - Function `get_user_role(user_id UUID, org_id UUID) RETURNS TEXT`.
1.3.2 [ ] TEST ➔ Manually execute SQL calls in Supabase SQL editor:  
  - `SELECT public.is_org_member('org-id', 'user-id', 'active');`  
  - `SELECT public.get_user_role('user-id', 'org-id');`
1.3.3 [ ] BUILD ➔ Push migration with `supabase db push`.  
1.3.4 [ ] COMMIT ➔ "feat(DB): Add is_org_member and get_user_role helper functions"

### 1.4 Edge Function - Read Operations
1.4.1 [ ] STOP ➔ Write integration tests for chat read endpoints:  
  - `GET /chat-history?organizationId=<orgId|null>` returns filtered chats.  
  - `GET /chat-details/:chatId` honors RLS and returns messages.  
  Place in:  
  `supabase/functions/chat-history/test/chatHistory.integration.test.ts`  
  `supabase/functions/chat-details/test/chatDetails.integration.test.ts`
1.4.2 [ ] BUILD ➔ Update Edge Functions:  
  - In `supabase/functions/chat-history/index.ts`, read `organizationId` from query (nullable).  
  - Use Supabase client: `.eq('organization_id', organizationId)` or `.is('organization_id', null)` when null.  
  - In `supabase/functions/chat-details/index.ts`, query `chat_messages` for given `chatId`.  
  - Ensure `.select()` includes `system_prompt_id` and `token_usage` fields.  
1.4.3 [ ] TEST ➔ Run integration tests via `pnpm supabase:function tests`.  
1.4.4 [ ] COMMIT ➔ "feat(BE): Update read edge functions to handle organization context"

### 1.5 Edge Function - Write Operations (Create & Delete)
1.5.1 [ ] STOP ➔ Write integration tests for chat create/delete endpoints:  
  - `POST /chat` with `{ organizationId, message, providerId, promptId }`; assert chat record created with correct `organization_id`.  
  - `DELETE /chat/:chatId?organizationId=<orgId|null>`; assert RLS enforcement for delete.  
  Place tests in:  
  `supabase/functions/chat/test/chat.integration.test.ts`  
  `supabase/functions/chat-history/test/chatHistory.integration.test.ts`
1.5.2 [ ] BUILD ➔ Update Edge Functions:  
  - In `supabase/functions/chat/index.ts`, accept optional `organizationId` in request body.  
  - Pass `organization_id` field in Supabase insert.  
  - Use RLS for permission enforcement.  
  - In `supabase/functions/chat/index.ts`, implement deletion handler when `method === 'DELETE'` and `chatId` param exists.  
  - Use Supabase delete with `.match({ id: chatId })` and respect `organizationId` context.
1.5.3 [ ] TEST ➔ Execute integration tests via `pnpm supabase:function tests`.  
1.5.4 [ ] COMMIT ➔ "feat(BE): Update chat create/delete edge functions to handle organization context"

---

## Phase 2: API Layer Implementation

### 2.1 Type Definitions for Organizational Context
2.1.1 [ ] STOP ➔ Update `Chat` and `ChatApiRequest` interfaces in `packages/types/src/ai.types.ts`:  
  - Add `organization_id?: string | null` to `Chat`.  
  - Add `organizationId?: string | null` to `ChatApiRequest` (extend existing fields).  
2.1.2 [ ] BUILD ➔ Run `pnpm tsc --noEmit` at repo root to verify type definitions compile without errors.  
2.1.3 [ ] COMMIT ➔ "refactor(types): add organization fields to Chat and ChatApiRequest"

### 2.2 Update AiApiClient Methods
2.2.1 [ ] STOP ➔ Modify `packages/api/src/ai.api.ts` in `AiApiClient`:  
  - Change `sendChatMessage(data: ChatApiRequest, options: FetchOptions)` to accept `data.organizationId` and include it in POST payload.  
  - Change `getChatHistory(token: string)` to `getChatHistory(token: string, organizationId?: string | null)`.  Build path as `/chat-history?organizationId=${organizationId ?? ''}`.  
  - Optionally modify `getChatMessages` signature to accept `organizationId?` and forward as query param in endpoint `chat-details/${chatId}?organizationId=...`.  
2.2.2 [ ] BUILD ➔ Run `pnpm tsc --noEmit` to ensure no type or import errors.  
2.2.3 [ ] COMMIT ➔ "feat(api): support organizationId in AI chat client methods"

### 2.3 Unit Tests for AiApiClient
2.3.1 [ ] STOP ➔ Write new tests in `packages/api/src/ai.api.test.ts` for:  
  - `getChatHistory` called with `organizationId` results in correct URL and options.  
  - `sendChatMessage` including `organizationId` in POST payload.  
2.3.2 [ ] BUILD ➔ Run `pnpm test --scope @paynless/api` and ensure all AiApiClient tests pass.  
2.3.3 [ ] COMMIT ➔ "test(api): add AiApiClient tests for organizationId support"

### 2.4 Integration Tests for Edge Function API Calls
2.4.1 [ ] STOP ➔ Extend existing Edge Function integration tests (Phase 1) to include cases where `organizationId` is passed via query or body and verify RLS filtering.  
  - Verify `/chat-history?organizationId` returns only org chats.  
  - Verify `/chat` POST with `organizationId` persists correct context.  
2.4.2 [ ] BUILD ➔ Run `pnpm supabase:function tests` for `chat`, `chat-history`, and `chat-details` suites.  
2.4.3 [ ] COMMIT ➔ "test(BE): add integration tests for organizationId in chat endpoints"

---

## Phase 3: State Management Updates

### 3.1 Refactor Organization Store (`useOrganizationStore`)
3.1.1 [ ] STOP ➔ Write unit tests for organization store modifications:  
  - Test selectors: `getCurrentOrganizationId()`, `getUserRole(orgId)`, `canCreateOrgChat(orgId)`.  
  - Test actions: `setCurrentOrganizationId(orgId)`, `toggleMemberChatCreation(bool)`.  
  Place tests in `packages/store/src/organizationStore.test.ts`.
3.1.2 [ ] BUILD ➔ Update `packages/store/src/organizationStore.ts`:  
  - Add `currentOrganizationId: string | null` to state.  
  - Add action `setCurrentOrganizationId(orgId: string | null)`.  
  - Add selector `getUserRole` reading from memberships.  
  - Add selector `canCreateOrgChat` reading `allow_member_chat_creation` property from current organization details.  
3.1.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/store` to ensure new organization store tests pass.  
3.1.4 [ ] COMMIT ➔ "refactor(store): add organization context to organizationStore"

### 3.2 Refactor AI Store (`useAiStore`)
3.2.1 [ ] STOP ➔ Write unit tests for context-aware chat state and selectors:  
  - Test new state shape: `{ personalChats: Chat[], orgChats: Record<string, Chat[]> }`.  
  - Test `selectChatHistoryList` returns `personalChats` when no org selected and `orgChats[currentOrgId]` when selected.  
  - Test `selectCurrentChatMessages` respects `currentOrganizationId`.  
  Place tests in `packages/store/src/aiStore.test.ts`.
3.2.2 [ ] BUILD ➔ Update `packages/store/src/aiStore.ts`:  
  - Change state: remove `chatHistoryList: Chat[]`, add `personalChats: Chat[]`, `orgChats: Record<string, Chat[]>`.  
  - Update actions: `loadChatHistory(organizationId?: string | null)` to fetch and assign to appropriate state slice.  
  - Update `startNewChat(organizationId?: string | null)` to clear `currentChatMessages` and form new chat in correct context.  
  - Refactor selectors `selectChatHistoryList` and `selectCurrentChatMessages` to use `currentOrganizationId` from `useOrganizationStore`.  
3.2.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/store` to ensure aiStore tests pass.  
3.2.4 [ ] COMMIT ➔ "refactor(store): restructure aiStore for organization context"

### 3.3 Store Integration Tests
3.3.1 [ ] STOP ➔ Write integration tests for coordination between org store and aiStore:  
  - Simulate setting `currentOrganizationId` then loading chat history and verify aiStore state updates in correct slice.  
  - Test that `loadChatHistory` without orgId populates `personalChats`.  
  Add tests in `packages/store/src/__integration__/orgAiStore.integration.test.ts`.
3.3.2 [ ] BUILD ➔ Implement integration test scenarios using Vitest.  
3.3.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/store` to ensure integration tests pass.  
3.3.4 [ ] COMMIT ➔ "test(store): add integration tests for organization and ai store interaction"

---

## Phase 4: UI Core Components

### 4.1 Chat Context Switcher Component
4.1.1 [ ] STOP ➔ Write unit tests for `ChatContextSelector` component:  
  - Renders "Personal" and list of organizations from `useOrganizationStore`.  
  - Calls `setCurrentOrganizationId` when selection changes.  
  Place tests in `apps/web/src/tests/unit/ChatContextSelector.test.tsx`.
4.1.2 [ ] BUILD ➔ Create `apps/web/src/components/ai/ChatContextSelector.tsx`:  
  - Use `shadcn/ui` `Select` component.  
  - Import `useOrganizationStore` for `currentOrganizationId`, `setCurrentOrganizationId`, and `organizations` list.  
4.1.3 [ ] TEST ➔ Run `pnpm test --scope apps/web` to ensure unit tests pass.  
4.1.4 [ ] COMMIT ➔ "feat(UI): add ChatContextSelector component"
4.1.5 [ ] BUILD ➔ Integrate `ChatContextSelector` in `apps/web/src/pages/AiChat.tsx` before new chat input.  
4.1.6 [ ] TEST ➔ Manual verify that context selection updates store value and UI.  
4.1.7 [ ] COMMIT ➔ "feat(UI): integrate ChatContextSelector into AiChat page"

### 4.2 Chat History List Update
4.2.1 [ ] STOP ➔ Write unit tests for updated `ChatHistory` component:  
  - Renders two sections: Personal and Organization when `currentOrganizationId` set.  
  - Visual indicators for context (icon or label).  
  Place tests in `apps/web/src/tests/unit/ChatHistory.test.tsx`.
4.2.2 [ ] BUILD ➔ Update `apps/web/src/components/ai/ChatHistory.tsx`:  
  - Use `selectChatHistoryList` from `useAiStore` with context parameter.  
  - Render list under appropriate heading.  
4.2.3 [ ] TEST ➔ Run `pnpm test --scope apps/web` to ensure unit tests pass.  
4.2.4 [ ] COMMIT ➔ "feat(UI): implement context-aware chat history list"

### 4.3 Chat Interface Updates
4.3.1 [ ] STOP ➔ Write unit tests for `AiChat` page/component:  
  - Displays active context name (Personal or Org).  
  - Loads `currentChatMessages` and `system_prompt_id`.  
  Place tests in `apps/web/src/tests/unit/AiChat.test.tsx`.
4.3.2 [ ] BUILD ➔ Update `apps/web/src/pages/AiChat.tsx`:  
  - Display context label in header.  
  - Pass correct `organizationId` to `sendMessage` action.  
  - Ensure `system_prompt_id` is loaded from chat details.  
4.3.3 [ ] TEST ➔ Run `pnpm test --scope apps/web` to ensure tests pass.  
4.3.4 [ ] COMMIT ➔ "feat(UI): display chat context and load system prompt"

### 4.4 Admin Controls in UI
4.4.1 [ ] STOP ➔ Write unit tests for delete chat control:  
  - Render delete button only for users with `admin` role for current org.  
  Place tests in `apps/web/src/tests/unit/ChatHistoryItem.test.tsx`.
4.4.2 [ ] BUILD ➔ Update `apps/web/src/components/ai/ChatHistoryItem.tsx`:  
  - Import `useOrganizationStore` to check user role.  
  - Conditionally render delete icon/button.  
  - On click, show confirmation dialog and call `deleteChat({ chatId, organizationId })` action.  
4.4.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`.  
4.4.4 [ ] COMMIT ➔ "feat(UI): add admin delete control to chat history items"

4.4.5 [ ] STOP ➔ Write unit tests for member chat creation toggle in organization settings:  
  - Toggle reflects `allow_member_chat_creation` state.  
  Place tests in `apps/web/src/tests/unit/OrganizationSettingsCard.test.tsx`.
4.4.6 [ ] BUILD ➔ Update `apps/web/src/components/organizations/OrganizationSettingsCard.tsx`:  
  - Import `useOrganizationStore` to get `allow_member_chat_creation` and action to update it.  
  - Render `Switch` component.  
  - On change, call new API client method `api.organizations().updateOrgSettings(orgId, { allow_member_chat_creation })`.  
4.4.7 [ ] TEST ➔ Run `pnpm test --scope apps/web`.  
4.4.8 [ ] COMMIT ➔ "feat(UI): add member chat creation toggle in organization settings"

### 4.5 UI Integration Tests for Core Components
4.5.1 [ ] STOP ➔ Write React Testing Library integration tests for end-to-end flow:  
  - Context switch updates history list.  
  - Selecting chat loads in `AiChat` with correct context.  
  - Admin delete flow works.  
  Place tests in `apps/web/src/tests/integration/ChatFlow.integration.test.tsx`.
4.5.2 [ ] BUILD ➔ Implement test scenarios with msw handlers mocking API responses and store mocks.  
4.5.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`.  
4.5.4 [ ] COMMIT ➔ "test(UI): add integration tests for chat context switch and admin controls"

---

## Phase 5: Bug Fixes Implementation

### 5.1 Homepage Default Choices Fix (REQ-UX-1.1)
5.1.1 [ ] STOP ➔ Write unit tests for Home page default prompt/provider:  
  - In `apps/web/src/pages/Home.tsx`, confirm default AI provider and system prompt are selected on initial render.  
  Place tests in `apps/web/src/tests/unit/HomeDefaultChoices.test.tsx`.
5.1.2 [ ] BUILD ➔ Update `Home.tsx`:  
  - Read default provider/prompt from `useAiStore` config or `authStore` preferences.  
  - Ensure controlled components (`Select` dropdowns) use these defaults.  
5.1.3 [ ] TEST ➔ Run `pnpm test --scope apps/web` to verify tests pass.  
5.1.4 [ ] COMMIT ➔ "fix(UI): load default AI provider and system prompt on Home"

### 5.2 Dynamic Chat History Updates (REQ-UX-1.2)
5.2.1 [ ] STOP ➔ Write unit tests for `ChatHistory` to assert new chats appear without refresh:  
  - Mock `useAiStore.loadChatHistory` to add a new chat and assert list updates.  
  Place tests in `apps/web/src/tests/unit/ChatHistoryDynamic.test.tsx`.
5.2.2 [ ] BUILD ➔ Ensure `useAiStore.sendMessage` action triggers a refresh or state insertion into `personalChats`/`orgChats`.  
  - Use `set((state) => ({ personalChats: [newChat, ...state.personalChats] }))`.  
5.2.3 [ ] TEST ➔ Run tests in `apps/web` and verify dynamic addition.  
5.2.4 [ ] COMMIT ➔ "fix(UI): dynamic update of chat history list"

### 5.3 Auto Navigation on Replay Fix (REQ-UX-1.3)
5.3.1 [ ] STOP ➔ Write unit tests for replay navigation in `ChatHistoryItem` click:  
  - Assert router navigate called with `/ai-chat?chatId=<id>&organizationId=<orgId>`.  
  Place tests in `apps/web/src/tests/unit/ChatHistoryItemNavigation.test.tsx`.
5.3.2 [ ] BUILD ➔ Update click handler:  
  - In `ChatHistoryItem.tsx`, call `navigate(`/ai-chat?chatId=${id}&organizationId=${orgId ?? ''}`)`.  
5.3.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`.  
5.3.4 [ ] COMMIT ➔ "fix(UI): correct auto navigation to chat on replay"

### 5.4 Chat Scrolling Fix (REQ-UX-1.4)
5.4.1 [ ] STOP ➔ Write unit tests for `MessageList` auto-scroll behavior:  
  - Simulate receiving new message and assert `scrollToElement(newMessageRef)` called.  
  Place tests in `apps/web/src/tests/unit/MessageListScroll.test.tsx`.
5.4.2 [ ] BUILD ➔ Update `MessageList` component:  
  - Use `useEffect` watching `currentChatMessages`, call `ref.current?.scrollIntoView({ block: 'start' })` on new message.  
5.4.3 [ ] TEST ➔ Run tests in `apps/web`.  
5.4.4 [ ] COMMIT ➔ "fix(UI): scroll to top of latest message on new arrival"

### 5.5 System Prompt Persistence (REQ-UX-1.5)
5.5.1 [ ] STOP ➔ Write unit tests for chat detail loading:  
  - Assert `systemPromptId` from `chatDetails` is set into `useAiStore` state on `loadChatDetails`.  
  Place tests in `apps/web/src/tests/unit/AiChatPromptPersistence.test.tsx`.
5.5.2 [ ] BUILD ➔ Update `chat-details` Edge Function to return `system_prompt_id`.  
  - Ensure SELECT includes `system_prompt_id` in `supabase/functions/chat-details/index.ts` SQL.  
  - Update `AiApiClient.getChatMessages` to parse and include `system_prompt_id`.  
  - In `useAiStore.loadChatDetails`, set `selectedSystemPromptId` state.  
5.5.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/api`, `@paynless/store`, and `apps/web`.  
5.5.4 [ ] COMMIT ➔ "feat(UX): persist and load system prompt with chat details"

### 5.6 System Prompt on Replay (REQ-UX-1.6)
5.6.1 [ ] STOP ➔ Write integration test for replay action including system prompt:  
  - Simulate clicking history item, loading chat, and assert prompt dropdown displays correct prompt.  
  Place tests in `apps/web/src/tests/integration/AiChatReplay.integration.test.tsx`.
5.6.2 [ ] BUILD ➔ Ensure `AiChat` uses `selectedSystemPromptId` state to set prompt selector value and to include it in subsequent `sendMessage` calls.  
5.6.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`.  
5.6.4 [ ] COMMIT ➔ "fix(UX): include system prompt in replayed chat session"

---

## Phase 6: UI Modernization

### 6.1 Shadcn/UI Component Conversion (REQ-UX-2.1)
6.1.1 [ ] STOP ➔ Inventory existing AI chat UI components for conversion:  
  - `apps/web/src/components/ai/ChatContextSelector.tsx`, `ChatHistory.tsx`, `ChatHistoryItem.tsx`, `MessageList.tsx`, `ChatInput.tsx`, etc.  
  - Write snapshot tests for visual baseline (use Vitest + jsdom).  
  Place tests in `apps/web/src/tests/unit/UIConversionSnapshot.test.tsx`.
6.1.2 [ ] BUILD ➔ Refactor each component to use `shadcn/ui` primitives (e.g., `Button`, `Select`, `Card`, `Input`).  
  - Preserve existing props and behavior.  
6.1.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`; confirm snapshot diffs show intended changes.  
6.1.4 [ ] COMMIT ➔ "refactor(UI): convert chat components to shadcn/ui primitives"

### 6.2 Loading Skeleton Components (REQ-UX-2.2)
6.2.1 [ ] STOP ➔ Write unit tests for skeleton states:  
  - Chat history skeleton in `ChatHistory` when `isHistoryLoading` true.  
  - Message area skeleton in `AiChat` when `isDetailsLoading` true.  
  Place tests in `apps/web/src/tests/unit/LoadingSkeletons.test.tsx`.
6.2.2 [ ] BUILD ➔ Implement `Skeleton` from `shadcn/ui` in:  
  - `ChatHistory.tsx`, `AiChat.tsx`, `ChatContextSelector.tsx`.  
6.2.3 [ ] TEST ➔ Run tests; ensure skeleton renders only during loading states.  
6.2.4 [ ] COMMIT ➔ "feat(UI): add loading skeletons to chat components"

### 6.3 Error Boundaries (REQ-UX-2.4)
6.3.1 [ ] STOP ➔ Write unit tests for error boundaries:  
  - Simulate error throw in child component and assert fallback UI.  
  Place tests in `apps/web/src/tests/unit/ErrorBoundary.test.tsx`.
6.3.2 [ ] BUILD ➔ Create `ErrorBoundary.tsx` component under `apps/web/src/components/common/`.  
  - Wrap `ChatHistory` and `AiChat` in `<ErrorBoundary>`.  
6.3.3 [ ] TEST ➔ Run tests; confirm fallback UI appears on thrown error.  
6.3.4 [ ] COMMIT ➔ "feat(UI): add React error boundaries around chat components"

---

## Phase 7: Advanced Features Implementation

### 7.1 Markdown Support (REQ-UX-3.1, REQ-UX-3.2)
7.1.1 [ ] STOP ➔ Write unit tests for message rendering:  
  - Input area preserves raw Markdown.  
  - `MessageBubble` renders Markdown syntax correctly (bold, lists, code blocks).  
  Place tests in `apps/web/src/tests/unit/MarkdownRendering.test.tsx`.
7.1.2 [ ] BUILD ➔ Integrate `react-markdown` in `MessageBubble.tsx`:  
  - Replace plain text with `<ReactMarkdown>` component.  
  - Sanitize content using `rehype-sanitize`.  
7.1.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`; verify Markdown cases.  
7.1.4 [ ] COMMIT ➔ "feat(UI): add Markdown rendering for chat messages"

### 7.2 Token Usage Tracking & Display (REQ-UX-4.1 → REQ-UX-4.6)
7.2.1 [ ] STOP ➔ Write unit tests for token estimator utility:  
  - Create tests for sample prompts counting tokens via `tiktoken`.  
  Place tests in `packages/utils/src/tokenizer.test.ts`.
7.2.2 [ ] BUILD ➔ Create `packages/utils/src/tokenizer.ts` exporting `estimateTokens(text: string): number`.  
7.2.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/utils`; ensure estimator works.  
7.2.4 [ ] BUILD ➔ In `ChatInput.tsx`, use `estimateTokens` and display dynamic token count.  
7.2.5 [ ] STOP ➔ Write unit tests for `TokenUsageDisplay` component:  
  - Renders per-message and cumulative tokens.  
  Place tests in `apps/web/src/tests/unit/TokenUsage.test.tsx`.
7.2.6 [ ] BUILD ➔ Implement `TokenUsageDisplay.tsx` under `apps/web/src/components/ai/`:  
  - Show `prompt_tokens`, `completion_tokens`, and totals.  
  - Fetch `token_usage` from message metadata.  
7.2.7 [ ] TEST ➔ Run `pnpm test --scope apps/web`; verify correct counts and styling.  
7.2.8 [ ] COMMIT ➔ "feat(UX): implement token estimation and usage display"

### 7.3 Chat Rewind/Reprompt (REQ-UX-5.1 → REQ-UX-5.5)
7.3.1 [ ] STOP ➔ Create migration to add `is_active_in_thread BOOLEAN NOT NULL DEFAULT true` to `public.chat_messages` (`supabase/migrations/YYYYMMDDHHMMSS_add_is_active_to_chat_messages.sql`).  
7.3.2 [ ] BUILD ➔ Apply migration via `supabase db push`.  
7.3.3 [ ] COMMIT ➔ "feat(DB): add is_active_in_thread flag to chat_messages"
7.3.4 [ ] STOP ➔ Write integration tests for rewind logic in Edge Function:  
  - POST `/chat` with `rewindFromMessageId` param and assert later messages marked inactive.  
  Place tests in `supabase/functions/chat/test/chat.integration.test.ts`.
7.3.5 [ ] BUILD ➔ Update `supabase/functions/chat/index.ts`:  
  - Accept `rewindFromMessageId` in request body.  
  - If present, run `update chat_messages set is_active_in_thread = false where chat_id = msg.chat_id and created_at > (SELECT created_at FROM chat_messages WHERE id = rewindFromMessageId)`.  
  - Build prompt history from active messages only.  
7.3.6 [ ] TEST ➔ Run `pnpm supabase:function tests`; ensure rewind integration tests pass.  
7.3.7 [ ] BUILD ➔ Update `useAiStore.sendMessage` to accept `rewindFromMessageId` param and replace `currentChatMessages` with active messages plus new ones.  
7.3.8 [ ] STOP ➔ Write unit tests for `useAiStore` rewind action:  
  - Simulate state before and after rewind.  
  Place tests in `packages/store/src/aiStore.test.ts`.
7.3.9 [ ] TEST ➔ Run `pnpm test --scope @paynless/store`; ensure tests pass.  
7.3.10 [ ] BUILD ➔ Update `ChatHistoryItem.tsx` or `MessageBubble.tsx` to include a "Rewind" button on user messages.  
7.3.11 [ ] STOP ➔ Write unit tests for rewind UI:  
  - Clicking "Rewind" populates `ChatInput` with that message.  
  Place tests in `apps/web/src/tests/unit/RewindUI.test.tsx`.
7.3.12 [ ] TEST ➔ Run `pnpm test --scope apps/web`; confirm UI behavior.  
7.3.13 [ ] COMMIT ➔ "feat(UX): implement chat rewind and reprompt functionality"

---

## Phase 8: Stretch Goals (Optional)

### 8.1 Markdown Chat Export (REQ-UX-6.2)
8.1.1 [ ] STOP ➔ Write unit tests for export utility:  
  - Convert array of `ChatMessage` to Markdown string.  
  Place tests in `packages/utils/src/exportChat.test.ts`.
8.1.2 [ ] BUILD ➔ Create `packages/utils/src/exportChat.ts`:  
  - Export `exportChatToMarkdown(messages: ChatMessage[]): string`.  
8.1.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/utils`.
8.1.4 [ ] BUILD ➔ Add "Export as MD" button in `AiChat.tsx`, call `exportChatToMarkdown`, and trigger file download.  
8.1.5 [ ] COMMIT ➔ "feat(stretch): add chat export to Markdown"

### 8.2 Markdown File Upload (REQ-UX-6.1)
8.2.1 [ ] STOP ➔ Write unit tests for file upload component:  
  - Accept only `.md` files.  
  Place tests in `apps/web/src/tests/unit/FileUpload.test.tsx`.
8.2.2 [ ] BUILD ➔ Add `FileUpload.tsx` under `apps/web/src/components/ai/`:  
  - Use `<input type="file" accept=".md" />`.  
  - On file selection, read text and send as `message` in `sendMessage` call.  
8.2.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`.
8.2.4 [ ] COMMIT ➔ "feat(stretch): implement Markdown file upload in chat"

---

## Phase 9: Integration, Testing & Finalization

### 9.1 End-to-End Integration Tests (E2E)
9.1.1 [ ] STOP ➔ Define E2E scenarios for:  
  - Personal chat creation & messaging.  
  - Org chat creation (admin & member roles).  
  - Context switching & history navigation.  
  - Markdown, token display, rewind functionality.  
  Place tests in `apps/web/src/tests/e2e/ChatFlows.e2e.ts`.
9.1.2 [ ] BUILD ➔ Implement E2E tests using Playwright or Cypress.  
9.1.3 [ ] TEST ➔ Run E2E suite via `pnpm e2e`; address any failures.  
9.1.4 [ ] COMMIT ➔ "test(e2e): add end-to-end tests for AI chat enhancements"

### 9.2 Analytics Integration Verification (REQ-TECH-6.1)
9.2.1 [ ] STOP ➔ Write unit tests mocking `packages/analytics` to assert events:  
  - `new_chat_created`, `chat_deleted`, `chat_context_selected`, `chat_rewind_used`, `token_usage_displayed`, `member_chat_creation_toggled`.  
  Place tests in `packages/analytics/src/analytics.test.ts`.
9.2.2 [ ] BUILD ➔ Instrument calls in:  
  - `ChatContextSelector`, `startNewChat` action, `deleteChat` action, rewind UI, token display component, settings toggle.  
9.2.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/analytics` and `apps/web`.  
9.2.4 [ ] COMMIT ➔ "test(analytics): verify analytics event triggers for chat enhancements"

### 9.3 Documentation and Guides
9.3.1 [ ] STOP ➔ Update `docs/` with:  
  - API client changes (`@paynless/api` README).  
  - Store usage examples (`@paynless/store` README).  
  - UI component usage.  
  Place documentation in `docs/implementations/Current/*` and code comments.  
9.3.2 [ ] BUILD ➔ Write guides and update `docs/README.md`.  
9.3.3 [ ] COMMIT ➔ "docs: update implementation and usage documentation for AI chat enhancements"

### 9.4 Final Review & Deployment
9.4.1 [ ] STOP ➔ Conduct peer code review of all changes.  
9.4.2 [ ] BUILD ➔ Merge `feature/org-chat-enhancements` into `main` after approvals.  
9.4.3 [ ] TEST ➔ Deploy to staging environment; smoke-test all chat features.  
9.4.4 [ ] COMMIT ➔ N/A (merge commit)
9.4.5 [ ] BUILD ➔ Deploy to production once staging verification completes.  

---

## Phase 10: Post-Implementation

### 10.1 Monitoring & Support
10.1.1 [ ] STOP ➔ Monitor logs (Sentry, Supabase logs) for errors in chat functions.  
10.1.2 [ ] BUILD ➔ Address any critical bugs as they appear.  
10.1.3 [ ] COMMIT ➔ "fix: address post-deployment chat issues"

### 10.2 Future Work Backlog
10.2.1 [ ] STOP ➔ Compile deferred features from PRD into issues:  
  - Real-time collaboration, granular permissions, ownership switching, advanced export formats, mobile optimizations.  
10.2.2 [ ] BUILD ➔ Create GitHub issues/tickets with acceptance criteria.  
10.2.3 [ ] COMMIT ➔ "chore: create backlog items for future chat enhancements"

---

**Reminder:** After each feature and fix, run tests (`pnpm test`, `pnpm supabase:function tests`, `pnpm e2e`), build the app (`pnpm build`), restart local server, and commit progress. Please commit regularly at logical checkpoints to maintain clear history.
7.2.6 [ ] BUILD ➔ Implement `TokenUsageDisplay.tsx` under `apps/web/src/components/ai/`:  
  - Show `prompt_tokens`, `completion_tokens`, and totals.  
  - Fetch `token_usage` from message metadata.  
7.2.7 [ ] TEST ➔ Run `pnpm test --scope apps/web`; verify correct counts and styling.  
7.2.8 [ ] COMMIT ➔ "feat(UX): implement token estimation and usage display"

### 7.3 Chat Rewind/Reprompt (REQ-UX-5.1 → REQ-UX-5.5)
7.3.1 [ ] STOP ➔ Create migration to add `is_active_in_thread BOOLEAN NOT NULL DEFAULT true` to `public.chat_messages` (`supabase/migrations/YYYYMMDDHHMMSS_add_is_active_to_chat_messages.sql`).  
7.3.2 [ ] BUILD ➔ Apply migration via `supabase db push`.  
7.3.3 [ ] COMMIT ➔ "feat(DB): add is_active_in_thread flag to chat_messages"
7.3.4 [ ] STOP ➔ Write integration tests for rewind logic in Edge Function:  
  - POST `/chat` with `rewindFromMessageId` param and assert later messages marked inactive.  
  Place tests in `supabase/functions/chat/test/chat.integration.test.ts`.
7.3.5 [ ] BUILD ➔ Update `supabase/functions/chat/index.ts`:  
  - Accept `rewindFromMessageId` in request body.  
  - If present, run `update chat_messages set is_active_in_thread = false where chat_id = msg.chat_id and created_at > (SELECT created_at FROM chat_messages WHERE id = rewindFromMessageId)`.  
  - Build prompt history from active messages only.  
7.3.6 [ ] TEST ➔ Run `pnpm supabase:function tests`; ensure rewind integration tests pass.  
7.3.7 [ ] BUILD ➔ Update `useAiStore.sendMessage` to accept `rewindFromMessageId` param and replace `currentChatMessages` with active messages plus new ones.  
7.3.8 [ ] STOP ➔ Write unit tests for `useAiStore` rewind action:  
  - Simulate state before and after rewind.  
  Place tests in `packages/store/src/aiStore.test.ts`.
7.3.9 [ ] TEST ➔ Run `pnpm test --scope @paynless/store`; ensure tests pass.  
7.3.10 [ ] BUILD ➔ Update `ChatHistoryItem.tsx` or `MessageBubble.tsx` to include a "Rewind" button on user messages.  
7.3.11 [ ] STOP ➔ Write unit tests for rewind UI:  
  - Clicking "Rewind" populates `ChatInput` with that message.  
  Place tests in `apps/web/src/tests/unit/RewindUI.test.tsx`.
7.3.12 [ ] TEST ➔ Run `pnpm test --scope apps/web`; confirm UI behavior.  
7.3.13 [ ] COMMIT ➔ "feat(UX): implement chat rewind and reprompt functionality"

---

## Phase 8: Stretch Goals (Optional)

### 8.1 Markdown Chat Export (REQ-UX-6.2)
8.1.1 [ ] STOP ➔ Write unit tests for export utility:  
  - Convert array of `ChatMessage` to Markdown string.  
  Place tests in `packages/utils/src/exportChat.test.ts`.
8.1.2 [ ] BUILD ➔ Create `packages/utils/src/exportChat.ts`:  
  - Export `exportChatToMarkdown(messages: ChatMessage[]): string`.  
8.1.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/utils`.
8.1.4 [ ] BUILD ➔ Add "Export as MD" button in `AiChat.tsx`, call `exportChatToMarkdown`, and trigger file download.  
8.1.5 [ ] COMMIT ➔ "feat(stretch): add chat export to Markdown"

### 8.2 Markdown File Upload (REQ-UX-6.1)
8.2.1 [ ] STOP ➔ Write unit tests for file upload component:  
  - Accept only `.md` files.  
  Place tests in `apps/web/src/tests/unit/FileUpload.test.tsx`.
8.2.2 [ ] BUILD ➔ Add `FileUpload.tsx` under `apps/web/src/components/ai/`:  
  - Use `<input type="file" accept=".md" />`.  
  - On file selection, read text and send as `message` in `sendMessage` call.  
8.2.3 [ ] TEST ➔ Run `pnpm test --scope apps/web`.
8.2.4 [ ] COMMIT ➔ "feat(stretch): implement Markdown file upload in chat"

---

## Phase 9: Integration, Testing & Finalization

### 9.1 End-to-End Integration Tests (E2E)
9.1.1 [ ] STOP ➔ Define E2E scenarios for:  
  - Personal chat creation & messaging.  
  - Org chat creation (admin & member roles).  
  - Context switching & history navigation.  
  - Markdown, token display, rewind functionality.  
  Place tests in `apps/web/src/tests/e2e/ChatFlows.e2e.ts`.
9.1.2 [ ] BUILD ➔ Implement E2E tests using Playwright or Cypress.  
9.1.3 [ ] TEST ➔ Run E2E suite via `pnpm e2e`; address any failures.  
9.1.4 [ ] COMMIT ➔ "test(e2e): add end-to-end tests for AI chat enhancements"

### 9.2 Analytics Integration Verification (REQ-TECH-6.1)
9.2.1 [ ] STOP ➔ Write unit tests mocking `packages/analytics` to assert events:  
  - `new_chat_created`, `chat_deleted`, `chat_context_selected`, `chat_rewind_used`, `token_usage_displayed`, `member_chat_creation_toggled`.  
  Place tests in `packages/analytics/src/analytics.test.ts`.
9.2.2 [ ] BUILD ➔ Instrument calls in:  
  - `ChatContextSelector`, `startNewChat` action, `deleteChat` action, rewind UI, token display component, settings toggle.  
9.2.3 [ ] TEST ➔ Run `pnpm test --scope @paynless/analytics` and `apps/web`.  
9.2.4 [ ] COMMIT ➔ "test(analytics): verify analytics event triggers for chat enhancements"

### 9.3 Documentation and Guides
9.3.1 [ ] STOP ➔ Update `docs/` with:  
  - API client changes (`@paynless/api` README).  
  - Store usage examples (`@paynless/store` README).  
  - UI component usage.  
  Place documentation in `docs/implementations/Current/*` and code comments.  
9.3.2 [ ] BUILD ➔ Write guides and update `docs/README.md`.  
9.3.3 [ ] COMMIT ➔ "docs: update implementation and usage documentation for AI chat enhancements"

### 9.4 Final Review & Deployment
9.4.1 [ ] STOP ➔ Conduct peer code review of all changes.  
9.4.2 [ ] BUILD ➔ Merge `feature/org-chat-enhancements` into `main` after approvals.  
9.4.3 [ ] TEST ➔ Deploy to staging environment; smoke-test all chat features.  
9.4.4 [ ] COMMIT ➔ N/A (merge commit)
9.4.5 [ ] BUILD ➔ Deploy to production once staging verification completes.  

---

## Phase 10: Post-Implementation

### 10.1 Monitoring & Support
10.1.1 [ ] STOP ➔ Monitor logs (Sentry, Supabase logs) for errors in chat functions.  
10.1.2 [ ] BUILD ➔ Address any critical bugs as they appear.  
10.1.3 [ ] COMMIT ➔ "fix: address post-deployment chat issues"

### 10.2 Future Work Backlog
10.2.1 [ ] STOP ➔ Compile deferred features from PRD into issues:  
  - Real-time collaboration, granular permissions, ownership switching, advanced export formats, mobile optimizations.  
10.2.2 [ ] BUILD ➔ Create GitHub issues/tickets with acceptance criteria.  
10.2.3 [ ] COMMIT ➔ "chore: create backlog items for future chat enhancements"

---

**Reminder:** After each feature and fix, run tests (`pnpm test`, `pnpm supabase:function tests`, `pnpm e2e`), build the app (`pnpm build`), restart local server, and commit progress. Please commit regularly at logical checkpoints to maintain clear history.
