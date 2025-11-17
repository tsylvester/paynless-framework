import {
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
    isDialecticContinueReason,
    isStageWithRecipeSteps,
    isDatabaseRecipeSteps,
    isPromptType,
    isGranularityStrategy,
    isInputRule,
    isInputRuleArray,
    isRelevanceRule,
    isRelevanceRuleArray,
    isOutputRule,
    isDialecticStageRecipeStep,
    isSystemMaterials,
    isHeaderContextArtifact,
    isContextForDocument,
    isRenderedDocumentArtifact,
    isAssembledJsonArtifact,
    isEditedDocumentResource,
    isSaveContributionEditSuccessResponse,
    isDialecticProjectResourceRow,
    isObjectWithOptionalId,
    isArrayWithOptionalId,
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
    DatabaseRecipeSteps,
    DialecticStepPlannerMetadata,
    PromptType,
    PromptTypes,
    GranularityStrategy,
    GranularityStrategies,
    InputRule,
    RelevanceRule,
    OutputRule,
    DialecticStageRecipeStep,
    SystemMaterials,
    HeaderContextArtifact,
    ContextForDocument,
    RenderedDocumentArtifact,
    AssembledJsonArtifact,
    EditedDocumentResource,
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
        const step: Tables<'dialectic_stage_recipe_steps'> = {
            id: 'step-1',
            job_type: 'PLAN',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            step_key: 'key',
            step_slug: 'slug',
            step_name: 'name',
            output_type: 'system_architecture',
            granularity_strategy: 'per_source_document',
            inputs_required: {},
            inputs_relevance: {},
            outputs_required: {},
            branch_key: null,
            parallel_group: null,
            prompt_template_id: null,
            step_description: null,
            prompt_type: 'Turn',
            config_override: {},
            execution_order: 1,
            instance_id: 'inst-1',
            is_skipped: false,
            object_filter: {},
            output_overrides: {},
            template_step_id: null,
        };
        assert(hasProcessingStrategy(step));
    });

    await t.step('should return false if the recipe step has an invalid job_type', () => {
        const step: Tables<'dialectic_stage_recipe_steps'> = {
            id: 'step-2',
            job_type: 'INVALID_JOB_TYPE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            step_key: 'key',
            step_slug: 'slug',
            step_name: 'name',
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: {},
            inputs_relevance: {},
            outputs_required: {},
            branch_key: null,
            parallel_group: null,
            prompt_template_id: null,
            step_description: null,
            prompt_type: 'Turn',
            config_override: {},
            execution_order: 1,
            instance_id: 'inst-2',
            is_skipped: false,
            object_filter: {},
            output_overrides: {},
            template_step_id: null,
        };
        assert(!hasProcessingStrategy(step));
    });

    await t.step('should return false if job_type is not a valid enum value', () => {
        const step = {
            id: 'step-invalid',
            job_type: 'INVALID_JOB_TYPE',
        };
        assert(!hasProcessingStrategy(step as unknown as Tables<'dialectic_stage_recipe_steps'>));
    });

    await t.step('should return false if job_type is missing', () => {
        const step = { id: 'step-no-job-type' };
        assert(!hasProcessingStrategy(step as unknown as Tables<'dialectic_stage_recipe_steps'>));
    });

    await t.step('should return false for a non-object', () => {
        assert(!hasProcessingStrategy(null as unknown as Tables<'dialectic_stage_recipe_steps'>));
        assert(!hasProcessingStrategy('a string' as unknown as Tables<'dialectic_stage_recipe_steps'>));
    });

    await t.step('should return false if the recipe step is missing job_type', () => {
        const stage: Partial<StageWithRecipeSteps> = {
            dialectic_stage_recipe_steps: [{ id: 'step-3' } as DialecticStageRecipeStep]
        };
        assert(!hasProcessingStrategy(stage as unknown as Tables<'dialectic_stage_recipe_steps'>));
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
        output_type: FileType.business_case,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
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
    await t.step('should pass with a valid optional sourceContributionId from DialecticBaseJobPayload', () => {
        const p = { ...basePayload, sourceContributionId: 'contrib-1' };
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with a null optional sourceContributionId from DialecticBaseJobPayload', () => {
        const p = { ...basePayload, sourceContributionId: null };
        assert(isDialecticExecuteJobPayload(p));
    });

    // Base job payload extras should be permitted on execute payloads
    await t.step('should pass when base payload fields are present', () => {
        const p = {
            ...basePayload,
            continueUntilComplete: true,
            maxRetries: 3,
            continuation_count: 1,
        };
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

    await t.step('should throw for an unknown/extraneous property', () => {
        const pollutedPayload = { ...basePayload, step_info: 'some-orchestrator-context' };
        assertThrows(
            () => isDialecticExecuteJobPayload(pollutedPayload),
            Error,
            'Payload contains unknown properties: step_info'
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

Deno.test('Type Guard: isStageWithRecipeSteps', async (t) => {
    const mockRecipeStep: DialecticStageRecipeStep = {
        branch_key: null,
        config_override: {},
        created_at: '2025-11-05T12:00:00.000Z',
        execution_order: 1,
        granularity_strategy: 'all_to_one',
        id: 'step-1',
        inputs_relevance: [],
        inputs_required: [],
        instance_id: 'instance-1',
        is_skipped: false,
        job_type: 'PLAN',
        object_filter: {},
        output_overrides: {},
        output_type: FileType.HeaderContext,
        outputs_required: {
            system_materials: {
                stage_rationale: "rationale",
                executive_summary: "summary",
                input_artifacts_summary: "inputs",
                progress_update: "progress",
                validation_checkpoint: ["check"],
                quality_standards: ["standard"],
                diversity_rubric: { prefer: "standards" },
            },
        },
        parallel_group: null,
        prompt_template_id: 'template-planner-a',
        prompt_type: 'Planner',
        step_description: 'First step',
        step_key: 'planner_a',
        step_name: 'Planner A',
        step_slug: 'planner_a',
        template_step_id: null,
        updated_at: '2025-11-05T12:00:00.000Z',
      };

      const mockStageData: Tables<'dialectic_stages'> = {
        active_recipe_instance_id: 'instance-1',
        created_at: '2025-11-05T11:58:00.000Z',
        default_system_prompt_id: 'default-prompt',
        description: 'Synthesizes thesis and antithesis.',
        display_name: 'Synthesis',
        expected_output_template_ids: [],
        id: 'stage-1',
        recipe_template_id: 'template-1',
        slug: 'synthesis',
    };

    const mockInstanceData: Tables<'dialectic_stage_recipe_instances'> = {
        cloned_at: null,
        created_at: '2025-11-05T11:59:00.000Z',
        id: 'instance-1',
        is_cloned: false,
        stage_id: 'stage-1',
        template_id: 'template-1',
        updated_at: '2025-11-05T11:59:00.000Z',
    };

    await t.step('should return true for a valid StageWithRecipeSteps object', () => {
        const validObject: StageWithRecipeSteps = {
            dialectic_stage: mockStageData,
            dialectic_stage_recipe_instances: mockInstanceData,
            dialectic_stage_recipe_steps: [mockRecipeStep],
        };
        assert(isStageWithRecipeSteps(validObject));
    });

    await t.step('should return false if dialectic_stage is missing', () => {
        const invalidObject = {
            dialectic_stage_recipe_instances: mockInstanceData,
            dialectic_stage_recipe_steps: [mockRecipeStep],
        };
        assert(!isStageWithRecipeSteps(invalidObject));
    });

    await t.step('should return false if dialectic_stage_recipe_instances is not an object', () => {
        const invalidObject = {
            dialectic_stage: mockStageData,
            dialectic_stage_recipe_instances: [], // Should be an object, not an array
            dialectic_stage_recipe_steps: [mockRecipeStep],
        };
        assert(!isStageWithRecipeSteps(invalidObject));
    });

    await t.step('should return false if dialectic_stage_recipe_steps is not an array', () => {
        const invalidObject = {
            dialectic_stage: mockStageData,
            dialectic_stage_recipe_instances: mockInstanceData,
            dialectic_stage_recipe_steps: {}, // Should be an array
        };
        assert(!isStageWithRecipeSteps(invalidObject));
    });
});

Deno.test('Type Guard: isDatabaseRecipeSteps', async (t) => {
    const mockRecipeStep: Tables<'dialectic_stage_recipe_steps'> = {
        branch_key: null,
        config_override: {},
        created_at: '2025-11-05T12:00:00.000Z',
        execution_order: 1,
        granularity_strategy: 'all_to_one',
        id: 'step-1',
        inputs_relevance: {},
        inputs_required: {},
        instance_id: 'instance-1',
        is_skipped: false,
        job_type: 'PLAN',
        object_filter: {},
        output_overrides: {},
        output_type: 'HeaderContext',
        outputs_required: {},
        parallel_group: null,
        prompt_template_id: 'template-planner-a',
        prompt_type: 'Planner',
        step_description: 'First step',
        step_key: 'planner_a',
        step_name: 'Planner A',
        step_slug: 'planner_a',
        template_step_id: null,
        updated_at: '2025-11-05T12:00:00.000Z',
      };

      const mockStageData: Tables<'dialectic_stages'> = {
        active_recipe_instance_id: 'instance-1',
        created_at: '2025-11-05T11:58:00.000Z',
        default_system_prompt_id: 'default-prompt',
        description: 'Synthesizes thesis and antithesis.',
        display_name: 'Synthesis',
        expected_output_template_ids: [],
        id: 'stage-1',
        recipe_template_id: 'template-1',
        slug: 'synthesis',
    };

    const mockInstanceData: Tables<'dialectic_stage_recipe_instances'> = {
        cloned_at: null,
        created_at: '2025-11-05T11:59:00.000Z',
        id: 'instance-1',
        is_cloned: false,
        stage_id: 'stage-1',
        template_id: 'template-1',
        updated_at: '2025-11-05T11:59:00.000Z',
    };

    await t.step('should return true for a valid DatabaseRecipeSteps object', () => {
        const validObject: DatabaseRecipeSteps = {
            ...mockStageData,
            dialectic_stage_recipe_instances: [
              {
                ...mockInstanceData,
                dialectic_stage_recipe_steps: [mockRecipeStep],
              },
            ],
          };
        assert(isDatabaseRecipeSteps(validObject));
    });

    await t.step('should return false if dialectic_stage_recipe_instances is not an array', () => {
        const invalidObject = {
            ...mockStageData,
            dialectic_stage_recipe_instances: {},
        };
        assert(!isDatabaseRecipeSteps(invalidObject));
    });

    await t.step('should return false if a nested instance is missing dialectic_stage_recipe_steps', () => {
        const invalidObject = {
            ...mockStageData,
            dialectic_stage_recipe_instances: [
                { ...mockInstanceData },
            ],
        };
        assert(!isDatabaseRecipeSteps(invalidObject));
    });

    await t.step('should return false if nested dialectic_stage_recipe_steps is not an array', () => {
        const invalidObject = {
            ...mockStageData,
            dialectic_stage_recipe_instances: [
              {
                ...mockInstanceData,
                dialectic_stage_recipe_steps: {},
              },
            ],
          };
        assert(!isDatabaseRecipeSteps(invalidObject));
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
            document_key: FileType.HeaderContext,
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
    // Standard continuation reasons from the shared type guard (now includes tool_calls via ContinueReason)
    const standardContinueReasons: FinishReason[] = [
        ContinueReason.Length,
        ContinueReason.MaxTokens,
        ContinueReason.ContentTruncated,
        ContinueReason.Unknown,
        ContinueReason.ToolCalls,
    ];
    
    // Dialectic-specific continuation reasons that are not part of ContinueReason
    const dialecticContinueReasons: FinishReason[] = ['next_document', 'function_call', 'content_filter'];

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

Deno.test('Type Guard: isPromptType', async (t) => {
    for (const type of PromptTypes) {
        await t.step(`should return true for valid prompt type: ${type}`, () => {
            assert(isPromptType(type));
        });
    }

    await t.step('should return false for an invalid prompt type', () => {
        assert(!isPromptType('InvalidType'));
    });

    await t.step('should return false for a non-string value', () => {
        assert(!isPromptType(null));
        assert(!isPromptType(123));
        assert(!isPromptType({}));
    });
});

Deno.test('Type Guard: isGranularityStrategy', async (t) => {
    for (const strategy of GranularityStrategies) {
        await t.step(`should return true for valid strategy: ${strategy}`, () => {
            assert(isGranularityStrategy(strategy));
        });
    }

    await t.step('should return false for an invalid strategy', () => {
        assert(!isGranularityStrategy('invalid_strategy'));
    });

    await t.step('should return false for a non-string value', () => {
        assert(!isGranularityStrategy(null));
        assert(!isGranularityStrategy(123));
    });
});

Deno.test('Type Guard: isInputRule and isInputRuleArray', async (t) => {
    const validInputRule: InputRule = {
        type: 'document',
        slug: 'thesis', // Corrected: Use a stage slug, not a document key
        document_key: FileType.business_case,
        required: true,
    };

    await t.step('isInputRule: should return true for a valid InputRule object', () => {
        assert(isInputRule(validInputRule));
    });

    await t.step('isInputRule: should return true for type "seed_prompt"', () => {
        const rule: InputRule = { ...validInputRule, type: 'seed_prompt', slug: 'thesis', document_key: FileType.SeedPrompt };
        assert(isInputRule(rule));
    });

    await t.step('isInputRule: should return true for type "header_context"', () => {
        const rule: InputRule = { ...validInputRule, type: 'header_context', slug: 'synthesis', document_key: FileType.HeaderContext };
        assert(isInputRule(rule));
    });

    await t.step('isInputRule: should return true for type "feedback"', () => {
        const rule: InputRule = { ...validInputRule, type: 'feedback', slug: 'antithesis', document_key: FileType.business_case_critique };
        assert(isInputRule(rule));
    });

    await t.step('isInputRule: should return true for type "project_resource"', () => {
        const rule: InputRule = { ...validInputRule, type: 'project_resource', slug: 'paralysis', document_key: FileType.InitialUserPrompt };
        assert(isInputRule(rule));
    });

    await t.step('isInputRule: should return true when required is missing (defaults to false)', () => {
        const ruleWithoutRequired = { 
            type: 'document',
            slug: 'thesis',
            document_key: FileType.business_case,
        };
        assert(isInputRule(ruleWithoutRequired));
    });

    await t.step('isInputRule: should return false if type is invalid', () => {
        const invalidRule = { ...validInputRule, type: 'invalid_type' };
        assert(!isInputRule(invalidRule));
    });

    await t.step('isInputRule: should return false if document_key is an empty string', () => {
        const invalidRule = { ...validInputRule, document_key: '' };
        assert(!isInputRule(invalidRule));
    });

    await t.step('isInputRule: should return true for document keys introduced by recipes', () => {
        const dynamicDocumentRule = {
            type: 'document',
            slug: 'synthesis',
            document_key: 'synthesis_pairwise_feature_spec',
            required: true,
        };
        assert(isInputRule(dynamicDocumentRule));
    });

    await t.step('isInputRuleArray: should return true for arrays containing dynamic recipe document keys', () => {
        const dynamicRuleArray = [{
            type: 'document',
            slug: 'synthesis',
            document_key: 'synthesis_pairwise_business_case',
            required: true,
        }];
        assert(isInputRuleArray(dynamicRuleArray));
    });

    await t.step('isInputRule: should return false if slug is missing', () => {
        const invalidRule = { ...validInputRule };
        delete (invalidRule as Partial<InputRule>).slug;
        assert(!isInputRule(invalidRule));
    });

    await t.step('isInputRule: should return false if slug is not a string', () => {
        const invalidRule = { ...validInputRule, slug: 123 };
        assert(!isInputRule(invalidRule));
    });

    await t.step('isInputRule: should return false if required is present but not a boolean', () => {
        const invalidRule = { ...validInputRule, required: 'true' };
        assert(!isInputRule(invalidRule));
    });

    await t.step('isInputRule: should return true for a valid InputRule with the optional multiple property', () => {
        const ruleWithMultiple = { ...validInputRule, multiple: true };
        assert(isInputRule(ruleWithMultiple));
    });

    await t.step('isInputRule: should return false if multiple is present but not a boolean', () => {
        const invalidRule = { ...validInputRule, multiple: 'yes' };
        assert(!isInputRule(invalidRule));
    });

    await t.step('isInputRuleArray: should return true for a valid array of InputRule objects', () => {
        assert(isInputRuleArray([validInputRule, { 
            type: 'document', 
            slug: 'synthesis', 
            document_key: FileType.system_architecture, 
            required: false, 
            multiple: true 
        }]));
    });

    await t.step('isInputRuleArray: should return true for an empty array', () => {
        assert(isInputRuleArray([]));
    });

    await t.step('isInputRuleArray: should return false for an array with invalid items', () => {
        const invalidArray = [validInputRule, { document_key: 'invalid' }];
        assert(!isInputRuleArray(invalidArray));
    });
});

Deno.test('Type Guard: isRelevanceRule and isRelevanceRuleArray', async (t) => {
    const validRelevanceRule: RelevanceRule = {
        document_key: FileType.business_case,
        relevance: 0.8,
    };

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object without optional properties', () => {
        assert(isRelevanceRule(validRelevanceRule));
    });

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object with a type property', () => {
        const ruleWithType = { ...validRelevanceRule, type: 'document' };
        assert(isRelevanceRule(ruleWithType));
    });

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object with a slug property', () => {
        const ruleWithSlug = { ...validRelevanceRule, slug: 'thesis' };
        assert(isRelevanceRule(ruleWithSlug));
    });

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object with all optional properties', () => {
        const ruleWithAllOptionals = {
            ...validRelevanceRule,
            type: 'document',
            slug: 'thesis',
        };
        assert(isRelevanceRule(ruleWithAllOptionals));
    });

    await t.step('isRelevanceRule: should return false if document_key is an empty string', () => {
        const invalidRule = { ...validRelevanceRule, document_key: '' };
        assert(!isRelevanceRule(invalidRule));
    });

    await t.step('isRelevanceRule: should return false if relevance is missing', () => {
        const invalidRule = { document_key: FileType.business_case };
        assert(!isRelevanceRule(invalidRule));
    });

    await t.step('isRelevanceRule: should return false if relevance is not a number', () => {
        const invalidRule = { ...validRelevanceRule, relevance: 'high' };
        assert(!isRelevanceRule(invalidRule));
    });

    await t.step('isRelevanceRule: should return true for dynamic document keys emitted by recipes', () => {
        const dynamicRelevanceRule = {
            document_key: 'synthesis_pairwise_feature_spec',
            relevance: 0.9,
            slug: 'synthesis',
        };
        assert(isRelevanceRule(dynamicRelevanceRule));
    });

    await t.step('isRelevanceRule: should return false if type is present but not a string', () => {
        const invalidRule = { ...validRelevanceRule, type: 123 };
        assert(!isRelevanceRule(invalidRule));
    });
    
    await t.step('isRelevanceRule: should return false if slug is present but not a string', () => {
        const invalidRule = { ...validRelevanceRule, slug: 123 };
        assert(!isRelevanceRule(invalidRule));
    });

    await t.step('isRelevanceRuleArray: should return true for a valid array', () => {
        assert(isRelevanceRuleArray([validRelevanceRule, { document_key: FileType.system_architecture, type: 'document', relevance: 0.5, slug: 'synthesis' }]));
    });

    await t.step('isRelevanceRuleArray: should return true for an empty array', () => {
        assert(isRelevanceRuleArray([]));
    });

    await t.step('isRelevanceRuleArray: should return true for arrays containing dynamic recipe document keys', () => {
        const dynamicRelevanceArray = [{
            document_key: 'final_business_case',
            relevance: 1,
            slug: 'synthesis',
            type: 'document',
        }];
        assert(isRelevanceRuleArray(dynamicRelevanceArray));
    });

    await t.step('isRelevanceRuleArray: should return false for an array with invalid items', () => {
        const invalidArray = [validRelevanceRule, { document_key: '', relevance: 0.5 }];
        assert(!isRelevanceRuleArray(invalidArray));
    });

    await t.step('isRelevanceRule: should return true when optional type is null', () => {
        const ruleWithNullType = { ...validRelevanceRule, type: null };
        assert(isRelevanceRule(ruleWithNullType));
    });

    await t.step('isRelevanceRule: should return true when optional slug is null', () => {
        const ruleWithNullSlug = { ...validRelevanceRule, slug: null };
        assert(isRelevanceRule(ruleWithNullSlug));
    });
});

Deno.test('Type Guard: isOutputRule', async (t) => {
    await t.step('should return true for a valid "PLAN" output rule', () => {
        const planOutputRule: OutputRule = {
            system_materials: {
                stage_rationale: "Test rationale for planning.",
                executive_summary: "Plan summary.",
                input_artifacts_summary: "Summary of inputs for the plan.",
                progress_update: "Planning is starting.",
                validation_checkpoint: ["Plan validation"],
                quality_standards: ["High quality plan"],
                diversity_rubric: { plan: "diverse" }
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: FileType.HeaderContext,
                artifact_class: 'header_context',
                file_type: 'json'
            },
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: { "section_a": "details" }
            }]
        };
        assert(isOutputRule(planOutputRule));
    });

    await t.step('should return true for a valid "PLAN" output rule with files_to_generate', () => {
        const planOutputRule: OutputRule = {
            system_materials: {
                stage_rationale: "Test rationale for planning.",
                executive_summary: "Plan summary.",
                input_artifacts_summary: "Summary of inputs for the plan.",
                progress_update: "Planning is starting.",
                validation_checkpoint: ["Plan validation"],
                quality_standards: ["High quality plan"],
                diversity_rubric: { plan: "diverse" }
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: FileType.HeaderContext,
                artifact_class: 'header_context',
                file_type: 'json'
            },
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: { "section_a": "details" }
            }],
            files_to_generate: [{
                from_document_key: FileType.business_case,
                template_filename: "business_case_template.md"
            }]
        };
        assert(isOutputRule(planOutputRule));
    });

    await t.step('should return true for a valid "EXECUTE" output rule', () => {
        const executeOutputRule: OutputRule = {
            documents: [{
                document_key: FileType.business_case,
                template_filename: 'business_case_template.md',
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                content_to_include: {
                  "executive_summary": "",
                }
            }],
            files_to_generate: [{ 
                from_document_key: FileType.business_case, 
                template_filename: "business_case_template.md" 
            }],
        };
        assert(isOutputRule(executeOutputRule));
    });

    await t.step('should return true for a valid "EXECUTE" output rule with both documents and assembled_json', () => {
        const executeOutputRule: OutputRule = {
            documents: [{
                document_key: FileType.technical_requirements,
                template_filename: 'parenthesis_technical_requirements.md',
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                content_to_include: {
                  "executive_summary": "",
                }
            }],
            files_to_generate: [{ 
                from_document_key: FileType.technical_requirements, 
                template_filename: "parenthesis_technical_requirements.md" 
            }],
            assembled_json: [{
                document_key: FileType.technical_requirements,
                artifact_class: 'assembled_document_json',
                fields: ["subsystems[].name", "subsystems[].objective"],
            }],
        };
        assert(isOutputRule(executeOutputRule));
    });

    await t.step('should return true for an empty OutputRule object', () => {
        assert(isOutputRule({}));
    });

    await t.step('should return false if system_materials contains non-string prose', () => {
        const invalidRule = {
            system_materials: {
                stage_rationale: 123,
            }
        };
        assert(!isOutputRule(invalidRule));
    });

    await t.step('should return false if header_context_artifact is invalid', () => {
        const invalidRule = { header_context_artifact: { type: 'wrong' } };
        assert(!isOutputRule(invalidRule));
    });

    await t.step('should return false if documents is not an array', () => {
        const invalidRule = { documents: {} };
        assert(!isOutputRule(invalidRule));
    });

    await t.step('should return false if assembled_json is not an array', () => {
        const invalidRule = { assembled_json: {} };
        assert(!isOutputRule(invalidRule));
    });

    await t.step('should return true for a valid "EXECUTE" output rule with complex content_to_include', () => {
        const executeOutputRule: OutputRule = {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'business_case_template.md',
                content_to_include: {
                    "executive_summary": "",
                    "market_opportunity": "",
                    "user_problem_validation": "",
                  }
            }],
            context_for_documents: [
                {
                    document_key: FileType.feature_spec,
                    content_to_include: [
                        {
                            feature_name: "Test Feature",
                            user_stories: [
                                "As a user, I can do X.",
                                "As an admin, I can do Y."
                            ]
                        }
                    ]
                },
                {
                    document_key: FileType.technical_approach,
                    content_to_include: {
                        overview: "Technical overview",
                        components: [
                            { name: "Component A", technology: "React" },
                            { name: "Component B", technology: "Node.js" }
                        ]
                    }
                }
            ]
        };
        assert(isOutputRule(executeOutputRule));
    });

    await t.step('should return true for a valid output rule with assembled_json', () => {
        const assembledJsonOutputRule: OutputRule = {
            assembled_json: [{
                artifact_class: 'assembled_document_json',
                document_key: FileType.technical_requirements,
                fields: ["subsystems[].name", "subsystems[].objective"],
            }],
        };
        assert(isOutputRule(assembledJsonOutputRule));
    });

    await t.step('should return true for a valid "PLAN" output rule with files_to_generate and review_metadata', () => {
        const planOutputRule: OutputRule = {
            system_materials: {
                stage_rationale: "Test rationale for planning.",
                executive_summary: "Plan summary.",
                input_artifacts_summary: "Summary of inputs for the plan.",
                progress_update: "Planning is starting.",
                validation_checkpoint: ["Plan validation"],
                quality_standards: ["High quality plan"],
                diversity_rubric: { plan: "diverse" }
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: FileType.HeaderContext,
                artifact_class: 'header_context',
                file_type: 'json'
            },
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: { "section_a": "details" }
            }],
            review_metadata: {
                proposal_identifier: { lineage_key: "test", source_model_slug: "test" },
                proposal_summary: "Test summary",
                review_focus: ["feasibility"],
                user_constraints: [],
                normalization_guidance: { scoring_scale: "1-5", required_dimensions: ["feasibility"] }
            }
        };
        assert(isOutputRule(planOutputRule));
    });

    await t.step('should return true for a valid "EXECUTE" output rule where a document is an AssembledJsonArtifact', () => {
        const executeOutputRule: OutputRule = {
            documents: [{
                document_key: FileType.comparison_vector,
                template_filename: 'antithesis_comparison_vector.json',
                artifact_class: 'assembled_document_json',
                file_type: 'json',
                content_to_include: {
                  "proposal": {
                    "lineage_key": "",
                    "source_model_slug": ""
                  }
                }
            }],
            files_to_generate: [{ 
                from_document_key: FileType.comparison_vector, 
                template_filename: "antithesis_comparison_vector.json" 
            }],
        };
        assert(isOutputRule(executeOutputRule));
    });
});

