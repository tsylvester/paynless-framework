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

*   **TDD First:** For any component, page, function, or store action being created or significantly modified, corresponding unit tests must be written or updated *first*. If a test file does not exist, it must be created with comprehensive coverage for all rational cases. (RED -> GREEN -> REFACTOR).
    * Unit tests go in the same folder as the element they test.
    * Unit tests are named as [object].test.[filetype]
    * Integration tests go in the same folder as the **components** they're integrating, not the page.
    * Integration tests are named as [scope].integration.test.[filetype]   
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

## Phase 3: UI Component Implementation 

**Goal:** Implement primary UI components (`apps/web`) for organization chat context, chat experience enhancements (Markdown, tokens, rewind), and admin controls, connecting them to the state management layer (Phase 2).

### STEP-3.1: Implement Chat Context Selection UI [UI] [✅] 

#### STEP-3.1.1: Create `ChatContextSelector` Component [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases (Gemini 2.2.1): Renders `Select`, renders "Personal", renders org names from prop, displays correct value, calls `onContextChange` with `null` or `orgId`, handles loading/empty states. Expect failure (RED).
* [✅] Write tests in `apps/web/src/tests/unit/components/ai/ChatContextSelector.unit.test.tsx`.
* [✅] Create component file `apps/web/src/components/ai/ChatContextSelector.tsx`:
  * [✅] Implement using `Select` from `shadcn/ui`.
  * [✅] Props: `organizations: Organization[]`, `currentContextId: string | null`, `onContextChange: (contextId: string | null) => void`, `isLoading: boolean`.
  * [✅] Render options: "Personal" (value `null`), and each organization name (value `org.id`).
* [✅] Run tests. Debug until pass (GREEN).
* [✅] **[REFACTOR]** Ensure clarity, reusability, accessibility.
* [✅] Commit changes with message "feat(UI): Create reusable ChatContextSelector component w/ tests"

