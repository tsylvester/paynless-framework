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


### Backend Modifications for Dummy Provider Support [✅]

To enable and support a "Dummy Echo v1" provider (identified by the `provider` string 'dummy' in the database), the following backend Supabase Edge Functions were modified. This setup allows the dummy provider to be listed and its chat requests to be handled by echoing the user's input, ensuring all messages and chat sessions are properly persisted.

- **[✅] Modify `/functions/v1/ai-providers/index.ts` (AI Provider Listing):**
  - **[✅] Objective**: Ensure the "Dummy Echo v1" provider is listed and available to the frontend without requiring an actual API key.
  - **[✅] Implementation**:
    - The function queries the `ai_providers` table for entries where `is_active = true` and `is_enabled = true`.
    - The logic that filters providers based on API key environment variables was updated.
    - **[✅] Exemption for 'dummy'**: If a provider record has its `provider` column (fetched from the database) set to `'dummy'` (case-insensitive), it bypasses the API key check and is included in the list of available providers returned to the frontend.
  - **[✅] Database Requirement**: The "Dummy Echo v1" entry in the `ai_providers` table must have:
      - `provider` column value set to `dummy`.
      - `is_active` set to `true`.
      - `is_enabled` set to `true`.

- **[✅] Modify `/functions/v1/chat/index.ts` (Chat Message Endpoint):**
  - **[✅] Identify Dummy Provider**: When a chat request is received, the function fetches the `provider` string associated with the `requestProviderId` from the `ai_providers` table.
  - **[✅] Conditional Dummy Logic**: If the fetched `providerString` is `'dummy'`:
    - The function enters a dedicated block to handle the dummy provider, bypassing the standard AI adapter flow.
    - **[✅] Handle New Dummy Chat**:
        - **[✅] Create Chat Entity:** If no `chatId` is provided, a new chat record is created in the `chats` table (associating `user_id`, `organization_id`, `system_prompt_id`, and generating a title). This ensures the chat has a real, persistent ID.
    - **[✅] Handle Existing/New Dummy Chat (Continuation):**
        - **[✅] Store User Message:** The incoming user message is persisted to the `chat_messages` table, linked to the (new or existing) real `chatId` and the dummy `requestProviderId`.
        - **[✅] Generate Dummy Assistant Message:** An assistant message is constructed (e.g., content like "Echo from Dummy: [user's message content]"), using the dummy `requestProviderId`.
        - **[✅] Store Dummy Assistant Message:** This dummy assistant message is persisted to `chat_messages` with mocked token usage.
        - **[✅] Update Chat Timestamp:** The `updated_at` field of the parent `chats` record is updated.
        - **[✅] Return Assistant Message:** The persisted dummy assistant's message (as a `ChatMessageRow`) is returned in the API response.
  - **[✅] Standard Provider Handling**: If `providerString` is not `'dummy'`, the function proceeds with the existing logic to fetch an AI adapter (via `getAiProviderAdapter`) and call the actual AI model through `adapter.sendMessage()`.
  - **[✅] Consistent Response Structure**: The API response structure for a dummy message is identical to that of a real AI-generated message (i.e., a valid `ChatMessageRow` object).

- **[✅] Modify `/functions/_shared/ai_service/factory.ts` (AI Service Adapter Factory):**
  - **[✅] Objective**: Make the central AI adapter factory aware of the "dummy" provider type.
  - **[✅] Implementation**:
    - In the `getAiProviderAdapter(provider: string)` function, a new `case 'dummy':` was added to the `switch` statement. This case returns a predefined `dummyAdapter`.
    - **[✅] `dummyAdapter` Definition**:
        - An object `dummyAdapter` implementing the `AiProviderAdapter` interface was defined.
        - `sendMessage()`: Implements logic to construct an echo response payload (`AdapterResponsePayload`) based on the user's input.
        - `listModels()`: Returns a mock array with a "Dummy Echo v1" model definition, conforming to `ProviderModelInfo[]`.
  - **[✅] Note on Usage**: While `chat/index.ts` currently handles the "dummy" provider via its specific `if (providerString === 'dummy')` block *before* attempting to get and use an adapter, having the `dummyAdapter` in the factory ensures that if other system parts call `getAiProviderAdapter('dummy')`, they receive a functional (albeit mock) adapter. This also makes the system more robust for potential future changes where the main chat function might delegate to this adapter.

