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
    validatePayload,
    isDialecticPlanJobPayload,
    isDialecticSkeletonJobPayload,
    isDialecticBaseJobPayload,
    isDialecticExecuteJobPayload,
    isDialecticRenderJobPayload,
    isContinuablePayload,
    isContributionType,
    isDialecticChunkMetadata,
    isDocumentRelationships,
    hasModelResultWithContributionId,
    isJobInsert,
    isPlanJobInsert,
    isHeaderContext,
    isContentToInclude,
    isDialecticContinueReason,
    isStageWithRecipeSteps,
    isDatabaseRecipeSteps,
    isPromptType,
    isGranularityStrategy,
    isInputRule,
    isInputRuleArray,
    isInputRuleType,
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
    isSelectAnchorResult,
    isGitHubRepoSettings,
    isDialecticProjectUpdate,
    isRepoUrlWithLastSyncAt,
    isUnifiedAIResponseTokenUsage,
    isUnifiedAIResponse,
    isPromptConstructionPayload,
    isProcessSimpleJobParams,
    isProcessComplexJobParams,
    isProcessRenderJobParams,
    isProcessSimpleJobPayload,
    isProcessComplexJobPayload,
    isProcessRenderJobPayload,
    isProcessSimpleJobDispatchedReturn,
    isProcessSimpleJobDeferredReturn,
    isProcessSimpleJobSuccessReturn,
    isProcessSimpleJobErrorReturn,
    isProcessComplexJobSuccessReturn,
    isProcessComplexJobErrorReturn,
    isProcessRenderJobSuccessReturn,
    isProcessRenderJobErrorReturn,
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
    InputRuleTypes,
    RelevanceRule,
    OutputRule,
    DialecticStageRecipeStep,
    SystemMaterials,
    HeaderContextArtifact,
    ContextForDocument,
    RenderedDocumentArtifact,
    AssembledJsonArtifact,
    EditedDocumentResource,
    DialecticPlanJobPayload,
    DialecticSkeletonJobPayload,
    DialecticRenderJobPayload,
    SelectAnchorResult,
    SourceDocument,
    HeaderContext,
    GitHubRepoSettings,
    SyncMapEntry,
    SyncToGitHubPayload,
    SyncToGitHubResponse,
} from '../../../dialectic-service/dialectic.interface.ts';
import { DialecticStageSlug, FileType } from '../../types/file_manager.types.ts';
import { ContinueReason, FinishReason } from '../../types.ts';
import { buildDialecticCompressJobPayload } from '../../../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.mock.ts';
import { isDialecticCompressJobPayload } from '../../../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.guard.ts';
import {
    buildGitHubRepoSettings,
    invalidateGitHubRepoSettings,
    buildDialecticStageRecipeStep,
    invalidateDialecticStageRecipeStep,
    buildDialecticContributionRow,
    invalidateDialecticContributionRow,
    buildDialecticExecuteJobPayload,
    invalidateDialecticExecuteJobPayload,
    buildDialecticBaseJobPayload,
    invalidateDialecticBaseJobPayload,
    buildDialecticJobRow,
    invalidateDialecticJobRow,
    buildDialecticPlanJobPayload,
    invalidateDialecticPlanJobPayload,
    buildDialecticSkeletonJobPayload,
    invalidateDialecticSkeletonJobPayload,
    buildFailedAttemptError,
    invalidateFailedAttemptError,
    buildStageWithRecipeSteps,
    invalidateStageWithRecipeSteps,
    buildDatabaseRecipeSteps,
    invalidateDatabaseRecipeSteps,
    buildHeaderContext,
    invalidateHeaderContext,
    buildInputRule,
    invalidateInputRule,
    buildRelevanceRule,
    invalidateRelevanceRule,
    buildOutputRule,
    invalidateOutputRule,
    buildSystemMaterials,
    invalidateSystemMaterials,
    buildHeaderContextArtifact,
    invalidateHeaderContextArtifact,
    buildContextForDocument,
    invalidateContextForDocument,
    buildReviewMetadata,
    buildAssembledJsonArtifact,
    invalidateAssembledJsonArtifact,
    buildRenderedDocumentArtifact,
    invalidateRenderedDocumentArtifact,
    buildEditedDocumentResource,
    invalidateEditedDocumentResource,
    buildDialecticProjectResourceRow,
    invalidateDialecticProjectResourceRow,
    buildDialecticRenderJobPayload,
    invalidateDialecticRenderJobPayload,
    buildSourceDocument,
    invalidateSourceDocument,
    buildSelectAnchorResultNoAnchorRequired,
    buildSelectAnchorResultDeriveFromHeaderContext,
    buildSelectAnchorResultAnchorFound,
    buildSelectAnchorResultAnchorNotFound,
    buildSyncMapEntry,
    buildSyncToGitHubPayload,
    buildSyncToGitHubResponse,
    buildUnifiedAIResponseTokenUsage,
    invalidateUnifiedAIResponseTokenUsage,
    buildUnifiedAIResponse,
    invalidateUnifiedAIResponse,
    buildPromptConstructionPayload,
    invalidatePromptConstructionPayload,
    buildProcessSimpleJobParams,
    invalidateProcessSimpleJobParams,
    buildProcessComplexJobParams,
    invalidateProcessComplexJobParams,
    buildProcessRenderJobParams,
    invalidateProcessRenderJobParams,
    buildProcessSimpleJobPayload,
    invalidateProcessSimpleJobPayload,
    buildProcessComplexJobPayload,
    invalidateProcessComplexJobPayload,
    buildProcessRenderJobPayload,
    invalidateProcessRenderJobPayload,
    buildProcessSimpleJobDispatchedReturn,
    invalidateProcessSimpleJobDispatchedReturn,
    buildProcessSimpleJobDeferredReturn,
    invalidateProcessSimpleJobDeferredReturn,
    buildProcessSimpleJobErrorReturn,
    invalidateProcessSimpleJobErrorReturn,
    buildProcessComplexJobSuccessReturn,
    invalidateProcessComplexJobSuccessReturn,
    buildProcessComplexJobErrorReturn,
    invalidateProcessComplexJobErrorReturn,
    buildProcessRenderJobSuccessReturn,
    invalidateProcessRenderJobSuccessReturn,
    buildProcessRenderJobErrorReturn,
    invalidateProcessRenderJobErrorReturn,
} from '../../dialectic.mock.ts';

Deno.test('Type Guard: isGitHubRepoSettings', async (t) => {
    await t.step('returns true for valid GitHubRepoSettings', () => {
        assert(isGitHubRepoSettings(buildGitHubRepoSettings()));
    });
    await t.step('returns true when last_sync_at is string', () => {
        assert(isGitHubRepoSettings(buildGitHubRepoSettings({ last_sync_at: '2025-01-01T00:00:00Z' })));
    });
    await t.step('returns false for null', () => {
        assert(!isGitHubRepoSettings(null));
    });
    await t.step('returns false for non-object', () => {
        assert(!isGitHubRepoSettings('string'));
    });
    await t.step('returns false when provider is not "github"', () => {
        assert(!isGitHubRepoSettings(invalidateGitHubRepoSettings({ provider: 'gitlab' })));
    });
    await t.step('returns false when owner is not string', () => {
        assert(!isGitHubRepoSettings(invalidateGitHubRepoSettings({ owner: 1 })));
    });
    await t.step('returns false when last_sync_at is not string or null', () => {
        assert(!isGitHubRepoSettings(invalidateGitHubRepoSettings({ last_sync_at: 123 })));
    });
});

Deno.test('Type Guard: isDialecticProjectUpdate', async (t) => {
    await t.step('returns true for empty object', () => {
        assert(isDialecticProjectUpdate({}));
    });
    await t.step('returns true for object with repo_url null', () => {
        assert(isDialecticProjectUpdate({ repo_url: null }));
    });
    await t.step('returns true for object with repo_url as record', () => {
        assert(isDialecticProjectUpdate({ repo_url: { last_sync_at: '2025-01-01T00:00:00Z' } }));
    });
    await t.step('returns false for null', () => {
        assert(!isDialecticProjectUpdate(null));
    });
    await t.step('returns false for non-object', () => {
        assert(!isDialecticProjectUpdate('string'));
    });
    await t.step('returns false when repo_url is present and not null and not a record', () => {
        assert(!isDialecticProjectUpdate({ repo_url: 'not-an-object' }));
    });
});

Deno.test('Type Guard: isRepoUrlWithLastSyncAt', async (t) => {
    await t.step('returns true for object with last_sync_at string', () => {
        assert(isRepoUrlWithLastSyncAt({ last_sync_at: '2025-01-01T00:00:00Z' }));
    });
    await t.step('returns false for null', () => {
        assert(!isRepoUrlWithLastSyncAt(null));
    });
    await t.step('returns false for non-object', () => {
        assert(!isRepoUrlWithLastSyncAt('string'));
    });
    await t.step('returns false when last_sync_at is missing', () => {
        assert(!isRepoUrlWithLastSyncAt({}));
    });
    await t.step('returns false when last_sync_at is not string', () => {
        assert(!isRepoUrlWithLastSyncAt({ last_sync_at: 123 }));
    });
});

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
        assert(hasProcessingStrategy(buildDialecticStageRecipeStep({ job_type: 'PLAN' })));
    });

    await t.step('should return false if the recipe step has an invalid job_type', () => {
        assert(!hasProcessingStrategy(invalidateDialecticStageRecipeStep({ job_type: 'INVALID_JOB_TYPE' })));
    });

    await t.step('should return false if job_type is not a valid enum value', () => {
        assert(!hasProcessingStrategy(invalidateDialecticStageRecipeStep({ job_type: 'INVALID_JOB_TYPE' })));
    });

    await t.step('should return false if job_type is missing', () => {
        const { job_type: _omit, ...rest } = buildDialecticStageRecipeStep()!;
        assert(!hasProcessingStrategy(rest));
    });

    await t.step('should return false for a non-object', () => {
        assert(!hasProcessingStrategy(null));
        assert(!hasProcessingStrategy('a string'));
    });

    await t.step('should return false if the recipe step is missing job_type', () => {
        const { job_type: _omit, ...rest } = buildDialecticStageRecipeStep()!;
        assert(!hasProcessingStrategy(rest));
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
        assert(isDialecticContribution(buildDialecticContributionRow()));
    });

    await t.step('should return true for a contribution with valid document_relationships', () => {
        assert(isDialecticContribution(buildDialecticContributionRow({ document_relationships: { thesis: 'thesis-id-123' } })));
    });

    await t.step('should return true for a contribution with a null model_id', () => {
        assert(isDialecticContribution(buildDialecticContributionRow({
            model_id: null,
            model_name: null,
            processing_time_ms: null,
            tokens_used_input: null,
            tokens_used_output: null,
            contribution_type: 'user_feedback',
            is_header: true,
            source_prompt_resource_id: null,
        })));
    });

    await t.step('should return false for an object missing a required field (is_header)', () => {
        const { is_header: _omit, ...rest } = buildDialecticContributionRow();
        assert(!isDialecticContribution(rest));
    });

    await t.step('should return false for an object with incorrect type (iteration_number)', () => {
        assert(!isDialecticContribution(invalidateDialecticContributionRow({ iteration_number: 'one' })));
    });

    await t.step('should return false for a plain object', () => {
        assert(!isDialecticContribution({ foo: 'bar' }));
    });

    await t.step('should return false for null', () => {
        assert(!isDialecticContribution(null));
    });
});

Deno.test('Type Guard: isDialecticBaseJobPayload', async (t) => {
    await t.step('should return true for a full base payload and not throw', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });

    // Required members — absent
    await t.step('should throw if sessionId is missing', () => {
        const { sessionId: _omit, ...rest } = buildDialecticBaseJobPayload();
        assertThrows(() => isDialecticBaseJobPayload(rest), Error, 'Missing or invalid sessionId.');
    });
    await t.step('should throw if projectId is missing', () => {
        const { projectId: _omit, ...rest } = buildDialecticBaseJobPayload();
        assertThrows(() => isDialecticBaseJobPayload(rest), Error, 'Missing or invalid projectId.');
    });
    await t.step('should throw if model_id is missing', () => {
        const { model_id: _omit, ...rest } = buildDialecticBaseJobPayload();
        assertThrows(() => isDialecticBaseJobPayload(rest), Error, 'Missing or invalid model_id.');
    });
    await t.step('should throw if walletId is missing', () => {
        const { walletId: _omit, ...rest } = buildDialecticBaseJobPayload();
        assertThrows(() => isDialecticBaseJobPayload(rest), Error, 'Missing or invalid walletId.');
    });
    await t.step('should throw if user_jwt is missing', () => {
        const { user_jwt: _omit, ...rest } = buildDialecticBaseJobPayload();
        assertThrows(() => isDialecticBaseJobPayload(rest), Error, 'Missing or invalid user_jwt.');
    });
    await t.step('should throw if idempotencyKey is missing', () => {
        const { idempotencyKey: _omit, ...rest } = buildDialecticBaseJobPayload();
        assertThrows(() => isDialecticBaseJobPayload(rest), Error, 'Missing or invalid idempotencyKey.');
    });

    // Required members — present but wrong-typed
    await t.step('should throw if sessionId is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ sessionId: 123 })), Error, 'Missing or invalid sessionId.');
    });
    await t.step('should throw if projectId is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ projectId: 123 })), Error, 'Missing or invalid projectId.');
    });
    await t.step('should throw if model_id is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ model_id: 123 })), Error, 'Missing or invalid model_id.');
    });
    await t.step('should throw if walletId is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ walletId: 123 })), Error, 'Missing or invalid walletId.');
    });
    await t.step('should throw if user_jwt is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ user_jwt: 123 })), Error, 'Missing or invalid user_jwt.');
    });
    await t.step('should throw if user_jwt is empty string', () => {
        assertThrows(() => isDialecticBaseJobPayload(buildDialecticBaseJobPayload({ user_jwt: '' })), Error, 'Missing or invalid user_jwt.');
    });
    await t.step('should throw if idempotencyKey is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ idempotencyKey: 123 })), Error, 'Missing or invalid idempotencyKey.');
    });

    // Optional members — present and wrong-typed
    await t.step('should throw if stageSlug is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ stageSlug: 123 })), Error, 'Invalid stageSlug.');
    });
    await t.step('should throw if iterationNumber is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ iterationNumber: '1' })), Error, 'Invalid iterationNumber.');
    });
    await t.step('should throw if continueUntilComplete is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ continueUntilComplete: 'yes' })), Error, 'Invalid continueUntilComplete.');
    });
    await t.step('should throw if maxRetries is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ maxRetries: '3' })), Error, 'Invalid maxRetries.');
    });
    await t.step('should throw if continuation_count is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ continuation_count: '1' })), Error, 'Invalid continuation_count.');
    });
    await t.step('should throw if target_contribution_id is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ target_contribution_id: 123 })), Error, 'Invalid target_contribution_id.');
    });
    await t.step('should throw if is_test_job is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ is_test_job: 'yes' })), Error, 'Invalid is_test_job.');
    });
    await t.step('should throw if model_slug is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ model_slug: 123 })), Error, 'Invalid model_slug.');
    });
    await t.step('should throw if maxOutputTokens is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ maxOutputTokens: '8192' })), Error, 'Invalid maxOutputTokens.');
    });
    await t.step('should throw if sourceContributionId is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ sourceContributionId: 123 })), Error, 'Invalid sourceContributionId.');
    });
    await t.step('should throw if source_prompt_resource_id is wrong-typed', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ source_prompt_resource_id: 123 })), Error, 'Invalid source_prompt_resource_id.');
    });

    // Optional members — absent (base builder omits them by default)
    await t.step('should pass with stageSlug absent', () => {
        const { stageSlug: _omit, ...rest } = buildDialecticBaseJobPayload();
        assert(isDialecticBaseJobPayload(rest));
    });
    await t.step('should pass with iterationNumber absent', () => {
        const { iterationNumber: _omit, ...rest } = buildDialecticBaseJobPayload();
        assert(isDialecticBaseJobPayload(rest));
    });
    await t.step('should pass with continueUntilComplete absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with maxRetries absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with continuation_count absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with target_contribution_id absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with is_test_job absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with model_slug absent', () => {
        const { model_slug: _omit, ...rest } = buildDialecticBaseJobPayload();
        assert(isDialecticBaseJobPayload(rest));
    });
    await t.step('should pass with maxOutputTokens absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with sourceContributionId absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });
    await t.step('should pass with source_prompt_resource_id absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });

    // source_prompt_resource_id is admitted by the base allowed-key set
    await t.step('should admit source_prompt_resource_id rather than reporting it as unknown', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload({ source_prompt_resource_id: 'resource-1' })));
    });

    // Non-record root
    await t.step('should throw for a non-record root', () => {
        assertThrows(() => isDialecticBaseJobPayload(null), Error, 'Payload must be a non-null object.');
        assertThrows(() => isDialecticBaseJobPayload(undefined), Error, 'Payload must be a non-null object.');
        assertThrows(() => isDialecticBaseJobPayload(42), Error, 'Payload must be a non-null object.');
        assertThrows(() => isDialecticBaseJobPayload('string'), Error, 'Payload must be a non-null object.');
    });

    // preflight_input_tokens — optional member
    /** Contract: isDialecticBaseJobPayload accepts the builder default with preflight_input_tokens absent. */
    await t.step('should accept buildDialecticBaseJobPayload() with preflight_input_tokens absent', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload()));
    });

    /** Contract: isDialecticBaseJobPayload accepts a numeric preflight_input_tokens. */
    await t.step('should accept buildDialecticBaseJobPayload({ preflight_input_tokens: 128 })', () => {
        assert(isDialecticBaseJobPayload(buildDialecticBaseJobPayload({ preflight_input_tokens: 128 })));
    });

    /** Contract: isDialecticBaseJobPayload throws Invalid preflight_input_tokens. when the member is a string. */
    await t.step("should throw Invalid preflight_input_tokens. on invalidateDialecticBaseJobPayload({ preflight_input_tokens: 'x' })", () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ preflight_input_tokens: 'x' })), Error, 'Invalid preflight_input_tokens.');
    });

    /** Contract: isDialecticBaseJobPayload throws Invalid preflight_input_tokens. when the member is null. */
    await t.step('should throw Invalid preflight_input_tokens. on invalidateDialecticBaseJobPayload({ preflight_input_tokens: null })', () => {
        assertThrows(() => isDialecticBaseJobPayload(invalidateDialecticBaseJobPayload({ preflight_input_tokens: null })), Error, 'Invalid preflight_input_tokens.');
    });
});

