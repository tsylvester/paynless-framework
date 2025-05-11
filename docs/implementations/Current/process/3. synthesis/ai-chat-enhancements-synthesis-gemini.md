# AI Chat Enhancements: Synthesized Product Requirements Document & Implementation Plan

This document represents the synthesis of multiple initial requirement documents (Hypotheses), critical analyses (Antitheses), and user feedback. It serves as the definitive guide for the AI Chat Enhancement project, outlining the agreed-upon scope, features, and implementation approach.

---

# Part 1: Product Requirements Document (PRD)

## 1. Overview & Executive Summary

This project enhances the AI Chat feature within the Paynless Framework. The primary goals are:

1.  **Organization Integration:** Integrate AI chat capabilities with the multi-tenancy (Organizations) system, allowing chats to be associated with, managed by, and viewed within specific organizational contexts, fostering collaboration.
2.  **Core Chat Improvements:** Implement significant functional and user experience improvements to the chat interface, addressing known issues and adding highly requested features to create a more robust, reliable, and user-friendly AI interaction experience.

This PRD defines the scope for the initial implementation phase, focusing on core organizational integration and essential chat enhancements, while explicitly deferring more complex features like real-time collaboration, advanced permissions, and organization-level billing to future phases.

## 2. Problem Statement

The current AI chat system primarily operates at an individual user level, lacking features for team collaboration within organizations. Furthermore, several user experience shortcomings and functional bugs hinder user satisfaction and productivity. This project directly addresses these issues by:

1.  Enabling organization-scoped chats with basic role-based access control.
2.  Fixing critical bugs related to chat history, state management, and UI behavior.
3.  Introducing key enhancements like markdown support, token tracking, and chat rewind functionality.

## 3. User Personas

These personas guide the design and prioritization of features:

1.  **Organization Administrator (`admin` role):** Manages organization settings, members, and controls specific aspects of organizational chat usage (e.g., enabling/disabling member creation). Needs visibility into org chats and basic management capabilities.
2.  **Organization Member (`member` role):** Uses AI chat for individual productivity and collaboratively within their organization. Needs to view shared organizational chats and create them if permitted by the admin.
3.  **Individual User (No specific org context):** Uses AI chat for personal productivity outside of any organization context. Benefits from general UX improvements and new features.

## 4. Detailed Requirements

### 4.1 Organization Integration

**REQ-ORG-1: Chat Context Association**

*   **REQ-ORG-1.1:** Users MUST be able to explicitly select the context (Personal or a specific accessible Organization) when initiating a *new* chat session.
    *   *Implementation Detail:* A UI element (e.g., a dropdown/selector integrated near the 'New Chat' button or initial prompt area) must allow this selection *before* the first message is sent.
*   **REQ-ORG-1.2:** The UI MUST clearly and persistently display the current context (Personal or specific Organization Name) associated with the *active* chat session.
    *   *Implementation Detail:* Display the context prominently within the main chat interface (e.g., near the chat title or header).
*   **REQ-ORG-1.3:** Default Context: When a user initiates a new chat, the context selector SHOULD default to 'Personal' unless an Organization context is actively selected in the application's global state (e.g., via the `OrganizationSwitcher`).

**REQ-ORG-2: Segregated Chat History**

*   **REQ-ORG-2.1:** The Chat History UI MUST present Personal chats and Organization chats in distinct, clearly labeled sections or views.
    *   *Implementation Detail:* Utilize Tabs, separate collapsible sections, or a similar clear visual separation within the chat history panel.
*   **REQ-ORG-2.2:** Chats listed under an Organization section MUST only display chats associated with the currently selected Organization context (as determined by the global `OrganizationSwitcher` or equivalent state).
*   **REQ-ORG-2.3:** Individual chat entries in the history list MUST have clear visual indicators of their context (e.g., an organization icon/name prefix for org chats, potentially a user icon for personal chats).
*   **REQ-ORG-2.4:** For users belonging to multiple organizations, the UI MUST provide a mechanism (e.g., filtering integrated with the `OrganizationSwitcher`) to easily view chats associated with a specific selected organization.

**REQ-RBAC-1: Role-Based Access Control (RBAC) & Permissions (V1 Scope)**

*   **REQ-RBAC-1.1:** Permissions for Organization Chats are determined by the user's role (`organization_members.role`) within that specific organization:
    *   **`admin` Role:** Can View *All* Chats associated with their Organization, Create *New* Org Chats, Delete *Any* Org Chat associated with their Organization, Manage Member Chat Creation Permissions (see REQ-ADMIN-1.2).
    *   **`member` Role:** Can View *All* Chats associated with their Organization, Create *New* Org Chats (*only if* enabled by an Admin via REQ-ADMIN-1.2).
    *   *(Note: Editing/Deleting specific messages within a chat is handled by REQ-UX-5 related to Rewind/Reprompt and applies based on message authorship, not org role).*
*   **REQ-RBAC-1.2:** Access to view or interact with an Organization Chat requires the user to have an `active` status in the `organization_members` table for the corresponding `organization_id`.
*   **REQ-RBAC-1.3:** Row-Level Security (RLS) policies MUST enforce these permissions at the database level for the `chats` table. Access control must primarily rely on backend enforcement via RLS.

**REQ-ADMIN-1: Admin Management Controls (V1 Scope)**

*   **REQ-ADMIN-1.1:** Users with the 'admin' role for an organization MUST have a UI mechanism to Delete any chat associated with that organization.
    *   *Implementation Detail:* This could be an option in the chat history list item context menu or within the chat interface itself for org chats. A confirmation dialog MUST be implemented.
