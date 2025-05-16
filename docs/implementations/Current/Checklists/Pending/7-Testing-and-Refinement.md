# AI Chat Enhancements: Implementation Plan

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

## Implementation Plan Overview

This implementation plan follows a phased approach, with each phase building on the previous one:

1. **Project Setup & Planning:** Initialize the project structure, branches, and establish development practices
2. **Database & Backend Foundation:** Implement core database schema changes and RLS policies
3. **API Client Integration:** Update API client methods to support organization context
4. **Store Refactoring:** Modify state management to support organization-scoped chats
5. **Core UI Components:** Implement primary UI components for organization chat context
6. **Bug Fixes:** Address identified user experience issues
7. **Chat Experience Enhancements:** Implement markdown support, token tracking, etc.
8. **Testing & Refinement:** Comprehensive testing and final adjustments
9. **Documentation & Deployment:** Create documentation and prepare for release

---

## Phase 6: Testing & Refinement

### STEP-6.1: Comprehensive Integration Testing [🚧]

#### STEP-6.1.1: Test Organization Admin Flows [TEST-INT] [COMMIT]
* [ ] Create and run integration tests for organization admin flows:
  * [ ] Creating organization chats
  * [ ] Managing member chat creation permissions
  * [ ] Deleting organization chats
  * [ ] Viewing organization chat history
* [ ] Fix any issues identified during testing
* [ ] Commit changes with message "test(INT): Add integration tests for organization admin flows"

#### STEP-6.1.2: Test Organization Member Flows [TEST-INT] [COMMIT]
* [ ] Create and run integration tests for organization member flows:
  * [ ] Viewing organization chats
  * [ ] Creating organization chats (when allowed)
  * [ ] Attempting to create organization chats (when not allowed)
  * [ ] Attempting to delete organization chats (should fail)
* [ ] Fix any issues identified during testing
* [ ] Commit changes with message "test(INT): Add integration tests for organization member flows"

#### STEP-6.1.3: Test Context Switching [TEST-INT] [COMMIT]
* [ ] Create and run integration tests for context switching:
  * [ ] Switching between personal and organization contexts
  * [ ] Switching between multiple organizations
  * [ ] Verifying chat history updates correctly
  * [ ] Verifying new chats are created in the correct context
* [ ] Fix any issues identified during testing
* [ ] Commit changes with message "test(INT): Add integration tests for context switching"

### STEP-6.2: Final Code Review & Refactor [Based on Gemini 4.2] [🚧]
*   [ ] **Step 6.2.1: [REFACTOR] Code Review Sweep**
    *   [ ] Review all new/modified code across `supabase/functions/`, `packages/api/`, `packages/store/`, `packages/types/`, `apps/web/`.
    *   [ ] Check for: clarity, efficiency, adherence to project standards (`DEV_PLAN.md`), proper TypeScript usage (types, interfaces), error handling, logging (using `@paynless/utils logger`), potential race conditions, security considerations (input validation, RLS reliance), leftover TODOs/comments.
*   [ ] **Step 6.2.2: [TEST-UNIT][TEST-INT] Test Coverage Review**
    *   [ ] Run code coverage reports (`npm run test:coverage` if configured).
    *   [ ] Identify critical paths or complex logic with low coverage.
    *   [ ] Add missing unit or integration tests to improve confidence. Focus on logic, edge cases, and error handling.
*   [ ] **Step 6.2.3: [COMMIT] Commit Final Refactoring & Test Improvements**
    *   [ ] Stage refactored code and new/updated tests.
    *   [ ] Commit: `refactor: Final code cleanup and improvements for chat enhancements`

### STEP-6.3: UI Standardization (`shadcn/ui`) [Based on Gemini 4.1] [🚧]
*   [ ] **Step 6.3.1: [UI][REFACTOR] Review Components for ShadCN Consistency**
    *   [ ] Go through all components modified/created in `apps/web/src/components/ai/`, `apps/web/src/pages/AiChat.tsx`, and related areas.
    *   [ ] Replace any custom implementations of standard UI elements (Buttons, Selects, Dialogs, Inputs, Tabs, Skeletons, Switches, etc.) with the corresponding `shadcn/ui` components.
    *   [ ] Ensure consistent use of `shadcn/ui` styling, spacing, and theming utilities (`cn` function). (REQ-UX-2.1).
