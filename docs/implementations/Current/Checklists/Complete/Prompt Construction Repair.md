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

*   `[✅]` 2. **Prove and Fix Prompt Assembly Failure**
    *   `[✅]` 2.a. `[TEST-UNIT]` **Write Failing Test for Assembler Call:**
        *   `[✅]` 2.a.i. Add a new, independent test case to `supabase/functions/dialectic-worker/processSimpleJob.test.ts` named `'should call promptAssembler.assemble to construct the full prompt'`.
        *   `[✅]` 2.a.ii. In the test, spy on the `promptAssembler.assemble` method.
        *   `[✅]` 2.a.iii. Run `processSimpleJob`.
        *   `[✅]` 2.a.iv. Assert that the `assemble` spy was called exactly once.
        *   `[✅]` 2.a.v. **Execute the test and confirm it fails (RED).**
    *   `[✅]` 2.b. `[TEST-UNIT]` **Write Failing Test for Prompt Content:**
        *   `[✅]` 2.b.i. Add a new, independent test case to `supabase/functions/dialectic-worker/processSimpleJob.test.ts` named `'should pass the fully assembled prompt to the executor'`.
        *   `[✅]` 2.b.ii. Mock `promptAssembler.assemble` to return a known string containing a unique identifier (e.g., `'VALID_ASSEMBLED_PROMPT_EVIDENCE'`).
        *   `[✅]` 2.b.iii. Spy on `executeModelCallAndSave` and add a log statement to print the `renderedPrompt.content` it receives.
        *   `[✅]` 2.b.iv. Assert that the `renderedPrompt.content` received by the spy includes `'VALID_ASSEMBLED_PROMPT_EVIDENCE'`.
        *   `[✅]` 2.b.v. **Execute the test and confirm it fails (RED).** The log output will visually confirm the incomplete prompt is being passed.
    *   `[✅]` 2.c. `[BE]` **Implement the Fix:**
        *   `[✅]` 2.c.i. In `supabase/functions/dialectic-worker/processSimpleJob.ts`, after `gatherInputsForStage` (line 130), add a call to `deps.promptAssembler.assemble`. This will require passing the necessary context (project, session, stage, etc.).
        *   `[✅]` 2.c.ii. Use the result of the `assemble` call to populate the `renderedPrompt.content` that is passed to `executeModelCallAndSave`.
    *   `[✅]` 2.d. `[TEST-UNIT]` **Confirm Fix:**
        *   `[✅]` 2.d.i. Rerun the tests added in steps 2.a and 2.b.
        *   `[✅]` 2.d.ii. **Confirm both tests now pass (GREEN).**

## Phase 3: Repair `executeModelCallAndSave` with TDD

This phase will prove that the token check logic is flawed and then repair it.

*   `[✅]` 3. **Prove and Fix Flawed Token Calculation**
    *   `[✅]` 3.a. `[TEST-UNIT]` **Write Failing Test for Token Calculation:**
        *   `[✅]` 3.a.i. Add a new, independent test case to `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts` named `'should use source documents for token estimation before prompt assembly'`.
        *   `[✅]` 3.a.ii. Pass a short `renderedPrompt` but a `sourceDocuments` array with content large enough to exceed a mock token limit.
        *   `[✅]` 3.a.iii. Spy on `deps.ragService` and `deps.countTokensForMessages`. Log the content and token count calculated by the spy.
        *   `[✅]` 3.a.iv. Assert that `deps.ragService` **is called**.
        *   `[✅]` 3.a.v. **Execute the test and confirm it fails (RED).** The log output will visually confirm the check was performed on the wrong content.
    *   `[✅]` 3.b. `[REFACTOR]` **Implement the Fix:**
        *   `[✅]` 3.b.i. In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, modify the token check logic (around line 82). It must now create its `messagesForTokenCounting` array from the content of the `params.sourceDocuments` array, *not* from `renderedPrompt.content`.
    *   `[✅]` 3.c. `[TEST-UNIT]` **Confirm Fix:**
        *   `[✅]` 3.c.i. Rerun the test from step 3.a.
        *   `[✅]` 3.c.ii. **Confirm the test now passes (GREEN).**

## Phase 4: Harden AI Model Configuration Pipeline with TDD

This phase addresses the critical failure where model configurations in `seed.sql` became corrupted, failing validation against `zodSchema.ts`. We will use a strict TDD approach to inject validation at every step of the data pipeline, from initial assembly to final seeding.

*   `[✅]` 4. **Harden `config_assembler.ts`**
    *   `[✅]` 4.a. `[TEST-UNIT]` **Write Failing Test for Zod Validation:**
        *   `[✅]` 4.a.i. In `supabase/functions/sync-ai-models/config_assembler.test.ts`, create a new, independent test case named `'should produce configs that pass Zod schema validation'`.
        *   `[✅]` 4.a.ii. In the test, instantiate `ConfigAssembler` with mock data designed to produce an invalid configuration, specifically one with `tokenization_strategy: { type: "anthropic_tokenizer" }` which is missing the required `model` property, mirroring the error found in the logs.
        *   `[✅]` 4.a.iii. Call `assembler.assemble()`.
        *   `[✅]` 4.a.iv. For each resulting `config` object, call `AiModelExtendedConfigSchema.safeParse()`.
        *   `[✅]` 4.a.v. Assert that the `safeParse` result's `success` property is `true`, and log the specific Zod error on failure.
        *   `[✅]` 4.a.vi. **Execute the test and confirm it fails (RED) with a `ZodError` on the `tokenization_strategy` path.**
    *   `[✅]` 4.b. `[BE]` **Implement the Fix:**
        *   `[✅]` 4.b.i. In `supabase/functions/sync-ai-models/config_assembler.ts`, modify the `assemble` logic. The `isConfigComplete` function is insufficient. The assembler must be updated to correctly construct a complete `AiModelExtendedConfig` object, satisfying all requirements of the Zod schema, especially for discriminated unions like `tokenization_strategy`.
    *   `[✅]` 4.c. `[TEST-UNIT]` **Confirm Fix:**
        *   `[✅]` 4.c.i. Rerun the test from step 4.a.
        *   `[✅]` 4.c.ii. **Confirm the test now passes (GREEN).**

## Phase 5: Harden Provider Sync Pipeline with Two-Layered Validation

This phase implements a defense-in-depth testing strategy to ensure that no malformed AI model configuration data—whether hardcoded in static assets or dynamically generated by the assembler—can enter the database. This is accomplished by adding validation at two critical points: the source (static maps) and the point of use (the sync contract).

*   `[✅]` 5. **Layer 1: Validate Static Assets at the Source**
    *   `[✅]` 5.a. `[TEST-UNIT]` **Write Failing Tests for `INTERNAL_MODEL_MAP`:**
        *   `[✅]` 5.a.i. For each provider sync file (e.g., `anthropic_sync.ts`), add a new, independent test case to its corresponding `.test.ts` file named `'INTERNAL_MODEL_MAP should contain valid partial configs'`.
        *   `[✅]` 5.a.ii. In this test, iterate through each entry in the provider's `INTERNAL_MODEL_MAP`.
        *   `[✅]` 5.a.iii. For each entry, use `AiModelExtendedConfigSchema.partial().safeParse()` to validate the partial config object.
        *   `[✅]` 5.a.iv. Assert that the validation's `success` property is `true`. This test is designed to catch invalid structures within the hardcoded maps *before* they are even used by the assembler.
        *   `[✅]` 5.a.v. **Execute the tests and confirm they fail (RED) for any provider with an invalid map (e.g., the `anthropic_tokenizer` missing its `model` property).**
    *   `[✅]` 5.b. `[BE]` **Implement the Fix:**
        *   `[✅]` 5.b.i. In each provider's sync file (e.g., `anthropic_sync.ts`), correct all malformed entries in the `INTERNAL_MODEL_MAP` to ensure they conform to the schema.
    *   `[✅]` 5.c. `[TEST-UNIT]` **Confirm Fix:**
        *   `[✅]` 5.c.i. Rerun the tests from step 5.a.
        *   `[✅]` 5.c.ii. **Confirm all tests now pass (GREEN).**

*   `[✅]` 6. **Layer 2: Validate Dynamic Output in `diffAndPrepareDbOps`**
    *   `[✅]` 6.a. `[TEST-UNIT]` **Write Failing Test for Pre-DB Validation:**
        *   `[✅]` 6.a.i. In `supabase/functions/sync-ai-models/diffAndPrepareDbOps.test.ts`, create a new test case `'should filter out models with invalid configs'`.
        *   `[✅]` 6.a.ii. Provide a mix of valid and invalid `AssembledModelConfig` objects as input to `diffAndPrepareDbOps`. The invalid config should fail `AiModelExtendedConfigSchema` validation.
        *   `[✅]` 6.a.iii. Assert that the returned `modelsToInsert` and `modelsToUpdate` arrays only contain models with valid configs. The invalid one should be discarded.
        *   `[✅]` 6.a.iv. Spy on the logger to ensure an error was logged for the invalid model.
        *   `[✅]` 6.a.v. **Execute the test and confirm it fails (RED).**
    *   `[✅]` 6.b. `[BE]` **Implement the Fix:**
        *   `[✅]` 6.b.i. In `supabase/functions/sync-ai-models/diffAndPrepareDbOps.ts`, before any diffing logic, add a pre-processing step to validate all incoming `AssembledModelConfig` objects.
        *   `[✅]` 6.b.ii. Use `AiModelExtendedConfigSchema.safeParse()` on each model's `.config` property.
        *   `[✅]` 6.b.iii. If validation fails, log a detailed error using the provided `logger` and filter the invalid model out, preventing it from ever being diffed or queued for a DB operation.
    *   `[✅]` 6.c. `[TEST-UNIT]` **Confirm Fix:**
        *   `[✅]` 6.c.i. Rerun the test from step 6.a.
        *   `[✅]` 6.c.ii. **Confirm the test now passes (GREEN).**

