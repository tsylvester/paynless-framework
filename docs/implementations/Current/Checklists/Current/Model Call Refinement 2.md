# Model Call Refinement 2: Complex Job Processing

This document provides a complete, verified, and end-to-end implementation plan for complex job management logic into the AI chat service. This feature will allow the system to handle requests that are too large for the input to fix in the model's input window, or too complex for the model to complete in a single pass.

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

### Phase 9: [REFACTOR] Implement Tiered Context Window Management

This phase implements the critical, tiered strategy for managing model context window limitations without resorting to naive summarization, as defined in the "Computable Determinant" architecture.

#### 25. [BE] [DB] Create and Integrate Prerequisite "Combination" Job Logic

*   `[✅]` 25.a. **Enhance Jobs Table for Prerequisite Tracking:**
    *   `[DB]` **Action:** In a new migration, add a `prerequisite_job_id` (nullable, UUID, foreign key to `dialectic_generation_jobs.id`) to the `dialectic_generation_jobs` table.
    *   `[DB]` **Action:** Add a new job status: `'waiting_for_prerequisite'`.
*   `[✅]` 25.b. **Implement Combination Prompt Strategy:**
    *   `[BE]` `[PROMPT]` **Action:** In the `system_prompts` table, create a new entry for the combination job. It should be along the lines of: *"You are a document synthesis agent. Combine the following documents into a single, coherent text. You must preserve every unique fact, requirement, argument, and detail. Eliminate only redundant phrasing or conversational filler."*
*   `[✅]` 25.c. **[REFACTOR] Implement a Modular, Reusable Model Execution Utility:**
    *   `[✅]` 25.c.i. **Goal:** To refactor the shared logic for calling AI models and saving results into a single, reusable utility, adhering to DRY and SRP principles.
    *   `[✅]` 25.c.ii. **Create Generic `executeModelCallAndSave` Utility:**
        *   `[BE]` `[TEST-UNIT]` **(RED)** Create a new test file: `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts`. Write a failing test that calls a mock of this utility, providing a prepared prompt and context. Assert that the AI adapter is called and that the `FileManager` is invoked to save the result.
        *   `[BE]` `[REFACTOR]` **(GREEN)** Create the file: `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`. Move the common logic from `processSimpleJob.ts` (the part that calls `callUnifiedAIModel`, handles the response, and then calls the `FileManager` to save the contribution) into this new function.
        *   `[TEST-UNIT]` **(PROVE)** Prove the unit tests for the new utility pass.
    *   `[✅]` 25.c.iii. **Refactor `processSimpleJob` into a "Preparer":**
        *   `[BE]` `[TEST-UNIT]` **(RED)** Update the tests in `processSimpleJob.test.ts`. They should no longer assert that the AI adapter or `FileManager` are called directly. Instead, they should assert that `processSimpleJob` correctly performs its setup (using `PromptAssembler` with stage recipes) and then calls the new `executeModelCallAndSave` utility with the correctly prepared parameters.
        *   `[BE]` `[REFACTOR]` **(GREEN)** Refactor `processSimpleJob.ts`. Remove the logic that was just moved and replace it with a call to the new utility. Its sole responsibility is now preparing the context for a stage-based job.
        *   `[TEST-UNIT]` **(PROVE)** Prove the refactored `processSimpleJob` tests pass.
    *   `[✅]` 25.c.iv. **Implement `processCombinationJob` as a "Preparer":**
        *   `[BE]` `[TEST-UNIT]` **(RED)** Create a new test file: `supabase/functions/dialectic-worker/processCombinationJob.test.ts`. Write a failing test that asserts this new function correctly prepares the context for a utility combination job (fetches the specific 'Tier 2 Document Combiner' prompt, gets documents from the payload) and then calls `executeModelCallAndSave`.
        *   `[BE]` `[REFACTOR]` **(GREEN)** Create the file: `supabase/functions/dialectic-worker/processCombinationJob.ts`. Implement the simple setup logic and have it call the shared `executeModelCallAndSave` utility.
        *   `[TEST-UNIT]` **(PROVE)** Prove the `processCombinationJob` tests pass.
    *   `[✅]` 25.c.v. **Update the Main Worker Router:**
        *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/processJob.ts`.
        *   `[BE]` `[REFACTOR]` **Action:** The main router must be updated to delegate to the new `processCombinationJob` module when a job with `job_type: 'combine'` is received.
*   `[✅]` 25.d. **Implement Orchestration for Prerequisite Jobs:**
    *   `[DB]` **File:** The `handle_child_job_completion()` PostgreSQL function.
    *   `[DB]` `[REFACTOR]` **Action:** The trigger function must be enhanced to be a more generic `handle_job_completion()` orchestrator. When a job completes, it must check both of the following:
        1.  **Parent/Child:** Does this job have a `parent_job_id`? If so, check if all siblings are complete to wake the parent.
        2.  **Prerequisite/Waiting:** Does any other job list this job's `id` in its `prerequisite_job_id` field? If so, update the waiting job's status from `'waiting_for_prerequisite'` to `'pending'`.

#### 26. [BE] [REFACTOR] Integrate Tiered Context Window Management

This step implements a hybrid, two-layer defense mechanism to manage model context windows, ensuring both efficient orchestration and absolute safety against API errors. The strategy involves an initial check at the "planning" stage and a final validation at the "execution" stage.

*   `[✅]` 26.a. **Create `ContextWindowError` Custom Error:**
    *   `[BE]` **File:** `supabase/functions/_shared/utils/errors.ts`.
    *   `[BE]` **Action:** Create and export a new custom error class, `ContextWindowError`, that extends the base `Error` class. This allows for specific `catch` blocks in the worker logic.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/_shared/utils/errors.ts
        export class ContextWindowError extends Error {
          constructor(message: string) {
            super(message);
            this.name = 'ContextWindowError';
          }
        }
        ```

