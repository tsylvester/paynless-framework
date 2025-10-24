import {
    assertEquals,
    assert,
    assertThrows,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import type { Tables, Json, Database } from "../../../types_db.ts";
import { 
    hasProcessingStrategy, 
    isCitationsArray,
    isDialecticContribution,
    isDialecticJobPayload,
    isDialecticJobRow,
    isDialecticJobRowArray,
    isFailedAttemptError,
    isFailedAttemptErrorArray,
    isJobResultsWithModelProcessing,
    isModelProcessingResult,
    validatePayload,
    hasStepsRecipe,
    isDialecticStageRecipe,
    isDialecticPlanJobPayload,
    isDialecticExecuteJobPayload,
    isContinuablePayload,
    isContributionType,
    isDialecticChunkMetadata,
    isDocumentRelationships,
    hasModelResultWithContributionId,
    isJobInsert,
    isPlanJobInsert,
    isHeaderContext,
    isDialecticContinueReason
} from './type_guards.dialectic.ts';
import { 
    BranchKey, 
    OutputType, 
    DialecticContributionRow, 
    DialecticJobRow, 
    FailedAttemptError,
    StageWithRecipeSteps,
    DialecticRecipeStep,
    JobType,
    DialecticExecuteJobPayload,
} from '../../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../../types/file_manager.types.ts';
import { ContinueReason, FinishReason } from '../../types.ts';

Deno.test('Type Guard: hasModelResultWithContributionId', async (t) => {
    await t.step('should return true for a valid object', () => {
        const results = {
            modelProcessingResult: {
                contributionId: 'some-uuid-string'
            }
        };
        assert(hasModelResultWithContributionId(results));
    });

    await t.step('should return false if modelProcessingResult is missing', () => {
        const results = {
            someOtherProperty: {
                contributionId: 'some-uuid-string'
            }
        };
        assert(!hasModelResultWithContributionId(results));
    });

    await t.step('should return false if modelProcessingResult is not an object', () => {
        const results = {
            modelProcessingResult: 'a-string'
        };
        assert(!hasModelResultWithContributionId(results));
    });

    await t.step('should return false if contributionId is missing', () => {
        const results = {
            modelProcessingResult: {
                someOtherKey: 'some-value'
            }
        };
        assert(!hasModelResultWithContributionId(results));
    });

    await t.step('should return false if contributionId is not a string', () => {
        const results = {
            modelProcessingResult: {
                contributionId: 12345
            }
        };
        assert(!hasModelResultWithContributionId(results));
    });

    await t.step('should return false for null or non-object input', () => {
        assert(!hasModelResultWithContributionId(null));
        assert(!hasModelResultWithContributionId('a string'));
        assert(!hasModelResultWithContributionId(123));
        assert(!hasModelResultWithContributionId([]));
    });
});

Deno.test('Type Guard: hasProcessingStrategy', async (t) => {
    await t.step('should return true for a stage whose recipe step has a valid job_type', () => {
        const stage: StageWithRecipeSteps = {
            id: 'stage-1',
            created_at: new Date().toISOString(),
            slug: 'stage-slug',
            display_name: 'Stage Name',
            recipe_template_id: 'template-1',
            active_recipe_instance_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
            steps: [{
                id: 'step-1',
                template_id: 'template-1',
                job_type: 'PLAN',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                step_number: 1,
                step_key: 'key',
                step_slug: 'slug',
                step_name: 'name',
                output_type: FileType.system_architecture_overview,
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [],
                branch_key: null,
                parallel_group: null,
                prompt_template_id: null,
                step_description: null,
                prompt_type: 'Turn',
            }],
        };
        assert(hasProcessingStrategy(stage.steps[0]));
    });

    await t.step('should return false if the recipe step has an invalid job_type', () => {
        const stage: StageWithRecipeSteps = {
            id: 'stage-2',
            created_at: new Date().toISOString(),
            slug: 'stage-slug-2',
            display_name: 'Stage Name 2',
            recipe_template_id: 'template-2',
            active_recipe_instance_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
            steps: [{
                id: 'step-2',
                template_id: 'template-2',
                job_type: 'INVALID_JOB_TYPE' as JobType,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                step_number: 1,
                step_key: 'key',
                step_slug: 'slug',
                step_name: 'name',
                output_type: FileType.AssembledDocumentJson,
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: [],
                branch_key: null,
                parallel_group: null,
                prompt_template_id: null,
                step_description: null,
                prompt_type: 'Turn',
            }],
        };
        assert(!hasProcessingStrategy(stage.steps[0]));
    });

    await t.step('should return false if job_type is not a valid enum value', () => {
        const step = {
            id: 'step-invalid',
            job_type: 'INVALID_JOB_TYPE' as JobType,
        };
        assert(!hasProcessingStrategy(step as unknown as Tables<'dialectic_stages'>));
    });

    await t.step('should return false if job_type is missing', () => {
        const step = { id: 'step-no-job-type' };
        assert(!hasProcessingStrategy(step as unknown as Tables<'dialectic_stages'>));
    });

    await t.step('should return false for a non-object', () => {
        assert(!hasProcessingStrategy(null as unknown as Tables<'dialectic_stages'>));
        assert(!hasProcessingStrategy('a string' as unknown as Tables<'dialectic_stages'>));
    });

    await t.step('should return false if the recipe step is missing job_type', () => {
        const stage: Partial<StageWithRecipeSteps> = {
            id: 'stage-3',
            steps: [{ id: 'step-3' } as DialecticRecipeStep]
        };
        assert(!hasProcessingStrategy(stage as unknown as Tables<'dialectic_stages'>));
    });
});

Deno.test('Type Guard: hasStepsRecipe', async (t) => {
    await t.step('should return true for a stage with a valid recipe from a template', () => {
        const stage: StageWithRecipeSteps = {
            id: 'stage-1',
            recipe_template_id: 'template-1',
            steps: [
                {
                    id: 'step-1',
                    template_id: 'template-1', // Matches stage recipe_template_id
                    job_type: 'PLAN',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    step_number: 1,
                    step_key: 'key',
                    step_slug: 'slug',
                    step_name: 'name',
                    output_type: FileType.AssembledDocumentJson,
                    granularity_strategy: 'per_source_document',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [],
                    branch_key: null,
                    parallel_group: null,
                    prompt_template_id: null,
                    step_description: null,
                    prompt_type: 'Turn',
                }
            ],
            created_at: new Date().toISOString(),
            slug: 'stage-slug',
            display_name: 'Stage Name',
            active_recipe_instance_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
        };
        assert(hasStepsRecipe(stage));
    });

    await t.step('should return true for a stage with a valid recipe from an instance', () => {
        const stage: StageWithRecipeSteps = {
            id: 'stage-2',
            active_recipe_instance_id: 'instance-1',
            steps: [
                {
                    id: 'step-instance-1',
                    instance_id: 'instance-1', // Matches stage active_recipe_instance_id
                    job_type: 'EXECUTE',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    step_key: 'key',
                    step_slug: 'slug',
                    step_name: 'name',
                    output_type: FileType.AssembledDocumentJson,
                    granularity_strategy: 'per_source_document',
                    inputs_required: [],
                    inputs_relevance: [],
                    outputs_required: [],
                    branch_key: null,
                    parallel_group: null,
                    prompt_template_id: null,
                    config_override: {},
                    execution_order: null,
                    is_skipped: false,
                    object_filter: {},
                    output_overrides: {},
                    template_step_id: null,
                    prompt_type: 'Turn',
                }
            ],
            created_at: new Date().toISOString(),
            slug: 'stage-slug-2',
            display_name: 'Stage Name 2',
            recipe_template_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
        };
        assert(hasStepsRecipe(stage));
    });

    await t.step('should return false if steps array is empty', () => {
        const stage: Tables<'dialectic_stages'> & { steps: DialecticRecipeStep[] } = {
            id: 'stage-3',
            recipe_template_id: 'template-3',
            steps: [],
            created_at: new Date().toISOString(),
            slug: 'stage-slug-3',
            display_name: 'Stage Name 3',
            active_recipe_instance_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
        };
        assert(!hasStepsRecipe(stage));
    });

    await t.step('should return false if steps do not match the stage template_id', () => {
        const stage: Tables<'dialectic_stages'> & { steps: { template_id: string }[] } = {
            id: 'stage-4',
            recipe_template_id: 'template-4',
            steps: [{ template_id: 'different-template' }],
            created_at: new Date().toISOString(),
            slug: 'stage-slug-4',
            display_name: 'Stage Name 4',
            active_recipe_instance_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
        };
        assert(!hasStepsRecipe(stage));
    });

    await t.step('should return false if steps do not match the stage instance_id', () => {
        const stage: Tables<'dialectic_stages'> & { steps: { instance_id: string }[] } = {
            id: 'stage-5',
            active_recipe_instance_id: 'instance-5',
            steps: [{ instance_id: 'different-instance' }],
            created_at: new Date().toISOString(),
            slug: 'stage-slug-5',
            display_name: 'Stage Name 5',
            recipe_template_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
        };
        assert(!hasStepsRecipe(stage));
    });

    await t.step('should return false if steps property is missing', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: 'stage-6',
            created_at: new Date().toISOString(),
            slug: 'stage-slug-6',
            display_name: 'Stage Name 6',
            recipe_template_id: null,
            active_recipe_instance_id: null,
            default_system_prompt_id: null,
            description: null,
            expected_output_template_ids: [],
        };
        assert(!hasStepsRecipe(stage));
    });

    await t.step('should return false for a non-object', () => {
        assert(!hasStepsRecipe(null as unknown as StageWithRecipeSteps));
    });
});

