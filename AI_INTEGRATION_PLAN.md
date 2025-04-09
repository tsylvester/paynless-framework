# Refined AI Chat Integration Implementation Plan

**(Phases 1 (Database) and 2 (Backend/Edge Functions) remain largely the same as previously outlined, focusing on schema, RLS, and API endpoints. The core changes are in the interactions between the Store and Frontend.)**

**Phase 1: Database Schema**

1.  **[✅] Define Tables:**
    *   [✅] `ai_providers`: Stores information about supported AI models/providers.
        *   [✅] `id` (uuid, PK)
        *   [✅] `name` (text, NOT NULL, e.g., "OpenAI GPT-4o", "Claude 3 Sonnet")
        *   [✅] `api_identifier` (text, NOT NULL, UNIQUE, e.g., "openai-gpt-4o", "anthropic-claude-3-sonnet" - used internally)
        *   [✅] `description` (text, nullable)
        *   [✅] `is_active` (boolean, NOT NULL, default `true`) - For enabling/disabling providers in the UI.
        *   [✅] `config` (jsonb, nullable) - Store non-sensitive config like endpoint URLs if they differ, potential default parameters *excluding API keys*.
        *   [✅] `created_at`, `updated_at` (timestamptz)
    *   [✅] `system_prompts`: Stores reusable system prompts.
        *   [✅] `id` (uuid, PK)
        *   [✅] `name` (text, NOT NULL, e.g., "Helpful Assistant", "Code Generator")
        *   [✅] `prompt_text` (text, NOT NULL)
        *   [✅] `is_active` (boolean, NOT NULL, default `true`)
        *   [✅] `created_at`, `updated_at` (timestamptz)
    *   [✅] `chats`: Represents a single conversation thread.
        *   [✅] `id` (uuid, PK, default `gen_random_uuid()`)
        *   [✅] `user_id` (uuid, nullable, FK references `auth.users(id) ON DELETE SET NULL`) - Nullable for anonymous chats.
        *   [✅] `title` (text, nullable) - Potentially auto-generated from the first message.
        *   [✅] `created_at`, `updated_at` (timestamptz)
    *   [✅] `chat_messages`: Stores individual messages within a chat.
        *   [✅] `id` (uuid, PK, default `gen_random_uuid()`)
        *   [✅] `chat_id` (uuid, NOT NULL, FK references `chats(id) ON DELETE CASCADE`)
        *   [✅] `user_id` (uuid, nullable, FK references `auth.users(id) ON DELETE SET NULL`) - Tracks who sent which message if needed, though `role` might suffice.
        *   [✅] `role` (text, NOT NULL) - 'user', 'assistant', 'system'.
        *   [✅] `content` (text, NOT NULL)
        *   [✅] `ai_provider_id` (uuid, nullable, FK references `ai_providers(id)`) - Log which provider generated the response.
        *   [✅] `system_prompt_id` (uuid, nullable, FK references `system_prompts(id)`) - Log which prompt was used for the context.
        *   [✅] `token_usage` (jsonb, nullable) - Store request/response tokens if provided by the API.
        *   [✅] `created_at` (timestamptz)
2.  **[✅] Migrations:** Create Supabase migration files (`supabase/migrations/`) for these new tables.
3.  **[✅] RLS Policies:** Implement Row Level Security policies to ensure:
    *   [✅] Users can only access their own `chats` and `chat_messages`.
    *   [✅] Anonymous users cannot access saved chats/messages (new chats might be handled differently).
    *   [✅] `ai_providers` and `system_prompts` are readable by authenticated users (or all users if needed for selectors), but sensitive fields (if any were added mistakenly) are protected.
4.  **[ ] (TDD):** Write tests for RLS policies if possible within your testing framework. *(RLS Testing Pending)*

**Phase 2: Backend (Supabase Edge Functions)**