Deno.test('Type Guard: isDialecticExecuteJobPayload', async (t) => {
    await t.step('should return true for a valid payload and not throw', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload()));
    });

    // Test each optional property individually for valid cases
    await t.step('should pass with a valid optional document_key', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ document_key: FileType.business_case })));
    });
    await t.step('should pass with a null optional document_key', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ document_key: null })));
    });
    await t.step('should pass with a valid optional branch_key', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ branch_key: BranchKey.business_case })));
    });
    await t.step('should pass with a null optional branch_key', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ branch_key: null })));
    });
    await t.step('should pass with a valid optional parallel_group', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ parallel_group: 1 })));
    });
    await t.step('should pass with a null optional parallel_group', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ parallel_group: null })));
    });
    await t.step('should pass with valid optional planner_metadata', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ planner_metadata: { dependencies: ['root'] } })));
    });
    await t.step('should pass with null optional planner_metadata', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ planner_metadata: null })));
    });
    await t.step('should pass with valid optional document_relationships', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ document_relationships: { thesis: 'some-id' } })));
    });
    await t.step('should pass with null optional document_relationships', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ document_relationships: null })));
    });
    await t.step('should pass with a valid optional isIntermediate', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ isIntermediate: true })));
    });
    await t.step('should pass with a valid optional user_jwt', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ user_jwt: 'some-jwt' })));
    });
    await t.step('should pass with a valid optional target_contribution_id', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ target_contribution_id: 'target-id' })));
    });
    await t.step('should pass with a valid optional sourceContributionId from DialecticBaseJobPayload', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ sourceContributionId: 'contrib-1' })));
    });
    await t.step('should pass with a null optional sourceContributionId from DialecticBaseJobPayload', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ sourceContributionId: null })));
    });

    // Base job payload extras should be permitted on execute payloads
    await t.step('should pass when base payload fields are present', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            maxRetries: 3,
            continuation_count: 1,
            model_slug: 'test-model-slug',
        })));
    });
    await t.step('should pass with a valid optional model_slug from DialecticBaseJobPayload', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ model_slug: 'test-model-slug' })));
    });

    // Test inherited properties from DialecticBaseJobPayload
    await t.step('should throw if sessionId is missing', () => {
        const { sessionId: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(() => isDialecticExecuteJobPayload(rest), Error, 'Missing or invalid sessionId.');
    });
    await t.step('should throw if projectId is missing', () => {
        const { projectId: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(() => isDialecticExecuteJobPayload(rest), Error, 'Missing or invalid projectId.');
    });
    await t.step('should throw if model_id is missing', () => {
        const { model_id: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(() => isDialecticExecuteJobPayload(rest), Error, 'Missing or invalid model_id.');
    });
    await t.step('should throw if walletId is missing', () => {
        const { walletId: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(() => isDialecticExecuteJobPayload(rest), Error, 'Missing or invalid walletId.');
    });

    // Test required properties of DialecticExecuteJobPayload
    await t.step('should throw if output_type is missing or invalid', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ output_type: 'invalid-type' })), Error, 'Missing or invalid output_type.');
    });
    await t.step('should throw if canonicalPathParams is missing or invalid', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ canonicalPathParams: {} })), Error, 'Missing or invalid canonicalPathParams.');
    });
    await t.step('should throw if inputs is missing or not a record', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ inputs: 'invalid' })), Error, 'Missing or invalid inputs.');
    });
    await t.step('should throw if prompt_template_id is missing', () => {
        const { prompt_template_id: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(() => isDialecticExecuteJobPayload(rest), Error, 'Missing or invalid prompt_template_id.');
    });
    await t.step('should throw if prompt_template_id is null', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ prompt_template_id: null })), Error, 'Missing or invalid prompt_template_id.');
    });
    await t.step('should throw if prompt_template_id is undefined', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ prompt_template_id: undefined })), Error, 'Missing or invalid prompt_template_id.');
    });
    await t.step('should throw if prompt_template_id is empty string', () => {
        assertThrows(() => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ prompt_template_id: '' })), Error, 'Missing or invalid prompt_template_id.');
    });

    // Test optional/nullable properties of DialecticExecuteJobPayload
    await t.step('should throw if prompt_template_name is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ prompt_template_name: 123 })), Error, 'Invalid prompt_template_name.');
    });
    await t.step('should throw if document_key is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ document_key: 123 })), Error, 'Invalid document_key.');
    });
    await t.step('should throw if branch_key is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ branch_key: 123 })), Error, 'Invalid branch_key.');
    });
    await t.step('should throw if parallel_group is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ parallel_group: 'invalid' })), Error, 'Invalid parallel_group.');
    });
    await t.step('should throw if planner_metadata is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ planner_metadata: 'invalid' })), Error, 'Invalid planner_metadata.');
    });
    await t.step('should throw if document_relationships is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ document_relationships: 'invalid' })), Error, 'Invalid document_relationships.');
    });
    await t.step('should throw if isIntermediate is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ isIntermediate: 'invalid' })), Error, 'Invalid isIntermediate flag.');
    });
    await t.step('should throw if user_jwt is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ user_jwt: 123 })), Error, 'Missing or invalid user_jwt.');
    });

    // Test optional inherited properties
    await t.step('should throw if stageSlug is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ stageSlug: 123 })), Error, 'Invalid stageSlug.');
    });
    await t.step('should throw if iterationNumber is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ iterationNumber: '1' })), Error, 'Invalid iterationNumber.');
    });
    await t.step('should throw if target_contribution_id is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ target_contribution_id: 123 })), Error, 'Invalid target_contribution_id.');
    });
    await t.step('should throw if model_slug is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ model_slug: 123 })), Error, 'Invalid model_slug.');
    });
    await t.step('should pass with a valid optional prompt_template_name', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ prompt_template_name: 'test-template-name' })));
    });
    await t.step('should pass with a valid optional context_for_documents array', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: { section: '' },
            }],
        })));
    });
    await t.step('should pass with a null optional context_for_documents', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ context_for_documents: null })));
    });
    await t.step('should throw if context_for_documents is of wrong type', () => {
        assertThrows(() => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ context_for_documents: 'invalid' })), Error);
    });

    // Test legacy property
    await t.step('should throw for legacy originalFileName property', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload({ ...buildDialecticExecuteJobPayload(), originalFileName: 'legacy.txt' }),
            Error,
            'Legacy property originalFileName is not allowed.'
        );
    });

    await t.step('should throw for an unknown/extraneous property', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload({ ...buildDialecticExecuteJobPayload(), step_info: 'some-orchestrator-context' }),
            Error,
            'Payload contains unknown properties: step_info'
        );
    });

    await t.step('should throw error when user_jwt is missing from execute job payload', () => {
        const { user_jwt: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(
            () => isDialecticExecuteJobPayload(rest),
            Error,
            'Missing or invalid user_jwt.'
        );
    });

    await t.step('should throw error when user_jwt is empty string in execute job payload', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ user_jwt: '' })),
            Error,
            'Missing or invalid user_jwt.'
        );
    });

    await t.step('should pass with a valid optional maxOutputTokens from GenerateContributionsPayload', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ maxOutputTokens: 8192 })));
    });

    await t.step('should throw when maxOutputTokens is a string', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ maxOutputTokens: 'string' })),
            Error,
            'Invalid maxOutputTokens.',
        );
    });

    // prompt_template_name optionality
    await t.step('should pass with a valid optional prompt_template_name', () => {
        const p = buildDialecticExecuteJobPayload({ prompt_template_name: 'thesis_business_case' });
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with prompt_template_name absent', () => {
        const p = buildDialecticExecuteJobPayload();
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should throw if prompt_template_name is a number', () => {
        const p = invalidateDialecticExecuteJobPayload({ prompt_template_name: 123 });
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid prompt_template_name.');
    });
    await t.step('should throw if prompt_template_name is null', () => {
        const p = invalidateDialecticExecuteJobPayload({ prompt_template_name: null });
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid prompt_template_name.');
    });

    // is_test_job optionality
    await t.step('should pass with is_test_job true', () => {
        const p = buildDialecticExecuteJobPayload({ is_test_job: true });
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with is_test_job false', () => {
        const p = buildDialecticExecuteJobPayload({ is_test_job: false });
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should pass with is_test_job absent', () => {
        const p = buildDialecticExecuteJobPayload();
        assert(isDialecticExecuteJobPayload(p));
    });
    await t.step('should throw if is_test_job is a string', () => {
        const p = invalidateDialecticExecuteJobPayload({ is_test_job: 'yes' });
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid is_test_job.');
    });
    await t.step('should throw if is_test_job is a number', () => {
        const p = invalidateDialecticExecuteJobPayload({ is_test_job: 1 });
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid is_test_job.');
    });
    await t.step('should throw if is_test_job is null', () => {
        const p = invalidateDialecticExecuteJobPayload({ is_test_job: null });
        assertThrows(() => isDialecticExecuteJobPayload(p), Error, 'Invalid is_test_job.');
    });

    /** Contract: isDialecticExecuteJobPayload admits preflight_input_tokens via the base allowed-key set. */
    await t.step('should accept buildDialecticExecuteJobPayload({ preflight_input_tokens: 128 })', () => {
        assert(isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ preflight_input_tokens: 128 })));
    });

    // ── Required-member checklist (stageSlug and iterationNumber narrowed from optional) ──

    /** Contract: isDialecticExecuteJobPayload rejects an empty-string sessionId. */
    await t.step('should throw when sessionId is an empty string', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ sessionId: '' })),
            Error,
            'Missing or invalid sessionId.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects an empty-string projectId. */
    await t.step('should throw when projectId is an empty string', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ projectId: '' })),
            Error,
            'Missing or invalid projectId.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects an empty-string model_id. */
    await t.step('should throw when model_id is an empty string', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ model_id: '' })),
            Error,
            'Missing or invalid model_id.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects an empty-string walletId. */
    await t.step('should throw when walletId is an empty string', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ walletId: '' })),
            Error,
            'Missing or invalid walletId.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects an absent stageSlug. */
    await t.step('should throw when stageSlug is absent', () => {
        const { stageSlug: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(
            () => isDialecticExecuteJobPayload(rest),
            Error,
            'Missing or invalid stageSlug.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects a non-DialecticStageSlug string for stageSlug. */
    await t.step('should throw when stageSlug is a non-slug string', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(invalidateDialecticExecuteJobPayload({ stageSlug: 'not-a-slug' })),
            Error,
            'Invalid stageSlug.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects an absent iterationNumber. */
    await t.step('should throw when iterationNumber is absent', () => {
        const { iterationNumber: _omit, ...rest } = buildDialecticExecuteJobPayload();
        assertThrows(
            () => isDialecticExecuteJobPayload(rest),
            Error,
            'Missing or invalid iterationNumber.',
        );
    });

    /** Contract: isDialecticExecuteJobPayload rejects a zero iterationNumber. */
    await t.step('should throw when iterationNumber is zero', () => {
        assertThrows(
            () => isDialecticExecuteJobPayload(buildDialecticExecuteJobPayload({ iterationNumber: 0 })),
            Error,
            'Invalid iterationNumber.',
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
            model_slug: 'test-model-slug',
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
            model_slug: 'test-model-slug',
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

    await t.step('should return true for a valid job payload with selectedModels', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModels: [{ id: 'model-1', displayName: 'Model One' }, { id: 'model-2', displayName: 'Model Two' }],
        };
        assert(isDialecticJobPayload(payload));
    });

    await t.step('should return false when selectedModels is not an array of SelectedModels', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModels: [{ id: 'model-1', displayName: 'Model One' }, { id: 'model-2', displayName: 123 }],
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

    await t.step('should return false when both model_id and selectedModels are missing', () => {
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

    await t.step('should return true when maxOutputTokens is present on payload', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
            stageSlug: 'thesis',
            iterationNumber: 1,
            maxOutputTokens: 8192,
        };
        assert(isDialecticJobPayload(payload));
    });

    await t.step('returns true for a payload built by buildDialecticCompressJobPayload', () => {
        assert(isDialecticJobPayload(buildDialecticCompressJobPayload()));
    });
});

Deno.test('Type Guard: isDialecticJobRow', async (t) => {
    await t.step('should return true for a valid job row object', () => {
        assert(isDialecticJobRow(buildDialecticJobRow()));
    });

    await t.step('should return false if a required field is missing (e.g., created_at)', () => {
        const { created_at: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    await t.step('should return false if a required field is missing (e.g., status)', () => {
        const { status: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    await t.step('should return false if job_type is missing', () => {
        const { job_type: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    await t.step('should return false if is_test_job is missing', () => {
        const { is_test_job: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    await t.step('should return false if payload is not an object', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ payload: 'a string' })));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isDialecticJobRow(null));
        assert(!isDialecticJobRow('job'));
    });

    // ── Full column checklist: one corrupted case per column ──

    /** Contract: isDialecticJobRow rejects a non-string id. */
    await t.step('should return false when id is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ id: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string session_id. */
    await t.step('should return false when session_id is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ session_id: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string user_id. */
    await t.step('should return false when user_id is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ user_id: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string stage_slug. */
    await t.step('should return false when stage_slug is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ stage_slug: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string status. */
    await t.step('should return false when status is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ status: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-number attempt_count. */
    await t.step('should return false when attempt_count is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ attempt_count: 'zero' })));
    });

    /** Contract: isDialecticJobRow rejects a non-number max_retries. */
    await t.step('should return false when max_retries is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ max_retries: 'three' })));
    });

    /** Contract: isDialecticJobRow rejects a non-number iteration_number. */
    await t.step('should return false when iteration_number is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ iteration_number: 'one' })));
    });

    /** Contract: isDialecticJobRow rejects a non-string created_at. */
    await t.step('should return false when created_at is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ created_at: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-boolean is_test_job. */
    await t.step('should return false when is_test_job is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ is_test_job: 'yes' })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null job_type. */
    await t.step('should return false when job_type is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ job_type: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null parent_job_id. */
    await t.step('should return false when parent_job_id is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ parent_job_id: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null prerequisite_job_id. */
    await t.step('should return false when prerequisite_job_id is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ prerequisite_job_id: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null target_contribution_id. */
    await t.step('should return false when target_contribution_id is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ target_contribution_id: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null idempotency_key. */
    await t.step('should return false when idempotency_key is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ idempotency_key: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null started_at. */
    await t.step('should return false when started_at is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ started_at: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-string, non-null completed_at. */
    await t.step('should return false when completed_at is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ completed_at: 123 })));
    });

    /** Contract: isDialecticJobRow rejects a non-object, non-null error_details. */
    await t.step('should return false when error_details is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ error_details: 'string' })));
    });

    /** Contract: isDialecticJobRow rejects a non-object, non-null results. */
    await t.step('should return false when results is corrupted', () => {
        assert(!isDialecticJobRow(invalidateDialecticJobRow({ results: 'string' })));
    });

    // ── Full column checklist: one omitted case per required column ──

    /** Contract: isDialecticJobRow rejects an absent id. */
    await t.step('should return false when id is omitted', () => {
        const { id: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent session_id. */
    await t.step('should return false when session_id is omitted', () => {
        const { session_id: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent user_id. */
    await t.step('should return false when user_id is omitted', () => {
        const { user_id: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent stage_slug. */
    await t.step('should return false when stage_slug is omitted', () => {
        const { stage_slug: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent iteration_number. */
    await t.step('should return false when iteration_number is omitted', () => {
        const { iteration_number: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent attempt_count. */
    await t.step('should return false when attempt_count is omitted', () => {
        const { attempt_count: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent max_retries. */
    await t.step('should return false when max_retries is omitted', () => {
        const { max_retries: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    /** Contract: isDialecticJobRow rejects an absent payload. */
    await t.step('should return false when payload is omitted', () => {
        const { payload: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRow(rest));
    });

    // ── Nullable columns accept null ──

    /** Contract: isDialecticJobRow accepts null for every nullable column. */
    await t.step('should return true when all nullable columns are null', () => {
        assert(isDialecticJobRow(buildDialecticJobRow({
            job_type: null,
            parent_job_id: null,
            prerequisite_job_id: null,
            target_contribution_id: null,
            idempotency_key: null,
            started_at: null,
            completed_at: null,
            error_details: null,
            results: null,
        })));
    });
});

Deno.test('Type Guard: isDialecticJobRowArray', async (t) => {
    await t.step('should return true for valid array of DialecticJobRow objects', () => {
        assert(isDialecticJobRowArray([
            buildDialecticJobRow(),
            buildDialecticJobRow({ id: 'job-2', status: 'completed', job_type: 'EXECUTE' }),
        ]));
    });

    await t.step('should return true for empty array', () => {
        assert(isDialecticJobRowArray([]));
    });

    await t.step('should return true for array with single valid job', () => {
        assert(isDialecticJobRowArray([buildDialecticJobRow()]));
    });

    await t.step('should return false when array contains object missing required field (id)', () => {
        const { id: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRowArray([rest]));
    });

    await t.step('should return false when array contains object missing required field (session_id)', () => {
        const { session_id: _omit, ...rest } = buildDialecticJobRow();
        assert(!isDialecticJobRowArray([rest]));
    });

    await t.step('should return false when array contains null', () => {
        assert(!isDialecticJobRowArray([buildDialecticJobRow(), null]));
    });

    await t.step('should return false when array contains non-object', () => {
        assert(!isDialecticJobRowArray([buildDialecticJobRow(), 'not an object']));
    });

    await t.step('should return false for non-array input', () => {
        assert(!isDialecticJobRowArray('not an array'));
        assert(!isDialecticJobRowArray(123));
        assert(!isDialecticJobRowArray(null));
        assert(!isDialecticJobRowArray({}));
    });

    await t.step('should return false when array contains objects without both id and session_id', () => {
        const { session_id: _omit1, ...rest1 } = buildDialecticJobRow();
        const { id: _omit2, ...rest2 } = buildDialecticJobRow();
        assert(!isDialecticJobRowArray([rest1, rest2]));
    });
});

Deno.test('Type Guard: isDialecticPlanJobPayload', async (t) => {
    await t.step('should return true for a valid plan job payload', () => {
        assert(isDialecticPlanJobPayload(buildDialecticPlanJobPayload({
            continueUntilComplete: true,
            maxRetries: 3,
            continuation_count: 1,
            target_contribution_id: 'target-id',
            is_test_job: false,
            model_slug: 'test-model-slug',
            sourceContributionId: 'source-id',
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: { field1: 'value1' },
            }],
        })));
    });
    await t.step('should return false when planner_metadata is present on plan job payload', () => {
        assert(!isDialecticPlanJobPayload({ ...buildDialecticPlanJobPayload(), planner_metadata: { recipe_step_id: 'step-123' } }));
    });
    await t.step('should return true for a valid plan job payload with base payload fields including model_slug', () => {
        assert(isDialecticPlanJobPayload(buildDialecticPlanJobPayload({
            model_slug: 'test-model-slug',
            continueUntilComplete: true,
            maxRetries: 3,
            continuation_count: 1,
            target_contribution_id: 'target-id',
            is_test_job: false,
            sourceContributionId: 'source-id',
        })));
    });

    await t.step('should return false for non-object payloads', () => {
        assert(!isDialecticPlanJobPayload(null));
        assert(!isDialecticPlanJobPayload("a string"));
        assert(!isDialecticPlanJobPayload(123));
    });

    await t.step('should return false when user_jwt is missing from plan job payload', () => {
        const { user_jwt: _omit, ...rest } = buildDialecticPlanJobPayload();
        assert(!isDialecticPlanJobPayload(rest));
    });

    await t.step('should return false when user_jwt is empty string in plan job payload', () => {
        assert(!isDialecticPlanJobPayload(buildDialecticPlanJobPayload({ user_jwt: '' })));
    });

    await t.step('should return true when maxOutputTokens is present on plan job payload', () => {
        assert(isDialecticPlanJobPayload(buildDialecticPlanJobPayload({ maxOutputTokens: 8192 })));
    });

    await t.step('should return false when maxOutputTokens is not a number on plan job payload', () => {
        assert(!isDialecticPlanJobPayload(invalidateDialecticPlanJobPayload({ maxOutputTokens: 'not a number' })));
    });

    await t.step('should return true when document_relationships is null on plan job payload', () => {
        assert(isDialecticPlanJobPayload(buildDialecticPlanJobPayload({ document_relationships: null })));
    });

    await t.step('should return true when document_relationships is a valid DocumentRelationships on plan job payload', () => {
        assert(isDialecticPlanJobPayload(buildDialecticPlanJobPayload({ document_relationships: { thesis: 'thesis-id-123' } })));
    });

    await t.step('should return false when document_relationships is a string on plan job payload', () => {
        assert(!isDialecticPlanJobPayload(invalidateDialecticPlanJobPayload({ document_relationships: 'invalid' })));
    });

    await t.step('should return false when an extraneous property is present on plan job payload', () => {
        assert(!isDialecticPlanJobPayload({ ...buildDialecticPlanJobPayload(), step_info: { recipe_step_id: 'orchestrator-step-id' } }));
    });
});

Deno.test('Type Guard: isDialecticSkeletonJobPayload', async (t) => {
    await t.step('should return true when step_info is present and planner_metadata.recipe_step_id is a non-empty string', () => {
        assert(isDialecticSkeletonJobPayload(buildDialecticSkeletonJobPayload({
            planner_metadata: { recipe_step_id: 'step-123', recipe_template_id: 'template-1' },
            step_info: { current_step: 1, total_steps: 1 },
        })));
    });

    await t.step('should return false when step_info is missing', () => {
        const { step_info: _omit, ...rest } = buildDialecticSkeletonJobPayload();
        assert(!isDialecticSkeletonJobPayload(rest));
    });

    await t.step('should return false when planner_metadata.recipe_step_id is an empty string', () => {
        assert(!isDialecticSkeletonJobPayload(buildDialecticSkeletonJobPayload({
            planner_metadata: { recipe_step_id: '', recipe_template_id: 'template-1' },
        })));
    });

    await t.step('should return true when maxOutputTokens is present on skeleton job payload', () => {
        assert(isDialecticSkeletonJobPayload(buildDialecticSkeletonJobPayload({ maxOutputTokens: 8192 })));
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
        assert(isFailedAttemptError(buildFailedAttemptError()));
    });

    await t.step('should return false if error property is missing', () => {
        const { error: _omit, ...rest } = buildFailedAttemptError();
        assert(!isFailedAttemptError(rest));
    });

    await t.step('should return false if modelId property is missing', () => {
        const { modelId: _omit, ...rest } = buildFailedAttemptError();
        assert(!isFailedAttemptError(rest));
    });

    await t.step('should return false if api_identifier property is missing', () => {
        const { api_identifier: _omit, ...rest } = buildFailedAttemptError();
        assert(!isFailedAttemptError(rest));
    });

    await t.step('should return false if a property has the wrong type', () => {
        assert(!isFailedAttemptError(invalidateFailedAttemptError({ modelId: 123 })));
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
        assert(isFailedAttemptErrorArray([
            buildFailedAttemptError(),
            buildFailedAttemptError({ error: 'Error 2', modelId: 'model-2', api_identifier: 'api-2' }),
        ]));
    });

    await t.step('should return true for an empty array', () => {
        assert(isFailedAttemptErrorArray([]));
    });

    await t.step('should return false if the array contains an invalid object', () => {
        const { error: _omit, ...rest } = buildFailedAttemptError();
        assert(!isFailedAttemptErrorArray([buildFailedAttemptError(), rest]));
    });

    await t.step('should return false if the array contains non-objects', () => {
        assert(!isFailedAttemptErrorArray([buildFailedAttemptError(), null]));
    });

    await t.step('should return false for a non-array input', () => {
        assert(!isFailedAttemptErrorArray(buildFailedAttemptError()));
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

Deno.test('Type Guard: isStageWithRecipeSteps', async (t) => {
    await t.step('should return true for a valid StageWithRecipeSteps object', () => {
        assert(isStageWithRecipeSteps(buildStageWithRecipeSteps()));
    });

    await t.step('should return false if dialectic_stage is missing', () => {
        const { dialectic_stage: _omit, ...rest } = buildStageWithRecipeSteps();
        assert(!isStageWithRecipeSteps(rest));
    });

    await t.step('should return false if dialectic_stage_recipe_instances is not an object', () => {
        assert(!isStageWithRecipeSteps(invalidateStageWithRecipeSteps({ dialectic_stage_recipe_instances: [] })));
    });

    await t.step('should return false if dialectic_stage_recipe_steps is not an array', () => {
        assert(!isStageWithRecipeSteps(invalidateStageWithRecipeSteps({ dialectic_stage_recipe_steps: {} })));
    });
});

Deno.test('Type Guard: isDatabaseRecipeSteps', async (t) => {
    await t.step('should return true for a valid DatabaseRecipeSteps object', () => {
        assert(isDatabaseRecipeSteps(buildDatabaseRecipeSteps()));
    });

    await t.step('should return false if dialectic_stage_recipe_instances is not an array', () => {
        assert(!isDatabaseRecipeSteps(invalidateDatabaseRecipeSteps({ dialectic_stage_recipe_instances: {} })));
    });

    await t.step('should return false if a nested instance is missing dialectic_stage_recipe_steps', () => {
        const built = buildDatabaseRecipeSteps();
        const instance = built.dialectic_stage_recipe_instances[0];
        const { dialectic_stage_recipe_steps: _omit, ...restInstance } = instance;
        assert(!isDatabaseRecipeSteps({
            ...built,
            dialectic_stage_recipe_instances: [restInstance],
        }));
    });

    await t.step('should return false if nested dialectic_stage_recipe_steps is not an array', () => {
        const built = buildDatabaseRecipeSteps();
        assert(!isDatabaseRecipeSteps({
            ...built,
            dialectic_stage_recipe_instances: [
                { ...built.dialectic_stage_recipe_instances[0], dialectic_stage_recipe_steps: {} },
            ],
        }));
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
                sessionId: 's1',
                projectId: 'p1',
                model_id: 'm1',
                walletId: 'w1',
                user_jwt: 'jwt',
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
                sessionId: 's1',
                projectId: 'p1',
                model_id: 'm1',
                walletId: 'w1',
                user_jwt: 'jwt',
            },
            job_type: 'PLAN',
            is_test_job: undefined,
        };
        assert(isPlanJobInsert(insert));
    });

    await t.step('should return false if payload has extraneous job_type property', () => {
        const insert = {
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {
                sessionId: 's1',
                projectId: 'p1',
                model_id: 'm1',
                walletId: 'w1',
                user_jwt: 'jwt',
                job_type: 'PLAN', // Extraneous
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
                sessionId: 's1',
                projectId: 'p1',
                model_id: 'm1',
                walletId: 'w1',
                user_jwt: 'jwt',
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
        assert('continueUntilComplete' in validated);
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
    await t.step('should return true for a valid header context payload', () => {
        assert(isHeaderContext(buildHeaderContext()));
    });

    await t.step('should return false when system_materials is missing required keys', () => {
        assert(!isHeaderContext(invalidateHeaderContext({
            system_materials: { agent_notes_to_self: 'summary' },
        })));
    });

    await t.step('should return false when context_for_documents contains invalid items', () => {
        assert(!isHeaderContext(invalidateHeaderContext({
            context_for_documents: [{
                document_key: 'not-a-file-type',
                content_to_include: { section: '' },
            }],
        })));
    });

    await t.step('should return false for an object that has files_to_generate property', () => {
        assert(!isHeaderContext({
            ...buildHeaderContext(),
            files_to_generate: [{ template_filename: 'test.md', from_document_key: FileType.business_case }],
        }));
    });

    await t.step('should return false for an object missing system_materials', () => {
        const { system_materials: _omit, ...rest } = buildHeaderContext();
        assert(!isHeaderContext(rest));
    });

    await t.step('should return false for an object missing header_context_artifact', () => {
        const { header_context_artifact: _omit, ...rest } = buildHeaderContext();
        assert(!isHeaderContext(rest));
    });

    await t.step('should return false for an object missing context_for_documents', () => {
        const { context_for_documents: _omit, ...rest } = buildHeaderContext();
        assert(!isHeaderContext(rest));
    });

    await t.step('should return false for an object where context_for_documents is not an array', () => {
        assert(!isHeaderContext(invalidateHeaderContext({ context_for_documents: 'not-an-array' })));
    });

    await t.step('should return false for an object where context_for_documents contains invalid entries (missing document_key)', () => {
        assert(!isHeaderContext(invalidateHeaderContext({
            context_for_documents: [{ content_to_include: { section: '' } }],
        })));
    });

    await t.step('should return false for an object where context_for_documents contains invalid entries (missing content_to_include)', () => {
        assert(!isHeaderContext(invalidateHeaderContext({
            context_for_documents: [{ document_key: FileType.business_case }],
        })));
    });

    await t.step('should return false for an object where context_for_documents contains invalid entries (invalid content_to_include structure - array at top level)', () => {
        assert(!isHeaderContext(invalidateHeaderContext({
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: ['string1', 'string2'],
            }],
        })));
    });

    await t.step('should return true when review_metadata is present and valid', () => {
        assert(isHeaderContext({ ...buildHeaderContext(), review_metadata: buildReviewMetadata() }));
    });

    await t.step('should return true when review_metadata is omitted', () => {
        assert(isHeaderContext(buildHeaderContext()));
    });

    await t.step('should return false when review_metadata is present but invalid (missing proposal_identifier)', () => {
        const { proposal_identifier: _omit, ...restReviewMetadata } = buildReviewMetadata();
        assert(!isHeaderContext({ ...buildHeaderContext(), review_metadata: restReviewMetadata }));
    });

    await t.step('should return false when review_metadata is present but invalid (wrong type)', () => {
        assert(!isHeaderContext(invalidateHeaderContext({ review_metadata: 'not-an-object' })));
    });

    await t.step('should return true when system_materials.progress_update is null', () => {
        assert(isHeaderContext(buildHeaderContext({
            system_materials: { ...buildSystemMaterials(), progress_update: null },
        })));
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
    await t.step('isInputRule: should return true for a valid InputRule object', () => {
        assert(isInputRule(buildInputRule()));
    });

    await t.step('isInputRule: should return true for type "seed_prompt"', () => {
        assert(isInputRule(buildInputRule({ type: 'seed_prompt', slug: 'thesis', document_key: FileType.SeedPrompt })));
    });

    await t.step('isInputRule: should return true for type "header_context"', () => {
        assert(isInputRule(buildInputRule({ type: 'header_context', slug: 'synthesis', document_key: FileType.HeaderContext })));
    });

    await t.step('isInputRule: should return true for type "feedback"', () => {
        assert(isInputRule(buildInputRule({ type: 'feedback', slug: 'antithesis', document_key: FileType.business_case_critique })));
    });

    await t.step('isInputRule: should return true for type "project_resource"', () => {
        assert(isInputRule(buildInputRule({ type: 'project_resource', slug: 'paralysis', document_key: FileType.InitialUserPrompt })));
    });

    await t.step('isInputRule: should return true for type "contribution"', () => {
        assert(isInputRule(buildInputRule({ type: 'contribution', slug: 'antithesis', document_key: FileType.comparison_vector })));
    });

    await t.step('isInputRule: should return true when required is missing (defaults to false)', () => {
        const { required: _omit, ...rest } = buildInputRule();
        assert(isInputRule(rest));
    });

    await t.step('isInputRule: should return false if type is invalid', () => {
        assert(!isInputRule(invalidateInputRule({ type: 'invalid_type' })));
    });

    await t.step('isInputRule: should return false if document_key is an empty string', () => {
        assert(!isInputRule(invalidateInputRule({ document_key: '' })));
    });

    await t.step('isInputRule: should return true for document keys introduced by recipes', () => {
        assert(isInputRule(invalidateInputRule({ document_key: 'synthesis_pairwise_feature_spec' })));
    });

    await t.step('isInputRuleArray: should return true for arrays containing dynamic recipe document keys', () => {
        assert(isInputRuleArray([invalidateInputRule({ document_key: 'synthesis_pairwise_business_case' })]));
    });

    await t.step('isInputRule: should return false if slug is missing', () => {
        const { slug: _omit, ...rest } = buildInputRule();
        assert(!isInputRule(rest));
    });

    await t.step('isInputRule: should return false if slug is not a string', () => {
        assert(!isInputRule(invalidateInputRule({ slug: 123 })));
    });

    await t.step('isInputRule: should return false if required is present but not a boolean', () => {
        assert(!isInputRule(invalidateInputRule({ required: 'true' })));
    });

    await t.step('isInputRule: should return true for a valid InputRule with the optional multiple property', () => {
        assert(isInputRule(buildInputRule({ multiple: true })));
    });

    await t.step('isInputRule: should return false if multiple is present but not a boolean', () => {
        assert(!isInputRule(invalidateInputRule({ multiple: 'yes' })));
    });

    await t.step('isInputRuleArray: should return true for a valid array of InputRule objects', () => {
        assert(isInputRuleArray([
            buildInputRule(),
            buildInputRule({ slug: 'synthesis', document_key: FileType.system_architecture, required: false, multiple: true }),
        ]));
    });

    await t.step('isInputRuleArray: should return true for an empty array', () => {
        assert(isInputRuleArray([]));
    });

    await t.step('isInputRuleArray: should return false for an array with invalid items', () => {
        assert(!isInputRuleArray([buildInputRule(), invalidateInputRule({ document_key: '' })]));
    });
});

Deno.test('Type Guard: isRelevanceRule and isRelevanceRuleArray', async (t) => {
    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object without optional properties', () => {
        assert(isRelevanceRule(buildRelevanceRule()));
    });

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object with a type property', () => {
        assert(isRelevanceRule(buildRelevanceRule({ type: 'document' })));
    });

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object with a slug property', () => {
        assert(isRelevanceRule(buildRelevanceRule({ slug: 'thesis' })));
    });

    await t.step('isRelevanceRule: should return true for a valid RelevanceRule object with all optional properties', () => {
        assert(isRelevanceRule(buildRelevanceRule({ type: 'document', slug: 'thesis' })));
    });

    await t.step('isRelevanceRule: should return false if document_key is an empty string', () => {
        assert(!isRelevanceRule(invalidateRelevanceRule({ document_key: '' })));
    });

    await t.step('isRelevanceRule: should return false if relevance is missing', () => {
        const { relevance: _omit, ...rest } = buildRelevanceRule();
        assert(!isRelevanceRule(rest));
    });

    await t.step('isRelevanceRule: should return false if relevance is not a number', () => {
        assert(!isRelevanceRule(invalidateRelevanceRule({ relevance: 'high' })));
    });

    await t.step('isRelevanceRule: should return true for dynamic document keys emitted by recipes', () => {
        assert(isRelevanceRule(invalidateRelevanceRule({ document_key: 'synthesis_pairwise_feature_spec', relevance: 0.9, slug: 'synthesis' })));
    });

    await t.step('isRelevanceRule: should return false if type is present but not a string', () => {
        assert(!isRelevanceRule(invalidateRelevanceRule({ type: 123 })));
    });

    await t.step('isRelevanceRule: should return false if slug is present but not a string', () => {
        assert(!isRelevanceRule(invalidateRelevanceRule({ slug: 123 })));
    });

    await t.step('isRelevanceRuleArray: should return true for a valid array', () => {
        assert(isRelevanceRuleArray([
            buildRelevanceRule(),
            buildRelevanceRule({ document_key: FileType.system_architecture, type: 'document', relevance: 0.5, slug: 'synthesis' }),
        ]));
    });

    await t.step('isRelevanceRuleArray: should return true for an empty array', () => {
        assert(isRelevanceRuleArray([]));
    });

    await t.step('isRelevanceRuleArray: should return true for arrays containing dynamic recipe document keys', () => {
        assert(isRelevanceRuleArray([invalidateRelevanceRule({ document_key: 'final_business_case', relevance: 1, slug: 'synthesis', type: 'document' })]));
    });

    await t.step('isRelevanceRuleArray: should return false for an array with invalid items', () => {
        assert(!isRelevanceRuleArray([buildRelevanceRule(), invalidateRelevanceRule({ document_key: '', relevance: 0.5 })]));
    });

    await t.step('isRelevanceRule: should return true when optional type is null', () => {
        assert(isRelevanceRule(invalidateRelevanceRule({ type: null })));
    });

    await t.step('isRelevanceRule: should return true when optional slug is null', () => {
        assert(isRelevanceRule(invalidateRelevanceRule({ slug: null })));
    });
});

Deno.test('Type Guard: isOutputRule', async (t) => {
    await t.step('should return true for a valid "PLAN" output rule', () => {
        assert(isOutputRule(buildOutputRule()));
    });

    await t.step('should return true for a valid "PLAN" output rule with files_to_generate', () => {
        assert(isOutputRule(buildOutputRule({
            files_to_generate: [{ from_document_key: FileType.business_case, template_filename: 'business_case_template.md' }],
        })));
    });

    await t.step('should return true for a valid "EXECUTE" output rule', () => {
        assert(isOutputRule(buildOutputRule({
            system_materials: undefined,
            header_context_artifact: undefined,
            context_for_documents: undefined,
            documents: [{
                document_key: FileType.business_case,
                template_filename: 'business_case_template.md',
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                content_to_include: { executive_summary: '' },
            }],
            files_to_generate: [{ from_document_key: FileType.business_case, template_filename: 'business_case_template.md' }],
        })));
    });

    await t.step('should return true for a valid "EXECUTE" output rule with both documents and assembled_json', () => {
        assert(isOutputRule(buildOutputRule({
            system_materials: undefined,
            header_context_artifact: undefined,
            context_for_documents: undefined,
            documents: [{
                document_key: FileType.technical_requirements,
                template_filename: 'parenthesis_technical_requirements.md',
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                content_to_include: { executive_summary: '' },
            }],
            files_to_generate: [{ from_document_key: FileType.technical_requirements, template_filename: 'parenthesis_technical_requirements.md' }],
            assembled_json: [buildAssembledJsonArtifact()],
        })));
    });

    await t.step('should return true for an empty OutputRule object', () => {
        assert(isOutputRule({}));
    });

    await t.step('should return false if system_materials contains non-string prose', () => {
        assert(!isOutputRule(invalidateOutputRule({ system_materials: { stage_rationale: 123 } })));
    });

    await t.step('should return false if header_context_artifact is invalid', () => {
        assert(!isOutputRule(invalidateOutputRule({ header_context_artifact: { type: 'wrong' } })));
    });

    await t.step('should return false if documents is not an array', () => {
        assert(!isOutputRule(invalidateOutputRule({ documents: {} })));
    });

    await t.step('should return false if assembled_json is not an array', () => {
        assert(!isOutputRule(invalidateOutputRule({ assembled_json: {} })));
    });

    await t.step('should return true for a valid "EXECUTE" output rule with complex content_to_include', () => {
        assert(isOutputRule(buildOutputRule({
            system_materials: undefined,
            header_context_artifact: undefined,
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'business_case_template.md',
                content_to_include: {
                    executive_summary: '',
                    market_opportunity: '',
                    user_problem_validation: '',
                },
            }],
            context_for_documents: [
                {
                    document_key: FileType.feature_spec,
                    content_to_include: {
                        features: [{ feature_name: 'Test Feature', user_stories: ['As a user, I can do X.', 'As an admin, I can do Y.'] }],
                    },
                },
                {
                    document_key: FileType.technical_approach,
                    content_to_include: {
                        overview: 'Technical overview',
                        components: [{ name: 'Component A', technology: 'React' }, { name: 'Component B', technology: 'Node.js' }],
                    },
                },
            ],
        })));
    });

    await t.step('should return true for a valid output rule with assembled_json', () => {
        assert(isOutputRule(buildOutputRule({
            system_materials: undefined,
            header_context_artifact: undefined,
            context_for_documents: undefined,
            documents: undefined,
            assembled_json: [buildAssembledJsonArtifact()],
        })));
    });

    await t.step('should return true for a valid "PLAN" output rule with files_to_generate and review_metadata', () => {
        assert(isOutputRule(buildOutputRule({
            files_to_generate: [{ from_document_key: FileType.business_case, template_filename: 'business_case_template.md' }],
            review_metadata: buildReviewMetadata(),
        })));
    });

    await t.step('should return true for a valid "EXECUTE" output rule where a document is an AssembledJsonArtifact', () => {
        assert(isOutputRule(buildOutputRule({
            system_materials: undefined,
            header_context_artifact: undefined,
            context_for_documents: undefined,
            documents: [{
                document_key: FileType.comparison_vector,
                template_filename: 'antithesis_comparison_vector.json',
                artifact_class: 'assembled_document_json',
                file_type: 'json',
                content_to_include: { proposal: { lineage_key: '', source_model_slug: '' } },
            }],
            files_to_generate: [{ from_document_key: FileType.comparison_vector, template_filename: 'antithesis_comparison_vector.json' }],
        })));
    });
});

Deno.test('Type Guard: isDialecticStageRecipeStep', async (t) => {
    await t.step('should return true for a complete and valid DialecticStageRecipeStep object', () => {
        assert(isDialecticStageRecipeStep(buildDialecticStageRecipeStep()));
    });

    await t.step('should return false if job_type is invalid', () => {
        assert(!isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({ job_type: 'INVALID' })));
    });

    await t.step('should return true when recipe steps use dynamic document keys', () => {
        assert(isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({
            inputs_required: [{ type: 'document', slug: 'synthesis', document_key: 'synthesis_pairwise_feature_spec', required: true }],
            inputs_relevance: [{ document_key: 'synthesis_pairwise_feature_spec', relevance: 1, slug: 'synthesis' }],
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
        })));
    });

    await t.step('should return false if prompt_type is invalid', () => {
        assert(!isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({ prompt_type: 'INVALID' })));
    });

    await t.step('should return false if inputs_required is not a valid InputRule array', () => {
        assert(!isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({
            inputs_required: [{ document_key: 'invalid' }],
        })));
    });

    await t.step('should return false if a required property is missing (e.g., step_key)', () => {
        const { step_key: _omit, ...rest } = buildDialecticStageRecipeStep()!;
        assert(!isDialecticStageRecipeStep(rest));
    });

    await t.step('should return false when inputs_required is null', () => {
        assert(!isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({ inputs_required: null })));
    });

    await t.step('should return false when inputs_relevance is null', () => {
        assert(!isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({ inputs_relevance: null })));
    });

    await t.step('should return false when outputs_required is null', () => {
        assert(!isDialecticStageRecipeStep(invalidateDialecticStageRecipeStep({ outputs_required: null })));
    });

    await t.step('should return false when id is missing', () => {
        const { id: _omit, ...rest } = buildDialecticStageRecipeStep()!;
        assert(!isDialecticStageRecipeStep(rest));
    });
});

Deno.test('Type Guard: isSystemMaterials', async (t) => {
    await t.step('should return true for a valid SystemMaterials object', () => {
        assert(isSystemMaterials(buildSystemMaterials({
            progress_update: 'Test progress update',
            diversity_rubric: { key: 'value' },
            quality_standards: ['standard1'],
            validation_checkpoint: ['checkpoint1'],
        })));
    });

    await t.step('should return true for a comprehensive SystemMaterials object with all optional fields', () => {
        assert(isSystemMaterials(buildSystemMaterials({
            progress_update: 'Test progress update',
            diversity_rubric: { key: 'value' },
            quality_standards: ['standard1'],
            validation_checkpoint: ['checkpoint1'],
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
        })));
    });

    await t.step('should return true for an object with only required fields', () => {
        const { document_order: _omit1, current_document: _omit2, ...rest } = buildSystemMaterials();
        assert(isSystemMaterials(rest));
    });

    await t.step('should return true for planner payload without prose fields', () => {
        assert(isSystemMaterials(buildSystemMaterials({
            document_order: undefined,
            current_document: undefined,
            milestones: [],
            dependency_rules: [],
            status_preservation_rules: {
                completed_status: '[✅]',
                in_progress_status: '[🚧]',
                unstarted_status: '[ ]',
            },
            technical_requirements_outline_inputs: {
                subsystems: [],
            },
        })));
    });

    await t.step('should return false if stage_rationale is present but not a string', () => {
        assert(!isSystemMaterials(invalidateSystemMaterials({ stage_rationale: 123 })));
    });

    await t.step('should return false if a required string property has the wrong type', () => {
        assert(!isSystemMaterials(invalidateSystemMaterials({ agent_notes_to_self: 123 })));
    });

    await t.step('should return false if an array property has the wrong type', () => {
        assert(!isSystemMaterials(invalidateSystemMaterials({ quality_standards: 'not-an-array' })));
    });

    await t.step('should return false if an object property has the wrong type', () => {
        assert(!isSystemMaterials(invalidateSystemMaterials({ diversity_rubric: 'not-an-object' })));
    });

    await t.step('should return false if files_to_generate contains invalid items', () => {
        assert(!isSystemMaterials({ ...buildSystemMaterials(), files_to_generate: [{ invalid_key: 'value' }] }));
    });

    await t.step('should return true when progress_update is null', () => {
        assert(isSystemMaterials(buildSystemMaterials({ progress_update: null })));
    });

    await t.step('should return true when progress_update is omitted', () => {
        assert(isSystemMaterials(buildSystemMaterials()));
    });

    await t.step('should return false when progress_update has invalid type (number)', () => {
        assert(!isSystemMaterials(invalidateSystemMaterials({ progress_update: 123 })));
    });
});

Deno.test('Type Guard: isHeaderContextArtifact', async (t) => {
    await t.step('should return true for a valid HeaderContextArtifact object with FileType enum', () => {
        assert(isHeaderContextArtifact(buildHeaderContextArtifact({ document_key: FileType.HeaderContext })));
    });

    await t.step('should return true for a valid HeaderContextArtifact with document_key: header_context_pairwise', () => {
        assert(isHeaderContextArtifact(invalidateHeaderContextArtifact({ document_key: 'header_context_pairwise' })));
    });

    await t.step('should return true for a valid HeaderContextArtifact with document_key: synthesis_header_context', () => {
        assert(isHeaderContextArtifact(invalidateHeaderContextArtifact({ document_key: 'synthesis_header_context' })));
    });

    await t.step('should return false for an invalid document_key', () => {
        assert(!isHeaderContextArtifact(invalidateHeaderContextArtifact({ document_key: 'invalid_document_key' })));
    });

    await t.step('should return false if type is not "header_context"', () => {
        assert(!isHeaderContextArtifact(invalidateHeaderContextArtifact({ type: 'wrong_type' })));
    });

    await t.step('should return false if artifact_class is not "header_context"', () => {
        assert(!isHeaderContextArtifact(invalidateHeaderContextArtifact({ artifact_class: 'wrong_class' })));
    });

    await t.step('should return false if file_type is not "json"', () => {
        assert(!isHeaderContextArtifact(invalidateHeaderContextArtifact({ file_type: 'txt' })));
    });
});

Deno.test('Type Guard: isContextForDocument', async (t) => {
    await t.step('should return true for a valid ContextForDocument object', () => {
        assert(isContextForDocument(buildContextForDocument({ content_to_include: { some: 'data' } })));
    });

    await t.step('should return true when content_to_include contains an array of objects', () => {
        assert(isContextForDocument(buildContextForDocument({
            document_key: FileType.feature_spec,
            content_to_include: { features: [{ feature_name: '', user_stories: [] }] },
        })));
    });

    await t.step('should return false if document_key is missing', () => {
        const { document_key: _omit, ...rest } = buildContextForDocument();
        assert(!isContextForDocument(rest));
    });

    await t.step('should return false if content_to_include is missing', () => {
        const { content_to_include: _omit, ...rest } = buildContextForDocument();
        assert(!isContextForDocument(rest));
    });

    await t.step('should return true when document_key is a dynamic recipe string', () => {
        assert(isContextForDocument(invalidateContextForDocument({
            document_key: 'synthesis_pairwise_feature_spec',
            content_to_include: { strengths: [], weaknesses: [] },
        })));
    });
});

Deno.test('Type Guard: isRenderedDocumentArtifact', async (t) => {
    await t.step('should return true when content_to_include is missing', () => {
        const { content_to_include: _omit, ...rest } = buildRenderedDocumentArtifact();
        assert(isRenderedDocumentArtifact(rest));
    });

    await t.step('should return true for a valid RenderedDocumentArtifact object', () => {
        assert(isRenderedDocumentArtifact(buildRenderedDocumentArtifact({ content_to_include: { summary: 'This is a summary.' } })));
    });

    await t.step('should return true for a valid RenderedDocumentArtifact with optional properties', () => {
        assert(isRenderedDocumentArtifact(buildRenderedDocumentArtifact({
            content_to_include: { summary: 'This is a summary.' },
            lineage_key: 'lineage-abc',
            source_model_slug: 'model-xyz',
        })));
    });

    await t.step('should return true when content_to_include is an array', () => {
        assert(isRenderedDocumentArtifact(buildRenderedDocumentArtifact({
            document_key: FileType.risk_register,
            template_filename: 'template.txt',
            content_to_include: [{ risk: 'some risk', impact: 'high', likelihood: 'medium', mitigation: 'do something' }],
        })));
    });

    await t.step('should return false if artifact_class is not "rendered_document"', () => {
        assert(!isRenderedDocumentArtifact(invalidateRenderedDocumentArtifact({ artifact_class: 'wrong_type' })));
    });

    await t.step('should return false if document_key is missing', () => {
        const { document_key: _omit, ...rest } = buildRenderedDocumentArtifact();
        assert(!isRenderedDocumentArtifact(rest));
    });

    await t.step('should return false if template_filename is missing', () => {
        const { template_filename: _omit, ...rest } = buildRenderedDocumentArtifact();
        assert(!isRenderedDocumentArtifact(rest));
    });

    await t.step('should return false if document_key is of the wrong type', () => {
        assert(!isRenderedDocumentArtifact(invalidateRenderedDocumentArtifact({ document_key: 123 })));
    });

    await t.step('should return false if template_filename is of the wrong type', () => {
        assert(!isRenderedDocumentArtifact(invalidateRenderedDocumentArtifact({ template_filename: 123 })));
    });

    await t.step('should return false if content_to_include is not an object or array', () => {
        assert(!isRenderedDocumentArtifact(invalidateRenderedDocumentArtifact({ content_to_include: 'a string' })));
    });

    await t.step('should return true for artifacts that use dynamic document keys', () => {
        assert(isRenderedDocumentArtifact(invalidateRenderedDocumentArtifact({
            document_key: 'final_business_case',
            template_filename: 'final_business_case.md',
            content_to_include: { executive_summary: '', next_steps: '' },
        })));
    });
});

Deno.test('Type Guard: isEditedDocumentResource', async (t) => {
    await t.step('should return true for a fully-populated resource', () => {
        assert(isEditedDocumentResource(buildEditedDocumentResource()));
    });

    await t.step('should return true when optional fields are null', () => {
        assert(isEditedDocumentResource(buildEditedDocumentResource({
            resource_type: null,
            project_id: null,
            session_id: null,
            stage_slug: null,
            iteration_number: null,
            document_key: null,
            source_contribution_id: null,
        })));
    });

    await t.step('should return false when a required string field is missing', () => {
        const { file_name: _omit, ...rest } = buildEditedDocumentResource();
        assert(!isEditedDocumentResource(rest));
    });

    await t.step('should return false when a required number field has the wrong type', () => {
        assert(!isEditedDocumentResource(invalidateEditedDocumentResource({ size_bytes: 'big' })));
    });
});

Deno.test('Type Guard: isDialecticProjectResourceRow', async (t) => {
    await t.step('should return true for a fully populated resource row', () => {
        assert(isDialecticProjectResourceRow(buildDialecticProjectResourceRow({
            resource_description: { type: 'general_resource' },
            resource_type: 'general_resource',
            source_contribution_id: 'contrib-123',
            source_prompt_resource_id: 'prompt-resource-123',
        })));
    });

    await t.step('should return true when optional nullable properties are null', () => {
        assert(isDialecticProjectResourceRow(invalidateDialecticProjectResourceRow({
            user_id: null,
            file_name: null,
            resource_type: null,
            session_id: null,
            stage_slug: null,
            iteration_number: null,
            size_bytes: null,
            source_contribution_id: null,
            source_prompt_resource_id: null,
        })));
    });

    await t.step('should return false when a required string property is missing', () => {
        const { project_id: _omit, ...rest } = buildDialecticProjectResourceRow();
        assert(!isDialecticProjectResourceRow(rest));
    });

    await t.step('should return false when a numeric field has the wrong type', () => {
        assert(!isDialecticProjectResourceRow(invalidateDialecticProjectResourceRow({ size_bytes: 'large' })));
    });

    await t.step('should return false when source_prompt_resource_id is neither a string nor null', () => {
        assert(!isDialecticProjectResourceRow(invalidateDialecticProjectResourceRow({ source_prompt_resource_id: 42 })));
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
    await t.step('should return true for a valid success response', () => {
        assert(isSaveContributionEditSuccessResponse({
            sourceContributionId: 'contrib-2',
            resource: buildEditedDocumentResource({
                document_key: FileType.synthesis_document_business_case,
                source_contribution_id: 'contrib-2',
            }),
        }));
    });

    await t.step('should return false when sourceContributionId is missing', () => {
        assert(!isSaveContributionEditSuccessResponse({
            resource: buildEditedDocumentResource(),
        }));
    });

    await t.step('should return false when resource is invalid', () => {
        assert(!isSaveContributionEditSuccessResponse({
            sourceContributionId: 'contrib-2',
            resource: invalidateEditedDocumentResource({ file_name: 123 }),
        }));
    });
});

Deno.test('Type Guard: isAssembledJsonArtifact', async (t) => {
    await t.step('should return true for a valid artifact with a fields property', () => {
        assert(isAssembledJsonArtifact(buildAssembledJsonArtifact()));
    });

    await t.step('should return true for a valid artifact structured as a document', () => {
        const { fields: _omit, ...rest } = buildAssembledJsonArtifact({
            document_key: FileType.synthesis_document_business_case,
            artifact_class: 'assembled_json',
            template_filename: 'synthesis_document_business_case_template.json',
            file_type: 'json',
            content_to_include: {
                executive_summary: '',
                synthesis_of_key_points: '',
                final_recommendation: '',
            },
        });
        assert(isAssembledJsonArtifact(rest));
    });

    await t.step('should return true for an artifact with optional properties', () => {
        assert(isAssembledJsonArtifact(invalidateAssembledJsonArtifact({
            lineage_key: 'lineage-abc',
            source_model_slug: 'model-xyz',
        })));
    });

    await t.step('should return true for artifact with class "assembled_json"', () => {
        assert(isAssembledJsonArtifact(invalidateAssembledJsonArtifact({ artifact_class: 'assembled_json' })));
    });

    await t.step('should return false if artifact_class is invalid', () => {
        assert(!isAssembledJsonArtifact(invalidateAssembledJsonArtifact({ artifact_class: 'wrong_type' })));
    });

    await t.step('should return false if document_key is missing', () => {
        const { document_key: _omit, ...rest } = buildAssembledJsonArtifact();
        assert(!isAssembledJsonArtifact(rest));
    });

    await t.step('should return false if fields array contains non-string values', () => {
        assert(!isAssembledJsonArtifact(invalidateAssembledJsonArtifact({ fields: ['valid_field', 123] })));
    });

    await t.step('should return false if it has both fields and template_filename', () => {
        assert(!isAssembledJsonArtifact(invalidateAssembledJsonArtifact({ template_filename: 'some_template.json' })));
    });

    await t.step('should return false if document structure is missing template_filename', () => {
        const { template_filename: _omit, ...rest } = buildAssembledJsonArtifact({
            document_key: FileType.synthesis_document_business_case,
            artifact_class: 'assembled_json',
            template_filename: 'synthesis_document_business_case_template.json',
            file_type: 'json',
            content_to_include: { executive_summary: '' },
        });
        assert(!isAssembledJsonArtifact(rest));
    });
});

Deno.test('Type Guard: isContentToInclude', async (t) => {
    await t.step('should return true for simple objects with string values', () => {
        const valid = { field1: '', field2: 'value' };
        assert(isContentToInclude(valid));
    });

    await t.step('should return true for objects with string arrays', () => {
        const valid = { field1: [], field2: ['value1', 'value2'] };
        assert(isContentToInclude(valid));
    });

    await t.step('should return true for objects with nested objects', () => {
        const valid = {
            dimensions: {
                feasibility: {
                    score: 0,
                    rationale: ''
                }
            }
        };
        assert(isContentToInclude(valid));
    });

    await t.step('should return true for objects with arrays of objects', () => {
        const valid = {
            features: [
                { name: '', stories: [] },
                { name: 'feature2', stories: ['story1'] }
            ]
        };
        assert(isContentToInclude(valid));
    });

    await t.step('should return true for mixed structures combining all types', () => {
        const valid = {
            string_field: 'value',
            array_field: ['item1', 'item2'],
            boolean_field: true,
            number_field: 42,
            nested_object: {
                nested_string: '',
                nested_array: []
            },
            array_of_objects: [
                { key: 'value1' },
                { key: 'value2' }
            ]
        };
        assert(isContentToInclude(valid));
    });

    await t.step('should return false for arrays at top level', () => {
        const invalid = ['string1', 'string2'];
        assert(!isContentToInclude(invalid));
    });

    await t.step('should return false for null', () => {
        assert(!isContentToInclude(null));
    });

    await t.step('should return false for undefined', () => {
        assert(!isContentToInclude(undefined));
    });

    await t.step('should return false for functions', () => {
        assert(!isContentToInclude(() => {}));
    });

    await t.step('should return true for objects with null values (AI models return null for empty fields)', () => {
        const valid = { field1: null };
        assert(isContentToInclude(valid));
    });

    await t.step('should return true for objects mixing null with other valid types', () => {
        const valid = {
            risk: null,
            impact: null,
            likelihood: null,
            mitigation: null,
            mitigation_plan: 'detailed plan text',
            required_fields: ['risk', 'impact', 'likelihood', 'mitigation'],
            notes: 'some notes',
        };
        assert(isContentToInclude(valid));
    });

    await t.step('should return false for objects with undefined values', () => {
        const invalid = { field1: undefined };
        assert(!isContentToInclude(invalid));
    });

    await t.step('should correctly validate deeply nested structures', () => {
        const valid = {
            level1: {
                level2: {
                    level3: {
                        level4: {
                            string_value: 'deep'
                        }
                    }
                }
            }
        };
        assert(isContentToInclude(valid));
    });

    await t.step('should return false for arrays with mixed types', () => {
        const invalid = {
            mixed_array: ['string', 123, true]
        };
        assert(!isContentToInclude(invalid));
    });

    await t.step('should return false for arrays with invalid objects', () => {
        const invalid = {
            array_of_invalid: [
                { valid_key: 'value' },
                { invalid_key: undefined }
            ]
        };
        assert(!isContentToInclude(invalid));
    });
});

Deno.test('Type Guard: isDialecticRenderJobPayload', async (t) => {
    await t.step('should return true for a valid render job payload with all required fields', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload()));
    });

    await t.step('should return true for a valid render job payload with optional base payload fields', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload({
            continueUntilComplete: true,
            maxRetries: 3,
            continuation_count: 1,
            target_contribution_id: 'target-id',
            model_slug: 'test-model-slug',
            is_test_job: false,
        })));
    });

    await t.step('should return true when sourceContributionId is provided (required in RenderJobPayload)', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload({
            sourceContributionId: 'required-contribution-id',
        })));
    });

    await t.step('should throw error when sessionId is missing', () => {
        const { sessionId: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid sessionId.');
    });

    await t.step('should throw error when sessionId is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ sessionId: 123 })), Error, 'Missing or invalid sessionId.');
    });

    await t.step('should throw error when projectId is missing', () => {
        const { projectId: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid projectId.');
    });

    await t.step('should throw error when projectId is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ projectId: 123 })), Error, 'Missing or invalid projectId.');
    });

    await t.step('should throw error when model_id is missing', () => {
        const { model_id: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid model_id.');
    });

    await t.step('should throw error when model_id is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ model_id: 123 })), Error, 'Missing or invalid model_id.');
    });

    await t.step('should throw error when walletId is missing', () => {
        const { walletId: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid walletId.');
    });

    await t.step('should throw error when walletId is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ walletId: 123 })), Error, 'Missing or invalid walletId.');
    });

    await t.step('should throw error when user_jwt is missing', () => {
        const { user_jwt: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid user_jwt.');
    });

    await t.step('should throw error when user_jwt is empty string', () => {
        assertThrows(() => isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ user_jwt: '' })), Error, 'Missing or invalid user_jwt.');
    });

    await t.step('should throw error when user_jwt is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ user_jwt: 123 })), Error, 'Missing or invalid user_jwt.');
    });

    await t.step('should throw error when documentIdentity is missing', () => {
        const { documentIdentity: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid documentIdentity.');
    });

    await t.step('should throw error when documentIdentity is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ documentIdentity: 123 })), Error, 'Missing or invalid documentIdentity.');
    });

    await t.step('should throw error when documentIdentity is empty string', () => {
        assertThrows(() => isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ documentIdentity: '' })), Error, 'Missing or invalid documentIdentity.');
    });

    await t.step('should throw error when documentKey is missing', () => {
        const { documentKey: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid documentKey.');
    });

    await t.step('should throw error when documentKey is not a valid FileType', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ documentKey: 'invalid-file-type' })), Error, 'Missing or invalid documentKey.');
    });

    await t.step('should throw error when sourceContributionId is missing', () => {
        const { sourceContributionId: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid sourceContributionId.');
    });

    await t.step('should throw error when sourceContributionId is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ sourceContributionId: 123 })), Error, 'Invalid sourceContributionId.');
    });

    await t.step('should throw error when sourceContributionId is empty string', () => {
        assertThrows(() => isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ sourceContributionId: '' })), Error, 'Missing or invalid sourceContributionId.');
    });

    await t.step('should pass when stageSlug is provided (optional)', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ stageSlug: 'thesis' })));
    });

    await t.step('should pass when stageSlug is missing (optional)', () => {
        const { stageSlug: _omit, ...rest } = buildDialecticRenderJobPayload();
        assert(isDialecticRenderJobPayload(rest));
    });

    await t.step('should throw error when stageSlug is not a string (if provided)', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ stageSlug: 123 })), Error, 'Invalid stageSlug.');
    });

    await t.step('should pass when iterationNumber is provided (optional)', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ iterationNumber: 2 })));
    });

    await t.step('should pass when iterationNumber is missing (optional)', () => {
        const { iterationNumber: _omit, ...rest } = buildDialecticRenderJobPayload();
        assert(isDialecticRenderJobPayload(rest));
    });

    await t.step('should throw error when iterationNumber is not a number (if provided)', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ iterationNumber: '1' })), Error, 'Invalid iterationNumber.');
    });

    await t.step('should throw error for non-object payloads', () => {
        assertThrows(() => isDialecticRenderJobPayload(null), Error, 'Payload must be a non-null object.');
        assertThrows(() => isDialecticRenderJobPayload('string'), Error, 'Payload must be a non-null object.');
        assertThrows(() => isDialecticRenderJobPayload(123), Error, 'Payload must be a non-null object.');
        assertThrows(() => isDialecticRenderJobPayload([]), Error, 'Payload must be a non-null object.');
    });

    await t.step('should throw error when payload contains unknown properties', () => {
        assertThrows(
            () => isDialecticRenderJobPayload({ ...buildDialecticRenderJobPayload(), unknown_property: 'some-value' }),
            Error,
            'Payload contains unknown properties: unknown_property'
        );
    });

    await t.step('should return true for valid render job payload with template_filename', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ template_filename: 'antithesis_business_case_critique.md' })));
    });

    await t.step('should throw error when template_filename is missing', () => {
        const { template_filename: _omit, ...rest } = buildDialecticRenderJobPayload();
        assertThrows(() => isDialecticRenderJobPayload(rest), Error, 'Missing or invalid template_filename.');
    });

    await t.step('should throw error when template_filename is not a string', () => {
        assertThrows(() => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ template_filename: 123 })), Error, 'Missing or invalid template_filename.');
    });

    await t.step('should throw error when template_filename is empty string', () => {
        assertThrows(() => isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ template_filename: '' })), Error, 'Missing or invalid template_filename.');
    });

    await t.step('should throw error when template_filename is whitespace-only string', () => {
        assertThrows(() => isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ template_filename: '   ' })), Error, 'Missing or invalid template_filename.');
    });

    await t.step('should pass with a valid optional maxOutputTokens from GenerateContributionsPayload', () => {
        assert(isDialecticRenderJobPayload(buildDialecticRenderJobPayload({ maxOutputTokens: 8192 })));
    });

    await t.step('should throw when maxOutputTokens is a string', () => {
        assertThrows(
            () => isDialecticRenderJobPayload(invalidateDialecticRenderJobPayload({ maxOutputTokens: 'string' })),
            Error,
            'Invalid maxOutputTokens.',
        );
    });
});

