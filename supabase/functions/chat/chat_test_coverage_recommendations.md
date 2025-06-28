# Chat Function Test Coverage Analysis and Recommendations

This document outlines the current test coverage for the `/chat` Supabase Edge Function and provides recommendations for improvement.

## I. Current Test Files & Focus

*   **`supabase/functions/chat/index.test.ts`:** (Shared Utilities)
    *   Provides shared testing constants, types, mock setups (`createTestDeps`, `mockSupaConfigBase`, `mockAdapterSuccessResponse`), and exports the main `handler`.
    *   Crucial for maintaining consistency across other test files.
*   **`supabase/functions/chat/index.auth.test.ts`:**
    *   Focuses on authentication, CORS, and basic request method validation (OPTIONS, GET, POST).
    *   Includes a broad "valid Auth" test that also covers parts of a successful new chat flow with token wallet interactions.
*   **`supabase/functions/chat/index.orgs.test.ts`:**
    *   Focuses on how `organizationId` is handled during new chat creation (specifically its inclusion in `chats` table inserts and exclusion from `chat_messages` and response objects).
*   **`supabase/functions/chat/index.providers.test.ts`:**
    *   Tests logic related to AI provider and system prompt resolution from the database.
    *   Covers various failure modes (DB errors, inactive/invalid records, missing provider string).
    *   Includes a test for `promptId: "__none__"`.
    *   Includes a test for an alternative provider (Anthropic).
    *   Contains one test for handling existing chat history, which has some overlap with `index.sendMessage.test.ts`.
*   **`supabase/functions/chat/index.sendMessage.test.ts`:**
    *   Focuses on the core message sending flow and error handling from dependencies (AI adapter, DB history fetch, DB message inserts).
    *   Covers basic input validation for the `message` field.
*   **`supabase/functions/chat/index.selectedMessages.test.ts`:**
    *   Tests how `selectedMessages` in the request body are used to construct the message history for the AI adapter, overriding DB history or combining with system prompts.
    *   Covers new and existing chats, with and without system prompts.
*   **`supabase/functions/chat/index.rewind.test.ts`:**
    *   Contains two distinct test suites:
        1.  **Isolated Tests:** Mocks dependencies (including RPC calls) to test the rewind logic within the `handler` function. Does *not* currently use the shared `createTestDeps` from `index.test.ts`, leading to gaps in testing `TokenWalletService` interactions during rewind.
        2.  **Real Database Tests:** Integration tests that run against a live Supabase instance to verify the `perform_chat_rewind` RPC and overall flow.

## II. Overall Handler Logic Coverage (`supabase/functions/chat/index.ts`)

### A. Main `handler` Function:

*   **CORS Preflight (OPTIONS):** **Covered** (`index.auth.test.ts`).
    *   *Minor Gap:* Could test various origins if CORS logic is more complex.
*   **Method Not Allowed (GET, etc.):** **Covered** for GET (`index.auth.test.ts`).
    *   *Minor Gap:* Could add tests for other methods (PUT, PATCH) if deemed necessary.
*   **Authentication:**
    *   Missing Auth Header (POST): **Covered** (`index.auth.test.ts`).
    *   Invalid/Expired Auth Token: **Covered** (`index.auth.test.ts`).
    *   DELETE request without auth header: **Untested**.
*   **Environment Variable Checks (`SUPABASE_URL`, `SUPABASE_ANON_KEY`):** **Untested**.
*   **Request Body Parsing (POST - Malformed JSON):** **Untested**.
*   **DELETE Request Path:** **Major Gap - Mostly Untested**.
    *   Logic for missing `chatId` in URL exists but is untested.
    *   Success/failure of `delete_chat_and_messages` RPC call is untested.
*   **Unhandled Errors in main `handler`:** Covered by implication via specific error tests.

### B. `handlePostRequest` Function:

*   **Critical Dependency Checks (`TokenWalletService`, `countTokensForMessages`):** **Covered** (implicitly by tests passing with these services injected).
*   **Input Validation (`ChatApiRequest` body):**
    *   `message` missing/invalid: **Covered** (`index.sendMessage.test.ts`).
    *   `providerId` missing/invalid: Missing case untested; invalid (DB lookup fail) **Covered**.
    *   `promptId` missing/invalid: Missing case untested; invalid (DB lookup fail) **Covered**.
    *   `chatId` invalid format: **Untested**.
    *   `rewindFromMessageId` invalid format: **Untested**.
    *   `selectedMessages` invalid format (not array, bad message structure): **Untested**.
