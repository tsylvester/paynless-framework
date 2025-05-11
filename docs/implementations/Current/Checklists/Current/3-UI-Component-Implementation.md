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
*   [🔄] Represents a work in progress step

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
            *   [✅] Verify `ChatContextSelector` receives correctly mapped props: `currentContextId` (handles `undefined` `nextChatOrgContext` by passing `null`). (`organizations` and `isLoading` are sourced from store by `ChatContextSelector` itself).
            *   [✅] Verify `ModelSelector` receives correct `selectedProviderId` prop.
            *   [✅] Verify `PromptSelector` receives correct `selectedPromptId` prop.
            *   [✅] Verify `AiChatbox` receives correct `providerId`, `promptId`, and `key` props.
            *   [✅] Verify `ChatHistoryList` receives correct `activeContextId` (derived from `nextChatOrgContext`), `currentChatId`, and `contextTitle` props.
* [✅] Update `apps/web/src/pages/AiChat.tsx` (or relevant parent component): (This step's implementation details largely covered by tests above)
  * [✅] Fetch `currentOrganizationId` and `userOrganizations` from `useOrganizationStore`.
  * [✅] Use `useState` for `nextChatOrgContext: string | null`, defaulting to `currentOrganizationId`.
  * [✅] Render `<ChatContextSelector currentContextId={nextChatOrgContext} onContextChange={handleContextSelection} />`.
  * [✅] Implement `handleContextSelection(newContextId: string | null)`:
      *   [✅] `setNextChatOrgContext(newContextId)`.
      *   [✅] Trigger `Chat: Context Selected For New Chat` analytics event.
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


### Backend Modifications for Dummy Provider Support

- **Modify `/functions/v1/chat` (or equivalent chat message endpoint):**
  - **[ ] Identify `DUMMY_PROVIDER_ID`:** When a request is received, check if the `providerId` in the payload is `dummy-test-provider`.
  - **[ ] Handle New Dummy Chat:**
    - **[ ] Create Chat Entity:** If no `chatId` is provided (or if `chatId` is new/temporary), create a new chat record in the database. Ensure this chat gets a real, persistent ID from the database.
    - **[ ] Store User Message:** Persist the incoming user message, associating it with the new (or existing) real chat ID.
    - **[ ] Generate Dummy Assistant Message:** Create a dummy assistant message (e.g., content like "Echo from Dummy: [user's message content]"). This message should also be associated with the `DUMMY_PROVIDER_ID` and the real chat ID.
    - **[ ] Store Dummy Assistant Message:** Persist this dummy assistant message to the database.
    - **[ ] Return Assistant Message:** Respond with a standard `ChatMessage` object for the dummy assistant's reply, including the real `chat_id`.
  - **[ ] Handle Existing Dummy Chat:**
    - **[ ] Store User Message:** Persist the incoming user message, associating it with the existing real chat ID.
    - **[ ] Generate Dummy Assistant Message:** Create and persist a new dummy assistant message linked to the existing chat.
    - **[ ] Return Assistant Message:** Respond with the `ChatMessage` object for the new dummy assistant message.
  - **[ ] Standard Provider Handling:** If `providerId` is not `DUMMY_PROVIDER_ID`, proceed with the existing logic to call the actual AI model.
  - **[ ] Consistent Response Structure:** Ensure the API response structure for a dummy message is identical to that of a real AI-generated message (i.e., a valid `ChatMessage` object).

- **Verify other relevant endpoints (e.g., `/functions/v1/chat-details`, `/functions/v1/chat-history`):**
  - **[ ] No Special Dummy Handling Needed:** These endpoints should generally not require special logic for the dummy provider. Since chats involving the dummy provider are now real, persisted chats, these endpoints should naturally return their details and include them in history listings just like any other chat.

#### STEP-3.1.2.A: Refactor Chat Context State Management to `aiStore` [STORE] [UI] [TEST-UNIT] [COMMIT] [🚧]
*   **Goal:** Centralize the management of the selected context for new chats and the logic for initiating new chats (including default provider/prompt selection) within the `aiStore` to simplify `AiChat.tsx` and make `ChatContextSelector.tsx` more self-contained.
*   **Status:** UI components (`ChatContextSelector.tsx`, `AiChat.tsx`) have been partially updated based on this plan. `aiStore` modifications are pending from the developer. Linter errors currently exist in `AiChat.tsx` (e.g., `Property 'contextfornewchat' does not exist on type 'AiStore'`) which will be resolved upon completion of the `aiStore` updates.
*   **Sub-steps:**
    *   **1. [STORE] Enhance `aiStore` for Centralized Context Management:**
        *   [ ] In `packages/store/src/aiStore.ts`:
            *   [ ] Add new state: `contextfornewchat: string | null` (or a similar appropriate name).
                *   Initialize this state (e.g., in the store's initial state setup or during an initialization action like `loadAiConfig`). Consider using `globalCurrentOrgId` from `useOrganizationStore` as an initial value if available, or default to `null` (for personal context).
            *   [ ] Add new action: `setcontextfornewchat: (contextId: string | null) => void`.
                *   This action should update `state.contextfornewchat`.
            *   [ ] Modify the existing `startNewChat(contextId: string | null)` action:
                *   This action will be called with `contextId` (which will typically be the value of `contextfornewchat` from the store, passed from `AiChat.tsx`).
                *   **Crucially, embed the default provider and prompt selection logic within this `startNewChat` action.** This means that after a new chat is successfully initiated (e.g., `currentChatId` is set), this action should also:
                    *   Access `state.availableProviders` and `state.availablePrompts`.
                    *   Call the equivalent of `setSelectedProvider` with the ID of the first available provider (or a development dummy provider, or `null` if none are available).
                    *   Call the equivalent of `setSelectedPrompt` with the ID of the first available prompt (or `null` if none are available).
        *   **[TEST-UNIT]** Update `packages/store/src/tests/aiStore.test.ts` (or relevant specific test files for `aiStore`):
            *   [ ] Add unit tests for the new `setcontextfornewchat` action.
            *   [ ] Update unit tests for the `startNewChat` action to verify it correctly uses the provided `contextId` AND correctly sets the default provider and prompt as part of its execution.
            *   [ ] Add tests to verify the correct initialization of `contextfornewchat` in the store's state.
    *   **2. [UI] Refactor `ChatContextSelector.tsx` (as previously discussed/applied):**
        *   [✅] Removed `currentContextId` and `onContextChange` from `ChatContextSelectorProps`.
        *   [✅] Uses `useAiStore` to get `contextfornewchat` and `setcontextfornewchat`.
        *   [✅] `handleValueChange` in `ChatContextSelector` calls `setcontextfornewchat` to update the store.
        *   [✅] The component displays the selected context based on `contextfornewchat` from the store.
        *   **[TEST-UNIT]** Update `apps/web/src/components/ai/ChatContextSelector.test.tsx`:
            *   [ ] Ensure tests mock `useAiStore` correctly, providing the new state and action.
            *   [ ] Verify that `setcontextfornewchat` is called when a context is selected in the UI.
            *   [ ] Verify the component renders correctly based on the mocked `contextfornewchat` value from the store.
            *   [ ] Remove any tests related to the old `onContextChange` prop.
    *   **3. [UI] Refactor `AiChat.tsx` (as previously discussed/applied, pending store updates):**
        *   [✅] Removed the local `nextChatOrgContext` state and its associated initializing `useEffect`.
        *   [✅] Removed the `handleContextSelection` function.
        *   [✅] Updated the `ChatContextSelector` invocation to remove the `currentContextId` and `onContextChange` props.
        *   [✅] Modified `handleNewChat` (the "New Chat" button's click handler):
            *   [✅] It now retrieves `contextfornewchat` from `useAiStore`.
            *   [✅] It calls `startNewChat(contextForNewChat)` (where `contextForNewChat` is derived from `contextfornewchat` or `globalCurrentOrgId` as a fallback if `contextfornewchat` is initially undefined).
            *   [✅] Removed the explicit provider/prompt selection logic from `handleNewChat` (as this is now centralized in the `startNewChat` store action).
            *   [✅] Analytics tracking for "Chat: Clicked New Chat" uses `contextForNewChat`.
        *   [✅] Updated `activeContextIdForHistory` to derive its value from `contextfornewchat` (with a fallback to `globalCurrentOrgId`).
        *   [✅] Updated the `key` prop for the `AiChatbox` component to include `contextfornewchat` to ensure it re-renders appropriately when the context for a new chat changes before a specific chat is loaded.
        *   [🚧] The linter error `Property 'contextfornewchat' does not exist on type 'AiStore'` will be resolved once the `aiStore` is updated as per Sub-step 1.
        *   **[TEST-UNIT]** Update `apps/web/src/pages/AiChat.test.tsx`:
            *   [ ] Mock `useAiStore` to include `contextfornewchat` and the modified `startNewChat` action (which now handles default selections).
            *   [ ] Update tests for the "New Chat" button to verify it reads the context from the mocked `contextfornewchat` and calls the (mocked) `startNewChat` action correctly. Verify that default provider/prompt selections are NOT set directly by `handleNewChat` anymore.
            *   [ ] Remove tests related to the old `nextChatOrgContext` local state and the `handleContextSelection` function.
    *   **4. [COMMIT]** Once all sub-steps (including store changes, UI updates, and all test updates) are completed and verified, commit the changes with a message like: "refactor(ChatContext): Centralize context selection and new chat logic in aiStore; update AiChatPage and ChatContextSelector".

#### STEP-3.1.3: Update `Chat` route. 
* [✅] Move ChatContext component to share row with other components.
* [✅] Update h2 "AI Chat" to include vars for (Org_name | Personal_name) & Model & Prompt so users can see their entire context a glance

#### STEP-3.1.4: Update `Organization` route with store and api changes for org chat functions. 
* [✅] All cards updated
* [✅] Need to finish Org pages unit tests
* [✅] Need to finish Org pages integration tests 

#### STEP-3.1.5: Update `aiStore` for Contextual Chat History [STORE] [TEST-UNIT] [COMMIT]
*   [✅] **[TEST-UNIT]** Define/Update Test Cases in `packages/store/src/tests/aiStore.test.ts` (create if not present) for `loadChatHistory` action:
    *   [✅] Verify `apiClient.getChatHistory` is called with the provided `organizationId` when `loadChatHistory(organizationId)` is dispatched.
    *   [✅] Verify `apiClient.getChatHistory` is called for personal chats (e.g., `organizationId = null` or appropriate parameter for personal context) when `loadChatHistory(null)` is dispatched.
    *   [✅] Verify store state (`chatHistoryList`, `isHistoryLoading`, `historyError`) is updated correctly after API success/failure for both personal and organizational contexts.
    *   [✅] Ensure tests mock `apiClient.getChatHistory` (or the actual API call module used by the store) appropriately.
*   [✅] Run `aiStore` tests. Expect failures for `loadChatHistory` if changes are not yet implemented (RED).
*   [✅] **[STORE]** Modify `loadChatHistory` action in `packages/store/src/aiStore.ts`:
    *   [✅] Update signature to accept `organizationId: string | null` as an argument.
    *   [✅] Pass this `organizationId` to the `apiClient.getChatHistory` method (or equivalent).
*   [✅] Run `aiStore` tests. Debug until pass (GREEN).
*   [✅] **[REFACTOR]** Review `loadChatHistory` action for clarity and error handling.
*   [✅] Commit changes with message "feat(STORE): Enhance aiStore.loadChatHistory for contextual loading w/ tests"

### STEP-3.2: Update Chat History Component (`ChatHistory.tsx`) [UI] [🚧]

#### STEP-3.2.1: Implement Context-Aware Chat History Display [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases (Gemini 2.3.1 - Revised): Verifies `ChatHistoryList` correctly uses its `activeContextId` prop to: 1. Call `loadChatHistory` from `useAiStore`. 2. Select and display chats from `chatsByContext[activeContextId]`. 3. Display a contextual title passed as `contextTitle` prop. 4. Handle loading (Skeletons from `isLoadingHistoryByContext[activeContextId]`) and errors (Boundary, using `historyErrorByContext[activeContextId]`). Expect failure (RED).
* [✅] Write/Update tests in `apps/web/src/components/ai/ChatHistory.unit.test.tsx`. Tests will mock `useAiStore` and verify correct actions are called and component renders based on mocked store state for the given `activeContextId`.
* [✅] Update `apps/web/src/components/ai/ChatHistory.tsx`:
  * [✅] Accepts `activeContextId: string | null`, `onLoadChat: (chatId: string) => void;`, `currentChatId?: string | null`, `contextTitle?: string;` as props. (No longer accepts `history: Chat[]` or `isLoading: boolean` related to history data itself).
  * [✅] Internally uses `useAiStore` to access `loadChatHistory`, `chatsByContext`, `isLoadingHistoryByContext`, and `historyErrorByContext`.
  * [✅] Uses `useEffect` to call `loadChatHistory(activeContextId)` when `activeContextId` changes or if data for that context isn't already loaded/loading.
  * [✅] Selects and displays chats from `chatsByContext[activeContextId]`.
  * [✅] Manages its own loading display based on `isLoadingHistoryByContext[activeContextId]`.
  * [✅] Manages its own error display (potentially via an error boundary) based on `historyErrorByContext[activeContextId]`.
  * [✅] Renders the `contextTitle` prop.
  * [✅] Modify `ChatItem` component if needed to accept and display visual indicators for organization chats (if still desired beyond the list's contextual title).
* [✅] Run tests. Debug until pass (GREEN).
* [✅] **[REFACTOR]** Review conditional rendering, `ChatItem` usage.
* [✅] Commit changes with message "feat(UI): Implement context-aware chat history display driven by ChatContextSelector"

* [✅] Fix AiChat.test.tsx
* [✅] Fix AiChat.integration.test.tsx
* [✅] Fix infinite loop on loading org chat 
* [✅] Check ChatHistoryList test after fixing loop

#### STEP-3.2.2: Create `ChatItem` Component with Context-Specific Actions [TEST-UNIT] [COMMIT]
* [✅] **Define Test Cases for `ChatItem.tsx`:**
    *   [✅] Renders chat title correctly (handles null/empty with "Untitled Chat...").
    *   [✅] Calls `onClick` prop with `chatId` when the main item area is clicked.
    *   [✅] Applies active styling (e.g., `bg-muted`) if `isActive` prop is true.
    *   [✅] **Delete Button Visibility Logic:**
        *   [✅] Personal Chats: VISIBLE if `chat.user_id === currentUserId` (from `useAuthStore`). HIDDEN otherwise.
        *   [✅] Organization Chats: VISIBLE if `chat.user_id === currentUserId` (creator) OR if `currentUser` (from `useAuthStore`) is an admin in `chat.organization_id` (checked via `currentOrganizationId` and `selectCurrentUserRoleInOrg` from `useOrganizationStore`). HIDDEN otherwise.
    *   [✅] **Delete Button Interaction:**
        *   [✅] Clicking delete button (if visible) triggers `AlertDialog`.
        *   [✅] `AlertDialog` shows appropriate title/description.
        *   [✅] Confirming delete in `AlertDialog` calls `useAiStore.getState().deleteChat(chat.id, chat.organization_id)`.
        *   [✅] Cancelling delete in `AlertDialog` does not call `deleteChat`.
    *   [✅] **UI Enhancements Display:**
        *   [✅] Displays formatted timestamp (e.g., "2 hours ago") using `date-fns`.
        *   [✅] Displays system prompt name with an "Info" icon if `chat.system_prompt_id` exists and matches an available prompt.
        *   [✅] Displays creator's name (Full Name > Email > User ID).
* [✅] **Create `apps/web/src/components/ai/ChatItem.test.tsx`:**
    *   [✅] Write tests based on the cases above. Mock `useAuthStore`, `useOrganizationStore`, `useAiStore`. Mock `AlertDialog` components. Mock `date-fns`.
* [✅] **Create `apps/web/src/components/ai/ChatItem.tsx` Component:**
    *   [✅] Props: `chat: Chat`, `onClick: (chatId: string) => void`, `isActive: boolean`.
    *   [✅] Render chat title (or default "Untitled Chat..."). Main element is a button calling `onClick`.
    *   [✅] Implement delete button visibility using `useAuthStore` (for `currentUser.id`) and `useOrganizationStore` (for `currentOrganizationId`, `selectCurrentUserRoleInOrg`).
    *   [✅] Delete button uses `AlertDialog` for confirmation. On confirm, calls `deleteChat` from `useAiStore`.
    *   [✅] Implement UI enhancements: timestamp, system prompt name, creator name.
* [✅] **Run `ChatItem.test.tsx`**. Debug until all tests pass (GREEN).
* [✅] Commit changes with message "feat(UI): Create ChatItem component with delete action, UI enhancements, and tests".

#### STEP-3.2.2.1: Integrate `ChatItem` into `ChatHistoryList` and Update Tests [UI] [TEST-UNIT] [COMMIT] [✅]
* [✅] **Refactor `apps/web/src/components/ai/ChatHistoryList.tsx`:**
    *   [✅] Import and use the new `ChatItem` component to render each chat in the list, passing appropriate props (`chat`, `onLoadChat` as `onClick`, and `isActive` status).
* [✅] **Update `apps/web/src/components/ai/ChatHistoryList.test.tsx`:**
    *   [✅] Adjust tests that previously checked for direct button rendering within `ChatHistoryList`.
    *   [✅] Tests should now primarily verify that `ChatHistoryList` renders the correct number of `ChatItem` components and passes the correct props to them (e.g., by mocking `ChatItem` and checking its received props).
    *   [✅] Ensure tests for `onLoadChat` being called when a chat is selected still pass (interaction will now be with the `ChatItem`'s main button area).
* [✅] **Run `ChatHistoryList.test.tsx`**. Debug until all tests pass (GREEN).
* [✅] **Commit changes** with message "refactor(UI): Integrate ChatItem into ChatHistoryList and update tests".

#### STEP-3.2.3: Add Loading States and Error Boundary [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases: Verify skeleton renders when loading. Verify error boundary catches errors.
* [✅] Update `apps/web/src/components/ai/ChatHistoryList.tsx`:
  * [✅] Add `Skeleton` rendering (using shadcn/ui) when `isHistoryLoading` is true. (Already implemented and tested prior to this specific step focused on ErrorBoundary).
  * [✅] Wrap the chat list rendering logic in an `ErrorBoundary` component. (Already implemented, test now verifies engagement).
* [✅] Run tests. Debug until pass (GREEN).
* [✅] Commit changes with message "feat(UI): Add loading skeletons and error boundary to ChatHistoryList w/ tests"

### STEP-3.3: Update Main Chat Interface (`AiChat.tsx`) [UI] [✅]
*   **Overview:** This step involves refining `AiChat.tsx` to correctly manage and pass state to its children, especially concerning provider/prompt selection, chat loading, and context changes. It also includes ensuring its unit tests are comprehensive and passing.
*   [✅] **Backend Fix for `system_prompt_id` in Chat History:**
    *   [✅] Modify `supabase/functions/chat-history/index.ts` to select and return `system_prompt_id` in the chat history items.
    *   [✅] Verify `supabase/functions/chat-details/index.ts` already includes `system_prompt_id`.
    *   [✅] Test manually: Confirm prompt names appear correctly in `ChatItem` on initial load of `ChatHistoryList`.
*   [✅] **Refine Prop Passing and State Management in `AiChat.tsx`:**
    *   [✅] Ensure `ModelSelector` receives `selectedProviderId` and `onProviderChange`. (It sources `availableProviders` from the store).
    *   [✅] Ensure `PromptSelector` receives `selectedPromptId` and `onPromptChange`. (It sources `availablePrompts` from the store).
    *   [✅] Verify logic for `handleNewChat` and `handleLoadChat` correctly resets/sets `selectedProviderId` and `selectedPromptId` (especially setting `selectedPromptId` based on loaded chat's `system_prompt_id`).
*   [✅] **Update and Pass All Unit Tests for `AiChat.tsx` (`apps/web/src/pages/AiChat.test.tsx`):**
    *   [✅] Review all existing test cases for accuracy against current component logic.
    *   [✅] **Default Provider/Prompt Selection:** Tests accurately reflect that `selectedProviderId`/`selectedPromptId` are set based on `availableProviders`/`availablePrompts` from the store, and `selectedPromptId` updates from a loaded chat's `system_prompt_id`.
    *   [✅] **Props to Children:** Tests confirm `ModelSelector` and `PromptSelector` receive only the necessary props (`selected...Id`, `on...Change`), not `available...` arrays.
    *   [✅] Ensure all tests pass, debugging any failures related to state updates, effect timing (`vi.waitFor`), or mock interactions.
*   [✅] **Commit changes** with message "refactor(UI): Refine AiChat state management and prop passing, fix all unit tests".

#### STEP-3.3.1: Ensure Correct Functionality of Context Selectors and Chat Data Display in AiChat.tsx [TEST-UNIT] [COMMIT] [✅]
* [✅] **STEP-3.3.1: Ensure Correct Functionality of Context Selectors and Chat Data Display in AiChat.tsx**
    *   Description: Verify that `ChatContextSelector`, `ModelSelector`, and `PromptSelector` are present and correctly wired up. Test that state updates in `AiChat.tsx` occur correctly upon changes in these selectors. Confirm that `AiChatbox` receives and uses the `currentChatMessages` appropriately. Verify that the `PromptSelector` updates if the `currentChat` has a `system_prompt_id` (e.g., when loading a chat from history). Ensure that `onLoadChat` from `ChatHistoryList` correctly calls `loadChatDetails` and related state updates for `system_prompt_id` occur. Verify the "New Chat" button's functionality, including calling `startNewChat` with the correct context, appropriate analytics tracking, and resetting selectors.
    *   Current Status: **BUG ACTIVE** - "Only first item loads" issue persists. Previous frontend workaround (updating `chatsByContext` in `AiChatPage`) was not a complete solution and will be superseded by backend/store enhancements in STEP-3.3.2. (Note: Bug is now resolved)
    *   Test Cases:
        *   [✅] `ChatContextSelector`, `ModelSelector`, `PromptSelector` are rendered.
        *   [✅] Changing context updates `nextChatOrgContext`.
        *   [✅] Changing model updates `selectedProviderId`.
        *   [✅] Changing prompt updates `selectedPromptId`.
        *   [✅] `AiChatbox` key prop includes `currentChatId`, `selectedProviderId`, `selectedPromptId`, and `nextChatOrgContext`.
        *   [✅] Loading a chat with a `system_prompt_id` correctly updates `selectedPromptId` in `AiChatPage`. (Partially addressed by frontend changes, but full verification blocked by "only first item loads" bug and lack of seeded data with `system_prompt_id`). (Note: Resolved)
        *   [✅] Clicking "New Chat" calls `startNewChat` with correct context, tracks analytics, and resets `selectedProviderId` and `selectedPromptId`.
    *   Commits:
        *   `feat(AiChat): pass full Chat object on item click (attempted fix for load bug)`
        *   `fix(AiChatPage): attempt to ensure chatsByContext is updated on chat load (incomplete fix)`
        *   (Further commits for this step will depend on the successful resolution of the loading bug via STEP-3.3.2)
    *   Files to Update:
        *   `apps/web/src/pages/AiChat.tsx`
        *   `apps/web/src/pages/AiChat.test.tsx`
        *   `apps/web/src/components/ai/ChatHistoryList.tsx`
        *   `apps/web/src/components/ai/ChatItem.tsx`
    *   Status:
        *   [✅] Implement component changes (initial attempt).
        *   [✅] Add/Update unit tests for `AiChat.tsx`.
        *   [✅] Run tests. Debug until pass (GREEN) - for existing functionality, loading bug outstanding. (Note: Resolved)
        *   [✅] Commit work to GitHub (pending full resolution). (Note: Resolved and committed)

#### STEP-3.3.2: Refine AiChat Data Flow & Enhance ChatItem UI** [✅]
    *   Description: Resolve chat loading issues by enhancing backend/store data fetching. Improve the data loading architecture for selected chats and add more contextual information to `ChatItem` components.
    *   Sub-steps:
        *   [✅] **Implement Backend/Store Enhancement for Comprehensive Chat Details (`loadChatDetails`)**:
            *   **Backend (`supabase/functions/chat-details/index.ts`):**
                *   [✅] Modify `mainHandler` (GET): Select all necessary `Chat` fields (e.g., `*` or explicit list: `id, title, system_prompt_id, user_id, organization_id, created_at, updated_at`) from the `chats` table during the initial access check.
                *   [✅] Update the successful GET response structure to return an object: `{ chat: ChatObject, messages: ChatMessage[] }`.
                *   **Status:** DONE (Tests Passing)
                *   **Notes:** Modified `mainHandler` to select full chat metadata and return `{ chat: chatWithFullMetadata, messages: messages }`.
            *   **API Client (`packages/api/src/ai.api.ts`):**
                *   [✅] Modify `getChatMessages` method (consider renaming to `getFullChatDetails` or `getChatWithMessages`).
                *   [✅] Update its return type to `Promise<ApiResponse<{ chat: Chat, messages: ChatMessage[] }>>`.
                *   [✅] Write/Update unit tests for `supabase/functions/chat-details/index.test.ts` to verify the new response structure and data.
                *   **Status:** DONE (Tests Passing)
                *   **Notes:** Method renamed to `getChatWithMessages`, return type updated. Tests for `ai.api.test.ts` (covering API client) updated and pass. Backend tests in `chat-details/index.test.ts` also updated and pass.
            *   **Store (`packages/store/src/aiStore.ts`):**
                *   [✅] Modify the `loadChatDetails(chatId: string)` action:
                    *   Call the updated (and possibly renamed) API client method.
                    *   On successful API response:
                        *   Update `state.chatsByContext` with the full `chat` metadata object received from `response.data.chat`. (Ensure correct placement in `personal` or `orgs[orgId]` array, updating if exists, adding if new to the context array).
                        *   Update `state.messagesByChatId[chatId]` with `response.data.messages`.
                        *   Set `state.currentChatId = chatId`.
                        *   Set `state.isDetailsLoading = false` and `state.aiError = null`.
                *   **Status:** DONE (Tests Passing)
                *   **Notes:** `loadChatDetails` now correctly updates `chatsByContext` with full chat metadata and `messagesByChatId`.
            *   **Store Tests (`packages/store/src/tests/aiStore.test.ts`):**
                *   [✅] Write/Update unit tests in `packages/store/src/tests/aiStore.test.ts` for `loadChatDetails` to verify it correctly updates `chatsByContext`, `messagesByChatId`, and `currentChatId` with the new comprehensive data structure.
                *   **Status:** DONE (Tests Passing)
                *   **Notes:** Comprehensive tests for `loadChatDetails` created in `aiStore.details.test.ts` (actual path) are passing, covering various scenarios.
        *   [✅] **Refactor `AiChatPage` Post-Store Enhancement**:
            *   [✅] Remove the manual `useAiStore.setState` call within `handleLoadChat` that attempted to update `chatsByContext`.
            *   [✅] Verify that `handleLoadChat` now primarily calls the enhanced `loadChatDetails` store action.
            *   [✅] Confirm `currentChatDetails` (derived via `useMemo`) and `selectedPromptId` (derived via `useEffect`) update correctly based *solely* on the state managed by the enhanced `loadChatDetails`.
            *   [✅] Update unit tests in `apps/web/src/pages/AiChat.test.tsx` to reflect the simplified `handleLoadChat` and verify correct behavior with the improved store interaction.
        *   [✅] **STEP-3.3.2.1: Refactor `ChatItem.tsx` for Direct Store Interaction and Enhance UI (TDD)**
            *   Description: Refactor `ChatItem.tsx` to call `loadChatDetails` directly from the store upon user click. Simultaneously, enhance its UI to display `created_at`/`updated_at` timestamps, creator's user ID (for organization chats), and the system prompt name if applicable. This will follow a Test-Driven Development approach.
            *   Sub-steps:
                *   **1. [TEST-UNIT] Define and Write Failing Unit Tests for `ChatItem.tsx` & Related Components**: [✅]
                    *   **`ChatItem.test.tsx` - Test Cases:**
                        *   **Direct Store Interaction:**
                            *   `[✅]` Clicking `ChatItem` calls `useAiStore.getState().loadChatDetails` with the correct `chat.id`.
                            *   `[✅]` The `onClick` prop is no longer present or used.
                        *   **UI Enhancements:**
                            *   `[✅]` Renders formatted `created_at` timestamp (e.g., using `date-fns`).
                            *   `[✅]` Renders formatted `updated_at` timestamp.
                            *   `[✅]` For organization chats, renders the creator's `user_id`.
                            *   `[✅]` Does *not* render creator's `user_id` for personal chats.
                            *   `[✅]` If `chat.system_prompt_id` exists and a matching prompt is in `availablePrompts` (from mocked `useAiStore`), renders the prompt's name.
                            *   `[✅]` Handles cases where `chat.system_prompt_id` exists but no matching prompt is found (e.g., renders nothing for prompt name or a default).
                            *   `[✅]` Handles cases where `chat.system_prompt_id` is null (renders nothing for prompt name).
                    *   **`ChatHistoryList.test.tsx` - Test Updates:** [✅]
                        *   `[✅]` Remove assertions related to an `onLoadChat` prop being passed to or called by `ChatItem`. Verify `ChatItem` receives `chat` and `isActive` props.
                    *   **`AiChatPage.test.tsx` - Test Updates:** [✅]
                        *   `[✅]` Remove tests and assertions for the `handleLoadChat` function.
                        *   `[✅]` Remove assertions related to the `onLoadChat` prop of `ChatHistoryList`.
                    *   **Files to Update:** `apps/web/src/components/ai/ChatItem.test.tsx`, `apps/web/src/components/ai/ChatHistoryList.test.tsx`, `apps/web/src/pages/AiChat.test.tsx`
                    *   **Expected Status:** Tests related to new/changed behavior should fail (RED). [✅]
                *   **2. [UI] Implement `ChatItem.tsx` Direct Store Interaction and UI Enhancements**: [✅]
                    *   **Direct Store Interaction:**
                        *   `[✅]` Remove the `onClick` prop from `ChatItemProps`.
                        *   `[✅]` Import `useAiStore` (if not already fully imported for `deleteChat`).
                        *   `[✅]` In the `ChatItem`'s main clickable element, call `useAiStore.getState().loadChatDetails(chat.id)`.
                    *   **UI Enhancements:**
                        *   `[✅]` (If not present) Add `date-fns` dependency to `apps/web`: `pnpm add date-fns --filter apps/web`.
                        *   `[✅]` Implement the display logic for formatted `created_at` and `updated_at` timestamps using `date-fns` (e.g., `formatDistanceToNow`).
                        *   `[✅]` Implement logic to display the creator's `user_id` for organization chats.
                        *   `[✅]` Fetch `availablePrompts` from `useAiStore` within `ChatItem`.
                        *   `[✅]` Implement logic to find and display the system prompt name if `chat.system_prompt_id` exists and a match is found in `availablePrompts`.
                        *   `[ ]` Add theme background color and card outline to selected ChatItem                    
                    *   **File to Update:** `apps/web/src/components/ai/ChatItem.tsx`
                *   **3. [REFACTOR] Update Related Components (`ChatHistoryList.tsx`, `AiChatPage.tsx`)**: [✅]
                    *   **`ChatHistoryList.tsx`:**
                        *   `[✅]` Remove the `onLoadChat` prop from `ChatHistoryListProps`.
                        *   `[✅]` Remove `onLoadChat` from destructuring and from being passed to `ChatItem`.
                    *   **`AiChatPage.tsx`:**
                        *   `[✅]` Remove the `handleLoadChat` function.
                        *   `[✅]` Remove the `onLoadChat` prop when rendering `ChatHistoryList`.
                    *   **Files to Update:** `apps/web/src/components/ai/ChatHistoryList.tsx`, `apps/web/src/pages/AiChat.tsx`
                *   **4. [TEST-UNIT] Run All Tests and Refactor**: [✅]
                    *   `[✅]` Execute tests for `ChatItem.test.tsx`, `ChatHistoryList.test.tsx`, and `AiChatPage.test.tsx`.
                    *   `[✅]` Debug any failures until all tests pass (GREEN).
                    *   `[✅]` **[REFACTOR]** Review `ChatItem.tsx` for code clarity, efficiency, and proper hook usage.
                *   **5. [COMMIT] Commit Changes**: [✅]
                    *   `[✅]` Commit the successfully refactored and tested changes with a message like "refactor(ChatItem): Implement direct store call for details & UI enhancements w/ TDD".
    *   Files to Update: (This list is now covered within the sub-steps above)
        *   `supabase/functions/chat-details/index.ts`
        *   `supabase/functions/chat-details/index.test.ts`
        *   `packages/api/src/ai.api.ts`
        *   `packages/store/src/aiStore.ts`
        *   `packages/store/src/tests/aiStore.test.ts`
        *   `apps/web/src/pages/AiChat.tsx`
        *   `apps/web/src/pages/AiChat.test.tsx`
        *   `apps/web/src/components/ai/ChatItem.tsx`
        *   `apps/web/src/components/ai/ChatItem.test.tsx`
        *   (Potentially `apps/web/src/components/ai/ChatHistoryList.tsx` if `ChatItem` direct store interaction is chosen)
    *   Status:
        *   [✅] Plan backend/API changes.
        *   [✅] Implement backend, API client, and store changes.
        *   [✅] Add/Update unit tests for backend, API client, and store.
        *   [✅] Run backend and frontend tests. Debug until pass (GREEN).
        *   [✅] Implement `AiChatPage.tsx` refactor.
        *   [✅] Implement `ChatItem.tsx` UI enhancements and direct store interaction (optional).
        *   [✅] Add/Update unit tests for frontend components.
        *   [✅] Run all tests. Debug until pass (GREEN).
        *   [✅] Commit work to GitHub.

#### STEP-3.3.3: Implement System Prompt Loading [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases: Verify `SystemPromptSelector` updates its selected value when `currentChat` changes and has a `system_prompt_id`.
* [✅] Update `apps/web/src/pages/AiChat.tsx` and `apps/web/src/components/ai/SystemPromptSelector.tsx`:
  * [✅] Pass the `currentChat?.system_prompt_id` to the `SystemPromptSelector` as its `value` prop (or similar mechanism).
  * [✅] Ensure the selector correctly reflects this value when a chat is loaded.
* [✅] Run tests. Debug until pass (GREEN).
* [✅] Commit changes with message "feat(UI): Load selected system prompt based on active chat"

#### STEP-3.3.4: Implement User Attribution Display and Refactor `ChatMessageBubble` [UI] [TEST-UNIT] [COMMIT] [✅]
*   **STEP-3.3.4.A: [UI] [TEST-UNIT] Create Reusable `AttributionDisplay` Component [✅]**
    *   `[✅]` Define Test Cases (current user, org member, fallback to ID, various profile data points).
    *   `[✅]` Create `apps/web/src/components/common/AttributionDisplay.test.tsx`.
    *   `[✅]` Write test shells in `AttributionDisplay.test.tsx`.
    *   `[✅]` Create `apps/web/src/components/common/AttributionDisplay.tsx`.
    *   `[✅]` Implement component logic using `useAuthStore` and `useOrganizationStore`.
    *   `[✅]` Run tests. Debug until pass (GREEN).
    *   `[✅]` **[REFACTOR]** Ensure clarity, reusability.
    *   `[✅]` Commit changes with message "feat(UI): Create reusable AttributionDisplay component w/ tests".
*   **STEP-3.3.4.B: [UI] [TEST-UNIT] Create/Refactor `ChatMessageBubble` Component** [✅]
    *   `[✅]` Define Test Cases:
        *   `[✅]` Renders as a `Card` component.
        *   `[✅]` Applies distinct styling for `user` (blue background) vs. `assistant` (grey background).
        *   `[✅]` Correctly integrates `AttributionDisplay` for user messages.
        *   `[✅]` Correctly integrates `AttributionDisplay` for assistant messages (pending `model_id` on `ChatMessage`).
        *   `[✅]` Renders `message.content`.
        *   `[✅]` Includes an edit button/icon for user messages (and not for assistant messages).
        *   `[✅]` Calls `onEditClick` with messageId and content when edit button is clicked for user messages.
    *   `[✅]` Create/Update `apps/web/src/components/ai/ChatMessageBubble.test.tsx`.
    *   `[✅]` Write test shells in `ChatMessageBubble.test.tsx`.
    *   `[✅]` Create/Update `apps/web/src/components/ai/ChatMessageBubble.tsx`:
        *   `[✅]` Refactor to use `Card` from `shadcn/ui`.
        *   `[✅]` Implement role-based background styling.
        *   `[✅]` Integrate `AttributionDisplay` for user/assistant attribution.
        *   `[✅]` Render `message.content`.
        *   `[✅]` Implement edit button logic.
    *   `[✅]` Run tests. Debug until pass (GREEN).
    *   `[✅]` **[REFACTOR]** Ensure clarity.
    *   `[✅]` Commit changes with message "feat(UI): Create ChatMessageBubble with Card, AttributionDisplay, and edit features w/ tests".
*   **STEP-3.3.4.C: [UI] [TEST-UNIT] Integrate `ChatMessageBubble` into Message Display Area (e.g., `AiChatbox.tsx`)** [✅]
    *   `[✅]` C.1. Examine `AiChatbox.tsx` to understand how messages are currently rendered and identify where `ChatMessageBubble` will be integrated.
    *   `[✅]` C.2. Identify if `AiChatbox.test.tsx` exists. (It did not, created).
    *   `[✅]` C.3. Define test cases for `AiChatbox.test.tsx`, focusing on the integration of `ChatMessageBubble` and the passing of `message` and `onEditMessageRequest` props. Also include existing core functionality tests.
    *   `[✅]` C.4. Create/Update `AiChatbox.test.tsx`: Add mocks for `ChatMessageBubble`, `useAiStore`, and necessary helper data/functions. Implement `it.todo` blocks for defined test cases.
    *   `[✅]` C.5. Modify `AiChatbox.tsx`: Import `ChatMessageBubble`. Add `onEditMessageRequest` to `AiChatboxProps`. Replace existing message rendering logic with `ChatMessageBubble`, passing the `message` object and conditionally passing `onEditMessageRequest` (as `onEditClick`). Handle any necessary state/prop drilling. Remove direct markdown/syntax highlighting. Update `promptId` handling to allow `null` and pass to store.
    *   `[✅]` C.6. Implement and run tests in `AiChatbox.test.tsx`. Iterate on component and test logic until all tests pass. (12 tests implemented and passing).
    *   `[✅]` C.7. Consider implications for auto-scrolling and ensure it still functions correctly with `ChatMessageBubble`. (Auto-scroll logic reviewed and simplified).
    *   `[✅]` Commit changes with message "feat(AI): Integrate ChatMessageBubble into AiChatbox, add tests, and fix promptId typing".
*   **Note on `ChatMessage` type:** `[ ]` Add `model_id: string | null` to `ChatMessage` type in `@paynless/types` and ensure backend populates it.

#### STEP-3.3.5: Implement Auto-Scroll (`AiChatbox.tsx`) [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases: Simulate adding messages (user & assistant), assert scroll properties are updated. Test for container not available. Mock `React.useRef` and use fake timers for `requestAnimationFrame`.
* [✅] Add `data-message-id` to `ChatMessageBubble.tsx`.
* [✅] Update auto-scroll logic in `AiChatbox.tsx` to scroll for all new messages.
* [✅] Add `data-testid` to `AiChatbox.tsx` root for testability.
* [✅] Write/Update tests in `apps/web/src/components/ai/AiChatbox.test.tsx` for auto-scroll.
* [✅] Run tests. Debug scroll logic until pass (GREEN).
* [✅] **[REFACTOR]** Scroll logic reviewed and simplified (already part of AiChatbox, not a separate MessageList).
* [✅] Commit changes with message "feat(UI): Implement and test auto-scroll for AiChatbox, ensure ChatMessageBubble has data-id"

#### STEP-3.3.6: Add Loading States and Error Boundary (`AiChat.tsx`) [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases: Verify skeleton renders in message area (`AiChat.tsx`) when `isDetailsLoading` is true. Verify `ErrorBoundary` catches errors from children and displays fallback.
* [✅] Create `apps/web/src/components/common/ErrorBoundary.tsx`.
* [✅] Update `apps/web/src/pages/AiChat.tsx`:
  * [✅] Import and use `ErrorBoundary` to wrap main content.
  * [✅] Import `Skeleton` from `shadcn/ui`.
  * [✅] Use `useAiStore` to get `isDetailsLoading` state.
  * [✅] Conditionally render `Skeleton` components in the message display area (where `AiChatbox` would be) when `isDetailsLoading` is true.
* [✅] Write/Update tests in `apps/web/src/pages/AiChat.test.tsx` for these loading states and error boundary behavior.
* [✅] Run tests. Debug until pass (GREEN).
* [✅] Commit changes with message "feat(UI): Add loading skeletons and ErrorBoundary to AiChatPage w/ tests"

### STEP-3.4: Implement Markdown Support [UI] [🚧]

#### STEP-3.4.1: Install Dependencies
* [✅] Install `react-markdown` and `remark-gfm`: `pnpm add react-markdown remark-gfm` in `apps/web`.

#### STEP-3.4.2: Implement Markdown Rendering in Messages (`ChatMessageBubble.tsx`) [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases: Input various markdown syntax, verify correct HTML tags rendered (`<strong>`, `<em>`, `<li>`, `<code>`, `<a>`, `<p>`, `<h1>-<h3>`, `<del>`, `<hr>`, task lists, `<table>`). Expect failure (RED).
* [✅] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`. (All 28 tests passing).
* [✅] Update `ChatMessageBubble.tsx`:
  * [✅] Import `ReactMarkdown` from `react-markdown` and `remarkGfm` from `remark-gfm`.
  * [✅] Replace direct rendering of `message.content` with `<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>`.
  * [✅] Apply necessary CSS styling for rendered markdown elements (headings, lists, code blocks, links, blockquotes) consistent with `shadcn/ui` theme (Initial styling with `prose` classes applied).
* [✅] Run tests. Debug rendering/styling until pass (GREEN). (All 28 tests passing).
* [✅] **[REFACTOR]** (Moved to STEP-3.4.3)
* [✅] Commit changes with message "feat(UI): Implement Markdown rendering for chat messages w/ tests" (Pending styling review and refactor).

#### STEP-3.4.3: Refactor to Reusable `MarkdownRenderer` Component with Syntax Highlighting [UI] [TEST-UNIT] [COMMIT]
*   **Phase 1: Basic Refactor (Moving existing functionality)**
    *   [✅] **[UI]** Create `apps/web/src/components/common/MarkdownRenderer.tsx`.
        *   Props: `content: string;`, `className?: string;`.
        *   Move `ReactMarkdown`, `remarkGfm` usage, and `proseStyles` from `ChatMessageBubble.tsx` to `MarkdownRenderer.tsx`.
    *   [✅] **[UI]** Update `ChatMessageBubble.tsx` to use the new `MarkdownRenderer` component.
    *   [✅] **[TEST-UNIT]** Create `apps/web/src/components/common/MarkdownRenderer.test.tsx`.
    *   [✅] **[TEST-UNIT]** Move detailed markdown rendering tests from `ChatMessageBubble.test.tsx` to `MarkdownRenderer.test.tsx`.
    *   [✅] **[TEST-UNIT]** Update `ChatMessageBubble.test.tsx` to mock `MarkdownRenderer` and verify it's called with correct props.
    *   [✅] Run all tests for `MarkdownRenderer` and `ChatMessageBubble`. Debug until pass (GREEN).
*   **Phase 2: Adding Syntax Highlighting**
    *   [✅] **[DEPS]** Install `react-syntax-highlighter` (and types) in `apps/web`.
    *   [✅] **[UI]** Update `MarkdownRenderer.tsx` to import `SyntaxHighlighter` (e.g., Prism) and a style.
    *   [✅] **[UI]** Use the `components` prop of `ReactMarkdown` to override `code` block rendering with `SyntaxHighlighter`.
    *   [✅] **[TEST-UNIT]** Update GFM code block test in `MarkdownRenderer.test.tsx` to verify syntax highlighting is active (e.g., check for `SyntaxHighlighter` mock or specific token classes).
    *   [✅] Run `MarkdownRenderer` tests. Debug until pass (GREEN).
*   **Phase 3: Styling Review and Polish**
    *   [✅] **[DEPS]** Ensure `@tailwindcss/typography` plugin is installed and configured.
    *   [✅] **[UI]** Review and adjust `proseStyles` in `MarkdownRenderer.tsx` or global Tailwind theme for consistent styling of all markdown elements, including syntax-highlighted code blocks.
    *   [✅] Manually verify styling in the browser.
*   [✅] Commit changes with message like "feat(UI): Create MarkdownRenderer with syntax highlighting and refactor usage"
*   [✅] Reusable MarkdownRenderer with syntax highlighting implemented, tested, and integrated.

#### STEP-3.4.4: Chat Bugfixes [TEST-UNIT] [COMMIT] [🚧]
* [✅] **Restore Bounding Box & Scrollbar on ChatHistoryList** [UI] [TEST-UNIT]
    * [✅] Add a bounding box (border, background, rounded corners) and vertical scrollbar to ChatHistoryList.
    * [✅] Ensure the list is visually separated and scrollable when overflowing.
    * [✅] Write/update unit tests to verify bounding box and scrollbar presence.
* [✅] **Fix AttributionDisplay Integration** [UI] [TEST-UNIT]
    * [✅] Ensure AttributionDisplay is rendered in ChatMessageBubble for both user and assistant messages.
    * [✅] Pass correct props: message, currentUserId, currentOrgId.
    * [✅] Write/update unit tests to verify AttributionDisplay integration and props.
    * [✅] AttributionDisplay now robustly displays '(You)' for the current user and model names for assistants. All tests pass.
* [✅] **Alternate Left/Right Justification for Messages** [UI] [TEST-UNIT]
    * [✅] User messages are right-justified, assistant/other messages left-justified.
    * [✅] Update ChatMessageBubble and/or parent container to apply correct alignment.
    * [✅] Write/update unit tests to verify correct alignment for each message type.
* [✅] **Comprehensive Integration Test Coverage** [TEST-INT]
    * [✅] Update or expand AiChat.integration.test.tsx to cover:
        * [✅] ChatHistoryList bounding box and scrollbar.
        * [✅] Correct alignment and attribution for messages in AiChatbox.
        * [✅] Proper integration of AttributionDisplay and ChatMessageBubble.
        * [✅] All new/refactored components in the chat flow.
    * [✅] Ensure all relevant integration tests pass (GREEN).
* [✅] **Commit changes** with message like "fix(UI): AttributionDisplay '(You)' indicator, model name, message alignment, and integration tests"

### STEP-3.5: Implement Chat Rewind/Reprompt UI [UI] [🚧]

#### STEP-3.5.1: Create Message Edit Controls (`ChatMessageBubble.tsx`) [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases (Gemini 3.4.2): Verify button visible only on user messages. Click triggers callback with correct message ID/content.
* [✅] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`.
* [✅] Update `ChatMessageBubble.tsx`:
  * [✅] Add an edit button/icon (e.g., Pencil) to user message bubbles.
  * [✅] Prop: `onEditClick?: (messageId: string, messageContent: string) => void`.
  * [✅] Call `onEditClick(message.id, message.content)` when the button is clicked.
* [✅] Run tests. Debug until pass (GREEN).
* [✅] Commit changes with message "feat(UI): Add edit control to user messages for rewind w/ tests"

#### STEP-3.5.2: Implement Rewind Mode in Chat Interface (`AiChatbox.tsx`) [TEST-UNIT] [COMMIT] [✅]
* [✅] Define Test Cases (Gemini 3.4.2): Entering rewind mode sets input value and state correctly. Submit button changes text. Resubmit action calls correct store function. State resets after resubmit.
* [✅] Write/Update tests for `apps/web/src/pages/AiChatbox.tsx`.
* [✅] Update `AiChatbox.tsx`:
  * [✅] Add state: `const [rewindState, setRewindState] = useState<{ messageId: string | null }>({ messageId: null });` (Note: Implemented via store: `rewindTargetMessageId`, `prepareRewind`, `cancelRewindPreparation`)
  * [✅] Implement `handleEditClick(messageId, messageContent)` passed to `ChatMessageBubble`:
      *   [✅] `setRewindState({ messageId });` (Note: Implemented via store: `prepareRewind(messageId, currentChatId)`)
      *   [✅] Update chat input component's value state with `messageContent`.
  * [✅] Pass `isRewinding = {rewindState.messageId !== null}` to chat input component. (Note: Logic implemented directly in `AiChatbox` based on `rewindTargetMessageId` from store)
* [✅] Update chat input component (`AiChatbox.tsx`?): (Note: `AiChatbox.tsx` is the component)
  * [✅] Accept `isRewinding` prop. (Note: Handled internally based on `rewindTargetMessageId`)
  * [✅] Change submit button text to "Resubmit" if `isRewinding` is true.
  * [✅] On submit, check `isRewinding`. If true, call a specific `handleResubmit(inputValue)` prop; otherwise, call standard `handleSendMessage(inputValue)`. (Note: `handleSend` in `AiChatbox.tsx` handles this logic using `rewindTargetMessageId`)
* [✅] Implement `handleResubmit(editedContent)` in `AiChatbox.tsx`: (Note: Integrated into `handleSend`)
  *   If `rewindState.messageId` exists: (Note: Checks `rewindTargetMessageId`)
      *   [✅] Call `useAiStore.getState().sendMessage({ message: editedContent, providerId: /* current provider */, promptId: /* current prompt */, rewindFromMessageId: rewindState.messageId });` (or the dedicated `rewindAndSendMessage` action if created in store). (Note: `sendMessage` in store is expected to handle this based on `rewindTargetMessageId` being set).
      *   [✅] `setRewindState({ messageId: null });` (Note: Implemented via store: `cancelRewindPreparation()`)
      *   [✅] Clear chat input value state.
* [✅] Run tests. Debug state management and handlers until pass (GREEN).
* [✅] Commit changes with message "feat(UI): Implement rewind mode state and handlers in chat interface w/ tests"

### STEP-3.6: Implement Admin Controls UI [UI] [🚧]

#### STEP-3.6.1: Create `OrganizationChatSettings` Component & Backend Logic for Chat Permissions [BE] [UI] [TEST-UNIT] [COMMIT]
*   **Sub-Step 3.6.1.1: [BE] Enhance Backend to Support `allow_member_chat_creation` Setting**
    *   [✅] Modify `supabase/functions/organizations/details.ts` (`handleUpdateOrgDetails` function):
        *   [✅] Add `allow_member_chat_creation` to the list of accepted properties in the request body.
        *   [✅] Validate that `allow_member_chat_creation` is a boolean if provided.
        *   [✅] Include `allow_member_chat_creation` in the `updatePayload` passed to `supabaseClient.from('organizations').update()`.
    *   [✅] Review/Update RLS policies for the `organizations` table:
        *   [✅] Ensure that users with an 'admin' role in `organization_members` are allowed to update the `allow_member_chat_creation` column. (Verified by successful test runs with mock RLS behavior)
    *   [✅] **[TEST-UNIT]** Write/Update unit tests for `supabase/functions/organizations/details.test.ts`:
        *   [✅] Test successful update of `allow_member_chat_creation` by an admin.
        *   [✅] Test rejection of update if `allow_member_chat_creation` is not a boolean.
        *   [✅] Test that other valid fields (name, visibility) can still be updated alongside/independently.
        *   [✅] Test that non-admin users are blocked by RLS (if possible to simulate in tests, or confirm via manual RLS check). (Verified by tests)

*   **Sub-Step 3.6.1.2: [API] Update API Client for Organization Settings**
    *   [✅] Review `packages/api/src/organizations.api.ts` (or equivalent file for organization API calls).
    *   [✅] Ensure the method responsible for updating organization details (e.g., `updateOrganization`) can correctly send the `allow_member_chat_creation: boolean` field in its payload.
    *   [✅] Update the type/interface for the update payload if necessary. (Handled by generated types)
    *   [✅] **[TEST-UNIT]** Write/Update unit tests for the API client method to verify it correctly sends the new field.

*   **Sub-Step 3.6.1.3: [STORE] Update Store for Organization Settings**
    *   [✅] Review `packages/store/src/organizationStore.ts`.
    *   [✅] Modify the action that handles updating organization settings (e.g., `updateOrganizationSettings` or similar):
        *   [✅] Ensure it can accept `allow_member_chat_creation: boolean` as part of its parameters.
        *   [✅] Ensure it passes this parameter to the relevant API client method.
        *   [✅] Update the store state (e.g., `currentOrganizationDetails`) with the new setting upon successful API response.
    *   [✅] **[TEST-UNIT]** Write/Update unit tests for the store action:
        *   [✅] Test that the action calls the API client with the correct parameters.
        *   [✅] Test that the store state is updated correctly on success.

*   **Sub-Step 3.6.1.4: [UI] Create `OrganizationChatSettings.tsx` Component**
    *   [✅] Define Test Cases for `OrganizationChatSettings.tsx`:
        *   [✅] Component renders a `Switch` and a descriptive label (e.g., "Allow members to create organization chats").
        *   [✅] `Switch` is `checked` based on `currentOrganizationDetails.allow_member_chat_creation` from `useOrganizationStore`.
        *   [✅] `Switch` is `disabled` if the `currentUserRoleInOrg` (from `useOrganizationStore`) is not 'admin'.
        *   [✅] `Switch` is visible and enabled if the user is an admin.
        *   [✅] Toggling the `Switch` calls the appropriate action from `useOrganizationStore` (e.g., `updateOrganizationSettings`) with the correct `organizationId` and the new boolean value for `allow_member_chat_creation`.
        *   [✅] Displays a loading state while the update is in progress.
        *   [✅] Displays an error message if the update fails.
    *   [✅] Create `apps/web/src/components/organizations/OrganizationChatSettings.unit.test.tsx`.
    *   [✅] Write test shells in `OrganizationChatSettings.unit.test.tsx` based on the defined test cases. Expect failure (RED).
    *   [✅] Create component file `apps/web/src/components/organizations/OrganizationChatSettings.tsx`.
        *   [✅] Implement the component using `Switch` from `shadcn/ui`.
        *   [✅] Use `useOrganizationStore` to get `currentOrganizationDetails`, `currentUserRoleInOrg`, and the update action.
        *   [✅] Implement the `onCheckedChange` handler to call the store action.
        *   [✅] Handle loading and error states.
    *   [✅] Run `OrganizationChatSettings.unit.test.tsx`. Debug until all tests pass (GREEN).
    *   [✅] **[REFACTOR]** Ensure clarity, reusability, and accessibility.

*   **Sub-Step 3.6.1.5: [COMMIT] Commit all changes**
    *   [✅] Commit backend, API, store, and UI changes with a message like "feat(Admin): Implement org chat creation setting (BE, API, Store, UI) w/ tests".
    
#### STEP-3.6.2: Integrate Chat Settings into Organization Settings Card [TEST-INT] [COMMIT]
* [✅] Define Integration Test Cases (Manual - Gemini 2.5.7): Test delete visibility/functionality as admin/member. Test settings toggle visibility/functionality as admin/member. Test member chat creation restriction via RLS block. Verify analytics.
* [✅] Update `apps/web/src/pages/OrganizationSettingsCard.tsx` (or relevant component):
  * [✅] Import and render the `OrganizationChatSettings` component in an appropriate section.
  * [✅] Ensure necessary props (like `orgId`) are passed if needed, or rely on store context.
* [✅] Perform manual integration tests covering visibility, functionality, and downstream effects (RLS blocking). Debug until pass (GREEN).
* [✅] Commit changes with message "feat(UI): Integrate chat settings into organization settings card w/ manual tests"

### STEP-3.7: Implement Dummy Test Provider for Development [ARCH] [STORE] [UI] [TEST-UNIT] [TEST-INT]

**Goal:** Allow developers to test chat UI functionality and message flow without incurring AI costs or relying on external AI services during development, by providing a dummy provider that echoes user input.

#### STEP-3.7.1: Define Dummy Provider Behavior & Integration Strategy [ARCH]
*   [ ] **3.7.1.1: [ARCH] Define Dummy Provider Identity:**
    *   ID: `dummy-test-provider`
    *   Display Name: "Dummy Test Provider (Echo)"
    *   Model(s) (if applicable for UI): e.g., `dummy-echo-v1`
*   [ ] **3.7.1.2: [ARCH] Define Echo Logic and Message Structure:**
    *   Input: User's `ChatMessage` content.
    *   Output: An assistant `ChatMessage` object with:
        *   `role: 'assistant'`
        *   `content: "Echo from Dummy: " + userMessageContent` (or similar prefix).
        *   `provider_id: 'dummy-test-provider'` (or the selected model under it).
        *   `token_usage`: Mocked values, e.g., `prompt_tokens` based on input length, `completion_tokens` based on output length.
        *   `id`: A unique ID for the message.
        *   `chat_id`: The current chat's ID.
        *   `created_at`, `updated_at`: Current timestamps.
*   [ ] **3.7.1.3: [ARCH] Choose Integration Approach:**
    *   Decision: Implement as a client-side mock within the `aiStore`'s `sendMessage` action. This avoids unnecessary backend changes for a dev-only tool and simplifies implementation. The dummy provider will only be available if `process.env.NODE_ENV === 'development'`.

#### STEP-3.7.2: Implement Store Modifications for Dummy Provider [STORE] [TEST-UNIT] [COMMIT]
*   [ ] **3.7.2.1: [TYPES] Update Provider/Model Types if Necessary**
    *   Ensure `Provider` and `Model` types in `@paynless/types` (or relevant store types) can accommodate the dummy provider and its mock model (e.g., `id`, `name`, `providerId`).
*   [ ] **3.7.2.2: [STORE] Conditionally Add Dummy Provider to `availableProviders` in `aiStore`**
    *   Modify `packages/store/src/aiStore.ts` (e.g., in `loadAiConfig` action or initial state setup):
        *   If `process.env.NODE_ENV === 'development'`, add the "Dummy Test Provider" object (with its mock model) to the `state.availableProviders` and `state.modelsByProvider` collections.
    *   **[TEST-UNIT]** Update `packages/store/src/tests/aiStore.test.ts` (or relevant test file, e.g., `aiStore.config.test.ts`):
        *   Verify the dummy provider and its model are added to `availableProviders` and `modelsByProvider` when `process.env.NODE_ENV` is 'development'.
        *   Verify they are NOT added when `process.env.NODE_ENV` is 'production'.
*   [ ] **3.7.2.3: [STORE] Implement Client-Side Echo Logic in `sendMessage` Action**
    *   Modify the `sendMessage` action in `packages/store/src/aiStore.ts`:
        *   Retrieve `providerId` from the `sendMessage` parameters or from current state.
        *   **Condition:** If `providerId === 'dummy-test-provider'`:
            1.  Set `state.isSendingMessage = true`.
            2.  Add the user's outgoing message to `state.messagesByChatId[chatId]`.
            3.  Simulate a brief delay (e.g., `setTimeout` for 500ms) to mimic network latency.
            4.  After the delay:
                *   Construct the assistant's echo message based on the definition in STEP-3.7.1.2.
                *   Add the echo message to `state.messagesByChatId[chatId]`.
                *   Update `state.currentChat?.updated_at` or relevant chat metadata.
                *   Set `state.isSendingMessage = false`.
                *   Ensure `rewindTargetMessageId` is cleared if it was used (though rewind with a dummy might be trivial).
        *   **Else (not dummy provider):** Proceed with the existing logic to call the actual API client.
    *   **[TEST-UNIT]** Update `packages/store/src/tests/aiStore.test.ts` (e.g., `aiStore.messages.test.ts`):
        *   Test `sendMessage` with `providerId: 'dummy-test-provider'`:
            *   Verify `isSendingMessage` toggles correctly.
            *   Verify user message is added to state.
            *   Verify (after simulated delay) the assistant's echo message is added with correct content and attribution.
            *   Verify no actual API client methods are called.
        *   Test `sendMessage` with a real provider ID:
            *   Verify it still calls the API client as expected.
*   [ ] **3.7.2.4: [COMMIT]** Commit changes with message "feat(STORE): Add dummy echo provider client-side logic for development w/ tests"

#### STEP-3.7.3: UI Integration and Testing [UI] [TEST-INT] [COMMIT]
*   [ ] **3.7.3.1: [UI] Verify Dummy Provider in `ModelSelector`**
    *   In `apps/web/src/components/ai/ModelSelector.tsx` (or wherever providers/models are selected):
        *   No direct code changes should be needed if it correctly iterates over `availableProviders` and `modelsByProvider` from `useAiStore`.
    *   Manually start the app in development mode.
    *   Navigate to the chat page.
    *   Verify that "Dummy Test Provider (Echo)" and its model appear in the provider/model selection UI.
*   [ ] **3.7.3.2: [UI] End-to-End Manual Test of Chat Flow with Dummy Provider**
    *   Select the "Dummy Test Provider" and its model.
    *   Send several messages.
    *   Verify:
        *   User messages appear correctly.
        *   Echoed assistant messages appear shortly after, with the defined prefix and correct attribution.
        *   Message timestamps are correct.
        *   Markdown rendering (if applicable) works for echoed content.
        *   Chat history items are created correctly for chats using the dummy provider.
        *   Rewind/Reprompt UI (if used on a dummy message or an echo) behaves predictably (though its utility might be limited here).
*   [ ] **3.7.3.3: [TEST-INT] Update/Add Integration Test for Dummy Provider**
    *   In `apps/web/src/pages/AiChat.integration.test.tsx` (or a new dedicated test):
        *   Set up the test environment to simulate development mode (`process.env.NODE_ENV = 'development'`)
        *   Ensure `aiStore` is initialized to include the dummy provider in its `availableProviders`.
        *   Simulate user selecting the dummy provider via the UI.
        *   Simulate user typing and sending a message.
        *   Use `waitFor` to check that the user's message appears in the `AiChatbox`.
        *   Use `waitFor` again to check that the assistant's echoed message appears in the `AiChatbox`, with the correct content and attribution.
*   [ ] **3.7.3.4: [COMMIT]** Commit changes with message "feat(UI): Integrate and test dummy echo provider in chat interface w/ integration tests"



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

---

### Future Work / Backlog:

*   **Advanced AI Model Features**: Explore and integrate features like function calling, image generation, etc., based on provider capabilities.
*   **UI/UX Refinements**:
    *   Loading indicators for individual messages during streaming.
    *   Enhanced error handling and display for API errors during chat.
    *   Theming consistency review across all AI components.
    *   Implement Pagination for `ChatHistoryList` when dealing with a large number of chat items (e.g., >25-50 items), fetching only metadata per page.

Multi-user chat
*   [ ] Let users select chat messages and send them to an AI for a response
*   [ ] Include prompt choice 
*   [ ] For personal multi-user chats and org multi-user chats

Prompt Creation
*   [ ] Admin prompt creation for all users 
*   [ ] Function for users to create new private prompts 
*   [ ] Function for org admins to create new org prompts 

AI Selection
*   [ ] Let org admins filter list of providers by their own selections
*   [ ] Org members can only create chats with AIs admins allow 
