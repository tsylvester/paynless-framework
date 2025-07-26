// supabase/functions/dialectic-worker/task_isolator.planner.test.ts
import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import { planComplexStage } from './task_isolator.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import {
    DialecticJobRow,
    DialecticStage,
    DialecticContributionRow,
    DialecticJobPayload
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { isDialecticJobPayload } from '../_shared/utils/type_guards.ts';
import { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';

// --- Mocks and Test Data ---
const MOCK_PAYLOAD: Json = {
    sessionId: 'session-123',
    projectId: 'project-123',
    stageSlug: 'antithesis',
    iterationNumber: 1,
    model_id: 'model-1',
    prompt: 'PROMPT',
};
if (!isDialecticJobPayload(MOCK_PAYLOAD)) {
    throw new Error("Test setup failed: MOCK_PAYLOAD is not a valid DialecticJobPayload.");
}

const MOCK_PARENT_JOB: DialecticJobRow = {
    id: 'job-parent-456',
    parent_job_id: null,
    session_id: 'session-123',
    user_id: 'user-123',
    stage_slug: 'antithesis',
    iteration_number: 1,
    payload: MOCK_PAYLOAD,
    status: 'processing',
    attempt_count: 1,
    max_retries: 3,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    results: null,
    error_details: null,
    target_contribution_id: null,
    prerequisite_job_id: null,
};



const MOCK_STAGE: DialecticStage & { system_prompts: null; domain_specific_prompt_overlays: never[] } = {
    id: 'stage-antithesis-id',
    slug: 'antithesis',
    display_name: 'Antithesis',
    input_artifact_rules: {
        processing_strategy: {
            type: 'task_isolation',
            granularity: 'per_thesis_contribution',
            description: '',
            progress_reporting: {
                message_template: 'Critiquing {current_item}/{total_items} using {model_name}'
            }
        },
        sources: [{ type: 'contribution', stage_slug: 'thesis', required: true }]
    },
    expected_output_artifacts: [],
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'sp-1',
    description: '',
    system_prompts: null, // Add missing property
    domain_specific_prompt_overlays: [], // Add missing property
};

const MOCK_PROJECT = {
    id: 'project-123',
    project_name: 'Test Project',
    initial_user_prompt: 'Test prompt',
    dialectic_domains: { name: 'Test Domain' },
    user_id: 'user-123',
    selected_domain_id: 'domain-1',
    process_template_id: 'template-123', // Add the missing property
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const MOCK_SESSION = {
    id: 'session-123',
    project_id: 'project-123',
    iteration_count: 1,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const MOCK_SOURCE_CONTRIBUTIONS: DialecticContributionRow[] = [
    { id: 'contrib-1', storage_path: 'p', file_name: 'f1.md', model_name: 'Model One', session_id: 'session-123', user_id: 'user-123', stage: 'thesis', iteration_number: 1, model_id: 'model-1', prompt_template_id_used: 'pt-1', seed_prompt_url: 'prompts/seed1.txt', edit_version: 1, is_latest_edit: true, original_model_contribution_id: null, raw_response_storage_path: 'raw/resp1.json', target_contribution_id: null, tokens_used_input: 100, tokens_used_output: 200, processing_time_ms: 500, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), contribution_type: 'thesis', storage_bucket: 'b', size_bytes: 100, mime_type: 'text/markdown' },
    { id: 'contrib-2', storage_path: 'p', file_name: 'f2.md', model_name: 'Model One', session_id: 'session-123', user_id: 'user-123', stage: 'thesis', iteration_number: 1, model_id: 'model-1', prompt_template_id_used: 'pt-1', seed_prompt_url: 'prompts/seed2.txt', edit_version: 1, is_latest_edit: true, original_model_contribution_id: null, raw_response_storage_path: 'raw/resp2.json', target_contribution_id: null, tokens_used_input: 110, tokens_used_output: 220, processing_time_ms: 550, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), contribution_type: 'thesis', storage_bucket: 'b', size_bytes: 120, mime_type: 'text/markdown' },
];

const MOCK_MODELS = [
    { id: 'model-1', name: 'Model One', api_identifier: 'model-one-api', provider: 'openai', config: { tokenization_strategy: { type: 'rough_char_count' }, max_context_window_tokens: 10000 }, user_id: 'user-123', created_at: new Date().toISOString() },
    { id: 'model-2', name: 'Model Two', api_identifier: 'model-two-api', provider: 'anthropic', config: { tokenization_strategy: { type: 'rough_char_count' }, max_context_window_tokens: 10000 }, user_id: 'user-123', created_at: new Date().toISOString() },
];

const MOCK_MODELS_SINGLE = [
    { id: 'model-1', name: 'Model One', api_identifier: 'model-one-api', provider: 'openai', config: { tokenization_strategy: { type: 'rough_char_count' }, max_context_window_tokens: 10000 }, user_id: 'user-123', created_at: new Date().toISOString() },
];

Deno.test('planComplexStage - Happy Path: Generates correct child job payloads', async () => {
    const complexStageSelectQuery = `
            *,
            system_prompts (*)
        `;
    const complexProjectSelectQuery = `
            *,
            dialectic_domains (*)
        `;

    const { client: mockDb, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: (state) => {
                    if (state.selectColumns && state.selectColumns.trim() === complexStageSelectQuery.trim()) {
                        return Promise.resolve({ data: [MOCK_STAGE], error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('Unexpected select query for dialectic_stages') });
                }
            },
            'dialectic_projects': {
                select: (state) => {
                    if (state.selectColumns && state.selectColumns.trim() === complexProjectSelectQuery.trim()) {
                        return Promise.resolve({ data: [MOCK_PROJECT], error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('Unexpected select query for dialectic_projects') });
                }
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_sessions': { select: { data: [MOCK_SESSION], error: null } },
            'dialectic_contributions': { select: { data: MOCK_SOURCE_CONTRIBUTIONS, error: null } },
            'ai_providers': { select: { data: MOCK_MODELS_SINGLE, error: null } }
        }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

    // Mock PromptAssembler
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);
    const gatherContextStub = stub(mockAssembler, 'gatherContext', (_p, _s, _st, _pu, _i, override) => {
        assertExists(override);
        assertEquals(override.length, 1);
        return Promise.resolve({
            user_objective: 'test',
            domain: 'test',
            agent_count: 2,
            context_description: 'test',
            prior_stage_ai_outputs: `Mocked contribution: ${override[0].content}`,
            prior_stage_user_feedback: '',
            deployment_context: null,
            reference_documents: null,
            constraint_boundaries: null,
            stakeholder_considerations: null,
            deliverable_format: 'markdown'
        });
    });
    const renderStub = stub(mockAssembler, 'render', (_stage, context) => {
        return `RENDERED_PROMPT: ${context.prior_stage_ai_outputs}`;
    });

    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };

    try {
        const childJobs = await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );

        assertEquals(childJobs.length, 2, "Should create n*m child jobs (2 sources * 1 model = 2)");

        // Verify gatherContext and render were called for each job
        assertEquals(gatherContextStub.calls.length, 2, "gatherContext should be called for each potential child job");
        assertEquals(renderStub.calls.length, 2, "render should be called for each potential child job");

        // Inspect the first generated child job
        const firstJob: DialecticJobRow = childJobs[0];
        assertEquals(firstJob.parent_job_id, MOCK_PARENT_JOB.id, "Child job should link to the parent job");
        assertEquals(firstJob.status, 'pending', "Child job should start in 'pending' status");
        assertExists(firstJob.payload, "Child job payload must exist");

        // Use the type guard to assert the payload structure
        assert(isDialecticJobPayload(firstJob.payload), "First job payload is not a valid DialecticJobPayload");

        assertEquals(firstJob.payload.sessionId, MOCK_PAYLOAD.sessionId);
        assertEquals(firstJob.payload.stageSlug, MOCK_PAYLOAD.stageSlug);
        assertEquals(firstJob.payload.model_id, MOCK_PAYLOAD.model_id);

        assert(
            firstJob.payload.prompt?.includes("RENDERED_PROMPT: Mocked contribution: Mock content for path: p/f1.md"),
            "The dynamically generated prompt is incorrect for the first job"
        );
        
        // Inspect the second generated child job (second source, first model)
        const secondJob: DialecticJobRow = childJobs[1];
        assert(isDialecticJobPayload(secondJob.payload), "Second job payload is not a valid DialecticJobPayload");
        
        assertEquals(secondJob.payload.model_id, MOCK_PAYLOAD.model_id);
        assert(
            secondJob.payload.prompt?.includes("RENDERED_PROMPT: Mocked contribution: Mock content for path: p/f2.md"),
            "The dynamically generated prompt is incorrect for the second job"
        );


    } finally {
        gatherContextStub.restore();
        renderStub.restore();
    }
});

