

## Proposed Refactoring: Consolidate localStorage Usage in authStore (Deferred)

**Context (April 2025):** During work on stabilizing `authStore` tests, it was noted that while Zustand's `persist` middleware (using `localStorage` via `createJSONStorage`) is the standard pattern for persisting session state (`authStore.session`), two related pieces of state are handled differently:
    *   `pendingAction`: Stored directly in `localStorage` via `localStorage.setItem('pendingAction', ...)` when an action needs to be replayed after login (e.g., anonymous chat attempt).
    *   `loadChatIdOnRedirect`: Stored directly in `localStorage` via `localStorage.setItem('loadChatIdOnRedirect', ...)` by `_checkAndReplayPendingAction` to tell the `/chat` page which specific chat to load after a successful replay and redirect.

This direct usage of `localStorage` breaks the established pattern of using `persist` for managing potentially sensitive or session-related state that needs to survive page loads/redirects.

**Proposed Solution:**
Refactor `authStore` to manage `pendingAction` and `loadChatIdOnRedirect` within its own state, persisted via the existing `persist` middleware configuration.

**High-Level Steps:**
1.  **Modify `AuthStore` State:** Add `pendingAction: PendingAction | null` and `loadChatIdOnRedirect: string | null` properties to the store's state interface and initial state.
2.  **Update `persist` Configuration:** Modify the `partialize` function within the `persist` middleware options to include `pendingAction` and `loadChatIdOnRedirect` alongside `session`.
3.  **Add Actions:** Create new actions like `setPendingAction(action)` and `clearLoadChatIdOnRedirect()` to manage these state properties.
4.  **Refactor `_checkAndReplayPendingAction`:** Modify this function to read `pendingAction` from `get()` and write `loadChatIdOnRedirect` using `set()` or the new action, instead of direct `localStorage` calls.
5.  **Refactor Consumers:**
    *   Update code that currently sets `pendingAction` in `localStorage` (e.g., in `aiStore` error handling) to call `useAuthStore.getState().setPendingAction(...)`.
    *   Update the `/chat` page component (`apps/web/src/pages/aichat.tsx`) to read `loadChatIdOnRedirect` from the `useAuthStore` hook and clear it using the new `clearLoadChatIdOnRedirect` action, instead of direct `localStorage` calls.
6.  **Update Tests:** Adjust `authStore` unit tests to assert against store state changes instead of `localStorage` mocks for these items.

**Rationale:**
*   **Consistency:** Aligns all persisted auth-related state management under the standard `persist` pattern.
*   **Centralization:** Consolidates logic related to this temporary state within the `authStore`.
*   **Maintainability & Testability:** Simplifies reasoning about state persistence and makes testing easier by focusing on Zustand state manipulation rather than direct `localStorage` mocking for these specific keys.

**Risks:**
1.  **Modifying Fragile Logic:** The primary risk involves changing the `_checkAndReplayPendingAction` and related `initialize` logic, which are known to be complex, have had recent issues, and may have testing gaps (as noted in `TESTING_PLAN.md`). Introducing changes here, even for pattern improvement, could inadvertently break the replay flow.
2.  **Implementation Errors:** Standard risk of introducing bugs during the refactoring of state access and action calls.
3.  **Hydration Interaction:** While integrating these into the existing `persist` config seems compatible with the current `skipHydration`/`rehydrate` pattern, any mistake could affect how state is restored on load.

**Decision (May 2024): DEFERRED**
*   While architecturally desirable, this refactoring should **not** be performed immediately.
*   **Prerequisite:** The core `authStore` functions (`initialize`, `_checkAndReplayPendingAction`) must first be fully stabilized, their logic confirmed correct, and robust unit tests implemented to cover all known edge cases and replay scenarios.
*   **Future Action:** Once the core auth logic is stable and well-tested, revisit this refactoring as a cleanup task to improve pattern consistency.