1.  **[✅] New Environment Variables:** Add necessary API keys (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) securely to Supabase environment variables (Vault or Project Settings > Functions). **CRITICAL: Never store API keys directly in the `ai_providers` table.** *(Assumed complete, managed externally)*
2.  **[✅] `ai-providers` Function:** *(Implementation exists)*
    *   [✅] Purpose: Fetch active AI providers for UI selectors.
    *   [✅] Method: GET
    *   [✅] Logic: Query `ai_providers` where `is_active` is true. Select only non-sensitive fields (`id`, `name`, `description`).
    *   [✅] Auth: Requires user JWT (or allow public access if needed for logged-out users).
    *   [ ] **(TDD):** Unit test handler logic (mock Supabase client). *(Testing Pending)*
3.  **[✅] `system-prompts` Function:** *(Implementation exists)*
    *   [✅] Purpose: Fetch active system prompts for UI selectors.
    *   [✅] Method: GET
    *   [✅] Logic: Query `system_prompts` where `is_active` is true.
    *   [✅] Auth: Requires user JWT (or allow public access).
    *   [ ] **(TDD):** Unit test handler logic. *(Testing Pending)*
4.  **[✅] `chat` Function (Core Interaction):** *(Implementation exists)*
    *   [✅] Purpose: Handle sending messages to AI, saving history.
    *   [✅] Method: POST
    *   [✅] Request Body: `{ message: string, providerId: uuid, promptId: uuid, chatId?: uuid }`
    *   [✅] Logic:
        *   [✅] Check auth: Validate JWT or handle anonymous user (check usage count from client/storage). *Security concern: Anonymous limit needs careful thought - see \"Missing Pieces\".*
        *   [✅] Validate input (`providerId`, `promptId`, message content).
        *   [✅] If `chatId` provided, fetch previous messages for that `chatId` (respecting RLS).
        *   [✅] Fetch `system_prompt_text` for `promptId`.
        *   [✅] Fetch `api_identifier` for `providerId`. **Do NOT fetch API keys here.**
        *   [✅] **Securely** retrieve the correct API key from environment variables based on the `providerId` / `api_identifier`.
        *   [✅] Construct the request payload (messages array including system prompt, user message, and previous history) for the specific AI provider API (using a helper/factory based on `api_identifier`).
        *   [✅] Call the external AI API (e.g., OpenAI SDK/fetch). Handle errors.
        *   [✅] Process the AI response.
        *   [✅] Save user message and assistant response to `chat_messages` table, associating with the `chatId` (create a new `chats` entry if `chatId` was null/new conversation). Include `ai_provider_id`, `system_prompt_id`.
        *   [✅] Return the assistant's response message (and potentially the `chatId` if new).
    *   [✅] Auth: Requires JWT or specific logic for anonymous limited access.
    *   [ ] **(TDD):** Unit test handler logic extensively (mock Supabase client, mock external AI API calls, test history reconstruction, test saving logic, test auth/anonymous checks). *(Testing Pending)*
5.  **[✅] `chat-history` Function:** *(Implementation exists)*
    *   [✅] Purpose: Fetch list of chats for the logged-in user.
    *   [✅] Method: GET
    *   [✅] Logic: Query `chats` table where `user_id` matches the authenticated user ID. Order by `updated_at` DESC. Select relevant fields (`id`, `title`, `updated_at`).
    *   [✅] Auth: Requires user JWT.
    *   [ ] **(TDD):** Unit test handler logic. *(Testing Pending)*
6.  **[✅] `chat-details` Function:** *(Implementation exists)*
    *   [✅] Purpose: Fetch all messages for a specific chat owned by the user.
    *   [✅] Method: GET (e.g., `/chat-details/:chatId`)
    *   [✅] Logic: Query `chat_messages` where `chat_id` matches the path parameter and the `chat` is owned by the authenticated user (use JOIN or check `chats` table RLS). Order by `created_at` ASC.
    *   [✅] Auth: Requires user JWT.
    *   [ ] **(TDD):** Unit test handler logic. *(Testing Pending)*