*   **System Prompt Fetching:**
    *   DB error / Prompt not found/inactive: **Covered** (`index.providers.test.ts`).
    *   `promptId: "__none__"`: **Covered** (`index.providers.test.ts`).
*   **Provider Details Fetching:**
    *   DB error / Provider not found/inactive: **Covered** (`index.providers.test.ts`).
    *   Provider string missing in DB record: **Covered** (`index.providers.test.ts`).
*   **Token Wallet Operations (Initial `getWalletForContext`):**
    *   Wallet not found (402 error): **Untested**.
    *   Server error during wallet check (500 error): **Untested**.
*   **Rewind Path (`rewindFromMessageId` is present):**
    *   *Status:* Partially covered by `index.rewind.test.ts` (isolated suite), but **significant gaps remain due to non-use of shared mocks.**
    *   `chatId` missing: **Untested** by isolated suite (always provided).
    *   Rewind point message not found (404): **Covered** by isolated suite.
    *   DB error fetching history for AI context (500): **Covered** by isolated suite.
    *   Token Check & Balance (for non-dummy): **Untested** by isolated suite.
    *   AI Adapter failures (unsupported provider, API key, `sendMessage` error): **Untested** by isolated suite in the context of a successful rewind setup.
    *   `perform_chat_rewind` RPC:
        *   RPC error (500): **Covered** by isolated suite.
        *   RPC returns insufficient/malformed data (500): **Untested**.
    *   Token Debit (for non-dummy after successful rewind): **Untested** by isolated suite.
*   **Normal Path (No Rewind):**
    *   New Chat Creation:
        *   DB error creating chat (500): **Covered** (`index.providers.test.ts`).
    *   Message History Construction (`constructMessageHistory` helper):
        *   `selectedMessages` used: **Covered** (`index.selectedMessages.test.ts`).
        *   DB history fetched if no `selectedMessages` for existing chat: **Covered** (`index.providers.test.ts`).
        *   DB history fetch error for existing chat (triggers new chat logic): **Covered** (`index.sendMessage.test.ts`).
        *   Filtering of invalid messages from DB history: **Untested**.
    *   Dummy Provider Logic (`providerString === 'dummy'`): **Major Gap - Untested**.
        *   Includes DB errors for user/assistant message inserts, token counting errors.
    *   Real Provider Logic (Non-dummy):
        *   Unsupported provider (adapter not found): **Covered** (`index.providers.test.ts`).
        *   API key missing from env (500): **Partially Covered** (by inference if specific provider tests pass). Explicit test for a new provider type missing a key is lacking.
        *   Token Check & Balance (insufficient funds (402), token estimation error (500)): **Untested**.
        *   Adapter `sendMessage` error (502): **Covered** (`index.sendMessage.test.ts`).
        *   DB error inserting user message (500): **Covered** (`index.sendMessage.test.ts`).
        *   DB error inserting assistant message (500): **Untested** (current test might be generic).
        *   Token Debit (debit error, invalid token usage data): **Untested**.

### C. `constructMessageHistory` Helper Function:

*   Core logic paths (system prompt, selected messages, DB history): **Covered** by various tests.
*   Filtering of invalid messages from DB: **Untested**.

## III. Recommendations for Improving Test Coverage

### 1. Refactor `index.rewind.test.ts` (Isolated Suite)
    *   **Action:** Modify the "Chat Function Rewind Test (Isolated)" suite to use the shared `createTestDeps` from `supabase/functions/chat/index.test.ts`.
    *   **Goal:** Enable testing of `TokenWalletService` interactions (balance checks, debits) and ensure consistency with other tests.
    *   **Sub-tasks:**
        *   Update mock configurations to be compatible with the shared setup.
        *   Add tests for token wallet failures (insufficient balance, debit errors) within the rewind flow.
        *   Add tests for AI Adapter failures (unsupported provider, missing API key, `sendMessage` error) within the rewind flow.
        *   Add tests for the RPC returning malformed/insufficient data.
        *   Add test for `chatId` missing in a rewind request.

### 2. Create `index.delete.test.ts`
    *   **Action:** Create a new test file for the DELETE request functionality.
    *   **Goal:** Cover all aspects of chat deletion.
    *   **Tests to Add:**
        *   Successful deletion of a chat (verify 204 status, check RPC `delete_chat_and_messages` called with correct `chatId` and `userId`).
        *   Attempt to delete chat with missing `chatId` in URL (expect 400).
        *   Attempt to delete non-existent chat (behavior depends on RPC: test for 404 or appropriate error).
        *   Permission denied (RPC returns error indicating user cannot delete the chat - expect 403).
        *   Other RPC errors during deletion (expect 500).
        *   DELETE request without `Authorization` header.