Deno.test('planComplexStage - Throws if dialectic_projects query fails', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: null, error: new Error('DB Error') })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('Failed to fetch valid project details for ID'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Throws if dialectic_sessions query fails', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: null, error: new Error('DB Error') })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('Failed to fetch session details for ID'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Throws if dialectic_contributions query fails', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: null, error: new Error('DB Error') })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('Failed to fetch source contributions'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Throws if ai_providers query fails', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: MOCK_SOURCE_CONTRIBUTIONS, error: null })
            },
            'ai_providers': {
                select: () => Promise.resolve({ data: null, error: new Error('DB Error') })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('Failed to fetch models'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Throws if downloadFromStorage fails', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: MOCK_SOURCE_CONTRIBUTIONS, error: null })
            },
            'ai_providers': {
                select: () => Promise.resolve({ data: MOCK_MODELS, error: null })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        return { data: null, error: new Error('Storage Error') };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('Failed to download content for contribution'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Handles stage with overlays and prompts', async () => {
    const MOCK_STAGE_WITH_DATA: DialecticStage & { system_prompts: { id: string, name: string, prompt_text: string, is_default: boolean, user_id: string, created_at: string, updated_at: string } | null; domain_specific_prompt_overlays: { id: string; domain_id: string; stage_id: string; prompt_text_overlay: string; is_enabled: boolean; created_at: string; }[]; } = {
        ...MOCK_STAGE,
        system_prompts: { id: 'sp-2', name: 'Detailed Prompt', prompt_text: 'A more detailed prompt.', is_default: false, user_id: 'user-123', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        domain_specific_prompt_overlays: [{ id: 'dp-1', domain_id: 'domain-1', stage_id: MOCK_STAGE.id, prompt_text_overlay: 'Domain overlay text.', is_enabled: true, created_at: new Date().toISOString() }]
    };

    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE_WITH_DATA], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: MOCK_SOURCE_CONTRIBUTIONS, error: null })
            },
            'ai_providers': {
                select: () => Promise.resolve({ data: MOCK_MODELS, error: null })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Content for ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);
    const gatherContextSpy = stub(mockAssembler, 'gatherContext', () => Promise.resolve({ user_objective: 'test', domain: 'test', agent_count: 1, context_description: 'test', prior_stage_ai_outputs: 'test', prior_stage_user_feedback: 'test', deployment_context: null, reference_documents: null, constraint_boundaries: null, stakeholder_considerations: null, deliverable_format: 'markdown' }));
    const renderSpy = stub(mockAssembler, 'render', () => 'RENDERED_PROMPT');

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );

        assertEquals(gatherContextSpy.calls.length, 4, "gatherContext should be called for each job");
        const firstCallArgs = gatherContextSpy.calls[0].args;
        assertEquals(firstCallArgs[2].slug, MOCK_STAGE_WITH_DATA.slug, "Stage data in gatherContext should match");
        assertExists(firstCallArgs[2].system_prompts, "system_prompts should be passed to gatherContext");

        assertEquals(renderSpy.calls.length, 4, "render should be called for each job");
        const firstRenderArgs = renderSpy.calls[0].args;
        assertEquals(firstRenderArgs[0].slug, MOCK_STAGE_WITH_DATA.slug, "Stage data in render should match");
        assertExists(firstRenderArgs[0].domain_specific_prompt_overlays, "domain_specific_prompt_overlays should be passed to render");

    } finally {
        gatherContextSpy.restore();
        renderSpy.restore();
    }
});