*   `[✅]` 26.b. **Implement Tier 2 Orchestration in the Complex Job Planner:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/task_isolator.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** The `planComplexStage` function will be modified to perform a pre-emptive check on the collected source documents *before* it attempts to plan child jobs.
    *   **Logic:**
        1.  **Location:** The new logic will be placed after the `validSourceDocuments` array is populated.
        2.  **Token Estimation:**
            *   Import `countTokensForMessages` from `supabase/functions/_shared/utils/tokenizer_utils.ts`.
            *   Fetch the `ai_providers` record for the `parentJob.payload.model_id` to get its `max_input_tokens` and `tokenization_strategy`.
            *   Map the `validSourceDocuments` to the `MessageForTokenCounting` format (`[{ role: 'user', content: doc.content }]`).
            *   Calculate the `estimatedTokens` for the entire collection of documents.
        3.  **Tier 1 (Context is OK):** If `estimatedTokens` is less than `max_input_tokens`, the function proceeds with its existing logic to plan and return child jobs.
        4.  **Tier 2 (Context is Too Large):** If `estimatedTokens` exceeds `max_input_tokens`:
            *   The function will create a *new* prerequisite job.
            *   **New Job Payload:**
                *   `job_type`: `'combine'`
                *   `payload`: Contains the `resource_ids` of all documents in `validSourceDocuments`. This gives the `processCombinationJob` worker the information it needs to fetch the content later.
                *   Inherit necessary fields from the `parentJob` (e.g., `sessionId`, `projectId`, `user_id`).
            *   **Database Operations:**
                *   Use `dbClient` to `insert` the new "combine" job into `dialectic_generation_jobs`.
                *   Use `dbClient` to `update` the original `parentJob`, setting its `status` to `'waiting_for_prerequisite'` and `prerequisite_job_id` to the ID of the new combine job.
            *   The function will then log this action and `return []`, halting the planning process for the current parent job until the prerequisite is met.

*   `[✅]` 26.c. **Implement Final Validation in the Model Executor:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** This function will be modified to act as the final safeguard, validating the token count of the *fully rendered prompt* just before making the API call.
    *   **Logic:**
        1.  **Location:** The new logic will be placed immediately before the call to `deps.callUnifiedAIModel`.
        2.  **Token Calculation:**
            *   Import `countTokensForMessages` from `supabase/functions/_shared/utils/tokenizer_utils.ts`.
            *   Construct the `MessageForTokenCounting` array from the `renderedPrompt.content` and `previousContent`.
            *   Calculate the `finalTokenCount` using the `providerDetails` (which is an `AiModelExtendedConfig`).
        3.  **Validation:**
            *   If `finalTokenCount` exceeds `providerDetails.max_input_tokens`, the function will `throw new ContextWindowError(...)` with a detailed message. This is a hard failure, as the context is too large even after potential planning and combination. The check should account for a small buffer if necessary (e.g., `max_input_tokens * 0.98`).