Deno.test('Type Guard: isSelectAnchorResult', async (t) => {
    await t.step('should return true for status "no_anchor_required"', () => {
        assert(isSelectAnchorResult(buildSelectAnchorResultNoAnchorRequired()));
    });

    await t.step('should return true for status "derive_from_header_context"', () => {
        assert(isSelectAnchorResult(buildSelectAnchorResultDeriveFromHeaderContext()));
    });

    await t.step('should return true for status "anchor_found" with valid document', () => {
        assert(isSelectAnchorResult(buildSelectAnchorResultAnchorFound()));
    });

    await t.step('should return true for status "anchor_not_found" with targetSlug and targetDocumentKey', () => {
        assert(isSelectAnchorResult(buildSelectAnchorResultAnchorNotFound()));
    });

    await t.step('should return true for status "anchor_not_found" with targetSlug and undefined targetDocumentKey', () => {
        assert(isSelectAnchorResult({ ...buildSelectAnchorResultAnchorNotFound(), targetDocumentKey: undefined }));
    });

    await t.step('should return false when status is invalid', () => {
        assert(!isSelectAnchorResult({ status: 'invalid_status' }));
    });

    await t.step('should return false when status is missing', () => {
        assert(!isSelectAnchorResult({}));
    });

    await t.step('should return false when status is "anchor_found" but document is missing', () => {
        assert(!isSelectAnchorResult({ status: 'anchor_found' }));
    });

    await t.step('should return false when status is "anchor_found" but document is invalid', () => {
        assert(!isSelectAnchorResult({ status: 'anchor_found', document: 'not-a-document' }));
    });

    await t.step('should return false when status is "anchor_not_found" but targetSlug is missing', () => {
        assert(!isSelectAnchorResult({ status: 'anchor_not_found', targetDocumentKey: 'business_case' }));
    });

    await t.step('should return false when status is "anchor_not_found" but targetSlug is not a string', () => {
        assert(!isSelectAnchorResult({ status: 'anchor_not_found', targetSlug: 123, targetDocumentKey: 'business_case' }));
    });

    await t.step('should return false when status is "anchor_not_found" and targetDocumentKey is not a string or undefined', () => {
        assert(!isSelectAnchorResult({ status: 'anchor_not_found', targetSlug: 'thesis', targetDocumentKey: 123 }));
    });

    await t.step('should return false for null', () => {
        assert(!isSelectAnchorResult(null));
    });

    await t.step('should return false for non-object types', () => {
        assert(!isSelectAnchorResult('string'));
        assert(!isSelectAnchorResult(123));
        assert(!isSelectAnchorResult(true));
        assert(!isSelectAnchorResult([]));
    });

    await t.step('should return false when object has unknown properties with valid status', () => {
        assert(!isSelectAnchorResult({ ...buildSelectAnchorResultNoAnchorRequired(), unknownProperty: 'value' }));
    });
});

