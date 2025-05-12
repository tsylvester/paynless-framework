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

## Phase 0: Project Setup & Planning

### STEP-0.1: Project Initialization [🚧]

#### STEP-0.1.1: Create Feature Branch [COMMIT]
* [ ] Create a new branch from `main` named `feature/ai-chat-org-integration`
* [ ] Push the branch to the remote repository
* [ ] Create a draft pull request with initial description outlining the feature scope

#### STEP-0.1.2: Update Package Dependencies [COMMIT]
* [ ] Update `package.json` to include any necessary new dependencies:
  * [ ] Add tokenizer library (e.g., `tiktoken`) for token estimation
  * [ ] Verify Markdown rendering library (e.g., `react-markdown`) is installed or add it
* [ ] Run `pnpm install` to update dependencies
* [ ] Verify the project builds correctly after dependency updates

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

## Phase 1: Database & Backend Foundation

### STEP-1.1: Database Schema Updates [DB] [🚧]

#### STEP-1.1.1: Create Migration Script for Organization Integration [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file (filename format, up/down scripts)
* [ ] Create migration script to add `organization_id` column to `chats` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_organization_id_to_chats.sql`
  * [ ] Add `organization_id UUID NULLABLE REFERENCES public.organizations(id) ON DELETE SET NULL`
  * [ ] Add index on `(organization_id, updated_at)` for efficient filtering
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(DB): Add organization_id to chats table"

#### STEP-1.1.2: Create Migration Script for System Prompt Integration [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `system_prompt_id` column to `chats` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_system_prompt_id_to_chats.sql`
  * [ ] Add `system_prompt_id UUID NULLABLE REFERENCES public.system_prompts(id) ON DELETE SET NULL`
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(DB): Add system_prompt_id to chats table"

#### STEP-1.1.3: Create Migration Script for Member Chat Creation Toggle [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `allow_member_chat_creation` column to `organizations` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_allow_member_chat_creation_to_organizations.sql`
  * [ ] Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true`
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(DB): Add allow_member_chat_creation to organizations table"

#### STEP-1.1.4: Create Migration Script for Chat Rewind/Reprompt Support [TEST-UNIT] [COMMIT]
* [ ] Create a unit test that verifies the structure of the migration file
* [ ] Create migration script to add `is_active_in_thread` column to `chat_messages` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_add_is_active_flag_to_chat_messages.sql`
  * [ ] Add `is_active_in_thread BOOLEAN NOT NULL DEFAULT true`
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the migration file structure
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(DB): Add is_active_in_thread to chat_messages table"

### STEP-1.2: Database Helper Functions [BE] [🚧]

#### STEP-1.2.1: Create or Update Helper Function for Checking Organization Membership [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the `is_org_member` helper function
* [ ] Create or update the `is_org_member` function in a migration script:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_create_or_update_is_org_member_function.sql`
  * [ ] Function signature: `is_org_member(org_id UUID, user_id UUID, status TEXT DEFAULT 'active', role TEXT DEFAULT NULL)`
  * [ ] Implementation: Query `organization_members` to check if the user has the specified status and role (if provided) in the organization
  * [ ] Return type: `BOOLEAN`
* [ ] Run the unit test to verify the function behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(BE): Create/update is_org_member helper function"

#### STEP-1.2.2: Create or Update Helper Function for Getting User Role [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the `get_user_role` helper function
* [ ] Create or update the `get_user_role` function in a migration script:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_create_or_update_get_user_role_function.sql`
  * [ ] Function signature: `get_user_role(user_id UUID, org_id UUID)`
  * [ ] Implementation: Query `organization_members` to get the user's role in the organization
  * [ ] Return type: `TEXT` (will be 'admin', 'member', or NULL if not a member)
* [ ] Run the unit test to verify the function behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Commit changes with message "feat(BE): Create/update get_user_role helper function"

### STEP-1.3: Row-Level Security (RLS) Implementation [RLS] [🚧]

#### STEP-1.3.1: Implement RLS Policy for SELECT Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the SELECT RLS policy
* [ ] Create migration script to add/modify RLS policy for `chats` table SELECT operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_select_rls_policy.sql`
  * [ ] Policy: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if `is_org_member(organization_id, auth.uid(), 'active')` is true
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the policy behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Test the policy by attempting to SELECT:
  * [ ] User's own personal chats (should succeed)
  * [ ] Another user's personal chats (should fail)
  * [ ] Chats in organizations where the user is an active member (should succeed)
  * [ ] Chats in organizations where the user is not a member (should fail)
* [ ] Commit changes with message "feat(RLS): Implement chat table SELECT policy for organization context"

#### STEP-1.3.2: Implement RLS Policy for INSERT Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the INSERT RLS policy
* [ ] Create migration script to add/modify RLS policy for `chats` table INSERT operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_insert_rls_policy.sql`
  * [ ] Policy: Allow if:
    * [ ] `organization_id` IS NULL AND `user_id` = `auth.uid()` (personal chat), OR
    * [ ] `is_org_member(organization_id, auth.uid(), 'active')` is true AND:
      * [ ] `get_user_role(auth.uid(), organization_id) = 'admin'` OR
      * [ ] `get_user_role(auth.uid(), organization_id) = 'member'` AND `(SELECT allow_member_chat_creation FROM public.organizations WHERE id = organization_id)` is true
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the policy behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Test the policy by attempting to INSERT:
  * [ ] Personal chat (should succeed)
  * [ ] Organization chat as admin (should succeed)
  * [ ] Organization chat as member with `allow_member_chat_creation` true (should succeed)
  * [ ] Organization chat as member with `allow_member_chat_creation` false (should fail)
