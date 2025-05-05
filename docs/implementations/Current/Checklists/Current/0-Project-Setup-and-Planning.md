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

## Phase 0: Project Setup & Planning

### STEP-0.1: Project Initialization [🚧]

#### STEP-0.1.1: Create Feature Branch [COMMIT]
* [X] Create a new branch from `main` named `feature/ai-chat-org-integration`
* [X] Push the branch to the remote repository
* [X] Create a draft pull request with initial description outlining the feature scope

#### STEP-0.1.2: Update Package Dependencies [COMMIT] [✅]
* [X] Update `package.json` to include any necessary new dependencies:
  * [X] Add tokenizer library (e.g., `tiktoken`) for token estimation
  * [X] Verify Markdown rendering library (e.g., `react-markdown`) is installed or add it
* [X] Run `pnpm install` to update dependencies
* [X] Verify the project builds correctly after dependency updates

#### STEP-0.1.3: Validate CI & Development Tooling [Based on OpenAI 0.4]
* [ ] **[SETUP]** Create/Configure CI workflow (e.g., `.github/workflows/build-test-lint.yml`) to trigger on `feature/*` branches.
* [ ] **[STOP]** Ensure the configured CI pipeline **successfully builds the project and passes lint checks** on the new branch once triggered.
    * [ ] *Note: Acknowledge existing test failures. These will be addressed incrementally during feature development and dedicated testing phases. Focus now is on build/lint success and CI trigger validation.* 
* [ ] **[TEST]** Push an empty commit (`git commit --allow-empty -m "chore: test CI trigger"`) and observe CI run to confirm it triggers correctly.
* [ ] **[COMMIT]** N/A (No code changes, but confirms tooling basics work)

### STEP-0.2: Project Structure Planning [🚧]

#### STEP-0.2.1: Review Existing Folder Structure
* [ ] Review the current project architecture to identify where new components will be added
* [ ] Document file paths for all components that will be modified or created

#### STEP-0.2.2: Plan Component Architecture
* [ ] Create component architecture diagram showing relationships between:
  * [ ] Database schema changes
  * [ ] API client methods
  * [ ] State management stores
  * [ ] UI components
* [ ] Document all new types and interfaces that will be needed
* [ ] Define data flow patterns between components

#### STEP-0.2.3: Define Analytics Events [ANALYTICS]
* [ ] Define all analytics events that will be tracked:
  * [ ] `chat_context_selected` - When a user selects a chat context (Personal or Organization)
  * [ ] `organization_chat_created` - When a new organization chat is created
  * [ ] `organization_chat_viewed` - When an organization chat is viewed
  * [ ] `organization_chat_deleted` - When an organization chat is deleted
  * [ ] `member_chat_creation_toggled` - When an admin toggles the ability for members to create organization chats
  * [ ] `chat_rewind_used` - When a user rewinds a chat to edit a previous prompt
  * [ ] `token_usage_viewed` - When a user views token usage information
* [ ] Document event parameters for each analytics event

### STEP-0.3: Technical Design Finalization [🚧]

#### STEP-0.3.1: Finalize Database Schema Changes
* [ ] Document the complete database schema changes required:
  * [ ] `organization_id` addition to `chats` table
  * [ ] `system_prompt_id` addition to `chats` table
  * [ ] `allow_member_chat_creation` addition to `organizations` table
  * [ ] Any additional columns needed for chat rewind/reprompt functionality
* [ ] Define indexing strategy for efficient queries
* [ ] Document all foreign key relationships and constraints

#### STEP-0.3.2: Finalize API Changes
* [ ] Document all API client method signature changes
* [ ] Define request/response types for new or modified endpoints
* [ ] Document error handling strategies

#### STEP-0.3.3: Finalize Store Changes
* [ ] Document changes to `useAiStore` state structure
* [ ] Document new selectors and actions
* [ ] Define interaction patterns with `useOrganizationStore`

#### STEP-0.3.4: Create Test Plan
* [ ] Define unit test requirements for each new component
* [ ] Define integration test scenarios for key workflows
* [ ] Create a test matrix covering all components and scenarios

--- 

**Phase 0 Complete Checkpoint:**
*   [ ] Feature branch created, draft PR opened.
*   [ ] Necessary package dependencies updated and verified.
*   [ ] Project structure reviewed, component architecture planned.
*   [ ] Analytics events defined.
*   [ ] Technical design (DB, API, Store) finalized.
*   [ ] Test plan created.
*   [ ] All Phase 0 commits made. 