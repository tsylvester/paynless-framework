# Model Call Refinement 2: Complex Job Processing

This document provides a complete, verified, and end-to-end refactoring to modularize the existing monolithic chat into multiple smaller, easier to test files.

## Legend

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

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

## Implementation Plan

### Phase 1: Extract `findOrCreateChat` Utility

*   `[✅]` 1. `[BE][REFACTOR]` Extract `findOrCreateChat` logic from `handlePostRequest.ts` into `supabase/functions/chat/findOrCreateChat.ts`.
    *   `[✅]` 1.a. Copy the relevant code block (approximately lines 498-570) from `handlePostRequest.ts` into the new `findOrCreateChat.ts` file.
    *   `[✅]` 1.b. Refactor the copied logic into an exported async function. Define its interface to accept necessary dependencies (`supabaseClient`, `userId`, `organizationId`, `finalSystemPromptIdForDb`, `userMessageContent`, `logger`, `existingChatId`) and return the `chatId`.
*   `[✅]` 2. `[TEST-UNIT]` Implement unit tests for `findOrCreateChat.ts`.
    *   `[✅]` 2.a. In `findOrCreateChat.test.ts`, write a test case where an `existingChatId` is provided and successfully found.
    *   `[✅]` 2.b. Write a test case where an `existingChatId` is provided but not found, and a new chat is created with that ID.
    *   `[✅]` 2.c. Write a test case where `existingChatId` is null, and a new chat is created with a server-generated UUID.
    *   `[✅]` 2.d. Write a test to simulate and handle a race condition (Postgres error code '23505') during chat creation.
*   `[✅]` 3. `[BE][REFACTOR]` Integrate the `findOrCreateChat` module into `handlePostRequest.ts`.
    *   `[✅]` 3.a. Import the new `findOrCreateChat` function into `handlePostRequest.ts`.
    *   `[✅]` 3.b. Replace the original logic block with a single call to the new module.
*   `[✅]` 4. `[COMMIT]` Create a commit for the `findOrCreateChat` refactoring: `refactor(chat): extract findOrCreateChat utility`.

### Phase 2: Fix Atomicity and Extract `debitTokens` Utility

*   `[✅]` 5. `[DB]` Modify `perform_chat_rewind` SQL Function to accept pre-generated IDs.
    *   `[✅]` 5.a. Create a new database migration file.
    *   `[✅]` 5.b. Modify the `perform_chat_rewind` function signature to accept `p_new_user_message_id UUID` and `p_new_assistant_message_id UUID` as parameters.
    *   `[✅]` 5.c. Update the `INSERT` statements within the SQL function to use these provided IDs instead of generating new ones internally. This is the critical step that enables the `Debit -> Save` pattern for the rewind path.
*   `[✅]` 6. `[BE][REFACTOR]` Extract and consolidate token debiting logic into `supabase/functions/chat/debitTokens.ts`.
    *   `[✅]` 6.a. The function signature will be `debitTokens<T>(deps, params)` where `params` includes a new `relatedEntityId: string` field to hold the pre-generated message UUID.
    *   `[✅]` 6.b. The function will implement the correct `Debit -> databaseOperation() -> Refund on Failure` atomic pattern, using the `relatedEntityId` when recording the debit transaction.
*   `[✅]` 7. `[TEST-UNIT]` Implement unit tests for `debitTokens.ts`.
    *   `[✅]` 7.a. Test the happy path where debit and the `databaseOperation` callback succeed.
    *   `[✅]` 7.b. Test insufficient funds, ensuring the `databaseOperation` is not called.
    *   `[✅]` 7.c. Test the critical rollback scenario: the debit succeeds, but the `databaseOperation` fails, and assert that a refund credit is issued.
