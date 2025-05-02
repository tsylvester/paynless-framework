# Product Requirements Document

## 1. Executive Summary
This project transforms the existing individual-centric AI Chat into a robust, organization-aware collaboration tool. We will introduce organization-scoped chats with a two-role access model (admin/member), improve core UX behaviors (navigation, scrolling, prompt persistence), add Markdown support, track token usage, and integrate analytics. Advanced real-time collaboration, file attachments, export features, performance monitoring, and privacy policies are explicitly deferred to future phases.

## 2. Problem Statement
Our current AI Chat only supports personal conversations, lacks team collaboration features, and suffers from UX issues such as inconsistent navigation, improper scrolling, and loss of system prompt context. This hampers productivity and prevents wider adoption in multi-user environments.

## 3. User Personas
- **Organization Administrator**  
  Manages organization settings and chat access controls.  
- **Organization Member**  
  Participates in organization-scoped chats based on role permissions.  
- **Individual User**  
  Uses AI Chat for personal tasks outside any organization context.

## 4. Goals
1. Enable creation and use of AI chats scoped to an organization or kept personal.  
2. Provide clear, persistent UI context selection (Personal vs. Organization).  
3. Implement a simple RBAC model with `admin` and `member` roles.  
4. Fix core UX issues: reliable navigation, auto-scroll to top of new messages, and prompt persistence.  
5. Support Markdown input and rendering in messages.  
6. Track and display token usage per message and session.  
7. Emit analytics events for key interactions via `packages/analytics`.  
8. Defer advanced real-time collaboration, file handling/export, performance metrics, and privacy/data-retention policies.

## 5. Detailed Requirements

### 5.1 Organization Integration
5.1.1 **Context Selection**  
- On chat creation, users choose “Personal” or a specific Organization.  
- The chat header displays a persistent toggle showing the active context.

5.1.2 **Chat History Segmentation**  
- Chat History UI separates Personal chats and Org chats into labeled sections.  
- When switching organizations, only that org’s chats appear in the Org section.

5.1.3 **Default Behavior**  
- Default context is Personal unless the user explicitly selects an Organization.

### 5.2 Access Control
5.2.1 **Roles**  
- Two roles in `organization_members`: `admin` and `member`.

5.2.2 **Permissions**  
- **Admin**: Create org chats, delete any org chat, enable/disable member chat creation.  
- **Member**: View all org chats, create new org chats if allowed, delete/edit own messages.

5.2.3 **Database-Level Enforcement (RLS)**  
- Chats with `organization_id = NULL` are personal and accessible only to their owner.  
- Org-scoped chats are accessible to users with an active membership in that organization.

### 5.3 Chat Experience Improvements
5.3.1 **Navigation & Replay**  
- Selecting a past chat reliably navigates to the chat view and restores its system prompt and message state.

5.3.2 **Auto-Scroll**  
- Upon receiving a new message, scroll so the **top** of that new message is visible from its beginning.

5.3.3 **System Prompt Persistence**  
- Each chat record persists its `system_prompt_id`. Loading or replay restores the prompt automatically.

### 5.4 Technical Requirements
5.4.1 **Database**  
- Add `organization_id UUID NULLABLE` to `public.chats` with an index on `(organization_id, updated_at)`.

5.4.2 **API Client (`@paynless/api`)**  
- Extend `ChatApiClient` methods (`fetchChats`, `sendMessage`, etc.) to accept an optional `organizationId` (default `null`).

5.4.3 **State Management (`@paynless/store`)**  
- Refactor `useOrganizationStore` to expose `currentOrganizationId`.  
- Refactor `useAiStore` to partition chats and messages by `organizationId` and update selectors/actions accordingly.

5.4.4 **Frontend (`apps/web`)**  
- Implement the context toggle UI in `ChatInterface`.  
- Update `ChatList`, `ChatHistory`, and message components to respect `currentOrganizationId`.  
- Use `shadcn/ui` components, loading skeletons, and React error boundaries.

### 5.5 Markdown Support
- The chat input area must accept Markdown syntax.  
- Render user and assistant messages with basic Markdown (bold, italics, lists, code blocks).

### 5.6 Token Usage Tracking
- Integrate a client-side tokenizer (e.g., `tiktoken`) to estimate prompt tokens before sending.  
- Persist `prompt_tokens` and `completion_tokens` from AI responses in `chat_messages`.  
- Display per-message token counts and cumulative session totals (user, assistant, total).

### 5.7 Analytics Integration
- Emit analytics events (`chat.create`, `message.send`, `chat.load`, `context.switch`, `token.estimate`) using `packages/analytics`.

### 5.8 .md File Handling (Stretch Goal)
- Document as a future stretch goal:  
  - Attach `.md` files to chats.  
  - Export chat history as `.md`.

### 5.9 Testing Requirements
- Follow a strict TDD approach: write unit tests before each feature.  
- **Unit Tests**: API client methods, store actions, selectors.  
- **Integration Tests**: RLS policies, Edge Function endpoints, store↔API interactions.  
- Defer performance, end-to-end, cross-browser, and UAT tests to later phases.

---

# Implementation Plan

## Overview
We will apply a **RED → GREEN → REFACTOR** workflow. Each feature or fix comprises:
1. **Stop & Write Failing Test** (unit or integration).  
2. **Implement Code** to make tests pass.  
3. **Refactor** for clarity, reusability, and adherence to standards.  
4. **Commit** with a descriptive message.  
5. **Run** `npm test`, `npm run build`, and restart the dev server.  

Checkpoints are documented at each sub-step. We use feature branches (`feature/org-chat-enhancements`) and enforce code review.

---

## Phase 1: Setup & Architecture