*   `[✅]` 26.d. **Update Worker Error Handling:**
    *   `[BE]` `[REFACTOR]` **Files:** `supabase/functions/dialectic-worker/processSimpleJob.ts` and `supabase/functions/dialectic-worker/processComplexJob.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** The top-level `try/catch` block in these worker files must be updated to specifically handle the `ContextWindowError`.
    *   **Logic:**
        1.  Add `import { ContextWindowError } from '../_shared/utils/errors.ts';`.
        2.  Inside the `catch (e)` block, add a specific check: `if (e instanceof ContextWindowError) { ... }`.
        3.  **On Catch:**
            *   Log the specific error.
            *   Update the job's status to `'failed'`.
            *   Set the `error_details` field with a clear message explaining that the context window was exceeded and no strategy could resolve it.
            *   Use the `notificationService` to dispatch a user-facing failure notification. This ensures the user is informed about why the job could not be completed.

---

### Phase 10: [REFACTOR] Implement Reusable, Database-Driven Step Prompts

This phase refactors the worker to use pre-defined, reusable prompt templates for each step within a complex stage, making the system more modular and easier to maintain.

#### 27. [DB] [BE] Formalize Step Recipes and Prompts

*   `[✅]` 27.a. **Create Database Migration/Seed File:**
    *   `[DB]` **Action:** Create a new migration or seed file.
    *   `[DB]` **Action:** Seed the `system_prompts` table with specific, reusable prompt templates for each step of a complex stage.
        *   **Example 1 (`synthesis_step1_pairwise`):** *"As an expert synthesizer, your task is to analyze the following user prompt, an original thesis written to address it, and a single antithesis that critiques the thesis. Combine the thesis and antithesis into a more complete and accurate response that is more fit-for-purpose against the original user prompt. Preserve all critical details."*
        *   **Example 2 (`synthesis_step2_combine`):** *"As an expert editor, your task is to analyze the following user prompt and a set of preliminary syntheses. Combine these documents into a single, unified synthesis that is maximally fit-for-purpose against the original user prompt. You must eliminate redundancy and conflicting information while ensuring every unique and critical detail is preserved."*
*   `[✅]` 27.b. **Populate `synthesis` Stage with Recipe Data:**
    *   `[DB]` **Action:** Create a new, single-purpose migration file to populate the `synthesis` stage with its formal, multi-step recipe. This enables the worker to follow a pre-defined plan instead of using hardcoded logic.
    *   `[DB]` **Action:** In the new migration file, write an `UPDATE` statement for the `dialectic_stages` table, targeting the row where `slug = 'synthesis'`.
    *   `[DB]` **Implementation Detail:** The `UPDATE` statement will set the `input_artifact_rules` JSONB value to a new structure containing a `steps` array. Each object within this array will define a step, including a `prompt_template_name` that references the prompts seeded in step `27.a`. This action effectively applies the new recipe schema to the `synthesis` stage.
*   `[✅]` 27.c. **[BE] [REFACTOR] Update Job Enqueuer for Recipe Awareness:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   `[BE]` `[REFACTOR]` **Action:** The logic must be updated to first fetch the stage recipe before creating the parent job. This is critical for populating the `step_info` object correctly.
    *   **Implementation Detail:**
        ```typescript
        // In generateContribution.ts, inside the main try block:

        // 1. Fetch the recipe for the stage
        const { data: stageDef, error: recipeError } = await dbClient
            .from('dialectic_stages')
            .select('input_artifact_rules')
            .eq('slug', stageSlug)
            .single();

        if (recipeError || !stageDef) {
            // Handle error: couldn't find the stage definition
            return { success: false, error: { message: `Could not find recipe for stage ${stageSlug}.`, status: 500 } };
        }
        
        // 2. Calculate total steps from the recipe
        const totalSteps = (stageDef.input_artifact_rules)?.steps?.length || 1;

        // 3. Inside the loop for creating jobs, construct the formal payload:
        const jobPayload: Json = {
            // ...existing context like projectId, sessionId, model_id
            job_type: 'plan',
            step_info: {
                current_step: 1,
                total_steps: totalSteps,
                status: 'pending',
            }
        };

        // 4. Insert the job with this new payload
        // ...
        ```

#### 28. [BE] [TEST-UNIT] Implement Core Granularity Strategy Functions

This step implements the core "Strategy" pattern for the complex job planner. It decouples the orchestration logic in `processComplexJob` from the specific logic of how to break down a task by creating a set of modular, testable "planner" functions. Each function aligns with a `granularity_strategy` defined in the stage recipes. The implementation will follow a strict Test-Driven Development (TDD) methodology.

*   `[✅]` 28.a. **Create Granularity Strategy Module & Directory Structure:**
    *   `[BE]` **Action:** Create a new directory: `supabase/functions/dialectic-worker/strategies/`. This will serve as the home for all planner-related logic.
    *   `[BE]` **Action:** Inside the new directory, create another directory: `planners/`. This will contain the individual planner function files.
    *   `[BE]` **Action:** Create the main strategy registry file: `supabase/functions/dialectic-worker/strategies/granularity.strategies.ts`.
    *   `[BE]` **Action:** In this file, define and export the `granularityStrategyMap` and the `getGranularityPlanner` function as specified in `A Computable Determinant for Task Isolation.md`. This map will associate strategy strings (e.g., `'pairwise_by_origin'`) with the actual planner function implementations.
    *   **Implementation Detail:**
        ```typescript
        // In granularity.strategies.ts
        import { planPairwiseByOrigin, planPerSourceDocument, planAllToOne, planPerSourceGroup } from './planners';

        export const granularityStrategyMap = {
          'per_source_document': planPerSourceDocument,
          'pairwise_by_origin': planPairwiseByOrigin,
          'per_source_group': planPerSourceGroup,
          'all_to_one': planAllToOne,
        };

        export function getGranularityPlanner(strategyId: string) {
            return granularityStrategyMap[strategyId] || planPerSourceDocument; // Default strategy
        }
        ```

*   `[✅]` 28.b. **Implement `planPairwiseByOrigin` Strategy (Map):**
    *   `[BE]` `[TEST-UNIT]` **(RED)** In the `strategies/planners/` directory, create a new test file: `planPairwiseByOrigin.test.ts`. Write a failing unit test that defines the function's contract.
        *   **Test Case:** Provide a mock set of source documents (e.g., 2 `thesis` contributions and 3 related `antithesis` contributions) and a mock parent job context.
        *   **Assertion:** Assert that the planner function returns the correct number of child job payloads and that each payload is correctly formed (e.g., `job_type: 'execute'`, correct `prompt_template_name`, and correctly paired `thesis_id` and `antithesis_id` in the `inputs`).
    *   `[BE]` `[TEST-UNIT]` **(RED)** Create helper utility tests. For example, in a new `strategy.helpers.test.ts` file, write failing tests for `groupSourceDocumentsByType` and `findRelatedContributions`.
    *   `[BE]` `[REFACTOR]` **(GREEN)** Create `strategy.helpers.ts` and implement the helper functions to make the tests pass. These helpers will be responsible for sorting input documents by type and finding related documents based on `source_contribution_id`.
    *   `[BE]` **(GREEN)** In the `strategies/planners/` directory, create `planPairwiseByOrigin.ts`. Implement the planner function logic as described in the documentation, using the tested helpers. The function will loop through `thesis` documents, find their corresponding `antithesis` documents, and generate a child job payload for each pair.
    *   `[TEST-UNIT]` **(PROVE)** Prove that all unit tests in `planPairwiseByOrigin.test.ts` now pass.
    *   **Implementation Detail (Skeleton):**
        ```typescript
        // In a file like /strategies/planners/planPairwiseByOrigin.ts
        export function planPairwiseByOrigin(sourceDocs: SourceDocuments, parentJobPayload: ParentJobPayload, recipeStep: RecipeStep): ChildJobPayload[] {
            const childJobs: ChildJobPayload = [];
            const { theses, antitheses } = groupSourceDocuments(sourceDocs); // Utility to sort inputs

            for (const thesis of theses) {
                // Find antitheses derived from this thesis
                const relatedAntitheses = findRelated(antitheses, thesis.id);
                for (const antithesis of relatedAntitheses) {
                    const newPayload = {
                        // ... core context from parent
                        job_type: 'execute',
                        // The planner now gets the prompt name directly from the recipe!
                        prompt_template_name: recipeStep.prompt_template_name,
                        inputs: {
                            thesis_id: thesis.resource_id,
                            antithesis_id: antithesis.resource_id,
                        }
                    };
                    childJobs.push(newPayload);
                }
            }
            return childJobs;
        }
        ```

*   `[✅]` 28.c. **Implement `planPerSourceDocument` Strategy (Map):**
    *   `[BE]` `[TEST-UNIT]` **(RED)** Create `planPerSourceDocument.test.ts`. Write a failing test that provides a list of source documents and asserts that the function returns a child job for each one.
    *   `[BE]` **(GREEN)** Create `planPerSourceDocument.ts`. Implement the simple logic to loop through the inputs and create a job for each.
    *   `[TEST-UNIT]` **(PROVE)** Prove the test passes.

*   `[✅]` 28.d. **Implement `planPerSourceGroup` Strategy (Reduce):**
    *   `[BE]` `[TEST-UNIT]` **(RED)** Create `planPerSourceGroup.test.ts`. Write a failing test.
        *   **Test Case:** Provide a list of intermediate artifacts (e.g., `pairwise_synthesis_chunk`) that share a common `source_contribution_id`.
        *   **Assertion:** Assert that the function groups these artifacts correctly and generates a single child job for each group, with all grouped `resource_id`s in the `inputs`.
    *   `[BE]` **(GREEN)** Create `planPerSourceGroup.ts`. Implement the logic to group documents by `source_contribution_id` and generate one job per group.
    *   `[TEST-UNIT]` **(PROVE)** Prove the test passes.

*   `[✅]` 28.e. **Implement `planAllToOne` Strategy (Reduce):**
    *   `[BE]` `[TEST-UNIT]` **(RED)** Create `planAllToOne.test.ts`. Write a failing test that provides a list of inputs and asserts that the function returns exactly one child job containing all input `resource_id`s.
    *   `[BE]` **(GREEN)** Create `planAllToOne.ts`. Implement the straightforward logic.
    *   `[TEST-UNIT]` **(PROVE)** Prove the test passes.

*   `[✅]` 28.f. **[COMMIT] `feat(worker): implement granularity strategy planners`**
    *   **Action:** Commit the completed, fully tested granularity strategy module.

#### 29. [BE] [REFACTOR] Enhance Planner for Multi-Step Recipe Execution

This step refactors the complex job worker to be driven by a formal, multi-step recipe defined in the database. The implementation maintains strict type safety from end to end by defining clear interfaces and using TypeScript's type guard system, completely avoiding type casting.

##### Phase 29.1: Establish the Type-Safe Foundation

Before modifying logic, we must define the new data structures that will drive the multi-step process.

*   `[✅]` 29.a. **Define Recipe and Step Interfaces:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/dialectic.interface.ts`.
    *   `[BE]` **Action:** Add new interfaces to represent the recipe structure stored in the `dialectic_stages.input_artifact_rules` JSONB column.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/dialectic-service/dialectic.interface.ts

        /**
         * Describes a single step within a multi-step job recipe.
         */
        export interface DialecticRecipeStep {
            step: number;
            name: string;
            prompt_template_name: string;
            inputs_required: {
                type: string;
                origin_type?: string; // e.g., 'thesis' for antithesis inputs
            }[];
            granularity_strategy: 'per_source_document' | 'pairwise_by_origin' | 'per_source_group' | 'all_to_one';
            output_type: string; // e.g., 'pairwise_synthesis_chunk'
        }

        /**
         * Describes the complete recipe for a complex, multi-step stage.
         */
        export interface DialecticStageRecipe {
            processing_strategy: {
                type: 'task_isolation';
            };
            steps: DialecticRecipeStep[];
        }
        ```
    *   `[BE]` **File:** `supabase/functions/_shared/utils/type_guards.ts`.
    *   `[BE]` **Action:** Add a corresponding type guard to safely validate the recipe structure at runtime.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/_shared/utils/type_guards.ts
        export function isDialecticStageRecipe(value: unknown): value is DialecticStageRecipe {
            const recipe = value;
            return (
                recipe?.processing_strategy?.type === 'task_isolation' &&
                Array.isArray(recipe.steps) &&
                recipe.steps.every(
                    (step) =>
                        typeof step.step === 'number' &&
                        typeof step.prompt_template_name === 'string' &&
                        typeof step.granularity_strategy === 'string' &&
                        typeof step.output_type === 'string' &&
                        Array.isArray(step.inputs_required)
                )
            );
        }
        ```