Deno.test('Type Guard: isDialecticStageRecipeStep', async (t) => {
    const validStep: DialecticStageRecipeStep = {
        id: 'step-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        instance_id: 'inst-1',
        step_key: 'key',
        step_slug: 'slug',
        step_name: 'name',
        step_description: 'description',
        execution_order: 1,
        job_type: 'PLAN',
        prompt_type: 'Planner',
        granularity_strategy: 'all_to_one',
        output_type: FileType.system_architecture,
        inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
        inputs_relevance: [{ document_key: FileType.system_architecture, slug: 'thesis', relevance: 0.5 }],
        outputs_required: {
            system_materials: {
                stage_rationale: "rationale",
                executive_summary: "summary",
                input_artifacts_summary: "inputs",
                progress_update: "progress",
                validation_checkpoint: ["check"],
                quality_standards: ["standard"],
                diversity_rubric: { prefer: "standards" },
            },
            header_context_artifact: {
                type: "header_context",
                document_key: FileType.HeaderContext,
                artifact_class: "header_context",
                file_type: "json",
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {},
                },
            ],
        },
        prompt_template_id: 'prompt-1',
        is_skipped: false,
        branch_key: null,
        parallel_group: null,
        object_filter: null,
        config_override: null,
        output_overrides: null,
        template_step_id: null,
    };

    await t.step('should return true for a complete and valid DialecticStageRecipeStep object', () => {
        assert(isDialecticStageRecipeStep(validStep));
    });

    await t.step('should return false if job_type is invalid', () => {
        const invalidStep = { ...validStep, job_type: 'INVALID' as JobType };
        assert(!isDialecticStageRecipeStep(invalidStep));
    });

    await t.step('should return true when recipe steps use dynamic document keys', () => {
        const dynamicDocumentStep = {
            ...validStep,
            inputs_required: [{
                type: 'document',
                slug: 'synthesis',
                document_key: 'synthesis_pairwise_feature_spec',
                required: true,
            }],
            inputs_relevance: [{
                document_key: 'synthesis_pairwise_feature_spec',
                relevance: 1,
                slug: 'synthesis',
            }],
            outputs_required: {
                documents: [{
                    document_key: 'final_feature_spec',
                    template_filename: 'final_feature_spec.md',
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                    content_to_include: {},
                }],
                context_for_documents: [{
                    document_key: 'final_feature_spec',
                    content_to_include: {},
                }],
            },
        };
        assert(isDialecticStageRecipeStep(dynamicDocumentStep));
    });

    await t.step('should return false if prompt_type is invalid', () => {
        const invalidStep = { ...validStep, prompt_type: 'INVALID' as PromptType };
        assert(!isDialecticStageRecipeStep(invalidStep));
    });

    await t.step('should return false if inputs_required is not a valid InputRule array', () => {
        const invalidStep = { ...validStep, inputs_required: [{ document_key: 'invalid' } as unknown as InputRule] };
        assert(!isDialecticStageRecipeStep(invalidStep));
    });

    await t.step('should return false if a required property is missing (e.g., step_key)', () => {
        const invalidStep = { ...validStep };
        delete (invalidStep as Partial<DialecticStageRecipeStep>).step_key;
        assert(!isDialecticStageRecipeStep(invalidStep));
    });

    await t.step('should return false when inputs_required is null', () => {
        const stepWithNullInputs = { ...validStep, inputs_required: null };
        assert(!isDialecticStageRecipeStep(stepWithNullInputs));
    });

    await t.step('should return false when inputs_relevance is null', () => {
        const stepWithNullRelevance = { ...validStep, inputs_relevance: null };
        assert(!isDialecticStageRecipeStep(stepWithNullRelevance));
    });

    await t.step('should return false when outputs_required is null', () => {
        const stepWithNullOutputs = { ...validStep, outputs_required: null };
        assert(!isDialecticStageRecipeStep(stepWithNullOutputs));
    });

    await t.step('should return false when id is missing', () => {
        const stepWithoutId = { ...validStep };
        delete (stepWithoutId as Partial<DialecticStageRecipeStep>).id;
        assert(!isDialecticStageRecipeStep(stepWithoutId));
    });
});