*   `[✅]` 7. **Harden `update-seed.ts`**
    *   `[✅]` 7.a. `[TEST-UNIT]` **Write Failing Test for Zod Validation:**
        *   `[✅]` 7.a.i. In `supabase/scripts/update-seed.test.ts`, create a test `'should throw a fatal error if a config from the database is invalid'`.
        *   `[✅]` 7.a.ii. Mock the database client to return a row where the `config` column contains the invalid `anthropic_tokenizer` JSON observed in the logs.
        *   `[✅]` 7.a.iii. Assert that calling `updateSeedFile` throws a `ZodError`.
        *   `[✅]` 7.a.iv. **Execute the test and confirm it fails (RED).**
    *   `[✅]` 7.b. `[BE]` **Implement the Fix:**
        *   `[✅]` 7.b.i. In `supabase/scripts/update-seed.ts`, within the `map` function that generates the `insertStatements`, parse the `config` JSON from each row.
        *   `[✅]` 7.b.ii. Use `AiModelExtendedConfigSchema.parse()` (not `safeParse`) to validate the parsed config. This will automatically throw an error on failure.
        *   `[✅]` 7.b.iii. Wrap the entire process in a `try...catch` block that reports the Zod error details and exits the script with a non-zero code, preventing the corrupted `seed.sql` file from being written.
    *   `[✅]` 7.c. `[TEST-UNIT]` **Confirm Fix:**
        *   `[✅]` 7.c.i. Rerun the test from step 7.a.
        *   `[✅]` 7.c.ii. **Confirm the test now passes (GREEN).**
        *   `[✅]` 7.c.iii. Create a final test with valid data to ensure the happy path still works correctly.

*   `[✅]` 8. `[COMMIT]` Commit all changes with a `fix:` prefix, referencing the model configuration corruption issue.

## Phase 5: Architecturally Isolate Provider Data from Application Config

**Rationale:** This phase corrects the core architectural flaw where the data structure for what a provider sends us (`ProviderModelInfo`) was conflated with the data structure our application requires (`AiModelExtendedConfig`). This conflation led to an ambiguous data contract, forcing the creation of brittle, complex, and ultimately incorrect assembly logic. This new phase introduces a clean separation of concerns by defining a new, strict data type for a fully-validated application configuration and refactoring the assembler to be a simple, robust factory for this new type.

*   `[✅]` 9. **[REFACTOR] Decouple Unreliable Provider Input from Strict Application Output**
    *   `[✅]` 9.a. `[BE]` **Define a Strict Application-Ready Config Contract:**
        *   `[✅]` 9.a.i. In `supabase/functions/_shared/types.ts`, the current `AssembledModelConfig` type is insufficient as it does not enforce the completeness of the nested `config` object.
        *   `[✅]` 9.a.ii. Create a new, unambiguous interface named `FinalAppModelConfig`. This interface explicitly separates the model's identity from its now-guaranteed-complete configuration:
            ```typescript
            export interface FinalAppModelConfig {
              api_identifier: string;
              name: string;
              description: string;
              // Note: The 'config' property is NOT optional and NOT partial.
              // It must be a complete, valid object.
              config: AiModelExtendedConfig; 
            }
            ```
        *   `[✅]` 9.a.iii. The `ConfigAssembler.assemble` method's return signature will be updated to `Promise<FinalAppModelConfig[]>`, making its purpose clear: it transforms unreliable inputs into application-ready outputs.
    *   `[✅]` 9.b. `[TEST-UNIT]` **Write Failing Test for New "Top-Down" Assembler:**
        *   `[✅]` 9.b.i. In `supabase/functions/sync-ai-models/config_assembler.test.ts`, create a new, independent test case named `'assemble should produce a valid FinalAppModelConfig using a top-down strategy'`.
        *   `[✅]` 9.b.ii. Provide mock data sources designed to be layered: a base API model, an `internalModelMap` with a partial `tokenization_strategy` (e.g., `{ type: 'anthropic_tokenizer' }` without the `model`), and no external capabilities.
        *   `[✅]` 9.b.iii. The test should expect the assembler to throw a `ZodError` because the final merged object is invalid.
        *   `[✅]` 9.b.iv. **Execute the test against the current assembler logic and confirm it fails to throw an error (RED), proving the current implementation silently produces corrupt data.**
    *   `[✅]` 9.c. `[TEST-UNIT]` **Write Failing Test for Default-Only Model Assembly:**
        *   **Rationale:** The current implementation has two flaws: it ignores the `baseConfig` by starting its merge from an empty object, and it fails to add the `api_identifier` before validation. This test will prove these bugs by providing a model with no configuration, which should succeed by falling back to defaults, but will instead fail.
        *   `[✅]` 9.c.i. In `supabase/functions/sync-ai-models/config_assembler.test.ts`, create a new, independent test case named `'should throw an error when assembling a model that relies only on defaults, proving the bug'`.
        *   `[✅]` 9.c.ii. In the test, provide an `apiModel` with no `.config` property. Provide no other map sources.
        *   `[✅]` 9.c.iii. Call `assembler.assemble()` and use `assertRejects` to assert that it throws a `ZodError`.
        *   `[✅]` 9.c.iv. **Execute the test and confirm it passes (RED), which perversely proves the presence of the bug by showing the function fails when it should succeed.**
    *   `[✅]` 9.d. `[BE]` **Implement the Assembler Fix:**
        *   `[✅]` 9.d.i. In `supabase/functions/sync-ai-models/config_assembler.ts`, locate the `reduce` function (line ~114). Modify it to use the `baseConfig` as its initial value, instead of an empty object `{}`.
        *   `[✅]` 9.d.ii. Immediately after the `reduce` function, add a line to explicitly set the `api_identifier` on the `mergedConfig` object before it is passed to the Zod parser: `mergedConfig.api_identifier = apiModel.api_identifier;`.
    *   `[✅]` 9.e. `[TEST-UNIT]` **Confirm Fix and Harden Tests:**
        *   `[✅]` 9.e.i. Modify the test from step 9.c. Change its name to `'should successfully assemble a model using only defaults'`.
        *   `[✅]` 9.e.ii. Remove the `assertRejects` call. Instead, await the result of `assembler.assemble()` and assert that it returns a valid `FinalAppModelConfig` where the properties match the expected default values.
        *   `[✅]` 9.e.iii. **Execute the modified test and confirm it now passes (GREEN).**
        *   `[✅]` 9.e.iv. Rerun the entire test suite for `config_assembler.test.ts`, including the test that asserts a throw for an invalid partial config, to ensure no regressions were introduced. **Confirm all tests pass.**
    *   `[✅]` 9.f. `[BE]` **Update Downstream Consumers:**
        *   `[✅]` 9.f.i. In `supabase/functions/sync-ai-models/diffAndPrepareDbOps.ts`, update the function signature to accept `assembledConfigs: FinalAppModelConfig[]`.
        *   `[✅]` 9.f.ii. Remove any now-redundant validation logic from this file, as the assembler's output is now guaranteed to be valid. The function's sole responsibility is to diff and prepare database operations.
    *   `[✅]` 9.g. `[TEST-UNIT]` **Update `diffAndPrepareDbOps` Tests:**
        *   `[✅]` 9.g.i. Modify the tests in `diffAndPrepareDbOps.test.ts` to construct and pass `FinalAppModelConfig` objects as input, matching the new, stricter contract.
        *   `[✅]` 9.g.ii. **Confirm all tests for `diffAndPrepareDbOps` pass (GREEN).**

## Phase 5.5: Validate and Sanitize Model Configs from Assembly to Database

**Rationale:** The core data corruption originates from two critical flaws. First, the `ConfigAssembler` uses a faulty merge strategy that produces schema-invalid configurations, particularly for the `tokenization_strategy` discriminated union. Second, when `diffAndPrepareDbOps` encounters a corrupted model in the database that it cannot repair with a valid assembled config, it merely deactivates the model without sanitizing the corrupted `config` data, leaving a time bomb for downstream processes like `update-seed.ts`. This phase implements a comprehensive TDD-based repair, ensuring every configuration is validated and the database is aggressively sanitized.

*   `[✅]` 9.h. **[REFACTOR] Harden `config_assembler.ts` to Guarantee Valid Output**
    *   `[✅]` 9.h.i. `[TEST-UNIT]` **Prove Existing Failures:**
        *   `[✅]` 9.h.i.1. Navigate to `supabase/functions`.
        *   `[✅]` 9.h.i.2. Execute the command `deno test --allow-all --env=../.env ./sync-ai-models/config_assembler.test.ts`.
        *   `[✅]` 9.h.i.3. Observe and confirm that the tests `'ConfigAssembler - should NOT crash...'` and `'ConfigAssembler - should validate every model...'` fail with a `ZodError` related to an invalid `tokenization_strategy`. This is our **RED** state, proving the assembler produces invalid data.
    *   `[✅]` 9.h.ii. `[BE]` **Implement a Correct Failsafe Default:**
        *   `[✅]` 9.h.ii.1. In `supabase/functions/sync-ai-models/config_assembler.ts`, locate the `DEFAULTS` constant within the `calculateDynamicDefaults` method.
        *   `[✅]` 9.h.ii.2. Change the `tokenization_strategy` from the conceptually incorrect `{ type: 'none' }` to the universally applicable and schema-valid `{ type: 'rough_char_count', chars_per_token_ratio: 4 }`. Do the same for the `defaults` object at the end of the method.
    *   `[✅]` 9.h.iii. `[BE]` **Implement Robust, Failsafe Assembly Logic:**
        *   `[✅]` 9.h.iii.1. In `supabase/functions/sync-ai-models/config_assembler.ts`, modify the `assemble` method.
        *   `[✅]` 9.h.iii.2. The current `reduce` call using `safeDeepMerge` is the source of the error. Replace it. The new logic will not merge `tokenization_strategy` but will select the first valid one.
        *   `[✅]` 9.h.iii.3. Before the final validation, explicitly check if the merged config's `tokenization_strategy` is valid using `TokenizationStrategySchema.safeParse()`.
        *   `[✅]` 9.h.iii.4. If it is NOT valid, log a warning and overwrite the invalid `mergedConfig.tokenization_strategy` with the correct failsafe default: `{ type: 'rough_char_count', chars_per_token_ratio: 4 }`.
        *   `[✅]` 9.h.iii.5. This ensures that the object passed to the final `AiModelExtendedConfigSchema.parse()` is always structurally valid, making the assembler's output guarantee stronger.
    *   `[✅]` 9.h.iv. `[TEST-UNIT]` **Confirm the Fix:**
        *   `[✅]` 9.h.iv.1. Re-execute the command `deno test --allow-all --env=../.env ./sync-ai-models/config_assembler.test.ts`.
        *   `[✅]` 9.h.iv.2. **Confirm all tests in the suite now pass (GREEN).**