*   `[✅]` 29.b. **Update Job Payload Types:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/dialectic.interface.ts`.
    *   `[BE]` **Action:** Introduce new, strictly-typed payloads for parent (`'plan'`) jobs and child (`'execute'`) jobs, along with a `step_info` tracker. Update the main `DialecticJobPayload` to be a discriminated union of all possible payload types.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/dialectic-service/dialectic.interface.ts

        /**
         * Tracks the progress of a multi-step job.
         */
        export interface DialecticStepInfo {
            current_step: number;
            total_steps: number;
        }

        /**
         * The base payload containing information common to all job types.
         */
        export interface DialecticBaseJobPayload extends Omit<GenerateContributionsPayload, 'selectedModelIds'> {
            model_id: string; // Individual model ID for this specific job
        }

        /**
         * The payload for a parent job that plans steps based on a recipe.
         */
        export interface DialecticPlanJobPayload extends DialecticBaseJobPayload {
            job_type: 'plan';
            step_info: DialecticStepInfo;
        }

        /**
         * The payload for a child job that executes a single model call.
         */
        export interface DialecticExecuteJobPayload extends DialecticBaseJobPayload {
            job_type: 'execute';
            step_info: DialecticStepInfo; // Pass down for context
            prompt_template_name: string;
            output_type: string; // The type of artifact this job will produce
            inputs: {
                // Key-value store for resource_ids needed by the prompt
                [key: string]: string; 
            };
        }
        
        // Update the main union type
        export type DialecticJobPayload =
            | DialecticSimpleJobPayload // Assuming this exists for non-complex jobs
            | DialecticPlanJobPayload
            | DialecticExecuteJobPayload
            | DialecticCombinationJobPayload;
        ```
    *   `[BE]` **File:** `supabase/functions/_shared/utils/type_guards.ts`.
    *   `[BE]` **Action:** Create type guards for the new payloads.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/_shared/utils/type_guards.ts
        export function isDialecticPlanJobPayload(payload: unknown): payload is DialecticPlanJobPayload {
            const p: DialecticPlanJobPayload = payload;
            return p?.job_type === 'plan' && typeof p.step_info?.current_step === 'number';
        }

        export function isDialecticExecuteJobPayload(payload: unknown): payload is DialecticExecuteJobPayload {
            const p = payload as DialecticExecuteJobPayload;
            return p?.job_type === 'execute' && typeof p.prompt_template_name === 'string' && typeof p.inputs === 'object';
        }
        ```

##### Phase 29.2: Implement the Recipe-Driven Logic

*   `[✅]` 29.c. **Refactor `processComplexJob` as the Orchestrator:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/processComplexJob.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** Refactor `processComplexJob` to be the master orchestrator. It is responsible for reading the job's `step_info`, fetching the stage recipe, determining the current step, and delegating to the planner.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/dialectic-worker/processComplexJob.ts
        export async function processComplexJob(
            dbClient: SupabaseClient<Database>,
            // The intersection type asserts this job has a plannable payload
            job: DialecticJobRow & { payload: DialecticJobPayload },
            // ... deps
        ): Promise<void> {
            // Use the type guard to safely narrow the payload
            if (!isDialecticPlanJobPayload(job.payload)) {
                // This is a logic error, the job router should not send other job types here.
                throw new Error(`Job ${job.id} has an invalid payload for complex processing.`);
            }
            
            // From here, `job.payload` is a strongly-typed `DialecticPlanJobPayload`
            const { step_info, stageSlug } = job.payload;
            deps.logger.info(`[processComplexJob] Processing step ${step_info.current_step}/${step_info.total_steps} for job ${job.id}`);

            // 1. Fetch the recipe and validate its structure with a type guard
            const { data: stageData } = await dbClient.from('dialectic_stages').select('input_artifact_rules').eq('slug', stageSlug!).single();
            if (!isDialecticStageRecipe(stageData?.input_artifact_rules)) {
                throw new Error(`Stage '${stageSlug}' has an invalid or missing recipe.`);
            }
            const recipe = stageData.input_artifact_rules;
            
            // 2. Determine the current step's recipe
            const currentRecipeStep = recipe.steps.find(s => s.step === step_info.current_step);
            if (!currentRecipeStep) {
                throw new Error(`Could not find recipe for step ${step_info.current_step}.`);
            }

            // 3. Delegate to the planner to create child jobs for this specific step
            const childJobsToInsert = await deps.planComplexStage(dbClient, job, deps, currentRecipeStep);
            
            // ... (rest of the logic to insert child jobs and update parent status to 'waiting_for_children')
        }
        ```
