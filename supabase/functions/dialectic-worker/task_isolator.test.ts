// supabase/functions/dialectic-worker/task_isolator.test.ts
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import { stub, type Stub } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { executeIsolatedTask, IIsolatedExecutionDeps } from './task_isolator.ts';
import {
    GenerateContributionsPayload,
    DialecticContributionRow,
    DialecticJobRow,
    DialecticStage,
    UnifiedAIResponse
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext, type FileManagerResponse } from '../_shared/types/file_manager.types.ts';
import { ILogger } from '../_shared/types.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { getSourceStage, type SeedPromptData } from '../_shared/utils/dialectic_utils.ts';
import { calculateTotalSteps } from '../_shared/utils/progress_calculator.ts';
import { getSeedPromptForStage } from '../_shared/utils/dialectic_utils.ts';

// --- Mocks and Test Data ---

const MOCK_JOB: DialecticJobRow = {
    id: 'job-123',
    session_id: 'session-123',
    user_id: 'user-123',
    stage_slug: 'antithesis',
    iteration_number: 1,
    payload: {},
    status: 'processing',
    attempt_count: 1,
    max_retries: 3,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    results: null,
    error_details: null,
    parent_job_id: null,
    target_contribution_id: null,
};

const MOCK_PAYLOAD: GenerateContributionsPayload = {
    sessionId: 'session-123',
    projectId: 'project-123',
    stageSlug: 'antithesis',
    iterationNumber: 1,
    selectedModelIds: ['model-1', 'model-2'],
};

const MOCK_STAGE: DialecticStage = {
    id: 'stage-antithesis',
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
        sources: [{ type: 'contribution', stage_slug: 'thesis' }]
    },
    expected_output_artifacts: [],
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'sp-1',
    description: ''
};

const MOCK_SOURCE_STAGE: DialecticStage = { id: 'stage-thesis', slug: 'thesis', display_name: 'Thesis', input_artifact_rules: {}, expected_output_artifacts: [], created_at: new Date().toISOString(), default_system_prompt_id: 'sp-1', description: '' };

const MOCK_SOURCE_CONTRIBUTIONS: DialecticContributionRow[] = [
    {
        id: 'contrib-1',
        session_id: 'session-123',
        user_id: 'user-123',
        stage: 'thesis',
        iteration_number: 1,
        model_id: 'model-1',
        model_name: 'Model One',
        prompt_template_id_used: 'pt-1',
        seed_prompt_url: 'prompts/seed1.txt',
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: 'raw/resp1.json',
        target_contribution_id: null,
        tokens_used_input: 100,
        tokens_used_output: 200,
        processing_time_ms: 500,
        error: null,
        citations: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contribution_type: 'thesis',
        file_name: 'f1.md',
        storage_bucket: 'b',
        storage_path: 'p/f1.md',
        size_bytes: 100,
        mime_type: 'text/markdown'
    },
    {
        id: 'contrib-2',
        session_id: 'session-123',
        user_id: 'user-123',
        stage: 'thesis',
        iteration_number: 1,
        model_id: 'model-1',
        model_name: 'Model One',
        prompt_template_id_used: 'pt-1',
        seed_prompt_url: 'prompts/seed2.txt',
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: 'raw/resp2.json',
        target_contribution_id: null,
        tokens_used_input: 110,
        tokens_used_output: 220,
        processing_time_ms: 550,
        error: null,
        citations: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contribution_type: 'thesis',
        file_name: 'f2.md',
        storage_bucket: 'b',
        storage_path: 'p/f2.md',
        size_bytes: 120,
        mime_type: 'text/markdown'
    },
];

const MOCK_MODELS = [
    { id: 'model-1', name: 'Model One', api_identifier: 'model-one-api', provider: 'openai', config: {}, user_id: 'user-123', created_at: new Date().toISOString() },
    { id: 'model-2', name: 'Model Two', api_identifier: 'model-two-api', provider: 'anthropic', config: {}, user_id: 'user-123', created_at: new Date().toISOString() },
];