#### STEP-3.1.2: Integrate `ChatContextSelector` for New Chat Context [TEST-INT] [COMMIT] [✅]
* [ ] **[TEST-UNIT]** Create `apps/web/src/tests/pages/AiChat.test.tsx` if not present. (Already created and initial tests passing)
* [ ] Define/Implement Comprehensive Unit Test Cases for `AiChat.tsx`:
    *   **Initial State & Rendering (on mount):**
        *   [✅] Renders the basic page structure with all child components mocked.
        *   [✅] Initializes `nextChatOrgContext` from `globalCurrentOrgId` (from `useOrganizationStore`).
        *   [✅] Calls `loadChatHistory` with the initial `nextChatOrgContext`.
        *   [✅] Calls `loadAiConfig` action from `useAiStore`.
        *   [✅] Calls `checkAndReplayPendingChatAction` action from `useAiStore`.
        *   [✅] **Default Provider Selection:** When `availableProviders` (from `useAiStore`) become available, `selectedProviderId` state is set to the ID of the first provider if `selectedProviderId` was initially `null`.
        *   [✅] **Default Prompt Selection:** When `availablePrompts` (from `useAiStore`) become available, `selectedPromptId` state is set to the ID of thefirst prompt if `selectedPromptId` was initially `null`.
        *   [✅] **Load Chat from `localStorage`:**
            *   [✅] If `localStorage.getItem('loadChatIdOnRedirect')` returns a `chatId`, `loadChatDetails` (from `useAiStore`) is called with that `chatId`.
            *   [✅] `localStorage.removeItem('loadChatIdOnRedirect')` is called after attempting to load.
            *   [✅] Does nothing if `localStorage.getItem('loadChatIdOnRedirect')` returns `null`.
        *   **User Interactions & Event Handling:**
            *   [✅] `ChatContextSelector.onContextChange` (simulating `handleContextSelection`):
                *   [✅] Updates `nextChatOrgContext` state.
                *   [✅] `loadChatHistory` is called with the new context (via `useEffect`).
                *   [✅] Tracks `analytics.track('Chat: Context Selected For New Chat', ...)` with correct context.
            *   [✅] `ModelSelector.onProviderChange` (simulating `handleProviderChange`):
                *   [✅] Updates `selectedProviderId` state.
                *   [✅] Tracks `analytics.track('Chat: Provider Selected', ...)` with correct `providerId`.
            *   [✅] `PromptSelector.onPromptChange` (simulating `handlePromptChange`):
                *   [✅] Updates `selectedPromptId` state.
                *   [✅] Tracks `analytics.track('Chat: Prompt Selected', ...)` with correct `promptId`.
            *   [✅] **"New Chat" Button Click (simulating `handleNewChat`):**
                *   [✅] Calls `startNewChat` (from `useAiStore`) with the current `nextChatOrgContext` (or `globalCurrentOrgId` if `nextChatOrgContext` is `undefined`).
                *   [✅] Tracks `analytics.track('Chat: Clicked New Chat', ...)` with correct context.
                *   [✅] Resets `selectedProviderId` state to the first available provider's ID (or `null` if none).
                *   [✅] Resets `selectedPromptId` state to the first available prompt's ID (or `null` if none).
            *   [✅] `ChatHistoryList.onLoadChat` (simulating `handleLoadChat`):
                *   [✅] If the provided `chatId` is the same as `currentChatId` (from `useAiStore`), no actions are called.
                *   [✅] If `chatId` is different, calls `loadChatDetails` (from `useAiStore`) with the `chatId`.
                *   [✅] Tracks `analytics.track('Chat: History Item Selected', ...)` with correct `chatId`.
                *   [✅] Resets `selectedProviderId` state to the first available provider's ID (or `null` if none).
                *   [✅] Resets `selectedPromptId` state to the first available prompt's ID (or `null` if none).
        *   **State Dependencies & Derived Values (Props to Children):**
            *   [✅] `currentChatHistoryList` is correctly derived from `chatsByContext` and `nextChatOrgContext`.
            *   [✅] `currentIsHistoryLoading` is correctly derived from `isLoadingHistoryByContext` and `nextChatOrgContext`.
            *   [✅] Verify `ChatContextSelector` receives correctly mapped props: `organizations`, `currentContextId` (handles `undefined` `nextChatOrgContext` by passing `null`), `isLoading`.
            *   [✅] Verify `ModelSelector` receives correct `selectedProviderId` prop.
            *   [✅] Verify `PromptSelector` receives correct `selectedPromptId` prop.
            *   [✅] Verify `AiChatbox` receives correct `providerId`, `promptId`, and `key` props.
            *   [✅] Verify `ChatHistoryList` receives correct `history` (as `currentChatHistoryList`), `isLoading` (derived), and `currentChatId` props.
