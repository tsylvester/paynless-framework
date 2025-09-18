

## Instructions for Agent
*   You MUST read the file every time you need to touch it. YOU CAN NOT RELY ON YOUR "MEMORY" of having read a file at some point previously. YOU MUST READ THE FILE FROM DISK EVERY TIME! 
*   You MUST read the file BEFORE YOU TRY TO EDIT IT. Your edit WILL NOT APPLY if you do not read the file. 
*   To edit a file, READ the file so you have its state. EDIT the file precisely, ONLY changing EXACTLY what needs modified and nothing else. Then READ the file to ensure the change applied. 
*   DO NOT rewrite files or refactor functions unless explicitly instructed to. 
*   DO NOT write to a file you aren't explicitly instructed to edit. 
*   We use strict explicit typing everywhere, always. 
    * There are only two exceptions: 
        * We cannot strictly type Supabase clients
        * When we test graceful error handling, we often need to pass in malformed objects that must be typecast to pass linting to permit testing of improperly shaped objects. 
*   We only edit a SINGLE FILE at a time. We NEVER edit multiple files in one turn.
*   We do EXACTLY what the instruction in the checklist step says without exception.
*   If we cannot perform the step as described or make a discovery, we explain the problem or discovery and HALT! We DO NOT CONTINUE after we encounter a problem or a discovery.
*   We DO NOT CONTINUE if we encounter a problem or make a discovery. We explain the problem or discovery then halt for user input. 
*   If our discovery is that more files need to be edited, instead of editing a file, we generate a proposal for a checklist of instructions to insert into the work plan that explains everything required to update the codebase so that the invalid step can be resolved. 
*   DO NOT RUMINATE ON HOW TO SOLVE A PROBLEM OR DISCOVERY WHILE ONLY EDITING ONE FILE! That is a DISCOVERY that requires that you EXPLAIN your discovery, PROPOSE a solution, and HALT! 
*   We always use test-driven-development. 
    *   We write a RED test that we expect to fail to prove the flaw or incomplete code. 
        *   A RED test is written to the INTENDED SUCCESS STATE so that it is NOT edited again. Do NOT refer to "RED: x condition now, y condition later", which forces the test to be edited after the GREEN step. Do NOT title the test to include any reference to RED/GREEN. Tests are stateless. 
        *   We implement the edit to a SINGLE FILE to enable the GREEN state.
        *   We run the test again and prove it passes. We DO NOT edit the test unless we discover the test is itself flawed. 
*   EVERY EDIT is performed using TDD. We DO NOT EDIT ANY FILE WITHOUT A TEST. 
    *   Documents, types, and interfaces cannot be tested, so are exempt. 
*   Every edit is documented in the checklist of instructions that describe the required edits. 
*   Whenever we discover an edit must be made that is not documented in the checklist of instructions, we EXPLAIN the discovery, PROPOSE an insertion into the instruction set that describes the required work, and HALT. 
    *   We build dependency ordered instructions so that the dependencies are built, tested, and working before the consumers of the dependency. 
*   We use dependency injection for EVERY FILE. 
*   We build adapters and interfaces for EVERY FUNCTION.  
*   We edit files from the lowest dependency on the tree up to the top so that our tests can be run at every step.
*   We PROVE tests pass before we move to the next file. We NEVER proceed without explicit demonstration that the tests pass. 
*   The tests PROVE the functional gap, PROVE the flaw in the function, and prevent regression by ensuring that any changes MUST comply with the proof. 
*   Our process to edit a file is: 
    *   READ the instruction for the step, and read every file referenced by the instruction or step, or implicit by the instruction or step (like types and interfaces).
    *   ANALYZE the difference between the state of the file and the state described by the instructions in the step.
    *   EXPLAIN how the file must be edited to transform it from its current state into the state described by the instructions in the step. 
    *   PROPOSE an edit to the file that will accomplish the transformation while preserving strict explicit typing. 
    *   LINT! After editing the file, run your linter and fix all linter errors that are fixable within that single file. 
    *   HALT! After editing ONE file and ensuring it passes linting, HALT! DO NOT CONTINUE! 