Deno.test('Type contract: SyncMapEntry', async (t) => {
    const validWithAudience = buildSyncMapEntry({
        friendlyName: 'business_case',
        stageGroup: 'proposal',
        audience: 'leadership',
    });
    await t.step('has required shape with all fields including audience', () => {
        assert(typeof validWithAudience.documentKey === 'string');
        assert(typeof validWithAudience.friendlyName === 'string');
        assert(typeof validWithAudience.stageGroup === 'string');
        assert(['research', 'decision', 'action'].includes(validWithAudience.layer));
        assert(validWithAudience.audience === 'leadership');
        assert(typeof validWithAudience.sortOrder === 'number');
        assert(typeof validWithAudience.available === 'boolean');
        assert(typeof validWithAudience.updatedSinceLastSync === 'boolean');
    });
    await t.step('allows nullable audience', () => {
        const withNullAudience = buildSyncMapEntry({ audience: null });
        assert(withNullAudience.audience === null);
        assert(typeof withNullAudience.available === 'boolean');
        assert(typeof withNullAudience.updatedSinceLastSync === 'boolean');
    });
});

Deno.test('Type contract: SyncToGitHubPayload', async (t) => {
    const valid = buildSyncToGitHubPayload({
        projectId: 'proj-1',
        selectedModelIds: ['model-a'],
        selectedDocumentKeys: ['business_case', 'feature_spec'],
        includeRulesFile: true,
    });
    await t.step('requires projectId, selectedModelIds, selectedDocumentKeys, includeRulesFile', () => {
        assert(typeof valid.projectId === 'string');
        assert(Array.isArray(valid.selectedModelIds));
        assert(valid.selectedModelIds.every((id) => typeof id === 'string'));
        assert(Array.isArray(valid.selectedDocumentKeys));
        assert(valid.selectedDocumentKeys.every((k) => typeof k === 'string'));
        assert(typeof valid.includeRulesFile === 'boolean');
    });
});