* [✅] Update `apps/web/src/pages/AiChat.tsx` (or relevant parent component): (This step's implementation details largely covered by tests above)
  * [✅] Fetch `organizations` and `currentOrganizationId` from `useOrganizationStore`.
  * [✅] Use `useState` for `nextChatOrgContext: string | null`, defaulting to `currentOrganizationId`.
  * [✅] Render `<ChatContextSelector organizations={organizations} currentContextId={nextChatOrgContext} onContextChange={handleContextSelection} isLoading={...} />`.
  * [✅] Implement `handleContextSelection(newContextId: string | null)`:
      *   [✅] `setNextChatOrgContext(newContextId)`.
      *   [✅] Trigger `Chat: Context Selected For New Chat` analytics event. (Note: Plan previously said 'chat_context_selected')
      *   [✅] Ensure `loadChatHistory(newContextId)` is called via `useEffect` reacting to `nextChatOrgContext` change.
  * [✅] Modify "New Chat" button's `onClick` handler:
      *   [✅] Call `useAiStore.getState().startNewChat(nextChatOrgContext)`.
* [✅] **[TEST-INT]** Create `apps/web/src/pages/AiChat.integration.test.tsx` with comprehensive integration tests for context selection and initial loading:
    *   [✅] **Test Setup:**
        *   [✅] Imports: React, RTL utils, `AiChatPage`, stores, types, `vi`.
        *   [✅] Global Mocks: `@paynless/analytics`, `Layout`, `ModelSelector`, `PromptSelector`, `AiChatbox`. (NOT `ChatContextSelector`, `ChatHistoryList`).
        *   [✅] `beforeEach`: Spy on store actions (`loadChatHistory`, `startNewChat`, etc.), set initial store states with distinct personal/org chats.
    *   [✅] **Initial Render & Context:**
        *   [✅] Test 1.1: "should render and default to global organization context, loading its history."
            *   Setup: `globalCurrentOrgId` = 'org-A'.
            *   Assert: `ChatContextSelector` shows 'Org A'. `loadChatHistory` called with 'org-A'. `ChatHistoryList` shows 'org-A' chats.
        *   [✅] Test 1.2: "should render and default to Personal context if no global organization, loading personal history."
            *   Setup: `globalCurrentOrgId` = `null`.
            *   Assert: `ChatContextSelector` shows "Personal". `loadChatHistory` called with `null`. `ChatHistoryList` shows personal chats.
    *   [✅] **Context Switching via `ChatContextSelector`:**
        *   [✅] Test 2.1: "selecting 'Personal' in `ChatContextSelector` should load personal chat history."
            *   Setup: Initial context 'org-A'.
            *   Action: Select "Personal".
            *   Assert: `loadChatHistory` called with `null`. `ChatHistoryList` updates. Analytics tracked.
        *   [✅] Test 2.2: "selecting a different organization in `ChatContextSelector` should load its chat history."
            *   Setup: Initial context "Personal".
            *   Action: Select 'Org B'.
            *   Assert: `loadChatHistory` called with 'org-B'. `ChatHistoryList` updates. Analytics tracked.
    *   [✅] **"New Chat" Button Integration:**
        *   [✅] Test 3.1: "clicking 'New Chat' when 'Personal' context is active should call `startNewChat` for personal."
            *   Setup: "Personal" context active.
            *   Action: Click "New Chat".
            *   Assert: `startNewChat` called with `null`. Analytics tracked.
        *   [✅] Test 3.2: "clicking 'New Chat' when an organization context is active should call `startNewChat` for that org."
            *   Setup: 'Org-A' context active.
            *   Action: Click "New Chat".
            *   Assert: `startNewChat` called with 'org-A'. Analytics tracked.
    *   [✅] **Loading Chat from History List Integration:**
        *   [✅] Test 4.1: "clicking a chat item in `ChatHistoryList` should call `loadChatDetails`."
            *   Setup: Chat 'chat-org-A-1' exists for current context.
            *   Action: Click chat item 'chat-org-A-1'.
            *   Assert: `loadChatDetails` called with 'chat-org-A-1'. Analytics tracked.
* [✅] Commit changes with message "feat(UI): Integrate ChatContextSelector for setting new chat context w/ manual tests & analytics"

#### STEP-3.1.3: Update `Chat` route. 
* [ ] Move ChatContext component to share row with other components.
* [ ] Update h2 "AI Chat" to include vars for (Org_name | Personal_name) & Model & Prompt so users can see their entire context a glance

#### STEP-3.1.4: Update `Organization` route with store and api changes for org chat functions. 

#### STEP-3.1.5: Update `aiStore` for Contextual Chat History [STORE] [TEST-UNIT] [COMMIT]
*   [ ] **[TEST-UNIT]** Define/Update Test Cases in `packages/store/src/tests/aiStore.test.ts` (create if not present) for `loadChatHistory` action:
    *   [ ] Verify `apiClient.getChatHistory` is called with the provided `organizationId` when `loadChatHistory(organizationId)` is dispatched.
    *   [ ] Verify `apiClient.getChatHistory` is called for personal chats (e.g., `organizationId = null` or appropriate parameter for personal context) when `loadChatHistory(null)` is dispatched.
    *   [ ] Verify store state (`chatHistoryList`, `isHistoryLoading`, `historyError`) is updated correctly after API success/failure for both personal and organizational contexts.
    *   [ ] Ensure tests mock `apiClient.getChatHistory` (or the actual API call module used by the store) appropriately.
*   [ ] Run `aiStore` tests. Expect failures for `loadChatHistory` if changes are not yet implemented (RED).
*   [ ] **[STORE]** Modify `loadChatHistory` action in `packages/store/src/aiStore.ts`:
    *   [ ] Update signature to accept `organizationId: string | null` as an argument.
    *   [ ] Pass this `organizationId` to the `apiClient.getChatHistory` method (or equivalent).
*   [ ] Run `aiStore` tests. Debug until pass (GREEN).
*   [ ] **[REFACTOR]** Review `loadChatHistory` action for clarity and error handling.
*   [ ] Commit changes with message "feat(STORE): Enhance aiStore.loadChatHistory for contextual loading w/ tests"

### STEP-3.2: Update Chat History Component (`ChatHistory.tsx`) [UI] [🚧]

#### STEP-3.2.1: Implement Context-Aware Chat History Display [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 2.3.1 - Revised): Verifies `ChatHistoryList` displays chats corresponding to the `nextChatOrgContext` (from `AiChatPage.tsx`). Tests display of a contextual title (e.g., "Personal Chats" or "[Org Name] Chats"). Handles loading (Skeletons), handles errors (Boundary). Expect failure (RED).
* [ ] Write/Update tests in `apps/web/src/tests/unit/components/ai/ChatHistory.unit.test.tsx`.
* [ ] Update `apps/web/src/components/ai/ChatHistory.tsx`:
  * [ ] Use `useOrganizationStore` if needed for organization names to display a contextual title.
  * [ ] Use `useAiStore` (for `chatHistoryList` which is now filtered by `nextChatOrgContext`, `selectIsHistoryLoading`).
  * [ ] The component will receive `chatHistoryList` already filtered by `AiChatPage.tsx`'s `nextChatOrgContext` via `loadChatHistory(nextChatOrgContext)`.
  * [ ] Display a contextual title based on the current `nextChatOrgContext` (e.g., "Personal Chats" or "[Selected Org Name] Chats"). This might involve passing `nextChatOrgContext` and `userOrganizations` as props.
  * [ ] Modify `ChatItem` component if needed to accept and display visual indicators for organization chats (if still desired beyond the list's contextual title).
* [ ] Run tests. Debug until pass (GREEN).
* [ ] **[REFACTOR]** Review conditional rendering, `ChatItem` usage.
* [ ] Commit changes with message "feat(UI): Implement context-aware chat history display driven by ChatContextSelector"

#### STEP-3.2.2: Add Context-Specific Actions to Chat History Items (`ChatItem.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 2.5.1): Delete Button/menu item visible only for admin on org chats in current context. Hidden otherwise. Click triggers confirmation/action.
* [ ] Write/Update tests in `apps/web/src/tests/unit/components/ai/ChatItem.unit.test.tsx` (or create if needed).
* [ ] Update `apps/web/src/components/ai/ChatItem.tsx`:
  * [ ] Use `useOrganizationStore` to get `currentOrganizationId` and `currentUserRoleInOrg`.
  * [ ] Conditionally render Delete button/menu item if `chat.organization_id && chat.organization_id === currentOrganizationId && currentUserRoleInOrg === 'admin'`.
  * [ ] On click, show confirmation dialog (`AlertDialog` from shadcn/ui).
  * [ ] On confirm, call `useAiStore.getState().deleteChat(chat.id, chat.organization_id)`.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Add admin delete action to organization chat history items w/ tests"

#### STEP-3.2.3: Add Loading States and Error Boundary [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases: Verify skeleton renders when loading. Verify error boundary catches errors.
* [ ] Update `apps/web/src/components/ai/ChatHistory.tsx`:
  * [ ] Add `Skeleton` rendering (using shadcn/ui) when `isHistoryLoading` is true.
  * [ ] Wrap the chat list rendering logic in an `ErrorBoundary` component.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Add loading skeletons and error boundary to ChatHistory w/ tests"

### STEP-3.3: Update Main Chat Interface (`AiChat.tsx`) [UI] [🚧]

#### STEP-3.3.1: Display Active Chat Context & Details [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 2.4.1): Test context header display ("Personal Chat" / "[Org Name] Chat"), system prompt loading based on selected chat, message rendering.
* [ ] Write/Update tests for `AiChat.tsx`.
* [ ] Update `apps/web/src/pages/AiChat.tsx`:
  * [ ] Get `currentChatId` from `useAiStore`.
  * [ ] Use `selectChatById` (or similar selector) to get the details of the `currentChat` (including `organization_id`, `system_prompt_id`).
  * [ ] Get organization details (name) from `useOrganizationStore` if `chat.organization_id` is present.
  * [ ] Display context header: If `chat.organization_id`, show `[Org Name] Chat`, else show "Personal Chat".
  * [ ] Ensure clicking a chat in `ChatHistory` calls `loadChatDetails(chatId, organizationId)` correctly.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Display active chat context header in AiChat"

#### STEP-3.3.2: Implement System Prompt Loading [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases: Verify `SystemPromptSelector` updates its selected value when `currentChat` changes and has a `system_prompt_id`.
* [ ] Update `apps/web/src/pages/AiChat.tsx` and `apps/web/src/components/ai/SystemPromptSelector.tsx`:
  * [ ] Pass the `currentChat?.system_prompt_id` to the `SystemPromptSelector` as its `value` prop (or similar mechanism).
  * [ ] Ensure the selector correctly reflects this value when a chat is loaded.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Load selected system prompt based on active chat"

#### STEP-3.3.3: Implement User Attribution Display (`ChatMessageBubble.tsx`) [TEST-UNIT] [COMMIT]
*   [ ] Define Test Cases: Verify visual distinction between user/assistant. Verify initials/icon display correctly for org chat user messages based on profile availability.
*   [ ] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`.
*   [ ] Update `ChatMessageBubble.tsx`:
    *   Add visual distinction (e.g., alignment, icon, color) for `message.role === 'user'` vs `'assistant'`.
    *   If `chat.organization_id` is set and `message.role === 'user'`:
        *   Attempt to fetch user profile (name/initials) for `message.user_id` (requires profile data access - e.g., via a shared hook or store).
        *   Conditionally display initials/avatar if profile found, otherwise a generic user icon.
    *   Display standard AI icon for assistant messages.
*   [ ] Run tests. Debug until pass (GREEN).
*   [ ] Commit: `feat(UI): Add user attribution display to chat messages w/ tests`

#### STEP-3.3.4: Implement Auto-Scroll (`MessageList.tsx`?) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 3.1.1): Simulate adding messages, assert last element scrolls into view.
* [ ] Write/Update tests for the message list component (`apps/web/src/components/ai/MessageList.tsx`?).
* [ ] Update the message list component:
  * [ ] Use `useRef` for the container and potentially the last message element.
  * [ ] Use `useEffect` that runs when the message list (`messages`) changes.
  * [ ] Inside the effect, use `lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });` (or similar) to scroll the latest message into view.
* [ ] Run tests. Debug scroll logic until pass (GREEN).
* [ ] **[REFACTOR]** Extract scroll logic to custom hook (`useScrollToBottom`) if needed.
* [ ] Commit changes with message "fix(UI): Implement auto-scroll to bottom for new messages w/ tests"

#### STEP-3.3.5: Add Loading States and Error Boundary (`AiChat.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases: Verify skeleton renders in message area when loading details. Verify error boundary catches errors.
* [ ] Update `apps/web/src/pages/AiChat.tsx`:
  * [ ] Use `useAiStore` to get `isDetailsLoading` state.
  * [ ] Render `Skeleton` components in the message display area when `isDetailsLoading` is true.
  * [ ] Wrap the main chat content area (messages, input) in an `ErrorBoundary` component.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Add loading skeletons and error boundary to AiChat w/ tests"