*   The agent NEVER runs tests. 
*   The agent uses ITS OWN TOOLS. 
*   The agent DOES NOT USE THE USER'S TERMINAL. 

## Legend - You must use this EXACT format. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and numbering are ABSOLUTELY MANDATORY and UNALTERABLE. 

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

## Implementation Checklist

*   `[✅]` 1. `[TEST-UNIT]` Create a failing test for `prompt-assembler.ts`.
    *   `[✅]` 1.a. Locate and read the test file for `prompt-assembler.ts`.
    *   `[✅]` 1.b. Add a new test case to the test file for the `gatherContinuationInputs` function that simulates a multi-turn continuation scenario (e.g., 3 turns).
    *   `[✅]` 1.c. The test will assert that the returned `Messages[]` array has a strictly alternating user/assistant role sequence, with each user turn after the first containing "Please continue.". This test is expected to fail.
*   `[✅]` 2. `[TEST-UNIT]` Verify the fix for `prompt-assembler.ts`.
    *   `[✅]` 2.a. Run the tests for `prompt-assembler.ts` and confirm that the new test now passes.
*   `[✅]` 3. `[TEST-UNIT]` Create a failing test for `prompt-assembler.ts` to expose the missing root chunk bug.
    *   `[✅]` 3.a. A new test case `gatherContinuationInputs includes root chunk when no other chunks are found` has been added.
    *   `[✅]` 3.b. The test provides only a root chunk to `gatherContinuationInputs` and asserts that the returned `Messages[]` array contains the root chunk content. This test is confirmed to be failing.
*   `[✅]` 4. `[BE]` Fix the implementation in `prompt-assembler.ts`.
    *   `[✅]` 4.a. Modify the `gatherContinuationInputs` function to ensure that if no other continuation chunks are found, the initial root chunk is still processed and included in the returned messages.
*   `[✅]` 5. `[TEST-UNIT]` Verify the fix for `prompt-assembler.ts`.
    *   `[✅]` 5.a. Run the tests for `prompt-assembler.ts` and confirm that the `gatherContinuationInputs includes root chunk when no other chunks are found` test now passes.
*   `[✅]` 6. `[TEST-UNIT]` Create a failing test to correct overbroad `prompt-assembler.ts` fix.
    *   `[✅]` 6.a. Add a new test case to `prompt-assembler.test.ts` that calls `gatherContinuationInputs`.
    *   `[✅]` 6.b. The test will assert that the final message in the returned `Messages[]` array has the role `assistant`, proving that the assembler is *not* adding the final user turn. This test will fail with the current implementation.
*   `[✅]` 7. `[BE]` Fix the implementation in `prompt-assembler.ts`.
    *   `[✅]` 7.a. Modify the loop in `gatherContinuationInputs` to no longer append the final `"Please continue."` user message to the history. The history should always end with the last assistant chunk.
*   `[✅]` 8. `[TEST-UNIT]` Verify the fix for `prompt-assembler.ts`.
    *   `[✅]` 8.a. Run the tests for `prompt-assembler.ts` and confirm that the new test from step 6 now passes.
*   `[✅]` 9. `[TEST-UNIT]` Create a failing test for `executeModelCallAndSave.ts`.
    *   `[✅]` 9.a. Locate and read the test file for `executeModelCallAndSave.ts`.
    *   `[✅]` 9.b. Add or modify a test case that provides a correctly formed, alternating message history (as now produced by the fixed `prompt-assembler.ts`) as input.
    *   `[✅]` 9.c. The test will assert that the payload sent to the AI model does *not* contain empty user messages, proving that `enforceStrictTurnOrder` is no longer needed. This test will fail if the function still exists and is called.
*   `[✅]` 10. `[REFACTOR]` Remove the workaround from `executeModelCallAndSave.ts`.
    *   `[✅]` 10.a. Remove the `enforceStrictTurnOrder` function definition.
    *   `[✅]` 10.b. Remove all calls to `enforceStrictTurnOrder` within `executeModelCallAndSave.ts`.
