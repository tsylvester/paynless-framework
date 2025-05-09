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