### STEP-3.4: Implement Markdown Support [UI] [🚧]

#### STEP-3.4.1: Install Dependencies
* [ ] Install `react-markdown` and `remark-gfm`: `pnpm add react-markdown remark-gfm` in `apps/web`.

#### STEP-3.4.2: Implement Markdown Rendering in Messages (`ChatMessageBubble.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 3.2.1): Input various markdown syntax, verify correct HTML tags rendered (`<strong>`, `<em>`, `<li>`, `<code>`, `<a>`, `<p>`). Expect failure (RED).
* [ ] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`.
* [ ] Update `ChatMessageBubble.tsx`:
  * [ ] Import `ReactMarkdown` from `react-markdown` and `remarkGfm` from `remark-gfm`.
  * [ ] Replace direct rendering of `message.content` with `<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>`.
  * [ ] Apply necessary CSS styling for rendered markdown elements (headings, lists, code blocks, links, blockquotes) consistent with `shadcn/ui` theme.
* [ ] Run tests. Debug rendering/styling until pass (GREEN).
* [ ] **[REFACTOR]** Create a reusable `MarkdownRenderer` component if used elsewhere.
* [ ] Commit changes with message "feat(UI): Implement Markdown rendering for chat messages w/ tests"

### STEP-3.5: Implement Token Tracking and Audit UI [UI] [🚧]

#### STEP-3.5.1: Create/Integrate Token Estimator Hook/Display [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 3.3.2): Hook takes text, returns estimated count using `tiktoken`. Test samples, empty string. Mock `tiktoken`.
* [ ] Create hook `apps/web/src/hooks/useTokenEstimator.ts`:
    *   Import `getEncoding` from `tiktoken`. Initialize `encoding = getEncoding('cl100k_base')`.
    *   Hook takes `text: string`, returns `encoding.encode(text).length`. Memoize result.
* [ ] Write tests for the hook. Expect failure (RED).
* [ ] Implement the hook. Run tests until pass (GREEN).
* [ ] Update the chat input component (`apps/web/src/components/ai/ChatInput.tsx`?):
    *   Use the `useTokenEstimator` hook with the current text input value.
    *   Display the estimated count near the input field (e.g., "Tokens: {count}").
* [ ] Write/Update component tests to verify display. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Implement token estimator hook and display in chat input w/ tests"

#### STEP-3.5.2: Add Token Usage Display to Messages (`ChatMessageBubble.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases: Verify token count displays only for assistant messages with `token_usage` data.
* [ ] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`.
* [ ] Update `ChatMessageBubble.tsx`:
  * [ ] If `message.role === 'assistant'` and `message.token_usage`, display the count (e.g., "Tokens: {message.token_usage.completion}" or total). Style subtly.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Add token usage display to assistant chat messages w/ tests"

#### STEP-3.5.3: Create Cumulative Token Usage Display (`ChatTokenUsageDisplay.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 3.3.9): Takes `messages` prop. Calculates sum of prompt/completion/total tokens correctly. Displays User/Assistant/Total. Handles missing `token_usage`. Expect failure (RED).
* [ ] Write tests for `apps/web/src/components/ai/ChatTokenUsageDisplay.unit.test.tsx`.
* [ ] Create component `apps/web/src/components/ai/ChatTokenUsageDisplay.tsx`:
  * [ ] Prop: `messages: ChatMessage[]`.
  * [ ] Calculate cumulative counts: Iterate messages. If assistant message has `token_usage`, add `prompt` tokens (representing previous user msg) to a user total, `completion` tokens to an assistant total.
  * [ ] Display User/Assistant/Total counts.