Deno.test('planComplexStage - Returns empty array if no source contributions are found', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: [], error: null }) // No contributions
            },
            'ai_providers': {
                select: () => Promise.resolve({ data: MOCK_MODELS, error: null })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    const childJobs = await planComplexStage(
        mockDb as unknown as SupabaseClient<Database>,
        { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
        'user-123',
        mockLogger,
        (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
        mockAssembler
    );

    assertEquals(childJobs.length, 0, "Should return an empty array when no source documents are found");
});

Deno.test('planComplexStage - Throws if selectedModelIds is empty', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_stage_transitions': {
                select: { data: [{ source_stage: { slug: 'thesis' } }], error: null }
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: MOCK_SOURCE_CONTRIBUTIONS, error: null })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: { ...MOCK_PAYLOAD, model_id: null } as any }, // Empty model IDs
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('No models found for selected IDs'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Throws if no stage transition is found', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_stage_transitions': {
                select: () => Promise.resolve({ data: [], error: null }) // No transition found
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('Failed to find a source stage transition for target stage ID'), 'Error message is not as expected');
    }
});

Deno.test('planComplexStage - Handles source contributions with missing file_names', async () => {
    const MOCK_SOURCE_CONTRIBUTIONS_NO_FILENAME: DialecticContributionRow[] = [
        { ...MOCK_SOURCE_CONTRIBUTIONS[0], file_name: null },
        { ...MOCK_SOURCE_CONTRIBUTIONS[1], file_name: null },
    ];

    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_stage_transitions': {
                select: () => Promise.resolve({ data: [{ source_stage: { slug: 'thesis' } }], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: MOCK_SOURCE_CONTRIBUTIONS_NO_FILENAME, error: null })
            },
            'ai_providers': {
                select: () => Promise.resolve({ data: MOCK_MODELS, error: null })
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const warnSpy = stub(mockLogger, 'warn');
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        const childJobs = await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );

        assertEquals(childJobs.length, 0, "Should return an empty array as no valid source documents can be processed");
        assertEquals(warnSpy.calls.length, 2, "Should have logged a warning for each contribution with a missing file_name");
        assert(warnSpy.calls[0].args[0].includes('is missing a file_name and will be skipped'));

    } finally {
        warnSpy.restore();
    }
}); 