*   [ ] **Step 6.3.2: [TEST-UNIT] Update Component Tests**
    *   [ ] Update unit/integration tests for components that were changed to use `shadcn/ui`. Ensure tests still pass and correctly reflect the new structure/props. Snapshot tests may need updating.
*   [ ] **Step 6.3.3: [COMMIT] Commit UI Standardization**
    *   [ ] Stage modified components and tests.
    *   [ ] Commit: `style(UI): Ensure consistent shadcn/ui usage across chat features`

### STEP-6.4: User Experience Refinement [Original Claude STEP-6.2] [🚧]

#### STEP-6.4.1: Add User Onboarding for New Features [UI] [COMMIT]
* [ ] Create onboarding components for new features:
  * [ ] Create tooltip or popover explaining organization chat context
  * [ ] Add educational UI for token tracking features
  * [ ] Create brief explanation of chat rewind functionality
* [ ] Implement logic to show onboarding only to users who haven't seen it
* [ ] Add analytics tracking for onboarding interaction
* [ ] Commit changes with message "feat(UI): Add user onboarding for new chat features"

#### STEP-6.4.2: Refine UI Based on Testing [UI] [COMMIT]
* [ ] Conduct internal user testing
* [ ] Collect feedback on the new features
* [ ] Implement UI refinements based on feedback:
  * [ ] Improve clarity of context selection
  * [ ] Enhance visual indicators for chat ownership
  * [ ] Refine token tracking displays
* [ ] Commit changes with message "refactor(UI): Refine UI based on user testing feedback"

### STEP-6.5: Final Manual Testing (Simulated E2E) [Based on Gemini 4.3] [🚧]
*   [ ] **Step 6.5.1: [TEST-E2E] Execute Comprehensive Manual Test Plan**
    *   [ ] Re-test all user flows defined in SYNTHESIS #2 (Admin, Member, Individual contexts).
    *   [ ] **Organization Context:**
        *   Create personal chat.
        *   Switch to Org A. Create org chat (as admin).
        *   Switch to Org B. Verify Org A chat not visible. Create Org B chat.
        *   Switch back to Org A. Verify Org A chat visible, Org B not.
        *   As Org A admin, disable member chat creation in settings.
        *   Log in as Org A member. Verify cannot create Org A chat.
        *   Log in as Org A admin. Re-enable member creation.
        *   Log in as Org A member. Verify *can* create Org A chat.
        *   Log in as Org A admin. Delete Org A chat created by member. Verify gone.
        *   Log in as Org A member. Verify chat is gone.
    *   [ ] **Core Chat Features:**
        *   Verify default provider/prompt load.
        *   Verify chat history loads correctly in each context.
        *   Test navigation between many chats.
        *   Test scrolling with long/short messages, fast submissions.
        *   Test Markdown rendering (bold, italic, list, code, link).
        *   Test token estimation, per-message display, cumulative display.
        *   Test Rewind/Reprompt: rewind early, rewind middle, rewind last. Verify history truncation.
    *   [ ] **Error Handling:**
        *   Simulate network errors (e.g., browser devtools offline mode) during message send/load. Verify error messages/boundaries.
        *   Attempt actions without permissions (e.g., member deleting org chat). Verify UI prevents or shows error.
        *   Test empty states (no chats, no messages).
    *   [ ] **UI Consistency:**
        *   Check `shadcn/ui` component usage, loading states (skeletons), context indicators.
*   [ ] **Step 6.5.2: [FIX] Address Bugs Found**
    *   [ ] Create tickets/issues for any bugs found during testing.
    *   [ ] Fix critical bugs following TDD cycle.
*   [ ] **Step 6.5.3: [COMMIT] Commit Bug Fixes**
    *   [ ] Commit fixes with appropriate messages: `fix: Address bugs found during final manual testing`

### STEP-6.6: Performance Testing [Original Claude STEP-6.3] [🚧]

#### STEP-6.6.1: Conduct Load Testing [TEST-INT]
* [ ] Set up load testing scenarios:
  * [ ] Test with large numbers of chats
  * [ ] Test with long conversation histories
  * [ ] Test with multiple users accessing the same organization chats
