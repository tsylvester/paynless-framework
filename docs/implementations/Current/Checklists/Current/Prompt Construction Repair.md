# Prompt Construction Repair

The dialectic process is failing because the prompt construction is not operating as intended. This document explains how to repair the process so that the method is sound. 

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

# Prompt Construction Repair Work Plan

This document outlines the TDD-based approach to systematically diagnose and repair the prompt construction failure in the dialectic worker.

## Phase 1: Isolate the Bug by Disabling History Masking

This phase will prove the bug by disabling the `chat_id`, which will prevent the `/chat` function from masking the upstream prompt assembly failure. This is both a diagnostic step and a permanent business logic change.

*   `[✅]` 1. **Isolate Upstream Failure**
    *   `[✅]` 1.a. `[BE]` In `supabase/functions/dialectic-service/callModel.ts`, modify the `callUnifiedAIModel` function to ensure the `chatId` is never passed for dialectic jobs. The line `chatId: associatedChatId === null ? undefined : associatedChatId,` will be changed to `chatId: undefined,`.
    *   `[✅]` 1.b. `[TEST-INT]` Manually invoke the full pipeline for a stage that is currently failing with a token limit error (e.g., `paralysis`).
    *   `[✅]` 1.c. `[TEST-INT]` Observe the output. The process should now fail differently: instead of a token limit error, the AI should produce a nonsensical output based only on the short seed prompt. This definitively proves the prompt construction is broken.
    *   `[✅]` 1.d. **Architecturally Isolate Dialectic Jobs from Chat DB Operations**
        *   `[✅]` 1.d.i. `[BE]` In `supabase/functions/_shared/types.ts`, add a new optional boolean flag `isDialectic?: boolean` to the `ChatApiRequest` interface.
        *   `[✅]` 1.d.ii. `[BE]` In `supabase/functions/dialectic-service/callModel.ts`, update the `callUnifiedAIModel` function to add `isDialectic: true` to the `chatApiRequest` payload it sends.
        *   `[✅]` 1.d.iii. `[REFACTOR]` **Create New Dialectic Handler:**
            *   `[✅]` 1.d.iii.1. Create a new file `supabase/functions/chat/handleDialecticPath.ts` by copying the contents of `handleNormalPath.ts`.
            *   `[✅]` 1.d.iii.2. Create a corresponding test file `supabase/functions/chat/handleDialecticPath.test.ts` by copying `handleNormalPath.test.ts`. Update the tests to import and call the new `handleDialecticPath` function.
        *   `[✅]` 1.d.iv. `[BE]` **Route to New Handler:**
            *   `[✅]` 1.d.iv.1. In `supabase/functions/chat/handlePostRequest.ts`, add the new `handleDialecticPath` to the function's dependencies.
            *   `[✅]` 1.d.iv.2. Modify the logic to check for `requestBody.isDialectic`. If `true`, call `handleDialecticPath`. Otherwise, call `handleNormalPath`.
        *   `[✅]` 1.d.v. `[TEST-UNIT]` **Write Failing Test for DB Interaction:**
            *   `[✅]` 1.d.v.1. In the new `supabase/functions/chat/handleDialecticPath.test.ts`, create a new, independent test case named `'should not create chat or message records'`.
            *   `[✅]` 1.d.v.2. In the test, provide a `requestBody` with `isDialectic: true`.
            *   `[✅]` 1.d.v.3. Spy on the `supabaseClient.from('chats').insert` and `supabaseClient.from('chat_messages').insert` methods.
            *   `[✅]` 1.d.v.4. Run `handleDialecticPath`.
            *   `[✅]` 1.d.v.5. Assert that neither of the `insert` spies were called.
            *   `[✅]` 1.d.v.6. **Execute the test and confirm it fails (RED).**
        *   `[✅]` 1.d.vi. `[BE]` **Implement the Fix:**
            *   `[✅]` 1.d.vi.1. In `supabase/functions/chat/handleDialecticPath.ts`, remove the call to `findOrCreateChat`.
            *   `[✅]` 1.d.vi.2. Remove the database transaction block within the call to `debitTokens`. The `debitTokens` function itself will still be called to perform the token accounting against the wallet, but its callback that saves `chat_messages` will be removed. The function will simply call the AI adapter and return the `assistantMessage`.
        *   `[✅]` 1.d.vii. `[TEST-UNIT]` **Confirm Fix:**
            *   `[✅]` 1.d.vii.1. Rerun the test from step 1.d.v.
            *   `[✅]` 1.d.vii.2. **Confirm the test now passes (GREEN).**


## Phase 2: Repair `processSimpleJob` with TDD

This phase will add failing unit tests to prove the specific failures in `processSimpleJob`, fix the code, and then confirm the fix by running the same tests to see them pass.