Deno.test('planComplexStage - Throws if no matching models are found for selected IDs', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({ data: [MOCK_STAGE], error: null })
            },
            'dialectic_projects': {
                select: () => Promise.resolve({ data: [MOCK_PROJECT], error: null })
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({ data: [MOCK_SESSION], error: null })
            },
            'dialectic_stage_transitions': {
                select: () => Promise.resolve({ data: [{ source_stage: { slug: 'thesis' } }], error: null })
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: MOCK_SOURCE_CONTRIBUTIONS, error: null })
            },
            'ai_providers': {
                select: () => Promise.resolve({ data: [], error: null }) // No models found
            }
        }
    });

    const mockLogger: ILogger = { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } };
    const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const content = `Mock content for path: ${path}`;
        const uint8array = new TextEncoder().encode(content);
        // Manually create a new ArrayBuffer and copy the data to ensure the type is not ArrayBufferLike
        const arrayBuffer = new ArrayBuffer(uint8array.length);
        new Uint8Array(arrayBuffer).set(uint8array);
        return { data: arrayBuffer, error: null };
    };
    const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);

    try {
        await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: MOCK_PAYLOAD },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );
        assert(false, 'Should have thrown an error');
    } catch (e) {
        assert(e instanceof Error, 'Error should be an instance of Error');
        assert(e.message.includes('No models found for selected IDs'), 'Error message is not as expected');
    }
}); 