* [ ] Run tests. Debug component logic until pass (GREEN).
* [ ] **[REFACTOR]** Optimize calculation if needed. Ensure clear display.
* [ ] Commit changes with message "feat(UI): Create cumulative token usage display component w/ tests"

#### STEP-3.5.4: Integrate Token UI Components (`AiChat.tsx`) [TEST-INT] [COMMIT]
* [ ] Define Integration Test Cases (Manual - Gemini 3.3.13): Send messages, verify estimator updates. Verify assistant messages show tokens. Verify cumulative display updates. Verify analytics.
* [ ] Update `apps/web/src/pages/AiChat.tsx`:
  * [ ] Ensure token estimator is displayed near input.
  * [ ] Integrate `ChatTokenUsageDisplay` component, passing `currentChatMessages` from the store. Place appropriately.
  * [ ] Trigger `token_usage_displayed` analytics event (consider on mount/update of summary).
* [ ] Perform manual integration tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Integrate token tracking UI components into chat page w/ manual tests & analytics"

#### STEP-3.5.5: Implement Token Budget Audit Hook and UI Integration [TEST-UNIT] [TEST-INT] [COMMIT]
*   [ ] **Define Test Cases for `useTokenAuditStatus` hook:**
    *   [ ] Mocks `useAiStore` and `useSubscriptionStore` selectors (from revised STEP-2.4).
    *   [ ] Test various scenarios: budget available, usage below budget, usage at budget, usage exceeding budget.
    *   [ ] Verify correct calculation of remaining tokens, percentage used.
    *   [ ] Verify correct status flags returned (e.g., `isWarning`, `isBlocked`).