*   `[✅]` 8. `[BE][REFACTOR]` Integrate the `debitTokens` module into `handlePostRequest.ts`.
    *   `[✅]` 8.a. **Normal Path:** The calling code will first generate a UUID for the new assistant message. It will then call `debitTokens`, passing this new ID as the `relatedEntityId`. The message insertion logic will be passed as the `databaseOperation` callback, which must use the same pre-generated UUID for the insert.
    *   `[✅]` 8.b. **Rewind Path:** The calling code will first generate UUIDs for both the new user and assistant messages. It will call `debitTokens`, passing the assistant's ID as the `relatedEntityId`. The `databaseOperation` callback will be the call to the now-modified `perform_chat_rewind` RPC, passing in the pre-generated UUIDs.
*   `[✅]` 9. `[COMMIT]` Create a commit for the `debitTokens` refactoring: `refactor(chat): extract atomic token transaction and fix rewind path`.

### Phase 3: Extract `handleNormalPath` Module

*   `[✅` 9. `[BE][REFACTOR]` Extract the "Normal Path" business logic into `supabase/functions/chat/handleNormalPath.ts`.
    *   `[✅]` 9.a. Copy the entire "Normal Path" block (approx. lines 495-996) from `handlePostRequest.ts` into `handleNormalPath.ts`.
    *   `[✅]` 9.b. Refactor the logic into an exported `handleNormalPath` function that accepts a comprehensive context object (containing dependencies and prepared data) and the request body.
    *   `[✅]` 9.c. Update the copied logic to use the already-extracted `findOrCreateChat` and `debitTokens` modules.
*   `[✅]` 10. `[TEST-UNIT]` Implement unit tests for `handleNormalPath.ts`.
    *   `[✅]` 10.a. In `handleNormalPath.test.ts`, test the full happy path: chat creation/retrieval, history construction, AI call, token debit, and message persistence.
    *   `[✅]` 10.b. Test the scenario where the AI adapter call fails, and ensure the error is handled and persisted correctly.
    *   `[✅]` 10.c. Test a critical failure where message persistence fails after a successful token debit, and verify that the refund/credit logic is triggered.
*   `[✅]` 11. `[BE][REFACTOR]` Integrate the `handleNormalPath` module into `handlePostRequest.ts`.
    *   `[✅]` 11.a. Import the `handleNormalPath` function.
    *   `[✅]` 11.b. Replace the entire "Normal Path" block with a single call to the new module.
*   `[✅]` 12. `[COMMIT]` Create a commit: `feat(chat): modularize normal chat path logic`.

### Phase 4: Extract `handleRewindPath` Module

*   `[✅]` 13. `[BE][REFACTOR]` Extract the "Rewind Path" business logic into `supabase/functions/chat/handleRewindPath.ts`.
    *   `[✅]` 13.a. Copy the "Rewind Path" block (approx. lines 195-493) into `handleRewindPath.ts`.
    *   `[✅]` 13.b. Refactor into an exported `handleRewindPath` function that accepts the context object and request body.
    *   `[✅]` 13.c. Update the copied logic to use the extracted `debitTokens` module.
*   `[✅]` 14. `[TEST-UNIT]` Implement unit tests for `handleRewindPath.ts`.
    *   `[✅]` 14.a. In `handleRewindPath.test.ts`, test a successful end-to-end rewind operation.
    *   `[✅]` 14.b. Test a failure in the `perform_chat_rewind` RPC call.
    *   `[✅]` 14.c. Test a failure in the AI adapter call during the rewind process.
    *   `[✅]` 14.d. Test an error when fetching the initial chat history for the rewind context.
*   `[✅]` 15. `[BE][REFACTOR]` Integrate the `handleRewindPath` module into `handlePostRequest.ts`.
    *   `[✅]` 15.a. Import the `handleRewindPath` function.
    *   `[✅]` 15.b. Replace the "Rewind Path" block with a call to the new module.
*   `[✅]` 16. `[COMMIT]` Create a commit: `feat(chat): modularize rewind chat path logic`.

### Phase 5: Extract `prepareChatContext` Module

*   `[✅]` 17. `[BE][REFACTOR]` Extract all setup and validation logic into `supabase/functions/chat/prepareChatContext.ts`.
    *   `[✅]` 17.a. Copy the initial setup logic (approx. lines 54-192) from `handlePostRequest.ts` into `prepareChatContext.ts`.
    *   `[✅]` 17.b. Refactor this logic into an exported `prepareChatContext` function. This function will take the raw request (`requestBody`, `supabaseClient`, `userId`, `deps`) and return a structured context object containing everything needed by the path handlers (`wallet`, `aiProviderAdapter`, `modelConfig`, etc.).