Deno.test('Type Guard: isCitationsArray', async (t) => {
    await t.step('should return true for a valid array of Citation objects', () => {
        const citations = [
            { text: 'Source 1', url: 'http://example.com/1' },
            { text: 'Source 2' },
        ];
        assert(isCitationsArray(citations));
    });

    await t.step('should return true for an empty array', () => {
        assert(isCitationsArray([]));
    });

    await t.step('should return false if an object is missing the text property', () => {
        const invalidCitations = [{ url: 'http://example.com/1' }];
        assert(!isCitationsArray(invalidCitations));
    });

    await t.step('should return false if text property is not a string', () => {
        const invalidCitations = [{ text: 123 }];
        assert(!isCitationsArray(invalidCitations));
    });

    await t.step('should return false if url property is present but not a string', () => {
        const invalidCitations = [{ text: 'Valid text', url: 123 }];
        assert(!isCitationsArray(invalidCitations));
    });

    await t.step('should return false if array contains non-objects', () => {
        const invalidCitations = [{ text: 'Source 1' }, null, 'string'];
        assert(!isCitationsArray(invalidCitations));
    });

    await t.step('should return false for non-array values', () => {
        assert(!isCitationsArray(null));
        assert(!isCitationsArray({ text: 'Source 1' }));
        assert(!isCitationsArray('a string'));
    });
});

Deno.test('Type Guard: isContinuablePayload', async (t) => {
    await t.step('should return true for a valid continuable payload', () => {
        const payload = {
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1',
            stageSlug: 'someslug',
            iterationNumber: 1,
            continueUntilComplete: true,
            continuation_count: 2,
            walletId: 'w1',
            maxRetries: 3
        };
        assert(isContinuablePayload(payload));
    });

    await t.step('should return true for a minimal valid continuable payload', () => {
        const payload = {
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1',
            stageSlug: 'someslug',
            iterationNumber: 1
        };
        assert(isContinuablePayload(payload));
    });

    await t.step('should return false if sessionId is missing', () => {
        const payload = {
            projectId: 'p1',
            model_id: 'm1',
            stageSlug: 'someslug',
            iterationNumber: 1
        };
        assert(!isContinuablePayload(payload));
    });

    await t.step('should return false if iterationNumber is not a number', () => {
        const payload = {
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1',
            stageSlug: 'someslug',
            iterationNumber: '1'
        };
        assert(!isContinuablePayload(payload));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isContinuablePayload(null));
        assert(!isContinuablePayload('a string'));
    });
});

Deno.test('Type Guard: isContributionType', async (t) => {
    const validTypes = [
        'thesis',
        'antithesis',
        'synthesis',
        'parenthesis',
        'paralysis',
        'pairwise_synthesis_chunk',
        'reduced_synthesis',
    ];

    for (const type of validTypes) {
        await t.step(`should return true for valid contribution type: ${type}`, () => {
            assert(isContributionType(type));
        });
    }

    await t.step('should return false for an invalid contribution type', () => {
        assert(!isContributionType('invalid_type'));
    });

    await t.step('should return false for a non-string value', () => {
        assert(!isContributionType(null as unknown as string));
        assert(!isContributionType(123 as unknown as string));
    });
});

Deno.test('Type Guard: isDialecticChunkMetadata', async (t) => {
    await t.step('should return true for a valid chunk metadata object', () => {
        const metadata = {
            source_contribution_id: 'some-id',
            another_prop: 'some-value'
        };
        assert(isDialecticChunkMetadata(metadata));
    });

    await t.step('should return false if source_contribution_id is missing', () => {
        const metadata = { another_prop: 'some-value' };
        assert(!isDialecticChunkMetadata(metadata));
    });

    await t.step('should return false if source_contribution_id is not a string', () => {
        const metadata = { source_contribution_id: 123 };
        assert(!isDialecticChunkMetadata(metadata));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isDialecticChunkMetadata(null));
        assert(!isDialecticChunkMetadata('a string'));
    });
});