*   **REQ-ADMIN-1.2:** Implement a mechanism within the Organization Settings UI allowing Admins to toggle (enable/disable) the ability for users with the 'member' role to create *new* chats associated with that organization.
    *   *Implementation Detail:* Requires a new boolean column in the `organizations` table (e.g., `allow_member_chat_creation`, defaulting to `true`) and corresponding UI controls in the org settings page.

**REQ-SHARED-1: Shared Org Chat Visibility (Asynchronous V1 Scope)**

*   **REQ-SHARED-1.1:** All active members of an organization MUST be able to view the complete message history of chats associated with that organization, consistent with their role permissions (REQ-RBAC-1.1). Viewing is asynchronous; real-time multi-user interaction within a single session is out of scope for V1.
    *   *Implementation Detail:* Selecting an org chat loads its current history. Updates made by others require a refresh or reload of the chat (manual or potentially via background polling/basic Supabase Realtime subscription triggers for invalidation).

### 4.2 Technical Implementation Requirements

**REQ-TECH-1: Database Schema Changes**

*   **REQ-TECH-1.1:** Add `organization_id UUID NULLABLE REFERENCES public.organizations(id) ON DELETE SET NULL` to the `public.chats` table. Add an index on `organization_id`.
*   **REQ-TECH-1.2:** Add `system_prompt_id UUID NULLABLE REFERENCES public.system_prompts(id) ON DELETE SET NULL` to the `public.chats` table. (Supports REQ-UX-1.5).
*   **REQ-TECH-1.3:** Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true` to the `public.organizations` table. (Supports REQ-ADMIN-1.2).
*   **REQ-TECH-1.4:** Potentially add columns/flags to `public.chat_messages` to support the Rewind/Reprompt feature (REQ-UX-5), such as `is_active_in_thread BOOLEAN NOT NULL DEFAULT true`. Needs confirmation during implementation design.

**REQ-TECH-2: Security (RLS)**

*   **REQ-TECH-2.1:** Implement/Update RLS policies on the `public.chats` table:
    *   `SELECT`: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if `public.is_org_member(organization_id, auth.uid(), 'active')`.
    *   `INSERT`: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if (`public.is_org_member(organization_id, auth.uid(), 'active')` AND (`public.get_user_role(auth.uid(), organization_id) = 'admin'` OR (`public.get_user_role(auth.uid(), organization_id) = 'member'` AND `(SELECT allow_member_chat_creation FROM public.organizations WHERE id = organization_id)`))). Requires helper functions `is_org_member` and `get_user_role`.
    *   `DELETE`: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if (`public.is_org_member(organization_id, auth.uid(), 'active')` AND `public.get_user_role(auth.uid(), organization_id) = 'admin'`).
    *   `UPDATE`: Define based on editable fields. If only `system_prompt_id` or chat title is editable, define rules based on ownership/admin role.
*   **REQ-TECH-2.2:** Review RLS on `public.chat_messages` to ensure access is implicitly granted only if the user has SELECT access to the parent `chat` record (via `chat_id`). Direct modification rules might be needed for Rewind/Reprompt.
*   **REQ-TECH-2.3:** Develop and implement automated tests (e.g., using pgTAP or equivalent) specifically validating the RLS policies for `chats` and `chat_messages` under various user/org/role scenarios.

**REQ-TECH-3: API Client (`@paynless/api`)**

*   **REQ-TECH-3.1:** Update relevant methods in `AiApiClient` (`packages/api/src/ai.api.ts`) - e.g., `sendMessage`, `getChats`, `getChatDetails`, `createChat`, `deleteChat` - to accept an optional `organizationId: string | null` parameter.
*   **REQ-TECH-3.2:** Update corresponding backend Edge Functions (e.g., `/chat`, `/chats`, `/chat/[chatId]`) to:
    *   Receive the optional `organizationId`.
    *   Filter database queries based on `organizationId` AND the authenticated `user_id`'s RLS-verified access.
    *   Handle `null` `organizationId` as requests for personal chats (`organization_id IS NULL AND user_id = auth.uid()`).
    *   Enforce permissions for actions like creation (checking `allow_member_chat_creation`) and deletion (checking admin role) via RLS implicitly, but potentially add explicit checks for clarity/error handling.

**REQ-TECH-4: State Management (`@paynless/store`)**

*   **REQ-TECH-4.1:** Refactor `useAiStore` (`packages/store/src/aiStore.ts`) state and actions:
    *   Modify state structure to effectively manage and cache chats based on context (personal vs. organization ID). Consider structures like `{ personalChats: Chat[], orgChats: { [orgId: string]: Chat[] } }`.
    *   Ensure state efficiently retrieves `currentOrganizationId` from `useOrganizationStore` when needed.
    *   Update actions (`sendMessage`, `loadChats`, `loadChatDetails`, `startNewChat`, `deleteChat`) to accept and utilize the `organizationId` context parameter, passing it to API calls.
    *   Update selectors (`selectChatHistoryList`, `selectCurrentChatMessages`) to return data relevant to the current context (Personal or the selected `currentOrganizationId`).
*   **REQ-TECH-4.2:** Refactor `useOrganizationStore` if it has become too large or complex, potentially splitting state/actions into more focused stores if necessary.
*   **REQ-TECH-4.3:** Update/Refactor tests for `useAiStore` and `useOrganizationStore` to reflect the changes, improve clarity, potentially reduce file size, and ensure correct handling of the organizational context.

**REQ-TECH-5: Frontend Integration (`apps/web`)**

*   **REQ-TECH-5.1:** Update relevant frontend components (`AiChat.tsx`, `ChatHistory.tsx`, etc.) to:
    *   Source the `currentOrganizationId` from `useOrganizationStore`.
    *   Pass the correct `organizationId` (or `null` for personal) to store actions and API client calls.
    *   Implement the UI for selecting chat context (REQ-ORG-1.1).
    *   Implement the UI for displaying chat context (REQ-ORG-1.2).
    *   Implement the UI for segregated chat history (REQ-ORG-2).
    *   Conditionally render UI elements (e.g., delete button for org chats) based on user role (`admin`/`member`) obtained via `useOrganizationStore`.
*   **REQ-TECH-5.2:** Ensure UI elements dynamically reflect the current org context and update correctly when the global organization context changes.

**REQ-TECH-6: Analytics (`@paynless/analytics`)**

*   **REQ-TECH-6.1:** Integrate analytics tracking for key user interactions related to the new features:
    *   Event: `new_chat_created` (Properties: `context: 'personal' | 'organization'`, `organizationId?: string`)
    *   Event: `chat_deleted` (Properties: `context: 'personal' | 'organization'`, `deletedByRole: 'owner' | 'admin'`)
    *   Event: `chat_context_selected` (Properties: `selectedContext: 'personal' | 'organization'`, `organizationId?: string`)
    *   Event: `chat_rewind_used` (Properties: `chatId: string`)
    *   Event: `token_usage_displayed` (Track impressions or interactions with token display elements)
    *   Event: `member_chat_creation_toggled` (Properties: `organizationId: string`, `enabled: boolean`)

### 4.3 Chat Experience Improvements

**REQ-UX-1: Core Behavior Fixes & Improvements**

*   **REQ-UX-1.1:** Ensure the main chat interface consistently loads with the correct default AI provider and system prompt selections pre-filled as per system configuration or user preferences.
*   **REQ-UX-1.2:** The chat history list MUST update automatically (without requiring a manual page refresh) to show newly created chats relevant to the current view (Personal or selected Org).
    *   *Implementation Detail:* Utilize store updates triggered by successful chat creation API calls, potentially augmented by Supabase Realtime subscriptions for cache invalidation if needed for robustness.
*   **REQ-UX-1.3:** Selecting a past chat from the history MUST reliably navigate the user to the main chat interface and load the selected chat's state (messages, context, associated system prompt).
*   **REQ-UX-1.4:** The chat message display area MUST automatically scroll smoothly to show the *top* of the latest message(s) upon submission of a user prompt or receipt of new AI response(s), ensuring the beginning of the new content is immediately visible.
*   **REQ-UX-1.5:** The system prompt selected/used at the *beginning* of a chat session MUST be saved and associated with that specific chat instance (see REQ-TECH-1.2). When loading a previous chat, the correct system prompt must be automatically restored and used for subsequent interactions in that chat.
*   **REQ-UX-1.6:** When selecting ("replaying") a chat from history, the associated system prompt (loaded from the chat data) MUST be correctly passed to the chat interface logic and subsequent API calls for that session.

**REQ-UX-2: UI Standardization & Quality**

*   **REQ-UX-2.1:** Refactor existing AI chat UI components (e.g., main interface, history list, message bubbles, input area) to utilize standard `shadcn/ui` library components where appropriate, ensuring visual consistency with the rest of the application.
*   **REQ-UX-2.2:** Implement loading skeletons (`shadcn/ui Skeleton`) for:
    *   Chat history list during initial load or context switch.
    *   Chat message display area during initial load of a chat.
    *   Potentially provider/prompt selection lists if applicable.
*   **REQ-UX-2.3:** Use appropriate loading indicators (e.g., spinners within buttons, disabled states) on controls during asynchronous operations like message submission, AI response generation, and chat deletion.
*   **REQ-UX-2.4:** Implement React Error Boundaries around the main chat interface component tree and the chat history list component to gracefully handle rendering errors and prevent catastrophic UI crashes, providing a fallback UI or error message.

**REQ-UX-3: Markdown Support**

*   **REQ-UX-3.1:** The user input area for chat prompts SHOULD allow users to type standard Markdown syntax.
*   **REQ-UX-3.2:** Displayed user messages *and* AI assistant messages in the chat history MUST render basic Markdown formatting appropriately (e.g., bold, italics, lists, code blocks, links).
    *   *Implementation Detail:* Use a suitable Markdown rendering library (e.g., `react-markdown`) for displaying message content. Ensure sanitization practices are followed. The raw text sent to the AI should be the plain Markdown text.

**REQ-UX-4: Token Usage Tracking & Display**

*   **REQ-UX-4.1:** Integrate a client-side tokenizer library (compatible with the primary AI models used, e.g., `tiktoken` for OpenAI models) to estimate the token count of the user's prompt *before* submission.
*   **REQ-UX-4.2:** Display this estimated token count near the prompt input area, updating dynamically as the user types.
*   **REQ-UX-4.3:** The backend (`/chat` Edge Function) MUST attempt to parse token usage information (e.g., `prompt_tokens`, `completion_tokens`) returned by the AI provider's API response.
*   **REQ-UX-4.4:** This token usage data MUST be saved alongside the corresponding `assistant` role `chat_messages` record, likely within its existing `metadata` or a dedicated `token_usage` JSONB column.
*   **REQ-UX-4.5:** The UI MUST display the actual token count (e.g., "Completion: N tokens") associated with each AI assistant message in the chat history view.
*   **REQ-UX-4.6:** The UI MUST track and display the cumulative token usage for the current, active chat session, categorized as User Prompt Tokens, Assistant Completion Tokens, and Total Tokens.
    *   *Implementation Detail:* Define a clear UI location for this cumulative display (e.g., a footer, a chat info panel). Calculation should occur client-side based on loaded message data.

**REQ-UX-5: Chat Rewind/Reprompt Functionality (V1 - Replace History)**

*   **REQ-UX-5.1:** Provide a UI mechanism allowing users to select a specific *previous user prompt* within the current chat session's history.
*   **REQ-UX-5.2:** Upon selection, populate the main chat input area with the content of the selected user prompt, allowing the user to edit it.
*   **REQ-UX-5.3:** Provide a clear "Resubmit" or equivalent action trigger.
*   **REQ-UX-5.4:** Upon resubmission:
    *   The API call (`sendMessage`) must include the history *up to and including* the edited prompt.
    *   The backend/database must handle this by effectively marking all subsequent messages in that chat thread as inactive or deleting them. *(Requires careful implementation, possibly using the `is_active_in_thread` flag from REQ-TECH-1.4 or managing message history arrays)*.
    *   New AI responses generated from the resubmitted prompt will form the new end of the active chat thread.
*   **REQ-UX-5.5:** Consider adding a subtle visual indicator in the chat history UI (e.g., an icon or separator line) to show where an edit/rewind point occurred.

**REQ-UX-6: File Handling (.md Upload/Download - Stretch Goal)**

*   **REQ-UX-6.1 (Stretch):** If primary goals are met, investigate and potentially implement functionality for users to upload a single `.md` (Markdown) file alongside their prompt.
    *   *Considerations:* Requires UI for file selection, secure upload mechanism (e.g., to Supabase Storage), associating the file with the message, potentially passing file content/link to the AI. Scope limited strictly to `.md` files.
*   **REQ-UX-6.2 (Stretch):** If primary goals are met, investigate and potentially implement functionality for users to download the current chat conversation history as a single `.md` file.
    *   *Considerations:* Requires client-side generation of the Markdown content from chat messages and a download trigger mechanism.

## 5. Non-Functional Requirements

*   **Usability:** The interface for selecting context, viewing history, and using new features must be intuitive.
*   **Performance:** Chat loading, message sending/receiving, history updates, and token estimation should feel responsive. No specific benchmarks defined for V1, but avoid introducing noticeable lag.
*   **Security:** RBAC for organization chats must be strictly enforced via backend RLS. UI should reflect permissions accurately but not be the sole gatekeeper.
*   **Maintainability:** Code must adhere to existing project structures, patterns (API Client Singleton, Store patterns), `DEV_PLAN.md` standards, and include appropriate documentation (TSDoc, component comments). Use TypeScript effectively.
*   **Extensibility:** Implementation should allow for future additions like more granular permissions, real-time collaboration features, and different export formats without requiring complete rewrites. Design components and state management with this in mind.

## 6. Assumptions

*   The Organizations feature (creating orgs, inviting members, roles) is functional and stable.
*   `useOrganizationStore` provides necessary data like current organization, user roles within organizations, and lists of organizations the user belongs to.
*   RLS helper functions (`is_org_member`, `get_user_role`) exist or will be created.
*   Users primarily interact with one organizational context at a time, managed via a global switcher.
*   The application is currently in beta; complex data migration strategies for existing chats are not a V1 priority.
*   Existing AI provider integrations are functional and return token usage information where available.

## 7. Out of Scope (for this Implementation Phase)

*   **Real-time Collaboration:** Multiple users concurrently editing/viewing the *same* chat session with live updates (typing indicators, instant message appearance) is explicitly out of scope. V1 is asynchronous viewing.
*   **Granular Chat Permissions:** Setting permissions on individual chats beyond the organization role is out of scope.
*   **Chat Ownership Switching:** Migrating an existing chat between Personal and Org contexts (or vice-versa) is out of scope.
*   **Advanced Audit Logging:** Detailed audit trails for chat actions beyond standard application logging are out of scope.
*   **Organization-Level Billing/Subscriptions:** Integration with billing based on org chat usage is out of scope. Existing user-based subscriptions apply.
*   **Advanced File Handling:** Support for file types other than `.md` (Stretch Goal), folder uploads, or AI processing of file content is out of scope.
*   **Advanced Chat Export:** Export formats other than `.md` (Stretch Goal), image generation, or complex section selection are out of scope.
*   **Real-time Markdown Preview:** Live preview rendering in the input box as the user types Markdown is out of scope.
*   **Mobile-Specific Optimizations:** Dedicated mobile UI/UX flows beyond basic responsive design are out of scope.
*   **Advanced Scalability/Performance Testing:** Formal load testing and architectural changes for very large organizations are out of scope.
*   **Organization-Facing Analytics Dashboard:** Dashboards for admins to view org chat usage statistics are out of scope.
*   **Cross-Browser/Device Testing:** Formal testing beyond primary development browsers is out of scope.
*   **User Acceptance Testing (UAT):** Formal UAT processes are out of scope for this phase.

## 8. Dependencies

*   Functional Supabase backend with Auth, Database (Postgres), Edge Functions, and potentially Storage/Realtime.
*   Existing Organizations feature implementation.
*   `@paynless/api` client library.
*   `@paynless/store` (Zustand) state management library, specifically `useOrganizationStore` and `useAiStore`.
*   `@paynless/analytics` client library.
*   `shadcn/ui` component library.
*   Client-side tokenization library (e.g., `tiktoken`).
*   Markdown rendering library (e.g., `react-markdown`).

## 9. Risks & Mitigation Strategies

| Risk                                    | Impact | Probability | Mitigation                                                                                                                               |
| :-------------------------------------- | :----- | :---------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| RLS Complexity Leads to Security Flaws  | High   | Medium      | Implement thorough RLS tests (REQ-TECH-2.3). Perform manual security reviews of RLS policies. Prioritize backend enforcement.                |
| State Management Refactor Introduces Bugs | Medium | Medium      | Write comprehensive unit/integration tests for store selectors and actions *before* refactoring. Refactor incrementally. Use TypeScript types strictly. |
| UI Changes Confuse Users                | Low    | Medium      | Provide clear visual cues for context switching and org chats. Ensure UI consistency. Use analytics to monitor feature adoption.             |
| Rewind/Reprompt Data Handling is Flawed | Medium | Medium      | Carefully design the data model/logic for marking messages inactive. Test edge cases thoroughly (rewinding multiple times, empty history). |
| Token Estimation Inaccuracy             | Low    | Medium      | Use a reliable library (`tiktoken`). Clearly label counts as estimates. Primarily rely on *actual* usage returned from the API.           |
| Scope Creep from Deferred Features      | Medium | Low         | Maintain a clear backlog of deferred items. Strictly adhere to the "Out of Scope" section for this phase.                                    |
| Performance Degradation in Chat History | Medium | Low         | Implement efficient state selectors. Consider virtualization for very long chat lists if initial implementation proves slow (future optimization). |

## 10. Glossary

*   **AI Chat:** The feature allowing users to interact with Large Language Models.
*   **Organization:** A tenant in the multi-tenancy system, grouping users.
*   **Context:** The scope of a chat session, either 'Personal' or associated with a specific 'Organization'.
*   **Chat History:** The list of past chat sessions accessible to the user.
*   **RBAC:** Role-Based Access Control. Permissions based on user roles (e.g., `admin`, `member`) within an organization.
*   **RLS:** Row-Level Security. Database feature restricting data access based on policies.
*   **Token:** Unit of text processing used by AI models for input/output measurement.
*   **System Prompt:** Initial instruction given to the AI model to set context or persona for a chat session.
*   **Rewind/Reprompt:** Feature allowing users to go back, edit a previous prompt, and restart the conversation from that point.
*   **shadcn/ui:** The component library used in the project.
*   **Store:** State management container (using Zustand).
*   **API Client:** Library (`@paynless/api`) for frontend-backend communication.

## 11. Success Metrics (V1 Focus)

*   **Feature Adoption:**
    *   % of active users creating at least one Organization chat within 30 days of launch.
    *   Frequency of use for the Rewind/Reprompt feature (measured by analytics event `chat_rewind_used`).
    *   Frequency of interaction with token usage display elements.
*   **Engagement:**
    *   Increase in the average number of chat messages sent per active user (compare pre/post launch).
    *   Increase in the number of unique chats created per active user.
*   **Quality & Reliability:**
    *   Reduction in user-reported bugs related to chat history loading, scrolling, and state persistence.
    *   Error rate monitoring (via Sentry/equivalent) for chat-related components and API endpoints.
*   **Admin Controls:**
    *   Adoption rate of the "Allow Member Chat Creation" setting by Organization Admins.

---

# Part 2: Implementation Plan & Checklist

This plan follows a Test-Driven Development (TDD) approach (Red-Green-Refactor) and respects the project's architecture (Backend ↔ API ↔ Store ↔ Frontend). Checkpoints are included for testing, refactoring, and committing work.

**Legend:**

*   **[DB]:** Database Schema Change (Migration)
*   **[BE]:** Backend Logic (Edge Function / RLS / Helpers)
*   **[API]:** API Client Library (`@paynless/api`)
*   **[STORE]:** State Management (`@paynless/store`)
*   **[UI]:** Frontend Component (`apps/web`)
*   **[TEST-UNIT]:** Unit Test Implementation/Update
*   **[TEST-INT]:** Integration Test Implementation/Update (API, Store-Component, RLS)
*   **[TEST-E2E]:** End-to-End Test (Optional for V1, focus on Manual Testing)
*   **[ANALYTICS]:** Analytics Integration (`@paynless/analytics`)
*   **[REFACTOR]:** Code Refactoring Step
*   **[COMMIT]:** Checkpoint for Git Commit

**Pre-computation / Setup:**

*   [ ] Ensure database migration tooling is set up (e.g., Supabase CLI migrations).
*   [ ] Ensure RLS helper functions (`is_org_member`, `get_user_role`) exist or create placeholders.
*   [ ] Ensure testing frameworks (Vitest, pgTAP/equivalent, potentially Playwright/Cypress later) are configured.
*   [ ] Create a feature branch in Git.

---

## Phase 1: Core Backend & Data Model for Org Context

**Goal:** Establish the database structure and basic backend logic to support organization-scoped chats.

**Step 1.1: Database Schema Changes for Org & System Prompt**

*   [DB] Create migration script:
    *   Add `organization_id UUID NULLABLE REFERENCES organizations(id) ON DELETE SET NULL` to `chats`.
    *   Add index on `chats(organization_id)`.
    *   Add `system_prompt_id UUID NULLABLE REFERENCES system_prompts(id) ON DELETE SET NULL` to `chats`.
    *   Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true` to `organizations`.