Deno.test('Type Guard: isSystemMaterials', async (t) => {
    const validSystemMaterials: SystemMaterials = {
        stage_rationale: 'Test rationale',
        executive_summary: 'Test summary',
        input_artifacts_summary: 'Test input summary',
        progress_update: 'Test progress update',
        diversity_rubric: { key: 'value' },
        quality_standards: ['standard1'],
        validation_checkpoint: ['checkpoint1'],
    };

    const comprehensiveSystemMaterials: SystemMaterials = {
        ...validSystemMaterials,
        decision_criteria: ['criteria1', 'criteria2'],
        milestones: ['M1', 'M2'],
        dependency_rules: ['rule1'],
        status_preservation_rules: { completed_status: '[✅]' },
        generation_limits: { max_steps: 100 },
        document_order: ['doc1', 'doc2'],
        current_document: 'doc1',
        iteration_metadata: { iteration_number: 1 },
        exhaustiveness_requirement: 'high',
        technical_requirements_outline_inputs: { subsystems: [] },
    };

    await t.step('should return true for a valid SystemMaterials object', () => {
        assert(isSystemMaterials(validSystemMaterials));
    });

    await t.step('should return true for a comprehensive SystemMaterials object with all optional fields', () => {
        assert(isSystemMaterials(comprehensiveSystemMaterials));
    });

    await t.step('should return true for an object with only required fields', () => {
        const minimalSystemMaterials = {
            stage_rationale: 'Minimal rationale',
            executive_summary: 'Minimal summary',
            input_artifacts_summary: 'Minimal input summary',
            progress_update: 'Minimal progress update',
            diversity_rubric: {},
            quality_standards: [],
            validation_checkpoint: [],
        };
        assert(isSystemMaterials(minimalSystemMaterials));
    });

    await t.step('should return true for planner payload without prose fields', () => {
        const plannerOnlySystemMaterials = {
            milestones: [],
            dependency_rules: [],
            status_preservation_rules: {
                completed_status: '[✅]',
                in_progress_status: '[🚧]',
                unstarted_status: '[ ]',
            },
            technical_requirements_outline_inputs: {
                subsystems: [],
                apis: [],
                schemas: [],
                proposed_file_tree: '',
                architecture_overview: '',
            },
        };
        assert(isSystemMaterials(plannerOnlySystemMaterials));
    });

    await t.step('should return false if stage_rationale is present but not a string', () => {
        const invalid = { ...validSystemMaterials, stage_rationale: 123 };
        assert(!isSystemMaterials(invalid));
    });

    await t.step('should return false if a required string property has the wrong type', () => {
        const invalid = { ...validSystemMaterials, executive_summary: 123 };
        assert(!isSystemMaterials(invalid));
    });

    await t.step('should return false if an array property has the wrong type', () => {
        const invalid = { ...validSystemMaterials, quality_standards: 'not-an-array' };
        assert(!isSystemMaterials(invalid));
    });

    await t.step('should return false if an object property has the wrong type', () => {
        const invalid = { ...validSystemMaterials, diversity_rubric: 'not-an-object' };
        assert(!isSystemMaterials(invalid));
    });

    await t.step('should return false if files_to_generate contains invalid items', () => {
        const invalid = { ...validSystemMaterials, files_to_generate: [{ invalid_key: 'value' }] };
        assert(!isSystemMaterials(invalid));
    });
});