Deno.test('Type Guard: isDialecticContribution', async (t) => {
    await t.step('should return true for a valid contribution object', () => {
        const contribution: DialecticContributionRow = {
            id: 'c1',
            created_at: new Date().toISOString(),
            session_id: 's1',
            stage: 'thesis',
            iteration_number: 1,
            model_id: 'm1',
            is_latest_edit: true,
            edit_version: 1,
            contribution_type: 'model_generated',
            error: null,
            citations: null,
            file_name: 'file.md',
            mime_type: 'text/markdown',
            storage_bucket: 'bucket',
            storage_path: 'path',
            target_contribution_id: null,
            user_id: 'u1',
            model_name: 'Test Model',
            processing_time_ms: 1000,
            tokens_used_input: 10,
            tokens_used_output: 20,
            original_model_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 123,
            updated_at: new Date().toISOString(),
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: 'prompt-resource-id-1'
        };
        assert(isDialecticContribution(contribution));
    });

    await t.step('should return true for a contribution with valid document_relationships', () => {
        const contribution: DialecticContributionRow = {
            id: 'c-with-rels',
            created_at: new Date().toISOString(),
            session_id: 's1',
            stage: 'synthesis',
            iteration_number: 1,
            model_id: 'm1',
            is_latest_edit: true,
            edit_version: 1,
            contribution_type: 'model_generated',
            error: null,
            citations: null,
            file_name: 'file.md',
            mime_type: 'text/markdown',
            storage_bucket: 'bucket',
            storage_path: 'path',
            target_contribution_id: null,
            user_id: 'u1',
            model_name: 'Test Model',
            processing_time_ms: 1000,
            tokens_used_input: 10,
            tokens_used_output: 20,
            original_model_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 123,
            updated_at: new Date().toISOString(),
            document_relationships: { thesis: 'thesis-id-123' },
            is_header: false,
            source_prompt_resource_id: 'prompt-resource-id-1'
        };
        assert(isDialecticContribution(contribution));
    });

    await t.step('should return true for a contribution with a null model_id', () => {
        const contribution: DialecticContributionRow = {
            id: 'c2',
            created_at: new Date().toISOString(),
            session_id: 's2',
            stage: 'feedback',
            iteration_number: 1,
            model_id: null,
            is_latest_edit: true,
            edit_version: 1,
            contribution_type: 'user_feedback',
            error: null,
            citations: null,
            file_name: 'feedback.md',
            mime_type: 'text/markdown',
            storage_bucket: 'bucket',
            storage_path: 'path',
            target_contribution_id: null,
            user_id: 'u2',
            model_name: null,
            processing_time_ms: null,
            tokens_used_input: null,
            tokens_used_output: null,
            original_model_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 456,
            updated_at: new Date().toISOString(),
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null
        };
        assert(isDialecticContribution(contribution));
    });

    await t.step('should return false for an object missing a required field (is_header)', () => {
        const invalidContribution = {
            id: 'c3',
            created_at: new Date().toISOString(),
            session_id: 's1',
            stage: 'thesis',
            iteration_number: 1,
            model_id: 'm1',
            source_prompt_resource_id: 'prompt-resource-id-1'
        };
        assert(!isDialecticContribution(invalidContribution));
    });

    await t.step('should return false for an object with incorrect type (iteration_number)', () => {
        const invalidContribution = {
            id: 'c4',
            created_at: new Date().toISOString(),
            session_id: 's4',
            stage: 'thesis',
            iteration_number: 'one',
            model_id: 'm1'
        };
        assert(!isDialecticContribution(invalidContribution));
    });

    await t.step('should return false for a plain object', () => {
        const obj = { foo: 'bar' };
        assert(!isDialecticContribution(obj));
    });

    await t.step('should return false for null', () => {
        assert(!isDialecticContribution(null));
    });
});