*   `[✅]` 11. `[TEST-UNIT]` Verify the refactor of `executeModelCallAndSave.ts`.
    *   `[✅]` 11.a. Run the tests for `executeModelCallAndSave.ts` and confirm that all tests, including the one added in step 7, now pass.
*   `[✅]` 12. `[TEST-UNIT]` Create a failing test for `vector_utils.ts` to prove flawed anchor preservation.
    *   `[✅]` 12.a. Locate and read the test file `supabase/functions/_shared/utils/vector_utils.test.ts`.
    *   `[✅]` 12.b. Add a new test case that provides a long conversation history to the `scoreHistory` function.
    *   `[✅]` 12.c. The test will assert that the correct messages are excluded from the compression candidates, specifically proving that the `system` prompt, the first user turn (first user message and subsequent assistant message), and the last four messages (`assistant`, `user`, `assistant`, `user`) are all preserved as immutable anchors. This test is expected to fail with the current implementation.
    *   `[🚧]` 12.d. **Note:** This test passed unexpectedly due to overlapping positional and role-based logic. While the desired outcome was achieved, the underlying mechanism is brittle. A new test is required to prove the specific failure case.
*   `[✅]` 13. `[TEST-UNIT]` Create a new failing test for `vector_utils.ts` to prove the flaw with non-alternating roles.
    *   `[✅]` 13.a. Add a new test case to `supabase/functions/_shared/utils/vector_utils.test.ts`.
    *   `[✅]` 13.b. The test will provide a conversation history where the last four messages contain two consecutive assistant messages (e.g., `[..., User, Assistant, Assistant, User]`).
    *   `[✅]` 13.c. The test will assert that all four of these last messages are preserved as immutable. This test is expected to fail because the current logic's positional and role-based checks will not correctly combine to protect the first message in this sequence (`User`).
*   `[✅]` 14. `[BE]` Fix the anchor preservation logic in `vector_utils.ts`.
    *   `[✅]` 14.a. Refactor the `scoreHistory` function to use a single, explicit rule for preserving anchors.
    *   `[✅]` 14.b. The head preservation will be: the first message if `role: 'system'`, plus the next two messages (the first full user/assistant turn).
    *   `[✅]` 14.c. The tail preservation will be a simple, non-conditional preservation of the last 4 messages. The complex role-aware logic for the tail will be removed.
*   `[✅]` 15. `[TEST-UNIT]` Verify the fix for `vector_utils.ts`.
    *   `[✅]` 15.a. Run the tests for `vector_utils.ts` and confirm that all tests, including the new tests added in steps 12 and 13, now pass.
*   `[🚧]` 16. `[TEST-UNIT]` Fix downstream dependency tests broken by `vector_utils.ts` refactor.
    *   `[🚧]` 16.a. Fix the `should throw ContextWindowError if compression fails...` test in `executeModelCallAndSave.rag.test.ts`.
        *   `[✅]` 16.a.i. Read the file `supabase/functions/dialectic-worker/executeModelCallAndSave.rag.test.ts`.
        *   `[✅]` 16.a.ii. Modify the test's `conversationHistory` to be 8 messages long instead of 7. This creates a valid compressible middle message under the new `3 head + 4 tail` anchor rule, allowing the test to correctly exercise its intended logic.
    *   `[✅]` 16.b. Fix the `should perform affordable compression, checking balance once` test in `executeModelCallAndSave.tokens.test.ts`.
        *   `[✅]` 16.b.i. Read the file `supabase/functions/dialectic-worker/executeModelCallAndSave.tokens.test.ts`.
        *   `[✅]` 16.b.ii. Modify the test's `conversationHistory` to be 8 messages long instead of 7. This will create a valid compressible message, allowing the test to correctly validate the affordability and compression logic.
*   `[✅]` 17. `[TEST-UNIT]` Final verification of all changes.
    *   `[✅]` 17.a. Run all tests for `dialectic-worker` and confirm that all tests now pass after the dependency fixes.