Deno.test('Type Guard: isHeaderContextArtifact', async (t) => {
    const validArtifact: HeaderContextArtifact = {
        type: 'header_context',
        document_key: FileType.HeaderContext,
        artifact_class: 'header_context',
        file_type: 'json',
    };

    await t.step('should return true for a valid HeaderContextArtifact object', () => {
        assert(isHeaderContextArtifact(validArtifact));
    });

    await t.step('should return false if type is not "header_context"', () => {
        const invalid = { ...validArtifact, type: 'wrong_type' };
        assert(!isHeaderContextArtifact(invalid));
    });
});

Deno.test('Type Guard: isContextForDocument', async (t) => {
    const validContext: ContextForDocument = {
        document_key: FileType.business_case,
        content_to_include: { some: 'data' },
    };

    await t.step('should return true for a valid ContextForDocument object', () => {
        assert(isContextForDocument(validContext));
    });

    await t.step('should return true when content_to_include is an array', () => {
        const contextWithArray: ContextForDocument = {
            document_key: FileType.feature_spec,
            content_to_include: [{ feature_name: "", user_stories: [] }],
        };
        assert(isContextForDocument(contextWithArray));
    });

    await t.step('should return false if document_key is missing', () => {
        const invalid = { ...validContext };
        delete (invalid as Partial<ContextForDocument>).document_key;
        assert(!isContextForDocument(invalid));
    });

    await t.step('should return false if content_to_include is missing', () => {
        const invalid = { ...validContext };
        delete (invalid as Partial<ContextForDocument>).content_to_include;
        assert(!isContextForDocument(invalid));
    });

    await t.step('should return true when document_key is a dynamic recipe string', () => {
        const dynamicContext = {
            document_key: 'synthesis_pairwise_feature_spec',
            content_to_include: { strengths: [], weaknesses: [] },
        };
        assert(isContextForDocument(dynamicContext));
    });
});

