import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Tables, Json } from "../../types_db.ts";
import { 
    hasProcessingStrategy, 
    isCitationsArray,
    isDialecticContribution,
    isDialecticJobPayload,
    isDialecticCombinationJobPayload,
    isDialecticJobRow,
    isDialecticJobRowArray,
    isFailedAttemptError,
    isFailedAttemptErrorArray,
    isJobResultsWithModelProcessing,
    isModelProcessingResult,
    isProjectContext,
    isRecord,
    isStageContext,
    isSelectedAiProvider,
    isSuccessPayload,
    isUserRole,
    validatePayload,
    isJson,
    isAiModelExtendedConfig,
    hasStepsRecipe,
    isDialecticStageRecipe,
    isDialecticPlanJobPayload,
    isDialecticExecuteJobPayload,
} from './type_guards.ts';
import type { DialecticContributionRow, DialecticJobRow, FailedAttemptError } from '../../dialectic-service/dialectic.interface.ts';
import type { AiModelExtendedConfig } from '../types.ts';
import { ProjectContext, StageContext } from '../prompt-assembler.interface.ts';

Deno.test('Type Guard: hasProcessingStrategy', async (t) => {
    await t.step('should return true for a stage with a valid processing_strategy', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '1',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p1',
            display_name: 'Antithesis',
            slug: 'antithesis',
            description: 'Critique the thesis.',
            input_artifact_rules: {
                processing_strategy: {
                    type: "task_isolation",
                    granularity: "per_thesis_contribution",
                    description: "Critiques each thesis individually, resulting in n*m calls.",
                    progress_reporting: {
                        message_template: "Critiquing thesis {current_item} of {total_items} using {model_name}..."
                    }
                }
            },
            expected_output_artifacts: []
        };
        assert(hasProcessingStrategy(stage));
    });

    await t.step('should return false if processing_strategy is missing', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '2',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p2',
            display_name: 'Thesis',
            slug: 'thesis',
            description: 'Initial idea.',
            input_artifact_rules: {},
            expected_output_artifacts: []
        };
        assert(!hasProcessingStrategy(stage));
    });

    await t.step('should return false if input_artifact_rules is null', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '3',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p3',
            display_name: 'Synthesis',
            slug: 'synthesis',
            description: 'Combine thesis and antithesis.',
            input_artifact_rules: null,
            expected_output_artifacts: []
        };
        assert(!hasProcessingStrategy(stage));
    });

    await t.step('should return false if processing_strategy is malformed (missing type)', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '4',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p4',
            display_name: 'Malformed Stage',
            slug: 'malformed-stage',
            description: 'Test stage.',
            input_artifact_rules: {
                processing_strategy: {
                    granularity: "per_thesis_contribution",
                    progress_reporting: {
                        message_template: "Processing {current_item}..."
                    }
                }
            },
            expected_output_artifacts: []
        };
        assert(!hasProcessingStrategy(stage));
    });
});

Deno.test('Type Guard: isStageContext', async (t) => {
    await t.step('should return true for a valid stage context object', () => {
        const context: StageContext = {
            id: 's1',
            slug: 'thesis',
            system_prompts: { prompt_text: 'test' },
            domain_specific_prompt_overlays: [],
            created_at: '',
            default_system_prompt_id: null,
            description: null,
            display_name: '',
            expected_output_artifacts: null,
            input_artifact_rules: null,
        };
        assert(isStageContext(context));
    });

    await t.step('should return true for a stage context with null system_prompts', () => {
        const context: StageContext = {
            id: 's2',
            slug: 'antithesis',
            system_prompts: null,
            domain_specific_prompt_overlays: [{ overlay_values: {} }],
            created_at: '',
            default_system_prompt_id: null,
            description: null,
            display_name: '',
            expected_output_artifacts: null,
            input_artifact_rules: null,
        };
        assert(isStageContext(context));
    });

    await t.step('should return false if a required field is missing (slug)', () => {
        const invalidContext = {
            id: 's3',
            system_prompts: null,
            domain_specific_prompt_overlays: [],
        };
        assert(!isStageContext(invalidContext));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isStageContext('a string'));
    });
});

Deno.test('Type Guard: isProjectContext', async (t) => {
    await t.step('should return true for a valid project context object', () => {
        const context: ProjectContext = {
            id: 'p1',
            project_name: 'Test Project',
            initial_user_prompt: 'Do a thing',
            dialectic_domains: { name: 'Software Engineering' },
            created_at: '',
            initial_prompt_resource_id: null,
            process_template_id: null,
            repo_url: null,
            selected_domain_id: '',
            selected_domain_overlay_id: null,
            status: '',
            updated_at: '',
            user_domain_overlay_values: null,
            user_id: ''
        };
        assert(isProjectContext(context));
    });

    await t.step('should return false if a required field is missing (project_name)', () => {
        const invalidContext = {
            id: 'p2',
            initial_user_prompt: 'Do a thing',
            dialectic_domains: { name: 'Data Science' },
        };
        assert(!isProjectContext(invalidContext));
    });

    await t.step('should return false if a nested required field is missing (dialectic_domains.name)', () => {
        const invalidContext = {
            id: 'p3',
            project_name: 'Test Project 3',
            initial_user_prompt: 'Do a thing',
            dialectic_domains: {},
        };
        assert(!isProjectContext(invalidContext));
    });

    await t.step('should return false for null', () => {
        assert(!isProjectContext(null));
    });
});

