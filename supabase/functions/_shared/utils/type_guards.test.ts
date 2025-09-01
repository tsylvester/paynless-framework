import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Tables, Json } from "../../types_db.ts";
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
    isContinuablePayload,
    isStringRecord,
    isDialecticStepInfo,
    isContributionType,
    isDialecticChunkMetadata,
    isFileType,
    isDocumentRelationships,
    isTokenUsage,
    isCanonicalPathParams,
    isChatMessageRole,
    isChatMessageRow,
    isChatInsert,
    hasModelResultWithContributionId,
    isKnownTiktokenEncoding,
    isChatApiRequest,
    isApiChatMessage,
    isFinishReason,
    isContinueReason,
} from './type_guards.ts';
import type { DialecticContributionRow, DialecticJobRow, FailedAttemptError } from '../../dialectic-service/dialectic.interface.ts';
import type { AiModelExtendedConfig, TokenUsage, ChatInsert, ChatApiRequest, FinishReason } from '../types.ts';
import { ProjectContext, StageContext } from '../prompt-assembler.interface.ts';
import { CanonicalPathParams } from '../types/file_manager.types.ts';

Deno.test('Type Guard: isChatInsert', async (t) => {
    await t.step('should return true for a valid minimal ChatInsert object', () => {
        const insert: ChatInsert = {
            user_id: 'user1',
            created_at: new Date().toISOString(),
            id: 'chat1',
            organization_id: 'org1',
            system_prompt_id: 'prompt1',
            title: 'Test Chat',
            updated_at: new Date().toISOString(),
        };
        assert(isChatInsert(insert));
    });

    await t.step('should return true for a full ChatInsert object', () => {
        const insert: ChatInsert = {
            id: 'chat1',
            user_id: 'user1',
            organization_id: 'org1',
            system_prompt_id: 'prompt1',
            title: 'Test Chat',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        assert(isChatInsert(insert));
    });

    await t.step('should return false if user_id is missing', () => {
        const insert = { title: 'Test Chat' };
        assert(!isChatInsert(insert));
    });

    await t.step('should return false if an optional field has the wrong type', () => {
        const insert = { user_id: 'user1', title: 123 };
        assert(!isChatInsert(insert));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isChatInsert(null));
        assert(!isChatInsert('a string'));
    });
});

Deno.test('Type Guard: isChatApiRequest (RED for step 74)', async (t) => {
    await t.step('accepts minimal valid request', () => {
        const req: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-1',
            promptId: '__none__',
        };
        assert(isChatApiRequest(req));
    });

    await t.step('accepts extended fields: systemInstruction, messages, resourceDocuments, walletId', () => {
        const req: ChatApiRequest = {
            message: 'Hi there',
            providerId: 'prov-123',
            promptId: '__none__',
            walletId: 'wallet-1',
            systemInstruction: 'Be concise',
            messages: [
                { role: 'user', content: 'Earlier' },
                { role: 'assistant', content: 'Reply' },
            ],
            resourceDocuments: [
                { id: 'doc-1', content: 'Context A' },
            ],
        };
        assert(isChatApiRequest(req));
        // Ensure messages elements pass the narrower guard as well
        assert(req.messages?.every(m => isApiChatMessage({ role: m.role, content: m.content })) === true);
    });

    await t.step('rejects missing required fields', () => {
        const bad1 = { providerId: 'p', promptId: '__none__' };
        const bad2 = { message: 'x', promptId: '__none__' };
        const bad3 = { message: 'x', providerId: 'p' };
        assert(!isChatApiRequest(bad1));
        assert(!isChatApiRequest(bad2));
        assert(!isChatApiRequest(bad3));
    });

    await t.step('rejects wrong-typed required fields', () => {
        const bad = { message: 123, providerId: 'p', promptId: '__none__' };
        assert(!isChatApiRequest(bad));
    });

    await t.step('rejects non-object', () => {
        assert(!isChatApiRequest(null));
        assert(!isChatApiRequest('string'));
        assert(!isChatApiRequest(123));
        assert(!isChatApiRequest([]));
    });
});

