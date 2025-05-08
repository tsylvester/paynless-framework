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

#### STEP-3.1.2: Integrate `ChatContextSelector` for New Chat Context [TEST-INT] [COMMIT]
* [ ] Define Integration Test Cases (Manual - Gemini 2.2.6): Verify selector defaults correctly. Select "Personal", start new chat, send message -> verify `organization_id = null`. Select Org A, start new chat, send message -> verify `organization_id = OrgA.id`. Switch global context via `OrganizationSwitcher` -> verify selector updates.
* [ ] Update `apps/web/src/pages/AiChat.tsx` (or relevant parent component):
  * [ ] Fetch `organizations` and `currentOrganizationId` from `useOrganizationStore`.
  * [ ] Use `useState` for `nextChatOrgContext: string | null`, defaulting to `currentOrganizationId`.
  * [ ] Render `<ChatContextSelector organizations={organizations} currentContextId={nextChatOrgContext} onContextChange={handleContextSelection} isLoading={...} />`.
  * [ ] Implement `handleContextSelection(newContextId: string | null)`:
      *   `setNextChatOrgContext(newContextId)`.
      *   Trigger `chat_context_selected` analytics event.
  * [ ] Modify "New Chat" button's `onClick` handler:
      *   Call `useAiStore.getState().startNewChat(nextChatOrgContext)`.
* [ ] Perform manual integration tests. Debug until functionality is correct.
* [ ] Commit changes with message "feat(UI): Integrate ChatContextSelector for setting new chat context w/ manual tests & analytics"

### STEP-3.2: Update Chat History Component (`ChatHistory.tsx`) [UI] [🚧]

#### STEP-3.2.1: Implement Segregated Chat History Display [TEST-UNIT] [COMMIT]
* [ ] Define Test Cases (Gemini 2.3.1): Fetches `currentOrganizationId`, calls `selectChatHistoryList`, renders "Personal" / "[Org Name]" sections (Tabs or headings), applies visual indicators to org chats, updates on context change, handles loading (Skeletons), handles errors (Boundary). Expect failure (RED).
* [ ] Write/Update tests in `apps/web/src/tests/unit/components/ai/ChatHistory.unit.test.tsx`.
* [ ] Update `apps/web/src/components/ai/ChatHistory.tsx`:
  * [ ] Use `useOrganizationStore` (for `currentOrganizationId`, `currentOrganizationDetails.name`).
  * [ ] Use `useAiStore` (for `selectChatHistoryList`, `selectIsHistoryLoading`).
  * [ ] Implement segregation (Tabs recommended) based on `currentOrganizationId`. Fetch and display the correct list.
  * [ ] Display the current context name (e.g., "Personal Chats" or "[Org Name] Chats").
  * [ ] Modify `ChatItem` component if needed to accept and display visual indicators for organization chats.
  * [ ] Use `useEffect` to call `loadChats(currentOrganizationId)` when `currentOrganizationId` changes.
* [ ] Run tests. Debug until pass (GREEN).
* [ ] **[REFACTOR]** Review filtering, conditional rendering, `ChatItem` usage.
* [ ] Commit changes with message "feat(UI): Implement segregated chat history view w/ context awareness"

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