Deno.test('Type Guard: isRenderedDocumentArtifact', async (t) => {
    const validArtifact: RenderedDocumentArtifact = {
        document_key: FileType.business_case,
        template_filename: 'template.txt',
        artifact_class: 'rendered_document',
        file_type: 'markdown',
        content_to_include: { summary: "This is a summary." }
    };

    await t.step('should return true when content_to_include is missing', () => {
        const artifactWithoutContentToInclude: Omit<RenderedDocumentArtifact, 'content_to_include'> = {
            document_key: FileType.business_case,
            template_filename: 'template.txt',
            artifact_class: 'rendered_document',
            file_type: 'markdown',
        };
        assert(isRenderedDocumentArtifact(artifactWithoutContentToInclude));
    });

    await t.step('should return true for a valid RenderedDocumentArtifact object', () => {
        assert(isRenderedDocumentArtifact(validArtifact));
    });

    await t.step('should return true for a valid RenderedDocumentArtifact with optional properties', () => {
        const artifactWithOptionals: RenderedDocumentArtifact = {
            ...validArtifact,
            lineage_key: 'lineage-abc',
            source_model_slug: 'model-xyz',
        };
        assert(isRenderedDocumentArtifact(artifactWithOptionals));
    });

    await t.step('should return true when content_to_include is an array', () => {
        const artifactWithArrayContent: RenderedDocumentArtifact = {
            document_key: FileType.risk_register,
            template_filename: 'template.txt',
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            content_to_include: [
                {
                    risk: "some risk",
                    impact: "high",
                    likelihood: "medium",
                    mitigation: "do something"
                }
            ]
        };
        assert(isRenderedDocumentArtifact(artifactWithArrayContent));
    });

    await t.step('should return false if artifact_class is not "rendered_document"', () => {
        const invalid = { ...validArtifact, artifact_class: 'wrong_type' };
        assert(!isRenderedDocumentArtifact(invalid));
    });

    await t.step('should return false if document_key is missing', () => {
        const invalid = { ...validArtifact };
        delete (invalid as Partial<RenderedDocumentArtifact>).document_key;
        assert(!isRenderedDocumentArtifact(invalid));
    });

    await t.step('should return false if template_filename is missing', () => {
        const invalid = { ...validArtifact };
        delete (invalid as Partial<RenderedDocumentArtifact>).template_filename;
        assert(!isRenderedDocumentArtifact(invalid));
    });

    await t.step('should return false if document_key is of the wrong type', () => {
        const invalid = { ...validArtifact, document_key: 123 };
        assert(!isRenderedDocumentArtifact(invalid));
    });

    await t.step('should return false if template_filename is of the wrong type', () => {
        const invalid = { ...validArtifact, template_filename: 123 };
        assert(!isRenderedDocumentArtifact(invalid));
    });

    await t.step('should return false if content_to_include is not an object or array', () => {
        const invalid = { ...validArtifact, content_to_include: "a string" };
        assert(!isRenderedDocumentArtifact(invalid));
    });

    await t.step('should return true for artifacts that use dynamic document keys', () => {
        const dynamicDocumentArtifact = {
            document_key: 'final_business_case',
            template_filename: 'final_business_case.md',
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            content_to_include: { executive_summary: '', next_steps: '' },
        };
        assert(isRenderedDocumentArtifact(dynamicDocumentArtifact));
    });
});