* [ ] Commit changes with message "feat(RLS): Implement chat table INSERT policy for organization context"

#### STEP-1.3.3: Implement RLS Policy for UPDATE Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the UPDATE RLS policy
* [ ] Create migration script to add/modify RLS policy for `chats` table UPDATE operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_update_rls_policy.sql`
  * [ ] Policy: Allow if:
    * [ ] `organization_id` IS NULL AND `user_id` = `auth.uid()` (personal chat), OR
    * [ ] `is_org_member(organization_id, auth.uid(), 'active')` is true AND `get_user_role(auth.uid(), organization_id) = 'admin'`
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the policy behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Test the policy by attempting to UPDATE:
  * [ ] Personal chat (should succeed)
  * [ ] Organization chat as admin (should succeed)
  * [ ] Organization chat as member (should fail)
* [ ] Commit changes with message "feat(RLS): Implement chat table UPDATE policy for organization context"

#### STEP-1.3.4: Implement RLS Policy for DELETE Operations on Chats [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the DELETE RLS policy
* [ ] Create migration script to add/modify RLS policy for `chats` table DELETE operations:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chats_delete_rls_policy.sql`
  * [ ] Policy: Allow if:
    * [ ] `organization_id` IS NULL AND `user_id` = `auth.uid()` (personal chat), OR
    * [ ] `is_org_member(organization_id, auth.uid(), 'active')` is true AND `get_user_role(auth.uid(), organization_id) = 'admin'`
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the policy behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Test the policy by attempting to DELETE:
  * [ ] Personal chat (should succeed)
  * [ ] Organization chat as admin (should succeed)
  * [ ] Organization chat as member (should fail)
* [ ] Commit changes with message "feat(RLS): Implement chat table DELETE policy for organization context"

#### STEP-1.3.5: Review RLS on Chat Messages [TEST-UNIT] [COMMIT]
* [ ] Create a unit test for the chat_messages RLS policies
* [ ] Create migration script to update RLS policies for `chat_messages` table:
  * File: `supabase/migrations/YYYYMMDDHHMMSS_update_chat_messages_rls_policies.sql`
  * [ ] Modify policies to ensure they correctly inherit access permissions from the parent `chats` record (via `chat_id`)
  * [ ] Update SELECT policy to follow the same rules as the `chats` table SELECT policy
  * [ ] Update INSERT policy to follow the same rules as the `chats` table SELECT policy (if user can view the chat, they can add messages)
  * [ ] For DELETE and UPDATE operations, add special handling for the rewind/reprompt feature (users should be able to modify/delete their own messages)
  * [ ] Include down migration script to reverse changes
* [ ] Run the unit test to verify the policy behavior
* [ ] Apply migration using `supabase migration up`
* [ ] Test the policies with various scenarios
* [ ] Commit changes with message "feat(RLS): Update chat_messages RLS policies for organization context and rewind feature"

---

## Phase 2: API Client Integration

### STEP-2.1: Update Types for Organization Integration [🚧]

#### STEP-2.1.1: Update Chat-Related Types in @paynless/types [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for updated types
* [ ] Update `ai.types.ts` in `packages/types/src/`:
  * [ ] Modify `Chat` interface to include `organization_id?: string | null`
  * [ ] Modify `Chat` interface to include `system_prompt_id?: string | null`
  * [ ] Update `ChatApiRequest` interface to include `organization_id?: string | null`
  * [ ] Update `ChatApiRequest` interface to include `system_prompt_id?: string | null`
  * [ ] Update `ChatApiRequest` interface to include `rewindFromMessageId?: string | null` (for rewind feature)
  * [ ] Add any additional types needed for token tracking (e.g., `TokenUsage`, `TokenEstimation`)
* [ ] Run unit tests to verify type completeness
* [ ] Commit changes with message "feat(TYPES): Update Chat-related types for organization integration"

#### STEP-2.1.2: Add Types for Organization Chat Settings [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for new types
* [ ] Update `organizations.types.ts` in `packages/types/src/`:
  * [ ] Add `OrganizationSettings` interface including `allow_member_chat_creation: boolean`
  * [ ] Update `Organization` interface to include `allow_member_chat_creation: boolean`
* [ ] Run unit tests to verify type completeness
* [ ] Commit changes with message "feat(TYPES): Add types for organization chat settings"

### STEP-2.2: Update AI API Client [API] [🚧]

#### STEP-2.2.1: Modify sendMessage Method [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `sendMessage` method
* [ ] Update `packages/api/src/ai.api.ts`:
  * [ ] Modify `sendMessage` method signature to accept `organizationId?: string | null` parameter
  * [ ] Update the request payload construction to include `organization_id` when provided
  * [ ] Add support for `rewindFromMessageId` parameter (for rewind feature)
  * [ ] Update the method to include `system_prompt_id` in the request when provided
* [ ] Run unit tests to verify method behaves correctly
* [ ] Commit changes with message "feat(API): Update sendMessage method to support organization context and rewind feature"

#### STEP-2.2.2: Modify getChatHistory Method [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `getChatHistory` method
* [ ] Update `packages/api/src/ai.api.ts`:
  * [ ] Modify `getChatHistory` method signature to accept `organizationId?: string | null` parameter
  * [ ] Update the request payload or URL construction to include `organization_id` when provided