### 3. Enhance `index.providers.test.ts` (or new `index.dummy.test.ts`)
    *   **Action:** Add tests for the "dummy" provider.
    *   **Goal:** Cover the specific logic path for `providerString === 'dummy'`.
    *   **Tests to Add:**
        *   Successful dummy provider flow (echo response, correct token usage based on `countTokensFn`).
        *   DB error inserting user message with dummy provider.
        *   DB error inserting assistant message with dummy provider.
        *   Error in `countTokensFn` when used by dummy provider (should log and default tokens).

### 4. Enhance `index.auth.test.ts` and other relevant files for Token Wallet Failures
    *   **Action:** Add explicit tests for `TokenWalletService` failure modes not directly tied to rewind.
    *   **Goal:** Ensure robust handling of wallet issues.
    *   **Tests to Add (in `index.auth.test.ts` or `index.sendMessage.test.ts`):**
        *   `getWalletForContext` returns no wallet (expect 402 "Token wallet not found").
        *   `getWalletForContext` throws an unexpected server error (expect 500).
        *   Normal path: Insufficient balance for AI call after `checkBalance` (expect 402).
        *   Normal path: Error during token estimation with `countTokensFn` (expect 500).
        *   Normal path: `recordTransaction` (debit) fails (should log error, but still return 200 if AI call succeeded).
        *   Normal path: `token_usage` from adapter is missing or invalid, so debit is skipped (verify logging).

### 5. Create `index.config.test.ts` (or augment existing files)
    *   **Action:** Add tests for missing critical environment variables.
    *   **Goal:** Verify server configuration error handling.
    *   **Tests to Add:**
        *   `SUPABASE_URL` is missing (expect 500).
        *   `SUPABASE_ANON_KEY` is missing (expect 500).
        *   Specific AI provider API key (e.g., `OPENAI_API_KEY`) is missing for a non-dummy provider (expect 500).
        *   *(These will require careful stubbing of `Deno.env.get`)*.

### 6. Enhance `index.sendMessage.test.ts` (or new `index.validation.test.ts`)
    *   **Action:** Add tests for remaining input validation cases.
    *   **Goal:** Ensure all `ChatApiRequest` validation paths are covered.
    *   **Tests to Add:**
        *   `providerId` missing from request (expect 400).
        *   `promptId` missing from request (expect 400).
        *   `chatId` provided but in an invalid format (expect 400).
        *   `rewindFromMessageId` provided but in an invalid format (expect 400).
        *   `selectedMessages` is not an array (expect 400).
        *   `selectedMessages` contains messages with invalid structure (e.g., missing `role`/`content`, invalid `role`) (expect 400).
        *   Test specific DB error for *assistant message insert* failing after user message insert succeeded (normal path).

### 7. Enhance Message History Tests (e.g., in `index.sendMessage.test.ts`)
    *   **Action:** Add a test for `constructMessageHistory` correctly filtering malformed messages from DB.
    *   **Goal:** Verify robustness of history construction.
    *   **Test to Add:**
        *   Provide a mock DB history containing some messages with invalid roles or missing content, ensure they are not included in the history passed to the AI adapter.

### 8. Review and Clarify `organizationId` Handling for Existing Chats
    *   **Action:** Analyze the intended behavior when `organizationId` is passed in a request for an *existing* chat. The current `getWalletForContext(userId, organizationId)` uses the request's `organizationId`.
    *   **Goal:** Ensure wallet context is correctly applied and test any specific logic.
    *   **Tests to Add (in `index.orgs.test.ts`):**
        *   If an `organizationId` in the request for an existing chat should change the wallet context, test this.
        *   If the chat's original `organization_id` should always take precedence for wallet operations on an existing chat, ensure tests verify this (may require adjusting how `getWalletForContext` is called or mocked for existing org chats).

### 9. Keep Real Database Tests in `index.rewind.test.ts`
    *   **Action:** Maintain these as separate integration tests.
    *   **Goal:** Verify the `perform_chat_rewind` RPC and live DB integration.
    *   **Considerations:** Ensure they are clearly marked, robust, and have reliable setup/cleanup. They should ideally not block CI/CD if they are prone to flakiness due to external dependencies.

By addressing these areas, we can significantly improve the comprehensiveness and reliability of the test suite for the `/chat` function. 