Deno.test('Type contract: SyncToGitHubResponse', async (t) => {
    await t.step('requires commitSha (nullable string), filesUpdated, syncedAt, syncedDocumentKeys, skippedDocumentKeys', () => {
        const withNullSha = buildSyncToGitHubResponse({
            commitSha: null,
            filesUpdated: 0,
            syncedAt: '2025-01-01T00:00:00Z',
            syncedDocumentKeys: [],
            skippedDocumentKeys: ['doc-a'],
        });
        assert(withNullSha.commitSha === null);
        assert(typeof withNullSha.filesUpdated === 'number');
        assert(typeof withNullSha.syncedAt === 'string');
        assert(Array.isArray(withNullSha.syncedDocumentKeys));
        assert(Array.isArray(withNullSha.skippedDocumentKeys));
    });
    await t.step('allows commitSha as string', () => {
        const withSha = buildSyncToGitHubResponse({
            commitSha: 'abc123',
            filesUpdated: 2,
            syncedAt: '2025-01-01T00:00:00Z',
            syncedDocumentKeys: ['business_case', 'feature_spec'],
            skippedDocumentKeys: [],
        });
        assert(typeof withSha.commitSha === 'string');
        assert(withSha.syncedDocumentKeys.length === 2);
        assert(withSha.skippedDocumentKeys.length === 0);
    });
});

