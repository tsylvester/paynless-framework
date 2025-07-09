# AI Dialectic - Parallel Agent Calls Refactoring Plan

This document outlines the comprehensive plan to refactor the AI Dialectic contribution generation process from a serial, synchronous workflow to a parallel, asynchronous one. This change is critical to reduce user-facing latency, improve system throughput, and enhance reliability by decoupling long-running backend tasks from the client-side request-response cycle. This plan follows a Test-Driven Development (TDD) methodology.

## Legend

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or nested set that has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api` - includes interface definition in `interface.ts`, implementation in `adapter.ts`, and mocks in `mocks.ts`)
*   `[STORE]` State Management (`@paynless/store` - includes interface definition, actions, reducers/slices, selectors, and mocks)
*   `[UI]` Frontend Component (e.g., in `apps/web`, following component structure rules)
*   `[CLI]` Command Line Interface component/feature
*   `[IDE]` IDE Plugin component/feature
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update (API-Backend, Store-Component, RLS)
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update (READMEs, API docs, user guides)
*   `[REFACTOR]` Code Refactoring Step
*   `[PROMPT]` System Prompt Engineering/Management
*   `[CONFIG]` Configuration changes (e.g., environment variables, service configurations)
*   `[COMMIT]` Checkpoint for Git Commit (aligns with "feat:", "test:", "fix:", "docs:", "refactor:" conventions)
*   `[DEPLOY]` Checkpoint for Deployment consideration after a major phase or feature set is complete and tested.

---

## Phase 1: Backend Refactoring for Asynchronous Parallel Execution (TDD)

### 1. Backend Core Logic Refactoring
   *   `[✅]` 1.a. [TEST-UNIT] Write a new failing unit test in `supabase/functions/dialectic-service/generateContribution.test.ts` to assert that the function returns an immediate success response and processes the AI calls in a detached, asynchronous block.
   *   `[✅]` 1.b. [REFACTOR] Refactor the `generateContributions` function in `supabase/functions/dialectic-service/generateContribution.ts` to use `Promise.allSettled`. Move the core logic into an `async` IIFE so the main function returns immediately.
   *   `[✅]` 1.c. [TEST-UNIT] Refactor the existing synchronous tests in the file to accommodate the new async-wrapper pattern, or remove/stub them if they are no longer relevant.
   *   `[✅]` 1.d. [TEST-UNIT] Make the new asynchronous test from `1.a` pass.
   *   `[✅]` 1.e. [COMMIT] `feat(backend): Implement parallel contribution generation`

### 2. Backend Notification Integration
   *   `[✅]` 2.a. [REFACTOR] Review existing backend functions that create notifications. Discover the existing `create_notification_for_user` database function.
   *   `[✅]` 2.b. [TEST-UNIT] Write a new failing unit test in `generateContribution.test.ts` to assert that the `dbClient.rpc('create_notification_for_user', ...)` method is called with the correct parameters upon successful completion of the async block.
   *   `[✅]` 2.c. [BE] Modify the async block in `generateContributions` to call the `create_notification_for_user` RPC function with the `projectOwnerUserId` and a payload containing the final status and results.
   *   `[✅]` 2.d. [TEST-UNIT] Make the new RPC test from `2.b` pass.
   *   `[✅]` 2.e. [COMMIT] `feat(backend): Add completion notification for contribution generation`

---

## Phase 2: Frontend Refactoring for Asynchronous UI Updates (TDD)

### 3. Store and State Management
   *   `[✅]` 3.a. [TEST-UNIT] In `packages/store/src/dialecticStore.test.ts`, write a failing test for the `generateContributions` thunk.
       *   `[✅]` 3.a.i. The test should assert that after the action is called, the store's state is immediately updated to reflect a "generating" status for the specific session (e.g., `generatingSessions[sessionId] = true`).
   *   `[✅]` 3.b. [STORE] In `packages/store/src/dialecticStore.ts`, add the new state `generatingSessions: { [sessionId: string]: boolean }` to `DialecticStateValues`.
   *   `[✅]` 3.c. [STORE] Modify the `generateContributions` thunk. It should call the API but *not* wait for the full process. Upon receiving the immediate success response, it should update `generatingSessions` in the state. Make the test from `3.a` pass.
   *   `[✅]` 3.d. [TEST-UNIT] In `packages/store/src/notificationStore.test.ts`, write a test to verify how the store handles the new `'contribution_generation_complete'` notification type.
       *   `[✅]` 3.d.i. Simulate a Realtime event for the new notification type.
       *   `[✅]` 3.d.ii. Assert that a new internal handler in the `dialecticStore` is called as a result. This proves the two stores can interoperate.
   *   `[✅]` 3.e. [STORE] In `packages/store/src/notificationStore.ts`, modify `handleIncomingNotification` to check for `notification.type === 'contribution_generation_complete'`.
       *   `[✅]` 3.e.i. When this notification type is received, it should call an internal handler in the `dialecticStore`, e.g., `_handleGenerationCompleteEvent(notification.data)`.
   *   `[✅]` 3.f. [STORE] In `packages/store/src/dialecticStore.ts`, implement the new internal event handler `_handleGenerationCompleteEvent({ sessionId })`.
       *   `[✅]` 3.f.i. **Note:** This is not a new user-facing thunk, but a required internal function to process the asynchronous completion event from the `notificationStore`. This ensures the existing `generateContributions` thunk is refactored in place.
       *   `[✅]` 3.f.ii. This handler will set `generatingSessions[sessionId] = false`.
       *   `[✅]` 3.f.iii. It will then trigger the existing `fetchDialecticProjectDetails` action to refresh the UI with the newly created contributions.
   *   `[✅]` 3.g. [COMMIT] `feat(store): Update dialectic store for async contribution generation`

### 4. UI Component Updates
   *   `[✅]` 4.a. [TEST-COMPONENT] In `GenerateContributionButton.test.tsx`, write a failing test that mocks `useDialecticStore` to simulate a "generating" state for the current session and asserts that the button correctly disables itself and displays a "Generating..." message.
   *   `[✅]` 4.b. [COMPONENT] Refactor `GenerateContributionButton.tsx` to use the new `generatingSessions[sessionId]` state from the `dialecticStore` to control its disabled state and text.
   *   `[✅]` 4.c. [COMPONENT] Remove the now-obsolete `onGenerationStart` and `onGenerationComplete` props from `GenerateContributionButton` and any parent components.

### 5. Parent Component Cleanup
   *   `[✅]` 5.a. [COMPONENT] In `DialecticSessionView.tsx` (or the parent of `GenerateContributionButton`), remove the state management for `isGenerating` and the handler functions (`handleGenerationStart`, `handleGenerationComplete`).

---

## Phase 3: Final Integration and Documentation

### 6. Integration Testing
   *   `[✅]` 6.a. [TEST-INT] Write an integration test that covers the flow from the `dialecticStore`'s `generateContributions` action to the backend `generateContributions` function.
       *   `[✅]` 6.a.i. This test will verify that the API client correctly calls the backend and that the initial state change in the store is correct.
   *   `[✅]` 6.b. [TEST-E2E] Manually test or update/create an E2E test for the entire workflow:
       *   `[✅]` 6.b.i. Click the "Generate" button.
       *   `[✅]` 6.b.ii. Assert that the button enters a loading state.
       *   `[✅]` 6.b.iii. Assert that an initial "Generation started" toast appears.
       *   `[✅]` 6.b.iv. Wait for and assert that a "Generation complete" notification appears (via the standard notification bell/popup).
       *   `[✅]` 6.b.v. Assert that the UI refreshes to show the new contributions.

### 7. Documentation
   *   `[✅]` 7.a. [DOCS] Update the architecture documentation and any relevant READMEs to reflect the new asynchronous, parallel, TDD-driven flow.

---

*   [✅]     Ensure user chat reqs have max token dynamically capped by the model cap and lowered by the user's balance if insufficient for the full model cap 

## Phase 4: UI/UX Refactoring and Process Improvements (TDD)

### 8. Decouple Generation Button from Stage-Specific Context
   *   `[✅]` 8.a. [STORE] In `dialecticStore.ts`, add `activeStageSlug: string | null` to the state and an action `setActiveStage(slug: string | null)` to update it.
   *   `[✅]` 8.b. [STORE] Create a new selector `selectActiveStage` that returns the full `DialecticStage` object from the project's stage list based on the `activeStageSlug` in the store.
   *   `[✅]` 8.c. [TEST-UNIT] Write a failing test for `GenerateContributionButton.tsx` to assert that it renders correctly without any data-related props (e.g., only `className`). The test will need to mock the `useDialecticStore` to provide an active stage, session, and project.
   *   `[✅]` 8.d. [REFACTOR] Refactor `GenerateContributionButton.tsx` to be self-sufficient.
       *   `[✅]` 8.d.i. Remove data props: `sessionId`, `projectId`, `currentStage`, and `currentStageFriendlyName`.
       *   `[✅]` 8.d.ii. Use `useDialecticStore` with the new `selectActiveStage` and existing selectors (`selectCurrentProjectDetail`, `selectActiveContextSessionId`, `selectSessionById`) to fetch all data internally.
   *   `[✅]` 8.e. [REFACTOR] Move all state-derivation logic from `StageTabCard.tsx` into `GenerateContributionButton.tsx`.
       *   `[✅]` 8.e.i. This includes logic for checking `isStageReady`, `isSeedPromptLoading`, determining the button text (`"Generate"`, `"Regenerate"`, `"Stage Not Ready"`), and calculating the final `disabled` state.
   *   `[✅]` 8.f. [REFACTOR] Refactor `StageTabCard.tsx` to work with the new store state.
       *   `[✅]` 8.f.i. The `onCardClick` handler should now call the `setActiveStage` action from the store.
       *   `[✅]` 8.f.ii. The card's active state (`isActiveStage`) should be determined by comparing its `stage.slug` to the `activeStageSlug` from the store.
   *   `[✅]` 8.g. [DISCOVERY] A regression was discovered: The page no longer selects the first stage on initial load because the logic was removed from the parent page component and the `StageTabCard` no longer manages its own state. The correct architectural solution is to set the initial stage inside the `dialecticStore` when the session data is first loaded.
   *   `[✅]` 8.h. [REFACTOR] Update the `dialecticStore` to set the initial active stage.
       *   `[✅]` 8.h.i. [TEST-UNIT] In `dialecticStore.test.ts`, write a failing test for the `activateProjectAndSessionContextForDeepLink` thunk. Assert that after the thunk completes, the `activeStageSlug` is set to the slug of the first stage from the newly fetched session data.
       *   `[✅]` 8.h.ii. [STORE] In `dialecticStore.ts`, modify the `activateProjectAndSessionContextForDeepLink` thunk to call `setActiveStage` with the first stage's slug after successfully fetching project details.
       *   `[✅]` 8.h.iii. [TEST-UNIT] Make the test from `8.h.i` pass.
   *   `[ ]` 8.i. [COMMIT] `refactor(ui): Decouple GenerateContributionButton from parent components`

### 9. Stabilize AI Model Selector Layout
   *   `[✅` 9.a. [TEST-COMPONENT] Write a test for the component containing `AIModelSelector.tsx` (`StageTabCard.tsx`). The test should simulate selecting multiple models and assert that the top-left position of the component's container does not shift.
   *   `[✅]` 9.b. [UI] In `StageTabCard.tsx`, where `AIModelSelector` is rendered, wrap it in a container `div`.
   *   `[✅]` 9.c. [UI] Apply styling (e.g., `min-height`) to the new container to ensure it accommodates the selector and its selected model badges without resizing vertically, which prevents it from shifting other UI elements.
   *   `[ ]` 9.d. [COMMIT] `fix(ui): Prevent AIModelSelector from shifting layout on selection`

### 10. Stage Navigation Redesign
   *   `[ ]` 10.a. [TEST-UNIT] Write a failing test for `StageTabCard.tsx` that asserts it renders a single, compact, chevron-styled element instead of a large card.
   *   `[ ]` 10.b. [REFACTOR] In `StageTabCard.tsx`, completely overhaul the render method.
       *   `[ ]` 10.b.i. Remove the `Card` component and all its parts.
       *   `[ ]` 10.b.ii. The root element should now be a `Button` or `Link`-like component with a `variant` that makes it look like a breadcrumb or step in a process.
       *   `[ ]` 10.b.iii. The component will display the stage `display_name` and be visually connected to its siblings on the page with a chevron icon (`>`) rendered in the parent component's loop.
   *   `[ ]` 10.c. [UI] In `DialecticSessionDetailsPage.tsx`, adjust the mapping logic for the `StageTabCard` components to render them in a horizontal flex container, placing a chevron icon between each one.
   *   `[ ]` 10.d. [COMMIT] `refactor(ui): Transform stage tabs into a compact step navigator`

### 11. Session Info and Contribution Display Enhancements
   *   `[ ]` 11.a. [TEST-UNIT] Write a failing test for `SessionInfoCard.tsx` asserting that its content is wrapped in an `Accordion` component from ShadCN/UI.
   *   `[ ]` 11.b. [UI] In `SessionInfoCard.tsx`, wrap the `CardContent` in an `<Accordion type="single" collapsible>` component. The `CardHeader` can serve as the `AccordionTrigger`. Make the test from `11.a` pass.
   *   `[ ]` 11.c. [UI] Review all components on `DialecticSessionDetailsPage.tsx` to ensure they gracefully handle the asynchronous loading states (`generatingSessions`) from the `dialecticStore`. The UI should clearly indicate when a specific session's contributions are being generated.
   *   `[ ]` 11.d. [COMMIT] `feat(ui): Make SessionInfoCard collapsible and improve async state display`
   *   `[ ]` 11.e. [DISCOVERY] It has been discovered that `SessionContributionsDisplayCard` and its child `GeneratedContributionsCard` are not reactive to stage changes made via `StageTabCard`. They must be refactored to use the centralized `activeStageSlug` from the store.
   *   `[ ]` 11.f. [TEST-UNIT] Write a failing test for `SessionContributionsDisplayCard.tsx` asserting that it filters its displayed contributions based on the `activeStageSlug` from the `dialecticStore`, not from props.
   *   `[ ]` 11.g. [REFACTOR] Refactor `SessionContributionsDisplayCard.tsx` and `GeneratedContributionsCard.tsx` to remove any `currentStage` props and instead use the `selectActiveStage` selector to ensure they display data for the currently selected stage.
   *   `[ ]` 11.h. [COMMIT] `refactor(ui): Make contribution display reactive to active stage`

### 12. Workflow and Error Handling Improvements
    *   `[ ]` 12.a. [TEST-UNIT] Write a failing test that verifies the `GenerateContributionButton` is enabled when the session status is `'<stage>_generation_failed'`.
    *   `[ ]` 12.b. [REFACTOR] In `GenerateContributionButton`, update the `disabled` logic. The button should be enabled if the session status is `pending_<stage_slug>` OR `${stage.slug}_generation_failed`. This makes the test from `12.a` pass.
    *   `[ ]` 12.c. [REFACTOR] Review the "Regenerate" logic. The button text should display "Regenerate" if contributions for the current stage and iteration *already exist*, regardless of the session status. This allows users to regenerate successful contributions if they are unsatisfied.
    *   `[ ]` 12.d. [COMMIT] `fix(workflow): Allow contribution generation from failed state and improve regeneration flow`

### 13. Notification Link Handling
    *   `[✅]` 13.a. [REFACTOR] In `Notifications.tsx` (header dropdown), ensure `handleNotificationClick` constructs the `target_path` from `notification.data.projectId` and `notification.data.sessionId` if `target_path` is not already present.
    *   `[✅]` 13.b. [TEST-UNIT] In `Notifications.test.tsx`, verify that a click on a `contribution_generation_complete` notification correctly navigates to the dialectic session URL.
    *   `[✅]` 13.c. [REFACTOR] In `NotificationCard.tsx` (used on notifications page), replicate the link construction logic from `13.a` to ensure dialectic notifications are also linked correctly from the main notifications page.
    *   `[✅]` 13.d. [TEST-UNIT] Create a new test file `NotificationCard.test.tsx` to verify all rendering and link construction logic for the component.
    *   `[✅]` 13.e. [COMMIT] `feat(ui): Add direct link from completion notification to session`

[DEPLOY] Consider deployment after all phases are complete and thoroughly tested. 