*   [ ] Apply migration locally.
*   [COMMIT] "feat(DB): Add organization_id, system_prompt_id to chats; allow_member_chat_creation to orgs"

**Step 1.2: Implement Basic RLS Policies & Tests**

*   [TEST-INT] Write failing RLS tests (using pgTAP or manual SQL queries) for `chats` SELECT:
    *   User CAN select own personal chat (`organization_id` IS NULL).
    *   User CANNOT select other user's personal chat.
    *   User CAN select org chat if active member.
    *   User CANNOT select org chat if not member.
    *   User CANNOT select org chat if inactive member.
*   [BE] Implement/Update RLS policy for `SELECT` on `public.chats` table based on REQ-TECH-2.1. Ensure `is_org_member` helper is used.
*   [TEST-INT] Run RLS tests for SELECT. Refactor policy until tests pass (Green).
*   [REFACTOR] Review RLS policy for clarity and efficiency.
*   [COMMIT] "feat(BE): Implement RLS SELECT policy for chats table w/ tests"
*   Repeat RLS Test/Implement/Refactor cycle for INSERT, DELETE, UPDATE policies on `chats` as defined in REQ-TECH-2.1, including checks for `allow_member_chat_creation` and admin role where applicable. Ensure helper functions are robust.
*   [COMMIT] "feat(BE): Implement RLS INSERT/DELETE/UPDATE policies for chats w/ tests"