* [ ] Run unit tests to verify method behaves correctly
* [ ] Commit changes with message "feat(API): Update getChatHistory method to support organization context"

#### STEP-2.2.3: Modify getChatMessages Method [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `getChatMessages` method
* [ ] Update `packages/api/src/ai.api.ts`:
  * [ ] Modify `getChatMessages` method signature to accept `organizationId?: string | null` parameter
  * [ ] Update the request payload or URL construction to include `organization_id` when provided
* [ ] Run unit tests to verify method behaves correctly
* [ ] Commit changes with message "feat(API): Update getChatMessages method to support organization context"

#### STEP-2.2.4: Modify createChat Method [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `createChat` method (if it exists, or create it)
* [ ] Update or add `createChat` method in `packages/api/src/ai.api.ts`:
  * [ ] Method signature should include `organizationId?: string | null` parameter
  * [ ] Method signature should include `systemPromptId?: string | null` parameter
  * [ ] Ensure the request payload includes these parameters when provided
* [ ] Run unit tests to verify method behaves correctly
* [ ] Commit changes with message "feat(API): Update createChat method to support organization context and system prompt"

#### STEP-2.2.5: Modify deleteChat Method [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `deleteChat` method (if it exists, or create it)
* [ ] Update or add `deleteChat` method in `packages/api/src/ai.api.ts`:
  * [ ] Method signature should include `organizationId?: string | null` parameter
  * [ ] Ensure the request payload or URL construction includes `organization_id` when provided
* [ ] Run unit tests to verify method behaves correctly
* [ ] Commit changes with message "feat(API): Update deleteChat method to support organization context"

#### STEP-2.2.6: Add Token Usage Methods [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the new token usage methods
* [ ] Add token usage related methods to `packages/api/src/ai.api.ts`:
  * [ ] Add `estimateTokens(text: string): Promise<number>` method for client-side token estimation
  * [ ] Ensure `sendMessage` method correctly parses and returns token usage information from the API response
* [ ] Run unit tests to verify methods behave correctly
* [ ] Commit changes with message "feat(API): Add token usage estimation and tracking methods"

### STEP-2.3: Update Organization API Client [API] [🚧]

#### STEP-2.3.1: Add Organization Settings Management Methods [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the new/updated organization settings methods
* [ ] Update `packages/api/src/organizations.api.ts`:
  * [ ] Add or update method to get organization settings: `getOrganizationSettings(orgId: string): Promise<ApiResponse<OrganizationSettings>>`
  * [ ] Add or update method to update organization settings: `updateOrganizationSettings(orgId: string, settings: Partial<OrganizationSettings>): Promise<ApiResponse<OrganizationSettings>>`
* [ ] Run unit tests to verify methods behave correctly
* [ ] Commit changes with message "feat(API): Add organization settings management methods"

### STEP-2.4: Update Edge Functions for Organization Context [BE] [🚧]

#### STEP-2.4.1: Update Chat Edge Function [TEST-INT] [COMMIT]
* [ ] Create integration tests for the updated `/chat` edge function
* [ ] Update `supabase/functions/chat/index.ts`:
  * [ ] Modify the function to accept `organization_id` in the request body
  * [ ] Update database queries to include `organization_id` when provided
  * [ ] Add support for `system_prompt_id` persistence
  * [ ] Add support for `rewindFromMessageId` for the rewind feature
  * [ ] Implement token usage tracking and include in the response
  * [ ] Add handling for marking messages as inactive when rewinding a chat
* [ ] Run integration tests to verify the function behaves correctly
* [ ] Commit changes with message "feat(BE): Update chat edge function for organization context and additional features"

#### STEP-2.4.2: Update Chat History Edge Function [TEST-INT] [COMMIT]
* [ ] Create integration tests for the updated `/chat-history` edge function
* [ ] Update `supabase/functions/chat-history/index.ts`:
  * [ ] Modify the function to accept `organization_id` as a query parameter
  * [ ] Update database queries to filter by `organization_id` when provided
  * [ ] Ensure efficient query structure using indexes
* [ ] Run integration tests to verify the function behaves correctly
* [ ] Commit changes with message "feat(BE): Update chat-history edge function for organization context"

#### STEP-2.4.3: Update Chat Details Edge Function [TEST-INT] [COMMIT]
* [ ] Create integration tests for the updated `/chat-details` edge function
* [ ] Update `supabase/functions/chat-details/index.ts`:
  * [ ] Modify the function to accept `organization_id` as a query parameter
  * [ ] Update database queries to include `organization_id` when validating access
  * [ ] Update queries to only return active messages (`is_active_in_thread = true`) for the rewind feature
* [ ] Run integration tests to verify the function behaves correctly
* [ ] Commit changes with message "feat(BE): Update chat-details edge function for organization context and rewind feature"

#### STEP-2.4.4: Create or Update Delete Chat Edge Function [TEST-INT] [COMMIT]
* [ ] Create integration tests for the delete chat edge function
* [ ] Create or update the delete chat edge function:
  * File: `supabase/functions/delete-chat/index.ts` (or update existing endpoint)
  * [ ] Implement function to delete a chat
  * [ ] Include handling for `organization_id` to validate access
  * [ ] Rely on RLS policies for actual access control
* [ ] Run integration tests to verify the function behaves correctly
* [ ] Commit changes with message "feat(BE): Create/update delete-chat edge function for organization context"