Deno.test('executeIsolatedStage - Happy Path', async () => {
    // A simplified mock that handles the specific queries made by the function
    const { client: mockDb, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: (state) => {
                    const slugFilter = state.filters.find(f => f.column === 'slug' && f.type === 'eq');
                    if (slugFilter?.value === 'antithesis') {
                        return Promise.resolve({ data: [MOCK_STAGE], error: null, count: 1, status: 200, statusText: 'OK' });
                    }
                    return Promise.resolve({ data: [], error: new Error(`Unhandled query on dialectic_stages: ${JSON.stringify(state)}`), count: 0, status: 404, statusText: 'Not Found' });
                }
            },
            'dialectic_contributions': {
                select: { data: MOCK_SOURCE_CONTRIBUTIONS, error: null }
            },
            'ai_providers': {
                select: { data: MOCK_MODELS, error: null }
            }
        },
        rpcResults: {
            'create_notification_for_user': { data: null, error: null }
        }
    });


    const mockLogger: ILogger = {
        info: () => {}, warn: () => {}, error: () => {}, debug: () => {}
    };

    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        downloadFromStorage: () => Promise.resolve({ data: null, error: null }),
        callUnifiedAIModel: () => Promise.resolve({ content: 'AI RESPONSE', error: null, rawProviderResponse: {}, inputTokens: 1, outputTokens: 1, processingTimeMs: 1, contentType: 'text/markdown' }),
        fileManager: {
            uploadAndRegisterFile: (_context: UploadContext): Promise<FileManagerResponse> => Promise.resolve({ record: MOCK_SOURCE_CONTRIBUTIONS[0], error: null })
        },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => crypto.randomUUID(),
        deleteFromStorage: () => Promise.resolve({ error: null, data: { path: '' } }),
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 4, // 2 models * 2 contributions
        getSeedPromptForStage: (): Promise<SeedPromptData> => Promise.resolve({
            content: 'SEED PROMPT',
            fullPath: 'prompts/seed.txt',
            bucket: 'test-bucket',
            path: 'prompts/',
            fileName: 'seed.txt'
        }),
    };

    const downloadStub = stub(
        mockDeps, 'downloadFromStorage',
        (_client, _bucket, path) => {
            let content: string | null = null;
            if (path.includes('seed_prompt')) {
                content = 'SEED PROMPT';
            } else if (path.includes('f1')) {
                content = 'DOC 1 CONTENT';
            } else if (path.includes('f2')) {
                content = 'DOC 2 CONTENT';
            }

            if (content) {
                const encoder = new TextEncoder();
                const uint8array = encoder.encode(content);
                const arrayBuffer = new ArrayBuffer(uint8array.length);
                new Uint8Array(arrayBuffer).set(uint8array);
                return Promise.resolve({ data: arrayBuffer, error: null });
            }

            return Promise.resolve({ data: null, error: new Error('File not found') });
        }
    );
    const callAIStub = stub(mockDeps, 'callUnifiedAIModel', () => Promise.resolve({ content: 'AI RESPONSE', error: null, rawProviderResponse: {}, inputTokens: 1, outputTokens: 1, processingTimeMs: 1, contentType: 'text/markdown' }));
    const uploadStub = stub(mockDeps.fileManager, 'uploadAndRegisterFile', () => Promise.resolve({ record: { ...MOCK_SOURCE_CONTRIBUTIONS[0], id: 'new-contrib' }, error: null }));

    try {
        await executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token');

        assertEquals(callAIStub.calls.length, 4, 'Should call AI model n*m times (2*2=4)');
        
        const firstCallArgs = callAIStub.calls[0].args;
        assert(firstCallArgs[1].includes('SEED PROMPT'), 'Prompt should contain seed prompt content');
        assert(firstCallArgs[1].includes('DOC 1 CONTENT'), 'First call prompt should contain doc 1 content');

        assertEquals(uploadStub.calls.length, 4, 'Should save 4 new contributions');
        assertEquals(spies.rpcSpy.calls.length, 5, 'Should send 1 initial and 4 progress notifications');

    } finally {
        downloadStub.restore();
        callAIStub.restore();
        uploadStub.restore();
    }
});