*   `[✅]` 9.i. **[REFACTOR] Harden `diffAndPrepareDbOps.ts` to Sanitize the Database**
    *   `[✅]` 9.i.i. `[TEST-UNIT]` **Prove Existing Failure:**
        *   `[✅]` 9.i.i.1. Navigate to `supabase/functions`.
        *   `[✅]` 9.i.i.2. Execute `deno test --allow-all --env=../.env ./sync-ai-models/diffAndPrepareDbOps.test.ts`.
        *   `[✅]` 9.i.i.3. Observe and confirm that the test `'FAILING TEST V2: should handle a schema-invalid DB model when its corresponding assembled model is also invalid'` fails. This is our **RED** state.
    *   `[✅]` 9.i.ii. `[TEST-UNIT]` **Refactor the Failing Test to Expect Sanitization:**
        *   `[✅]` 9.i.ii.1. In `diffAndPrepareDbOps.test.ts`, rename the failing test to `'should queue a sanitizing UPDATE for a DB model that is irreparable'`.
        *   `[✅]` 9.i.ii.2. Modify the test's assertions. It should no longer check the `modelsToDeactivate` list. Instead, it must assert the following about the `modelsToUpdate` list:
            *   It should contain exactly one item.
            *   The item's `changes` property must include `is_active: false`.
            *   The item's `changes.config` property must be a complete, valid `AiModelExtendedConfig` object that passes schema validation.
        *   `[✅]` 9.i.ii.3. Rerun the test and confirm it still fails (**RED**), but now for the correct reason.
    *   `[✅]` 9.i.iii. `[BE]` **Implement the Sanitization Fix:**
        *   `[✅]` 9.i.iii.1. In `supabase/functions/sync-ai-models/diffAndPrepareDbOps.ts`, locate the logic block that handles when both the database and assembled configs are invalid (around line 83).
        *   `[✅]` 9.i.iii.2. Remove the line that pushes the model `id` to `modelsToDeactivate`.
        *   `[✅]` 9.i.iii.3. Instead, push a new object to the `modelsToUpdate` array. This object will contain the `id` of the corrupted model and a `changes` payload.
        *   `[✅]` 9.i.iii.4. The `changes` payload must contain `is_active: false` and a `config` property set to a valid, failsafe `AiModelExtendedConfig` object (e.g., based on the `DEFAULTS` from the assembler). This actively scrubs the bad data from the database.
    *   `[✅]` 9.i.iv. `[TEST-UNIT]` **Confirm the Fix:**
        *   `[✅]` 9.i.iv.1. Re-execute the test command: `deno test --allow-all --env=../.env ./sync-ai-models/diffAndPrepareDbOps.test.ts`.
        *   `[✅]` 9.i.iv.2. **Confirm all tests in the suite, including the refactored sanitization test, now pass (GREEN).**

*   `[✅]` 9.j. **[TEST-INT] End-to-End Pipeline Validation**
    *   `[ ]` 9.j.i. `[BE]` **Run the Full Sync and Seed Process:**
        *   `[✅]` 9.j.i.1. Manually trigger the `sync-ai-models` function for a provider known to have problematic models.
        *   `[✅]` 9.j.i.2. After the sync completes, execute the `update-seed.ts` script from the `supabase/scripts` directory: `deno run --allow-net --allow-read --allow-write ./update-seed.ts`.
        *   `[✅]` 9.j.i.3. **Confirm the script runs to completion without throwing a `ZodError`, proving that the database has been successfully sanitized and the seed file can be updated.**

*   `[✅]` 9.k. `[COMMIT]` Commit all changes with a `fix(sync)` prefix, detailing the repair of the model configuration and database sanitization pipeline.

## Phase 6: Harden Integration and Regression Tests

This phase ensures the fixes are validated at a higher level and are protected against future regressions.

