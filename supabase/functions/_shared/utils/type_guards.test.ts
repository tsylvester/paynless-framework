import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Tables, Json } from "../../types_db.ts";
import { 
    hasProcessingStrategy, 
    isDialecticContribution,
    isProjectContext,
    isStageContext,
    isSelectedAiProvider,
    validatePayload
} from './type_guards.ts';
import type { DialecticContributionRow } from '../../dialectic-service/dialectic.interface.ts';
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
    
    await t.step('should return false if progress_reporting is missing message_template', () => {
        const stage: Tables<'dialectic_stages'> = {
            id: '5',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'p5',
            display_name: 'Malformed Stage 2',
            slug: 'malformed-stage-2',
            description: 'Test stage 2.',
            input_artifact_rules: {
                processing_strategy: {
                    type: "task_isolation",
                    granularity: "per_thesis_contribution",
                    progress_reporting: {}
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

Deno.test('Type Guard: validatePayload', async (t) => {
    await t.step('should return a valid payload when all required fields are present', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModelIds: ['model-1', 'model-2'],
        };
        const validated = validatePayload(payload);
        assert(validated.sessionId === 'test-session');
        assert(validated.projectId === 'test-project');
        assert(Array.isArray(validated.selectedModelIds));
    });

    await t.step('should correctly handle all optional fields', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModelIds: ['model-1'],
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
            selectedModelIds: ['model-1'],
        };
        assertThrows(() => validatePayload(payload), Error, 'sessionId must be a string');
    });

    await t.step('should throw an error if projectId is missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            selectedModelIds: ['model-1'],
        };
        assertThrows(() => validatePayload(payload), Error, 'projectId must be a string');
    });

    await t.step('should throw an error if selectedModelIds is not an array of strings', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
            selectedModelIds: [1, 2, 3], // not strings
        };
        assertThrows(() => validatePayload(payload), Error, 'selectedModelIds must be an array of strings');
    });

    await t.step('should throw an error if selectedModelIds is missing', () => {
        const payload: Json = {
            sessionId: 'test-session',
            projectId: 'test-project',
        };
        assertThrows(() => validatePayload(payload), Error, 'selectedModelIds must be an array of strings');
    });
});