Deno.test('Type Guard: isChatMessageRow', async (t) => {
    const baseMessage: Tables<'chat_messages'> = {
        id: 'msg1',
        chat_id: 'chat1',
        user_id: 'user1',
        role: 'user',
        content: 'Hello, world!',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active_in_thread: true,
        token_usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        ai_provider_id: null,
        system_prompt_id: null,
        error_type: null,
        response_to_message_id: null,
    };

    await t.step('should return true for a valid chat message row', () => {
        assert(isChatMessageRow(baseMessage));
    });

    await t.step('should return true for a message with all nullable fields as null', () => {
        const message = { ...baseMessage };
        assert(isChatMessageRow(message));
    });

    await t.step('should return false if a required field is missing (e.g., chat_id)', () => {
        const { chat_id, ...invalidMessage } = baseMessage;
        assert(!isChatMessageRow(invalidMessage));
    });

    await t.step('should return false if a field has the wrong type (e.g., is_active_in_thread)', () => {
        const invalidMessage = { ...baseMessage, is_active_in_thread: 'yes' };
        assert(!isChatMessageRow(invalidMessage));
    });

    await t.step('should return false if a nullable field has the wrong type (e.g., user_id)', () => {
        const invalidMessage = { ...baseMessage, user_id: 123 };
        assert(!isChatMessageRow(invalidMessage));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isChatMessageRow(null));
        assert(!isChatMessageRow('a string'));
    });
});

Deno.test('Type Guard: isChatMessageRole', async (t) => {
    await t.step('should return true for valid roles', () => {
        assert(isChatMessageRole('system'));
        assert(isChatMessageRole('user'));
        assert(isChatMessageRole('assistant'));
    });

    await t.step('should return false for invalid roles', () => {
        assert(!isChatMessageRole('admin'));
        assert(!isChatMessageRole(''));
        assert(!isChatMessageRole(' user'));
    });

    await t.step('should return false for non-string values', () => {
        assert(!isChatMessageRole(null as unknown as string));
        assert(!isChatMessageRole(123 as unknown as string));
        assert(!isChatMessageRole({} as unknown as string));
    });
});

Deno.test('Type Guard: isCanonicalPathParams', async (t) => {
    await t.step('should return true for a valid CanonicalPathParams object', () => {
        const params: CanonicalPathParams = {
            contributionType: 'thesis',
            sourceModelSlugs: ['model-1', 'model-2'],
        };
        assert(isCanonicalPathParams(params));
    });

    await t.step('should return true for a minimal CanonicalPathParams object', () => {
        const params: CanonicalPathParams = {
            contributionType: 'synthesis',
        };
        assert(isCanonicalPathParams(params));
    });

    await t.step('should return false if contributionType is missing', () => {
        const params = {
            sourceModelSlugs: ['model-1'],
        };
        assert(!isCanonicalPathParams(params));
    });

    await t.step('should return false if contributionType is not a string', () => {
        const params = {
            contributionType: 123,
        };
        assert(!isCanonicalPathParams(params));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isCanonicalPathParams(null));
        assert(!isCanonicalPathParams('a string'));
        assert(!isCanonicalPathParams([]));
    });
});

