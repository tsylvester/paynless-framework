// supabase/functions/dialectic-worker/task_isolator.test.ts
import {
    describe,
    it,
} from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import { spy } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import {
    assert,
    assertEquals,
    assertRejects,
    assertExists,
} from 'jsr:@std/assert@0.225.3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    DialecticExecuteJobPayload,
    GranularityPlannerFn,
    SourceDocument,
} from '../../dialectic-service/dialectic.interface.ts';
import { planComplexStage } from './task_isolator.ts';
import { createPlanJobContext } from '../createJobContext/createJobContext.ts';
import { createMockRootContext } from '../createJobContext/JobContext.mock.ts';
import {
    isDialecticExecuteJobPayload,
    isJson,
} from '../../_shared/utils/type_guards.ts';
import { isDialecticStageRecipeStep } from '../../_shared/utils/type-guards/type_guards.dialectic.recipe.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { buildDialecticJobRow, buildDialecticPlanJobPayload, buildDialecticStageRecipeStep, buildSourceDocument, buildDialecticExecuteJobPayload, buildInputRule, invalidateDialecticExecuteJobPayload } from '../../_shared/dialectic.mock.ts';
import type { DialecticExecuteJobPayloadCorruptions } from '../../_shared/dialectic.mock.ts';

describe('planComplexStage', () => {
    describe('Handling of Step Properties', () => {
        it('should throw an error if called with a step that is marked as is_skipped', async () => {
            // Purpose: Proves that the function rejects work that the orchestrator (processComplexJob)
            // should have filtered out. This enforces the separation of concerns, as skipping steps
            // is an orchestration decision, not a planning decision.
    
            // Arrange:
            // 1. Create a mock recipe step based on mockRecipeStep.
            // 2. Set the 'is_skipped' property to true.
            const recipeStep = buildDialecticStageRecipeStep({ is_skipped: true });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            const payload = buildDialecticPlanJobPayload();
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...buildDialecticJobRow({ job_type: 'PLAN' }),
                payload,
            };

            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext();
            const ctx = createPlanJobContext(rootCtx);
    
            // Act & Assert:
            // 1. Use assertRejects to call planComplexStage with the skipped step.
            // 2. Assert that it throws an error. The current implementation lacks this check,
            //    so this test is expected to fail, highlighting the missing validation.
            await assertRejects(
                () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, parentJob, ctx, recipeStep, 'test-auth-token'),
                Error,
                'planComplexStage cannot process this type of recipe step. This indicates an orchestration logic error.',
            );
        });
    
        it('should correctly process a step that includes a parallel_group identifier', async () => {
            // Purpose: A sanity check to ensure that the presence of parallel-flow metadata on a step
            // object does not cause errors. The function should process the step's inputs and planner normally.
    
            // Arrange:
            // 1. Create a mock recipe step and set 'parallel_group' to an integer.
            const recipeStep = buildDialecticStageRecipeStep({ parallel_group: 1, prompt_template_id: 'test-prompt-template-id' });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            const payload = buildDialecticPlanJobPayload();
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...buildDialecticJobRow({ job_type: 'PLAN' }),
                payload,
            };

            const sourceDoc = buildSourceDocument();
            const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

            const plannerCalls: { recipeStep: DialecticRecipeStep }[] = [];
            const planner: GranularityPlannerFn = (_docs, _parent, step, _token) => {
                plannerCalls.push({ recipeStep: step });
                return [buildDialecticExecuteJobPayload()];
            };

            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext({ findSourceDocuments, getGranularityPlanner: () => planner });
            const ctx = createPlanJobContext(rootCtx);

            // 2. Set up a spy on a mock granularity planner function.
            // Act:
            // 1. Call planComplexStage with the parallel step.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, parentJob, ctx, recipeStep, 'test-auth-token');
    
            // Assert:
            // 1. Verify the planner spy was called, confirming the function proceeded normally.
            assertEquals(plannerCalls.length, 1, 'planner was not called — function may have short-circuited at the empty-documents early exit');
            assertExists(plannerCalls[0]);
            assertEquals(plannerCalls[0].recipeStep.parallel_group, 1, 'parallel_group was not passed through to the planner intact');
        });
    
        it('should correctly process a step that includes a branch_key', async () => {
            // Purpose: Verifies that a step with a branch key (e.g., 'business_case_branch') is
            // handled correctly. The branch_key itself is primarily for the planner's use, so this
            // test ensures the step object is passed through without issues.
    
            // Arrange:
            // 1. Create a mock recipe step and set 'branch_key' to a string.
            const recipeStep = buildDialecticStageRecipeStep({ branch_key: 'business_case_branch', prompt_template_id: 'test-prompt-template-id' });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            const payload = buildDialecticPlanJobPayload();
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...buildDialecticJobRow({ job_type: 'PLAN' }),
                payload,
            };

            const sourceDoc = buildSourceDocument();
            const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

            const plannerCalls: { recipeStep: DialecticRecipeStep }[] = [];
            const planner: GranularityPlannerFn = (_docs, _parent, step, _token) => {
                plannerCalls.push({ recipeStep: step });
                return [buildDialecticExecuteJobPayload()];
            };

            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext({ findSourceDocuments, getGranularityPlanner: () => planner });
            const ctx = createPlanJobContext(rootCtx);

            // 2. Set up a spy on a mock granularity planner function.
            // Act:
            // 1. Call planComplexStage with the step containing the branch_key.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, parentJob, ctx, recipeStep, 'test-auth-token');
    
            // Assert:
            // 1. Verify the planner spy was called.
            // 2. Assert that the 'recipeStep' argument passed to the planner contains the correct 'branch_key'.
            assertEquals(plannerCalls.length, 1, 'planner was not called — function may have short-circuited at the empty-documents early exit');
            assertExists(plannerCalls[0]);
            assertEquals(plannerCalls[0].recipeStep.branch_key, 'business_case_branch', 'branch_key was not passed through to the planner intact');
        });
    
        it('should pass the config_override from a cloned step to the granularity planner', async () => {
            // Purpose: This is a critical test. It must spy on the getGranularityPlanner's returned function
            // and assert that the recipeStep object it receives contains the exact config_override JSON. This
            // proves that user-defined modifications from a cloned recipe are correctly passed down to the
            // logic that generates the final EXECUTE jobs.
    
            // Arrange:
            // 1. Define a mock 'config_override' JSON object.
            const configOverride = { temperature: 0.7, max_tokens: 2048, custom_instruction: 'focus on financials' };

            // 2. Create a mock recipe step and set its 'config_override' property.
            const recipeStep = buildDialecticStageRecipeStep({ config_override: configOverride, prompt_template_id: 'test-prompt-template-id' });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            const payload = buildDialecticPlanJobPayload();
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...buildDialecticJobRow({ job_type: 'PLAN' }),
                payload,
            };

            const sourceDoc = buildSourceDocument();
            const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

            const plannerCalls: { recipeStep: DialecticRecipeStep }[] = [];
            const planner: GranularityPlannerFn = (_docs, _parent, step, _token) => {
                plannerCalls.push({ recipeStep: step });
                return [buildDialecticExecuteJobPayload()];
            };

            // 3. Create a spy for the planner function.
            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext({ findSourceDocuments, getGranularityPlanner: () => planner });
            const ctx = createPlanJobContext(rootCtx);
    
            // Act:
            // 1. Call planComplexStage with the overridden step.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, parentJob, ctx, recipeStep, 'test-auth-token');
    
            // Assert:
            // 1. Verify the planner spy was called exactly once.
            // 2. Inspect the recipeStep argument passed to the planner and assert it contains the override.
            assertEquals(plannerCalls.length, 1, 'planner was not called exactly once');
            assertExists(plannerCalls[0]);
            const receivedStep = plannerCalls[0].recipeStep;
            assert(isDialecticStageRecipeStep(receivedStep), 'recipeStep passed to the planner was not a DialecticStageRecipeStep');
            assertEquals(receivedStep.config_override, configOverride, 'config_override was not passed through to the planner intact');
        });

        it('should fetch only the specific document required by a parallel branch using a document_key rule', async () => {
            // Purpose: Simulates a fork in the recipe graph. This test ensures that when planning for a step
            // in one branch, it correctly fetches only the input designated for that branch
            // via a specific document_key in its inputs_required rule.
            // Uses the actual synthesis_document_business_case recipe step structure from the database.
            //
            // This test verifies that when multiple documents match an input rule:
            // 1. Documents are filtered by matching source_group (lineage) first
            // 2. Then the most recent document (by created_at) is selected from the matching lineage
            // This ensures we select from the correct document lineage, not just any matching document.

            // Arrange:
            // 1. Update parent job to be in synthesis stage to match the recipe step.

            // 2. Define a source_group UUID to represent a specific document lineage.
            // This simulates documents that belong to the same lineage branch.
            const targetLineageSourceGroup = 'target-lineage-uuid';
            const otherLineageSourceGroup = 'other-lineage-uuid';

            // 3. Seed project_resources with three rendered_document files from synthesis stage.
            // findSourceDocuments for type 'document' queries dialectic_project_resources for rendered_document.
            // Use constructStoragePath to generate valid file paths that match the application's actual behavior.
            //    - Two documents from the target lineage (one older, one newer - we want the newer)
            //    - One document from a different lineage (should be filtered out)

            // Generate paths for rendered_document files using constructStoragePath

            // Create corresponding contributions that these rendered documents are linked to

            // Also create the corresponding contributions so document_relationships can be fetched
            const docOlderTarget = buildSourceDocument({
                id: 'doc-older-target',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z',
                document_relationships: { source_group: targetLineageSourceGroup },
            });
            const docNewerTarget = buildSourceDocument({
                id: 'doc-newer-target',
                created_at: '2025-01-02T00:00:00.000Z',
                updated_at: '2025-01-02T00:00:00.000Z',
                document_relationships: { source_group: targetLineageSourceGroup },
            });
            const docOtherLineage = buildSourceDocument({
                id: 'doc-other-lineage',
                created_at: '2025-01-03T00:00:00.000Z',
                updated_at: '2025-01-03T00:00:00.000Z',
                document_relationships: { source_group: otherLineageSourceGroup },
            });

            const findSourceDocuments = async (): Promise<SourceDocument[]> => [
                docOlderTarget,
                docNewerTarget,
                docOtherLineage,
            ];

            // 4. Set up parent job with document_relationships.source_group to filter by lineage.
            // This simulates a parent job that is part of a specific lineage branch.
            const payload = buildDialecticPlanJobPayload({
                document_relationships: { source_group: targetLineageSourceGroup },
            });
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...buildDialecticJobRow({ job_type: 'PLAN' }),
                payload,
            };

            // 5. Use the actual synthesis_document_business_case recipe step structure from migrations.
            // This step is in parallel_group 3 with branch_key 'synthesis_document_business_case'.
            const recipeStep = buildDialecticStageRecipeStep({
                parallel_group: 3,
                branch_key: 'synthesis_document_business_case',
                prompt_template_id: 'test-prompt-template-id',
                inputs_required: [buildInputRule({ type: 'document', slug: 'synthesis', document_key: FileType.business_case })],
            });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            // 6. Set up a planner spy to capture the source documents it receives.
            const plannerCalls: { sourceDocs: SourceDocument[] }[] = [];
            const planner: GranularityPlannerFn = (docs, _parent, _step, _token) => {
                plannerCalls.push({ sourceDocs: docs });
                return [buildDialecticExecuteJobPayload()];
            };

            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext({ findSourceDocuments, getGranularityPlanner: () => planner });
            const ctx = createPlanJobContext(rootCtx);

            // Act:
            // 1. Call planComplexStage.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, parentJob, ctx, recipeStep, 'test-auth-token');

            // Assert:
            // 1. The planner should have received exactly one document.
            //    The function should filter by source_group first (matching targetLineageSourceGroup),
            //    then select the most recent document from that lineage.
            // 2. The received document must be from the target lineage and be the most recent one.
            assertEquals(plannerCalls.length, 1, 'planner was not called');
            const receivedDocs = plannerCalls[0].sourceDocs;
            assertEquals(receivedDocs.length, 1, 'planner should have received exactly one document after source_group filtering');
            assertEquals(receivedDocs[0].id, 'doc-newer-target', 'the received document must be the most recent one from the target lineage');
        });
    });
    
    describe('Child Job Creation and Data Integrity', () => {
        it('should create child jobs that correctly inherit core identifiers from the parent PLAN job', async () => {
            // Purpose: Confirms that projectId, sessionId, iterationNumber, and user_jwt from the parent job
            // are correctly propagated to all child EXECUTE jobs, ensuring traceability and context.
            // Uses distinct, recognizable values for every inherited field so the assertions prove
            // inheritance rather than coincidence with builder defaults.

            // Arrange:
            // 1. Build the parent job row with distinct values for every field that is copied to the child row.
            const parentJobRow = buildDialecticJobRow({
                id: 'parent-job-id-A',
                session_id: 'parent-session-id-A',
                user_id: 'parent-user-id-A',
                iteration_number: 7,
                stage_slug: 'parent-stage-A',
                max_retries: 5,
                is_test_job: true,
                job_type: 'PLAN',
            });

            // 2. Build the parent payload with matching stageSlug and distinct context values.
            //    The row/payload stageSlug consistency check (task_isolator.ts lines 64-71) requires
            //    payload.stageSlug to match row.stage_slug when row.stage_slug is a string.
            const payload = buildDialecticPlanJobPayload({
                stageSlug: 'parent-stage-A',
                projectId: 'parent-project-A',
                sessionId: 'parent-session-id-A',
                iterationNumber: 7,
                walletId: 'parent-wallet-A',
                user_jwt: 'parent-jwt-A',
            });
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...parentJobRow,
                payload,
            };

            // 3. Build a recipe step that passes all upfront validations.
            //    prompt_template_id must be overridden (builder default is null).
            const recipeStep = buildDialecticStageRecipeStep({ prompt_template_id: 'test-prompt-template-id' });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            // 4. Mock findSourceDocuments to return a non-empty array so the function does not
            //    early-exit at the empty-documents check (task_isolator.ts lines 81-84).
            const sourceDoc = buildSourceDocument();
            const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

            // 5. Build a planner that returns a single execute payload whose context fields match
            //    the parent payload, so the context-mismatch check (lines 197-209) passes and the
            //    child job is created. user_jwt is carried from the parent payload by the planner.
            const planner: GranularityPlannerFn = () => [
                buildDialecticExecuteJobPayload({
                    projectId: 'parent-project-A',
                    sessionId: 'parent-session-id-A',
                    stageSlug: 'parent-stage-A',
                    iterationNumber: 7,
                    walletId: 'parent-wallet-A',
                    user_jwt: 'parent-jwt-A',
                }),
            ];

            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext({ findSourceDocuments, getGranularityPlanner: () => planner });
            const ctx = createPlanJobContext(rootCtx);

            // Act:
            // 1. Call planComplexStage.
            const childJobs = await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                parentJob,
                ctx,
                recipeStep,
                'test-auth-token',
            );

            // Assert:
            // 1. Exactly one child job was created.
            assertEquals(childJobs.length, 1, 'expected exactly one child job');
            const childJob = childJobs[0];

            // 2. Assert row-level properties are inherited from the parent job row.
            assertEquals(childJob.parent_job_id, 'parent-job-id-A', 'parent_job_id was not inherited from the parent row');
            assertEquals(childJob.session_id, 'parent-session-id-A', 'session_id was not inherited from the parent row');
            assertEquals(childJob.user_id, 'parent-user-id-A', 'user_id was not inherited from the parent row');
            assertEquals(childJob.iteration_number, 7, 'iteration_number was not inherited from the parent row');
            assertEquals(childJob.stage_slug, 'parent-stage-A', 'stage_slug was not inherited from the parent payload stageSlug');
            assertEquals(childJob.max_retries, 5, 'max_retries was not inherited from the parent row');
            assertEquals(childJob.is_test_job, true, 'is_test_job was not inherited from the parent row');

            // 3. Assert payload-level properties are inherited from the parent payload.
            const childPayload = childJob.payload;
            assert(isDialecticExecuteJobPayload(childPayload), 'child payload should be a valid DialecticExecuteJobPayload');
            assertEquals(childPayload.projectId, 'parent-project-A', 'payload.projectId was not inherited from the parent payload');
            assertEquals(childPayload.sessionId, 'parent-session-id-A', 'payload.sessionId was not inherited from the parent payload');
            assertEquals(childPayload.stageSlug, 'parent-stage-A', 'payload.stageSlug was not inherited from the parent payload');
            assertEquals(childPayload.iterationNumber, 7, 'payload.iterationNumber was not inherited from the parent payload');
            assertEquals(childPayload.walletId, 'parent-wallet-A', 'payload.walletId was not inherited from the parent payload');
            assertEquals(childPayload.user_jwt, 'parent-jwt-A', 'payload.user_jwt was not inherited from the parent payload');
        });
    
        it("should throw when a planner returns a payload polluted with orchestrator-level context like 'step_info'", async () => {
            // Purpose: Enforces the architectural boundary that a malformed payload from a planner
            // (containing extra properties) is surfaced as an error. Per errors-and-returns.md:
            // "Errors are never swallowed, never stored, never converted, coerced, or modified."
            // A planner producing an invalid payload is a planner bug — the function throws so the
            // developer is forced to fix it, not warn-and-continue so the system limps along with
            // missing jobs and no visible failure.

            // Arrange:
            // 1. Build the parent job row and payload with valid context so the payload is not
            //    rejected for context mismatch — the rejection must be proven on SHAPE, not context.
            const parentJobRow = buildDialecticJobRow({
                id: 'parent-job-id-B',
                session_id: 'parent-session-id-B',
                user_id: 'parent-user-id-B',
                iteration_number: 3,
                stage_slug: 'parent-stage-B',
                max_retries: 5,
                is_test_job: false,
                job_type: 'PLAN',
            });

            const payload = buildDialecticPlanJobPayload({
                stageSlug: 'parent-stage-B',
                projectId: 'parent-project-B',
                sessionId: 'parent-session-id-B',
                iterationNumber: 3,
                walletId: 'parent-wallet-B',
                user_jwt: 'parent-jwt-B',
            });
            if (!isJson(payload)) {
                throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
            }
            const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
                ...parentJobRow,
                payload,
            };

            // 2. Build a recipe step that passes all upfront validations.
            const recipeStep = buildDialecticStageRecipeStep({ prompt_template_id: 'test-prompt-template-id' });
            if (recipeStep === null) {
                throw new Error('buildDialecticStageRecipeStep returned null');
            }

            // 3. Mock findSourceDocuments to return a non-empty array so the function does not
            //    early-exit at the empty-documents check.
            const sourceDoc = buildSourceDocument();
            const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

            // 4. Produce an invalid execute payload polluted with step_info — an orchestrator-level
            //    property that must not appear on a child job payload. The invalidator returns
            //    unknown (the honest type for untrusted runtime data); the cast to
            //    DialecticExecuteJobPayload is the permitted test-only exception proving invalid
            //    objects are rejected even when claimed valid.
            const pollutedPayload = invalidateDialecticExecuteJobPayload({
                step_info: { recipe_step_id: 'orchestrator-step-id' },
                projectId: 'parent-project-B',
                sessionId: 'parent-session-id-B',
                stageSlug: 'parent-stage-B',
                iterationNumber: 3,
                walletId: 'parent-wallet-B',
                user_jwt: 'parent-jwt-B',
            } as DialecticExecuteJobPayloadCorruptions) as DialecticExecuteJobPayload;

            const planner: GranularityPlannerFn = () => [pollutedPayload];

            const mockSupabase = createMockSupabaseClient();
            const rootCtx = createMockRootContext({ findSourceDocuments, getGranularityPlanner: () => planner });
            const ctx = createPlanJobContext(rootCtx);

            // Act & Assert:
            // 1. The function must throw when it encounters a malformed payload from a planner.
            //    The throw surfaces the error so it can be fixed, per errors-and-returns.md.
            //    The error message comes from the execute guard (isDialecticExecuteJobPayload),
            //    proving the payload was explicitly routed to execute validation by its
            //    discriminating fields and the guard's throw propagated — not swallowed.
            await assertRejects(
                async () => {
                    await planComplexStage(
                        mockSupabase.client as unknown as SupabaseClient<Database>,
                        parentJob,
                        ctx,
                        recipeStep,
                        'test-auth-token',
                    );
                },
                Error,
                'unknown properties',
                'planComplexStage must surface the execute guard error for a polluted payload, not swallow it',
            );
        });
    });
}); 