**Step 1.3: Update Backend API Endpoints (Read Operations)**

*   [API] Modify relevant `AiApiClient` methods (e.g., `getChats`, `getChatDetails`) to accept optional `organizationId: string | null`.
*   [TEST-UNIT] Write failing unit tests for the updated `AiApiClient` methods, mocking API responses.
*   [API] Implement the changes in `AiApiClient`. Ensure tests pass.
*   [COMMIT] "feat(API): Add optional organizationId param to chat read methods"
*   [TEST-INT] Write failing integration tests for the backend Edge Functions (e.g., GET `/chats`, GET `/chat/[chatId]`) simulating requests with/without `organizationId` and different user contexts.
*   [BE] Modify Edge Functions:
    *   Accept optional `organizationId` query parameter/body field.
    *   Modify Supabase client calls (`select()`) to filter based on `organizationId` (using `.eq()` or `.is()`) AND rely on RLS for permission enforcement.
    *   Handle `null`/absent `organizationId` as request for personal chats (`organization_id IS NULL`).
*   [TEST-INT] Run Edge Function integration tests. Refactor backend logic until tests pass.
*   [REFACTOR] Review Edge Function code for clarity and error handling.
*   [COMMIT] "feat(BE): Update chat read Edge Functions to handle organizationId context"