Deno.test('Type Guard: isUnifiedAIResponseTokenUsage', async (t) => {
    await t.step('accepts the valid default', () => {
        assert(isUnifiedAIResponseTokenUsage(buildUnifiedAIResponseTokenUsage()));
    });

    await t.step('accepts one omitting the optional total_tokens', () => {
        const { total_tokens: _omit, ...rest } = buildUnifiedAIResponseTokenUsage();
        assert(isUnifiedAIResponseTokenUsage(rest));
    });

    await t.step('rejects prompt_tokens absent', () => {
        const { prompt_tokens: _omit, ...rest } = buildUnifiedAIResponseTokenUsage();
        assert(!isUnifiedAIResponseTokenUsage(rest));
    });

    await t.step('rejects prompt_tokens non-numeric', () => {
        assert(!isUnifiedAIResponseTokenUsage(invalidateUnifiedAIResponseTokenUsage({ prompt_tokens: 'ten' })));
    });

    await t.step('rejects completion_tokens absent', () => {
        const { completion_tokens: _omit, ...rest } = buildUnifiedAIResponseTokenUsage();
        assert(!isUnifiedAIResponseTokenUsage(rest));
    });

    await t.step('rejects completion_tokens non-numeric', () => {
        assert(!isUnifiedAIResponseTokenUsage(invalidateUnifiedAIResponseTokenUsage({ completion_tokens: 'twenty' })));
    });

    await t.step('rejects total_tokens present and non-numeric', () => {
        assert(!isUnifiedAIResponseTokenUsage(invalidateUnifiedAIResponseTokenUsage({ total_tokens: 'thirty' })));
    });

    await t.step('rejects null', () => {
        assert(!isUnifiedAIResponseTokenUsage(null));
    });

    await t.step('rejects a primitive', () => {
        assert(!isUnifiedAIResponseTokenUsage('not-an-object'));
    });

    await t.step('rejects an array', () => {
        assert(!isUnifiedAIResponseTokenUsage([1, 2, 3]));
    });
});