Deno.test('Type Guard: isDialecticExecuteJobPayload', async (t) => {
    const basePayload: DialecticExecuteJobPayload = {
        sessionId: 'test-session',
        projectId: 'test-project',
        model_id: 'model-123',
        walletId: 'wallet-abc',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_type: 'execute',
        output_type: FileType.AssembledDocumentJson,
        canonicalPathParams: {
            contributionType: 'thesis',
        },
        inputs: {
            seed_prompt: 'resource-id-1',
        },
        prompt_template_id: 'prompt-template-123',
    };

    await t.step('should return true for a valid payload and not throw', () => {
        assert(isDialecticExecuteJobPayload(basePayload));
    });

    // Test each optional property individually for valid cases
    await t.step('should pass with a valid optional prompt_template_name', () => {
        const p = { ...basePayload, prompt_template_name: 'test-template' };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a valid optional document_key', () => {
        const p = { ...basePayload, document_key: FileType.business_case };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a null optional document_key', () => {
        const p = { ...basePayload, document_key: null };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a valid optional branch_key', () => {
        const p = { ...basePayload, branch_key: BranchKey.business_case };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a null optional branch_key', () => {
        const p = { ...basePayload, branch_key: null };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a valid optional parallel_group', () => {
        const p = { ...basePayload, parallel_group: 1 };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a null optional parallel_group', () => {
        const p = { ...basePayload, parallel_group: null };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with valid optional planner_metadata', () => {
        const p = { ...basePayload, planner_metadata: { dependencies: ['root'] } };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with null optional planner_metadata', () => {
        const p = { ...basePayload, planner_metadata: null };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with valid optional document_relationships', () => {
        const p = { ...basePayload, document_relationships: { thesis: 'some-id' } };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with null optional document_relationships', () => {
        const p = { ...basePayload, document_relationships: null };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a valid optional isIntermediate', () => {
        const p = { ...basePayload, isIntermediate: true };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a valid optional user_jwt', () => {
        const p = { ...basePayload, user_jwt: 'some-jwt' };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a valid optional target_contribution_id', () => {
        const p = { ...basePayload, target_contribution_id: 'target-id' };
        assert(isDialecticExecuteJobPayload(p));
    });

    // Test inherited properties from DialecticBaseJobPayload
    await t.step('should throw if sessionId is missing', () => {
        const p = { ...basePayload }; delete (p as Partial<DialecticExecuteJobPayload>).sessionId;
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid sessionId.');
    });
    await t.step('should throw if projectId is missing', () => {
        const p = { ...basePayload }; delete (p as Partial<DialecticExecuteJobPayload>).projectId;
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid projectId.');
    });
    await t.step('should throw if model_id is missing', () => {
        const p = { ...basePayload }; delete (p as Partial<DialecticExecuteJobPayload>).model_id;
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid model_id.');
    });
    await t.step('should throw if walletId is missing', () => {
        const p = { ...basePayload }; delete (p as Partial<DialecticExecuteJobPayload>).walletId;
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid walletId.');
    });

    // Test required properties of DialecticExecuteJobPayload
    await t.step('should throw if job_type is not "execute"', () => {
        const p = { ...basePayload, job_type: 'plan' };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, "Invalid job_type: expected 'execute'");
    });
    await t.step('should throw if output_type is missing or invalid', () => {
        const p = { ...basePayload, output_type: 'invalid-type' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid output_type.');
    });
    await t.step('should throw if canonicalPathParams is missing or invalid', () => {
        const p = { ...basePayload, canonicalPathParams: {} as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid canonicalPathParams.');
    });
    await t.step('should throw if inputs is missing or not a record', () => {
        const p = { ...basePayload, inputs: 'invalid' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Missing or invalid inputs.');
    });

    // Test optional/nullable properties of DialecticExecuteJobPayload
    await t.step('should throw if prompt_template_name is of wrong type', () => {
        const p = { ...basePayload, prompt_template_name: 123 as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid prompt_template_name.');
    });
    await t.step('should throw if document_key is of wrong type', () => {
        const p = { ...basePayload, document_key: 123 as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid document_key.');
    });
    await t.step('should throw if branch_key is of wrong type', () => {
        const p = { ...basePayload, branch_key: 123 as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid branch_key.');
    });
    await t.step('should throw if parallel_group is of wrong type', () => {
        const p = { ...basePayload, parallel_group: 'invalid' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid parallel_group.');
    });
    await t.step('should throw if planner_metadata is of wrong type', () => {
        const p = { ...basePayload, planner_metadata: 'invalid' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid planner_metadata.');
    });
    await t.step('should throw if document_relationships is of wrong type', () => {
        const p = { ...basePayload, document_relationships: 'invalid' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid document_relationships.');
    });
    await t.step('should throw if isIntermediate is of wrong type', () => {
        const p = { ...basePayload, isIntermediate: 'invalid' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid isIntermediate flag.');
    });
    await t.step('should throw if user_jwt is of wrong type', () => {
        const p = { ...basePayload, user_jwt: 123 as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid user_jwt.');
    });
    
    // Test optional inherited properties
    await t.step('should throw if stageSlug is of wrong type', () => {
        const p = { ...basePayload, stageSlug: 123 as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid stageSlug.');
    });
    await t.step('should throw if iterationNumber is of wrong type', () => {
        const p = { ...basePayload, iterationNumber: '1' as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid iterationNumber.');
    });
    await t.step('should throw if target_contribution_id is of wrong type', () => {
        const p = { ...basePayload, target_contribution_id: 123 as any };
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid target_contribution_id.');
    });

    // Test legacy property
    await t.step('should throw for legacy originalFileName property', () => {
        const invalidPayload = { ...basePayload, originalFileName: 'legacy.txt' };
        assertThrows(
            () => isDialecticExecuteJobPayload(invalidPayload),
            Error,
            'Legacy property originalFileName is not allowed.'
        );
    });
});

Deno.test('Type Guard: isDialecticJobPayload', async (t) => {
    await t.step('should return true for a valid job payload with all required fields', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'thesis',
            iterationNumber: 1,
        };
        assert(isDialecticJobPayload(payload));
    });

    await t.step('should return true for a valid job payload with optional prompt field', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'antithesis',
            iterationNumber: 2,
            prompt: 'Custom prompt for this job',
            continueUntilComplete: true,
            maxRetries: 3,
        };
        assert(isDialecticJobPayload(payload));
    });

    await t.step('should return true for a valid job payload with all optional fields from GenerateContributionsPayload', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'synthesis',
            iterationNumber: 1,
            chatId: 'chat-123',
            walletId: 'wallet-456',
            continueUntilComplete: false,
            maxRetries: 5,
            continuation_count: 1,
            target_contribution_id: 'contrib-789',
            prompt: 'Another custom prompt',
        };
        assert(isDialecticJobPayload(payload));
    });

    await t.step('should return false when prompt field is not a string', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'thesis',
            iterationNumber: 1,
            prompt: 123, // Invalid: not a string
        };
        assert(!isDialecticJobPayload(payload));
    });

    await t.step('should return false when a required field is missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            // Missing projectId
            model_id: 'model-1',
            stageSlug: 'thesis',
            iterationNumber: 1,
            prompt: 'Valid prompt',
        };
        assert(!isDialecticJobPayload(payload));
    });

    await t.step('should return false for null', () => {
        assert(!isDialecticJobPayload(null));
    });

    await t.step('should return false for non-object types', () => {
        assert(!isDialecticJobPayload('string'));
        assert(!isDialecticJobPayload(123));
        assert(!isDialecticJobPayload(true));
    });

    await t.step('should return false for arrays', () => {
        assert(!isDialecticJobPayload(['array', 'of', 'values']));
    });

       await t.step('should return false when model_id is not a string', () => {
       const payload: Json = {
           sessionId: 'test-session',
           projectId: 'test-project',
           model_id: 123,
           prompt: 'Valid prompt',
       };
       assert(!isDialecticJobPayload(payload));
   });

    await t.step('should return true for a valid job payload with selectedModelIds', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModelIds: ['model-1', 'model-2'],
        };
        assert(isDialecticJobPayload(payload));
    });

    await t.step('should return false when selectedModelIds is not an array of strings', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModelIds: ['model-1', 123],
        };
        assert(!isDialecticJobPayload(payload));
    });

    await t.step('should return false when sessionId is missing', () => {
        const payload: Json = {
            projectId: 'test-project',
            model_id: 'model-1',
        };
        assert(!isDialecticJobPayload(payload));
    });

    await t.step('should return false when both model_id and selectedModelIds are missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
        };
        assert(!isDialecticJobPayload(payload));
    });

    await t.step('should return false when is_test_job is present', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'thesis',
            iterationNumber: 1,
            is_test_job: true,
        };
        assert(!isDialecticJobPayload(payload));
    });
});