**Step 1.4: Update Backend API Endpoints (Write Operations - Create/Delete)**

*   [API] Modify relevant `AiApiClient` methods (e.g., `createChat`, `deleteChat`) to accept optional `organizationId`.
*   [TEST-UNIT] Write failing unit tests for these API client methods.
*   [API] Implement changes in `AiApiClient`. Ensure tests pass.
*   [COMMIT] "feat(API): Add optional organizationId param to chat write methods"
*   [TEST-INT] Write failing integration tests for backend Edge Functions (e.g., POST `/chats`, DELETE `/chat/[chatId]`) simulating requests with/without `organizationId` and different user roles.
*   [BE] Modify Edge Functions:
    *   Accept optional `organizationId`.
    *   Pass `organization_id` to Supabase client calls (`insert()`, `delete()`). RLS should handle the core permission logic (including `allow_member_chat_creation` check on insert, admin role check on delete).
    *   Return appropriate success/error responses.
*   [TEST-INT] Run Edge Function integration tests. Refactor until tests pass.
*   [COMMIT] "feat(BE): Update chat write Edge Functions to handle organizationId context"

---

## Phase 2: State Management & Core UI Integration

**Goal:** Connect the frontend state and UI components to the organization context.

**Step 2.1: Refactor State Management (`useAiStore`)**