Deno.test('executeIsolatedStage - Throws if stage not found', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: { data: null, error: new Error('Not found') }
            }
        }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 0,
        getSeedPromptForStage: () => Promise.reject(new Error('Should not be called')),
        downloadFromStorage: () => Promise.reject(new Error('Should not be called')),
        callUnifiedAIModel: () => Promise.reject(new Error('Should not be called')),
        fileManager: { uploadAndRegisterFile: () => Promise.reject(new Error('Should not be called')) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => '',
        deleteFromStorage: () => Promise.reject(new Error('Should not be called')),
    };

    await assertRejects(
        () => executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token'),
        Error,
        'Failed to fetch stage details for slug: antithesis'
    );
});

Deno.test('executeIsolatedStage - Throws if stage is missing processing strategy', async () => {
    const stageWithoutStrategy = { ...MOCK_STAGE, input_artifact_rules: {} };
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: { data: [stageWithoutStrategy] }
            }
        }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
     const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 0,
        getSeedPromptForStage: () => Promise.reject(new Error('Should not be called')),
        downloadFromStorage: () => Promise.reject(new Error('Should not be called')),
        callUnifiedAIModel: () => Promise.reject(new Error('Should not be called')),
        fileManager: { uploadAndRegisterFile: () => Promise.reject(new Error('Should not be called')) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => '',
        deleteFromStorage: () => Promise.reject(new Error('Should not be called')),
    };
    
    await assertRejects(
        () => executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token'),
        Error,
        'No valid processing_strategy found for stage antithesis'
    );
});

Deno.test('executeIsolatedStage - Handles AI call failures gracefully', async () => {
    const { client: mockDb, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [MOCK_STAGE] } },
            'dialectic_contributions': { select: { data: MOCK_SOURCE_CONTRIBUTIONS } },
            'ai_providers': { select: { data: MOCK_MODELS } }
        },
        rpcResults: { 'create_notification_for_user': { data: null, error: null } }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const errorSpy = stub(mockLogger, 'error');
    
    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        downloadFromStorage: async () => {
            const blob = new Blob(['content'], { type: 'text/plain' });
            return { data: await blob.arrayBuffer(), error: null };
        },
        callUnifiedAIModel: () => Promise.resolve({ content: null, error: 'AI_ERROR' }), // Simulate failure
        fileManager: { uploadAndRegisterFile: () => Promise.resolve({ record: MOCK_SOURCE_CONTRIBUTIONS[0], error: null }) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => crypto.randomUUID(),
        deleteFromStorage: () => Promise.resolve({ error: null, data: { path: '' } }),
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 4,
        getSeedPromptForStage: (): Promise<SeedPromptData> => Promise.resolve({ content: 'SEED', fullPath: 'p', bucket: 'b', path: 'p', fileName: 'f' }),
    };

    const uploadStub = stub(mockDeps.fileManager, 'uploadAndRegisterFile');

    try {
        await executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token');
        
        assertEquals(uploadStub.calls.length, 0, 'Should not save any contributions on AI failure');
        assertEquals(errorSpy.calls.length, 0, "No errors should be logged to the console from the function directly, but passed to the parent");
    } finally {
        errorSpy.restore();
        uploadStub.restore();
    }
});