Deno.test('Type Guard: isTokenUsage', async (t) => {
    await t.step('should return true for a valid TokenUsage object', () => {
        const usage: TokenUsage = {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
        };
        assert(isTokenUsage(usage));
    });

    await t.step('should return false if prompt_tokens is missing', () => {
        const usage = { completion_tokens: 200, total_tokens: 300 };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false if completion_tokens is missing', () => {
        const usage = { prompt_tokens: 100, total_tokens: 300 };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false if total_tokens is missing', () => {
        const usage = { prompt_tokens: 100, completion_tokens: 200 };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false if a property has the wrong type', () => {
        const usage = {
            prompt_tokens: '100',
            completion_tokens: 200,
            total_tokens: 300,
        };
        assert(!isTokenUsage(usage));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isTokenUsage(null));
        assert(!isTokenUsage('a string'));
        assert(!isTokenUsage(123));
        assert(!isTokenUsage([]));
    });
});

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
            updated_at: new Date().toISOString(),
            document_relationships: null
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
            document_relationships: null
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
            updated_at: new Date().toISOString(),
            is_default_embedding: false
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
        assert(!isJson(BigInt(9007199254740991)));
    });

    await t.step('should return false for objects containing non-JSON values', () => {
        assert(isJson({ key: undefined }));
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

    await t.step('should return false if inputs_required is not an array', () => {
        const recipe = {
            processing_strategy: { type: 'task_isolation' },
            steps: [
                { step: 1, prompt_template_name: 'p1', granularity_strategy: 'g1', output_type: 'o1', inputs_required: 'not-an-array' }
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

    await t.step('should return false if current_step is not a number', () => {
        const payload = {
            job_type: 'plan',
            step_info: { current_step: '1' }
        };
        assert(!isDialecticPlanJobPayload(payload));
    });
});

Deno.test('Type Guard: isDialecticExecuteJobPayload', async (t) => {
    const basePayload = {
        job_type: 'execute',
        prompt_template_name: 'p1',
        inputs: {},
        output_type: 'thesis',
    };

    await t.step('should return true for a valid execute job payload with minimal canonical params', () => {
        const payload = {
            ...basePayload,
            canonicalPathParams: {
                contributionType: 'thesis',
            },
        };
        assert(isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return true for an execute job payload without prompt_template_name (simple flow)', () => {
        const payload = {
            job_type: 'execute',
            inputs: {},
            output_type: 'thesis',
            canonicalPathParams: {
                contributionType: 'thesis',
            },
        };
        assert(isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return true for a valid execute job payload with full canonical params', () => {
        const payload = {
            ...basePayload,
            canonicalPathParams: {
                contributionType: 'synthesis',
                sourceModelSlugs: ['model-1', 'model-2'],
                sourceContributionIdShort: 'abcdef',
            },
        };
        assert(isDialecticExecuteJobPayload(payload));
    });
    
    await t.step('should return false if job_type is wrong', () => {
        const payload = {
            job_type: 'plan',
            prompt_template_name: 'p1',
            inputs: {},
            canonicalPathParams: { contributionType: 'thesis' },
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if canonicalPathParams is missing', () => {
        const payload = { ...basePayload };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if canonicalPathParams is not an object', () => {
        const payload = {
            ...basePayload,
            canonicalPathParams: 'invalid',
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if canonicalPathParams is missing contributionType', () => {
        const payload = {
            ...basePayload,
            canonicalPathParams: {},
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if it contains the legacy originalFileName property', () => {
        const payload = {
            ...basePayload,
            canonicalPathParams: { contributionType: 'thesis' },
            originalFileName: 'legacy-file.txt',
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if inputs is missing', () => {
        const payload = {
            job_type: 'execute',
            prompt_template_name: 'p1',
            canonicalPathParams: { contributionType: 'thesis' },
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if prompt_template_name is not a string', () => {
        const payload = {
            job_type: 'execute',
            prompt_template_name: 123,
            inputs: {},
            canonicalPathParams: { contributionType: 'thesis' },
        };
        assert(!isDialecticExecuteJobPayload(payload));
    });

    await t.step('should return false if inputs is not a record', () => {
        const payload = {
            job_type: 'execute',
            prompt_template_name: 'p1',
            inputs: 'not-a-record',
            canonicalPathParams: { contributionType: 'thesis' },
        };
        assert(!isDialecticExecuteJobPayload(payload));
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

Deno.test('Type Guard: isStringRecord', async (t) => {
    await t.step('should return true for a record with only string values', () => {
        const record = { key1: 'value1', key2: 'value2' };
        assert(isStringRecord(record));
    });

    await t.step('should return true for an empty record', () => {
        const record = {};
        assert(isStringRecord(record));
    });

    await t.step('should return false for a record with a non-string value', () => {
        const record = { key1: 'value1', key2: 123 };
        assert(!isStringRecord(record));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isStringRecord(null));
        assert(!isStringRecord('a string'));
        assert(!isStringRecord(['a', 'b']));
    });
});

Deno.test('Type Guard: isDialecticStepInfo', async (t) => {
    await t.step('should return true for a valid step info object', () => {
        const stepInfo = { current_step: 1, total_steps: 5 };
        assert(isDialecticStepInfo(stepInfo));
    });

    await t.step('should return false if current_step is missing', () => {
        const stepInfo = { total_steps: 5 };
        assert(!isDialecticStepInfo(stepInfo));
    });

    await t.step('should return false if total_steps is not a number', () => {
        const stepInfo = { current_step: 1, total_steps: '5' };
        assert(!isDialecticStepInfo(stepInfo));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isDialecticStepInfo(null));
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
        'final_synthesis'
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

import { FileType } from '../types/file_manager.types.ts';

Deno.test('Type Guard: isFileType', async (t) => {
    for (const type of Object.values(FileType)) {
        await t.step(`should return true for valid file type: ${type}`, () => {
            assert(isFileType(type));
        });
    }

    await t.step('should return false for an invalid file type string', () => {
        assert(!isFileType('invalid_file_type'));
    });

    await t.step('should return false for a non-string value', () => {
        assert(!isFileType(null));
        assert(!isFileType(undefined));
        assert(!isFileType(123));
        assert(!isFileType({}));
        assert(!isFileType([]));
    });

    await t.step('should return false for a string that is a valid ContributionType but not a FileType', () => {
        assert(!isFileType('thesis'));
        assert(!isFileType('antithesis'));
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


Deno.test('Type Guard: isKnownTiktokenEncoding', async (t) => {
    await t.step('should return true for supported encoding names', () => {
        assert(isKnownTiktokenEncoding('cl100k_base'));
        assert(isKnownTiktokenEncoding('p50k_base'));
        assert(isKnownTiktokenEncoding('r50k_base'));
        assert(isKnownTiktokenEncoding('gpt2'));
    });

    await t.step('should return false for unsupported encoding names', () => {
        assert(!isKnownTiktokenEncoding('o200k_base'));
        assert(!isKnownTiktokenEncoding('unknown_encoding'));
        assert(!isKnownTiktokenEncoding(''));
    });

    await t.step('should return false for non-string values', () => {
        assert(!isKnownTiktokenEncoding(null));
        assert(!isKnownTiktokenEncoding(undefined));
        assert(!isKnownTiktokenEncoding(123));
        assert(!isKnownTiktokenEncoding({}));
        assert(!isKnownTiktokenEncoding([]));
    });
});

// New tests for FinishReason guards
Deno.test('Type Guard: isFinishReason and isContinueReason', async (t) => {
    await t.step('isFinishReason accepts full set and null; isContinueReason only accepts continuation subset', () => {
        const all: (FinishReason)[] = [
            'stop','length','tool_calls','content_filter','function_call','error','unknown','max_tokens','content_truncated',null
        ];
        for (const r of all) {
            // unknown → FinishReason
            const val = r;
            assert(isFinishReason(val));
        }

        // Continuation subset
        const contTrue: FinishReason[] = ['max_tokens','length','content_truncated','unknown'];
        const contFalse: FinishReason[] = ['stop','tool_calls','content_filter','function_call','error', null];

        for (const r of contTrue) {
            assert(isContinueReason(r));
        }
        for (const r of contFalse) {
            assert(!isContinueReason(r));
        }
    });
});