*   `[✅]` 29.d. **Refactor `task_isolator.ts` as the Step Planner:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/task_isolator.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** The `planComplexStage` function is refactored to be a pure "step planner". It no longer orchestrates but is instead called *by* the orchestrator (`processComplexJob`) to plan a single step based on the provided recipe.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/dialectic-worker/task_isolator.ts
        export async function planComplexStage(
            dbClient: SupabaseClient<Database>,
            parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
            deps: IPlanComplexJobDeps,
            // The specific recipe for the current step is now passed in
            recipeStep: DialecticRecipeStep,
        ): Promise<ChildJobInsert[]> { // ChildJobInsert is the type for a new DB row
            
            // 1. Use recipeStep.inputs_required to query for source documents.
            const sourceDocuments = await findSourceDocuments(dbClient, parentJob.payload.projectId, recipeStep.inputs_required);

            // 2. Get the correct planner function using the strategy from the recipe.
            const planner = getGranularityPlanner(recipeStep.granularity_strategy);

            // 3. Execute the planner to get the strongly-typed child job payloads.
            const childJobPayloads: DialecticExecuteJobPayload[] = planner(sourceDocuments, parentJob.payload, recipeStep);

            // 4. Map to full job rows for DB insertion, maintaining type safety.
            const childJobsToInsert = childJobPayloads.map(payload => ({
                parent_job_id: parentJob.id,
                // ... other fields from parent ...
                status: 'pending',
                payload: payload, // `payload` is already a valid, typed `DialecticExecuteJobPayload`
            }));
            
            return childJobsToInsert;
        }
        ```
*   `[✅]` 29.e. **Ensure Original Prompt is Always Included:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/_shared/prompt-assembler.ts`.
    *   `[BE]` **Action:** The `gatherContext` utility must be updated to always fetch the project's original user prompt for any job belonging to a complex stage (e.g., `'synthesis'`). This prompt text must be passed to the prompt renderer as a distinct, top-level variable (`original_user_request`) to ensure it's available for injection into any step's prompt template.
