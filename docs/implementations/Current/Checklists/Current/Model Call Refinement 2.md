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

#### 26. [BE] [REFACTOR] Integrate Tiered Logic into the Worker

*   `[ ]` 26.a. **Refactor Planner and Executor Modules:**
    *   `[BE]` `[REFACTOR]` **Files:** `processSimpleJob.ts`, `processComplexJob.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** Before preparing a prompt for an AI call, inject a call to a new utility function, e.g., `resolveContext(docs, model, parentJob)`.
*   `[ ]` 26.b. **Implement `resolveContext` Utility:**
    *   `[BE]` `[TEST-UNIT]` **Action:** Create the `resolveContext` utility and its test file.
    *   `[BE]` **Logic:**
        1.  It receives the documents, the target model's details (including `max_input_tokens`), and the parent job's context.
        2.  It uses a tokenizer to estimate the total token count.
        3.  **Tier 1:** If tokens are within the limit, it returns `{ status: 'ok', documents: [...] }`.
        4.  **Tier 2:** If tokens moderately exceed the limit, it enqueues a new job with `job_type: 'combine'`, sets the original job's status to `'waiting_for_prerequisite'`, links it via `prerequisite_job_id`, and returns `{ status: 'waiting' }`. This triggers the use of the `processCombinationJob` method. 
        5.  **Tier 3:** If tokens significantly exceed the limit, it initiates the RAG process and returns `{ status: 'ok', documents: [...] }` with the RAG-retrieved context.
        6.  **Tier 4:** If no strategy is viable, it throws a specific `ContextWindowError`.
*   `[ ]` 26.c. **Update Worker Error Handling:**
    *   `[BE]` **Action:** In the main `try/catch` block of the worker modules, add a specific `catch` for the `ContextWindowError`.
    *   `[BE]` **Action:** When this error is caught, the job should be marked as `'failed'`, and a specific, user-facing notification should be dispatched explaining the context limitation.

---

### Phase 10: [REFACTOR] Implement Reusable, Database-Driven Step Prompts

This phase refactors the worker to use pre-defined, reusable prompt templates for each step within a complex stage, making the system more modular and easier to maintain.

#### 27. [DB] [BE] Formalize Step Recipes and Prompts

*   `[✅]` 27.a. **Create Database Migration/Seed File:**
    *   `[DB]` **Action:** Create a new migration or seed file.
    *   `[DB]` **Action:** Seed the `system_prompts` table with specific, reusable prompt templates for each step of a complex stage.
        *   **Example 1 (`synthesis_step1_pairwise`):** *"As an expert synthesizer, your task is to analyze the following user prompt, an original thesis written to address it, and a single antithesis that critiques the thesis. Combine the thesis and antithesis into a more complete and accurate response that is more fit-for-purpose against the original user prompt. Preserve all critical details."*
        *   **Example 2 (`synthesis_step2_combine`):** *"As an expert editor, your task is to analyze the following user prompt and a set of preliminary syntheses. Combine these documents into a single, unified synthesis that is maximally fit-for-purpose against the original user prompt. You must eliminate redundancy and conflicting information while ensuring every unique and critical detail is preserved."*
*   `[ ]` 27.b. **Enhance Stage Recipe Schema:**
    *   `[DB]` **Action:** In a new migration, update the schema definition for the `input_artifact_rules` JSONB object. Each object within the `steps` array must now include a `prompt_template_name` field (e.g., `"prompt_template_name": "synthesis_step1_pairwise"`).
*   `[ ]` 27.c. **Populate `synthesis` Recipe in DB:**
    *   `[DB]` **Action:** In the seed file, update the `synthesis` stage's `input_artifact_rules` to include the correct `prompt_template_name` for each of its three steps.
*   `[ ]` 27.d. **[BE] [REFACTOR] Update Job Enqueuer for Recipe Awareness:**
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

#### 28. [BE] Implement Core Granularity Strategy Functions

*   `[ ]` 28.a. **Create Granularity Strategy Module:**
    *   `[BE]` **Action:** Create a new file: `supabase/functions/dialectic-worker/strategies/granularity.strategies.ts`.
    *   `[BE]` **Action:** In this file, create a strategy registry map to associate the string from the recipe with a function.
    *   **Implementation Detail:**
        ```typescript
        // In granularity.strategies.ts
        import { planPairwiseByOrigin, planPerSourceDocument, planAllToOne } from './planners';

        export const granularityStrategyMap = {
          'per_source_document': planPerSourceDocument,
          'pairwise_by_origin': planPairwiseByOrigin,
          'per_source_group': planPerSourceGroup, // To be implemented
          'all_to_one': planAllToOne,
        };

        export function getGranularityPlanner(strategyId: string) {
            return granularityStrategyMap[strategyId] || planPerSourceDocument; // Default strategy
        }
        ```
*   `[ ]` 28.b. **Implement Initial Set of Planner Functions:**
    *   `[BE]` `[TEST-UNIT]` **Action:** Create the planner functions (e.g., `planPairwiseByOrigin`) and their corresponding unit tests. These functions will contain the core logic for looping through source documents and generating the array of child job payloads.
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

#### 29. [BE] [REFACTOR] Enhance Planner for Multi-Step Recipe Execution

*   `[ ]` 29.a. **Refactor `processComplexJob`:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/processComplexJob.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** When a job is processed, it must now read `job.payload.step_info.current_step`. This value will determine which step from the stage's `input_artifact_rules` recipe to execute.
*   `[ ]` 29.b. **Refactor `task_isolator.ts` (`planComplexStage`):**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-worker/task_isolator.ts`.
    *   `[BE]` `[REFACTOR]` **Action:** The planner must be enhanced to read the recipe for the `current_step`. It will use the `inputs_required` to query for source documents and the `granularity_strategy` to select the correct planner function.
