import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Tables, Json } from "../../types_db.ts";
import { 
    hasProcessingStrategy, 
    isCitationsArray,
    isDialecticContribution,
    isDialecticJobPayload,
    isDialecticJobRow,
    isDialecticJobRowArray,
    isIsolatedExecutionDeps,
    isJobResultsWithModelProcessing,
    isModelProcessingResult,
    isProjectContext,
    isRecord,
    isStageContext,
    isSelectedAiProvider,
    isSuccessPayload,
    isUserRole,
    validatePayload
} from './type_guards.ts';
import type { DialecticContributionRow, DialecticJobRow } from '../../dialectic-service/dialectic.interface.ts';
import type { IIsolatedExecutionDeps } from "../../dialectic-worker/task_isolator.ts";
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
            chatId: 'test-chat',
            walletId: 'test-wallet',
            continueUntilComplete: true,
            maxRetries: 5,
            continuation_count: 2,
            target_contribution_id: 'target-contrib',
        };
        const validated = validatePayload(payload);
        assert(validated.stageSlug === 'test-stage');
        assert(validated.iterationNumber === 1);
        assert(validated.chatId === 'test-chat');
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

Deno.test('Type Guard: isIsolatedExecutionDeps', async (t) => {
    await t.step('should return true for valid IIsolatedExecutionDeps object', () => {
        const mockSeedPromptData = {
            content: 'test prompt content',
            fullPath: 'bucket/path/file.md',
            bucket: 'test-bucket',
            path: 'path/file.md',
            fileName: 'file.md'
        };
        const mockStrategy = { type: 'task_isolation', granularity: 'per_thesis_contribution', progress_reporting: { message_template: 'test' } };
        
        const deps = {
            getSourceStage: async () => ({ id: '1', slug: 'test' }),
            calculateTotalSteps: (strategy: unknown, models: unknown[], contributions: unknown[]) => models.length * contributions.length,
            getSeedPromptForStage: async () => mockSeedPromptData,
        };
        assert(isIsolatedExecutionDeps(deps));
    });

    await t.step('should return true for object with additional properties beyond required functions', () => {
        const mockSeedPromptData = {
            content: 'test prompt content',
            fullPath: 'bucket/path/file.md',
            bucket: 'test-bucket',
            path: 'path/file.md',
            fileName: 'file.md'
        };
        
        const deps = {
            getSourceStage: async () => ({ id: '1', slug: 'test' }),
            calculateTotalSteps: (strategy: unknown, models: unknown[], contributions: unknown[]) => 42,
            getSeedPromptForStage: async () => mockSeedPromptData,
            extraProperty: 'this should not break validation',
            anotherFunction: () => 'additional function',
        };
        assert(isIsolatedExecutionDeps(deps));
    });

    await t.step('should return false when getSourceStage is missing', () => {
        const mockSeedPromptData = {
            content: 'test prompt content',
            fullPath: 'bucket/path/file.md',
            bucket: 'test-bucket',
            path: 'path/file.md',
            fileName: 'file.md'
        };
        
        const deps = {
            calculateTotalSteps: (strategy: unknown, models: unknown[], contributions: unknown[]) => 42,
            getSeedPromptForStage: async () => mockSeedPromptData,
        };
        assert(!isIsolatedExecutionDeps(deps));
    });

    await t.step('should return false when calculateTotalSteps is missing', () => {
        const mockSeedPromptData = {
            content: 'test prompt content',
            fullPath: 'bucket/path/file.md',
            bucket: 'test-bucket',
            path: 'path/file.md',
            fileName: 'file.md'
        };
        
        const deps = {
            getSourceStage: async () => ({ id: '1', slug: 'test' }),
            getSeedPromptForStage: async () => mockSeedPromptData,
        };
        assert(!isIsolatedExecutionDeps(deps));
    });

    await t.step('should return false when getSeedPromptForStage is missing', () => {
        const deps = {
            getSourceStage: async () => ({ id: '1', slug: 'test' }),
            calculateTotalSteps: (strategy: unknown, models: unknown[], contributions: unknown[]) => 42,
        };
        assert(!isIsolatedExecutionDeps(deps));
    });

    await t.step('should return false when required property is not a function', () => {
        const mockSeedPromptData = {
            content: 'test prompt content',
            fullPath: 'bucket/path/file.md',
            bucket: 'test-bucket',
            path: 'path/file.md',
            fileName: 'file.md'
        };
        
        const deps = {
            getSourceStage: 'not a function', // Invalid: not a function
            calculateTotalSteps: (strategy: unknown, models: unknown[], contributions: unknown[]) => 42,
            getSeedPromptForStage: async () => mockSeedPromptData,
        };
        assert(!isIsolatedExecutionDeps(deps));
    });

    await t.step('should return false for null', () => {
        assert(!isIsolatedExecutionDeps(null));
    });

    await t.step('should return false for non-object types', () => {
        assert(!isIsolatedExecutionDeps('string'));
        assert(!isIsolatedExecutionDeps(123));
        assert(!isIsolatedExecutionDeps(true));
        assert(!isIsolatedExecutionDeps([]));
    });

    await t.step('should return false for empty object', () => {
        assert(!isIsolatedExecutionDeps({}));
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