Deno.test('Type Guard: isUnifiedAIResponse', async (t) => {
    await t.step('accepts buildUnifiedAIResponse()', () => {
        assert(isUnifiedAIResponse(buildUnifiedAIResponse()));
    });

    await t.step('accepts one whose only member is content', () => {
        const { tokenUsage: _omit1, finish_reason: _omit2, ...rest } = buildUnifiedAIResponse();
        assert(isUnifiedAIResponse(rest));
    });

    await t.step('accepts content set to null', () => {
        assert(isUnifiedAIResponse(buildUnifiedAIResponse({ content: null })));
    });

    await t.step('rejects content absent', () => {
        const { content: _omit, ...rest } = buildUnifiedAIResponse();
        assert(!isUnifiedAIResponse(rest));
    });

    await t.step('rejects content corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ content: 123 })));
    });

    await t.step('rejects inputTokens corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ inputTokens: 'ten' })));
    });

    await t.step('rejects outputTokens corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ outputTokens: 'twenty' })));
    });

    await t.step('rejects processingTimeMs corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ processingTimeMs: 'fast' })));
    });

    await t.step('rejects contentType corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ contentType: 123 })));
    });

    await t.step('rejects error corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ error: 123 })));
    });

    await t.step('rejects errorCode corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ errorCode: 123 })));
    });

    await t.step('rejects finish_reason corrupted (delegation)', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ finish_reason: 123 })));
    });

    await t.step('rejects tokenUsage corrupted (delegation)', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ tokenUsage: 'not-a-usage' })));
    });

    await t.step('rejects rawProviderResponse corrupted', () => {
        assert(!isUnifiedAIResponse(invalidateUnifiedAIResponse({ rawProviderResponse: 'not-a-record' })));
    });

    await t.step('accepts tokenUsage null', () => {
        assert(isUnifiedAIResponse(buildUnifiedAIResponse({ tokenUsage: null })));
    });

    await t.step('rejects null', () => {
        assert(!isUnifiedAIResponse(null));
    });

    await t.step('rejects a primitive', () => {
        assert(!isUnifiedAIResponse('not-an-object'));
    });

    await t.step('rejects an array', () => {
        assert(!isUnifiedAIResponse([1, 2, 3]));
    });

    await t.step('accepts inputTokens and outputTokens undefined', () => {
        assert(isUnifiedAIResponse(buildUnifiedAIResponse({ content: null, tokenUsage: null, inputTokens: undefined, outputTokens: undefined })));
    });
});

Deno.test('Type Guard: isDialecticCompressJobPayload admits preflight_input_tokens', async (t) => {
    /** Contract: isDialecticCompressJobPayload accepts a compress payload carrying a numeric preflight_input_tokens. */
    await t.step('should accept buildDialecticCompressJobPayload({ preflight_input_tokens: 128 })', () => {
        assert(isDialecticCompressJobPayload(buildDialecticCompressJobPayload({ preflight_input_tokens: 128 })));
    });
});

/** each member of InputRuleTypes is accepted. */
Deno.test("isInputRuleType accepts every member of InputRuleTypes", () => {
    for (const type of InputRuleTypes) {
        assert(isInputRuleType(type));
    }
});

/** a string outside the union, null, undefined, a number, an empty string, and an array are rejected. */
Deno.test("isInputRuleType rejects non-members", () => {
    assert(!isInputRuleType("not-a-rule-type"));
    assert(!isInputRuleType(null));
    assert(!isInputRuleType(undefined));
    assert(!isInputRuleType(7));
    assert(!isInputRuleType(""));
    assert(!isInputRuleType([]));
});

Deno.test('Type Guard: isPromptConstructionPayload', async (t) => {
    await t.step('accepts the builder default', () => {
        assert(isPromptConstructionPayload(buildPromptConstructionPayload()));
    });

    await t.step('accepts valid overrides with systemInstruction and sourceContributionId', () => {
        assert(isPromptConstructionPayload(buildPromptConstructionPayload({
            systemInstruction: 'test system instruction',
            sourceContributionId: 'contrib-1',
        })));
    });

    await t.step('rejects null, undefined, primitives, and arrays', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isPromptConstructionPayload(x));
        }
    });

    await t.step('rejects conversationHistory corrupted', () => {
        assert(!isPromptConstructionPayload(invalidatePromptConstructionPayload({ conversationHistory: 'not-an-array' })));
    });

    await t.step('rejects resourceDocuments corrupted', () => {
        assert(!isPromptConstructionPayload(invalidatePromptConstructionPayload({ resourceDocuments: 'not-an-array' })));
    });

    await t.step('rejects currentUserPrompt corrupted', () => {
        assert(!isPromptConstructionPayload(invalidatePromptConstructionPayload({ currentUserPrompt: 123 })));
    });

    await t.step('rejects source_prompt_resource_id corrupted', () => {
        assert(!isPromptConstructionPayload(invalidatePromptConstructionPayload({ source_prompt_resource_id: 123 })));
    });

    await t.step('rejects systemInstruction present but corrupted', () => {
        assert(!isPromptConstructionPayload(invalidatePromptConstructionPayload({ systemInstruction: 123 })));
    });

    await t.step('rejects sourceContributionId present but corrupted', () => {
        assert(!isPromptConstructionPayload(invalidatePromptConstructionPayload({ sourceContributionId: 123 })));
    });

    await t.step('rejects conversationHistory omitted', () => {
        const { conversationHistory: _omit, ...rest } = buildPromptConstructionPayload();
        assert(!isPromptConstructionPayload(rest));
    });

    await t.step('rejects resourceDocuments omitted', () => {
        const { resourceDocuments: _omit, ...rest } = buildPromptConstructionPayload();
        assert(!isPromptConstructionPayload(rest));
    });

    await t.step('rejects currentUserPrompt omitted', () => {
        const { currentUserPrompt: _omit, ...rest } = buildPromptConstructionPayload();
        assert(!isPromptConstructionPayload(rest));
    });

    await t.step('rejects source_prompt_resource_id omitted', () => {
        const { source_prompt_resource_id: _omit, ...rest } = buildPromptConstructionPayload();
        assert(!isPromptConstructionPayload(rest));
    });

    await t.step('accepts systemInstruction absent', () => {
        const { systemInstruction: _omit, ...rest } = buildPromptConstructionPayload();
        assert(isPromptConstructionPayload(rest));
    });

    await t.step('accepts sourceContributionId absent', () => {
        const { sourceContributionId: _omit, ...rest } = buildPromptConstructionPayload();
        assert(isPromptConstructionPayload(rest));
    });
});

// ── Process job guards (Compression Jobs 5 node) ──

Deno.test('Type Guard: isProcessSimpleJobParams', async (t) => {
    /** Contract: isProcessSimpleJobParams accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessSimpleJobParams(buildProcessSimpleJobParams()));
    });

    /** Contract: isProcessSimpleJobParams accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessSimpleJobParams(buildProcessSimpleJobParams({})));
    });

    /** Contract: isProcessSimpleJobParams rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessSimpleJobParams(x));
        }
    });

    /** Contract: isProcessSimpleJobParams rejects a corrupted dbClient. */
    await t.step('rejects dbClient corrupted', () => {
        assert(!isProcessSimpleJobParams(invalidateProcessSimpleJobParams({ dbClient: 'not-a-client' })));
    });

    /** Contract: isProcessSimpleJobParams rejects an absent dbClient. */
    await t.step('rejects dbClient omitted', () => {
        const { dbClient: _omit, ...rest } = buildProcessSimpleJobParams();
        assert(!isProcessSimpleJobParams(rest));
    });
});

Deno.test('Type Guard: isProcessComplexJobParams', async (t) => {
    /** Contract: isProcessComplexJobParams accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessComplexJobParams(buildProcessComplexJobParams()));
    });

    /** Contract: isProcessComplexJobParams accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessComplexJobParams(buildProcessComplexJobParams({})));
    });

    /** Contract: isProcessComplexJobParams rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessComplexJobParams(x));
        }
    });

    /** Contract: isProcessComplexJobParams rejects a corrupted dbClient. */
    await t.step('rejects dbClient corrupted', () => {
        assert(!isProcessComplexJobParams(invalidateProcessComplexJobParams({ dbClient: 'not-a-client' })));
    });

    /** Contract: isProcessComplexJobParams rejects an absent dbClient. */
    await t.step('rejects dbClient omitted', () => {
        const { dbClient: _omit, ...rest } = buildProcessComplexJobParams();
        assert(!isProcessComplexJobParams(rest));
    });
});

Deno.test('Type Guard: isProcessRenderJobParams', async (t) => {
    /** Contract: isProcessRenderJobParams accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessRenderJobParams(buildProcessRenderJobParams()));
    });

    /** Contract: isProcessRenderJobParams accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessRenderJobParams(buildProcessRenderJobParams({})));
    });

    /** Contract: isProcessRenderJobParams rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessRenderJobParams(x));
        }
    });

    /** Contract: isProcessRenderJobParams rejects a corrupted dbClient. */
    await t.step('rejects dbClient corrupted', () => {
        assert(!isProcessRenderJobParams(invalidateProcessRenderJobParams({ dbClient: 'not-a-client' })));
    });

    /** Contract: isProcessRenderJobParams rejects an absent dbClient. */
    await t.step('rejects dbClient omitted', () => {
        const { dbClient: _omit, ...rest } = buildProcessRenderJobParams();
        assert(!isProcessRenderJobParams(rest));
    });
});

Deno.test('Type Guard: isProcessSimpleJobPayload', async (t) => {
    /** Contract: isProcessSimpleJobPayload accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessSimpleJobPayload(buildProcessSimpleJobPayload()));
    });

    /** Contract: isProcessSimpleJobPayload accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessSimpleJobPayload(buildProcessSimpleJobPayload({})));
    });

    /** Contract: isProcessSimpleJobPayload rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessSimpleJobPayload(x));
        }
    });

    /** Contract: isProcessSimpleJobPayload rejects a corrupted job. */
    await t.step('rejects job corrupted', () => {
        assert(!isProcessSimpleJobPayload(invalidateProcessSimpleJobPayload({ job: 'not-a-row' })));
    });

    /** Contract: isProcessSimpleJobPayload rejects an absent job. */
    await t.step('rejects job omitted', () => {
        const { job: _omit, ...rest } = buildProcessSimpleJobPayload();
        assert(!isProcessSimpleJobPayload(rest));
    });

    /** Contract: isProcessSimpleJobPayload throws when the row carries a DialecticPlanJobPayload, surfacing the arm guard's reason. */
    await t.step('throws on a row built with buildDialecticPlanJobPayload()', () => {
        assertThrows(() => isProcessSimpleJobPayload(invalidateProcessSimpleJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN' }), payload: buildDialecticPlanJobPayload() },
        })));
    });
});

Deno.test('Type Guard: isProcessComplexJobPayload', async (t) => {
    /** Contract: isProcessComplexJobPayload accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessComplexJobPayload(buildProcessComplexJobPayload()));
    });

    /** Contract: isProcessComplexJobPayload accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessComplexJobPayload(buildProcessComplexJobPayload({})));
    });

    /** Contract: isProcessComplexJobPayload rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessComplexJobPayload(x));
        }
    });

    /** Contract: isProcessComplexJobPayload rejects a corrupted job. */
    await t.step('rejects job corrupted', () => {
        assert(!isProcessComplexJobPayload(invalidateProcessComplexJobPayload({ job: 'not-a-row' })));
    });

    /** Contract: isProcessComplexJobPayload rejects an absent job. */
    await t.step('rejects job omitted', () => {
        const { job: _omit, ...rest } = buildProcessComplexJobPayload();
        assert(!isProcessComplexJobPayload(rest));
    });

    /** Contract: isProcessComplexJobPayload rejects a row carrying a DialecticExecuteJobPayload. */
    await t.step('rejects a row built with buildDialecticExecuteJobPayload()', () => {
        assert(!isProcessComplexJobPayload(invalidateProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'EXECUTE' }), payload: buildDialecticExecuteJobPayload() },
        })));
    });
});

Deno.test('Type Guard: isProcessRenderJobPayload', async (t) => {
    /** Contract: isProcessRenderJobPayload accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessRenderJobPayload(buildProcessRenderJobPayload()));
    });

    /** Contract: isProcessRenderJobPayload accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessRenderJobPayload(buildProcessRenderJobPayload({})));
    });

    /** Contract: isProcessRenderJobPayload rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessRenderJobPayload(x));
        }
    });

    /** Contract: isProcessRenderJobPayload rejects a corrupted job. */
    await t.step('rejects job corrupted', () => {
        assert(!isProcessRenderJobPayload(invalidateProcessRenderJobPayload({ job: 'not-a-row' })));
    });

    /** Contract: isProcessRenderJobPayload rejects an absent job. */
    await t.step('rejects job omitted', () => {
        const { job: _omit, ...rest } = buildProcessRenderJobPayload();
        assert(!isProcessRenderJobPayload(rest));
    });
});

// ── Return-flavor discrimination: each of the seven guards accepts its own flavor and rejects the other six. ──