*   [TEST-UNIT] Review existing `useAiStore` tests. Write *new* failing tests for desired state structure and selector behavior with org context (e.g., `selectChatHistoryList` should return different lists based on `currentOrganizationId`).
*   [STORE] Refactor `useAiStore` state structure (REQ-TECH-4.1). Update actions (`loadChats`, `startNewChat`, etc.) to accept `organizationId` and fetch/update state accordingly. Update selectors to be context-aware.
*   [TEST-UNIT] Run `useAiStore` tests. Refactor store logic until tests pass.
*   [REFACTOR] Ensure state updates are efficient and selectors are memoized where appropriate. Break down large actions/reducers if needed.
*   [COMMIT] "refactor(STORE): Restructure useAiStore for organizational context w/ tests"
*   *(Optional but Recommended)* [STORE] [REFACTOR] If `useOrganizationStore` is overly complex, refactor it now into smaller, more focused stores/slices. Update associated tests.
*   [COMMIT] "refactor(STORE): Refactor useOrganizationStore for clarity (if applicable)"

**Step 2.2: Implement Chat Context Selection UI**

*   [TEST-UNIT] Write failing tests for a new reusable component (`ChatContextSelector`?) that takes org list and current selection, and calls back on change.
*   [UI] Create the `ChatContextSelector` component using `shadcn/ui` (e.g., `Select`). Fetch available organizations (user is member of) from `useOrganizationStore`. Display "Personal" and organization names. Manage selected state.
*   [TEST-UNIT] Ensure component tests pass.
*   [COMMIT] "feat(UI): Create ChatContextSelector component w/ tests"
*   [UI] Integrate `ChatContextSelector` near the "New Chat" initiation point. When a context is selected *before* starting a chat, pass this context (`organizationId` or `null`) to the `startNewChat` action in `useAiStore`.
*   [TEST-INT] Write integration tests (or manual tests) verifying that selecting a context correctly influences the `organization_id` of the newly created chat record in the DB.
*   [COMMIT] "feat(UI): Integrate ChatContextSelector for new chat creation"