*   `[ ]` 2. **Prove and Fix Prompt Assembly Failure**
    *   `[ ]` 2.a. `[TEST-UNIT]` **Write Failing Test for Assembler Call:**
        *   `[ ]` 2.a.i. Add a new, independent test case to `supabase/functions/dialectic-worker/processSimpleJob.test.ts` named `'should call promptAssembler.assemble to construct the full prompt'`.
        *   `[ ]` 2.a.ii. In the test, spy on the `promptAssembler.assemble` method.
        *   `[ ]` 2.a.iii. Run `processSimpleJob`.
        *   `[ ]` 2.a.iv. Assert that the `assemble` spy was called exactly once.
        *   `[ ]` 2.a.v. **Execute the test and confirm it fails (RED).**
    *   `[ ]` 2.b. `[TEST-UNIT]` **Write Failing Test for Prompt Content:**
        *   `[ ]` 2.b.i. Add a new, independent test case to `supabase/functions/dialectic-worker/processSimpleJob.test.ts` named `'should pass the fully assembled prompt to the executor'`.
        *   `[ ]` 2.b.ii. Mock `promptAssembler.assemble` to return a known string containing a unique identifier (e.g., `'VALID_ASSEMBLED_PROMPT_EVIDENCE'`).
        *   `[ ]` 2.b.iii. Spy on `executeModelCallAndSave` and add a log statement to print the `renderedPrompt.content` it receives.
        *   `[ ]` 2.b.iv. Assert that the `renderedPrompt.content` received by the spy includes `'VALID_ASSEMBLED_PROMPT_EVIDENCE'`.
        *   `[ ]` 2.b.v. **Execute the test and confirm it fails (RED).** The log output will visually confirm the incomplete prompt is being passed.
    *   `[ ]` 2.c. `[BE]` **Implement the Fix:**
        *   `[ ]` 2.c.i. In `supabase/functions/dialectic-worker/processSimpleJob.ts`, after `gatherInputsForStage` (line 130), add a call to `deps.promptAssembler.assemble`. This will require passing the necessary context (project, session, stage, etc.).
        *   `[ ]` 2.c.ii. Use the result of the `assemble` call to populate the `renderedPrompt.content` that is passed to `executeModelCallAndSave`.
    *   `[ ]` 2.d. `[TEST-UNIT]` **Confirm Fix:**
        *   `[ ]` 2.d.i. Rerun the tests added in steps 2.a and 2.b.
        *   `[ ]` 2.d.ii. **Confirm both tests now pass (GREEN).**

## Phase 3: Repair `executeModelCallAndSave` with TDD

This phase will prove that the token check logic is flawed and then repair it.

*   `[ ]` 3. **Prove and Fix Flawed Token Calculation**
    *   `[ ]` 3.a. `[TEST-UNIT]` **Write Failing Test for Token Calculation:**
        *   `[ ]` 3.a.i. Add a new, independent test case to `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts` named `'should use source documents for token estimation before prompt assembly'`.
        *   `[ ]` 3.a.ii. Pass a short `renderedPrompt` but a `sourceDocuments` array with content large enough to exceed a mock token limit.
        *   `[ ]` 3.a.iii. Spy on `deps.ragService` and `deps.countTokensForMessages`. Log the content and token count calculated by the spy.
        *   `[ ]` 3.a.iv. Assert that `deps.ragService` **is called**.
        *   `[ ]` 3.a.v. **Execute the test and confirm it fails (RED).** The log output will visually confirm the check was performed on the wrong content.
    *   `[ ]` 3.b. `[REFACTOR]` **Implement the Fix:**
        *   `[ ]` 3.b.i. In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, modify the token check logic (around line 82). It must now create its `messagesForTokenCounting` array from the content of the `params.sourceDocuments` array, *not* from `renderedPrompt.content`.
    *   `[ ]` 3.c. `[TEST-UNIT]` **Confirm Fix:**
        *   `[ ]` 3.c.i. Rerun the test from step 3.a.
        *   `[ ]` 3.c.ii. **Confirm the test now passes (GREEN).**

## Phase 4: Harden Integration and Regression Tests

This phase ensures the fixes are validated at a higher level and are protected against future regressions.

*   `[ ]` 4. **Update Integration Test for Verbose Proof**
    *   `[ ]` 4.a. `[TEST-INT]` Modify `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`.
    *   `[ ]` 4.b. `[TEST-INT]` In the test dependencies, intercept the call to `executeModelCallAndSave` and add verbose logging to print:
        *   `[ ]` 4.b.i. The full content of the `renderedPrompt` to prove it was correctly assembled.
        *   `[ ]` 4.b.ii. The content that the `countTokensForMessages` function is evaluating, to prove the token check is on the right data.
    *   `[ ]` 4.c. `[TEST-INT]` Add a new integration test case that uses a large volume of source document content, specifically designed to exceed a model's token limit.
    *   `[ ]` 4.d. `[TEST-INT]` Within this new test, spy on the `ragService` dependency.
    *   `[ ]` 4.e. `[TEST-INT]` Assert that the `ragService` spy was called, proving the RAG logic was correctly triggered by the integration test.
*   `[ ]` 5. **Add Regression Test for `chat_id`**
    *   `[ ]` 5.a. `[TEST-UNIT]` Add a new test to `supabase/functions/dialectic-service/callModel.test.ts`.
    *   `[ ]` 5.b. `[TEST-UNIT]` The test will call `callUnifiedAIModel` and spy on the underlying `fetch` call.
    *   `[ ]` 5.c. `[TEST-UNIT]` It will assert that the `chatId` property in the request body sent to the `/chat` function is `undefined`. This ensures the history-masking workaround can never be accidentally reintroduced.

## Phase 5: Documentation

*   `[ ]` 6. **Update Architecture Document**
    *   `[ ]` 6.a. `[DOCS]` Update `docs/implementations/Current/Documentation/Dialectic Architecture.md` to reflect the final, corrected architecture and data flow.

*   `[ ]` 7. `[COMMIT]` Commit all changes with a `fix:` prefix, referencing the resolved issue.