Deno.test('Type Guard: isDialecticJobRow', async (t) => {
    await t.step('should return true for a valid job row object', () => {
        const job: DialecticJobRow = {
            id: 'j1',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: { model_id: 'm1', projectId: 'p1', sessionId: 's1' },
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };
        assert(isDialecticJobRow(job));
    });

    await t.step('should return false if a required field is missing (e.g., created_at)', () => {
        const job = {
            id: 'j-missing-created_at',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: { model_id: 'm1', projectId: 'p1', sessionId: 's1' },
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            // created_at is missing
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN' as Database["public"]["Enums"]["dialectic_job_type_enum"],
        };
        assert(!isDialecticJobRow(job));
    });

    await t.step('should return false if a required field is missing (e.g., status)', () => {
        const job = {
            id: 'j2',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {},
            is_test_job: false,
            job_type: 'PLAN',
        };
        assert(!isDialecticJobRow(job));
    });

    await t.step('should return false if job_type is missing', () => {
        const job = {
            id: 'j-missing-type',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: { model_id: 'm1', projectId: 'p1', sessionId: 's1' },
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
        };
        assert(!isDialecticJobRow(job));
    });

    await t.step('should return false if is_test_job is missing', () => {
        const job = {
            id: 'j-missing-test-flag',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: { model_id: 'm1', projectId: 'p1', sessionId: 's1' },
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            job_type: 'PLAN',
        };
        assert(!isDialecticJobRow(job));
    });

    await t.step('should return false if payload is not an object', () => {
        const job = {
            id: 'j3',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: 'a string',
            status: 'pending',
            is_test_job: true,
            job_type: 'PLAN',
        };
        assert(!isDialecticJobRow(job));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isDialecticJobRow(null));
        assert(!isDialecticJobRow('job'));
    });
});

Deno.test('Type Guard: isDialecticJobRowArray', async (t) => {
    await t.step('should return true for valid array of DialecticJobRow objects', () => {
        const jobs: DialecticJobRow[] = [
            {
                id: 'job-1',
                session_id: 'session-1',
                user_id: 'user-1',
                stage_slug: 'thesis',
                iteration_number: 1,
                payload: { sessionId: 'session-1', projectId: 'project-1', selectedModelIds: ['model-1'] },
                status: 'pending',
                attempt_count: 0,
                max_retries: 3,
                created_at: new Date().toISOString(),
                started_at: null,
                completed_at: null,
                results: null,
                error_details: null,
                parent_job_id: null,
                target_contribution_id: null,
                prerequisite_job_id: null,
                is_test_job: false,
                job_type: 'PLAN',
            },
            {
                id: 'job-2',
                session_id: 'session-2',
                user_id: 'user-2',
                stage_slug: 'antithesis',
                iteration_number: 1,
                payload: { sessionId: 'session-2', projectId: 'project-2', selectedModelIds: ['model-2'] },
                status: 'completed',
                attempt_count: 1,
                max_retries: 3,
                created_at: new Date().toISOString(),
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                results: { success: true },
                error_details: null,
                parent_job_id: 'parent-job-1',
                target_contribution_id: null,
                prerequisite_job_id: null,
                is_test_job: false,
                job_type: 'EXECUTE',
            },
        ];
        assert(isDialecticJobRowArray(jobs));
    });

    await t.step('should return true for empty array', () => {
        assert(isDialecticJobRowArray([]));
    });

    await t.step('should return true for array with single valid job', () => {
        const jobs = [{
            id: 'job-single',
            session_id: 'session-single',
            user_id: 'user-single',
            stage_slug: 'synthesis',
            iteration_number: 2,
            payload: { test: 'data' },
            status: 'processing',
            attempt_count: 0,
            max_retries: 5,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
        }];
        assert(isDialecticJobRowArray(jobs));
    });

    await t.step('should return false when array contains object missing required field (id)', () => {
        const invalidJobs = [{
            // Missing id
            session_id: 'session-1',
            user_id: 'user-1',
            stage_slug: 'thesis',
        }];
        assert(!isDialecticJobRowArray(invalidJobs));
    });

    await t.step('should return false when array contains object missing required field (session_id)', () => {
        const invalidJobs = [{
            id: 'job-1',
            // Missing session_id
            user_id: 'user-1',
            stage_slug: 'thesis',
        }];
        assert(!isDialecticJobRowArray(invalidJobs));
    });

    await t.step('should return false when array contains null', () => {
        const invalidJobs = [
            {
                id: 'job-1',
                session_id: 'session-1',
                user_id: 'user-1',
            },
            null, // Invalid: null in array
        ];
        assert(!isDialecticJobRowArray(invalidJobs));
    });

    await t.step('should return false when array contains non-object', () => {
        const invalidJobs = [
            {
                id: 'job-1',
                session_id: 'session-1',
                user_id: 'user-1',
            },
            'not an object', // Invalid: string in array
        ];
        assert(!isDialecticJobRowArray(invalidJobs));
    });

    await t.step('should return false for non-array input', () => {
        assert(!isDialecticJobRowArray('not an array'));
        assert(!isDialecticJobRowArray(123));
        assert(!isDialecticJobRowArray(null));
        assert(!isDialecticJobRowArray({}));
    });

    await t.step('should return false when array contains objects without both id and session_id', () => {
        const invalidJobs = [
            { id: 'job-1' }, // Missing session_id
            { session_id: 'session-1' }, // Missing id
        ];
        assert(!isDialecticJobRowArray(invalidJobs));
    });
});

Deno.test('Type Guard: isDialecticPlanJobPayload', async (t) => {
    await t.step('should return true for a valid plan job payload', () => {
        const payload = {
            job_type: 'PLAN',
        };
        assert(isDialecticPlanJobPayload(payload));
    });

    await t.step('should return false if job_type is the wrong case', () => {
        const payload = {
            job_type: 'plan',
        };
        assert(!isDialecticPlanJobPayload(payload));
    });

    await t.step('should return false if job_type is not PLAN', () => {
        const payload = {
            job_type: 'EXECUTE',
        };
        assert(!isDialecticPlanJobPayload(payload));
    });
    
    await t.step('should return false if job_type is missing', () => {
        const payload = {
            some_other_prop: 'value'
        };
        assert(!isDialecticPlanJobPayload(payload));
    });

    await t.step('should return false for non-object payloads', () => {
        assert(!isDialecticPlanJobPayload(null));
        assert(!isDialecticPlanJobPayload("a string"));
        assert(!isDialecticPlanJobPayload(123));
    });
});