**Step 2.3: Implement Segregated Chat History UI**

*   [UI] Modify the `ChatHistory` component:
    *   Fetch `currentOrganizationId` from `useOrganizationStore`.
    *   Call the context-aware `selectChatHistoryList` selector from `useAiStore`, passing the current context.
    *   Implement UI for distinct sections (Personal vs. Org) using Tabs or similar (`REQ-ORG-2.1`).
    *   Add visual indicators (icons/prefixes) to list items (`REQ-ORG-2.3`).
    *   Ensure the list updates when the global `currentOrganizationId` changes.
*   [TEST-UNIT] Update/write unit tests for `ChatHistory` verifying correct rendering based on context and state from mock stores.
*   [UI] Implement loading skeletons (`REQ-UX-2.2`) for the history list.
*   [UI] Implement Error Boundary (`REQ-UX-2.4`) around the history list.
*   [TEST-INT] Manual testing: Verify history list updates correctly when switching orgs, creating new chats in different contexts.
*   [COMMIT] "feat(UI): Implement segregated chat history view with context awareness, loading, and errors"

**Step 2.4: Display Active Chat Context & Handle Navigation**

*   [UI] Modify the main `AiChat` component:
    *   Fetch the details of the currently loaded chat, including its `organization_id` and `system_prompt_id` from `useAiStore`.
    *   Display the chat's context (Personal or Org Name) prominently (`REQ-ORG-1.2`).
    *   Ensure selecting a chat from history correctly loads its state, including messages and context display (`REQ-UX-1.3`).
    *   Pass the correct `system_prompt_id` to relevant child components or API calls (`REQ-UX-1.5`, `REQ-UX-1.6`).
*   [TEST-UNIT] Update/write tests for `AiChat` verifying context display and correct data propagation.
*   [UI] Implement loading skeletons for the message area (`REQ-UX-2.2`).
*   [UI] Implement Error Boundary around the main chat interface (`REQ-UX-2.4`).
*   [TEST-INT] Manual testing: Verify navigation between personal/org chats works, context display is correct, system prompts load correctly.
*   [COMMIT] "feat(UI): Display active chat context, ensure correct state loading on navigation w/ loading & errors"

**Step 2.5: Implement Admin Controls UI**

*   [UI] In `ChatHistory` list items for *organization* chats:
    *   Conditionally render a "Delete" button/menu item *only if* the current user has the 'admin' role for the `currentOrganizationId` (check `useOrganizationStore`).
    *   On click, show a confirmation dialog. On confirm, call `deleteChat` action from `useAiStore`, passing the correct `chatId` and `organizationId`.
*   [TEST-UNIT] Add tests for conditional rendering of the delete button based on mock role.
*   [ANALYTICS] Trigger `chat_deleted` event on successful deletion.
*   [UI] Modify the Organization Settings page:
    *   Add a `Switch` or Checkbox component (using `shadcn/ui`) bound to the `allow_member_chat_creation` setting for the current organization. Fetch the current value.
    *   On change, call a new API endpoint/Edge Function (e.g., PUT `/organization/[orgId]/settings`) to update the `allow_member_chat_creation` column in the `organizations` table. (Requires new API client method, Edge Function, and potentially RLS update allowing admins to modify their org settings).
*   [TEST-UNIT] Add tests for the settings toggle component.
*   [TEST-INT] Write integration tests for the new org settings update endpoint.
*   [ANALYTICS] Trigger `member_chat_creation_toggled` event on successful update.
*   [COMMIT] "feat(UI): Implement admin delete chat UI and member chat creation toggle setting"

---

## Phase 3: Core Chat Experience Enhancements

**Goal:** Implement key UX improvements identified in the requirements.

**Step 3.1: Fix Core Chat Behaviors**

*   [UI] Ensure default provider/prompt loading works (`REQ-UX-1.1`). Add tests if missing.
*   [UI] Implement reliable auto-scrolling to the *top* of new messages (`REQ-UX-1.4`). Test thoroughly with different message heights and speeds. Add tests if feasible.
*   [UI] Ensure chat history list updates dynamically on creation (`REQ-UX-1.2`). Add tests.
*   [COMMIT] "fix(UI): Correct default loading, auto-scroll behavior, and dynamic history updates w/ tests"

**Step 3.2: Implement Markdown Rendering**

*   [UI] Integrate `react-markdown` or similar library into the message display component.
*   [TEST-UNIT] Add tests verifying that message content with various Markdown syntax renders correctly.
*   [UI] Ensure proper sanitization is used to prevent XSS vulnerabilities.
*   [COMMIT] "feat(UI): Implement Markdown rendering for chat messages w/ tests"

**Step 3.3: Implement Token Usage Tracking & Display**