#### STEP-2.4.5: Create or Update Organization Settings Edge Function [TEST-INT] [COMMIT]
* [ ] Create integration tests for the organization settings edge function
* [ ] Create or update the organization settings edge function:
  * File: `supabase/functions/organizations/settings/index.ts` (or update existing endpoint)
  * [ ] Implement function to get and update organization settings
  * [ ] Include handling for `allow_member_chat_creation` toggle
  * [ ] Ensure only organization admins can update settings
* [ ] Run integration tests to verify the function behaves correctly
* [ ] Commit changes with message "feat(BE): Create/update organization settings edge function"

---

## Phase 3: State Management

### STEP-3.1: Update AI Store [STORE] [🚧]

#### STEP-3.1.1: Refactor AI Store State Structure [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated state structure
* [ ] Update `packages/store/src/aiStore.ts`:
  * [ ] Modify the state interface to support organization context
  * [ ] Update state structure to manage chats by organization:
    ```typescript
    interface AiState {
      // Existing properties
      personalChats: Chat[];
      organizationChats: { [organizationId: string]: Chat[] };
      currentOrganizationId: string | null;
      // ... other properties
    }
    ```
  * [ ] Include new properties for token tracking
* [ ] Run unit tests to verify state structure is complete
* [ ] Commit changes with message "refactor(STORE): Update AI store state structure for organization context"

#### STEP-3.1.2: Update AI Store Selectors [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated selectors
* [ ] Update `packages/store/src/aiStore.ts`:
  * [ ] Refactor `selectChatHistoryList` to filter by current organization context
  * [ ] Add `selectCurrentOrganizationChats` selector
  * [ ] Update `selectCurrentChatMessages` to handle the rewind feature (only return active messages)
  * [ ] Add selectors for token usage tracking
* [ ] Run unit tests to verify selectors behave correctly
* [ ] Commit changes with message "feat(STORE): Update AI store selectors for organization context"

#### STEP-3.1.3: Update sendMessage Action [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `sendMessage` action
* [ ] Update `packages/store/src/aiStore.ts`:
  * [ ] Modify `sendMessage` action to include `organizationId` parameter
  * [ ] Update the action to handle token tracking
  * [ ] Add support for the rewind feature
* [ ] Run unit tests to verify the action behaves correctly
* [ ] Commit changes with message "feat(STORE): Update sendMessage action for organization context and additional features"

#### STEP-3.1.4: Update loadChatHistory Action [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `loadChatHistory` action
* [ ] Update `packages/store/src/aiStore.ts`:
  * [ ] Modify `loadChatHistory` action to accept `organizationId` parameter
  * [ ] Update the action to store chats in the appropriate state section based on context
* [ ] Run unit tests to verify the action behaves correctly
* [ ] Commit changes with message "feat(STORE): Update loadChatHistory action for organization context"

#### STEP-3.1.5: Update loadChatDetails Action [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `loadChatDetails` action
* [ ] Update `packages/store/src/aiStore.ts`:
  * [ ] Modify `loadChatDetails` action to accept `organizationId` parameter
  * [ ] Update the action to handle the rewind feature (only display active messages)
* [ ] Run unit tests to verify the action behaves correctly
* [ ] Commit changes with message "feat(STORE): Update loadChatDetails action for organization context and rewind feature"

#### STEP-3.1.6: Update startNewChat Action [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated `startNewChat` action
* [ ] Update `packages/store/src/aiStore.ts`:
  * [ ] Modify `startNewChat` action to accept `organizationId` and `systemPromptId` parameters
  * [ ] Update the action to create a chat in the appropriate context
* [ ] Run unit tests to verify the action behaves correctly
* [ ] Commit changes with message "feat(STORE): Update startNewChat action for organization context and system prompt"

#### STEP-3.1.7: Add or Update deleteChat Action [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the `deleteChat` action
* [ ] Add or update `deleteChat` action in `packages/store/src/aiStore.ts`:
  * [ ] Method signature should include `chatId: string` and `organizationId?: string | null` parameters
  * [ ] Implementation should call the API client's deleteChat method
  * [ ] Update state to remove the deleted chat from the appropriate section
* [ ] Run unit tests to verify the action behaves correctly
* [ ] Commit changes with message "feat(STORE): Add/update deleteChat action for organization context"

#### STEP-3.1.8: Add Token Tracking Actions [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the token tracking actions
* [ ] Add token tracking actions to `packages/store/src/aiStore.ts`:
  * [ ] Add `estimateTokens(text: string): number` action for client-side token estimation
  * [ ] Add `trackTokenUsage(messageId: string, usageData: TokenUsage): void` action to update token usage for a message
  * [ ] Add `calculateSessionTokens(): { user: number, assistant: number, total: number }` for tracking cumulative token usage
* [ ] Run unit tests to verify actions behave correctly
* [ ] Commit changes with message "feat(STORE): Add token tracking actions to AI store"

### STEP-3.2: Integrate with Organization Store [STORE] [🚧]

#### STEP-3.2.1: Add Organization Chat Management to Organization Store [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the organization chat management functionality
* [ ] Update `packages/store/src/organizationStore.ts`:
  * [ ] Add `allowMemberChatCreation` to organization state
  * [ ] Add selector to check if the current user can create organization chats: `selectCanCreateOrganizationChats()`
  * [ ] Add actions to get and update organization chat settings