Deno.test('executeIsolatedStage - Completes with no source contributions', async () => {
    const { client: mockDb, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [MOCK_STAGE] } },
            'dialectic_contributions': { select: { data: [] } }, // No sources
            'ai_providers': { select: { data: MOCK_MODELS } }
        },
        rpcResults: { 'create_notification_for_user': { data: null, error: null } }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const infoSpy = stub(mockLogger, 'info');

    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        downloadFromStorage: () => Promise.reject(new Error('Should not be called')),
        callUnifiedAIModel: () => Promise.reject(new Error('Should not be called')),
        fileManager: { uploadAndRegisterFile: () => Promise.reject(new Error('Should not be called')) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => '',
        deleteFromStorage: () => Promise.reject(new Error('Should not be called')),
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 0,
        getSeedPromptForStage: () => Promise.resolve({ content: 'SEED', fullPath: 'p', bucket: 'b', path: 'p', fileName: 'f' }),
    };

    const callAIStub = stub(mockDeps, 'callUnifiedAIModel');

    try {
        await executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token');

        assertEquals(callAIStub.calls.length, 0, 'Should not make any AI calls');
        assertEquals(spies.rpcSpy.calls.length, 1, 'Should only send the initial notification');
        
        const infoLastCall = infoSpy.calls.find(c => c.args[0].toString().includes('Found 0 source contributions to process'));
        assert(infoLastCall, "Should log that no contributions were found");

    } finally {
        infoSpy.restore();
        callAIStub.restore();
    }
}); 

Deno.test('executeIsolatedStage - Handles partial AI call success', async () => {
    const { client: mockDb, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [MOCK_STAGE] } },
            'dialectic_contributions': { select: { data: MOCK_SOURCE_CONTRIBUTIONS } },
            'ai_providers': { select: { data: MOCK_MODELS } }
        },
        rpcResults: { 'create_notification_for_user': { data: null, error: null } }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const errorSpy = stub(mockLogger, 'error');

    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        downloadFromStorage: async () => {
            const blob = new Blob(['content'], { type: 'text/plain' });
            return { data: await blob.arrayBuffer(), error: null };
        },
        // Succeed for the first model, fail for the second
        callUnifiedAIModel: (modelIdentifier) => {
            if (modelIdentifier === MOCK_MODELS[0].api_identifier) {
                return Promise.resolve({ content: 'AI RESPONSE', error: null, rawProviderResponse: {}, inputTokens: 1, outputTokens: 1, processingTimeMs: 1, contentType: 'text/markdown' });
            }
            return Promise.resolve({ content: null, error: 'AI_ERROR_2' });
        },
        fileManager: { uploadAndRegisterFile: () => Promise.resolve({ record: MOCK_SOURCE_CONTRIBUTIONS[0], error: null }) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => crypto.randomUUID(),
        deleteFromStorage: () => Promise.resolve({ error: null, data: { path: '' } }),
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 4,
        getSeedPromptForStage: (): Promise<SeedPromptData> => Promise.resolve({ content: 'SEED', fullPath: 'p', bucket: 'b', path: 'p', fileName: 'f' }),
    };

    const uploadStub = stub(mockDeps.fileManager, 'uploadAndRegisterFile', () => Promise.resolve({ record: MOCK_SOURCE_CONTRIBUTIONS[0], error: null }));

    try {
        await executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token');
        
        // 2 successful calls for the first model (1 per source doc)
        assertEquals(uploadStub.calls.length, 2, 'Should save contributions for successful AI calls');
        assertEquals(errorSpy.calls.length, 0, "No errors should be logged directly");
        
    } finally {
        errorSpy.restore();
        uploadStub.restore();
    }
});

Deno.test('executeIsolatedStage - Throws on source document download failure', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [MOCK_STAGE] } },
            'dialectic_contributions': { select: { data: MOCK_SOURCE_CONTRIBUTIONS } },
        }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        downloadFromStorage: () => Promise.resolve({ data: null, error: new Error('Download failed') }), // Simulate failure
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 0,
        getSeedPromptForStage: () => Promise.reject(new Error('Should not be called')),
        callUnifiedAIModel: () => Promise.reject(new Error('Should not be called')),
        fileManager: { uploadAndRegisterFile: () => Promise.reject(new Error('Should not be called')) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => '',
        deleteFromStorage: () => Promise.reject(new Error('Should not be called')),
    };

    await assertRejects(
        () => executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token'),
        Error,
        'Failed to download content for contribution'
    );
});