*   `[✅]` 29.f. **Tag Intermediate Artifacts in the Executor:**
    *   `[BE]` **File:** `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`.
    *   `[BE]` **Action:** When saving the output of a child job, the worker must use the `output_type` from the strongly-typed payload to tag the new artifact in `dialectic_project_resources`.
    *   **Implementation Detail:**
        ```typescript
        // In supabase/functions/dialectic-worker/executeModelCallAndSave.ts
        export async function executeModelCallAndSave(
            // The job here is a child job with a strongly-typed 'execute' payload
            job: DialecticJobRow & { payload: DialecticExecuteJobPayload },
            // ... other parameters
        ) {
            // ... logic to call the AI model ...
            const modelOutput = await deps.callUnifiedAIModel(...);

            // When saving the result, the output_type comes directly from the typed payload.
            await fileManager.uploadAndRegisterFile({
                // ... other context
                resourceTypeForDb: job.payload.output_type,
                description: `Intermediate artifact for ${job.id}, step ${job.payload.step_info.current_step}`,
            });
        }
        ```
*   `[✅]` 29.g. **Update Parent Job Orchestration Logic:**
    *   `[DB]` `[BE]` **File:** The `handle_job_completion()` PostgreSQL function and `supabase/functions/dialectic-worker/processComplexJob.ts`.
    *   `[BE]` **Action:** The state machine is orchestrated as follows:
        1.  When all child jobs for a step complete, the `handle_job_completion()` trigger wakes the parent job by setting its status to `'pending_next_step'`.
        2.  The `processComplexJob` worker picks up this parent job. Its first action is to check for this status.
        3.  If the status is `pending_next_step`, it increments `payload.step_info.current_step` and updates the job in the database.
        4.  It then proceeds with the planning logic. If `current_step > total_steps`, it marks the parent job as `'completed'`. Otherwise, it re-calls the planner for the new step.
