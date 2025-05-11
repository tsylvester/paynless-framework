# Phase 4: Full-Stack Token Tracking & Budget Auditing

**Overall Goal:** Implement a comprehensive system to track token usage for AI interactions, compare it against user/organization budgets, display this information appropriately in the UI, and enforce budget limits on the backend.

**Legend:**
*   **[DB]:** Database
*   **[RLS]:** Row-Level Security
*   **[BE]:** Backend Logic (Edge Function / Helpers)
*   **[TYPES]:** Shared Types (`@paynless/types`)
*   **[API]:** API Client (`@paynless/api`)
*   **[STORE]:** State Management (`@paynless/store`)
*   **[UI]:** Frontend Component/Hook (`apps/web`)
*   **[TEST-UNIT]:** Unit Test
*   **[TEST-INT]:** Integration Test
*   **[REFACTOR]:** Refactoring
*   **[COMMIT]:** Git Commit Point

---

## Phase 4.1: Backend - Core Token Accounting & Budget Foundation

**Goal:** Establish the backend infrastructure to store, aggregate, and serve token usage and budget information.

### 4.1.1: [DB] Database Schema for Token Accounting & Budgets
*   [ ] **4.1.1.1: [TYPES] Define Core Token & Budget Types**
    *   [ ] In `packages/types/src/billing.types.ts` (or a new `token.types.ts`):
        *   [ ] Define `TokenUsageRecord`: `{ id, userId, organizationId, usagePeriodStart, usagePeriodEnd, tokensConsumed, createdAt, updatedAt }`
        *   [ ] Define `TokenBudget`: `{ id, userId, organizationId, budgetPeriodStart, budgetPeriodEnd, totalTokensAllocated, createdAt, updatedAt }`
        *   [ ] Define `TokenUsageSummary`: `{ tokensConsumedThisPeriod, totalTokensAllocatedThisPeriod, remainingTokens, periodStartDate, periodEndDate, contextType: 'user' | 'organization' }`