Deno.test('Type Guard: isDialecticStageRecipe', async (t) => {
    await t.step('should return true for a valid recipe', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                {
                    step: 1,
                    name: 'Build Stage Header',
                    prompt_template_name: 'thesis_planner_header_v1',
                    granularity_strategy: 'all_to_one',
                    output_type: OutputType.HeaderContext,
                    step_slug: 'build-stage-header',
                    inputs_required: [
                        { type: 'seed_prompt', stage_slug: 'thesis', document_key: FileType.SeedPrompt }
                    ],
                    outputs_required: {
                        system_materials: {
                            stage_rationale: 'why',
                            executive_summary: 'summary',
                            input_artifacts_summary: 'inputs',
                            validation_checkpoint: ['a'],
                            quality_standards: ['b'],
                            diversity_rubric: { rule: 'value' }
                        },
                        header_context_artifact: {
                            type: 'header_context',
                            document_key: 'header_context',
                            artifact_class: 'header_context',
                            file_type: 'json'
                        },
                        context_for_documents: [
                            {
                                document_key: FileType.business_case,
                                content_to_include: { section: '' }
                            }
                        ],
                        files_to_generate: [
                            {
                                template_filename: 'thesis_planner_header.json',
                                from_document_key: FileType.HeaderContext
                            }
                        ]
                    }
                },
                {
                    step: 2,
                    name: 'Generate Business Case',
                    prompt_template_name: 'thesis_business_case_turn_v1',
                    granularity_strategy: 'one_to_one',
                    output_type: OutputType.RenderedDocument,
                    branch_key: BranchKey.business_case,
                    parallel_group: 2,
                    inputs_required: [
                        {
                            type: 'header_context',
                            document_key: FileType.HeaderContext,
                            stage_slug: 'thesis'
                        }
                    ],
                    outputs_required: {
                        documents: [
                            {
                                document_key: FileType.business_case,
                                template_filename: 'thesis_business_case.md',
                                artifact_class: 'rendered_document',
                                file_type: 'markdown',
                                content_to_include: { section: '' }
                            }
                        ],
                        files_to_generate: [
                            {
                                template_filename: 'thesis_business_case.md',
                                from_document_key: FileType.business_case
                            }
                        ]
                    }
                }
            ]
        };
        assert(isDialecticStageRecipe(recipe));
    });
    
    await t.step('should return false if processing_strategy is wrong', () => {
        const recipe = {
            processing_strategy: { type: 'wrong_type' },
            steps: []
        };
        assert(!isDialecticStageRecipe(recipe));
    });

    await t.step('should return false if inputs_required is missing document_key for context-bound types', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                {
                    step: 2,
                    name: 'Generate Business Case',
                    prompt_template_name: 'thesis_business_case_turn_v1',
                    granularity_strategy: 'one_to_one',
                    output_type: OutputType.RenderedDocument,
                    branch_key: BranchKey.business_case,
                    parallel_group: 2,
                    inputs_required: [
                        { type: 'header_context', stage_slug: 'thesis' }
                    ],
                    outputs_required: {
                        documents: [
                            {
                                document_key: FileType.business_case,
                                template_filename: 'thesis_business_case.md',
                                artifact_class: 'rendered_document',
                                file_type: 'markdown',
                                content_to_include: { section: '' }
                            }
                        ],
                        files_to_generate: [
                            {
                                template_filename: 'thesis_business_case.md',
                                from_document_key: FileType.business_case
                            }
                        ]
                    }
                }
            ]
        };
        assert(!isDialecticStageRecipe(recipe));
    });

    await t.step('should return false if outputs_required.files_to_generate is malformed', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                {
                    step: 2,
                    name: 'Generate Business Case',
                    prompt_template_name: 'thesis_business_case_turn_v1',
                    granularity_strategy: 'one_to_one',
                    output_type: OutputType.RenderedDocument,
                    branch_key: BranchKey.business_case,
                    parallel_group: 2,
                    inputs_required: [
                        {
                            type: 'header_context',
                            document_key: FileType.HeaderContext,
                            stage_slug: 'thesis'
                        }
                    ],
                    outputs_required: {
                        documents: [
                            {
                                document_key: FileType.business_case,
                                template_filename: 'thesis_business_case.md',
                                artifact_class: 'rendered_document',
                                file_type: 'markdown',
                                content_to_include: { section: '' }
                            }
                        ],
                        files_to_generate: [
                            {
                                template_filename: 'thesis_business_case.md'
                            }
                        ]
                    }
                }
            ]
        };
        assert(!isDialecticStageRecipe(recipe));
    });

    await t.step('should return false if branch metadata is invalid', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                {
                    step: 2,
                    name: 'Generate Business Case',
                    prompt_template_name: 'thesis_business_case_turn_v1',
                    granularity_strategy: 'one_to_one',
                    output_type: OutputType.RenderedDocument,
                    branch_key: 'unknown-branch',
                    parallel_group: 'two',
                    inputs_required: [
                        {
                            type: 'header_context',
                            document_key: FileType.HeaderContext,
                            stage_slug: 'thesis'
                        }
                    ],
                    outputs_required: {
                        documents: [
                            {
                                document_key: FileType.business_case,
                                template_filename: 'thesis_business_case.md',
                                artifact_class: 'rendered_document',
                                file_type: 'markdown',
                                content_to_include: { section: '' }
                            }
                        ],
                        files_to_generate: [
                            {
                                template_filename: 'thesis_business_case.md',
                                from_document_key: FileType.business_case
                            }
                        ]
                    }
                }
            ]
        };
        assert(!isDialecticStageRecipe(recipe));
    });
});

Deno.test('Type Guard: isDocumentRelationships', async (t) => {
    await t.step('should return true for a valid DocumentRelationships object', () => {
        const validObj = {
            thesis: 'thesis-id',
            antithesis: 'antithesis-id',
            source_group: 'group-a',
        };
        assert(isDocumentRelationships(validObj));
    });

    await t.step('should return true for an object with null values', () => {
        const validObj = {
            thesis: 'thesis-id',
            antithesis: null,
        };
        assert(isDocumentRelationships(validObj));
    });

    await t.step('should return true for an empty object', () => {
        assert(isDocumentRelationships({}));
    });

    await t.step('should return false for an object with non-string/non-null values', () => {
        const invalidObj = {
            thesis: 'thesis-id',
            count: 123,
        };
        assert(!isDocumentRelationships(invalidObj));
    });

    await t.step('should return false for non-record types', () => {
        assert(!isDocumentRelationships('a string'));
        assert(!isDocumentRelationships(123));
        assert(!isDocumentRelationships([]));
    });

    await t.step('should return false for null', () => {
        assert(!isDocumentRelationships(null), "Type guard should correctly identify null as not being a DocumentRelationships object.");
    });
});