**Phase 3: Shared Packages (`@paynless/*`)**

1.  **`@paynless/types`:**
    *   [✅] Define new TypeScript interfaces/types for: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, `ChatApiRequest`, `ChatApiResponse`, etc.
    *   [✅] (TDD): Type definitions don't typically have runtime tests, but ensure they are accurate and used consistently.
2.  **`@paynless/api-client`:**
    *   [✅] Create `src/ai.api.ts`.
    *   [✅] Implement `AiApiClient` class with methods:
        *   [✅] `getAiProviders(): Promise<ApiResponse<AiProvider[]>>`
        *   [✅] `getSystemPrompts(): Promise<ApiResponse<SystemPrompt[]>>`
        *   [✅] `sendChatMessage(data: ChatApiRequest): Promise<ApiResponse<ChatMessage>>`
        *   [✅] `getChatHistory(): Promise<ApiResponse<Chat[]>>`
        *   [✅] `getChatMessages(chatId: string): Promise<ApiResponse<ChatMessage[]>>`
    *   [✅] Use the base `apiClient` for making requests to the Edge Functions defined in Phase 2. Handle auth tokens.
    *   [✅] (TDD): Unit test API client methods (mock base `api` calls).
3.  **`@paynless/store`:**
    *   **`aiStore.ts`:**
        *   [✅] **State:** `availableProviders`, `availablePrompts`, `currentChatMessages`, `currentChatId`, `isLoadingAiResponse`, `chatHistoryList`, `aiError`, `anonymousMessageCount` (potentially, if managing count centrally).
        *   [✅] **Actions (Adhering to Pattern):**
            *   [✅] `loadAiConfig()`: Sets loading, calls API client, updates `availableProviders`/`availablePrompts` on success, sets error state on failure, clears loading.
            *   [✅] `sendMessage(data: { message: string, providerId: string, promptId: string, chatId?: string, isAnonymous: boolean })`:
                *   [✅] Checks internal `anonymousMessageCount` if `isAnonymous` is true. If limit reached, **throws a specific custom error** (e.g., `AnonymousLimitReachedError`) or returns a specific status code/object. **Does not handle redirect/stashing.**
                *   [✅] If limit not reached (or not anonymous): Sets `isLoadingAiResponse = true`, clears `aiError`.
                *   [✅] Calls `apiClient.sendChatMessage`.
                *   [✅] *On Success:* Updates `currentChatMessages` with user message & AI response, updates `currentChatId` if new, increments `anonymousMessageCount` if applicable, clears loading.
                *   [✅] *On Failure (API error):* Sets `aiError` with the error details, clears loading.
            *   [✅] `loadChatHistory()`: Sets loading, calls API client, updates `chatHistoryList` on success, sets error state on failure, clears loading.
            *   [✅] `loadChatDetails(chatId: string)`: Sets loading, calls API client, updates `currentChatMessages`/`currentChatId` on success, sets error state on failure, clears loading.
            *   [✅] `startNewChat()`: Clears `currentChatMessages`, `currentChatId`. Resets `anonymousMessageCount` if managed here.
            *   [✅] `incrementAnonymousCount()` / `resetAnonymousCount()`: Helper actions if count managed centrally in store.
        *   [✅] **(TDD):** Unit test store actions (mock API client methods, test state updates for loading/error/data, test anonymous limit check/error throwing).
    *   **`authStore.ts`:**
        *   [ ] **Modify `register` Action:** *After* successful API call and state update for user/session, *before* determining navigation:
            *   [ ] Check `sessionStorage.getItem('pendingChatMessage')`.
            *   [ ] Return an object indicating registration success *and* the appropriate redirect target (e.g., `{ success: true, redirectTo: hasStashedMessage ? '/' : '/dashboard' }`). The component will handle the actual navigation.
        *   [ ] **(TDD):** Update unit tests for `register` action to cover the new return value/logic.