*   [ ] **Create `useTokenAuditStatus` Hook (`apps/web/src/hooks/useTokenAuditStatus.ts`):**
    *   [ ] Consumes token usage data from `useAiStore` (e.g., `selectCurrentUserPeriodUsage`, `selectCurrentOrgPeriodUsage`).
    *   [ ] Consumes token budget data from `useSubscriptionStore` (e.g., `selectCurrentUserTokenBudget`, `selectOrganizationTokenBudget`).
    *   [ ] Consumes current organization context from `useOrganizationStore` to select appropriate budget/usage.
    *   [ ] Performs comparison logic (budget - usage = remaining; (usage/budget)*100 = percentage).
    *   [ ] Returns reactive state: `remainingTokens: number`, `percentageUsed: number`, `isWarning: boolean` (e.g., >80% used), `isBlocked: boolean` (e.g., >100% used or budget exhausted).
*   [ ] Write unit tests for the `useTokenAuditStatus` hook. Debug until (GREEN).
*   [ ] **UI Integration Points:**
    *   [ ] **Chat Input (`ChatInput.tsx`):**
        *   [ ] Use `useTokenAuditStatus`.
        *   [ ] Display a warning message if `isWarning` is true.
        *   [ ] Disable input and show a message if `isBlocked` is true.
    *   [ ] **User Dashboard (e.g., `UserAccountPage.tsx`):**
        *   [ ] Display current personal token usage vs. budget (e.g., using a progress bar and text like "X of Y tokens used").
    *   [ ] **Organization Settings (e.g., `OrganizationBillingPage.tsx` or similar):**
        *   [ ] Display current organization token usage vs. budget.