* [ ] Run unit tests to verify functionality
* [ ] Commit changes with message "feat(STORE): Add organization chat management to organization store"

#### STEP-3.2.2: Create Integration Between AI Store and Organization Store [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the store integration
* [ ] Update `packages/store/src/aiStore.ts` and `packages/store/src/organizationStore.ts`:
  * [ ] Add method in `useAiStore` to sync with organization context: `syncWithOrganizationContext()`
  * [ ] Ensure `currentOrganizationId` in `useAiStore` stays in sync with `useOrganizationStore` 
  * [ ] Add subscription to organization context changes in `useAiStore` initialization
* [ ] Run unit tests to verify integration
* [ ] Commit changes with message "feat(STORE): Create integration between AI store and organization store"

#### STEP-3.2.3: Add Analytics Integration for Store Actions [ANALYTICS] [COMMIT]
* [ ] Add analytics tracking to `packages/store/src/aiStore.ts`:
  * [ ] Track `chat_context_selected` event when context changes
  * [ ] Track `organization_chat_created` event when an organization chat is created
  * [ ] Track `organization_chat_viewed` event when an organization chat is viewed
  * [ ] Track `organization_chat_deleted` event when an organization chat is deleted
  * [ ] Track `chat_rewind_used` event when a user rewinds a chat
  * [ ] Track `token_usage_viewed` event when token usage information is viewed
* [ ] Add analytics tracking to `packages/store/src/organizationStore.ts`:
  * [ ] Track `member_chat_creation_toggled` event when the setting is changed
* [ ] Commit changes with message "feat(ANALYTICS): Add analytics tracking for AI chat organization features"

---

## Phase 4: UI Components

### STEP-4.1: Create Context Selection Component [UI] [🚧]

#### STEP-4.1.1: Create ChatContextSelector Component [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the `ChatContextSelector` component
* [ ] Create new component file `apps/web/src/components/ai/ChatContextSelector.tsx`:
  * [ ] Implement a dropdown or toggle component using shadcn/ui
  * [ ] Allow selecting between "Personal" and available organizations
  * [ ] Connect to `useOrganizationStore` to get the list of user's organizations
  * [ ] Connect to `useAiStore` to get/set the current chat context
  * [ ] Ensure proper styling and accessibility
* [ ] Run unit tests to verify the component behavior
* [ ] Commit changes with message "feat(UI): Create ChatContextSelector component"

#### STEP-4.1.2: Integrate ChatContextSelector with Chat Interface [TEST-INT] [COMMIT]
* [ ] Create integration tests for the context selector in the chat interface
* [ ] Update `apps/web/src/pages/AiChat.tsx` (or relevant chat page component):
  * [ ] Add `ChatContextSelector` to the chat interface
  * [ ] Position it prominently to make context selection clear to users
  * [ ] Ensure it updates the AI store context when changed
  * [ ] Add analytics tracking for context selection
* [ ] Run integration tests to verify the integration
* [ ] Commit changes with message "feat(UI): Integrate ChatContextSelector with chat interface"

### STEP-4.2: Update Chat History Component [UI] [🚧]

#### STEP-4.2.1: Implement Segregated Chat History [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the updated chat history component
* [ ] Update `apps/web/src/components/ai/ChatHistory.tsx` (or relevant component):
  * [ ] Modify to display personal and organization chats in separate sections
  * [ ] Add clear visual indicators for chat ownership
  * [ ] Connect to updated `useAiStore` selectors to filter chats by context
  * [ ] Ensure proper styling and accessibility
* [ ] Run unit tests to verify the component behavior
* [ ] Commit changes with message "feat(UI): Implement segregated chat history display"

#### STEP-4.2.2: Add Context-Specific Actions to Chat History Items [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for context-specific chat history actions
* [ ] Update `apps/web/src/components/ai/ChatHistoryItem.tsx` (or relevant component):
  * [ ] Add delete button for organization chats (visible only to admins)
  * [ ] Implement confirmation dialog for deletion
  * [ ] Connect to `useAiStore.deleteChat` action
  * [ ] Add analytics tracking for chat deletion
* [ ] Run unit tests to verify the component behavior
* [ ] Commit changes with message "feat(UI): Add context-specific actions to chat history items"

#### STEP-4.2.3: Add Loading States to Chat History [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for chat history loading states
* [ ] Update `apps/web/src/components/ai/ChatHistory.tsx`:
  * [ ] Add loading skeletons using shadcn/ui Skeleton component
  * [ ] Display skeletons during initial load or context switch
  * [ ] Implement error state handling
* [ ] Run unit tests to verify loading behavior
* [ ] Commit changes with message "feat(UI): Add loading states to chat history component"

### STEP-4.3: Update Chat Interface [UI] [🚧]

#### STEP-4.3.1: Display Active Chat Context [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the chat context display
* [ ] Update `apps/web/src/pages/AiChat.tsx` (or relevant component):
  * [ ] Add a prominent indicator showing the current chat context (Personal or Organization name)
  * [ ] Style appropriately to make the context clear to users
  * [ ] Ensure it updates when the context changes
* [ ] Run unit tests to verify the display behavior
* [ ] Commit changes with message "feat(UI): Display active chat context in chat interface"

#### STEP-4.3.2: Implement System Prompt Persistence [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for system prompt persistence
* [ ] Update `apps/web/src/components/ai/SystemPromptSelector.tsx` (or relevant component):
  * [ ] Modify to load the saved system prompt when loading a chat
  * [ ] Connect to the updated AI store to save the system prompt with new chats
  * [ ] Ensure prompt is correctly passed to the API