Deno.test('Type Guard: isEditedDocumentResource', async (t) => {
    const baseResource: EditedDocumentResource = {
        id: 'resource-1',
        resource_type: 'rendered_document',
        project_id: 'project-1',
        session_id: 'session-1',
        stage_slug: 'thesis',
        iteration_number: 1,
        document_key: FileType.business_case,
        source_contribution_id: 'contrib-1',
        storage_bucket: 'dialectic_project_resources',
        storage_path: 'project-1/session_ABC/stage',
        file_name: 'thesis_business_case.md',
        mime_type: 'text/markdown',
        size_bytes: 1024,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    await t.step('should return true for a fully-populated resource', () => {
        assert(isEditedDocumentResource(baseResource));
    });

    await t.step('should return true when optional fields are null', () => {
        const nullableResource: EditedDocumentResource = {
            ...baseResource,
            resource_type: null,
            project_id: null,
            session_id: null,
            stage_slug: null,
            iteration_number: null,
            document_key: null,
            source_contribution_id: null,
        };
        assert(isEditedDocumentResource(nullableResource));
    });

    await t.step('should return false when a required string field is missing', () => {
        const invalid = { ...baseResource };
        delete (invalid as Partial<EditedDocumentResource>).file_name;
        assert(!isEditedDocumentResource(invalid));
    });

    await t.step('should return false when a required number field has the wrong type', () => {
        const invalid = { ...baseResource, size_bytes: 'big' as unknown as number };
        assert(!isEditedDocumentResource(invalid));
    });
});

Deno.test('Type Guard: isDialecticProjectResourceRow', async (t) => {
    const baseResource = {
        id: 'res-1',
        project_id: 'proj-1',
        user_id: 'user-1',
        file_name: 'resource.md',
        storage_bucket: 'dialectic_project_resources',
        storage_path: 'proj-1/resource.md',
        mime_type: 'text/markdown',
        size_bytes: 1024,
        resource_description: { type: 'general_resource' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        iteration_number: null,
        resource_type: 'general_resource',
        session_id: null,
        source_contribution_id: 'contrib-123',
        stage_slug: null,
    };

    await t.step('should return true for a fully populated resource row', () => {
        assert(isDialecticProjectResourceRow(baseResource));
    });

    await t.step('should return true when optional nullable properties are null', () => {
        const nullableResource = {
            ...baseResource,
            user_id: null,
            file_name: null,
            resource_type: null,
            session_id: null,
            stage_slug: null,
            iteration_number: null,
            size_bytes: null,
            source_contribution_id: null,
        };
        assert(isDialecticProjectResourceRow(nullableResource));
    });

    await t.step('should return false when a required string property is missing', () => {
        const invalidResource = { ...baseResource };
        delete (invalidResource as Partial<typeof baseResource>).project_id;
        assert(!isDialecticProjectResourceRow(invalidResource));
    });

    await t.step('should return false when a numeric field has the wrong type', () => {
        const invalidResource = { ...baseResource, size_bytes: 'large' };
        assert(!isDialecticProjectResourceRow(invalidResource));
    });
});

Deno.test('Type Guard: isObjectWithOptionalId', async (t) => {
    await t.step('should return true when id is a string', () => {
        assert(isObjectWithOptionalId({ id: 'abc' }));
    });

    await t.step('should return true when id is undefined/missing', () => {
        assert(isObjectWithOptionalId({}));
    });

    await t.step('should return false when id is not a string', () => {
        assert(!isObjectWithOptionalId({ id: 123 }));
    });

    await t.step('should return false for non-record inputs', () => {
        assert(!isObjectWithOptionalId(null));
        assert(!isObjectWithOptionalId('test'));
    });
});

Deno.test('Type Guard: isArrayWithOptionalId', async (t) => {
    await t.step('should return true for an array of objects with optional ids', () => {
        assert(isArrayWithOptionalId([{ id: 'one' }, {}]));
    });

    await t.step('should return true for an empty array', () => {
        assert(isArrayWithOptionalId([]));
    });

    await t.step('should return false when any element fails the object guard', () => {
        assert(!isArrayWithOptionalId([{ id: 'one' }, { id: 123 }]));
    });

    await t.step('should return false for non-array inputs', () => {
        assert(!isArrayWithOptionalId({}));
        assert(!isArrayWithOptionalId('test'));
        assert(!isArrayWithOptionalId(null));
    });
});

Deno.test('Type Guard: isSaveContributionEditSuccessResponse', async (t) => {
    const resource: EditedDocumentResource = {
        id: 'resource-2',
        resource_type: 'rendered_document',
        project_id: 'project-2',
        session_id: 'session-2',
        stage_slug: 'synthesis',
        iteration_number: 2,
        document_key: FileType.synthesis_document_business_case,
        source_contribution_id: 'contrib-2',
        storage_bucket: 'dialectic_project_resources',
        storage_path: 'project-2/session_DEF/stage',
        file_name: 'synthesis_business_case.md',
        mime_type: 'text/markdown',
        size_bytes: 2048,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    await t.step('should return true for a valid success response', () => {
        const response = {
            sourceContributionId: 'contrib-2',
            resource,
        };
        assert(isSaveContributionEditSuccessResponse(response));
    });

    await t.step('should return false when sourceContributionId is missing', () => {
        const response = {
            resource,
        };
        assert(!isSaveContributionEditSuccessResponse(response));
    });

    await t.step('should return false when resource is invalid', () => {
        const response = {
            sourceContributionId: 'contrib-2',
            resource: {
                ...resource,
                file_name: 123,
            },
        };
        assert(!isSaveContributionEditSuccessResponse(response));
    });
});

Deno.test('Type Guard: isAssembledJsonArtifact', async (t) => {
    const validArtifactWithFields: AssembledJsonArtifact = {
        document_key: FileType.technical_requirements,
        artifact_class: 'assembled_document_json',
        fields: [
            "subsystems[].name",
            "subsystems[].objective",
        ],
    };

    const validArtifactAsDocument: AssembledJsonArtifact = {
        document_key: FileType.synthesis_document_business_case,
        artifact_class: 'assembled_json',
        template_filename: 'synthesis_document_business_case_template.json',
        file_type: 'json',
        content_to_include: {
            "executive_summary": "",
            "synthesis_of_key_points": "",
            "final_recommendation": ""
        }
    };

    await t.step('should return true for a valid artifact with a fields property', () => {
        assert(isAssembledJsonArtifact(validArtifactWithFields));
    });

    await t.step('should return true for a valid artifact structured as a document', () => {
        assert(isAssembledJsonArtifact(validArtifactAsDocument));
    });
    
    await t.step('should return true for an artifact with optional properties', () => {
        const artifactWithOptionals: AssembledJsonArtifact = {
            ...validArtifactWithFields,
            lineage_key: 'lineage-abc',
            source_model_slug: 'model-xyz',
        };
        assert(isAssembledJsonArtifact(artifactWithOptionals));
    });

    await t.step('should return true for artifact with class "assembled_json"', () => {
        const artifactWithClass = { ...validArtifactWithFields, artifact_class: 'assembled_json' };
        assert(isAssembledJsonArtifact(artifactWithClass));
    });

    await t.step('should return false if artifact_class is invalid', () => {
        const invalid = { ...validArtifactWithFields, artifact_class: 'wrong_type' };
        assert(!isAssembledJsonArtifact(invalid));
    });

    await t.step('should return false if document_key is missing', () => {
        const invalid = { ...validArtifactWithFields };
        delete (invalid as Partial<AssembledJsonArtifact>).document_key;
        assert(!isAssembledJsonArtifact(invalid));
    });

    await t.step('should return false if fields array contains non-string values', () => {
        const invalid = {
            ...validArtifactWithFields,
            fields: ['valid_field', 123],
        };
        assert(!isAssembledJsonArtifact(invalid));
    });

    await t.step('should return false if it has both fields and template_filename', () => {
        const invalid = {
            ...validArtifactWithFields,
            template_filename: 'some_template.json',
        };
        assert(!isAssembledJsonArtifact(invalid));
    });

    await t.step('should return false if document structure is missing template_filename', () => {
        const invalid = { ...validArtifactAsDocument };
        delete (invalid as Partial<AssembledJsonArtifact>).template_filename;
        assert(!isAssembledJsonArtifact(invalid));
    });
});