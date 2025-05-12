# STEP-0.2.2: Component Architecture Plan & Type Definitions

## Core Data Flow: Switching Chat Context to "Organization"

1.  **UI (`AiChatPage.tsx` / `ChatContextSwitcher.tsx`):**
    *   User interacts with the `ChatContextSwitcher` component.
    *   Component reads `currentOrganizationId` from `useOrganizationStore`.
    *   Component triggers `switchChatContext('organization', currentOrganizationId)` action in `useAiStore`.

2.  **Store (`aiStore.ts` - `switchChatContext` action):**
    *   Updates internal state: `chatContext = 'organization'`, `contextOrganizationId = currentOrganizationId`.
    *   Triggers a call to `loadChatHistory()` to refresh the history list for the new context.

3.  **Store (`aiStore.ts` - `loadChatHistory` action):**
    *   Reads internal state to determine current `chatContext` and `contextOrganizationId`.
    *   If context is 'organization', calls `api.ai().getChatHistory({ organizationId: contextOrganizationId })`.

4.  **API Client (`apiApiClient.ts` - `getChatHistory` method):**
    *   Receives optional `organizationId`.
    *   Calls the corresponding backend function (e.g., `/chat-history`), passing `organizationId` (e.g., as query param).

5.  **Backend (`chat-history/index.ts`):**
    *   Receives request, potentially with `organizationId`.
    *   Queries `chats` table using `user_id` (from auth) and `organizationId` (if provided).
    *   RLS policy ensures user is a member of the organization if `organizationId` is present.
    *   Returns filtered list of chats.

6.  **Store (`aiStore.ts`):**
    *   Callback/Promise resolves with the fetched history list.
    *   Updates `chatHistoryList` state.

7.  **UI (`ChatHistoryList.tsx`):**
    *   Re-renders automatically due to the change in `chatHistoryList` state.

*(Similar flows apply to `loadChatDetails` and `sendMessage` actions, ensuring they are context-aware and pass `organizationId` when necessary.)*

## New Types / Interface Modifications

*   **`packages/store/src/aiStore.ts` (`AiState` interface):**
    *   Add: `chatContext: 'personal' | 'organization';`
    *   Add: `contextOrganizationId: string | null;`
*   **`packages/api/src/clients/aiApiClient.ts` (Method Signatures / Parameter Types):**
    *   `getChatHistory(params?: { organizationId?: string }): Promise<ApiResponse<ChatHistoryItem[]>>`
    *   `getChatDetails(params: { chatId: string; organizationId?: string }): Promise<ApiResponse<ChatMessage[]>>`
    *   `sendChatMessage(params: { message: string; providerId: string; promptId: string; chatId?: string; organizationId?: string }): Promise<ApiResponse<...>>`
*   **`packages/types/src/ai.types.ts` (Exported Parameter Types):**
    *   Update or create exported types used by `aiApiClient.ts` methods (e.g., `GetChatHistoryParams`, `GetChatDetailsParams`, `SendChatMessageParams`) to include the optional `organizationId?: string;` field. 