1. [ ] Create branch `feature/org-chat-enhancements`.  
2. [ ] Add dependencies:  
   - `packages/analytics` (if not already present).  
   - Tokenizer library (e.g., `tiktoken`).  
3. [ ] Define test templates:  
   - Jest setup for unit tests in `@paynless/api` and `@paynless/store`.  
   - Integration test harness for Supabase Edge Functions.  
4. [ ] Validate CI pipeline runs new tests and builds without errors.

---

## Phase 2: Data Model & Migrations

1. [ ] **Stop:** Write a unit test verifying the presence of `organization_id` migration file and its down-script.  
2. [ ] Create Supabase migration to add `organization_id UUID NULLABLE` to `public.chats` with index.  
3. [ ] **Stop:** Run integration tests against a staging DB to confirm the new column & index exist.  
4. [ ] Implement or update the helper SQL function `is_org_member(org_id, user_id, status)`.  
5. [ ] **Stop:** Write integration tests that assert RLS policies on `chats` for both `admin` and `member` roles.

---

## Phase 3: API Client Updates

1. [ ] **Stop:** Write unit tests in `@paynless/api` for `ChatApiClient` methods confirming they accept and forward `organizationId`.  
2. [ ] Update method signatures (`fetchChats`, `createChat`, `sendMessage`, etc.) to include optional `organizationId`.  
3. [ ] **Stop:** Ensure unit tests pass and confirm request payloads contain `organizationId`.  
4. [ ] Modify Supabase Edge Functions to read and enforce `organizationId` via RLS.  
5. [ ] **Stop:** Write integration tests calling local Edge Functions for personal vs. org-scoped requests.

---

## Phase 4: State Management Refactor

1. [ ] **Stop:** Write unit tests for `useOrganizationStore` to verify setting and retrieving `currentOrganizationId`.  
2. [ ] Refactor `useOrganizationStore` to expose `currentOrganizationId` and `setCurrentOrganization` actions.  
3. [ ] **Stop:** Write unit tests for updated `useAiStore` selectors that filter by `currentOrganizationId`.  
4. [ ] Refactor `useAiStore` state to partition `chatsByOrgId` and `messagesByOrgId`.  
5. [ ] [ ] Add unit tests for new store actions (`loadChats`, `sendMessage`) ensuring they include `organizationId`.

---

## Phase 5: Frontend Component Implementation

1. [ ] **Stop:** Write an integration test (React Testing Library) asserting `ChatInterface` renders a context toggle.  
2. [ ] Implement context toggle UI using `shadcn/ui` Select or Toggle.  
3. [ ] **Stop:** Test that toggling context updates `useOrganizationStore`.  
4. [ ] Update `ChatList` & `ChatHistory`:  
   - Filter items by `currentOrganizationId`.  
   - Display clear labels/icons for context.  
5. [ ] **Stop:** Unit test `ChatList` with mixed personal/org data sets.  
6. [ ] Implement auto-scroll behavior to show the top of each new message.  
7. [ ] **Stop:** Integration tests simulating new messages and verifying scroll position.  
8. [ ] Wrap chat modules in `ErrorBoundary` components.  
9. [ ] Add `Skeleton` components for chat list and message area loading states.  
10. [ ] **Stop:** Snapshot tests for loading and error states.

---

## Phase 6: System Prompt Persistence

1. [ ] **Stop:** Write unit test ensuring `system_prompt_id` is stored when creating a chat.  
2. [ ] Update DB schema/handler to include `system_prompt_id` on chat creation.  
3. [ ] Refactor `ChatInterface` to retrieve and display the saved prompt on load/replay.  
4. [ ] **Stop:** Integration test simulating chat load and verifying correct prompt restoration.

---

## Phase 7: Markdown Support

1. [ ] **Stop:** Write unit tests for a Markdown rendering component (e.g., Remark).  
2. [ ] Enable Markdown syntax in the chat input area.  
3. [ ] Implement Markdown rendering in message bubbles.  
4. [ ] **Stop:** Integration tests verifying rendered HTML for sample Markdown inputs.

---

## Phase 8: Token Usage Tracking

1. [ ] **Stop:** Write unit test for client-side tokenizer estimating prompt tokens.  
2. [ ] Integrate the tokenizer library and display the estimate near the input.  
3. [ ] Persist `prompt_tokens` & `completion_tokens` from AI responses to `chat_messages`.  
4. [ ] **Stop:** Integration tests confirming token counts appear correctly in UI and data store.  
5. [ ] Add UI component in chat footer displaying cumulative session token usage.

---

## Phase 9: Analytics Instrumentation

1. [ ] **Stop:** Write unit tests mocking `packages/analytics` to assert events:  
   - `chat.create`, `message.send`, `chat.load`, `context.switch`, `token.estimate`.  
2. [ ] Instrument analytics calls in both API client and frontend actions.  
3. [ ] **Stop:** Run unit tests confirming correct event payloads for each user interaction.

---

## Phase 10: Stretch Goals (Backlogged)

- Real-time multi-user collaboration  
- Privacy & data-retention policies  
- Performance monitoring & SLAs  
- Mobile-optimized UI  
- File attachment & `.md` export  
- E2E, cross-browser, and UAT testing  

Add these to the backlog with clear acceptance criteria for future phases.

---

**Checkpoints & Commit Guidelines**  
- After each “Stop” step, run `npm test`, `npm run build`, and restart the dev server.  
- Commit passing changes with clear messages, e.g., `feat(chat): add organization_id to chats`.  
- Update code coverage reports and ensure no regressions.  
- Upon completing core phases (1–9), open a PR for code review.  
- Merge only when all tests pass and peer review is complete.  

---

**Reminder:** After merging, remind the team to pull the latest migrations, restart the development server, and verify end-to-end chat workflows manually.