*   [ ] Write integration tests (or update existing component tests) for these UI integrations to ensure the hook's state is correctly reflected.
*   [ ] Commit changes with message "feat(UI): Implement token budget audit hook and integrate into UI components w/ tests"

### STEP-3.6: Implement Chat Rewind/Reprompt UI [UI] [🚧]

#### STEP-3.6.1: Create Message Edit Controls (`ChatMessageBubble.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 3.4.2): Verify button visible only on user messages. Click triggers callback with correct message ID/content.
* [ ] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`.
* [ ] Update `ChatMessageBubble.tsx`:
  * [ ] Add an edit button/icon (e.g., Pencil) to user message bubbles.
  * [ ] Prop: `onEditClick?: (messageId: string, messageContent: string) => void`.
  * [ ] Call `onEditClick(message.id, message.content)` when the button is clicked.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Add edit control to user messages for rewind w/ tests"

#### STEP-3.6.2: Implement Rewind Mode in Chat Interface (`AiChat.tsx`) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 3.4.2): Entering rewind mode sets input value and state correctly. Submit button changes text. Resubmit action calls correct store function. State resets after resubmit.
* [ ] Write/Update tests for `apps/web/src/pages/AiChat.tsx`.
* [ ] Update `AiChat.tsx`:
  * [ ] Add state: `const [rewindState, setRewindState] = useState<{ messageId: string | null }>({ messageId: null });`
  * [ ] Implement `handleEditClick(messageId, messageContent)` passed to `ChatMessageBubble`:
      *   `setRewindState({ messageId });`
      *   Update chat input component's value state with `messageContent`.
  * [ ] Pass `isRewinding = {rewindState.messageId !== null}` to chat input component.
* [ ] Update chat input component (`ChatInput.tsx`?):
  * [ ] Accept `isRewinding` prop.
  * [ ] Change submit button text to "Resubmit" if `isRewinding` is true.
  * [ ] On submit, check `isRewinding`. If true, call a specific `handleResubmit(inputValue)` prop; otherwise, call standard `handleSendMessage(inputValue)`.
* [ ] Implement `handleResubmit(editedContent)` in `AiChat.tsx`:
  *   If `rewindState.messageId` exists:
      *   Call `useAiStore.getState().sendMessage({ message: editedContent, providerId: /* current provider */, promptId: /* current prompt */, rewindFromMessageId: rewindState.messageId });` (or the dedicated `rewindAndSendMessage` action if created in store).
      *   `setRewindState({ messageId: null });`
      *   Clear chat input value state.
* [ ] Run tests. Debug state management and handlers until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Implement rewind mode state and handlers in chat interface w/ tests"

### STEP-3.7: Implement Admin Controls UI [UI] [🚧]

#### STEP-3.7.1: Create Organization Chat Settings Component (`OrganizationChatSettings.tsx`?) [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 2.5.1): Switch rendered, reflects fetched status, calls update action on toggle, disabled/hidden if not admin.
* [ ] Write tests for the component (`apps/web/src/components/organizations/OrganizationChatSettings.unit.test.tsx`?).
* [ ] Create component `apps/web/src/components/organizations/OrganizationChatSettings.tsx`:
  * [ ] Use `useOrganizationStore` to get org details (`currentOrganizationDetails`) and `currentUserRoleInOrg`.
  * [ ] Render a `Switch` (from shadcn/ui) with label "Allow members to create organization chats".
  * [ ] Set `checked` prop based on `currentOrganizationDetails?.allow_member_chat_creation`.
  * [ ] Set `disabled` prop if `currentUserRoleInOrg !== 'admin'`.
  * [ ] Implement `onCheckedChange` handler:
      *   Call `useOrganizationStore.getState().updateOrganizationSettings(orgId, { allow_member_chat_creation: newValue })`.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Create organization chat settings component with toggle w/ tests"

#### STEP-3.7.2: Integrate Chat Settings into Organization Settings Page [TEST-INT] [COMMIT]
* [ ] Define Integration Test Cases (Manual - Gemini 2.5.7): Test delete visibility/functionality as admin/member. Test settings toggle visibility/functionality as admin/member. Test member chat creation restriction via RLS block. Verify analytics.
* [ ] Update `apps/web/src/pages/OrganizationSettingsPage.tsx` (or relevant component):
  * [ ] Import and render the `OrganizationChatSettings` component in an appropriate section.
  * [ ] Ensure necessary props (like `orgId`) are passed if needed, or rely on store context.
* [ ] Perform manual integration tests covering visibility, functionality, and downstream effects (RLS blocking). Debug until pass (GREEN).
* [ ] Commit changes with message "feat(UI): Integrate chat settings into organization settings page w/ manual tests"

**Phase 3 Complete Checkpoint:**
*   [ ] All Phase 3 tests (UI unit and integration tests) passing.
*   [ ] Core UI components (Context Selector, Chat History, Chat Interface, Message Bubbles, Input) are implemented/updated for org context and new features.
*   [ ] Markdown rendering is functional in messages.
*   [ ] Token estimation and usage display are integrated.
*   [ ] Chat rewind UI flow is implemented.
*   [ ] Admin controls (chat deletion, member creation toggle) are implemented in the UI.
*   [ ] UI components correctly interact with the State Management layer (Phase 2).
*   [ ] Code refactored, analytics integrated where specified, and commits made.
*   [ ] Run `npm test` in `apps/web`. Build `apps/web` (`npm run build`). Perform quick smoke test. 