*   `[ ]` 10. **Update Integration Test for Verbose Proof**
    *   `[ ]` 10.a. `[TEST-INT]` **Address Integration Test Failures**
        *   `[✅]` 10.a.i. **Root Cause Analysis:** The core failure originates in the `AIFactory`. Its logic detects the test environment (`SUPA_ENV=local`) and, to prevent real API calls, it was returning a generic, unconfigured `MockAdapter`. Downstream functions would then fail because this generic mock's config did not match the real model's config (e.g., for tokenization). The test also used outdated model identifiers that are no longer returned by provider APIs.
        *   `[✅]` 10.a.ii. **Solution - Smart Mocking:** The fix is to modify the `AIFactory`'s test-environment logic. Instead of a generic mock, it will now instantiate the `DummyAdapter`. Crucially, it will pass the *real* database configuration for the requested model (e.g., `openai-gpt-4o`) into this `DummyAdapter`. This allows the `DummyAdapter` to accurately simulate the real model's token counting and behavior without making costly API calls.
        *   `[✅]` 10.a.iii. **Solution - Test Data:** The integration test's setup helpers must be updated to upsert modern, valid AI provider configurations (`openai-gpt-4o`, `anthropic-claude-3-5-sonnet-20240620`) into the database, ensuring the Edge Functions have access to the necessary data.
        *   `[✅]` 10.a.iv. **Revised Test Strategy - TDD for Dummy Adapter:** The current failure point is that the integration test relies on a mock (`MockAiProviderAdapter`) that is no longer used, preventing it from simulating errors and continuations. The solution is to enhance the `DummyAdapter` to be a more capable test double. We will follow a strict TDD process to implement this.
        *   `[✅]` 10.a.v. **Create Failing Test for `DummyAdapter`:**
            *   `[✅]` 10.a.v.1. Create a new test file: `supabase/functions/_shared/ai_service/dummy_adapter.test.ts`.
            *   `[✅]` 10.a.v.2. Write test cases that prove the current `DummyAdapter` *cannot* simulate required behaviors: forced errors, partial `max_tokens` responses, and large generated outputs.
            *   `[✅]` 10.a.v.3. Run this test and prove that it fails.
        *   `[✅]` 10.a.vi. **Implement `DummyAdapter` Enhancements:**
            *   `[✅]` 10.a.vi.1. Modify `supabase/functions/_shared/ai_service/dummy_adapter.ts`.
            *   `[✅]` 10.a.vi.2. Implement keyword-driven simulation logic. The adapter will scan the prompt for keywords like `SIMULATE_ERROR`, `SIMULATE_MAX_TOKENS`, and `SIMULATE_LARGE_OUTPUT_KB=X` to alter its response dynamically.
        *   `[✅]` 10.a.vii. **Prove `DummyAdapter` Fix:**
            *   `[✅]` 10.a.vii.1. Run the `dummy_adapter.test.ts` again.
            *   `[✅]` 10.a.vii.2. Assert that all tests now pass, proving the `DummyAdapter` is working as designed.
        *   `[✅]` 10.a.viii. **Update Integration Test Logic:**
            *   `[✅]` 10.a.viii.1. Modify `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`.
            *   `[✅]` 10.a.viii.2. Remove all reliance on the old `mockAiAdapter.controls`.
            *   `[✅]` 10.a.viii.3. Instead, modify the `getSeedPromptForStage` dependency mock to inject the appropriate `SIMULATE_*` keywords into the prompt content before it is passed to the `DummyAdapter`. This will allow precise control over job outcomes (failure vs. continuation).
        *   `[✅]` 10.a.ix. **Validate Integration Test Progress:**
            *   `[✅]` 10.a.ix.1. Run `dialectic_pipeline.integration.test.ts` again.
            *   `[✅]` 10.a.ix.2. Expect that step 3 will now pass, as the retry and continuation logic can be correctly tested. Acknowledge that the test may fail on a subsequent, previously ignored step, which will become the new focus.

    *   `[✅]` 10.b. `[REFACTOR]` **Refactor Chat Handlers to Fix SRP Violation and Preserve `finish_reason`**
        *   `[✅]` 10.b.i. **Root Cause Analysis:** The `finish_reason` from the AI adapter is lost because the `databaseOperation` callback passed to `debitTokens` is responsible for constructing the final message objects. The calling handlers (`handleDialecticPath`, etc.) lose access to the original `adapterResponsePayload` after the `debitTokens` call completes, preventing them from adding the `finish_reason` to the final `ChatHandlerSuccessResponse`. This represents a Single Responsibility Principle violation, as the transactional function is too tightly coupled with the specifics of the data it is transacting.
        *   `[✅]` 10.b.ii. **Solution - Decouple Transaction from Response Construction:** The path handlers (`handleDialecticPath`, `handleNormalPath`, `handleRewindPath`) will be refactored to orchestrate the response construction. They will: 1. Call the AI adapter and store the complete `AdapterResponsePayload` locally. 2. Call `debitTokens`, passing a `databaseOperation` callback that only performs DB writes and returns the resulting message objects. 3. Receive the message objects back from `debitTokens`. 4. Construct the final `ChatHandlerSuccessResponse` by combining the message objects with the `finish_reason` from the stored `AdapterResponsePayload`. This preserves atomicity while fixing the SRP violation.
        *   `[✅]` 10.b.iii. `[TEST-UNIT]` **Create Failing Unit Test:**
            *   `[✅]` 10.b.iii.1. In `supabase/functions/chat/handleDialecticPath.test.ts`, create a new test that calls `handleDialecticPath`.
            *   `[✅]` 10.b.iii.2. Mock the `aiProviderAdapter.sendMessage` to return a payload containing `finish_reason: 'max_tokens'`.
            *   `[✅]` 10.b.iii.3. Assert that the final `ChatHandlerSuccessResponse` returned by the function includes the `finish_reason: 'max_tokens'` property.
            *   `[✅]` 10.b.iii.4. **Execute the test and confirm it fails (RED), proving the bug.**
        *   `[✅]` 10.b.iv. `[REFACTOR]` **Update `types.ts`:**
            *   `[✅]` 10.b.iv.1. In `supabase/functions/_shared/types.ts`, add the optional field `finish_reason?: FinishReason;` to the `ChatHandlerSuccessResponse` interface.
        *   `[✅]` 10.b.v. `[BE]` **Implement the Fix in `handleDialecticPath.ts`:**
            *   `[✅]` 10.b.v.1. Apply the refactoring logic described in `10.b.ii`. The function will now store the adapter response, call `debitTokens`, and then assemble the final response object itself.
        *   `[✅]` 10.b.vi. `[TEST-UNIT]` **Confirm Fix with Unit Test:**
            *   `[✅]` 10.b.vi.1. Rerun the test from step `10.b.iii`. **Confirm it now passes (GREEN).**
        *   `[✅]` 10.b.vii. `[TEST-INT]` **Confirm Fix with Integration Test:**
            *   `[✅]` 10.b.vii.1. Run the full integration test: `deno test --allow-all --env=../.env ./supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`.
            *   `[✅]` 10.b.vii.2. **Confirm the test now proceeds past the continuation step.** Acknowledge that it may fail on a subsequent, disabled step.
        *   `[✅]` 10.b.viii. `[REFACTOR]` **Apply Fix to Other Paths:**
            *   `[✅]` 10.b.viii.1. Apply the same refactoring pattern to `handleNormalPath.ts` and `handleRewindPath.ts` to ensure architectural consistency.
            *   `[✅]` 10.b.viii.2. Update their respective unit tests to assert that `finish_reason` is correctly passed through.
    *   `[🚧]` 10.c. `[REFACTOR]` **Fix Final Data Propagation Bugs**
        *   `[✅]` 10.c.i. **Root Cause Analysis:** A series of minor propagation errors were discovered.
            *   The `callUnifiedAIModel` function in `dialectic-service/callModel.ts` was not passing the `finish_reason` from the `/chat` response to its own `UnifiedAIResponse` return object.
            *   The integration test's `DummyAdapter` created an infinite loop. When simulating a `max_tokens` event, its response content included the simulation keyword, causing the continuation job to also simulate a `max_tokens` event.
        *   `[✅]` 10.c.ii. `[TEST-UNIT]` **Create Failing Test for `callModel.ts`:**
            *   `[✅]` 10.c.ii.1. In `supabase/functions/dialectic-service/callModel.test.ts`, add a test that provides a mock `/chat` response containing a `finish_reason`.
            *   `[✅]` 10.c.ii.2. Assert that the `finish_reason` is present in the final `UnifiedAIResponse`.
            *   `[✅]` 10.c.ii.3. **Run the test and confirm it fails (RED).**
        *   `[✅]` 10.c.iii. `[BE]` **Fix `callModel.ts`:**
            *   `[✅]` 10.c.iii.1. In `supabase/functions/dialectic-service/callModel.ts`, update the return object to include `finish_reason: chatResponse.finish_reason`.
        *   `[✅]` 10.c.iv. `[TEST-UNIT]` **Confirm `callModel.ts` Fix:**
            *   `[✅]` 10.c.iv.1. Rerun the test from step `10.c.ii`. **Confirm it now passes (GREEN).**
        *   `[✅]` 10.c.v. `[BE]` **Fix `DummyAdapter` Infinite Loop:**
            *   `[✅]` 10.c.v.1. In `supabase/functions/_shared/ai_service/dummy_adapter.ts`, modify the `SIMULATE_MAX_TOKENS` logic. The echoed content in the response must be cleaned of the simulation keyword to prevent the next job from re-triggering it.
            *   `[✅]` 10.c.v.2. Harden the `DummyAdapter` tests to assert that all "magic string" keywords are stripped from the response content, ensuring they are single-use triggers.
    *   `[✅]` 10.d. `[REFACTOR]` **Fix Continuation Prompt Logic**
        *   `[✅]` 10.d.i. **Root Cause Analysis:** The "echo of an echo" bug is caused by a broken data flow across two functions. 
            *   **`processSimpleJob.ts`:** When processing a continuation job, this function correctly downloads the partial AI response into a `previousContent` variable. However, it fails to pass this `previousContent` to the `promptAssembler`. The assembler, therefore, re-builds the *original* prompt, completely unaware that it should be building a prompt for a continuation.
            *   **`executeModelCallAndSave.ts`:** This function then receives both the `previousContent` (the partial response) and the `renderedPrompt.content` (the incorrect, original prompt). It then makes a fatal logic error, incorrectly prioritizing `previousContent` as the prompt for the next AI call, which completely discards the work done by the `promptAssembler`. This sends the AI's own partial response back to it as a new prompt, causing the "echo" failure.
        *   `[✅]` 10.d.ii. `[TEST-UNIT]` **Create Failing Tests for Flawed Data Flow:**
            *   `[✅]` 10.d.ii.1. In `prompt_assembler.test.ts`, add a new test, `'should correctly append continuation content to the prompt'`. This test will pass a `continuationContent` string to the `assemble` method and assert that the final prompt includes it. This will initially fail due to the missing parameter on the method.
            *   `[✅]` 10.d.ii.2. In `processSimpleJob.test.ts`, add a new test, `'should pass previousContent to the promptAssembler for continuation jobs'`. This test will spy on the `promptAssembler.assemble` method and assert that it is called with the `previousContent` when processing a job with a `target_contribution_id`.
            *   `[✅]` 10.d.ii.3. In `executeModelCallAndSave.test.ts`, add a new test, `'should always use renderedPrompt.content for the AI call'`. This test will spy on the `callUnifiedAIModel` dependency and assert that the prompt it receives is always from `renderedPrompt.content`, even when `previousContent` is also present.
        *   `[✅]` 10.d.iii. `[BE]` **Implement the Fix:**
            *   `[✅]` 10.d.iii.1. **Update `prompt-assembler` Signature:** In `prompt-assembler.interface.ts` and `prompt-assembler.ts`, update the `assemble` method signature to accept an optional `continuationContent?: string` parameter.
            *   `[✅]` 10.d.iii.2. **Update `prompt-assembler` Logic:** In `prompt-assembler.ts`, modify the implementation to correctly append the `continuationContent` to the assembled prompt if it's provided.
            *   `[✅]` 10.d.iii.3. **Fix `processSimpleJob`:** In `processSimpleJob.ts`, locate the call to `deps.promptAssembler.assemble`. Pass the `previousContent` variable (which is already available in the function) as the new `continuationContent` argument.
            *   `[✅]` 10.d.iii.4. **Fix `executeModelCallAndSave`:** In `executeModelCallAndSave.ts`, find the line `let finalPromptContent = previousContent || renderedPrompt.content;`. Change it to `const finalPromptContent = renderedPrompt.content;`. This ensures the output from the `promptAssembler` is always respected as the single source of truth for the AI call.
        *   `[✅]` 10.d.iv. `[TEST-UNIT]` **Confirm Fixes with Unit Tests:**
            *   `[✅]` 10.d.iv.1. Rerun all tests from step `10.d.ii` and confirm they now pass.
    *   `[✅]` 10.e. `[REFACTOR]` **Harden Test Harness for Continuation**
        *   `[✅]` 10.e.i. **Root Cause Analysis:** The `DummyAdapter` is not intelligent enough to simulate a real AI's continuation behavior. It echoes its entire input, which causes the application's correct continuation logic (`previousContent` + `newContent`) to fail the integration test by producing an "echo of an echo."
        *   `[✅]` 10.e.ii. `[TEST-UNIT]` **Create Failing Test for Dummy Adapter:**
            *   `[✅]` 10.e.ii.1. In `dummy_adapter.test.ts`, add a new test case. This test will call the adapter with a prompt that contains the "Partial echo due to max_tokens..." prefix, simulating a continuation call.
            *   `[✅]` 10.e.ii.2. Assert that the adapter's response is *not* a simple completion string, proving that it currently re-echoes the entire prompt.
        *   `[✅]` 10.e.iii. `[FIX]` **Implement "Smarter" Continuation in Dummy Adapter:**
            *   `[✅]` 10.e.iii.1. In `dummy_adapter.ts`, modify the `sendMessage` method.
            *   `[✅]` 10.e.iii.2. Add logic to check if the incoming `messageContent` includes the string `"Partial echo due to max_tokens"`.
            *   `[✅]` 10.e.iii.3. If the prefix is found, return a fixed completion string (e.g., `"This is the continued content."`) and a `finish_reason: 'stop'`. Otherwise, maintain the existing behavior.
        *   `[✅]` 10.e.iv. `[TEST-UNIT]` **Confirm Fix with Unit Test:**
            *   `[✅]` 10.e.iv.1. Rerun the test from step `10.e.ii` and confirm it now passes.

*   `[✅]` 10.f. `[REFACTOR]` **Fix Dummy Adapter Token Calculation for Continuations**
    *   `[✅]` 10.f.i. **Context:** The integration test revealed a critical flaw in the `DummyAdapter`'s continuation logic. While it correctly identifies a continuation prompt and returns new content, it fails to calculate the token count for the *incoming prompt text*. This results in a `token_usage` object with `prompt_tokens: 0` being sent to the database persistence layer. A database constraint, which correctly rejects this logically impossible state, causes a generic `500` error, which in turn causes the continuation job to fail and the integration test to time out.
    *   `[✅]` 10.f.ii. `[TEST-UNIT]` **TDD RED: Prove the Token Calculation Flaw**
        *   `[✅]` 10.f.ii.1. In `supabase/functions/_shared/ai_service/dummy_adapter.test.ts`, we will modify the existing test case, `"should handle continuation prompts"`.
        *   `[✅]` 10.f.ii.2. We will add an assertion to this test that specifically checks the `token_usage` object in the returned `AdapterResponsePayload`.
        *   `[✅]` 10.f.ii.3. The assertion will validate that `response.token_usage.prompt_tokens` is greater than 0.
        *   `[✅]` 10.f.ii.4. We will run this test and confirm that it fails on this new assertion, proving the flaw.
    *   `[✅]` 10.f.iii. `[FIX]` **GREEN: Implement the Fix**
        *   `[✅]` 10.f.iii.1. In `supabase/functions/_shared/ai_service/dummy_adapter.ts`, we will locate the `if (messageContent.includes("Partial echo due to max_tokens"))` block.
        *   `[✅]` 10.f.iii.2. Inside this block, we will add a call to the adapter's internal token counting method to calculate the number of tokens in the incoming `messageContent` (the prompt).
        *   `[✅]` 10.f.iii.3. We will store this value as `prompt_tokens` and ensure it is correctly included in the `token_usage` object of the returned `AdapterResponsePayload`, alongside the existing `completion_tokens`.
    *   `[✅]` 10.f.iv. `[PROVE]` **PROVE: Confirm Fix with Unit and Integration Tests**
        *   `[✅]` 10.f.iv.1. `[TEST-UNIT]` We will run the `dummy_adapter.test.ts` again and confirm the previously failing test now passes.
        *   `[✅]` 10.f.iv.2. `[TEST-INTEGRATION]` We will run the full `dialectic_pipeline.integration.test.ts` suite.
        *   `[✅]` 10.f.iv.3. `[TEST-INTEGRATION]` We expect the test to proceed past the continuation step and either complete successfully or fail at a subsequent, new step.