*   `[ ]` 29.c. **Ensure Original Prompt is Always Included:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/_shared/prompt-assembler.ts` (or equivalent data-gathering utility).
    *   `[BE]` **Action:** The utility responsible for gathering context for a prompt (`gatherContext`) must be updated. For any job whose `stageSlug` is `'antithesis'` or `'synthesis'`, it is **mandatory** to fetch the project's original user prompt text.
    *   `[BE]` **Action:** This original prompt text must be passed to the `prompt-renderer` as a distinct, top-level variable (e.g., `original_user_request`), ensuring it's available to be injected into any step's prompt template.
*   `[ ]` 29.d. **Tag Intermediate Artifacts:**
    *   `[BE]` **File:** `supabase/functions/dialectic-worker/processSimpleJob.ts` (or where artifacts are saved).
    *   `[BE]` **Action:** When saving the output of a recipe step, the worker must use the `output_type` value from the recipe (e.g., `'pairwise_synthesis_chunk'`) to tag the artifact in the `dialectic_project_resources` table.
    *   **Implementation Detail:**
        ```typescript
        // Inside the worker, when saving a file:
        await fileManager.uploadAndRegisterFile({
            // ... other context
            resourceTypeForDb: parentJob.payload.recipe_step.output_type, // The recipe step should be in the payload
            description: `Intermediate artifact for ${parentJob.id}, step ${parentJob.payload.step_info.current_step}`,
        });
        ```
*   `[ ]` 29.e. **Update Parent Job Orchestration Logic:**
    *   `[DB]` **File:** The `handle_job_completion()` PostgreSQL function.
    *   `[BE]` **File:** `supabase/functions/dialectic-worker/processComplexJob.ts`.
    *   `[BE]` **Action:** When all children for a step are complete, the trigger wakes the parent job. The `processComplexJob` worker will see that the job has `status = 'pending_next_step'`.
    *   `[BE]` **Action:** The worker will then increment `payload.step_info.current_step`. If `current_step` is less than or equal to `total_steps`, it will re-call the planner for the next step. If `current_step` exceeds `total_steps`, it will mark the parent job as `'completed'`.
*   `[ ]` 29.f. **Define Multi-Step Error Handling Strategy:**
    *   `[BE]` `[REFACTOR]` **Action:** If any child job for a given step fails permanently (exhausts all retries), it must report its failure to the parent.
    *   `[BE]` **Action:** The orchestration trigger (`handle_job_completion`) should be updated to check for child failures. If a child fails, the parent job's `status` should immediately be set to `'failed'`, and `step_info.status` should also be marked `'failed'`. This prevents the process from getting stuck waiting for a job that will never complete.
    *   `[DOCS]` **Action:** Note for future enhancement: A more sophisticated strategy could allow for retrying an entire failed step from the parent job. For the initial implementation, failing the entire parent process is the safest approach.

#### 30. [TEST-INT] Create the End-to-End Synthesis Pipeline Test

*   `[ ]` 30.a. **Create New Integration Test File:**
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