Deno.test('Type Guard: isCitationsArray', async (t) => {
    await t.step('should return true for a valid array of Citation objects', () => {
        const citations = [
            { text: 'Source 1', url: 'http://example.com/1' },
            { text: 'Source 2' }
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
            updated_at: new Date().toISOString()
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
            updated_at: new Date().toISOString()
        };
        assert(isDialecticContribution(contribution));
    });

    await t.step('should return false for an object missing a required field (session_id)', () => {
        const invalidContribution = {
            id: 'c3',
            created_at: new Date().toISOString(),
            stage: 'thesis',
            iteration_number: 1,
            model_id: 'm1'
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

Deno.test('Type Guard: isSelectedAiProvider', async (t) => {
    await t.step('should return true for a valid provider object', () => {
        const provider: Tables<'ai_providers'> = {
            id: 'p1',
            created_at: new Date().toISOString(),
            provider: 'openai',
            name: 'GPT-4',
            api_identifier: 'gpt-4',
            config: null,
            description: 'Test provider',
            is_active: true,
            is_enabled: true,
            updated_at: new Date().toISOString()
        };
        assert(isSelectedAiProvider(provider));
    });

    await t.step('should return false if required field is missing (api_identifier)', () => {
        const invalidProvider = {
            id: 'p2',
            provider: 'anthropic',
            name: 'Claude 3'
        };
        assert(!isSelectedAiProvider(invalidProvider));
    });
    
    await t.step('should return false if required string is empty (name)', () => {
        const invalidProvider = {
            id: 'p3',
            provider: 'google',
            name: '',
            api_identifier: 'gemini-pro'
        };
        assert(!isSelectedAiProvider(invalidProvider));
    });

    await t.step('should return false for a plain object', () => {
        const obj = { foo: 'bar' };
        assert(!isSelectedAiProvider(obj));
    });

    await t.step('should return false for null', () => {
        assert(!isSelectedAiProvider(null));
    });
});

Deno.test('Type Guard: isRecord', async (t) => {
    await t.step('should return true for a standard object', () => {
        assert(isRecord({ a: 1, b: 'test' }));
    });

    await t.step('should return true for an empty object', () => {
        assert(isRecord({}));
    });

    await t.step('should return false for null', () => {
        assert(!isRecord(null));
    });

    await t.step('should return false for an array', () => {
        assert(!isRecord([1, 2, 3]));
    });

    await t.step('should return false for a string', () => {
        assert(!isRecord('this is a string'));
    });

    await t.step('should return false for a number', () => {
        assert(!isRecord(123));
    });
});

Deno.test('Type Guard: validatePayload', async (t) => {
    await t.step('should return a valid payload when all required fields are present', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 'model-1',
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
        };
        assertThrows(() => validatePayload(payload), Error, 'Payload must have model_id (string)');
    });

    await t.step('should throw an error if model_id is missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
        };
        assertThrows(() => validatePayload(payload), Error, 'Payload must have model_id (string)');
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

    await t.step('should return false when model_id contains a non-string', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            model_id: 123, // Invalid: contains number
            prompt: 'Valid prompt',
        };
        assert(!isDialecticJobPayload(payload));
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

Deno.test('Type Guard: isSuccessPayload', async (t) => {
    await t.step('should return true for a valid success payload', () => {
        const payload = { success: true, message: 'Operation was successful.' };
        assert(isSuccessPayload(payload));
    });

    await t.step('should return false if success property is missing', () => {
        const payload = { message: 'Missing success property.' };
        assert(!isSuccessPayload(payload));
    });

    await t.step('should return false if message property is missing', () => {
        const payload = { success: true };
        assert(!isSuccessPayload(payload));
    });

    await t.step('should return false if success is not a boolean', () => {
        const payload = { success: 'true', message: 'Success is a string.' };
        assert(!isSuccessPayload(payload));
    });

    await t.step('should return false if message is not a string', () => {
        const payload = { success: true, message: 123 };
        assert(!isSuccessPayload(payload));
    });

    await t.step('should return false for null', () => {
        assert(!isSuccessPayload(null));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isSuccessPayload('a string'));
    });
});


Deno.test('Type Guard: isUserRole', async (t) => {
    await t.step('should return true for valid user roles', () => {
        assert(isUserRole('user'));
        assert(isUserRole('admin'));
    });

    await t.step('should return false for invalid string roles', () => {
        assert(!isUserRole('guest'));
        assert(!isUserRole('superadmin'));
        assert(!isUserRole(''));
        assert(!isUserRole(' authenticated ')); // Check for spaces
        assert(!isUserRole('Authenticated')); // Check for case sensitivity
        assert(!isUserRole('user '));
    });

    await t.step('should return false for non-string values', () => {
        assert(!isUserRole(null));
        assert(!isUserRole(undefined));
        assert(!isUserRole(123));
        assert(!isUserRole({ role: 'user' }));
        assert(!isUserRole(['user']));
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
        };
        assert(isDialecticJobRow(job));
    });

    await t.step('should return false if a required field is missing (e.g., status)', () => {
        const job = {
            id: 'j2',
            session_id: 's1',
            user_id: 'u1',
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: {},
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
        };
        assert(!isDialecticJobRow(job));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isDialecticJobRow(null));
        assert(!isDialecticJobRow('job'));
    });
});

Deno.test('Type Guard: isJson', async (t) => {
    await t.step('should return true for primitive JSON types', () => {
        assert(isJson('a string'));
        assert(isJson(123.45));
        assert(isJson(true));
        assert(isJson(false));
        assert(isJson(null));
    });

    await t.step('should return true for valid JSON objects', () => {
        assert(isJson({}));
        assert(isJson({ key: 'value', number: 1, bool: true, nullable: null }));
        assert(isJson({ nested: { a: 1 } }));
    });

    await t.step('should return true for valid JSON arrays', () => {
        assert(isJson([]));
        assert(isJson([1, 'two', false, null]));
        assert(isJson([{ a: 1 }, { b: 2 }]));
        assert(isJson([1, [2, [3]]]));
    });

    await t.step('should return true for complex nested structures', () => {
        const complex = {
            a: 'string',
            b: [1, { c: true, d: [null] }],
            e: { f: { g: 'nested' } }
        };
        assert(isJson(complex));
    });

    await t.step('should return false for non-JSON primitives', () => {
        assert(!isJson(undefined));
        assert(!isJson(Symbol('s')));
        // deno-lint-ignore no-explicit-any
        assert(!isJson(BigInt(9007199254740991) as any));
    });

    await t.step('should return false for objects containing non-JSON values', () => {
        assert(!isJson({ key: undefined }));
        assert(!isJson({ key: () => 'function' }));
        assert(!isJson({ key: new Date() }));
        assert(!isJson({ key: new Map() }));
    });

    await t.step('should return false for arrays containing non-JSON values', () => {
        assert(!isJson([1, undefined, 3]));
        assert(!isJson([new Set()]));
    });

    await t.step('should return false for class instances', () => {
        class MyClass {
            // deno-lint-ignore no-explicit-any
            constructor(public prop: any) {}
        }
        const instance = new MyClass('test');
        assert(!isJson(instance));
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

Deno.test('Type Guard: isAiModelExtendedConfig', async (t) => {
    await t.step('should return true for a valid config with tiktoken strategy', () => {
        const config: AiModelExtendedConfig = {
            api_identifier: 'gpt-4',
            input_token_cost_rate: 0.01,
            output_token_cost_rate: 0.03,
            tokenization_strategy: {
                type: 'tiktoken',
                tiktoken_encoding_name: 'cl100k_base',
            },
        };
        assert(isAiModelExtendedConfig(config));
    });

    await t.step('should return true for a valid config with rough_char_count strategy', () => {
        const config: AiModelExtendedConfig = {
            api_identifier: 'claude-3',
            input_token_cost_rate: 0.005,
            output_token_cost_rate: 0.015,
            tokenization_strategy: {
                type: 'rough_char_count',
                chars_per_token_ratio: 3.5,
            },
        };
        assert(isAiModelExtendedConfig(config));
    });

    await t.step('should return false if tokenization_strategy is missing', () => {
        const config = {
            api_identifier: 'gpt-4',
            input_token_cost_rate: 0.01,
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false if tokenization_strategy is not an object', () => {
        const config = {
            api_identifier: 'gpt-4',
            tokenization_strategy: 'tiktoken',
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false if tiktoken_encoding_name is missing for tiktoken strategy', () => {
        const config = {
            api_identifier: 'gpt-4',
            tokenization_strategy: {
                type: 'tiktoken',
            },
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false if chars_per_token_ratio is not a number', () => {
        const config = {
            api_identifier: 'claude-3',
            tokenization_strategy: {
                type: 'rough_char_count',
                chars_per_token_ratio: 'four',
            },
        };
        assert(!isAiModelExtendedConfig(config));
    });

    await t.step('should return false for null or non-object input', () => {
        assert(!isAiModelExtendedConfig(null));
        assert(!isAiModelExtendedConfig('a string'));
        assert(!isAiModelExtendedConfig(123));
        assert(!isAiModelExtendedConfig([]));
    });
});

Deno.test('Type Guard: hasStepsRecipe', async (t) => {
    await t.step('should return true for a stage with a valid steps array', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '1',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p1',
            display_name: 'Synthesis',
            slug: 'synthesis',
            description: 'Combine all the things.',
            input_artifact_rules: {
                steps: [
                    { step_number: 1, step_name: 'Step One' },
                    { step_number: 2, step_name: 'Step Two' },
                ]
            },
            expected_output_artifacts: []
        };
        assert(hasStepsRecipe(stage));
    });

    await t.step('should return true for a stage with an empty steps array', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '2',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p2',
            display_name: 'Empty Stage',
            slug: 'empty-stage',
            description: 'A stage with no steps.',
            input_artifact_rules: {
                steps: []
            },
            expected_output_artifacts: []
        };
        assert(hasStepsRecipe(stage));
    });

    await t.step('should return false if steps property is missing', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '3',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p3',
            display_name: 'Thesis',
            slug: 'thesis',
            description: 'Initial idea.',
            input_artifact_rules: {
                sources: [{ type: 'prompt' }]
            },
            expected_output_artifacts: []
        };
        assert(!hasStepsRecipe(stage));
    });

    await t.step('should return false if steps property is not an array', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '4',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p4',
            display_name: 'Malformed Stage',
            slug: 'malformed-stage',
            description: 'Test stage.',
            input_artifact_rules: {
                steps: { '0': 'not an array' }
            },
            expected_output_artifacts: []
        };
        assert(!hasStepsRecipe(stage));
    });

    await t.step('should return false if input_artifact_rules is null', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '5',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p5',
            display_name: 'Simple Stage',
            slug: 'simple-stage',
            description: 'A simple stage.',
            input_artifact_rules: null,
            expected_output_artifacts: []
        };
        assert(!hasStepsRecipe(stage));
    });
});