*   `[✅]` 18. `[TEST-UNIT]` Implement unit tests for `prepareChatContext.ts`.
    *   `[✅]` 18.a. In `prepareChatContext.test.ts`, test the successful preparation of the context object.
    *   `[✅]` 18.b. Test failure cases, including: provider not found, invalid provider config, missing API key, wallet not found, and system prompt not found.
*   `[✅]` 19. `[BE][REFACTOR]` Integrate the `prepareChatContext` module into `handlePostRequest.ts`.
    *   `[✅]` 19.a. Import the `prepareChatContext` function.
    *   `[✅]` 19.b. Replace all the setup logic with a single call to `prepareChatContext`, and pass the resulting context object to the `handleNormalPath` or `handleRewindPath` functions.
*   `[✅]` 20. `[COMMIT]` Create a commit: `refactor(chat): extract chat context preparation`.

### Phase 6: Port Existing Tests, Final Cleanup, and Deployment

*   `[ ]` 21. `[TEST-UNIT][REFACTOR]` Analyze and port existing unit tests to the new modular structure.
    *   `[✅]` 21.a. `[DOCS]` Identify and list the outdated monolithic test files in the `chat/` directory that need to be processed.
        *   **Unit Test Files to Port:**
            1.  `[✅]` `index.auth.test.ts`
            2.  `[✅]` `index.orgs.test.ts`
            3.  `[✅]` `index.providers.test.ts`
            4.  `[✅]` `index.rewind.test.ts`
            5.  `[✅]` `index.selectedMessages.test.ts`
            6.  `[✅]` `index.sendMessage.test.ts`
            7.  `[✅]` `index.test.ts`
            8.  `[✅]` `index.wallet.test.ts`
        *   **Integration Test Files to Fix:**
            1.  `[ ]` `auth_validation.integration.test.ts`
            2.  `[ ]` `edge_cases.integration.test.ts`
            3.  `[ ]` `happy_path.integration.test.ts`
            4.  `[ ]` `index.integration.test.ts`
            5.  `[ ]` `specific_configs.integration.test.ts`
    *   `[🚧]` 21.b. `[DOCS]` For each outdated test file, read its contents, list the individual tests within it, and map each test to its corresponding new, refactored module (e.g., `prepareChatContext`, `handleNormalPath`, `findOrCreateChat`).
        *   `[✅]` Test Porting Analysis (`index.auth.test.ts`)
            *   `[✅]` **Test:** `OPTIONS request should return CORS headers` -> **Destination:** `index.test.ts` (as an entrypoint test).
            *   `[✅]` **Test:** `GET request should return 405 Method Not Allowed` -> **Destination:** `index.test.ts` (as an entrypoint test).
            *   `[✅]` **Test:** `POST request missing Auth header should return 401` -> **Destination:** `index.test.ts` (as an entrypoint test).
            *   `[✅]` **Test:** `POST request with invalid/expired Auth token should return 401` -> **Destination:** `index.test.ts` (as an entrypoint test).
            *   `[✅]` **Test:** `POST request with valid Auth (New Chat) should proceed past auth check` -> **Destination:** `happy_path.integration.test.ts` (as a full-flow integration test).
        *   `[✅]` Test Porting Analysis (`index.orgs.test.ts`)
            *   `[✅]` **Test:** `POST request for New ORG Chat should include organizationId in insert` -> **Destination:** `findOrCreateChat.test.ts` (covers organization-specific creation logic).
        *   `[✅]` Test Porting Analysis (`index.providers.test.ts`)
            *   `[✅]` **Test:** `POST request with existing chat history includes history in adapter call` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with invalid providerId (DB lookup fails) returns 404` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request with inactive provider returns 400` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request with invalid promptId (DB lookup fails) returns 200` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request with inactive prompt returns 200` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request with promptId __none__ succeeds and sends no system message` -> **Destination:** Split between `prepareChatContext.test.ts` (for null prompt) and `findOrCreateChat.test.ts` (for DB insert verification).
            *   `[✅]` **Test:** `POST request with DB error creating chat returns 500` -> **Destination:** `findOrCreateChat.test.ts`
            *   `[✅]` **Test:** `POST request with missing provider string in DB returns 500` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request with unsupported provider returns 400` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request with unsupported provider type returns 400` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request succeeds with a different provider (Anthropic)` -> **Destination:** `happy_path.integration.test.ts`
        *   `[✅]` Test Porting Analysis (`index.rewind.test.ts`)
            *   `[✅]` **Unit Test:** `POST request with rewindFromMessageId should call RPC and use its result` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Unit Test:** `POST rewind with non-existent rewindFromMessageId returns 404` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Unit Test:** `POST rewind with RPC error returns 500` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Unit Test:** `POST rewind with error fetching active history returns 500` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Integration Test:** `Basic rewind functionality (real database)` -> **Destination:** `edge_cases.integration.test.ts`
            *   `[✅]` **Integration Test:** `Rewind with non-existent message ID (real database)` -> **Destination:** `edge_cases.integration.test.ts`
            *   `[✅]` **Integration Test:** `Rewind without providing chatId (real database)` -> **Destination:** `edge_cases.integration.test.ts`
        *   `[✅]` Test Porting Analysis (`index.selectedMessages.test.ts`)
            *   `[✅]` **Test:** `POST (New Chat) with selectedMessages and system prompt (DB) should use them` -> **Destination:** `constructMessageHistory.test.ts`
            *   `[✅]` **Test:** `POST (New Chat) with selectedMessages and NO system_prompt_id` -> **Destination:** `constructMessageHistory.test.ts`
            *   `[✅]` **Test:** `POST (Existing Chat) with selectedMessages should IGNORE DB history` -> **Destination:** `constructMessageHistory.test.ts`
        *   `[✅]` Test Porting Analysis (`index.sendMessage.test.ts`)
            *   `[✅]` **Test:** `POST request with adapter sendMessage error returns 502` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with missing message returns 400` -> **Destination:** `index.test.ts` (entrypoint validation).
            *   `[✅]` **Test:** `POST request returns 413 if input tokens exceed provider limit` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with history fetch error proceeds as new chat` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with message insert error returns 500` -> **Destination:** `debitTokens.test.ts` (validates failure of the `databaseOperation` callback).
        *   `[✅]` Test Porting Analysis (`index.test.ts`)
            *   `[✅]` **Refactoring:** This file should be split. The test utility exports (`createTestDeps`, constants, etc.) should be moved to a new `_chat.test.utils.ts` file. All other test files will need their imports updated.
            *   `[✅]` **Test:** `handlePostRequest should apply a fallback cap when model config is missing a hard cap` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `handlePostRequest should cap max_tokens_to_generate based on affordability` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `[BUG PROOF] handlePostRequest should not duplicate message content` -> **Destination:** `handleNormalPath.test.ts`
        *   #### Test Porting Analysis (`index.rewind.test.ts`)
            *   `[✅]` **Unit Test:** `POST request with rewindFromMessageId should call RPC and use its result` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Unit Test:** `POST rewind with non-existent rewindFromMessageId returns 404` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Unit Test:** `POST rewind with RPC error returns 500` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Unit Test:** `POST rewind with error fetching active history returns 500` -> **Destination:** `handleRewindPath.test.ts`
            *   `[✅]` **Integration Test:** `Basic rewind functionality (real database)` -> **Destination:** `edge_cases.integration.test.ts`
            *   `[✅]` **Integration Test:** `Rewind with non-existent message ID (real database)` -> **Destination:** `edge_cases.integration.test.ts`
            *   `[✅]` **Integration Test:** `Rewind without providing chatId (real database)` -> **Destination:** `edge_cases.integration.test.ts`
        *   #### Test Porting Analysis (`index.selectedMessages.test.ts`)
            *   `[✅]` **Test:** `POST (New Chat) with selectedMessages and system prompt (DB) should use them` -> **Destination:** `constructMessageHistory.test.ts`
            *   `[✅]` **Test:** `POST (New Chat) with selectedMessages and NO system_prompt_id` -> **Destination:** `constructMessageHistory.test.ts`
            *   `[✅]` **Test:** `POST (Existing Chat) with selectedMessages should IGNORE DB history` -> **Destination:** `constructMessageHistory.test.ts`
        *   #### Test Porting Analysis (`index.sendMessage.test.ts`)
            *   `[✅]` **Test:** `POST request with adapter sendMessage error returns 502` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with missing message returns 400` -> **Destination:** `index.test.ts` (entrypoint validation).
            *   `[✅]` **Test:** `POST request returns 413 if input tokens exceed provider limit` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with history fetch error proceeds as new chat` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request with message insert error returns 500` -> **Destination:** `debitTokens.test.ts` (validates failure of the `databaseOperation` callback).
        *   #### Test Porting Analysis (`index.test.ts`)
            *   `[✅]` **Refactoring:** This file should be split. The test utility exports (`createTestDeps`, constants, etc.) should be moved to a new `_chat.test.utils.ts` file. All other test files will need their imports updated.
            *   `[✅]` **Test:** `handlePostRequest should apply a fallback cap when model config is missing a hard cap` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `handlePostRequest should cap max_tokens_to_generate based on affordability` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `[BUG PROOF] handlePostRequest should not duplicate message content` -> **Destination:** `handleNormalPath.test.ts`
        *   `[✅]` Test Porting Analysis (`index.wallet.test.ts`)
            *   `[✅]` **Test:** `POST request returns 402 if getWalletForContext returns null` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request returns 500 if getWalletForContext throws an error` -> **Destination:** `prepareChatContext.test.ts`
            *   `[✅]` **Test:** `POST request returns 402 if affordability check fails` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST request returns 500 if countTokensFn throws an error` -> **Destination:** `handleNormalPath.test.ts`
            *   `[✅]` **Test:** `POST returns 500 if recordTransaction (debit) fails` -> **Destination:** `debitTokens.test.ts`
            *   `[✅]` **Test:** `POST returns 200... if AI response has invalid/missing token_usage` -> **Destination:** `handleNormalPath.test.ts`
        *   ... (continue for all files) ...
    *   `[✅]` 21.c. `[TEST-UNIT]` Methodically move each identified unit test from the old file into the test file of its new module owner, adapting the test to the module's specific interface and dependencies.
    *   `[✅]` 21.d. `[TEST-UNIT]` After all tests from an old file have been successfully ported and are passing in their new locations, delete the original, now-empty monolithic test file.