* [ ] Identify and address any performance bottlenecks
* [ ] Optimize database queries and indexing if needed

#### STEP-6.6.2: Optimize for Performance [REFACTOR] [COMMIT]
* [ ] Implement performance optimizations based on testing:
  * [ ] Add pagination for chat history if needed
  * [ ] Optimize database queries
  * [ ] Implement virtual scrolling for long conversations if needed
* [ ] Commit changes with message "perf: Optimize chat performance based on load testing"

---
### STEP-6.6: Complete Prior Stage Cleanup Tasks [ ]

#### STEP-6.6.1 Phase 1 Cleanup 
*   [ ] **[REFACTOR]** Move `HandlerError` class from `api-subscriptions` to a shared location (e.g., `_shared/errors.ts` or similar) and update imports in `chat-details` and other functions.
*   [ ] **[REFACTOR]** Improve client-side request replay logic (e.g., in `ApiClient`) to handle standard 401 responses (`{"error": ...}`), allowing backend functions like `chat-details` to remove special `{"msg": ...}` formatting for 401s.
*   [ ] **[REFACTOR]** Add stricter validation (e.g., regex check) for the `chatId` path parameter in the `chat-details` Edge Function to ensure it conforms to a UUID format.
*   [ ] **[TEST-DEBUG]** Investigate and resolve Deno test leaks (approx. 19-25 intervals from `SupabaseAuthClient._startAutoRefresh`) in `supabase/functions/chat/test/chat.integration.test.ts`. Current hypothesis: multiple `signInWithPassword` calls on the same client instance, or clients created within `mainHandler` via DI not being fully cleaned up despite `signOut` attempts. Consider refactoring tests to use one client per authenticated user session and ensuring explicit sign-out for each.
*   [ ] **[TEST-DEBUG]** Deno integration tests for `chat-details` (`supabase/functions/chat-details/test/chat-details.integration.test.ts`) are failing due to interval leaks (approx. 4-6 intervals from `SupabaseAuthClient._startAutoRefresh`), even though all individual test steps pass. This is similar to the issue in `chat` tests and may require a similar investigation or deferral.
*   [ ] **[TEST-DEBUG]** Deno integration tests for `chat-history` (`supabase/functions/chat-history/test/chat-history.integration.test.ts`) are failing due to interval leaks (approx. 4 intervals from `SupabaseAuthClient._startAutoRefresh`), even though all individual test steps pass. This is similar to the issues in `chat` and `chat-details` tests and may require similar investigation or deferral.
*   [ ] **[TEST-DEBUG]** `Post` for new org chat should include `organizationId` in insert test is failing to spy problems

#### STEP-6.6.2 Phase 2 Cleanup 
#### BACKLOG ITEM: Add/Verify Remaining Analytics Integration [ANALYTICS] [COMMIT]
* [ ] Review all actions in packages to implement app analytics.
* [ ] Review all actions in `useAiStore` and `useOrganizationStore`.
* [ ] Verify all analytics events defined in Phase 0 (STEP-0.2.3) are correctly implemented within the relevant store actions, including parameters:
    * `useAiStore`: `chat_context_selected` (triggered by subscription), `organization_chat_created`, `organization_chat_deleted`, `chat_rewind_used`.
    * `useOrganizationStore`: `member_chat_creation_toggled`.
    * *Note:* Events like `organization_chat_viewed` and `token_usage_viewed` might be better suited for the UI layer when the relevant component mounts or 
    data is displayed.
* [ ] Add any missing triggers.
* [ ] Commit changes with message "feat(ANALYTICS): Ensure all required analytics events are triggered from store actions"

#### STEP-6.6.3 Phase 3 Cleanup 

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

#### STEP-6.6.4 Phase 4 Cleanup 