Deno.test('Type Guard: isFailedAttemptError', async (t) => {
    await t.step('should return true for a valid FailedAttemptError object', () => {
        const validError: FailedAttemptError = {
            error: 'Something went wrong',
            modelId: 'model-123',
            api_identifier: 'api-xyz',
        };
        assert(isFailedAttemptError(validError));
    });

    await t.step('should return false if error property is missing', () => {
        const invalidError = {
            modelId: 'model-123',
            api_identifier: 'api-xyz',
        };
        assert(!isFailedAttemptError(invalidError));
    });
    
    await t.step('should return false if modelId property is missing', () => {
        const invalidError = {
            error: 'Something went wrong',
            api_identifier: 'api-xyz',
        };
        assert(!isFailedAttemptError(invalidError));
    });

    await t.step('should return false if api_identifier property is missing', () => {
        const invalidError = {
            error: 'Something went wrong',
            modelId: 'model-123',
        };
        assert(!isFailedAttemptError(invalidError));
    });

    await t.step('should return false if a property has the wrong type', () => {
        const invalidError = {
            error: 'Something went wrong',
            modelId: 123, // should be a string
            api_identifier: 'api-xyz',
        };
        assert(!isFailedAttemptError(invalidError));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isFailedAttemptError(null));
        assert(!isFailedAttemptError('a string'));
        assert(!isFailedAttemptError(123));
        assert(!isFailedAttemptError([]));
    });
});

Deno.test('Type Guard: isFailedAttemptErrorArray', async (t) => {
    await t.step('should return true for a valid array of FailedAttemptError objects', () => {
        const validArray: FailedAttemptError[] = [
            { error: 'Error 1', modelId: 'model-1', api_identifier: 'api-1' },
            { error: 'Error 2', modelId: 'model-2', api_identifier: 'api-2' },
        ];
        assert(isFailedAttemptErrorArray(validArray));
    });

    await t.step('should return true for an empty array', () => {
        assert(isFailedAttemptErrorArray([]));
    });

    await t.step('should return false if the array contains an invalid object', () => {
        const invalidArray = [
            { error: 'Error 1', modelId: 'model-1', api_identifier: 'api-1' },
            { modelId: 'model-2', api_identifier: 'api-2' }, // Missing 'error' property
        ];
        assert(!isFailedAttemptErrorArray(invalidArray));
    });

    await t.step('should return false if the array contains non-objects', () => {
        const invalidArray = [
            { error: 'Error 1', modelId: 'model-1', api_identifier: 'api-1' },
            null,
        ];
        assert(!isFailedAttemptErrorArray(invalidArray));
    });

    await t.step('should return false for a non-array input', () => {
        assert(!isFailedAttemptErrorArray({ error: 'Error 1', modelId: 'model-1', api_identifier: 'api-1' }));
        assert(!isFailedAttemptErrorArray('a string'));
        assert(!isFailedAttemptErrorArray(null));
    });
});

Deno.test('Type Guard: isJobInsert', async (t) => {
    const baseInsert = {
        session_id: 's1',
        user_id: 'u1',
        stage_slug: 'thesis',
        iteration_number: 1,
        payload: { model_id: 'm1' },
        is_test_job: true,
    };

    await t.step('should return true for a valid job insert object with job_type PLAN', () => {
        const insert = { ...baseInsert, job_type: 'PLAN' };
        assert(isJobInsert(insert));
    });

    await t.step('should return true for a valid job insert object with job_type EXECUTE', () => {
        const insert = { ...baseInsert, job_type: 'EXECUTE' };
        assert(isJobInsert(insert));
    });

    await t.step('should return true for a valid job insert object with job_type RENDER', () => {
        const insert = { ...baseInsert, job_type: 'RENDER' };
        assert(isJobInsert(insert));
    });

    await t.step('should return false if job_type is missing', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: { model_id: 'm1' },
            is_test_job: true,
        };
        assert(!isJobInsert(insert));
    });

    await t.step('should return false if payload is missing model_id', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {},
            is_test_job: false,
            job_type: 'PLAN',
        };
        assert(!isJobInsert(insert));
    });

    await t.step('should return true if is_test_job is missing, as it is optional', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: { model_id: 'm1' },
            job_type: 'PLAN',
        };
        assert(isJobInsert(insert), "isJobInsert should return true when optional is_test_job is omitted");
    });
});

Deno.test('Type Guard: isJobResultsWithModelProcessing', async (t) => {
    await t.step('should return true for a valid result object with a valid array', () => {
        const results = {
            modelProcessingResults: [
                { modelId: 'm1', status: 'completed', attempts: 1, contributionId: 'c1' },
                { modelId: 'm2', status: 'failed', attempts: 3, error: 'Failed' },
            ],
        };
        assert(isJobResultsWithModelProcessing(results));
    });

    await t.step('should return true for a result object with an empty array', () => {
        const results = { modelProcessingResults: [] };
        assert(isJobResultsWithModelProcessing(results));
    });

    await t.step('should return false if modelProcessingResults is not an array', () => {
        const results = { modelProcessingResults: { modelId: 'm1' } };
        assert(!isJobResultsWithModelProcessing(results));
    });

    await t.step('should return false if the array contains invalid items', () => {
        const results = {
            modelProcessingResults: [
                { modelId: 'm1', status: 'completed', attempts: 1 },
                { status: 'failed', attempts: 3 }, // missing modelId
            ],
        };
        assert(!isJobResultsWithModelProcessing(results));
    });

    await t.step('should return false if modelProcessingResults key is missing', () => {
        const results = { otherKey: [] };
        assert(!isJobResultsWithModelProcessing(results));
    });

    await t.step('should return false for non-objects', () => {
        assert(!isJobResultsWithModelProcessing(null));
        assert(!isJobResultsWithModelProcessing([]));
    });
});

Deno.test('Type Guard: isModelProcessingResult', async (t) => {
    await t.step('should return true for a complete, successful result', () => {
        const result = {
            modelId: 'm1',
            status: 'completed',
            attempts: 1,
            contributionId: 'c1',
        };
        assert(isModelProcessingResult(result));
    });

    await t.step('should return true for a failed result with an error message', () => {
        const result = {
            modelId: 'm2',
            status: 'failed',
            attempts: 3,
            error: 'AI timed out',
        };
        assert(isModelProcessingResult(result));
    });

    await t.step('should return true for a result needing continuation', () => {
        const result = {
            modelId: 'm3',
            status: 'needs_continuation',
            attempts: 1,
            contributionId: 'c2-partial',
        };
        assert(isModelProcessingResult(result));
    });

    await t.step('should return false if modelId is missing', () => {
        const result = { status: 'completed', attempts: 1, contributionId: 'c1' };
        assert(!isModelProcessingResult(result));
    });

    await t.step('should return false if status is invalid', () => {
        const result = { modelId: 'm1', status: 'pending', attempts: 1 };
        assert(!isModelProcessingResult(result));
    });

    await t.step('should return false if attempts is not a number', () => {
        const result = { modelId: 'm1', status: 'completed', attempts: 'one' };
        assert(!isModelProcessingResult(result));
    });

    await t.step('should return false for non-objects', () => {
        assert(!isModelProcessingResult(null));
        assert(!isModelProcessingResult('a string'));
    });
});

