# Abstract Pending Action Replay: Implementation Plan

## Preamble

This document outlines the detailed, step-by-step implementation plan for creating a generic, abstract system for handling "pending actions". This system will allow unauthenticated users to initiate a feature that requires authentication (e.g., sending a chat message, creating a dialectic project), guide them through the login/registration process, and then seamlessly "replay" their original action upon successful authentication.

The implementation will refactor the existing concrete logic for pending chat actions into the new abstract manager, proving its viability before extending it to new features like the Dialectic Engine.

The implementation will strictly follow the Test-Driven Development (TDD) approach (Red -> Green -> Refactor) and adhere to the existing monorepo architecture. The development process will also conform to the principles outlined in `.cursor/rules/ai_agent_development_methodology.md` and `.cursor/rules/cursor_architecture_rules.md`.

**Goal:** To guide an AI development agent (and human developers) through the implementation process, ensuring a robust, scalable, and reusable pattern for handling post-authentication action replays across the entire application.

## Project Success Metrics

*   **Developer Experience:**
    *   Time required to add pending action replay functionality to a new feature is significantly reduced.
    *   Code duplication for pending action logic is eliminated.
*   **System Reliability:**
    *   The refactored AI Chat replay feature passes all existing tests and works flawlessly in production.
    *   The new Dialectic replay feature is implemented successfully and proves reliable.
    *   The abstract manager gracefully handles errors (e.g., invalid stashed data, replay failures).
*   **User Experience:**
    *   Users can successfully initiate actions while logged out and have them complete after logging in without losing their input.
    *   The post-login redirection is logical and leads the user to the feature they were trying to use.

## Legend