# Future Work for Tokenization & Token Management

    *   [ ] **4.1.1.1a.3: [BE] [ARCH] Define Strategy for System-Initiated Recorder IDs.**
        *   For actions not tied to a direct end-user (e.g., subscription renewals, admin adjustments), use designated placeholder UUIDs initially.
        *   Examples: `00000000-SYSTEM-SUB-0001` for subscriptions, `00000000-SYSTEM-ADM-0001` for admin actions. (These should be valid UUIDs in practice).
        *   Document these placeholder IDs and their intended future replacements.
    *   [ ] **4.1.1.1a.4: [PLAN] Schedule Future Work: Implement Traceable System/Admin IDs.**
        *   Add tasks to later phases (e.g., Admin Panel Implementation, Subscription Management) to replace placeholder `recorded_by_user_id` values with actual `subscription_id`s (linked to `payment_transactions` or a new `subscriptions` table) or `admin_user_id`s from an admin authentication system. This ensures long-term, granular auditability of all system-generated transactions.
        
## Test Fixes and Refactors

**Goal:** Fix, Reduce, Refactor All Tests, Consolidate Mocks.

*   [ ] **[REFACTOR] Consolidate Mocks**
    *   Move interfaces & Types back into supbase.mock, stripe.mock, wallet.mock
    *   Update references to call consolidated mocks 
*   [ ] **4.6.1: [TEST-INT] Fix Webhook Index Tests**
    *   Refactor tests into smaller independent units.
    *   Fix failed tests. 

## Phase 4.5: [ARCH] Tauri/Rust Desktop Wallet Integration Strategy (High-Level Design)

**Goal:** Outline how the web platform's token wallet could potentially interact or synchronize with the Tauri/Rust desktop crypto wallet. This is a research and design phase.

*   [ ] **4.5.1: [ARCH] Define Synchronization Model & Use Cases**
    *   **Use Case 1 (Desktop as Payment Method):** User wants to use crypto from their Tauri wallet to buy AI Tokens for the web platform.
        *   Model: Tauri app communicates with a custom "TauriPaymentAdapter" on the backend.
    *   **Use Case 2 (Desktop as Client to AI Platform Wallet):** Desktop app wants to show AI Token balance and allow use of AI services, debiting the same centralized AI Token wallet.
        *   Model: Tauri app's backend calls the same APIs as the web app (`/wallet-info`, `/chat` with token debits).
    *   **Initial Focus:** Use Case 1. The Tauri wallet helps *acquire* platform AI Tokens.
*   [ ] **4.5.2: [ARCH] `TauriPaymentAdapter` Design (for Use Case 1)**
    *   The web UI's "Top-Up" page could have "Pay with Tauri Wallet" option.
    *   Clicking this triggers `initiatePurchase` with `paymentGatewayId: 'tauri_crypto_wallet'`.
    *   Backend `TauriPaymentAdapter.initiatePayment` might:
        *   Generate a unique transaction ID for the platform.
        *   Return instructions/deep-link for the user to open their Tauri wallet and approve a specific crypto transfer to a designated platform address, including the transaction ID in memo/metadata.
    *   A separate backend process/webhook listener for the platform's crypto deposit address would:
        *   Detect incoming crypto transactions.
        *   Match the memo/metadata to a pending `payment_transactions` record.
        *   Call `TokenWalletService.recordTransaction` to credit AI Tokens.
*   [ ] **4.5.3: [ARCH] Security & UX for Tauri Payment Flow.**
*   [ ] **4.5.4: [DOC] Document the chosen integration strategy for Tauri payments.**
*   [ ] **4.5.5: [COMMIT]** "docs(ARCH): Outline strategy for Tauri desktop wallet as a payment method for AI Tokens"
    *   *(Actual implementation of this adapter and flow would be a subsequent phase)*

---

#### STEP-6.6.5 Phase 5 Cleanup 

**Phase 6 Complete Checkpoint:**
*   [ ] All Phase 6 tests (Unit, Integration, Manual E2E, performance tests) passing.
*   [ ] Code coverage is satisfactory for critical paths.
*   [ ] Code has been reviewed and refactored for quality and consistency.
*   [ ] UI is standardized using `shadcn/ui`.
*   [ ] Comprehensive manual testing completed, critical bugs fixed.
*   [ ] Admin, Member, and Context Switching flows are verified through tests.
*   [ ] User experience refined (onboarding, UI clarity).
*   [ ] Performance bottlenecks identified and addressed.
*   [ ] Code refactored, and commits made.
*   [ ] Run `npm test`, `npm run build`. Restart dev server and perform final smoke test. 