*   [ ] Install `tiktoken` or chosen tokenizer library.
*   [UI] Create a hook or utility (`useTokenEstimator`?) that takes text input and returns an estimated token count using the tokenizer.
*   [TEST-UNIT] Write unit tests for the token estimation logic.
*   [UI] Integrate the estimator with the chat input component, displaying the count (`REQ-UX-4.2`).
*   [BE] Ensure backend Edge Function (`/chat` - message sending) parses `prompt_tokens` and `completion_tokens` from the AI provider response.
*   [DB] Ensure token usage is saved to the `chat_messages` table (e.g., in `metadata` or `token_usage` column) (`REQ-UX-4.4`). Modify migration if needed.
*   [API] [STORE] [UI] Ensure token usage data is passed back to the frontend and stored in `useAiStore`.
*   [UI] Display token count per assistant message (`REQ-UX-4.5`).
*   [UI] Implement cumulative token tracking display for the session (`REQ-UX-4.6`). Create a component for this.
*   [TEST-UNIT] Add tests for the cumulative display component based on mock message data.
*   [ANALYTICS] Add `token_usage_displayed` event trigger.
*   [COMMIT] "feat(UX): Implement token estimation and usage display w/ tests & analytics"

**Step 3.4: Implement Chat Rewind/Reprompt (V1 - Replace)**

*   [DB] If needed, create migration to add `is_active_in_thread` flag to `chat_messages` (`REQ-TECH-1.4`).
*   [UI] Add UI element (e.g., button on user messages) to trigger rewind mode (`REQ-UX-5.1`).
*   [UI] On trigger, populate input with selected message content (`REQ-UX-5.2`). Change submit button text/action to "Resubmit" (`REQ-UX-5.3`).
*   [API] Modify `AiApiClient.sendMessage` to potentially accept a `rewindFromMessageId` parameter or similar indicator.
*   [BE] Modify `/chat` Edge Function:
    *   If handling a rewind request:
        *   Identify the target message.
        *   Mark all subsequent messages in the chat thread as inactive (e.g., set `is_active_in_thread = false`). This requires careful DB update logic.
        *   Construct the prompt history *only up to the edited message*.
        *   Call the AI provider.
        *   Save the new assistant response(s) as active messages.
*   [TEST-INT] Write integration tests for the rewind backend logic, verifying correct message inactivation and history reconstruction.
*   [STORE] Update `useAiStore` state and actions to handle the message updates/replacements correctly when a rewind occurs. Ensure selectors return only active messages.
*   [UI] Add visual indicator for rewind point if desired (`REQ-UX-5.5`).
*   [ANALYTICS] Add `chat_rewind_used` event trigger.
*   [TEST-INT] Perform thorough manual testing of the rewind flow, including edge cases.
*   [COMMIT] "feat(FEATURE): Implement chat rewind/reprompt (replace history) w/ tests & analytics"

---

## Phase 4: Standardization, Cleanup & Testing

**Goal:** Ensure code quality, consistency, and finalize testing.

**Step 4.1: UI Standardization (`shadcn/ui`)**

*   [UI] [REFACTOR] Review all components modified or created during this project. Ensure consistent use of `shadcn/ui` components, spacing, and theming (`REQ-UX-2.1`).
*   [COMMIT] "style(UI): Ensure consistent shadcn/ui usage across chat features"

**Step 4.2: Final Code Review & Refactor**

*   [REFACTOR] Review all new/modified code (BE, API, STORE, UI) for clarity, efficiency, adherence to standards, and proper TypeScript usage. Address any TODOs or temporary workarounds.
*   [TEST-UNIT] [TEST-INT] Ensure test coverage is adequate for critical paths. Improve tests where needed.
*   [COMMIT] "refactor: Final code cleanup and improvements for chat enhancements"

**Step 4.3: Final Manual Testing**

*   [TEST-E2E] Perform comprehensive manual testing of all features end-to-end:
    *   Creating personal chats.
    *   Creating org chats (as admin, as member if allowed/disallowed).
    *   Switching org context and viewing correct history.
    *   Admin deleting org chats.
    *   Admin toggling member creation permission.
    *   Core behaviors (scrolling, prompt loading).
    *   Markdown rendering.
    *   Token display (estimation, actual, cumulative).
    *   Rewind/Reprompt functionality.
    *   Error handling (Error Boundaries, network errors).
    *   Loading states.
*   [ ] Fix any bugs discovered during testing.
*   [COMMIT] "fix: Address bugs found during final manual testing"

---

## Phase 5: Stretch Goals (Optional - If Time Permits)

**Goal:** Implement `.md` file handling if core scope is complete and stable.

**Step 5.1: .md Chat Export**

*   [UI] Add an "Export as MD" button to the chat interface.
*   [UI] Implement client-side logic to format the current (active) chat messages into a Markdown string.
*   [UI] Trigger file download of the generated Markdown content.
*   [TEST-UNIT] Add tests for the Markdown generation utility.
*   [COMMIT] "feat(STRETCH): Implement chat export to Markdown file"

**Step 5.2: .md File Upload**

*   *(Requires significant backend setup for storage)*
*   [BE] Set up Supabase Storage bucket for chat uploads with appropriate security rules (users can upload to a specific path, read own files).
*   [UI] Add a file input button (restricted to `.md`) to the chat input area.
*   [UI] On file selection, upload the file securely to Supabase Storage using the client library.
*   [API] [BE] Modify `sendMessage` endpoint/logic to potentially accept a `fileUrl` or `fileMetadata` parameter.
*   [UI] Display an indicator that a file is attached to the prompt.
*   *(Consideration: How is the file content used? Passed to AI? Just stored? V1 scope likely just storage)*
*   [COMMIT] "feat(STRETCH): Implement basic .md file upload associated with chat messages (requires storage setup)"

---

## Post-Implementation

*   [ ] Merge feature branch into the main development branch.
*   [ ] Deploy changes to staging/production environments.
*   [ ] Monitor analytics and error tracking dashboards.
*   [ ] Create backlog items for deferred features ("Out of Scope" section).
*   [ ] Announce changes to users/beta testers. 