Deno.test('Type Guard: isDialecticCombinationJobPayload', async (t) => {
    await t.step('should return true for a valid combination job payload', () => {
        const payload = {
            job_type: 'combine',
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1',
            inputs: {
                document_ids: ['doc1', 'doc2']
            }
        };
        assert(isDialecticCombinationJobPayload(payload));
    });

    await t.step('should return true if inputs is missing', () => {
        const payload = {
            job_type: 'combine',
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1'
        };
        assert(isDialecticCombinationJobPayload(payload));
    });

    await t.step('should return false if job_type is not combine', () => {
        const payload = {
            job_type: 'execute',
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1'
        };
        assert(!isDialecticCombinationJobPayload(payload));
    });

    await t.step('should return false if document_ids is not an array of strings', () => {
        const payload = {
            job_type: 'combine',
            sessionId: 's1',
            projectId: 'p1',
            model_id: 'm1',
            inputs: {
                document_ids: ['doc1', 123]
            }
        };
        assert(!isDialecticCombinationJobPayload(payload));
    });
});

Deno.test('Type Guard: isDialecticStageRecipe', async (t) => {
    await t.step('should return true for a valid recipe', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                { step: 1, prompt_template_name: 'p1', granularity_strategy: 'g1', output_type: 'o1', inputs_required: [] }
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

    await t.step('should return false if a step is malformed', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                { prompt_template_name: 'p1' }
            ]
        };
        assert(!isDialecticStageRecipe(recipe));
    });
});

Deno.test('Type Guard: isDialecticPlanJobPayload', async (t) => {
    await t.step('should return true for a valid plan job payload', () => {
        const payload = {
            job_type: 'plan',
            step_info: { current_step: 1 }
        };
        assert(isDialecticPlanJobPayload(payload));
    });

    await t.step('should return false if job_type is wrong', () => {
        const payload = {
            job_type: 'execute',
            step_info: { current_step: 1 }
        };
        assert(!isDialecticPlanJobPayload(payload));
    });
    
    await t.step('should return false if step_info is missing', () => {
        const payload = {
            job_type: 'plan'
        };
        assert(!isDialecticPlanJobPayload(payload));
    });
});

Deno.test('Type Guard: isDialecticExecuteJobPayload', async (t) => {
    await t.step('should return true for a valid execute job payload', () => {
        const payload = {
            job_type: 'execute',
            prompt_template_name: 'p1',
            inputs: {}
        };
        assert(isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if job_type is wrong', () => {
        const payload = {
            job_type: 'plan',
            prompt_template_name: 'p1',
            inputs: {}
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if inputs is missing', () => {
        const payload = {
            job_type: 'execute',
            prompt_template_name: 'p1'
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });
});
