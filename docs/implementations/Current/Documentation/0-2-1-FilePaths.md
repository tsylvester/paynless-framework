# STEP-0.2.1: Planned File Paths for Modification/Creation

Based on the review of the existing folder structure and the requirements for Organization Chat Context, the following files are initially planned for modification or creation:

**Backend / API (`supabase/functions/`, `packages/api`, `packages/types`):**

*   **Modify:** `supabase/functions/chat/index.ts`: Update POST endpoint for `organization_id`, apply RLS.
*   **Modify:** `supabase/functions/chat-history/index.ts`: Update GET endpoint to filter by context/`organizationId`.
*   **Modify:** `supabase/functions/chat-details/index.ts`: Update GET endpoint RLS check for context/`organizationId`.
*   **Modify:** `packages/api/src/clients/aiApiClient.ts`: Update methods (`sendChatMessage`, `getChatHistory`, `getChatDetails`) signatures/calls.
*   **Modify:** `packages/types/src/ai.types.ts`: Update relevant request/response types if needed.

**State Management (`packages/store`):**

*   **Modify:** `packages/store/src/aiStore.ts`: Add context state/actions, update existing actions.
*   **Modify:** `packages/store/src/organizationStore.ts`: Likely read-only interaction (getting `currentOrganizationId`).

**Frontend UI (`apps/web/src`):**

*   **New/Modify:** `apps/web/src/components/ai/ChatContextSwitcher.tsx` (or similar): New component for context switching.
*   **Modify:** `apps/web/src/pages/AiChat.tsx`: Integrate switcher, call store actions.
*   **Modify:** `apps/web/src/components/ai/ChatHistoryList.tsx`: Minor UI tweaks possible, core logic relies on updated store state.

*(Note: This list focuses on the initial Organization Context feature. Other features like admin toggles, rewind, token display will involve further changes.)* 