*   `[✅]` 10.g. `[REFACTOR]` **Improve Error Logging to Unmask Root Cause**
    *   `[✅]` 10.g.i. **Context:** Our previous fix to the `DummyAdapter`'s token calculation was successful, but the integration test still fails with a `500` error during the continuation job. The error message is a generic `"[object Object]"`, indicating that the true database error is being hidden by improper error logging within the `debitTokens.ts` function.
    *   `[✅]` 10.g.ii. `[FIX]` **Enhance Error Logging in `debitTokens.ts`**
        *   `[✅]` 10.g.ii.1. Read the file `supabase/functions/chat/debitTokens.ts`.
        *   `[✅]` 10.g.ii.2. Locate the `try...catch` block responsible for inserting the `userMessageRow` and `assistantMessageRow` into the database.
        *   `[✅]` 10.g.ii.3. Modify the `catch` block to log the error with more detail. Instead of logging the raw error object, we will use `JSON.stringify(error, null, 2)` or log specific properties like `error.message`, `error.details`, and `error.hint` to ensure the full, actionable error from the database is visible in the function logs.
    *   `[✅]` 10.g.iii. `[PROVE]` **Rerun Integration Test to Capture Detailed Error**
        *   `[✅]` 10.g.iii.1. `[TEST-INTEGRATION]` Rerun the full `dialectic_pipeline.integration.test.ts`.
        *   `[✅]` 10.g.iii.2. `[TEST-INTEGRATION]` We expect the test to **fail in the exact same way**. However, we now expect the `supabase functions serve` log to contain a clear and specific database error message (e.g., "violates foreign key constraint," "null value in column... violates not-null constraint," etc.) instead of `"[object Object]"`. This detailed error will reveal the true root cause of the persistence failure.