* [ ] Run unit tests to verify the prompt persistence
* [ ] Commit changes with message "feat(UI): Implement system prompt persistence"

#### STEP-4.3.3: Fix Chat Scrolling Behavior [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the scrolling behavior
* [ ] Update `apps/web/src/components/ai/ChatMessages.tsx` (or relevant component):
  * [ ] Modify auto-scroll logic to scroll to the top of new messages
  * [ ] Implement smooth scrolling for better user experience
  * [ ] Add tests to verify scrolling behavior
* [ ] Run unit tests to verify the scrolling behavior
* [ ] Commit changes with message "fix(UI): Improve chat scrolling behavior for new messages"

#### STEP-4.3.4: Add Error Boundary to Chat Interface [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the error boundary
* [ ] Create new component `apps/web/src/components/common/ErrorBoundary.tsx`:
  * [ ] Implement a React Error Boundary component
  * [ ] Create a user-friendly fallback UI
  * [ ] Add logging for errors
* [ ] Wrap chat interface components with the error boundary
* [ ] Run unit tests to verify error handling
* [ ] Commit changes with message "feat(UI): Add error boundary to chat interface"

### STEP-4.4: Implement Markdown Support [UI] [🚧]

#### STEP-4.4.1: Create Markdown Renderer Component [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the markdown renderer
* [ ] Create new component `apps/web/src/components/common/MarkdownRenderer.tsx`:
  * [ ] Integrate react-markdown or similar library
  * [ ] Configure markdown options (allowed tags, styling, etc.)
  * [ ] Implement proper sanitization to prevent XSS
  * [ ] Add syntax highlighting for code blocks
* [ ] Run unit tests to verify rendering behavior
* [ ] Commit changes with message "feat(UI): Create markdown renderer component"

#### STEP-4.4.2: Integrate Markdown with Chat Messages [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for markdown in chat messages
* [ ] Update `apps/web/src/components/ai/ChatMessage.tsx` (or relevant component):
  * [ ] Replace plain text display with the MarkdownRenderer component
  * [ ] Ensure styling is consistent with the overall design
  * [ ] Test with various markdown content
* [ ] Run unit tests to verify integration
* [ ] Commit changes with message "feat(UI): Integrate markdown rendering in chat messages"

### STEP-4.5: Implement Token Tracking UI [UI] [🚧]

#### STEP-4.5.1: Create Token Estimator Component [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the token estimator
* [ ] Create new component `apps/web/src/components/ai/TokenEstimator.tsx`:
  * [ ] Connect to the token estimation function in AI store
  * [ ] Display estimated token count for user input
  * [ ] Update in real-time as the user types
  * [ ] Add appropriate styling
* [ ] Run unit tests to verify estimation
* [ ] Commit changes with message "feat(UI): Create token estimator component"

#### STEP-4.5.2: Add Token Usage Display to Messages [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the token usage display
* [ ] Update `apps/web/src/components/ai/ChatMessage.tsx` (or relevant component):
  * [ ] Add token usage display to AI assistant messages
  * [ ] Style appropriately to be informative but not intrusive
* [ ] Run unit tests to verify display
* [ ] Commit changes with message "feat(UI): Add token usage display to chat messages"

#### STEP-4.5.3: Create Session Token Usage Summary [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the session token summary
* [ ] Create new component `apps/web/src/components/ai/TokenUsageSummary.tsx`:
  * [ ] Connect to the token tracking functions in AI store
  * [ ] Display cumulative token usage (user, assistant, total)
  * [ ] Update in real-time as conversation progresses
  * [ ] Add appropriate styling
* [ ] Run unit tests to verify summary calculation
* [ ] Commit changes with message "feat(UI): Create session token usage summary component"

#### STEP-4.5.4: Integrate Token UI Components [TEST-INT] [COMMIT]
* [ ] Create integration tests for the token UI components
* [ ] Update `apps/web/src/pages/AiChat.tsx` (or relevant component):
  * [ ] Add TokenEstimator near the chat input
  * [ ] Add TokenUsageSummary to the chat interface
  * [ ] Ensure components update correctly during chat
  * [ ] Add analytics tracking for token usage views
* [ ] Run integration tests to verify all token components
* [ ] Commit changes with message "feat(UI): Integrate token tracking UI components"

### STEP-4.6: Implement Chat Rewind/Reprompt [UI] [🚧]

#### STEP-4.6.1: Create Message Edit Controls [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for message edit controls
* [ ] Update `apps/web/src/components/ai/ChatMessage.tsx` (or relevant component):
  * [ ] Add edit button to user messages
  * [ ] Implement click handler to trigger rewind mode
  * [ ] Style appropriately to indicate editable messages
* [ ] Run unit tests to verify controls
* [ ] Commit changes with message "feat(UI): Create message edit controls for rewind feature"

#### STEP-4.6.2: Implement Rewind Mode in Chat Interface [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the rewind mode
* [ ] Update `apps/web/src/pages/AiChat.tsx` and relevant components:
  * [ ] Add state to track rewind mode and the message being edited
  * [ ] Modify input area to show edited message content
  * [ ] Change submit button text to "Resubmit" in rewind mode
  * [ ] Add visual indicator for messages that will be discarded on resubmit
  * [ ] Add analytics tracking for rewind usage