*   `[✅]` 29.h. **Define Multi-Step Error Handling Strategy:**
    *   `[BE]` `[REFACTOR]` **Action:** If any child job (type `'execute'`) fails permanently, it must report its failure to the parent. The `handle_job_completion` trigger will detect this child failure and immediately set the parent job's `status` to `'failed'`, also marking `step_info.status` as `'failed'`. This fail-fast approach prevents the process from getting stuck waiting for a job that will never complete.

#### 30. [TEST-INT] Create the End-to-End Antithesis and Synthesis Pipeline Tests

*   `[ ]` 30.a. **Create New Synthesis Integration Test File:**
    *   `[TEST-INT]` **File:** `supabase/integration_tests/services/dialectic_synthesis_pipeline.integration.test.ts`.
*   `[ ]` 30.b. **Test Setup:**
    *   `[TEST-INT]` **Action:** Seed a test user, project, and session. Seed completed `thesis` and `antithesis` contributions.
*   `[ ]` 30.c. **Test Execution Simulation:**
    *   `[TEST-INT]` **Action:** The test will need a loop that simulates the entire process:
        1.  Invoke the `dialectic-service` to start the `synthesis` stage. Assert the parent job is created.
        2.  Call `executePendingDialecticJobs()`. Assert that child jobs for **Step 1** are created and the parent is `waiting_for_children`.
        3.  Manually mark all Step 1 child jobs as `completed`. Assert the DB trigger fires and the parent job is now `pending_next_step`.
        4.  Call `executePendingDialecticJobs()` again. The worker should pick up the parent job, increment its step, and plan **Step 2**. Assert new child jobs are created.
        5.  Repeat this process for all three steps of the synthesis recipe.
*   `[ ]` 30.d. **Final Assertions:**
    *   `[TEST-INT]` **Action:** Assert that the parent job is finally marked as `completed`.
    *   `[TEST-INT]` **Action:** Query the database and storage to ensure the correct number of intermediate artifacts (`pairwise_synthesis_chunk`, `reduced_synthesis`) and the final `synthesis` contributions were created correctly.

### Phase 13: Centralized Configuration Management

This phase introduces a centralized configuration system to manage dynamic parameters and feature flags, enhancing the system's flexibility and maintainability without requiring code deployments for simple adjustments.

#### 33. [DB] [BE] Implement the Configuration Store
*   `[ ]` 33.a. **Create `dialectic_configuration` Table:**
    *   `[DB]` **Action:** Create a new SQL migration for a `dialectic_configuration` table with a simple key-value structure (e.g., `config_key TEXT PRIMARY KEY`, `config_value JSONB`, `description TEXT`).
    *   `[DB]` **Action:** Populate this table with initial configuration values, such as `{"key": "job_default_max_retries", "value": {"value": 3}}`, `{"key": "rag_data_retention_days", "value": {"value": 30}}`, and `{"key": "antithesis_task_isolation_enabled", "value": {"value": true}}`.
*   `[ ]` 33.b. **Create a Configuration Service:**
    *   `[BE]` **Action:** In `supabase/functions/_shared/`, create a new `config_service.ts`. This service will be responsible for fetching configuration values from the database, caching them (e.g., in-memory with a short TTL), and providing a simple `getConfigValue(key)` interface.