*   `[ ]` 10.h. `[REFACTOR]` **Refactor `AiServiceFactory` for True, Complete Dependency Injection**
    *   `[ ]` 10.h.i. **Context:** The current `AiServiceFactory` is difficult to unit test because it manages its own default dependencies (e.g., the `defaultProviderMap`), violating the principles of Dependency Injection. This makes the factory complex and unpredictable. To fix this, we will refactor it into a "pure" factory that is completely configured by its caller. This is a breaking change that will centralize all dependency management into a single "composition root," making the system more modular, predictable, and testable.
    *   `[✅]` 10.h.ii. `[REFACTOR]` **Simplify the Factory to Be "Dumb"**
        *   `[✅]` 10.h.ii.1. `[REFACTOR]` In `supabase/functions/_shared/ai_service/factory.ts`, export the `defaultProviderMap`for callers.
        *   `[✅]` 10.h.ii.2. `[REFACTOR]` Modify the `getAiProviderAdapter` function. Remove the logic that merges or provides default values for the `dependencies` object. The function must receive a complete, valid `FactoryDependencies` object and will fail if any dependency is missing.
        *   `[✅]` 10.h.ii.3. `[REFACTOR]` The `Deno.env.get("SUPA_ENV") === "local"` override is a harmful pattern that makes testing difficult. Remove this entire `if` block from the factory. Test-specific behavior should be injected via dependencies, not determined by environment variables inside the factory.
    *   `[✅]` 10.h.iii. `[REFACTOR]` **Update the `ChatHandlerDeps` Contract**
        *   `[✅]` 10.h.iii.1. `[REFACTOR]` In `supabase/functions/_shared/types.ts`, find the `ChatHandlerDeps` interface.
        *   `[✅]` 10.h.iii.2. `[REFACTOR]` The `getAiProviderAdapter` property in this interface currently has the wrong signature (`(providerApiIdentifier: string, ...)`). Update its signature to be `(dependencies: FactoryDependencies) => AiProviderAdapterInstance | null;`. This makes the DI contract explicit. Do the same for `getAiProviderAdapterOverride`.
    *   `[✅]` 10.h.iv. `[REFACTOR]` **Establish a Single Composition Root**
        *   `[✅]` 10.h.iv.1. `[REFACTOR]` In `supabase/functions/chat/index.ts`, locate the `defaultDeps` object. This will become our single source of truth for constructing production dependencies.
        *   `[✅]` 10.h.iv.2. `[REFACTOR]` Move the `defaultProviderMap` from the factory into this file.
        *   `[✅]` 10.h.iv.3. `[REFACTOR]` Update the `getAiProviderAdapter` method within `defaultDeps`. It will now be responsible for assembling the *complete* `FactoryDependencies` object (including the `providerMap`, `logger`, `forceReal: true`, etc.) before passing it to the now-dumb `getAiProviderAdapter` factory function.
    *   `[✅]` 10.h.v. `[REFACTOR]` **Update the Final Call Site**
        *   `[✅]` 10.h.v.1. `[REFACTOR]` In `supabase/functions/chat/prepareChatContext.ts`, the call to `adapterToUse` (around line 133) is currently incorrect.
        *   `[✅]` 10.h.v.2. `[REFACTOR]` Update this call to pass a single `FactoryDependencies` object, assembling all the required pieces of data (`providerApiIdentifier`, `modelConfig`, `apiKey`, `logger`, etc.) that are already available within the `prepareChatContext` function.
    *   `[✅]` 10.h.vi. `[TEST-UNIT]` **TDD RED: Prove Flawed ID Handoff**
        *   `[✅]` 10.h.vi.1. `[TEST-UNIT]` In `supabase/functions/_shared/ai_service/factory.test.ts`, write a new, clean test case: `'should pass the full provider DB config to the adapter, including the provider ID'`.
        *   `[✅]` 10.h.vi.2. `[TEST-UNIT]` Create a test-only `CapturingDummyAdapter` class whose constructor captures the `modelConfig` it receives.
        *   `[✅]` 10.h.vi.3. `[TEST-UNIT]` Create a complete `testDependencies` object, injecting the `CapturingDummyAdapter` via the `providerMap`. Crucially, the `providerDbConfig` in this object must contain a mock UUID in its `id` property.
        *   `[✅]` 10.h.vi.4. `[TEST-UNIT]` Call `getAiProviderAdapter`, passing the `testDependencies`.
        *   `[✅]` 10.h.vi.5. `[TEST-UNIT]` Assert that the `id` property on the `modelConfig` captured by the adapter is `undefined`. **This test will pass, proving the factory incorrectly discards the ID (RED).**
    *   `[ ]` 10.h.vii. `[REFACTOR]` **Fix the Core Dependency Contract to Pass the Entire Provider Object**
        *   `[✅]` 10.h.vii.1. **Context:** The current `FactoryDependencies` interface is the root of the problem. We will redefine it to pass the necessary data cleanly. It will require the full `provider` object from the database, the `apiKey` from the request, the `logger`, and the `providerMap` for adapter selection.
        *   `[✅]` 10.h.vii.2. `[BE]` In `supabase/functions/_shared/types.ts`, redefine the `FactoryDependencies` interface. Remove the old `providerApiIdentifier` and `providerDbConfig` properties.
        *   `[✅]` 10.h.vii.3. `[BE]` The interface will now require **exactly four** properties: `provider: Tables<'ai_providers'>`, `apiKey: string`, `logger: ILogger`, and `providerMap: Record<string, AiProviderAdapter>`.
        *   `[✅]` 10.h.vii.4. `[BE]` Update the `getAiProviderAdapter` signature in `ChatHandlerDeps` to accept this new, complete dependency object.
    *   `[✅]` 10.h.viii. `[REFACTOR]` **Update the Factory, Adapters, and Unit Tests**
        *   `[✅]` 10.h.viii.1. **Context:** With the new contract defined, we will update the factory and adapters to use it.
        *   `[✅]` 10.h.viii.2. `[BE]` In `supabase/functions/_shared/ai_service/dummy_adapter.ts` and all other adapter files, change the constructor signature to `(provider: Tables<'ai_providers'>, apiKey: string, logger: ILogger)`.
        *   `[✅]` 10.h.viii.3. `[BE]` In `supabase/functions/_shared/ai_service/factory.ts`, update the `getAiProviderAdapter` function to accept the new `FactoryDependencies` object. It will destructure all four dependencies, use the injected `providerMap` and `provider.api_identifier` to select the adapter class, and instantiate it with `new AdapterClass(provider, apiKey, logger)`.
        *   `[✅]` 10.h.viii.4. `[TEST-UNIT]` In `supabase/functions/_shared/ai_service/factory.test.ts`, rewrite the tests to pass a complete mock `FactoryDependencies` object containing a mock `provider`, `apiKey`, `logger`, and `providerMap`.
    *   `[ ]` 10.h.ix. `[REFACTOR]` **Systematically Repair All Dependent Files**
        *   `[ ]` 10.h.ix.1. **Context:** This is a systematic, file-by-file repair of every location impacted by the breaking change.
        *   `[✅]` 10.h.ix.2. `[BE]` Fix Composition Root (`chat/index.ts`): The `getAiProviderAdapter` function in `defaultDeps` acts as the composition root. It will now receive a partial dependency object from callers and be responsible for **adding the `providerMap`** before calling the real factory. The logic will be `getAiProviderAdapter({ ...dependencies, providerMap: defaultProviderMap })`.
        *   `[✅]` 10.h.ix.3. `[BE]` Fix Primary Call Site (`chat/prepareChatContext.ts`): Update the call to `adapterToUse`. It will now pass an object with `{ provider: providerData, apiKey, logger }`. The composition root will handle adding the `providerMap`.
        *   `[✅]` 10.h.ix.4. `[TEST-UNIT]` Fix Test Utilities (`chat/_chat.test.utils.ts`): Update the mock and spy setup for `getAiProviderAdapter` to conform to the new dependency object signature.
        *   `[✅]` 10.h.ix.5. `[TEST-UNIT]` Fix All Remaining Test Files: Update the `getAiProviderAdapter` mocks in the following files to use the new `FactoryDependencies` contract.
            *   `supabase/functions/chat/prepareChatContext.test.ts`
            *   `supabase/functions/chat/index.test.ts`
            *   `supabase/functions/chat/handleDialecticPath.test.ts`
            *   `supabase/functions/chat/handlePostRequest.test.ts`
            *   `supabase/functions/chat/handleNormalPath.test.ts`
            *   `supabase/functions/chat/handleRewindPath.test.ts`
            *   `supabase/functions/chat/edge_cases.integration.test.ts`
            *   `supabase/functions/chat/happy_path.integration.test.ts`
            *   `supabase/functions/chat/specific_configs.integration.test.ts`
            *   `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
    *   `[✅]` 10.h.x. `[TEST-INTEGRATION]` **Final System-Wide Validation**
        *   `[✅]` 10.h.x.1. **Context:** After all files have been repaired, run the highest-level tests.
        *   `[ ]` 10.h.x.2. `[TEST-ALL]` Run the entire Deno test suite.
        *   `[ ]` 10.h.x.3. `[TEST-INTEGRATION]` Run `dialectic_pipeline.integration.test.ts` and confirm it passes.
    *   `[✅]` 10.k. `[REFACTOR]` **TDD Refactor of Dialectic Services to Use AiServiceFactory**
        *   `[✅]` 10.k.i. **Context:** The integration test failure is caused by a critical architectural flaw where Dialectic services directly instantiate AI adapters instead of using the central factory. We will fix this by following a strict TDD process, creating failing unit tests for each component to prove the flaw before implementing the fix.
        *   `[✅]` 10.k.ii. `[REFACTOR]` **Component 1: `dialectic-service/startSession.ts`**
            *   `[✅]` 10.k.ii.1. `[TEST-UNIT]` **RED: Prove Flaw in `startSession`:** Update the existing unit test file, `supabase/functions/dialectic-service/startSession.test.ts`. Write a test that mocks the `getAiProviderAdapter` factory dependency. Spy on this mock. Call `startSession`. Assert that the factory spy was **NOT** called, proving the service bypasses the factory. **Run the test and confirm it fails (RED).**
            *   `[✅]` 10.k.ii.2. `[BE]` **GREEN: Implement Fix in `startSession.ts`:** Refactor the service to remove the direct `new OpenAiAdapter()` call. Instead, query the database for the default embedding provider and pass the resulting provider record to the `getAiProviderAdapter` factory function to correctly create the adapter dependency.
            *   `[✅]` 10.k.ii.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Modify the unit test from the RED step. Assert that the `getAiProviderAdapter` factory spy **IS** now called exactly once. **Run the test and confirm it passes (GREEN).**
        *   `[✅]` 10.k.iii. `[REFACTOR]` **Component 2: `dialectic-worker/index.ts`**
            *   `[✅]` 10.k.iii.1. `[TEST-UNIT]` **RED: Prove Flaw in `dialectic-worker`:** Update the existing unit test file, `supabase/functions/dialectic-worker/index.test.ts`. Write a test that proves the `handleJob` function instantiates its own adapter instead of using a dependency. Spy on the factory and assert it is not called. **Run the test and confirm it fails (RED).**
            *   `[✅]` 10.k.iii.2. `[BE]` **GREEN: Implement Fix in `index.ts`:** Refactor the worker's dependency setup (`serve` block) to use the same factory pattern as `startSession.ts`, creating the adapter via the factory and injecting it into the `deps` object.
            *   `[✅]` 10.k.iii.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Modify the unit test to assert that the factory dependency **IS** now used. **Run the test and confirm it passes (GREEN).**
        *   `[✅]` 10.k.iv. `[REFACTOR]` **Component 3: `dialectic_pipeline.integration.test.ts`**
            *   `[✅]` 10.k.iv.1. `[TEST-INT]` **RED: Confirm Initial State:** The integration test is already failing type-checking. This is our initial RED state for this component.
            *   `[✅]` 10.k.iv.2. `[TEST-INT]` **GREEN: Implement Fix in Integration Test:** With the underlying production code now fixed and unit-tested, refactor the test's `setup` function. Remove the direct instantiation of `OpenAiAdapter` and instead replicate the production logic: fetch the default embedding provider from the mock database and use the `getAiProviderAdapter` factory to create the adapter needed for the test dependencies.
    *   `[ ]` 10.l. `[REFACTOR]` **Refactor Embedding Service and Test Harness for True Dependency Injection**
        *   `[ ]` 10.l.i. **Context:** The integration test is failing because it is architecturally flawed. It is forced to instantiate a real `OpenAiAdapter` because the `OpenAIEmbeddingClient` has a hard-coded dependency on it. Furthermore, the test calls the real `callUnifiedAIModel` function, which makes a network request to a live service instead of using a local test double. This section details the TDD-based refactoring required to break these hard dependencies and properly isolate the integration test.
        *   `[ ]` 10.l.ii. `[REFACTOR]` **Update the Core Adapter Contract to Support Embeddings**
            *   `[✅]` 10.l.ii.1. `[BE]` In `supabase/functions/_shared/types.ts`, modify the `AiProviderAdapter` type definition. Add a new optional method: `getEmbedding(text: string): Promise<CreateEmbeddingResponse>;`. This makes embedding a standard feature of all AI adapters.
        *   `[✅]` 10.l.iii. `[REFACTOR]` **Make `DummyAdapter` Conform to the New Contract**
            *   `[✅]` 10.l.iii.1. `[TEST-UNIT]` **RED: Prove Flaw:** In `supabase/functions/_shared/ai_service/dummy_adapter.test.ts`, add a new test case that asserts an instance of `DummyAdapter` is assignable to the `AiProviderAdapterInstance` type. This will fail the type-check because the `getEmbedding` method is missing.
            *   `[✅]` 10.l.iii.2. `[BE]` **GREEN: Implement Fix:** In `supabase/functions/_shared/ai_service/dummy_adapter.ts`, add a `getEmbedding` method. This method will return a promise that resolves to a mock embedding response (e.g., `{ data: [{ embedding: [0.1, 0.2, 0.3] }] }`), matching the structure the `OpenAIEmbeddingClient` expects.
            *   `[✅]` 10.l.iii.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Rerun the test from the RED step and confirm it now passes.
        *   `[✅]` 10.l.iv. `[REFACTOR]` **Decouple `OpenAIEmbeddingClient` from the Concrete Adapter**
            *   `[✅]` 10.l.iv.1. `[TEST-UNIT]` **RED: Prove Flaw:** In a test file for `indexing_service.ts`, write a test that attempts to instantiate `OpenAIEmbeddingClient` with a `DummyAdapter` instance. This will fail the type-check because the constructor requires a specific `OpenAiAdapter`.
            *   `[✅]` 10.l.iv.2. `[BE]` **GREEN: Implement Fix:** In `supabase/functions/_shared/services/indexing_service.ts`, change the constructor of `OpenAIEmbeddingClient` to accept a generic `AiProviderAdapterInstance` instead of a concrete `OpenAiAdapter`.
            *   `[✅]` 10.l.iv.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Rerun the test from the RED step and confirm it now passes.
        *   `[✅]` 10.l.v. `[REFACTOR]` **Fix Embedding Client Instantiation in Test Harness**
            *   `[✅]` 10.l.v.1. `[TEST-INT]` In `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`, locate the `setup` function.
            *   `[✅]` 10.l.v.2. `[TEST-INT]` The `setup` will be refactored to remove the direct instantiation of `new OpenAiAdapter`.
            *   `[✅]` 10.l.v.3. `[TEST-INT]` Instead, it will first fetch the default embedding provider from the test database.
            *   `[✅]` 10.l.v.4. `[TEST-INT]` It will then call the `getAiProviderAdapter` factory to create a generic adapter instance for embeddings.
            *   `[✅]` 10.l.v.5. `[TEST-INT]` This generic adapter instance will then be passed to the `OpenAIEmbeddingClient` constructor, satisfying its dependency without using a real adapter.
        *   `[ ]` 10.l.vi. `[REFACTOR]` **Refactor `callUnifiedAIModel` for True Dependency Injection**
            *   `[✅]` 10.l.vi.1. `[TEST-INT]` **Context:** The integration test is failing because `callUnifiedAIModel` has a hardcoded, implicit dependency on the global `fetch` function, which makes true test isolation impossible without manipulating the global environment. This violates the core principle of Dependency Injection. The following steps will refactor the function to make its dependencies explicit and injectable.
            *   `[✅]` 10.l.vi.2. `[TEST-UNIT]` **RED: Prove Flaw in `callModel.ts`**
                *   `[✅]` 10.l.vi.2.a. In `supabase/functions/dialectic-service/callModel.test.ts`, write a new test, `'should make a network request using the global fetch'`.
                *   `[✅]` 10.l.vi.2.b. Spy on `globalThis.fetch`.
                *   `[✅]` 10.l.vi.2.c. Call the real `callUnifiedAIModel` function.
                *   `[✅]` 10.l.vi.2.d. Assert that the `fetch` spy was called. This test will pass, but it proves the undesirable behavior (RED state).
            *   `[✅]` 10.l.vi.3. `[REFACTOR]` **GREEN: Implement Dependency Injection**
                *   `[✅]` 10.l.vi.3.a. `[BE]` In `supabase/functions/dialectic-service/dialectic.interface.ts`, create a new exported interface: `export interface CallModelDependencies { fetch: typeof fetch; }`.
                *   `[✅]` 10.l.vi.3.b. `[BE]` In `supabase/functions/dialectic-service/callModel.ts`, modify the `callUnifiedAIModel` signature. It will now accept `deps: CallModelDependencies` as its first parameter.
                *   `[✅]` 10.l.vi.3.c. `[BE]` Inside the function, change the line `const response = await fetch(...)` to `const response = await deps.fetch(...)`.
            *   `[✅]` 10.l.vi.4. `[REFACTOR]` **Update Production Call Site**
                *   `[✅]` 10.l.vi.4.a. `[BE]` In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, locate the call to `callUnifiedAIModel`.
                *   `[✅]` 10.l.vi.4.b. `[BE]` Update the call to pass the dependency object: `deps.callUnifiedAIModel({ fetch: globalThis.fetch }, ...)`. Note that we are adding `callUnifiedAIModel` to the `IDialecticJobDeps` interface.
            *   `[✅]` 10.l.vi.5. `[TEST-UNIT]` **PROVE: Confirm Fix with Unit Test**
                *   `[✅]` 10.l.vi.5.a. In `supabase/functions/dialectic-service/callModel.test.ts`, modify the test from the RED step.
                *   `[✅]` 10.l.vi.5.b. Create a mock fetch function: `const mockFetch = spy(() => Promise.resolve(new Response('{}')));`.
                *   `[✅]` 10.l.vi.5.c. Call `callUnifiedAIModel`, passing `{ fetch: mockFetch }` as the dependency.
                *   `[✅]` 10.l.vi.5.d. Assert that the `mockFetch` spy was called, not the global one. This test now passes for the correct reason (GREEN state).
            *   `[ ]` 10.l.vi.6. `[REFACTOR]` **Update Integration Test Harness**
                *   `[ ]` 10.l.vi.6.a. `[TEST-INT]` In `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`, locate the `testDeps` object.
                *   `[ ]` 10.l.vi.6.b. `[TEST-INT]` The `callUnifiedAIModel` property will be a function that calls the real `callUnifiedAIModel`.
                *   `[ ]` 10.l.vi.6.c. `[TEST-INT]` Crucially, for the `deps` argument, it will pass a mock fetch function: `{ fetch: mockFetch }`. This mock fetch will return a `Response` object containing a JSON payload that simulates a valid response from the `DummyAdapter`, including a `finish_reason`. This ensures all calls are intercepted locally.
    *   `[ ]` 10.k `[TEST-INTEGRATION]` **Fix Integration Test** The integration test now stalls on the forced-failure "retrying" stage. 
        *   `[ ]`   10.k.i. `[TEST-INTEGRATION]` Investigate the cause of the retry failure. 
            *   `[ ]` 10.k.i.1  The retry may fail because the the integration test has lost the ability to force the use of the dummy-adapter in the test environment. 
                *   The test is now calling /chat directly instead of a mocked version of chat that uses the dummy-adapter.
                *   The /chat function is not being passed a test flag to tell it to use an adapterMap that forces the dummy-adapter regardless of the adapter invoked.
            *   `[ ]` 10.k.i.2 `[PLAN]` **Implementation Plan:** Implement a mechanism to signal the test environment to the `/chat` function via a custom HTTP header.**
                *   `[✅]` 10.k.i.2.a **Part 1: Drive Client-Side Change with a Unit Test**
                    *   `[✅]` `[TEST-RED]` In `supabase/functions/dialectic-service/callModel.test.ts`, add a new, failing unit test. This test will call `callUnifiedAIModel` with `isTest: true` and assert that the `X-Test-Mode: 'true'` header is present in the `fetch` call. This test must fail initially.
                    *   `[✅]` `[IMPLEMENT]` In `supabase/functions/dialectic-service/callModel.ts`, add the `isTest?: boolean` parameter and the logic to include the header.
                    *   `[✅]` `[TEST-GREEN]` Run the `callModel.test.ts` suite. The new unit test must now pass, proving the client-side feature is correctly implemented.
                *   `[ ]` 10.k.i.2.b **Part 2: Correct DI Chain and Implement Server-Side Test Mode (TDD)**
                    *   `[ ]` **Sub-Part 2.1: Fix `prepareChatContext` Dependency Injection**
                        *   `[✅]` `[TEST-RED]` In `supabase/functions/chat/prepareChatContext.test.ts`, write a new unit test. It will call `prepareChatContext` directly and provide a `deps` object containing a `spy` for the real `getAiProviderAdapter` factory and a custom `providerMap`. The test will assert that the spy is called with arguments that include the custom `providerMap`. This test must fail because `prepareChatContext` currently ignores the injected map and hardcodes `defaultProviderMap`.
                        *   `[✅]` `[IMPLEMENT]` In `supabase/functions/chat/prepareChatContext.ts`, modify the call to the AI adapter factory. The `providerMap` argument must be changed from the hardcoded `defaultProviderMap` to `deps.providerMap`, thereby respecting the injected dependency.
                        *   `[✅]` `[TEST-GREEN]` Run the `prepareChatContext.test.ts` suite. The new unit test must now pass.
                        
                    *   `[✅]` **Sub-Part 2.1a: Refactor `handlePostRequest` for Dependency Injection**
                        *   `[✅]` `[REFACTOR]` In `supabase/functions/chat/handlePostRequest.ts`, create a `createHandlePostRequest` factory that accepts all external dependencies (`prepareChatContext`, etc.) as an argument and returns a `handlePostRequest` function.
                        *   `[✅]` `[REFACTOR]` Export a `handlePostRequest` instance created by calling the new factory with the real dependencies.
                    *   `[✅]` **Sub-Part 2.1b: Update `chat/index.ts` to Use Injected `handlePostRequest`**
                        *   `[✅]` `[REFACTOR]` In the main `handler` function, change the call from the direct import `handlePostRequest(...)` to the injected dependency `deps.handlePostRequest(...)`.
                    *   `[✅]` **Sub-Part 2.1c: Fix Unit Test**
                        *   `[✅]` `[TEST-UNIT]` In `supabase/functions/chat/index.test.ts`, for the `'POST: should successfully process a valid request'` test, create a simple stub for `handlePostRequest`.
                        *   `[✅]` `[TEST-UNIT]` Pass this stub as a dependency override: `{ handlePostRequest: myStub }`. This isolates the handler and fixes the unit test.
                        
                    *   `[✅]` **Sub-Part 2.2: Fix `defaultDeps` Dependency Injection**
                        *   `[✅]` `[TEST-RED]` In `supabase/functions/chat/index.test.ts`, write a new unit test that directly tests the `getAiProviderAdapter` function within the `defaultDeps` object. This test will call `defaultDeps.getAiProviderAdapter` with a `FactoryDependencies` object containing a custom `providerMap`. It will assert that the underlying factory is called with this custom map. This test must fail because `defaultDeps` currently discards the injected map.
                        *   `[✅]` `[IMPLEMENT]` In `supabase/functions/chat/index.ts`, modify the `getAiProviderAdapter` function inside the `defaultDeps` object. The `providerMap` argument in its call to the factory must be changed from the hardcoded `defaultProviderMap` to `dependencies.providerMap`.
                        *   `[✅]` `[TEST-GREEN]` Run the `chat/index.test.ts` suite. The new unit test for `defaultDeps` must now pass.
                    *   `[✅]` **Sub-Part 2.3: Implement `X-Test-Mode` Header Logic in `handler`**
                        *   `[✅]` `[TEST-RED]` In `supabase/functions/chat/index.test.ts`, write a new unit test for the `handler` function. The test will send a request with the `X-Test-Mode: 'true'` header. It will inject a spy for `handlePostRequest` and assert that the `deps` object passed to this spy contains a `providerMap` that forces all providers to map to the `dummy` adapter. This test must fail.
                        *   `[✅]` `[IMPLEMENT]` In `supabase/functions/chat/index.ts`, add logic to the `handler`. It must check for the `X-Test-Mode` header. If present, it must clone the incoming `deps` object, overwrite the `providerMap` with one that forces the dummy adapter, and pass these modified dependencies to `handlePostRequest`.
                        *   `[✅]` `[TEST-GREEN]` Run the `chat/index.test.ts` suite. The new handler test must now pass.
                    *   `[✅]` **Sub-Part 2.4: Final Verification**
                        *   `[✅]` `[TEST-GREEN]` Run all test suites (`chat/index.test.ts` and `prepareChatContext.test.ts`) to ensure no regressions were introduced.
                        *   `[✅]` `[REFACTOR]` In `supabase/functions/chat/index.ts`, perform the final cleanup of the unnecessary temporary `deps` variable.
                        *   `[✅]` `[TEST-GREEN]` Run `chat/index.test.ts` one last time.

    *   `[ ]` 10.l. **Fix Dependency Injection Chain with TDD**
        *   `[✅]` 10.l.i. **Part 1: Correct Unit Tests (`[TEST-RED]`)**
            *   `[✅]` 10.l.i.1. **Goal:** Prove that `handlePostRequest` does not correctly pass through all properties of its `deps` object to `prepareChatContext`.
            *   `[✅]` 10.l.i.2. **Action:** Modify a test in `supabase/functions/chat/handlePostRequest.test.ts`. Add a unique test-only property to the `deps` object and then assert that this property is present when the `prepareChatContext` spy is called.
            *   `[✅]` 10.l.i.3. **Expected Outcome:** This test will fail, demonstrating the flaw in the hand-off between `handlePostRequest` and `prepareChatContext`.
        *   `[✅]` 10.l.ii. **Part 2: Implement and Verify Unit-Level Fixes (`[IMPLEMENT]` & `[TEST-GREEN]`)**
            *   `[✅]` 10.l.ii.1. **Goal:** Fix the dependency hand-off and the root cause of the error.
            *   `[✅]` 10.l.ii.2. **Action (A): `handlePostRequest.ts`**: Based on the failure in Part 1, correct the code so that it correctly passes the *entire* `deps` object it receives to `prepareChatContext`.
            *   `[✅]` 10.l.ii.3. **Action (B): `index.ts` & `prepareChatContext.ts`**: Apply the originally planned fixes: add `providerMap` to `effectiveDeps` in `index.ts` and clean up the redundant logic in `prepareChatContext.ts`.
            *   `[✅]` 10.l.ii.4. **Verification:** Run the unit test suites for all three modified files (`handlePostRequest.test.ts`, `index.test.ts`, `prepareChatContext.test.ts`) to confirm the fixes work and have not introduced regressions.
        *   `[ ]` 10.l.iii. **Part 3: Update Chat Integration Test (`[INTEGRATE]` & `[TEST-GREEN]`)**
            *   `[ ]` 10.l.iii.1. **Goal:** Create a true integration test that validates the `X-Test-Mode` header triggers the use of the `DummyAdapter` through the entire `/chat` function call stack.
            *   `[ ]` 10.l.iii.2. **Action:** Add a new test case to `supabase/functions/chat/index.integration.test.ts`. This test will make a live `POST` request to the locally served `/chat` function with the `X-Test-Mode: 'true'` header.
            *   `[ ]` 10.l.iii.3. **Assertion:** The `DummyAdapter` is configured in "echo" mode. Assert that the response content from the function exactly matches the prompt sent in the request, proving the `DummyAdapter` was used.
            *   `[ ]` 10.l.iii.4. **Expected Outcome:** The integration test will pass, verifying the entire feature works end-to-end as intended.

    *   `[ ]` 10.m. `[REFACTOR]` **Repair `continue.ts` for Transactional, Scalable, Context-Aware Generation**
        *   `[ ]` 10.m.i. **Context:** The current `handleContinuationLoop` is critically flawed. It is non-transactional, risking data and financial loss if it fails mid-process. It creates an invalid conversational history, causing AI failures. It also lacks a mechanism to manage the context window, preventing long generations. This refactoring will rebuild the function to be a robust, transactional loop that follows a "Charge -> Save -> Check Balance -> Continue" model, uses a correct alternating turn structure (`[user, assistant, user, assistant]`), and integrates RAG-based context trimming to enable near-infinite continuation while preserving critical context and ensuring financial safety.
        *   `[ ]` 10.m.ii. `[REFACTOR]` **Update Function Signature to Use `PathHandlerContext`**
            *   `[ ]` 10.m.ii.1. `[TEST-UNIT]` **RED: Prove Flawed Signature:** In `continue.test.ts`, write a new test that attempts to call `handleContinuationLoop` by passing it a mock `PathHandlerContext` object. This will immediately fail the type-check, proving the current function signature is incorrect for our needs.
            *   `[ ]` 10.m.ii.2. `[BE]` **GREEN: Update Signatures:**
                *   Refactor the `handleContinuationLoop` signature in `continue.ts` to accept two arguments: `context: PathHandlerContext` and the `initialApiRequest: ChatApiRequest`.
                *   Inside the function, destructure all necessary dependencies (e.g., `aiProviderAdapter`, `logger`, `modelConfig`, `ragService`, `countTokensForMessages`) directly from the `context` object.
                *   Update the call sites in `handleNormalPath.ts` and `handleDialecticPath.ts` to pass their `context` object and the `adapterChatRequestNormal` to `handleContinuationLoop`.
            *   `[ ]` 10.m.ii.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Rerun the test from the RED step, updating it as needed. It should now pass the type-check, confirming the signature has been successfully updated.
        *   `[ ]` 10.m.iii. `[REFACTOR]` **Implement Transactional, Alternating-Turn Loop**
            *   `[ ]` 10.m.iii.1. `[TEST-UNIT]` **RED: Prove Non-Transactional, Flawed History:** In `continue.test.ts`, write a new, comprehensive test for a 3-part continuation.
                *   Provide mock dependencies, including spies for `debitTokens` and the database `update` method.
                *   Assert three failures: 1. `debitTokens` is only called once at the very end, not within the loop. 2. The database `update` method is never called to save intermediate progress. 3. The message history for the third call has the invalid `[user, assistant, assistant]` structure.
            *   `[ ]` 10.m.iii.2. `[BE]` **GREEN: Implement Transactional Loop in `continue.ts`:**
                *   Restructure the function entirely. First, make the initial AI call *before* the loop starts.
                *   Immediately call `debitTokens`, passing a `databaseOperation` callback that `INSERT`s the initial `user` and `assistant` messages. Store the returned `assistantMessage.id` and the full `assistantMessage` object in local variables.
                *   Begin the `while` loop for subsequent continuations. Inside the loop, in order:
                    1.  **Check Balance:** Fetch the user's latest wallet balance via the `tokenWalletService` and use `getMaxOutputTokens` to verify they can afford another step. If not, `break` the loop.
                    2.  **Prepare History:** Push a `{ role: 'user', content: 'Please continue.' }` message to the history.
                    3.  **Make AI Call:** Call `adapter.sendMessage` with the updated history.
                    4.  **Charge & Save:** Call `debitTokens` with the token usage from this *specific step*. The `databaseOperation` for this call will `UPDATE` the existing assistant message (using its stored ID) by appending the new content, and `INSERT` the new `user: 'continue'` message. The updated `assistantMessage` object must be retrieved and stored.
            *   `[ ]` 10.m.iii.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Rerun the test from the RED step. Assert that `debitTokens` and the database `update` spy are now called multiple times (inside the loop) and that the history for the third call has the correct `[user, assistant, user, assistant, user]` structure.
        *   `[ ]` 10.m.iv. `[REFACTOR]` **Implement RAG-Based Context Trimming**
            *   `[ ]` 10.m.iv.1. `[TEST-UNIT]` **RED: Prove Context Overflow and Lack of RAG:** Write a new test in `continue.test.ts`.
                *   Provide mock dependencies within a `PathHandlerContext`: a `countTokensForMessages` function that returns high token counts, a `modelConfig` with a low `provider_max_input_tokens` limit, and a spy on the `ragService.addDocument` method from the `deps` object.
                *   Simulate a continuation long enough to exceed the token limit.
                *   Assert two things: the `messages` array passed to the final `adapter.sendMessage` call is shorter than the full history, and the `ragService.addDocument` spy was called with the content of the trimmed-out assistant message. This test will fail because no trimming or RAG integration exists.
            *   `[ ]` 10.m.iv.2. `[BE]` **GREEN: Implement Trimming and RAG Logic:**
                *   In `continue.ts`, at the beginning of the `while` loop, add a call to a new local helper function, `manageContextWindow`.
                *   This function will:
                    1.  Use the `deps.countTokensForMessages` function and `modelConfig` (both destructured from the `context` argument) to calculate the token count of the current `messages` array.
                    2.  If the count exceeds `modelConfig.provider_max_input_tokens`, enter a `while` loop.
                    3.  Inside the loop, identify the oldest turn-pair (the first `assistant` message and the subsequent `user` message at indices 1 and 2).
                    4.  Call `await deps.ragService.addDocument()` with the content from the assistant message at index 1.
                    5.  Remove the two messages at indices 1 and 2 from the `messages` array using `splice(1, 2)`.
                    6.  Recalculate the token count and repeat the loop until the history fits within the context window.
            *   `[ ]` 10.m.iv.3. `[TEST-UNIT]` **PROVE: Confirm Fix:** Rerun the test from the RED step and confirm all assertions now pass.

*   `[✅]` 10.n. `[REFACTOR]` **Charge RAG Expense to User**
    *   `[✅]`   10.n.i. **RAG Embedding Costs Tokens** The RAG service relies on OpenAI text embedding models. These models charge input tokens. The application has operating expenses, and charges output tokens for RAG. Currently the RAG service does not call the tokenWalletService to charge users for the token expense of the embedding service. 

*   `[✅]` 10.o. `[REFACTOR]` **Refactor ContinueJob for Transactional, Scalable, Context Aware Generation**
    *   `[✅]` 10.o.i. **Context:** The current `handleContinuationJob` is critically flawed. It is non-transactional, risking data and financial loss if it fails mid-process. It creates an invalid conversational history, causing AI failures. It also lacks a mechanism to manage the context window, preventing long generations. This refactoring will rebuild the function to be a robust, transactional loop that follows a "Charge -> Save -> Check Balance -> Continue" model, uses a correct alternating turn structure (`[user, assistant, user, assistant]`), and integrates RAG-based context trimming to enable near-infinite continuation while preserving critical context and ensuring financial safety.

*   `[ ]` 11. `[TEST-INTEGRATION]` **Final Validation**
    *   `[ ]` 11.a. `[TEST-INTEGRATION]` Run the full `dialectic_pipeline.integration.test.ts`.
    *   `[ ]` 11.b. `[TEST-INTEGRATION]` **Confirm all steps now pass.**
    *   `[ ]` 12. **Add Regression Test for `chat_id`**
        *   `[ ]` 12.a. `[TEST-UNIT]` Add a new test to `supabase/functions/dialectic-service/callModel.test.ts`.
        *   `[ ]` 12.b. `[TEST-UNIT]` The test will call `callUnifiedAIModel` and spy on the underlying `fetch` call.
        *   `[ ]` 12.c. `[TEST-UNIT]` It will assert that the `chatId` property in the request body sent to the `/chat` function is `undefined`. This ensures the history-masking workaround can never be accidentally reintroduced.
        
## Phase 10: Final System Validation & Cleanup

*   `[ ]` 13. **Final System Validation:**
    *   `[ ]` 13.a. `[BE]` Run the full test suite for the `dialectic-system` to ensure no regressions were introduced.
*   `[ ]` 14. **Documentation and Cleanup:**
    *   `[ ]` 14.a. `[DOC]` Review and update any relevant documentation in `docs/` that may have been impacted by these changes.
    *   `[ ]` 14.b. `[BE]` Remove any unnecessary `console.log` or diagnostic statements added during the debugging process.
    *   `[ ]` 14.c. `[BE]` Merge the `fix/prompt-construction-repair` branch into `main`.
    *   `[ ]` 14.d. `[BE]` Delete the feature branch.