* [ ] Run unit tests to verify rewind mode behavior
* [ ] Commit changes with message "feat(UI): Implement rewind mode in chat interface"

#### STEP-4.6.3: Connect Rewind Feature to AI Store [TEST-INT] [COMMIT]
* [ ] Create integration tests for the full rewind feature
* [ ] Update relevant components to connect to AI store:
  * [ ] Connect edit button to store action to enter rewind mode
  * [ ] Connect resubmit button to the updated sendMessage action with rewind parameters
  * [ ] Ensure messages are correctly marked as inactive after rewind
  * [ ] Verify that new messages appear correctly after resubmission
* [ ] Run integration tests to verify the complete rewind flow
* [ ] Commit changes with message "feat(INT): Connect rewind feature to AI store"

### STEP-4.7: Implement Admin Controls [UI] [🚧]

#### STEP-4.7.1: Create Organization Chat Settings Component [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the organization chat settings component
* [ ] Create new component `apps/web/src/components/organizations/OrganizationChatSettings.tsx`:
  * [ ] Add toggle for `allow_member_chat_creation` setting
  * [ ] Connect to organization store to get/update settings
  * [ ] Add appropriate styling and user feedback
  * [ ] Add analytics tracking for settings changes
* [ ] Run unit tests to verify component behavior
* [ ] Commit changes with message "feat(UI): Create organization chat settings component"

#### STEP-4.7.2: Integrate Chat Settings into Organization Settings Page [TEST-INT] [COMMIT]
* [ ] Create integration tests for the chat settings in organization settings
* [ ] Update `apps/web/src/pages/OrganizationSettingsPage.tsx` (or relevant component):
  * [ ] Add the OrganizationChatSettings component to the settings page
  * [ ] Ensure it's only visible to organization admins
  * [ ] Add appropriate section heading and description
* [ ] Run integration tests to verify integration
* [ ] Commit changes with message "feat(UI): Integrate chat settings into organization settings page"

---

## Phase 5: Bug Fixes and Optimizations

### STEP-5.1: Fix Core Chat Behavior Issues [🚧]

#### STEP-5.1.1: Fix Homepage Default Choices [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the fixed behavior
* [ ] Identify and fix the issue with homepage default choices:
  * [ ] Locate the component or store action responsible for loading defaults
  * [ ] Debug the issue and implement a fix
  * [ ] Ensure defaults are reliably loaded on initial render
* [ ] Run unit tests to verify the fix
* [ ] Commit changes with message "fix(UI): Ensure homepage default choices load correctly"

#### STEP-5.1.2: Fix Dynamic Chat History Updates [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the fixed behavior
* [ ] Fix the issue with dynamic chat history updates:
  * [ ] Update the AI store to properly trigger updates when new chats are created
  * [ ] Ensure the chat history list component subscribes to these updates
  * [ ] Verify updates occur without requiring page refresh
* [ ] Run unit tests to verify the fix
* [ ] Commit changes with message "fix(UI): Ensure chat history updates dynamically"

#### STEP-5.1.3: Fix Auto-Navigation on Replay [TEST-UNIT] [COMMIT]
* [ ] Create unit tests for the fixed behavior
* [ ] Fix the issue with auto-navigation during chat replay:
  * [ ] Identify the component or action causing incorrect navigation
  * [ ] Update to ensure reliable navigation when selecting a chat from history
  * [ ] Test with various chat states and contexts
* [ ] Run unit tests to verify the fix
* [ ] Commit changes with message "fix(UI): Ensure reliable navigation during chat replay"

### STEP-5.2: Component Optimizations [🚧]

#### STEP-5.2.1: Optimize State Updates [REFACTOR] [COMMIT]
* [ ] Profile the application to identify performance bottlenecks
* [ ] Optimize state updates in the AI store:
  * [ ] Use memoization for complex selectors
  * [ ] Minimize unnecessary re-renders
  * [ ] Use batched updates where appropriate
* [ ] Run performance tests to verify improvements
* [ ] Commit changes with message "perf(STORE): Optimize AI store state updates"

#### STEP-5.2.2: Add Loading State Optimizations [REFACTOR] [COMMIT]
* [ ] Implement optimistic UI updates where appropriate:
  * [ ] Show placeholder content during loading
  * [ ] Pre-render based on expected data shape
  * [ ] Add smooth transitions between states
* [ ] Run performance tests to verify perceived performance improvements
* [ ] Commit changes with message "perf(UI): Add loading state optimizations for better UX"

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

### STEP-6.2: User Experience Refinement [🚧]

#### STEP-6.2.1: Add User Onboarding for New Features [UI] [COMMIT]
* [ ] Create onboarding components for new features:
  * [ ] Create tooltip or popover explaining organization chat context
  * [ ] Add educational UI for token tracking features
  * [ ] Create brief explanation of chat rewind functionality
* [ ] Implement logic to show onboarding only to users who haven't seen it
* [ ] Add analytics tracking for onboarding interaction
* [ ] Commit changes with message "feat(UI): Add user onboarding for new chat features"

#### STEP-6.2.2: Refine UI Based on Testing [UI] [COMMIT]
* [ ] Conduct internal user testing
* [ ] Collect feedback on the new features
* [ ] Implement UI refinements based on feedback:
  * [ ] Improve clarity of context selection
  * [ ] Enhance visual indicators for chat ownership
  * [ ] Refine token tracking displays
