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
    *   `[⏸️]` 10.a. `[TEST-INT]` **Address Integration Test Failures**
        *   `[ ]` 10.a.i. **Invalid Provider Configuration:** The `generateContributions` function is failing with an `Invalid provider config` error because it cannot find the configuration for the AI models (`gpt-4-turbo`, `claude-3-opus`) that are upserted during the test setup. This suggests a dependency injection or Supabase client configuration issue within the test environment.
        *   `[ ]` 10.a.ii. **Test Polling Timeout:** The test times out while polling for job statuses because the initial `generateContributions` call fails, meaning no jobs are ever created in the database.
        *   `[ ]` 10.a.iii. **Divergence in Test Reporting:** The Deno test runner reports steps as passing (`ok`) even when the underlying Edge Functions are throwing critical, unhandled errors. The test's `assert(!error)` checks are not catching these asynchronous failures, leading to a dangerously misleading "green" test run.
    *   `[ ]` 10.b. `[TEST-INT]` Modify `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`.
    *   `[ ]` 10.c. `[TEST-INT]` In the test dependencies, intercept the call to `executeModelCallAndSave` and add verbose logging to print:
        *   `[ ]` 10.c.i. The full content of the `renderedPrompt` to prove it was correctly assembled.
        *   `[ ]` 10.c.ii. The content that the `countTokensForMessages` function is evaluating, to prove the token check is on the right data.
    *   `[ ]` 10.d. `[TEST-INT]` Add a new integration test case that uses a large volume of source document content, specifically designed to exceed a model's token limit.
    *   `[ ]` 10.e. `[TEST-INT]` Within this new test, spy on the `ragService` dependency.
    *   `[ ]` 10.f. `[TEST-INT]` Assert that the `ragService` spy was called, proving the RAG logic was correctly triggered by the integration test.
*   `[ ]` 11. **Add Regression Test for `chat_id`**
    *   `[ ]` 11.a. `[TEST-UNIT]` Add a new test to `supabase/functions/dialectic-service/callModel.test.ts`.
    *   `[ ]` 11.b. `[TEST-UNIT]` The test will call `callUnifiedAIModel` and spy on the underlying `fetch` call.
    *   `[ ]` 11.c. `[TEST-UNIT]` It will assert that the `chatId` property in the request body sent to the `/chat` function is `undefined`. This ensures the history-masking workaround can never be accidentally reintroduced.

## Phase 7: Documentation

*   `[ ]` 12. **Update Architecture Document**
    *   `[ ]` 12.a. `[DOCS]` Update `docs/implementations/Current/Documentation/Dialectic Architecture.md` to reflect the final, corrected architecture and data flow.

*   `[ ]` 13. `[COMMIT]` Commit all changes with a `fix:` prefix, referencing the resolved issue.