Deno.test('Type Guard: isPlanJobInsert', async (t) => {
    await t.step('should return true for a valid plan job insert object', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {
                job_type: 'PLAN',
                model_id: 'm1',
                step_info: { current_step: 1, total_steps: 1, status: 'pending' },
            },
            job_type: 'PLAN',
            is_test_job: false,
        };
        assert(isPlanJobInsert(insert));
    });

    await t.step('should return true for a valid plan job insert object where is_test_job is undefined', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {
                job_type: 'PLAN',
                model_id: 'm1',
                step_info: { current_step: 1, total_steps: 1, status: 'pending' },
            },
            job_type: 'PLAN',
            is_test_job: undefined,
        };
        assert(isPlanJobInsert(insert));
    });

    await t.step('should return false if payload is missing job_type', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {
                // job_type: 'plan', // This is missing
                model_id: 'm1',
                step_info: { current_step: 1, total_steps: 1, status: 'pending' },
            },
            job_type: 'PLAN',
            is_test_job: false,
        };
        assert(!isPlanJobInsert(insert));
    });

    await t.step('should return false if payload job_type is not PLAN', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {
                job_type: 'plan', // lowercase, should fail
                model_id: 'm1',
                step_info: { current_step: 1, total_steps: 1, status: 'pending' },
            },
            job_type: 'PLAN',
            is_test_job: false,
        };
        assert(!isPlanJobInsert(insert));
    });

    await t.step('should return false if top-level job_type is not PLAN', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {
                job_type: 'PLAN',
                model_id: 'm1',
                step_info: { current_step: 1, total_steps: 1, status: 'pending' },
            },
            job_type: 'EXECUTE', // Incorrect top-level type
            is_test_job: false,
        };
        assert(!isPlanJobInsert(insert));
    });
});

Deno.test('Type Guard: validatePayload', async (t) => {
    await t.step('should return a valid payload when all required fields are present', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            walletId: 'test-wallet',
        };
        const validated = validatePayload(payload);
        assert(validated.sessionId === 'test-session');
        assert(validated.projectId === 'test-project');
        assert(validated.model_id === 'model-1');
    });

    await t.step('should correctly handle all optional fields', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'test-wallet',
            continueUntilComplete: true,
            maxRetries: 5,
            continuation_count: 2,
            target_contribution_id: 'target-contrib',
        };
        const validated = validatePayload(payload);
        assert(validated.stageSlug === 'test-stage');
        assert(validated.iterationNumber === 1);
        assert(validated.walletId === 'test-wallet');
        assert(validated.continueUntilComplete === true);
        assert(validated.maxRetries === 5);
        assert(validated.continuation_count === 2);
        assert(validated.target_contribution_id === 'target-contrib');
    });

    await t.step('should throw an error for null payload', () => {
        assertThrows(() => validatePayload(null), Error, 'Payload must be a valid object');
    });

    await t.step('should throw an error if payload is not an object', () => {
        assertThrows(() => validatePayload('not-an-object'), Error, 'Payload must be a valid object');
    });

    await t.step('should throw an error if sessionId is missing', () => {
        const payload: Json = {
            projectId: 'test-project',
            model_id: 'model-1',
        };
        assertThrows(() => validatePayload(payload), Error, 'sessionId must be a string');
    });

    await t.step('should throw an error if projectId is missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            model_id: 'model-1',
        };
        assertThrows(() => validatePayload(payload), Error, 'projectId must be a string');
    });

    await t.step('should throw an error if model_id is not a string', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 123, // not a string
            walletId: 'test-wallet',
        };
        assertThrows(() => validatePayload(payload), Error, 'Payload must have model_id (string)');
    });

    await t.step('should throw an error if model_id is missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            walletId: 'test-wallet',
        };
        assertThrows(() => validatePayload(payload), Error, 'Payload must have model_id (string)');
    });
});

Deno.test('Type Guard: isHeaderContext', async (t) => {
    const baseContext = {
        system_materials: {
            stage_rationale: 'why',
            executive_summary: 'summary',
            input_artifacts_summary: 'inputs',
            validation_checkpoint: ['a'],
            quality_standards: ['b'],
            diversity_rubric: { rule: 'value' }
        },
        header_context_artifact: {
            type: 'header_context',
            document_key: 'header_context',
            artifact_class: 'header_context',
            file_type: 'json'
        },
        context_for_documents: [
            {
                document_key: FileType.business_case,
                content_to_include: { section: '' }
            }
        ]
    };

    await t.step('should return true for a valid header context payload', () => {
        assert(isHeaderContext(baseContext));
    });

    await t.step('should return false when system_materials is missing required keys', () => {
        const invalid = {
            ...baseContext,
            system_materials: {
                executive_summary: 'summary'
            }
        };
        assert(!isHeaderContext(invalid));
    });

    await t.step('should return false when context_for_documents contains invalid items', () => {
        const invalid = {
            ...baseContext,
            context_for_documents: [
                {
                    document_key: 'not-a-file-type',
                    content_to_include: { section: '' }
                }
            ]
        };
        assert(!isHeaderContext(invalid));
    });
});

Deno.test('Type Guard: isDialecticContinueReason', async (t) => {
    // Standard continuation reasons from the shared type guard
    const standardContinueReasons: FinishReason[] = [ContinueReason.Length, ContinueReason.MaxTokens, ContinueReason.ContentTruncated, ContinueReason.Unknown];
    
    // Dialectic-specific continuation reasons
    const dialecticContinueReasons: FinishReason[] = ['next_document', 'tool_calls', 'function_call', 'content_filter'];

    // Reasons that should NOT trigger a continuation
    const nonContinueReasons: FinishReason[] = ['stop', 'error', null];

    await t.step('should return true for all standard continuation reasons', () => {
        for (const reason of standardContinueReasons) {
            assert(isDialecticContinueReason(reason), `Failed for standard reason: ${reason}`);
        }
    });

    await t.step('should return true for all dialectic-specific continuation reasons', () => {
        for (const reason of dialecticContinueReasons) {
            assert(isDialecticContinueReason(reason), `Failed for dialectic-specific reason: ${reason}`);
        }
    });

    await t.step('should return false for reasons that are not for continuation', () => {
        for (const reason of nonContinueReasons) {
            assert(!isDialecticContinueReason(reason), `Incorrectly passed for non-continuation reason: ${reason}`);
        }
    });

    await t.step('should return false for invalid input types', () => {
        assert(!isDialecticContinueReason(undefined as unknown as FinishReason), 'Should fail for undefined');
        assert(!isDialecticContinueReason(123 as unknown as FinishReason), 'Should fail for a number');
        assert(!isDialecticContinueReason({} as unknown as FinishReason), 'Should fail for an object');
    });
});