*   [ ] **4.1.1.2: [DB] Create `token_usage_periods` Table Migration**
    *   [ ] `supabase/migrations/YYYYMMDDHHMMSS_create_token_usage_periods.sql`:
        *   Columns: `id (PK, UUID, default gen_random_uuid())`, `user_id (FK to users.id, NULLABLE)`, `organization_id (FK to organizations.id, NULLABLE)`, `usage_period_start (TIMESTAMPTZ, NOT NULL)`, `usage_period_end (TIMESTAMPTZ, NOT NULL)`, `tokens_consumed (BIGINT, NOT NULL, DEFAULT 0)`, `created_at (TIMESTAMPTZ, default now())`, `updated_at (TIMESTAMPTZ, default now())`.
        *   Constraint: `CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)` (ensure it's linked to one or the other).
        *   Indexes: `(user_id, usage_period_start, usage_period_end)`, `(organization_id, usage_period_start, usage_period_end)`.
*   [ ] **4.1.1.3: [DB] Create `token_budgets` Table Migration (if not part of an existing subscription system)**
    *   [ ] `supabase/migrations/YYYYMMDDHHMMSS_create_token_budgets.sql`:
        *   Columns: `id (PK, UUID, default gen_random_uuid())`, `user_id (FK to users.id, NULLABLE)`, `organization_id (FK to organizations.id, NULLABLE)`, `budget_period_start (TIMESTAMPTZ, NOT NULL)`, `budget_period_end (TIMESTAMPTZ, NOT NULL)`, `total_tokens_allocated (BIGINT, NOT NULL, DEFAULT 0)`, `subscription_plan_id (FK to subscription_plans.id, NULLABLE)`, `created_at (TIMESTAMPTZ, default now())`, `updated_at (TIMESTAMPTZ, default now())`.
        *   Constraint: `CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)`.
        *   Indexes: `(user_id, budget_period_start, budget_period_end)`, `(organization_id, budget_period_start, budget_period_end)`.
*   [ ] **4.1.1.4: [DB] Apply Migrations & Verify**
    *   [ ] Run `supabase migration up`. Manually verify tables in Supabase Studio.
*   [ ] **4.1.1.5: [COMMIT]** "feat(DB): Add tables for token usage periods and budgets"

### 4.1.2: [BE] Backend Logic for Recording Token Consumption
*   [ ] **4.1.2.1: [BE] [TEST-UNIT] Define `recordTokenUsage` Service/Helper**
    *   [ ] In `supabase/functions/_shared/services/tokenService.ts` (new file):
        *   Interface: `ITokenService { recordUsage(dbClient: SupabaseClient, userId: string, organizationId: string | null, tokensUsed: number, messageTimestamp: Date): Promise<void>; }`
        *   Test cases for `TokenService.recordUsage` in `tokenService.test.ts`:
            *   Correctly identifies/creates current usage period for user.
            *   Correctly identifies/creates current usage period for organization.
            *   Increments `tokens_consumed` in `token_usage_periods`.
            *   Handles new period creation if none exists for the `messageTimestamp`.
    *   [ ] Write failing unit tests (RED).
*   [ ] **4.1.2.2: [BE] Implement `TokenService.recordUsage`**
    *   Logic:
        1.  Determine if `userId` or `organizationId` is primary.
        2.  Find active `token_usage_periods` record for the context and `messageTimestamp`.
        3.  If exists, `UPDATE ... SET tokens_consumed = tokens_consumed + tokensUsed`.
        4.  If not exists, `INSERT` a new record (derive `usagePeriodStart/End` based on billing cycle logic - e.g., calendar month).
*   [ ] **4.1.2.3: [BE] [TEST-UNIT] Run `TokenService` Tests (GREEN), Refactor.**
*   [ ] **4.1.2.4: [BE] Integrate `recordUsage` into Chat Message Creation Flow**
    *   [ ] In `supabase/functions/chat/index.ts` (or wherever new messages are processed and AI response is received):
        *   After successfully getting AI response and its `token_usage` data:
            *   Instantiate/inject `TokenService`.
            *   Call `tokenService.recordUsage(supabaseClient, userId, organizationId, parsedTokenUsage.total_tokens, new Date())`.
    *   [ ] **[TEST-INT]** Update integration tests for `POST /chat` endpoint in `supabase/functions/chat/test/chat.integration.test.ts`:
        *   Verify `token_usage_periods` table is updated correctly after a new message with tokens.
        *   Test for personal chats and organization chats.
*   [ ] **4.1.2.5: [BE] Modify `chat_messages` table to store token usage details**
    *   [ ] This was noted as `token_usage JSONB NULLABLE` in `1-Core-Backend-and-Data-Model.md (STEP-1.1.5)`. Ensure the `chat` Edge Function populates this field accurately from the AI provider's response (e.g., `{ "prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z }`).
    *   [ ] **[TYPES]** Define `ChatMessageTokenUsage` type in `packages/types/src/ai.types.ts` if not already clear (e.g., `{ promptTokens: number; completionTokens: number; totalTokens: number; }`).
*   [ ] **4.1.2.6: [COMMIT]** "feat(BE): Implement backend service for recording token consumption"

### 4.1.3: [BE] Backend Logic for Retrieving Token Usage & Budget Summaries
*   [ ] **4.1.3.1: [BE] [TEST-UNIT] Define `getTokenUsageSummary` Service/Helper**
    *   [ ] In `supabase/functions/_shared/services/tokenService.ts`:
        *   Interface: `ITokenService { ... getUsageSummary(dbClient: SupabaseClient, userId: string, organizationId: string | null, forDate: Date): Promise<TokenUsageSummary | null>; }`
        *   Test cases for `TokenService.getUsageSummary` in `tokenService.test.ts`:
            *   Returns correct summary for a user (tokens consumed, allocated, remaining for current period).
            *   Returns correct summary for an organization.
            *   Handles cases with no usage or no budget found.
            *   Correctly identifies current period based on `forDate`.
    *   [ ] Write failing unit tests (RED).
*   [ ] **4.1.3.2: [BE] Implement `TokenService.getUsageSummary`**
    *   Logic:
        1.  Fetch current `token_usage_periods` for the context and `forDate`.
        2.  Fetch current `token_budgets` for the context and `forDate`.
        3.  Calculate remaining tokens and compile `TokenUsageSummary`.
*   [ ] **4.1.3.3: [BE] [TEST-UNIT] Run `TokenService` Tests (GREEN), Refactor.**
*   [ ] **4.1.3.4: [BE] Create New Edge Function `GET /token-summary`**
    *   [ ] `supabase/functions/token-summary/index.ts`:
        *   Accepts optional `organizationId` query parameter.
        *   Authenticates user.
        *   Uses `TokenService.getUsageSummary` to fetch data.
        *   Returns `TokenUsageSummary`.
    *   [ ] **[RLS]** Ensure RLS on `token_usage_periods` and `token_budgets` allows users to read their own/their org's data.
        *   Policy for `token_usage_periods`: `auth.uid() = user_id OR organization_id IN (SELECT org_id FROM organization_members WHERE member_id = auth.uid())`
        *   Policy for `token_budgets`: Similar to above. Apply to `token_budgets` table.
*   [ ] **4.1.3.5: [TEST-INT] Write Integration Tests for `GET /token-summary`**
    *   [ ] `supabase/functions/token-summary/test/token-summary.integration.test.ts`:
        *   Test personal summary.
        *   Test organization summary (as member/admin).
        *   Test unauthorized access.
*   [ ] **4.1.3.6: [COMMIT]** "feat(BE): Implement backend service and endpoint for token usage summaries"

### 4.1.4: [BE] Backend Logic for Enforcing Token Budgets
*   [ ] **4.1.4.1: [BE] [TEST-UNIT] Enhance `TokenService` with Budget Check**
    *   [ ] In `supabase/functions/_shared/services/tokenService.ts`:
        *   Interface: `ITokenService { ... canConsumeTokens(dbClient: SupabaseClient, userId: string, organizationId: string | null, tokensToConsume: number, forDate: Date): Promise<boolean>; }`
        *   Test cases for `TokenService.canConsumeTokens` in `tokenService.test.ts`:
            *   Returns `true` if (current usage + `tokensToConsume`) <= budget.
            *   Returns `false` if budget would be exceeded.
            *   Handles cases with no budget (e.g., free tier allows consumption, or blocks if no budget means no access - define this behavior).
    *   [ ] Write failing unit tests (RED).
*   [ ] **4.1.4.2: [BE] Implement `TokenService.canConsumeTokens`**
    *   Logic:
        1.  Get `TokenUsageSummary`.
        2.  Compare `summary.remainingTokens` with `tokensToConsume`.
*   [ ] **4.1.4.3: [BE] [TEST-UNIT] Run `TokenService` Tests (GREEN), Refactor.**
*   [ ] **4.1.4.4: [BE] Integrate Budget Check into Chat Message Creation Flow**
    *   [ ] In `supabase/functions/chat/index.ts`:
        *   *Before* calling the AI provider:
            *   Estimate tokens for the prompt (e.g., using a server-side `tiktoken` utility, or assume a max prompt token cost for pre-check).
            *   Instantiate/inject `TokenService`.
            *   Call `await tokenService.canConsumeTokens(...)`.
            *   If `false`, return a specific error (e.g., 402 Payment Required or 403 Forbidden with a custom error code like `TOKEN_BUDGET_EXCEEDED`).
    *   [ ] **[TEST-INT]** Update integration tests for `POST /chat`:
        *   Test that messages are blocked if budget would be exceeded.
        *   Test that messages proceed if budget is sufficient.
*   [ ] **4.1.4.5: [COMMIT]** "feat(BE): Implement backend budget enforcement for token consumption"

---

## Phase 4.2: API Client & State Management Integration

**Goal:** Update the API client and stores to interact with the new backend capabilities.

### 4.2.1: [API] Update API Client (`@paynless/api`)
*   [ ] **4.2.1.1: [TYPES] Ensure `TokenUsageSummary` type is available in `@paynless/types`.** (Covered in 4.1.1.1)
*   [ ] **4.2.1.2: [API] Add `getTokenSummary` Method to a Relevant API Client**
    *   [ ] Consider creating a `BillingApiClient` or adding to `UserApiClient`/`OrganizationApiClient`. (Let's use `UserApiClient` for now).
    *   `packages/api/src/clients/UserApiClient.ts`:
        *   `getTokenSummary(organizationId?: string | null): Promise<ApiResponse<TokenUsageSummary | null>>`
        *   Implementation calls `GET /token-summary` (with optional `organizationId`).
*   [ ] **4.2.1.3: [TEST-UNIT] Write Unit Tests for `getTokenSummary`**
    *   [ ] In `packages/api/src/tests/clients/UserApiClient.test.ts`.
    *   Mock `this.apiClient.get`. Verify correct endpoint and parameters.
*   [ ] **4.2.1.4: [COMMIT]** "feat(API): Add getTokenSummary method to UserApiClient"

### 4.2.2: [STORE] Create `useSubscriptionStore`
*   [ ] **4.2.2.1: [STORE] [TEST-UNIT] Define `SubscriptionState` and Actions**
    *   `packages/store/src/subscriptionStore.ts` (new file):
        *   State Interface `SubscriptionState`: `{ currentUserTokenSummary: TokenUsageSummary | null; currentOrgTokenSummary: TokenUsageSummary | null; isLoadingSummary: boolean; summaryError: Error | null; }`
        *   Store Actions Interface `SubscriptionActions`: `{ loadTokenSummary(organizationId?: string | null): Promise<void>; }`
        *   Initial State: `{ currentUserTokenSummary: null, currentOrgTokenSummary: null, isLoadingSummary: false, summaryError: null }`
        *   Selectors: `selectCurrentUserTokenBudget`, `selectOrganizationTokenBudget`, `selectCurrentUserPeriodUsage`, `selectCurrentOrgPeriodUsage`, `selectRemainingUserTokens`, `selectRemainingOrgTokens`. (These will derive from the `TokenUsageSummary` objects).
    *   Test cases in `packages/store/src/tests/subscriptionStore.test.ts`:
        *   `loadTokenSummary` calls correct API client method (`api.user().getTokenSummary`).
        *   State updates correctly on success/failure for user context (`organizationId` is null/undefined).
        *   State updates correctly on success/failure for org context (`organizationId` is provided).
        *   Selectors derive correct data from state (e.g., `selectRemainingUserTokens` computes `totalTokensAllocatedThisPeriod - tokensConsumedThisPeriod`).
*   [ ] **4.2.2.2: [STORE] Implement `useSubscriptionStore`**
    *   `loadTokenSummary` action:
        *   Sets `isLoadingSummary = true`, `summaryError = null`.
        *   Calls `api.user().getTokenSummary(organizationId)`.
        *   On success, updates `currentUserTokenSummary` (if no `organizationId`) or `currentOrgTokenSummary` (if `organizationId` present).
        *   Handles errors, sets `summaryError`.
        *   Sets `isLoadingSummary = false`.
*   [ ] **4.2.2.3: [STORE] [TEST-UNIT] Run `useSubscriptionStore` Tests (GREEN), Refactor.**
*   [ ] **4.2.2.4: [COMMIT]** "feat(STORE): Create useSubscriptionStore for token budgets and usage summaries"

### 4.2.3: [STORE] Enhance `useAiStore` for Token Display (Session Cumulative)
*   [ ] **4.2.3.1: [STORE] Ensure `token_usage` (with `promptTokens`, `completionTokens`) is populated on `ChatMessage` objects by `sendMessage` action.** (Verify from Phase 2.1.6/A.1.2.5)
*   [ ] **4.2.3.2: [STORE] [TEST-UNIT] Add/Verify Selector for Cumulative Chat Session Tokens**
    *   `packages/store/src/aiStore.ts`:
        *   `selectCurrentChatSessionTokenUsage: () => { userTokens: number, assistantTokens: number, totalTokens: number }`
            *   Accesses `get().messagesByChatId[get().currentChatId]`.
            *   Iterates messages: sums `message.token_usage.promptTokens` to `userTokens`, `message.token_usage.completionTokens` to `assistantTokens` (only for assistant messages with `token_usage`).
    *   Test cases in `packages/store/src/tests/aiStore.selectors.test.ts` (or similar) for this selector, covering empty messages, messages with/without `token_usage`.
*   [ ] **4.2.3.3: [STORE] [TEST-UNIT] Implement/Verify Selector, Run Tests (GREEN).**
*   [ ] **4.2.3.4: [COMMIT]** "feat(STORE): Add selector for cumulative chat session token usage to useAiStore"

---

## Phase 4.3: Frontend - UI Implementation (Aligns with `4-Token-Tracking-Audit.md` content)

**Goal:** Implement the UI components to display token information and integrate with budget audit logic.

### 4.3.1: [UI] Token Estimator (`useTokenEstimator` Hook & Display)
*   [ ] **4.3.1.1: [UI] [TEST-UNIT] Define Test Cases for `useTokenEstimator` Hook**
    *   `apps/web/src/hooks/useTokenEstimator.unit.test.ts`:
        *   (As per `4-Token-Tracking-Audit.md`) Mock `tiktoken`. Test various inputs, empty string.
*   [ ] **4.3.1.2: [UI] Create `useTokenEstimator.ts` Hook**
    *   (As per `4-Token-Tracking-Audit.md`) `import { getEncoding } from 'tiktoken'; const encoding = getEncoding('cl100k_base'); export const useTokenEstimator = (text: string) => React.useMemo(() => text ? encoding.encode(text).length : 0, [text]);` (Simplified example)
*   [ ] **4.3.1.3: [UI] [TEST-UNIT] Run Hook Tests (GREEN).**
*   [ ] **4.3.1.4: [UI] Integrate Hook into Chat Input Component (e.g., `AiChatbox.tsx` or its child `ChatInput.tsx`)**
    *   (As per `4-Token-Tracking-Audit.md`) Display estimated count: "Tokens: {count}".
*   [ ] **4.3.1.5: [UI] [TEST-UNIT] Update Chat Input Component Tests to Verify Display.**
*   [ ] **4.3.1.6: [COMMIT]** "feat(UI): Implement token estimator hook and display in chat input w/ tests"

### 4.3.2: [UI] Per-Message Token Display (`ChatMessageBubble.tsx`)
*   [ ] **4.3.2.1: [UI] [TEST-UNIT] Define Test Cases for `ChatMessageBubble.tsx`**
    *   (As per `4-Token-Tracking-Audit.md`) Verify token count (e.g., "P:{prompt}/C:{completion}") displays only for assistant messages with `message.token_usage` data.
*   [ ] **4.3.2.2: [UI] Update `ChatMessageBubble.tsx`**
    *   (As per `4-Token-Tracking-Audit.md`) If `message.role === 'assistant'` and `message.token_usage` (e.g., `message.token_usage.completionTokens`), display the count.
*   [ ] **4.3.2.3: [UI] [TEST-UNIT] Run `ChatMessageBubble` Tests (GREEN).**
*   [ ] **4.3.2.4: [COMMIT]** "feat(UI): Add token usage display to assistant chat messages w/ tests"

### 4.3.3: [UI] Cumulative Session Token Display (`ChatTokenUsageDisplay.tsx`)
*   [ ] **4.3.3.1: [UI] [TEST-UNIT] Define Test Cases for `ChatTokenUsageDisplay.tsx`**
    *   `apps/web/src/components/ai/ChatTokenUsageDisplay.unit.test.tsx`:
        *   (As per `4-Token-Tracking-Audit.md` and refined in 4.2.3) Mocks `useAiStore` with `selectCurrentChatSessionTokenUsage`.
        *   Verifies correct display of User/Assistant/Total tokens for the current session. Handles zero/null states.
*   [ ] **4.3.3.2: [UI] Create `ChatTokenUsageDisplay.tsx` Component**
    *   Uses `useAiStore(selectCurrentChatSessionTokenUsage)`.
    *   Displays: `User: {userTokens}, Assistant: {assistantTokens}, Total: {totalTokens}`.
*   [ ] **4.3.3.3: [UI] [TEST-UNIT] Run Component Tests (GREEN), Refactor.**
*   [ ] **4.3.3.4: [COMMIT]** "feat(UI): Create cumulative session token usage display component w/ tests"

### 4.3.4: [UI] Integrate Token UI into Main Chat Page (`AiChatPage.tsx`)
*   [ ] **4.3.4.1: [UI] Update `AiChatPage.tsx`**
    *   (As per `4-Token-Tracking-Audit.md`'s original "STEP-4" section)
        *   Ensure token estimator display is present near input (via C.1.4 integration).
        *   Integrate `ChatTokenUsageDisplay` component. Place appropriately (e.g., in a header or footer related to the chat area).
        *   Trigger `token_usage_displayed` analytics event when `ChatTokenUsageDisplay` is visible and has data.
*   [ ] **4.3.4.2: [TEST-INT] Manual Integration Tests**
    *   (As per `4-Token-Tracking-Audit.md`) Send messages, verify estimator updates. Verify assistant messages show tokens. Verify cumulative display updates. Verify analytics.
*   [ ] **4.3.4.3: [COMMIT]** "feat(UI): Integrate token tracking UI components into chat page w/ manual tests & analytics"

### 4.3.5: [UI] Token Budget Audit Hook (`useTokenAuditStatus`) and UI Integration
*   [ ] **4.3.5.1: [UI] [TEST-UNIT] Define Test Cases for `useTokenAuditStatus` Hook**
    *   `apps/web/src/hooks/useTokenAuditStatus.unit.test.ts`:
        *   (As per `4-Token-Tracking-Audit.md`)
        *   Mocks `useSubscriptionStore` (for `currentUserTokenSummary`, `currentOrgTokenSummary`).
        *   Mocks `useOrganizationStore` (for `currentOrganizationId` to select user vs org context).
        *   Test various summary states: budget available, usage below/at/exceeding budget.
        *   Verify correct calculation of `remainingTokens`, `percentageUsed`.
        *   Verify correct status flags: `isWarning` (e.g., >80% used), `isBlocked` (e.g., >100% used or remaining <= 0).
*   [ ] **4.3.5.2: [UI] Create `useTokenAuditStatus.ts` Hook**
    *   (As per `4-Token-Tracking-Audit.md`)
    *   Uses `useSubscriptionStore` to get the relevant `TokenUsageSummary` for the current user or organization (determined via `useOrganizationStore().currentOrganizationId`).
    *   Calculates `remainingTokens`, `percentageUsed`, `isWarning`, `isBlocked`.
    *   Returns reactive state: `{ remainingTokens: number, percentageUsed: number, isWarning: boolean, isBlocked: boolean, isLoading: boolean, error: Error | null }` (also include loading/error from store).
*   [ ] **4.3.5.3: [UI] [TEST-UNIT] Run Hook Tests (GREEN).**
*   [ ] **4.3.5.4: [UI] Integrate Hook into UI Points**
    *   **Chat Input (`AiChatbox.tsx` or `ChatInput.tsx`):**
        *   [ ] Use `useTokenAuditStatus()`.
        *   [ ] If `isLoading`, show subtle loading indicator for budget status.
        *   [ ] If `isWarning`, display a warning message (e.g., "Token budget nearing limit").
        *   [ ] If `isBlocked`, disable input and send button, show message (e.g., "Token budget exceeded").
    *   **User Dashboard (e.g., `UserAccountPage.tsx`):**
        *   [ ] Call `useSubscriptionStore.getState().loadTokenSummary()` on mount.
        *   [ ] Use `useTokenAuditStatus()`.
        *   [ ] Display personal token usage vs. budget (e.g., "Tokens used: {consumed} / {allocated}"). Progress bar.
    *   **Organization Settings (e.g., `OrganizationBillingPage.tsx` or similar):**
        *   [ ] Get `currentOrganizationId` from `useOrganizationStore`.
        *   [ ] Call `useSubscriptionStore.getState().loadTokenSummary(currentOrganizationId)` on mount.
        *   [ ] Use `useTokenAuditStatus()`.
        *   [ ] Display organization token usage vs. budget.
*   [ ] **4.3.5.5: [UI] [TEST-UNIT]/[TEST-INT] Update/Create Component Tests for these UI integrations.** Verify conditional rendering based on hook state.
*   [ ] **4.3.5.6: [COMMIT]** "feat(UI): Implement token budget audit hook and integrate into UI w/ tests"

---

## Phase 4.4: End-to-End Testing & Refinement

**Goal:** Ensure the entire system works cohesively and robustly.

### 4.4.1: [TEST-INT] Comprehensive Integration Testing
*   [ ] **4.4.1.1: Test Token Recording Pipeline**
    *   Send messages (personal & org contexts).
    *   Verify `chat_messages.token_usage` is accurately populated in the DB.
    *   Verify `token_usage_periods` table in DB reflects the sum of tokens from related messages.
*   [ ] **4.4.1.2: Test Token Summary Retrieval & Display**
    *   Navigate UI (User Dashboard, Org Settings, Chat Input warnings).
    *   Verify displayed token usage, budget, and remaining tokens match backend calculations (cross-reference with DB data or `GET /token-summary` endpoint).
*   [ ] **4.4.1.3: Test Budget Enforcement (UI and Backend)**
    *   Configure a user/org with a very low token budget in the DB.
    *   Attempt to send messages:
        *   Verify UI warnings appear as budget depletes.
        *   Verify UI disables input/send button when `isBlocked` is true.
        *   Use browser dev tools or API client to attempt `POST /chat` directly, bypassing UI. Verify backend rejects request with appropriate error (e.g., 402/403 `TOKEN_BUDGET_EXCEEDED`) if budget is insufficient.
*   [ ] **4.4.1.4: Test Period Rollover (Manual Simulation)**
    *   In the DB, manually adjust `usage_period_end` and `budget_period_end` for a test user/org to simulate a new billing period starting.
    *   Verify in the UI and via `GET /token-summary` that token usage for the *new* period is reset (or starts from 0) and the budget reflects the new period's allocation.

### 4.4.2: [REFACTOR] Review and Refine
*   [ ] Review all new code (BE, API, Store, UI) for clarity, efficiency, error handling, security, and adherence to project standards.
*   [ ] Ensure Dependency Injection (DI) is used consistently in backend services (e.g., passing `SupabaseClient` to services).
*   [ ] Ensure interfaces are well-defined and consistently used across layers.

### 4.4.3: [COMMIT] Final Commits for Token Tracking Feature
*   [ ] Commit any fixes, refinements, or additional tests resulting from this phase.
*   [ ] Ensure all new and modified test suites are passing.

---