Deno.test('planComplexStage - Context Window Management', async () => {
    const MOCK_MODEL_LIMITED_CONTEXT = [
        { id: 'model-limited', name: 'Limited Context Model', api_identifier: 'limited-api', provider: 'openai', config: { tokenization_strategy: { type: 'rough_char_count' }, max_context_window_tokens: 10 }, user_id: 'user-123', created_at: new Date().toISOString() },
    ];

    const MOCK_LARGE_SOURCE_CONTRIBUTIONS: DialecticContributionRow[] = [
        { ...MOCK_SOURCE_CONTRIBUTIONS[0], id: 'large-contrib-1' }, // Content will be mocked as large
    ];

    await Deno.test('should create a prerequisite job if context exceeds limit', async () => {
        const { client: mockDb, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [MOCK_STAGE], error: null } },
                'dialectic_projects': { select: { data: [MOCK_PROJECT], error: null } },
                'dialectic_stage_transitions': { select: { data: [{ source_stage: { slug: 'thesis' } }], error: null } },
                'dialectic_sessions': { select: { data: [MOCK_SESSION], error: null } },
                'dialectic_contributions': { select: { data: MOCK_LARGE_SOURCE_CONTRIBUTIONS, error: null } },
                'ai_providers': { select: { data: MOCK_MODEL_LIMITED_CONTEXT, error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: [{ id: 'new-combine-job' }], error: null }),
                    update: () => Promise.resolve({ data: [{ id: MOCK_PARENT_JOB.id }], error: null }),
                }
            }
        });

        const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
        const mockAssembler = new PromptAssembler(mockDb as unknown as SupabaseClient<Database>);
        const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
            const content = "This is a very long string designed to exceed the small token limit of our test model.";
            const uint8array = new TextEncoder().encode(content);
            const arrayBuffer = new ArrayBuffer(uint8array.length);
            new Uint8Array(arrayBuffer).set(uint8array);
            return { data: arrayBuffer, error: null };
        };

        const childJobs = await planComplexStage(
            mockDb as unknown as SupabaseClient<Database>,
            { ...MOCK_PARENT_JOB, payload: { ...MOCK_PAYLOAD, model_id: 'model-limited' } },
            'user-123',
            mockLogger,
            (bucket, path) => mockDownloadFromStorage(mockDb as unknown as SupabaseClient<Database>, bucket, path),
            mockAssembler
        );

        assertEquals(childJobs.length, 0, "Should return no child jobs when a prerequisite is created");
        
        const insertSpy = spies.getLatestQueryBuilderSpies('dialectic_generation_jobs')?.insert;
        assertExists(insertSpy);
        assertEquals(insertSpy.calls.length, 1);
        const insertedJob = insertSpy.calls[0].args[0];
        assertEquals(insertedJob.stage_slug, 'utility');
        assert(isDialecticJobPayload(insertedJob.payload));
        assertEquals(insertedJob.payload.job_type, 'combine');

        const updateSpy = spies.getLatestQueryBuilderSpies('dialectic_generation_jobs')?.update;
        assertExists(updateSpy);
        assertEquals(updateSpy.calls.length, 1);
        const updatedJob = updateSpy.calls[0].args[0];
        assertEquals(updatedJob.status, 'waiting_for_prerequisite');
        assertExists(updatedJob.prerequisite_job_id);
    });
}); 