#### 34. [BE] [REFACTOR] Refactor Services to Use the Configuration Store
*   `[ ]` 34.a. **Update Dialectic Worker:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/index.ts`
    *   `[BE]` `[REFACTOR]` **Action:** Refactor the worker logic to fetch parameters like `max_retries` and feature flags (e.g., for task isolation) from the new `config_service` instead of using hardcoded values.
*   `[ ]` 34.b. **Update Job Enqueuer:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   `[BE]` `[REFACTOR]` **Action:** Update the function to fetch the default `max_retries` from the `config_service` when creating a new job, while still allowing it to be overridden by a value in the request payload.
*   `[ ]` 34.c. **Update Data Lifecycle Script:**
    *   `[BE]` `[REFACTOR]` **Action:** Modify the scheduled SQL function for RAG data cleanup to retrieve the `rag_data_retention_days` value from the `dialectic_configuration` table, making the retention period dynamically adjustable.

#### 34. [DB] [BE] Prove Integration Test Passes for Thesis, Antithesis, Synthesis
*   `[ ]` 34.a. **Add End-to-End Integration Test for Service-to-Worker Flow:**
    *   `[TEST-INT]` **Goal:** To create a comprehensive integration test that validates the entire asynchronous workflow, from an initial API call to the `dialectic-service` through the `dialectic-worker`'s complete processing, including complex orchestration, retries, and continuations. This test proves the core mechanics of the Mermaid diagram are functioning correctly.
    *   `[TEST-INT]` **File Location:** `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
    *   `[TEST-INT]` **Core Framework:**
        *   **Setup/Teardown:** Utilize the `coreInitializeTestStep` and `coreCleanupTestResources` from `_shared/_integration.test.utils.ts` to create a hermetically sealed test environment. This includes seeding a test user, project, session, and the `thesis`/`antithesis` stage configurations.
        *   **Mocking:** Use Deno's spies to replace the real AI adapter with the `MockAiProviderAdapter` from `_shared/ai_service/ai_provider.mock.ts`. The test will gain full control over the AI's behavior.
            *   The mock will be configured on a per-test basis to simulate specific scenarios by telling it which model should fail, how many times it should fail before succeeding, and which model should return a `finish_reason: 'length'` to trigger continuations.
        *   **Asynchronous Invocation:** Since the test environment does not have database webhooks, the test will manually trigger the `dialectic-worker` after the `dialectic-service` enqueues a job. This is accomplished by calling a new test utility, `executePendingDialecticJobs()`, which finds pending jobs in the database and invokes the worker handler for each one, thereby simulating the production environment's event-driven architecture.
    *   `[TEST-INT]` **Test Case 1: Simple Stage (Thesis) with Failures & Continuations:**
        *   **Arrange:**
            1.  Configure the `thesis` stage with a `simple` processing strategy.
            2.  Configure the mock AI provider: Model 'A' will fail once then succeed. Model 'B' will require one continuation.
        *   **Act:** Invoke the `dialectic-service` HTTP endpoint to generate contributions for the Thesis stage with models 'A' and 'B'.
        *   **Assert (via Database Polling):**
            1.  Poll the `dialectic_generation_jobs` table to observe the job for Model 'A' transition through `processing` -> `retrying` -> `completed` with an `attempt_count` of 2.
            2.  Poll to observe the job for Model 'B' complete and correctly enqueue a *new* continuation job (with a `target_contribution_id`).
            3.  Poll until all jobs are `completed`.
            4.  Verify the final `dialectic_contributions` records and their content in storage are correct.
    *   `[TEST-INT]` **Test Case 2: Complex Stage (Antithesis) with Task Isolation:**
        *   **Arrange:**
            1.  Seed two completed `thesis` contributions as input.
            2.  Configure the `antithesis` stage with `processing_strategy.type: 'task_isolation'`.
            3.  Configure the mock AI provider to return a successful response for all child jobs.
        *   **Act & Assert (Step 1: Planning):**
            1.  Invoke the `dialectic-service` to generate contributions for the Antithesis stage.
            2.  Assert that the immediate HTTP response is `202 Accepted` and contains the parent job's ID.
            3.  Poll the jobs table to observe the parent job get created and transition to `status: 'waiting_for_children'`.
            4.  Verify that the correct number of "child" jobs (with `parent_job_id` set) are created by the `task_isolator`.
        *   **Act & Assert (Step 2: Execution):**
            1.  Call the `executePendingDialecticJobs()` test helper to process the pending child jobs.
            2.  Poll the jobs table and observe all child jobs transition to `status: 'completed'`.
        *   **Act & Assert (Step 3: Orchestration & Verification):**
            1.  Poll the jobs table and assert that the orchestration trigger fires after the last child job completes, updating the parent job's status to `'completed'`.
            2.  Query the `dialectic_contributions` table and assert that the correct number of antithesis contributions have been created.
            3.  (Optional) Download the content of one or more contributions from storage and verify it matches the mock AI's output.