* [ ] Commit changes with message "refactor(UI): Refine UI based on user testing feedback"

### STEP-6.3: Performance Testing [🚧]

#### STEP-6.3.1: Conduct Load Testing [TEST-INT]
* [ ] Set up load testing scenarios:
  * [ ] Test with large numbers of chats
  * [ ] Test with long conversation histories
  * [ ] Test with multiple users accessing the same organization chats
* [ ] Identify and address any performance bottlenecks
* [ ] Optimize database queries and indexing if needed

#### STEP-6.3.2: Optimize for Performance [REFACTOR] [COMMIT]
* [ ] Implement performance optimizations based on testing:
  * [ ] Add pagination for chat history if needed
  * [ ] Optimize database queries
  * [ ] Implement virtual scrolling for long conversations if needed
* [ ] Commit changes with message "perf: Optimize chat performance based on load testing"

---

## Phase 7: Stretch Goals (If Time Permits)

### STEP-7.1: Markdown File Handling [🚧]

#### STEP-7.1.1: Implement Markdown Export [UI] [COMMIT]
* [ ] Create unit tests for markdown export functionality
* [ ] Create new component `apps/web/src/components/ai/ChatExport.tsx`:
  * [ ] Add export button to chat interface
  * [ ] Implement function to convert chat history to markdown
  * [ ] Create file download mechanism
  * [ ] Add analytics tracking for exports
* [ ] Run unit tests to verify export functionality
* [ ] Commit changes with message "feat(UI): Implement markdown export of chat history"

#### STEP-7.1.2: Implement Markdown Upload [UI] [COMMIT]
* [ ] Create unit tests for markdown upload functionality
* [ ] Create new component `apps/web/src/components/ai/FileUpload.tsx`:
  * [ ] Add file upload button to chat interface
  * [ ] Implement file validation (.md only)
  * [ ] Process uploaded file and add to chat input
  * [ ] Add analytics tracking for uploads
* [ ] Run unit tests to verify upload functionality
* [ ] Commit changes with message "feat(UI): Implement markdown file upload"

---

## Phase 8: Documentation & Deployment

### STEP-8.1: Create Documentation [🚧]

#### STEP-8.1.1: Update API Documentation [COMMIT]
* [ ] Update API documentation for all modified endpoints:
  * [ ] Document new parameters
  * [ ] Update request/response examples
  * [ ] Add notes about organization context
* [ ] Commit changes with message "docs: Update API documentation for organization chat features"

#### STEP-8.1.2: Create User Guide [COMMIT]
* [ ] Create user documentation for new features:
  * [ ] Organization chat integration
  * [ ] Token tracking
  * [ ] Markdown support
  * [ ] Chat rewind/reprompt
* [ ] Include screenshots and usage examples
* [ ] Commit changes with message "docs: Create user guide for new chat features"

#### STEP-8.1.3: Update Internal Development Documentation [COMMIT]
* [ ] Update development documentation:
  * [ ] Document new state management patterns
  * [ ] Update component interaction diagrams
  * [ ] Document RLS policies and access control logic
* [ ] Commit changes with message "docs: Update internal development documentation"

### STEP-8.2: Prepare for Deployment [🚧]

#### STEP-8.2.1: Create Database Migration Guide [COMMIT]
* [ ] Create a guide for running the database migrations:
  * [ ] List all migration scripts
  * [ ] Document the order in which they should be run
  * [ ] Include any manual steps needed
* [ ] Commit changes with message "docs: Create database migration guide"

#### STEP-8.2.2: Create Deployment Checklist [COMMIT]
* [ ] Create a deployment checklist:
  * [ ] Pre-deployment verification steps
  * [ ] Database migration steps
  * [ ] Frontend deployment steps
  * [ ] Post-deployment verification steps
* [ ] Commit changes with message "docs: Create deployment checklist"

### STEP-8.3: Final Review & Deployment [🚧]

#### STEP-8.3.1: Conduct Code Review
* [ ] Complete comprehensive code review of all changes
* [ ] Address any issues identified during review
* [ ] Ensure all tests are passing

#### STEP-8.3.2: Merge and Deploy
* [ ] Complete the pull request
* [ ] Merge the feature branch to main
* [ ] Follow the deployment checklist to deploy changes
* [ ] Monitor application for issues after deployment

---

## Phase 9: Post-Implementation

### STEP-9.1: Monitoring & Support [🚧]

#### STEP-9.1.1: Monitor Application Performance
* [ ] Set up monitoring for new features:
  * [ ] Track usage patterns
  * [ ] Monitor error rates
  * [ ] Track performance metrics

#### STEP-9.1.2: Collect User Feedback
* [ ] Implement feedback collection:
  * [ ] Add feedback mechanism in the UI
  * [ ] Collect and categorize feedback
  * [ ] Prioritize issues for future fixes

### STEP-9.2: Future Work Planning [🚧]

#### STEP-9.2.1: Document Deferred Features
* [ ] Create tickets for deferred features:
  * [ ] Switching chat ownership (personal ↔ organization)
  * [ ] Granular chat-level permissions
  * [ ] Real-time multi-user collaboration
  * [ ] Advanced file handling
  * [ ] Chat branching
  * [ ] Organization-level analytics

#### STEP-9.2.2: Create Roadmap for Future Enhancements
* [ ] Create a roadmap document:
  * [ ] Prioritize deferred features
  * [ ] Estimate effort for each feature
  * [ ] Define success criteria for future work