*   `[ ]` 22. `[TEST-INT][REFACTOR]` Update and fix existing integration tests.
    *   `[ ]` 22.a. `[TEST-INT]` Identify the integration tests in the `chat/` directory that are failing due to the refactoring.
    *   `[ ]` 22.b. `[TEST-INT]` Update these integration tests to call the new, modular functions correctly, ensuring they properly test the end-to-end functionality of the refactored chat service.
*   `[✅]` 23. `[BE][REFACTOR]` Perform a final review and cleanup of `handlePostRequest.ts`.
    *   `[✅]` 23.a. Ensure `handlePostRequest.ts` is a clean, high-level orchestrator. Its only role should be to call `prepareChatContext` and then delegate to the appropriate path handler based on `rewindFromMessageId`.
    *   `[✅]` 23.b. Remove all unused imports, variables, and comments from all the refactored files (`handlePostRequest.ts`, `prepareChatContext.ts`, etc.).
*   `[ ]` 24. `[DOCS]` Finalize documentation.
    *   `[✅]` 24.a. Mark all steps in this `Modularize Chat.md` document as complete `[✅]`.
*   `[✅]` 25. `[COMMIT]` Final commit of all changes: `feat(chat): complete modularization of chat handler`.
*   `[✅]` 26. `[DEPLOY]` Consider the refactoring complete and ready for deployment.