*   `[ ]` Unstarted work step. Each work step will be uniquely named for easy reference.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or nested set that has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api`)
*   `[STORE]` State Management (`@paynless/store`)
*   `[UI]` Frontend Component (e.g., in `apps/web`)
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update
*   `[REFACTOR]` Code Refactoring Step
*   `[CONFIG]` Configuration changes
*   `[COMMIT]` Checkpoint for Git Commit

---

## Section 1: Phase 1 - Build the Abstract Pending Action Manager

**Goal:** Create the new, generic, and centralized system for managing pending actions. This phase will not modify any existing feature-specific code but will lay the entire foundation for subsequent refactoring and extension.

---

*   `[✅] 1.1 [TYPES]` Define Generic Pending Action Interface
    *   `[✅] 1.1.1` Create a new file: `packages/types/src/pendingAction.types.ts`.
    *   `[✅] 1.1.2` In the new file, define and export a generic `PendingAction` interface that matches the existing usage in `ai.SendMessage.ts`:
        ```typescript
        export interface PendingAction<T> {
          endpoint: string; // A unique key identifying the target API, e.g., 'chat', 'dialectic'
          method: string;   // The HTTP method, e.g., 'POST'
          body: T;          // The payload for the action
          returnPath?: string; // Optional URL to navigate to after successful replay
        }
        ```
    *   `[✅] 1.1.3` Export the type from `packages/types/src/index.ts`.

*   `[✅] 1.2 [STORE]` Create the Pending Action Manager Module
    *   `[✅] 1.2.1` Create a new file: `packages/utils/src/pendingAction.ts`. This will be a utility module, not a Zustand store.
    *   `[✅] 1.2.2 [CONFIG]` Define a constant for the `localStorage` key to match existing implementation, e.g., `const PENDING_ACTION_STORAGE_KEY = 'pendingActionDetails';`.

*   `[✅] 1.3 [STORE]` Implement Action Stashing Logic
    *   `[✅] 1.3.1 [TEST-UNIT]` Write unit tests in `packages/util/pendingAction.test.ts` for a new `stashPendingAction` function.
        *   Test that it correctly stringifies the `PendingAction` object and saves it to `localStorage` using the defined key.
    *   `[✅] 1.3.2` Implement the `stashPendingAction(action: PendingAction<unknown>): void` function in `pendingAction.ts`. It should stringify and save to `localStorage`. The calling code will handle redirection.

*   `[✅] 1.4 [STORE]` Implement the Replay Action Registry
    *   `[✅] 1.4.1` In `pendingAction.ts`, define the `ReplayFunction` type: `export type ReplayFunction = (body: any) => Promise<any>;`.
    *   `[✅] 1.4.2` Create the registry map: `const actionRegistry = new Map<string, ReplayFunction>();`.
    *   `[✅] 1.4.3` Create an exported registration function: `export function registerReplayAction(endpoint: string, replayFunction: ReplayFunction): void { actionRegistry.set(endpoint, replayFunction); }`.

*   `[✅] 1.5 [STORE]` Implement the Core Replay Logic
    *   `[✅] 1.5.1 [TEST-UNIT]` Write extensive unit tests in `pendingAction.test.ts` for the main `checkAndReplayPendingAction` function.
        *   Test case: No action exists in `localStorage`. The function should exit cleanly.
        *   Test case: Stored data is invalid JSON. It should log an error and clear the `localStorage` item.
        *   Test case: The `endpoint` is not found in the `actionRegistry`. It should log an error and clear the item.
        *   Test case: A valid action is found and its `endpoint` is in the registry. The corresponding replay function should be called with the correct `body`.
        *   Test case: The replay function resolves successfully. `localStorage` should be cleared. If `returnPath` was present, the function should return it for the caller to handle navigation.
        *   Test case: The replay function rejects with an error. It should log the error and clear the `localStorage` item.
    *   `[✅] 1.5.2` Implement the `export async function checkAndReplayPendingAction(): Promise<string | null>` function in `pendingAction.ts`. This function will contain all the logic tested above and return the `returnPath` on success. Use a `try...catch...finally` block to ensure `localStorage` is always cleared after an attempt.

*   `[ ] 1.6 [REFACTOR]` Wire the New Manager into the Auth Flow
    *   `[ ] 1.6.1` In `packages/store/src/authStore.ts` (or wherever the post-authentication logic resides), import `checkAndReplayPendingAction` from `packages/utils`.
    *   `[ ] 1.6.2` In the logic that runs after a user successfully logs in or signs up, add a call to `const returnPath = await checkAndReplayPendingAction(); if (returnPath) { /* navigate to returnPath */ }`.
    *   `[ ] 1.6.3 [DOCS]` Add comments explaining that this function call handles all post-auth action replays.

*   `[ ] 1.7 [COMMIT]` feat(store): implement abstract pending action manager

---

## Section 2: Phase 2 - Refactor AI Chat to Use the Abstract Manager

**Goal:** Migrate the existing, concrete AI Chat pending action feature to use the new abstract system, proving the system's viability and cleaning up the codebase.

---

*   `[ ] 2.1 [STORE]` Register the Chat Action
    *   `[ ] 2.1.1` In `packages/store/src/aiStore.ts` (or a centralized `index.ts` for the store package), import `registerReplayAction`.
    *   `[ ] 2.1.2` Call the registration function to link the endpoint to the store's action: `registerReplayAction('chat', (body) => useAiStore.getState().sendMessage(body));`. This should be done once when the app initializes.

*   `[ ] 2.2 [UI]` Refactor the Chat Input Component
    *   `[ ] 2.2.1` Locate the UI component responsible for handling unauthenticated chat message submission.
    *   `[ ] 2.2.2 [TEST-UNIT]` Update the component's unit tests. Remove mocks and assertions for direct `localStorage.setItem` calls. Instead, mock `stashPendingAction` from `@paynless/utils` and assert that it is called with the correct `PendingAction` object (e.g., `{ endpoint: 'chat', method: 'POST', body: { ... }, returnPath: 'chat' }`).
    *   `[ ] 2.2.3 [REFACTOR]` Modify the component's submission handler.
        *   Import `stashPendingAction`.
        *   Remove all manual `localStorage.setItem` logic.
        *   Replace it with a single call to `stashPendingAction`, passing the appropriate action object. The component will still be responsible for navigation.

*   `[ ] 2.3 [STORE]` Clean up `aiStore`
    *   `[ ] 2.3.1 [REFACTOR]` In `packages/store/src/ai.SendMessage.ts`:
        *   Delete the manual `localStorage.setItem('pendingActionDetails', ...)` call.
        *   Instead, import and use the new `stashPendingAction` utility.
        *   Delete any old `PendingAction` type definitions that are now superseded by the generic type in `@paynless/types`.
    *   `[ ] 2.3.2` Find and delete the old `checkAndReplayPendingChatAction` function and its related tests, as this logic is now centralized.

*   `[ ] 2.4 [TEST-E2E]` Full Verification
    *   `[ ] 2.4.1` Run the entire test suite, paying close attention to any existing E2E or integration tests that cover the unauthenticated chat flow. They must all pass without modification. This confirms the refactoring was successful and non-breaking.

*   `[ ] 2.5 [COMMIT]` refactor(chat): migrate pending chat action to abstract replay manager

---

## Section 3: Phase 3 - Implement Replay Action for Dialectic Project Creation

**Goal:** Extend the now-proven abstract pending action system to the Dialectic feature, allowing unauthenticated users on the homepage to start creating a project and seamlessly finish after logging in.

---

*   `[ ] 3.1 [STORE]` Register the Dialectic Action
    *   `[ ] 3.1.1` In `packages/store/src/dialecticStore.ts` (or a centralized registration point), import `registerReplayAction`.
    *   `[ ] 3.1.2` Call the registration function: `registerReplayAction('dialectic', (body) => useDialecticStore.getState().createDialecticProject(body));`.

*   `[ ] 3.2 [UI]` Refactor `CreateDialecticProjectForm.tsx`
    *   `[ ] 3.2.1` Import `useAuthStore` to get the user's authentication status.
    *   `[ ] 3.2.2` Import `stashPendingAction` from `@paynless/utils`.
    *   `[ ] 3.2.3 [TEST-UNIT]` Update unit tests for `CreateDialecticProjectForm.test.tsx`.
        *   Add a new test suite for the unauthenticated user flow.
        *   Mock `useAuthStore` to return `{ user: null }`.
        *   Simulate a form submission.
        *   Assert that `createDialecticProject` is **not** called directly.
        *   Assert that `stashPendingAction` **is** called with the correct `PendingAction` object, including `{ endpoint: 'dialectic', method: 'POST', body: { ...formData... }, returnPath: '/dialectic' }`.
    *   `[ ] 3.2.4 [REFACTOR]` Modify the `onSubmit` handler in the component.
        *   At the beginning of the handler, check if the user is authenticated.
        *   If `!user`, package the form data into a `PendingAction` object, call `stashPendingAction`, and then redirect the user to login. Return early.
        *   The existing logic to call `createDialecticProject` will now only run if the user is authenticated.

*   `[ ] 3.3 [TEST-E2E]` Write a New End-to-End Test
    *   `[ ] 3.3.1` Create a new E2E test file for the unauthenticated dialectic creation flow.
    *   `[ ] 3.3.2` The test should perform the following steps:
        1.  Visit the homepage as a logged-out user.
        2.  Fill in the "Project Name" and "Initial User Prompt" fields.
        3.  Click the "Create Project" button.
        4.  Assert that `stashPendingAction` was called and the user is redirected to the login page.
        5.  Programmatically perform a user login.
        6.  Assert that after login, the `createDialecticProject` action is called (can be verified by mocking the API call it makes).
        7.  Assert that the user is redirected to the URL specified in `returnPath` (e.g., `/dialectic`).

*   `[ ] 3.4 [DOCS]` Update documentation for the `CreateDialecticProjectForm` and the Dialectic feature to describe this new unauthenticated workflow.

*   `[ ] 3.5 [COMMIT]` feat(dialectic): implement pending action replay for project creation 