- **[✅] Verify other relevant endpoints (e.g., `/functions/v1/chat-details`, `/functions/v1/chat-history`):**
  - **[✅] No Special Dummy Handling Needed**: These endpoints do not require specific modifications for the dummy provider. Since all chats, including those involving the dummy provider, use real, persisted chat IDs and messages in the database, these endpoints will naturally return their details and include them in history listings just like any other chat.

#### STEP-3.1.2.A: Refactor Chat Context State Management to `aiStore` [STORE] [UI] [TEST-UNIT] [COMMIT] [✅]
*   **Goal:** Centralize the management of the selected context for new chats within the `aiStore` to simplify `AiChat.tsx` and make `ChatContextSelector.tsx` more self-contained. Provider and prompt selection will rely on user input.
*   **Status:** [✅] **Implemented.** The core logic for managing new chat context is centralized in `aiStore`. UI components (`ChatContextSelector.tsx`, `AiChat.tsx`) have been updated. Default provider/prompt selection is handled by user interaction, not automatically by the store.
*   **Sub-steps:**
    *   **1. [STORE] Enhance `aiStore` for Centralized Context Management:**
        *   [✅] In `packages/store/src/aiStore.ts`:
            *   [✅] Added new state: `newChatContext: string | null` (actual name used).
                *   [✅] Initialized to `null`. `AiChat.tsx` handles deriving initial selector value from `globalCurrentOrgId`.
            *   [✅] Added new action: `setNewChatContext: (contextId: string | null) => void`.
                *   [✅] This action updates `state.newChatContext`.
            *   [✅] Modified the existing `startNewChat(organizationId?: string | null)` action:
                *   [✅] This action is called with `organizationId` (derived from `newChatContext` in the store, typically set via `ChatContextSelector` or passed directly).
                *   [✅] It correctly resets `currentChatId` to `null` and sets `newChatContext` based on the `organizationId` argument.
                *   [ ] Provider and prompt selection logic is handled by user input and managed in `AiChat.tsx` after `startNewChat` or `loadChatDetails` is called.
        *   **[TEST-UNIT]** Update `packages/store/src/tests/aiStore.*.test.ts`:
            *   [✅] Unit tests for `setNewChatContext` are in `aiStore.context.test.ts`.
            *   [✅] Unit tests for `startNewChat` in `aiStore.startNewChat.test.ts` verify it correctly uses the provided `organizationId` to set `newChatContext` and reset `currentChatId`.
            *   [✅] Tests in `aiStore.context.test.ts` verify the correct initialization of `newChatContext` to `null`.
    *   **2. [UI] Refactor `ChatContextSelector.tsx`:**
        *   [✅] Removed `currentContextId` and `onContextChange` from `ChatContextSelectorProps`.
        *   [✅] Uses `useAiStore` to get `newChatContext` (via `selectNewChatContext` selector) and call `setNewChatContext`.
        *   [✅] `handleValueChange` in `ChatContextSelector` calls `setNewChatContext` to update the store.
        *   [✅] The component displays the selected context based on `newChatContext` from the store.
        *   **[TEST-UNIT]** Update `apps/web/src/components/ai/ChatContextSelector.test.tsx`:
            *   [✅] Tests mock `useAiStore` correctly, providing the new state and action.
            *   [✅] Verified that `setNewChatContext` is called when a context is selected.
            *   [✅] Verified the component renders correctly based on the mocked `newChatContext` value.
            *   [✅] Removed tests related to the old `onContextChange` prop.
    *   **3. [UI] Refactor `AiChat.tsx`:**
        *   [✅] The local `nextChatOrgContext` state in `AiChat.tsx` is used to manage the `ChatContextSelector`'s displayed value and serves as the input to the store's `startNewChat` action (which then updates the store's `newChatContext`).
        *   [✅] `handleContextSelection` function was effectively removed/replaced by direct store updates from `ChatContextSelector`.
        *   [✅] Updated the `ChatContextSelector` invocation (props removed).
        *   [✅] Modified `handleNewChat` (the "New Chat" button's click handler):
            *   [✅] It calls `startNewChat` with the context derived from its local state (`nextChatOrgContext`).
            *   [✅] Provider/prompt selection logic based on user input is handled in `AiChat.tsx`'s `handleProviderChange` and `handlePromptChange`, and these selections are reset/updated in `handleNewChat` and `handleLoadChat` as appropriate, but not automatically defaulted by the store.
            *   [✅] Analytics tracking for "Chat: Clicked New Chat" uses the correct context.
        *   [✅] Updated `activeContextIdForHistory` to derive its value from the store's `newChatContext` (via selector) with fallback to `globalCurrentOrgId`.
        *   [✅] The `key` prop for the `AiChatbox` component includes relevant IDs to ensure re-renders.
        *   [✅] Linter errors (e.g., `Property 'contextfornewchat'`) resolved as `newChatContext` is the implemented name.
        *   **[TEST-UNIT]** Update `apps/web/src/pages/AiChat.test.tsx`:
            *   [✅] Mocks `useAiStore` to include `newChatContext` and the modified `startNewChat` action.
            *   [✅] Updated tests for the "New Chat" button to verify it reads context correctly and calls `startNewChat`.
            *   [✅] Provider/prompt selection tests reflect that `AiChat.tsx` handles these based on user interaction and available items.
            *   [✅] Removed tests related to old local state and handlers not relevant to the new store-driven approach for context.
    *   **4. [COMMIT]** [✅] Commit the changes with a message like: "refactor(ChatContext): Centralize new chat context in aiStore, rely on user for provider/prompt selection".

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

#### STEP-3.2.2: Create `ChatItem` Component with Context-Specific Actions [TEST-UNIT] [COMMIT] [✅]
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

### STEP-3.6.3: Implement User Profile Privacy and User Name Display in Chat Messages [DB] [RLS] [BE] [API] [STORE] [UI] [TEST-UNIT] [COMMIT] [🚧]
*   **Goal:** Implement user-configurable profile privacy settings using a flexible text-based field. Ensure that for messages, the sender's display name is shown *if privacy settings and organization membership permit*, otherwise fallback gracefully.
*   **Sub-steps:**
    *   **1. [DB] [RLS] Add `profile_privacy_setting` to `user_profiles` and Update RLS:**
        *   `[✅]` **Migration:**
            *   `[✅]` Add `profile_privacy_setting TEXT NOT NULL DEFAULT 'private'` column to the `public.user_profiles` table.
            *   `[✅]` Consider adding a `CHECK` constraint to `profile_privacy_setting` to allow only predefined values (e.g., `'private'`, `'public'`, initially).
        *   `[✅]` **Type Updates:**
            *   `[✅]` Update `supabase/functions/types_db.ts` to reflect the new column.
            *   `[✅]` Ensure `UserProfile` type in `packages/types/src/auth.types.ts` (and any other relevant type definitions like in `ai.types.ts` if they carry the full profile) includes `profile_privacy_setting: string;` (or a more specific string literal union type like `'public' | 'private'`).
            *   `[✅]` `chatParticipantsProfiles: { [userId: string]: UserProfile }` already exists in `AiState` (`packages/types/src/ai.types.ts`).
            *   `[✅]` `initialAiStateValues` initializes `chatParticipantsProfiles: {}`.
        *   `[✅]` **RLS Policies for `user_profiles` Table:**
            *   `[✅]` Drop the existing permissive read policy (`POLICY "Allow authenticated read access" ON public.user_profiles FOR SELECT USING (true)`).
            *   `[✅]` Create a new RLS policy for `SELECT` operations:
                *   Allow a user (`auth.uid()`) to read a `user_profiles` row IF:
                    *   `profile.profile_privacy_setting = 'public'`
                    *   OR the requesting user (`auth.uid()`) and the `profile.id` (target user) are members of at least one common organization. (This will likely require a SQL subquery or helper function to check shared organization membership).
            *   `[✅]` Ensure an RLS policy for `UPDATE` operations allows an authenticated user to update *only their own* `user_profiles` row, and specifically the `profile_privacy_setting` column (among other editable fields like `first_name`, `last_name`, `chat_context`).
        *   `[🚧]` **New User Default:** Verify that new user creation correctly results in `profile_privacy_setting` being `'private'` due to the database column default.
        *   `[ ]` **[TEST-UNIT]** Write/Update tests for RLS policies. This might involve backend tests that assert behavior based on different user contexts or using specialized RLS testing tools if available.

    *   **2. [STORE] [UI] Create `ProfilePrivacySettingsCard.tsx` and Update `authStore`:**
        *   `[🚧]` **Component (`apps/web/src/components/profile/ProfilePrivacySettingsCard.tsx`):** (Implementation in progress, UI built, tests pending)
            *   `[✅]` Create a new self-contained card component to be placed on a user's own profile settings page.
            *   `[✅]` It should display a user-friendly way to change `profile_privacy_setting` (using a Select dropdown with options like "Public Profile" / "Private Profile" / "Members Only").
            *   `[✅]` Reads the current `profile_privacy_setting` from `useAuthStore(state => state.profile?.profile_privacy_setting)`.
            *   `[✅]` On change, it calls `useAuthStore.getState().updateProfile({ profile_privacy_setting: newSettingValue })` where `newSettingValue` is e.g., `'public'` or `'private'`.
            *   `[✅]` Manages and displays loading states during the update operation.
            *   `[✅]` Manages and displays error messages if the update fails.
        *   `[✅]` **`authStore` (`packages/store/src/authStore.ts`):**
            *   `[✅]` Ensure the `UserProfile` type used within the store includes `profile_privacy_setting` (implicitly via `types_db.ts` and `auth.types.ts`).
            *   `[✅]` Verify the `updateProfile` action can accept `profile_privacy_setting` in its payload, sends it to the backend API, and updates the local `profile` state upon success (verified, no changes needed to action).
        *   `[✅]` **[TEST-UNIT]** Write unit tests for `ProfilePrivacySettingsCard.tsx` (`apps/web/src/components/profile/ProfilePrivacySettingsCard.unit.test.tsx`):
            *   `[✅]` Test rendering based on different `profile_privacy_setting` values from the mocked store.
            *   `[✅]` Test that `updateProfile` is called with the correct new value on user interaction.
            *   `[✅]` Test loading and error state displays.
            *   `[🚧]` Resolve remaining linter/type issues in test file (likely Vitest env/config related).
        *   `[✅]` **[TEST-UNIT]** Update unit tests for `authStore`'s `updateProfile` action in `packages/store/src/authStore.profile.test.ts` to cover `profile_privacy_setting` updates.

    *   **3. [BE] Verify/Update Profile Fetching Endpoint (`supabase/functions/profile/{userId}/index.ts`):**
        *   `[✅]` **Endpoint Logic:** The core logic of this function (fetching specified fields for a given `userId`) should not need to change. Access control will be handled by the RLS policies defined in Sub-step 1. (Verified, and updated to select the new field as of 2023-05-16).
        *   `[✅]` **[TEST-UNIT]** Update/ensure comprehensive unit tests in `supabase/functions/profile/index.test.ts`:
            *   `[✅]` Test fetching a public profile successfully (Implicitly covered and now checks for `profile_privacy_setting`).
            *   `[✅]` Test fetching a private profile of another user with whom a common organization is shared (should succeed) (Simulated by successful fetch, RLS handles actual restriction).
            *   `[✅]` Test fetching a private profile of another user with no shared organization (should result in a 403 Forbidden or 404 Not Found, depending on RLS/function behavior for unauthorized access) (Covered by 404 test when mock returns no data).
            *   `[✅]` Test fetching a non-existent profile (should result in 404) (Covered).

    *   **4. [API] Verify/Update API Client for Profile Fetching (`packages/api/src/users.api.ts`):**
        *   `[✅]` **Method:** Review the existing `getUserProfile(userId: string)` method (or its equivalent like `api.users().getProfile(userId)`). (Method created as `UserApiClient.getProfile` in new `users.api.ts`).
        *   `[✅]` It should correctly call the `GET /functions/v1/profile/{userId}` endpoint. (Verified by implementation).
        *   `[✅]` Ensure it handles successful responses (returning `UserProfile`) and error responses (e.g., 403, 404 from the Edge Function due to RLS) appropriately, propagating them as `ApiResponse` objects. (Verified by implementation and tests).
        *   `[✅]` **[TEST-UNIT]** Ensure unit tests for this API client method cover:
            *   `[✅]` Successful profile fetch.
            *   `[✅]` Handling of error responses (e.g., 403, 404) from the server.

    *   **5. [STORE] Modify `aiStore` for Privacy-Aware Profile Fetching (`packages/store/src/aiStore.ts`):**
        *   `[✅]` Internal action `_fetchAndStoreUserProfiles(userIds: string[])` exists.
        *   `[✅]` `loadChatDetails` calls `_fetchAndStoreUserProfiles`.
        *   `[✅]` **[REFACTOR]** Modify `_fetchAndStoreUserProfiles`:
            *   `[✅]` It will continue to iterate through `idsToFetch` and call `api.users().getProfile(userId)` (or equivalent) for each ID.
            *   `[✅]` **Crucially, it must gracefully handle API errors for individual profile fetches.** If `api.users().getProfile(userId)` returns an error (e.g., because RLS denied access), the store should log this (e.g., `logger.warn`) and simply *not* add an entry for that `userId` to `state.chatParticipantsProfiles`.
            *   `[✅]` The `state.chatParticipantsProfiles` map should only contain profiles that were successfully fetched (i.e., the current user is permitted to see them).
            *   `[✅]` Remove the `(api as any)` cast if still present and use the correctly typed API client method.
        *   `[✅]` **[TEST-UNIT]** Update unit tests for `_fetchAndStoreUserProfiles`:
            *   `[✅]` Mock `api.users().getProfile()` to simulate successful fetches for some user IDs and error responses (due to privacy) for others within the same batch.
            *   `[✅]` Verify that `state.chatParticipantsProfiles` is updated correctly, only containing the accessible profiles.
            *   `[✅]` Verify appropriate logging for inaccessible profiles.

    *   **6. [UI] Update `ChatMessageBubble.tsx` (and/or `AttributionDisplay.tsx`) for Privacy-Aware Display:**
        *   `[ ]` **Name Resolution Logic (likely in `AttributionDisplay.tsx` or directly in `ChatMessageBubble.tsx`):**
            *   `[✅]` If `message.user_id` matches `useAuthStore.getState().user?.id`, display "(You)" or the current user's own name.
            *   `[✅]` Else, attempt to retrieve the profile from `useAiStore(state => state.chatParticipantsProfiles[message.user_id])`.
            *   `[✅]` **If Profile is Found in Store:** Construct and display the name (e.g., "First Last", "First", fallback to User ID from the fetched profile if names are null).
            *   `[✅]` **If Profile is NOT Found in Store (due to privacy/RLS or other fetch issue):** Display a privacy-respecting fallback. This could be:
                *   A generic "User" label.
                *   The `message.user_id` (UUID) *only if deemed acceptable as a last resort and clearly distinct from a resolved name*. Consider if just "User" or an icon is better.
                *   *Avoid* showing parts of a profile that might have been partially cached or inadvertently exposed.
        *   `[✅]` **[TEST-UNIT]** Update unit tests for `ChatMessageBubble.test.tsx` (and `AttributionDisplay.test.tsx` if it handles the name resolution):
            *   `[✅]` Mock `useAuthStore` for current user ID.
            *   `[✅]` Mock `useAiStore` to provide various `chatParticipantsProfiles` states:
                *   Profile found for `message.user_id`.
                *   Profile *not* found for `message.user_id` (simulating privacy restriction).
                *   Profile found but with missing name fields (to test fallbacks like displaying User ID from profile).
            *   `[✅]` Verify the correct display output for each scenario, especially the privacy-respecting fallback.

    *   **7. [COMMIT] Commit all changes** for this step with a message like "feat(Profile,Chat): Implement profile privacy settings and update user name display logic w/ tests".

---

Bug fixes: 
*   [✅] Org members see each others details in chats
*   [✅] Chat context resets when sending new message to existing chat started by someone else 
*   [✅] Provider resets when context resets instead of taking provider from selector 
*   [✅] Message input gets wiped when changing provider 

**Phase 3 Complete Checkpoint:**
*   [ ] All Phase 3 tests (UI unit and integration tests) passing.
*   [✅] Core UI components (Context Selector, Chat History, Chat Interface, Message Bubbles, Input) are implemented/updated for org context and new features.
*   [✅] Markdown rendering is functional in messages.
*   [✅] Chat rewind UI flow is implemented.
*   [✅] Admin controls (chat deletion, member creation toggle) are implemented in the UI.
*   [✅] UI components correctly interact with the State Management layer (Phase 2).
*   [ ] Code refactored, analytics integrated where specified, and commits made.
*   [ ] Run `npm test` in `apps/web`. Build `apps/web` (`npm run build`). Perform quick smoke test.