Deno.test('executeIsolatedStage - Throws if no models are selected', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
         genericMockResults: {
            'dialectic_stages': { select: { data: [MOCK_STAGE] } },
            'dialectic_contributions': { select: { data: MOCK_SOURCE_CONTRIBUTIONS } },
        }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const payloadWithNoModels = { ...MOCK_PAYLOAD, selectedModelIds: [] };

    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(0), error: null }),
        getSeedPromptForStage: () => Promise.resolve({ content: 'SEED', fullPath: 'p', bucket: 'b', path: 'p', fileName: 'f' }),
        calculateTotalSteps: () => 0,
        callUnifiedAIModel: () => Promise.reject(new Error('Should not be called')),
        fileManager: { uploadAndRegisterFile: () => Promise.reject(new Error('Should not be called')) },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => '',
        deleteFromStorage: () => Promise.reject(new Error('Should not be called')),
    };

    await assertRejects(
        () => executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, payloadWithNoModels, 'user-123', mockDeps, 'auth-token'),
        Error,
        'No models found for the selected IDs.'
    );
});

Deno.test('executeIsolatedStage - Handles file upload failures gracefully', async () => {
    const { client: mockDb } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [MOCK_STAGE] } },
            'dialectic_contributions': { select: { data: MOCK_SOURCE_CONTRIBUTIONS } },
            'ai_providers': { select: { data: MOCK_MODELS } }
        },
        rpcResults: { 'create_notification_for_user': { data: null, error: null } }
    });

    const mockLogger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const infoSpy = stub(mockLogger, 'info');

    const mockDeps: IIsolatedExecutionDeps = {
        logger: mockLogger,
        downloadFromStorage: async () => ({ data: await (new Blob(['content'])).arrayBuffer(), error: null }),
        callUnifiedAIModel: () => Promise.resolve({ content: 'AI RESPONSE', error: null, rawProviderResponse: {}, inputTokens: 1, outputTokens: 1, processingTimeMs: 1, contentType: 'text/markdown' }),
        fileManager: { 
            // Succeed for the first doc, fail for the second
            uploadAndRegisterFile: (ctx) => {
                if (ctx.contributionMetadata?.target_contribution_id === MOCK_SOURCE_CONTRIBUTIONS[0].id) {
                    return Promise.resolve({ record: MOCK_SOURCE_CONTRIBUTIONS[0], error: null });
                }
                return Promise.resolve({ record: null, error: new Error('Upload failed') });
            } 
        },
        getExtensionFromMimeType: () => '.md',
        randomUUID: () => crypto.randomUUID(),
        deleteFromStorage: () => Promise.resolve({ error: null, data: { path: '' } }),
        getSourceStage: () => Promise.resolve(MOCK_SOURCE_STAGE),
        calculateTotalSteps: () => 4,
        getSeedPromptForStage: (): Promise<SeedPromptData> => Promise.resolve({ content: 'SEED', fullPath: 'p', bucket: 'b', path: 'p', fileName: 'f' }),
    };

    try {
        await executeIsolatedTask(mockDb as unknown as SupabaseClient<Database>, MOCK_JOB, MOCK_PAYLOAD, 'user-123', mockDeps, 'auth-token');
        
        const finalLog = infoSpy.calls.find(c => c.args[0].toString().includes('Finished processing all results'));
        assert(finalLog, "Should log a final summary");

        const summary = finalLog.args[1];
        assertEquals(summary?.saved, 2, 'Should have saved 2 contributions (1 doc * 2 models)');
        assertEquals(summary?.errors, 2, 'Should have 2 processing errors (1 doc * 2 models)');

    } finally {
        infoSpy.restore();
    }
}); 