Deno.test('Return-flavor guards discriminate rather than merely accept', async (t) => {
    const flavors = {
        dispatched: buildProcessSimpleJobDispatchedReturn(),
        deferred: buildProcessSimpleJobDeferredReturn(),
        simpleError: buildProcessSimpleJobErrorReturn(),
        planned: buildProcessComplexJobSuccessReturn(),
        complexError: buildProcessComplexJobErrorReturn(),
        rendered: buildProcessRenderJobSuccessReturn(),
        renderError: buildProcessRenderJobErrorReturn(),
    };

    /** Contract: isProcessSimpleJobDispatchedReturn accepts dispatched and rejects every other flavor. */
    await t.step('isProcessSimpleJobDispatchedReturn discriminates', () => {
        assert(isProcessSimpleJobDispatchedReturn(flavors.dispatched));
        assert(!isProcessSimpleJobDispatchedReturn(flavors.deferred));
        assert(!isProcessSimpleJobDispatchedReturn(flavors.simpleError));
        assert(!isProcessSimpleJobDispatchedReturn(flavors.planned));
        assert(!isProcessSimpleJobDispatchedReturn(flavors.complexError));
        assert(!isProcessSimpleJobDispatchedReturn(flavors.rendered));
        assert(!isProcessSimpleJobDispatchedReturn(flavors.renderError));
    });

    /** Contract: isProcessSimpleJobDeferredReturn accepts deferred and rejects every other flavor. */
    await t.step('isProcessSimpleJobDeferredReturn discriminates', () => {
        assert(isProcessSimpleJobDeferredReturn(flavors.deferred));
        assert(!isProcessSimpleJobDeferredReturn(flavors.dispatched));
        assert(!isProcessSimpleJobDeferredReturn(flavors.simpleError));
        assert(!isProcessSimpleJobDeferredReturn(flavors.planned));
        assert(!isProcessSimpleJobDeferredReturn(flavors.complexError));
        assert(!isProcessSimpleJobDeferredReturn(flavors.rendered));
        assert(!isProcessSimpleJobDeferredReturn(flavors.renderError));
    });

    /** Contract: isProcessSimpleJobErrorReturn accepts simpleError and rejects the four success flavors; the three error types are structurally identical and cannot discriminate among themselves. */
    await t.step('isProcessSimpleJobErrorReturn discriminates', () => {
        assert(isProcessSimpleJobErrorReturn(flavors.simpleError));
        assert(!isProcessSimpleJobErrorReturn(flavors.dispatched));
        assert(!isProcessSimpleJobErrorReturn(flavors.deferred));
        assert(!isProcessSimpleJobErrorReturn(flavors.planned));
        assert(!isProcessSimpleJobErrorReturn(flavors.rendered));
    });

    /** Contract: isProcessComplexJobSuccessReturn accepts planned and rejects every other flavor. */
    await t.step('isProcessComplexJobSuccessReturn discriminates', () => {
        assert(isProcessComplexJobSuccessReturn(flavors.planned));
        assert(!isProcessComplexJobSuccessReturn(flavors.dispatched));
        assert(!isProcessComplexJobSuccessReturn(flavors.deferred));
        assert(!isProcessComplexJobSuccessReturn(flavors.simpleError));
        assert(!isProcessComplexJobSuccessReturn(flavors.complexError));
        assert(!isProcessComplexJobSuccessReturn(flavors.rendered));
        assert(!isProcessComplexJobSuccessReturn(flavors.renderError));
    });

    /** Contract: isProcessComplexJobErrorReturn accepts complexError and rejects the four success flavors; the three error types are structurally identical and cannot discriminate among themselves. */
    await t.step('isProcessComplexJobErrorReturn discriminates', () => {
        assert(isProcessComplexJobErrorReturn(flavors.complexError));
        assert(!isProcessComplexJobErrorReturn(flavors.dispatched));
        assert(!isProcessComplexJobErrorReturn(flavors.deferred));
        assert(!isProcessComplexJobErrorReturn(flavors.planned));
        assert(!isProcessComplexJobErrorReturn(flavors.rendered));
    });

    /** Contract: isProcessRenderJobSuccessReturn accepts rendered and rejects every other flavor. */
    await t.step('isProcessRenderJobSuccessReturn discriminates', () => {
        assert(isProcessRenderJobSuccessReturn(flavors.rendered));
        assert(!isProcessRenderJobSuccessReturn(flavors.dispatched));
        assert(!isProcessRenderJobSuccessReturn(flavors.deferred));
        assert(!isProcessRenderJobSuccessReturn(flavors.simpleError));
        assert(!isProcessRenderJobSuccessReturn(flavors.planned));
        assert(!isProcessRenderJobSuccessReturn(flavors.complexError));
        assert(!isProcessRenderJobSuccessReturn(flavors.renderError));
    });

    /** Contract: isProcessRenderJobErrorReturn accepts renderError and rejects the four success flavors; the three error types are structurally identical and cannot discriminate among themselves. */
    await t.step('isProcessRenderJobErrorReturn discriminates', () => {
        assert(isProcessRenderJobErrorReturn(flavors.renderError));
        assert(!isProcessRenderJobErrorReturn(flavors.dispatched));
        assert(!isProcessRenderJobErrorReturn(flavors.deferred));
        assert(!isProcessRenderJobErrorReturn(flavors.planned));
        assert(!isProcessRenderJobErrorReturn(flavors.rendered));
    });
});

// ── Per-guard standard checklist for the seven return-flavor guards and the union guard. ──

Deno.test('Type Guard: isProcessSimpleJobDispatchedReturn', async (t) => {
    /** Contract: isProcessSimpleJobDispatchedReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessSimpleJobDispatchedReturn(buildProcessSimpleJobDispatchedReturn()));
    });

    /** Contract: isProcessSimpleJobDispatchedReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessSimpleJobDispatchedReturn(buildProcessSimpleJobDispatchedReturn({})));
    });

    /** Contract: isProcessSimpleJobDispatchedReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessSimpleJobDispatchedReturn(x));
        }
    });

    /** Contract: isProcessSimpleJobDispatchedReturn rejects a corrupted dispatched. */
    await t.step('rejects dispatched corrupted', () => {
        assert(!isProcessSimpleJobDispatchedReturn(invalidateProcessSimpleJobDispatchedReturn({ dispatched: 'not-true' })));
    });

    /** Contract: isProcessSimpleJobDispatchedReturn rejects an absent dispatched. */
    await t.step('rejects dispatched omitted', () => {
        const { dispatched: _omit, ...rest } = buildProcessSimpleJobDispatchedReturn();
        assert(!isProcessSimpleJobDispatchedReturn(rest));
    });
});

Deno.test('Type Guard: isProcessSimpleJobDeferredReturn', async (t) => {
    /** Contract: isProcessSimpleJobDeferredReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessSimpleJobDeferredReturn(buildProcessSimpleJobDeferredReturn()));
    });

    /** Contract: isProcessSimpleJobDeferredReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessSimpleJobDeferredReturn(buildProcessSimpleJobDeferredReturn({})));
    });

    /** Contract: isProcessSimpleJobDeferredReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessSimpleJobDeferredReturn(x));
        }
    });

    /** Contract: isProcessSimpleJobDeferredReturn rejects a corrupted deferred. */
    await t.step('rejects deferred corrupted', () => {
        assert(!isProcessSimpleJobDeferredReturn(invalidateProcessSimpleJobDeferredReturn({ deferred: 'not-true' })));
    });

    /** Contract: isProcessSimpleJobDeferredReturn rejects an absent deferred. */
    await t.step('rejects deferred omitted', () => {
        const { deferred: _omit, ...rest } = buildProcessSimpleJobDeferredReturn();
        assert(!isProcessSimpleJobDeferredReturn(rest));
    });
});

Deno.test('Type Guard: isProcessSimpleJobSuccessReturn', async (t) => {
    /** Contract: isProcessSimpleJobSuccessReturn accepts the dispatched flavor. */
    await t.step('accepts buildProcessSimpleJobDispatchedReturn()', () => {
        assert(isProcessSimpleJobSuccessReturn(buildProcessSimpleJobDispatchedReturn()));
    });

    /** Contract: isProcessSimpleJobSuccessReturn accepts the deferred flavor. */
    await t.step('accepts buildProcessSimpleJobDeferredReturn()', () => {
        assert(isProcessSimpleJobSuccessReturn(buildProcessSimpleJobDeferredReturn()));
    });

    /** Contract: isProcessSimpleJobSuccessReturn rejects the error arm. */
    await t.step('rejects buildProcessSimpleJobErrorReturn()', () => {
        assert(!isProcessSimpleJobSuccessReturn(buildProcessSimpleJobErrorReturn()));
    });

    /** Contract: isProcessSimpleJobSuccessReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessSimpleJobSuccessReturn(x));
        }
    });
});

Deno.test('Type Guard: isProcessSimpleJobErrorReturn', async (t) => {
    /** Contract: isProcessSimpleJobErrorReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessSimpleJobErrorReturn(buildProcessSimpleJobErrorReturn()));
    });

    /** Contract: isProcessSimpleJobErrorReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessSimpleJobErrorReturn(buildProcessSimpleJobErrorReturn({})));
    });

    /** Contract: isProcessSimpleJobErrorReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessSimpleJobErrorReturn(x));
        }
    });

    /** Contract: isProcessSimpleJobErrorReturn rejects a corrupted error. */
    await t.step('rejects error corrupted', () => {
        assert(!isProcessSimpleJobErrorReturn(invalidateProcessSimpleJobErrorReturn({ error: 'not-an-error' })));
    });

    /** Contract: isProcessSimpleJobErrorReturn rejects a corrupted retriable. */
    await t.step('rejects retriable corrupted', () => {
        assert(!isProcessSimpleJobErrorReturn(invalidateProcessSimpleJobErrorReturn({ retriable: 'not-a-boolean' })));
    });

    /** Contract: isProcessSimpleJobErrorReturn rejects an absent error. */
    await t.step('rejects error omitted', () => {
        const { error: _omit, ...rest } = buildProcessSimpleJobErrorReturn();
        assert(!isProcessSimpleJobErrorReturn(rest));
    });

    /** Contract: isProcessSimpleJobErrorReturn rejects an absent retriable. */
    await t.step('rejects retriable omitted', () => {
        const { retriable: _omit, ...rest } = buildProcessSimpleJobErrorReturn();
        assert(!isProcessSimpleJobErrorReturn(rest));
    });
});

Deno.test('Type Guard: isProcessComplexJobSuccessReturn', async (t) => {
    /** Contract: isProcessComplexJobSuccessReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessComplexJobSuccessReturn(buildProcessComplexJobSuccessReturn()));
    });

    /** Contract: isProcessComplexJobSuccessReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessComplexJobSuccessReturn(buildProcessComplexJobSuccessReturn({})));
    });

    /** Contract: isProcessComplexJobSuccessReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessComplexJobSuccessReturn(x));
        }
    });

    /** Contract: isProcessComplexJobSuccessReturn rejects a corrupted planned. */
    await t.step('rejects planned corrupted', () => {
        assert(!isProcessComplexJobSuccessReturn(invalidateProcessComplexJobSuccessReturn({ planned: 'not-true' })));
    });

    /** Contract: isProcessComplexJobSuccessReturn rejects an absent planned. */
    await t.step('rejects planned omitted', () => {
        const { planned: _omit, ...rest } = buildProcessComplexJobSuccessReturn();
        assert(!isProcessComplexJobSuccessReturn(rest));
    });
});

Deno.test('Type Guard: isProcessComplexJobErrorReturn', async (t) => {
    /** Contract: isProcessComplexJobErrorReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessComplexJobErrorReturn(buildProcessComplexJobErrorReturn()));
    });

    /** Contract: isProcessComplexJobErrorReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessComplexJobErrorReturn(buildProcessComplexJobErrorReturn({})));
    });

    /** Contract: isProcessComplexJobErrorReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessComplexJobErrorReturn(x));
        }
    });

    /** Contract: isProcessComplexJobErrorReturn rejects a corrupted error. */
    await t.step('rejects error corrupted', () => {
        assert(!isProcessComplexJobErrorReturn(invalidateProcessComplexJobErrorReturn({ error: 'not-an-error' })));
    });

    /** Contract: isProcessComplexJobErrorReturn rejects a corrupted retriable. */
    await t.step('rejects retriable corrupted', () => {
        assert(!isProcessComplexJobErrorReturn(invalidateProcessComplexJobErrorReturn({ retriable: 'not-a-boolean' })));
    });

    /** Contract: isProcessComplexJobErrorReturn rejects an absent error. */
    await t.step('rejects error omitted', () => {
        const { error: _omit, ...rest } = buildProcessComplexJobErrorReturn();
        assert(!isProcessComplexJobErrorReturn(rest));
    });

    /** Contract: isProcessComplexJobErrorReturn rejects an absent retriable. */
    await t.step('rejects retriable omitted', () => {
        const { retriable: _omit, ...rest } = buildProcessComplexJobErrorReturn();
        assert(!isProcessComplexJobErrorReturn(rest));
    });
});

Deno.test('Type Guard: isProcessRenderJobSuccessReturn', async (t) => {
    /** Contract: isProcessRenderJobSuccessReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessRenderJobSuccessReturn(buildProcessRenderJobSuccessReturn()));
    });

    /** Contract: isProcessRenderJobSuccessReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessRenderJobSuccessReturn(buildProcessRenderJobSuccessReturn({})));
    });

    /** Contract: isProcessRenderJobSuccessReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessRenderJobSuccessReturn(x));
        }
    });

    /** Contract: isProcessRenderJobSuccessReturn rejects a corrupted rendered. */
    await t.step('rejects rendered corrupted', () => {
        assert(!isProcessRenderJobSuccessReturn(invalidateProcessRenderJobSuccessReturn({ rendered: 'not-true' })));
    });

    /** Contract: isProcessRenderJobSuccessReturn rejects an absent rendered. */
    await t.step('rejects rendered omitted', () => {
        const { rendered: _omit, ...rest } = buildProcessRenderJobSuccessReturn();
        assert(!isProcessRenderJobSuccessReturn(rest));
    });
});

Deno.test('Type Guard: isProcessRenderJobErrorReturn', async (t) => {
    /** Contract: isProcessRenderJobErrorReturn accepts the builder's valid default. */
    await t.step('accepts the valid default', () => {
        assert(isProcessRenderJobErrorReturn(buildProcessRenderJobErrorReturn()));
    });

    /** Contract: isProcessRenderJobErrorReturn accepts valid overrides. */
    await t.step('accepts valid overrides', () => {
        assert(isProcessRenderJobErrorReturn(buildProcessRenderJobErrorReturn({})));
    });

    /** Contract: isProcessRenderJobErrorReturn rejects null, undefined, a primitive, and an array. */
    await t.step('rejects non-objects', () => {
        for (const x of [null, undefined, 7, 'x', []]) {
            assert(!isProcessRenderJobErrorReturn(x));
        }
    });

    /** Contract: isProcessRenderJobErrorReturn rejects a corrupted error. */
    await t.step('rejects error corrupted', () => {
        assert(!isProcessRenderJobErrorReturn(invalidateProcessRenderJobErrorReturn({ error: 'not-an-error' })));
    });

    /** Contract: isProcessRenderJobErrorReturn rejects a corrupted retriable. */
    await t.step('rejects retriable corrupted', () => {
        assert(!isProcessRenderJobErrorReturn(invalidateProcessRenderJobErrorReturn({ retriable: 'not-a-boolean' })));
    });

    /** Contract: isProcessRenderJobErrorReturn rejects an absent error. */
    await t.step('rejects error omitted', () => {
        const { error: _omit, ...rest } = buildProcessRenderJobErrorReturn();
        assert(!isProcessRenderJobErrorReturn(rest));
    });

    /** Contract: isProcessRenderJobErrorReturn rejects an absent retriable. */
    await t.step('rejects retriable omitted', () => {
        const { retriable: _omit, ...rest } = buildProcessRenderJobErrorReturn();
        assert(!isProcessRenderJobErrorReturn(rest));
    });
});