**Phase 4: Frontend (`apps/web`)**

1.  **New Components (`apps/web/src/components/ai/`):**
    *   `AiChatbox.tsx`, `ModelSelector.tsx`, `PromptSelector.tsx`: (As before) These components primarily **read state** from `aiStore` (`currentChatMessages`, `isLoadingAiResponse`, `aiError`, `availableProviders`, `availablePrompts`) and **dispatch actions** or pass data up to the parent page/component initiating the send. They **do not** manage their own loading/error states related to store actions.
    *   **(TDD):** Unit test components for rendering based on props/store state, dispatching actions on interaction (using mocks).
2.  **Page Modifications:**
    *   **`HomePage.tsx` (or a dedicated Chat Container Component):**
        *   Manages the selected `providerId` and `promptId` (local state).
        *   Manages the anonymous message count (local state, initialized from/synced with `sessionStorage` for persistence within session).
        *   **Send Message Handler:**
            *   Calls `aiStore.sendMessage(...)`, passing necessary data including `isAnonymous: true` and potentially the current count.
            *   Uses `try...catch` around the `sendMessage` call.
            *   **`catch (error)` block:**
                *   If `error instanceof AnonymousLimitReachedError`:
                    *   Stash message details (`content`, `providerId`, `promptId`) in `sessionStorage.setItem('pendingChatMessage', JSON.stringify(...))`.
                    *   Display modal/alert: "Limit reached. Sign up to continue?"
                    *   On confirmation, navigate to `/register`.
                *   Else (other errors): The `aiStore` will have set the `aiError` state, which the component subscribes to for displaying generic error feedback.
            *   **No `try...catch` needed for success/loading:** Component subscribes to `isLoadingAiResponse` from `aiStore` to show spinners/disable input.
        *   **`useEffect` for Stashed Message:**
            *   Runs on mount/auth state change.
            *   Checks if user is authenticated (`useAuthStore`).
            *   Checks `sessionStorage.getItem('pendingChatMessage')`.
            *   If authenticated and message exists:
                *   Parse stashed data.
                *   `sessionStorage.removeItem('pendingChatMessage')`.
                *   Dispatch `aiStore.sendMessage(...)` with the stashed data and `isAnonymous: false`.
    *   `DashboardPage.tsx`: Integrates chat components. Send handler calls `sendMessage` with `isAnonymous: false`. No limit logic needed.
    *   `RegisterPage.tsx` (or component calling `authStore.register`):
        *   Calls `authStore.register(...)`.
        *   Handles the promise resolution.
        *   Reads the `redirectTo` property from the successful result object returned by the action.
        *   Uses `navigate(result.redirectTo)` to perform the navigation.
3.  **New Pages & Routing:**
    *   (As before: `ChatHistoryPage.tsx`, `ChatDetailsPage.tsx`, add routes `/chat-history`, `/chat/:chatId`). These pages follow the pattern: dispatch loading actions (`loadChatHistory`, `loadChatDetails`) in `useEffect`, subscribe to store state for rendering.
4.  **(TDD):** Write component/integration tests focusing on: anonymous limit interception and stashing, post-registration message sending, reading loading/error states from store, navigating based on `register` action result.

**Missing Pieces / Needs Consideration (Recap)**

1.  **API Key Security:** Server-side only.
2.  **Rate Limiting & Cost Control:** Crucial for backend functions.
3.  **Anonymous User Limit Robustness:** Acknowledge client-side limitations unless server-side tracking is added.
4.  **Error Handling & UX (Streaming):** Consider streaming for better UX later; handle API errors gracefully now.
5.  **Scalability:** Database indexing.
6.  **Extensibility in `chat` Function:** Clean provider mapping.
7.  **Input Validation/Sanitization:** Backend checks.
8.  **Chat Titles:** Generation logic.
9.  **Concurrency:** Frontend state updates.
