import { assertEquals, assertExists, assertObjectMatch, fail, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import {
    GenerateContributionsPayload,
    GenerateContributionsDeps,
    DatabaseRecipeSteps,
} from "./dialectic.interface.ts";
import { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import { isPlanJobInsert, isDatabaseRecipeSteps, isDialecticPlanJobPayload } from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { createMockSupabaseClient, MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { FileType } from "../_shared/types/file_manager.types.ts";
import { DownloadFromStorageFn, DeleteFromStorageFn } from "../_shared/supabase_storage_utils.ts";
import { Tables } from "../types_db.ts";

const downloadFromStorage100: DownloadFromStorageFn = (_supabase, _bucket, _path) =>
    Promise.resolve({ data: new ArrayBuffer(100), error: null });

const downloadFromStorage8: DownloadFromStorageFn = (_supabase, _bucket, _path) =>
    Promise.resolve({ data: new ArrayBuffer(8), error: null });

const downloadFromStorage1: DownloadFromStorageFn = (_supabase, _bucket, _path) =>
    Promise.resolve({ data: new ArrayBuffer(1), error: null });

const deleteFromStorageOk: DeleteFromStorageFn = (_supabase, _bucket, _paths) =>
    Promise.resolve({ error: null });

const createMockDbResponse = (stepCount: number): DatabaseRecipeSteps => {
    const stage: Tables<'dialectic_stages'> = {
        id: 'stage-id-1',
        slug: 'thesis',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'prompt-1',
        description: 'Test stage',
        display_name: 'Thesis',
        expected_output_template_ids: [],
        recipe_template_id: 'rt-1',
        active_recipe_instance_id: 'ari-1',
    };

    const instance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'ari-1',
        stage_id: 'stage-id-1',
        template_id: 'rt-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_cloned: false,
        cloned_at: null,
    };

    const steps: Tables<'dialectic_stage_recipe_steps'>[] = Array.from({ length: stepCount }, (_, i) => ({
        id: `step-id-${i + 1}`,
        instance_id: 'ari-1',
        step_key: `key-${i + 1}`,
        step_slug: `slug-${i + 1}`,
        step_name: `name-${i + 1}`,
        output_type: FileType.AssembledDocumentJson,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_skipped: false,
        config_override: {},
        object_filter: {},
        output_overrides: {},
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        granularity_strategy: 'all_to_one',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: [],
        branch_key: null,
        execution_order: null,
        parallel_group: null,
        prompt_template_id: null,
        template_step_id: null,
        step_description: `A test description ${i + 1}`,
    }));

    return {
        ...stage,
        dialectic_stage_recipe_instances: [{
            ...instance,
            dialectic_stage_recipe_steps: steps,
        }],
    };
};


Deno.test("generateContributions - Happy Path: Successfully enqueues multiple jobs for multiple models", async () => {
    const localLoggerInfo = spy(logger, 'info');

    // Mocks
    const mockSessionId = "test-session-id-happy";
    const mockProjectId = "test-project-id-happy";
    const mockUserId = "test-user-id-happy";
    const mockModelIds = ["model-A", "model-B"];
    const mockJobIds = ["new-job-id-A", "new-job-id-B"];
    let insertCallCount = 0;

    const mockDbResponse = createMockDbResponse(2); // 2-step recipe
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        continueUntilComplete: true,
        walletId: 'test-wallet-id',
        user_jwt: 'test-user-jwt',
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: mockModelIds,
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'ai_providers': {
                select: (state: MockQueryBuilderState) => {
                    const idFilter = state.filters.find(f => f.column === 'id' && f.type === 'eq');
                    if (!idFilter || !idFilter.value || typeof idFilter.value !== 'string') {
                        return Promise.resolve({ data: null, error: new Error('Model not found'), count: 0, status: 406, statusText: 'OK' });
                    }
                    const modelNames: Record<string, string> = {
                        'model-A': 'model-slug-A',
                        'model-B': 'model-slug-B',
                    };
                    const modelName = modelNames[idFilter.value] || `slug-${idFilter.value}`;
                    return Promise.resolve({ data: [{ name: modelName }], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            },
            'dialectic_generation_jobs': {
                insert: (_state: MockQueryBuilderState) => {
                    const job_id = mockJobIds[insertCallCount];
                    insertCallCount++;
                    return Promise.resolve({ data: [{ id: job_id }], error: null, count: 1, status: 201, statusText: 'Created' });
                }
            },
        },
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
            {
                callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
                downloadFromStorage: downloadFromStorage100,
                getExtensionFromMimeType: () => 'txt',
                logger: logger,
                randomUUID: () => '123',
                fileManager: {
                    uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                    assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
                },
                deleteFromStorage: deleteFromStorageOk,
            },
            'jwt.token.here'
        );

        // Assertions for the main function result
        assertEquals(result.success, true, "Function should return success: true");
        assertExists(result.data, "Result should contain data");
        assertEquals(result.data.job_ids, mockJobIds, "Returned data should contain the correct array of job_ids");

        // Assert that the insert spy was called correctly
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy, "Insert spy for dialectic_generation_jobs should exist");
        assertEquals(insertSpy.callCount, 2, "Insert should be called exactly twice, once for each model");

        // Assert the shape of the data passed to the first insert call
        const firstInsertCallArgs = insertSpy.callsArgs[0][0];
        if (isPlanJobInsert(firstInsertCallArgs)) {
            const firstInsertPayload = firstInsertCallArgs.payload;
            assertEquals(firstInsertCallArgs.is_test_job, undefined);
            assertEquals(firstInsertPayload.model_id, mockModelIds[0]);
            assert(isDialecticPlanJobPayload(firstInsertPayload), 'The first insert payload should be a valid DialecticPlanJobPayload object');
        } else {
            fail(`First insert call did not have the expected payload shape. Got: ${JSON.stringify(firstInsertCallArgs)}`);
        }

        // Assert the shape of the data passed to the second insert call
        const secondInsertCallArgs = insertSpy.callsArgs[1][0];
        if (isPlanJobInsert(secondInsertCallArgs)) {
            assertEquals(secondInsertCallArgs.is_test_job, undefined);
            assert(isDialecticPlanJobPayload(secondInsertCallArgs.payload), 'The second insert payload should be a valid DialecticPlanJobPayload object');
            const secondInsertPayload = secondInsertCallArgs.payload;
            assertEquals(secondInsertPayload.model_id, mockModelIds[1]);
        } else {
            fail(`Second insert call did not have the expected payload shape. Got: ${JSON.stringify(secondInsertCallArgs)}`);
        }

    } finally {
        localLoggerInfo.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Happy Path: Successfully enqueues a single job", async () => {
    const localLoggerInfo = spy(logger, 'info');

    // Mocks
    const mockSessionId = "test-session-id-happy";
    const mockProjectId = "test-project-id-happy";
    const mockUserId = "test-user-id-happy";
    const mockModelId = "model-id-happy";
    const mockJobId = "new-job-id-happy";

    const mockDbResponse = createMockDbResponse(3); // 3-step recipe
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        continueUntilComplete: true,
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: [mockModelId],
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'ai_providers': {
                select: {
                    data: [{ name: `slug-${mockModelId}` }],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: mockJobId }] }
            },
        },
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
            {
                callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
                downloadFromStorage: downloadFromStorage100,
                getExtensionFromMimeType: () => 'txt',
                logger: logger,
                randomUUID: () => '123',
                fileManager: {
                    uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                    assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
                },
                deleteFromStorage: deleteFromStorageOk,
            },
            'jwt.token.here'
        );

        // Assertions for the main function result
        assertEquals(result.success, true, "Function should return success: true");
        assertExists(result.data, "Result should contain data");
        assertEquals(result.data.job_ids, [mockJobId], "Returned data should contain the correct job_id in an array");

        // Assert that the insert spy was called correctly
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy, "Insert spy for dialectic_generation_jobs should exist");
        assertEquals(insertSpy.callCount, 1, "Insert should be called exactly once");

        // Assert the shape of the data passed to insert
        const insertArgs = insertSpy.callsArgs[0][0];

        if (isPlanJobInsert(insertArgs)) {
            assertObjectMatch(insertArgs, {
                session_id: mockSessionId,
                user_id: mockUserId,
                stage_slug: 'thesis',
                status: 'pending',
            });
            assertEquals(insertArgs.payload.model_id, mockModelId);
            assert(isDialecticPlanJobPayload(insertArgs.payload), 'The insert payload should be a valid DialecticPlanJobPayload object');
        } else {
            fail(`insert was not called with an object of the expected shape. Got: ${JSON.stringify(insertArgs)}`);
        }

    } finally {
        localLoggerInfo.restore();
        mockSupabase.clearAllStubs?.();
    }
});


Deno.test("generateContributions - Failure Path: Fails if stage recipe lookup fails", async () => {
    const mockPayload: GenerateContributionsPayload = {
        sessionId: 'session-123',
        projectId: 'project-123',
        stageSlug: 'thesis',
        iterationNumber: 1, // Add the required iteration number
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };
    const dbError = { name: 'DBError', message: "Stage not found", details: "Query returned no rows", code: "PGRST116" };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: 'project-123',
                        selected_model_ids: ['model-A'],
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: { data: null, error: dbError }
            }
        }
    });

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: 'user-123', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content', error: null }),
            downloadFromStorage: downloadFromStorage100,
            getExtensionFromMimeType: () => '.txt',
            logger,
            randomUUID: () => 'mock-uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123', iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        'jwt.token.here'
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "Could not find recipe for stage thesis.");
    assertEquals(result.error.status, 500);
});

Deno.test("generateContributions - Failure Path: Fails to enqueue a job", async () => {
    const localLoggerError = spy(logger, 'error');

    // Mocks
    const mockSessionId = "test-session-id-fail";
    const mockProjectId = "test-project-id-fail";
    const mockUserId = "test-user-id-fail";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        projectId: mockProjectId,
        iterationNumber: 1, // Add the missing iteration number
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };

    const dbError = { name: 'DBError', message: "Database permission denied", details: "RLS policy violation", code: "42501" };

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: ['model-id-fail'], // Must provide models to get to the insert step
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse], // Use a valid stage with one step
                    error: null
                }
            },
            'ai_providers': {
                select: {
                    data: [{ name: 'model-slug-fail' }],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: null, error: dbError }
            },
        },
    });

    const mockDeps: GenerateContributionsDeps = {
      callUnifiedAIModel: () => Promise.resolve({ content: 'test-content', error: null }),
      downloadFromStorage: downloadFromStorage100,
      getExtensionFromMimeType: () => '.txt',
      logger,
      randomUUID: () => 'mock-uuid',
      deleteFromStorage: deleteFromStorageOk,
      fileManager: {
        uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
        assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
      },
    };

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
            mockDeps
        , 'jwt.token.here');

        // Assertions for the main function result
        assertEquals(result.success, false, "Function should return success: false");
        assertExists(result.error, "Result should contain an error object");
        assertEquals(result.error.message, `Failed to create job for model model-id-fail: ${dbError.message}`);
        assertEquals(result.error.status, 500);
        assertEquals(result.error.details, dbError.details, "Error details should contain the DB error message");

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Validation: Fails if stageSlug is missing", async () => {
    const mockPayload: GenerateContributionsPayload = {
        sessionId: 'session-123',
        projectId: 'project-123',
        // stageSlug is intentionally omitted
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };

    const mockSupabase = createMockSupabaseClient(); // No DB calls should be made

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: 'user-123', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: downloadFromStorage100,
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123', iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        'jwt.token.here'
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "stageSlug is required in the payload.");
    assertEquals(result.error.status, 400);
});

Deno.test("generateContributions - Validation: Fails if sessionId is missing", async () => {
    // Intentionally create a payload that is missing a required property to test runtime validation
    const mockPayload = {
        stageSlug: 'thesis',
        projectId: 'project-123',
        // sessionId is intentionally omitted
    } as GenerateContributionsPayload; // Cast to satisfy the function signature for the test

    const mockSupabase = createMockSupabaseClient();

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: 'user-123', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: downloadFromStorage100,
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123', iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        'jwt.token.here'
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "sessionId is required in the payload.");
    assertEquals(result.error.status, 400);
});

Deno.test("generateContributions - Validation: Fails if userId is missing", async () => {
    const mockPayload: GenerateContributionsPayload = {
        sessionId: 'session-123',
        stageSlug: 'thesis',
        projectId: 'project-123',
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };

    const mockSupabase = createMockSupabaseClient();

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        // userId is intentionally passed as an empty string
        { id: '', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: downloadFromStorage100,
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123', iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        'jwt.token.here'
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "User could not be identified for job creation.");
    assertEquals(result.error.status, 401);
});

Deno.test("generateContributions - Validation: Fails if selectedModelIds is empty or missing", async () => {
    const mockSessionId = 'session-123';
    const mockProjectId = 'project-123';
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        projectId: mockProjectId,
        iterationNumber: 1,
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: [], // Explicitly empty array
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            }
        }
    });

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: 'user-123', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: downloadFromStorage100,
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123', iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        'jwt.token.here'
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "The session has no selected models. Please select at least one model.");
    assertEquals(result.error.status, 400);
});

Deno.test("generateContributions - Validation: Fails if walletId is missing (manual flow)", async () => {
    const mockSessionId = "session-wallet-missing";
    const mockProjectId = "project-wallet-missing";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        // walletId intentionally omitted
    } as GenerateContributionsPayload;

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: ['model-1'],
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
        },
    });

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: 'user-123', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: downloadFromStorage8,
            getExtensionFromMimeType: () => 'txt',
            logger,
            randomUUID: () => 'uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'file', created_at: new Date().toISOString(), file_name: 'name', mime_type: 'text/plain', project_id: mockProjectId, resource_description: {}, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', updated_at: new Date().toISOString(), user_id: 'user-123', iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        'jwt.token.here'
    );

    // RED expectation: function should fail early with clear error and no job insert
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error?.status, 400);
    assertEquals(result.error?.message, 'walletId is required to create generation jobs.');

    // And no job insert should occur
    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

Deno.test("generateContributions - Fails when authToken is missing and does not insert jobs", async () => {
    const mockSessionId = "sess-missing-auth";
    const mockProjectId = "proj-missing-auth";
    const mockUserId = "user-missing-auth";
    const mockModelIds = ["model-X"]; // ensure we'd reach insert if not blocked

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        walletId: 'wallet-1',
        user_jwt: 'jwt.token.here',
    };

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: mockModelIds,
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: 'should-not-insert' }], error: null }
            },
        },
    });

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'ok' }),
            downloadFromStorage: downloadFromStorage1,
            getExtensionFromMimeType: () => 'txt',
            logger,
            randomUUID: () => 'uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'f', created_at: new Date().toISOString(), file_name: 'n', mime_type: 'text/plain', project_id: mockProjectId, resource_description: {}, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        // RED: missing/empty auth token
        ''
    );

    // RED expectations: should fail and not insert
    assertEquals(result.success, false);
    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

Deno.test("generateContributions - should reject job creation when authToken is null", async () => {
    const mockSessionId = "sess-null-auth";
    const mockProjectId = "proj-null-auth";
    const mockUserId = "user-null-auth";
    const mockModelIds = ["model-X"];

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        walletId: 'wallet-1',
        user_jwt: 'jwt-from-payload',
    };

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: mockModelIds,
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: 'should-not-insert' }], error: null }
            },
        },
    });

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'ok' }),
            downloadFromStorage: downloadFromStorage1,
            getExtensionFromMimeType: () => 'txt',
            logger,
            randomUUID: () => 'uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'f', created_at: new Date().toISOString(), file_name: 'n', mime_type: 'text/plain', project_id: mockProjectId, resource_description: {}, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        null as any // Type assertion to bypass TypeScript and test runtime validation
    );

    assertEquals(result.success, false);
    assertEquals(result.error?.message, "authToken is required to create generation jobs.");
    assertEquals(result.error?.status, 400);
    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

Deno.test("generateContributions - should reject job creation when authToken is undefined", async () => {
    const mockSessionId = "sess-undefined-auth";
    const mockProjectId = "proj-undefined-auth";
    const mockUserId = "user-undefined-auth";
    const mockModelIds = ["model-X"];

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        walletId: 'wallet-1',
        user_jwt: 'jwt-from-payload',
    };

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: mockModelIds,
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: 'should-not-insert' }], error: null }
            },
        },
    });

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'ok' }),
            downloadFromStorage: downloadFromStorage1,
            getExtensionFromMimeType: () => 'txt',
            logger,
            randomUUID: () => 'uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'f', created_at: new Date().toISOString(), file_name: 'n', mime_type: 'text/plain', project_id: mockProjectId, resource_description: {}, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        undefined as any // Type assertion to bypass TypeScript and test runtime validation
    );

    assertEquals(result.success, false);
    assertEquals(result.error?.message, "authToken is required to create generation jobs.");
    assertEquals(result.error?.status, 400);
    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

// Type-level test documentation for step 131.c.iii:
// After updating the function signature in step 131.f to require `authToken: string` (not optional),
// TypeScript should emit a compile error when the authToken parameter is omitted from function calls.
// Expected TypeScript error: "Expected 5 arguments, but got 4" or similar parameter count mismatch.
// This test documents the requirement; it cannot be executed as a runtime test since TypeScript
// compile errors occur during type checking, not at runtime. The fix in step 131.f will enforce
// this at compile time by changing the function signature from `authToken?: string | null` to
// `authToken: string`, making the parameter required.

Deno.test("generateContributions - plan jobs carry payload.user_jwt equal to provided authToken", async () => {
    const mockSessionId = "sess-auth";
    const mockProjectId = "proj-auth";
    const mockUserId = "user-auth";
    const mockModelIds = ["model-A", "model-B"];
    const mockJobIds = ["job-A", "job-B"];
    let insertIdx = 0;

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        walletId: 'wallet-1',
        continueUntilComplete: true,
        user_jwt: 'jwt.token.here',
    };

    const mockDbResponse = createMockDbResponse(2); // 2-step recipe
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: mockModelIds,
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'ai_providers': {
                select: (state: MockQueryBuilderState) => {
                    const idFilter = state.filters.find(f => f.column === 'id' && f.type === 'eq');
                    if (!idFilter || !idFilter.value || typeof idFilter.value !== 'string') {
                        return Promise.resolve({ data: null, error: new Error('Model not found'), count: 0, status: 406, statusText: 'OK' });
                    }
                    const modelNames: Record<string, string> = {
                        'model-A': 'model-slug-A',
                        'model-B': 'model-slug-B',
                    };
                    const modelName = modelNames[idFilter.value] || `slug-${idFilter.value}`;
                    return Promise.resolve({ data: [{ name: modelName }], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            },
            'dialectic_generation_jobs': {
                insert: (_state: MockQueryBuilderState) => {
                    const id = mockJobIds[insertIdx] || `job-${insertIdx}`;
                    insertIdx++;
                    return Promise.resolve({ data: [{ id }], error: null, count: 1, status: 201, statusText: 'Created' });
                }
            },
        },
    });

    const providedJwt = 'jwt.token.here';

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'ok' }),
            downloadFromStorage: downloadFromStorage1,
            getExtensionFromMimeType: () => 'txt',
            logger,
            randomUUID: () => 'uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'f', created_at: new Date().toISOString(), file_name: 'n', mime_type: 'text/plain', project_id: mockProjectId, resource_description: {}, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        providedJwt
    );

    assertEquals(result.success, true);

    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, mockModelIds.length);

    for (let i = 0; i < insertSpy.callCount; i++) {
        const insertArg = insertSpy.callsArgs[i][0];
        if (!isPlanJobInsert(insertArg)) {
            fail(`insert payload shape mismatch at call ${i}`);
        }
        assertEquals(insertArg.is_test_job, undefined);
        const payload = insertArg.payload;
        const jwtDesc = Object.getOwnPropertyDescriptor(payload, 'user_jwt');
        const jwtVal = jwtDesc ? jwtDesc.value : undefined;
        assertEquals(typeof jwtVal === 'string' && jwtVal.length > 0, true);
        assertEquals(jwtVal, providedJwt);
        assert(isDialecticPlanJobPayload(payload), 'The insert payload should be a valid DialecticPlanJobPayload object');
    }
});

Deno.test("generateContributions - plan jobs include model_slug from ai_providers query", async () => {
    const mockSessionId = "sess-model-slug";
    const mockProjectId = "proj-model-slug";
    const mockUserId = "user-model-slug";
    const mockModelId = "model-123";
    const mockModelName = "test-model-slug";
    const mockJobId = "job-model-slug";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        walletId: 'wallet-1',
        user_jwt: 'jwt.token.here',
    };

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: [mockModelId],
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse],
                    error: null
                }
            },
            'ai_providers': {
                select: {
                    data: [{ name: mockModelName }],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: mockJobId }], error: null }
            },
        },
    });

    const providedJwt = 'jwt.token.here';

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'ok' }),
            downloadFromStorage: downloadFromStorage1,
            getExtensionFromMimeType: () => 'txt',
            logger,
            randomUUID: () => 'uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'f', created_at: new Date().toISOString(), file_name: 'n', mime_type: 'text/plain', project_id: mockProjectId, resource_description: {}, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
            },
            deleteFromStorage: deleteFromStorageOk,
        },
        providedJwt
    );

    assertEquals(result.success, true, "Function should return success: true");

    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy, "Insert spy for dialectic_generation_jobs should exist");
    assertEquals(insertSpy.callCount, 1, "Insert should be called exactly once");

    const insertArg = insertSpy.callsArgs[0][0];
    if (!isPlanJobInsert(insertArg)) {
        fail(`insert payload shape mismatch. Got: ${JSON.stringify(insertArg)}`);
    }

    const payload = insertArg.payload;
    assertEquals(payload.model_slug, mockModelName, "Job payload must include model_slug from ai_providers query");
    assertEquals(payload.user_jwt, providedJwt, "Job payload must include user_jwt");
    assertEquals(payload.model_id, mockModelId, "Job payload must include model_id");
    assert(isDialecticPlanJobPayload(payload), 'The insert payload should be a valid DialecticPlanJobPayload object');

    // Verify ai_providers query was made
    const aiProvidersSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('ai_providers', 'select');
    assertExists(aiProvidersSpy, "Should query ai_providers table");
    assertEquals(aiProvidersSpy.callCount, 1, "Should query ai_providers exactly once");
});

Deno.test("should create jobs with a top-level 'is_test_job' flag when specified", async () => {
    const mockSessionId = "test-session-is-test-job";
    const mockProjectId = "test-project-is-test-job";
    const mockUserId = "test-user-is-test-job";
    const mockModelId = "model-is-test-job";
    const mockJobId = "new-job-id-is-test-job";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        walletId: 'test-wallet-id',
        is_test_job: true,
        user_jwt: 'jwt.token.here',
    };

    const mockDbResponse = createMockDbResponse(1);
    assertEquals(isDatabaseRecipeSteps(mockDbResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: {
                    data: [{
                        project_id: mockProjectId,
                        selected_model_ids: [mockModelId],
                        iteration_count: 1,
                        current_stage: { slug: 'thesis' }
                    }],
                    error: null
                }
            },
            'dialectic_stages': {
                select: {
                    data: [mockDbResponse], // Simple 1-step recipe
                    error: null
                }
            },
            'ai_providers': {
                select: {
                    data: [{ name: `slug-${mockModelId}` }],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: mockJobId }] }
            },
        },
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
            {
                callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
                downloadFromStorage: downloadFromStorage100,
                getExtensionFromMimeType: () => 'txt',
                logger: logger,
                randomUUID: () => '123',
                fileManager: {
                    uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
                    assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
                },
                deleteFromStorage: deleteFromStorageOk,
            },
            'jwt.token.here'
        );

        // Assertions for the main function result
        assertEquals(result.success, true, "Function should return success: true");
        assertExists(result.data, "Result should contain data");
        assertEquals(result.data.job_ids, [mockJobId], "Returned data should contain the correct job_id in an array");

        // Assert that the insert spy was called correctly
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy, "Insert spy for dialectic_generation_jobs should exist");
        assertEquals(insertSpy.callCount, 1, "Insert should be called exactly once");

        // Assert the shape of the data passed to insert
        const insertArgs = insertSpy.callsArgs[0][0];

        if (isPlanJobInsert(insertArgs)) {
            // Assert the top-level property
            assertEquals(insertArgs.is_test_job, true, "The top-level is_test_job flag should be true");
            assert(isDialecticPlanJobPayload(insertArgs.payload), 'The insert payload should be a valid DialecticPlanJobPayload object');
            
            // Assert the payload property is gone
            const payload = insertArgs.payload;
            assertEquals(Object.prototype.hasOwnProperty.call(payload, 'is_test_job'), false, "The job payload should NOT contain an is_test_job property");
            assert(isDialecticPlanJobPayload(payload), 'The insert payload should be a valid DialecticPlanJobPayload object');

            assert(isDialecticPlanJobPayload(insertArgs.payload), 'The insert payload should be a valid DialecticPlanJobPayload object');
        } else {
            fail(`insert was not called with an object of the expected shape. Got: ${JSON.stringify(insertArgs)}`);
        }

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions successfully enqueues jobs given a valid and correctly structured stage recipe", async () => {
    // 1. Mocks are defined using the exact types from the database schema.
    const mockSessionId = "test-session-stateless";
    const mockProjectId = "test-project-stateless";
    const mockUserId = "test-user-stateless";
    const mockModelIds = ["model-stateless"];
    const mockJobId = "new-job-id-stateless";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        continueUntilComplete: true,
        walletId: 'test-wallet-id',
        user_jwt: 'jwt.token.here',
    };

    // The mock data represents the correct, nested data structure as defined by the database schema.
    // The query to fetch this data joins from 'dialectic_stages' through 'dialectic_stage_recipe_instances' to 'dialectic_stage_recipe_steps'.

    const dialecticStage: Tables<'dialectic_stages'> = {
        id: 'stage-id-correct',
        slug: 'thesis',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'prompt-1',
        description: 'A correctly structured stage object',
        display_name: 'Thesis',
        expected_output_template_ids: [],
        recipe_template_id: 'rt-1',
        active_recipe_instance_id: 'ari-1',
    };

    const dialecticStageRecipeInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'ari-1',
        stage_id: 'stage-id-correct',
        template_id: 'rt-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_cloned: false,
        cloned_at: null,
    };

    const dialecticStageRecipeStep: Tables<'dialectic_stage_recipe_steps'> = {
        id: 'step-id-1',
        instance_id: 'ari-1',
        step_key: 'key',
        step_slug: 'slug',
        step_name: 'name',
        output_type: FileType.AssembledDocumentJson,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_skipped: false,
        config_override: {},
        object_filter: {},
        output_overrides: {},
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        granularity_strategy: 'all_to_one',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: [],
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        prompt_template_id: null,
        template_step_id: null,
        step_description: 'A step for planning',
    };

    const mockCorrectDbStageResponse: DatabaseRecipeSteps = {
        ...dialecticStage,
        dialectic_stage_recipe_instances: [{
            ...dialecticStageRecipeInstance,
            dialectic_stage_recipe_steps: [dialecticStageRecipeStep],
        }],
    }
    assertEquals(isDatabaseRecipeSteps(mockCorrectDbStageResponse), true, "The mock DB response should be a valid DatabaseRecipeSteps object");


    // 2. The mock Supabase client provides a perfect, correct environment for the function.
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': {
                select: { data: [{ project_id: mockProjectId, selected_model_ids: mockModelIds, iteration_count: 1, current_stage: { slug: 'thesis' }}], error: null }
            },
            'dialectic_stages': {
                select: {
                    data: [mockCorrectDbStageResponse],
                    error: null
                }
            },
            'ai_providers': {
                select: {
                    data: [{ name: 'slug-model-stateless' }],
                    error: null
                }
            },
            'dialectic_generation_jobs': {
                insert: { data: [{ id: mockJobId }], error: null }
            },
        },
    });

    const mockDeps: GenerateContributionsDeps = {
      callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
      downloadFromStorage: downloadFromStorage100,
      getExtensionFromMimeType: () => 'txt',
      logger: logger,
      randomUUID: () => '123',
      fileManager: {
        uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId, iteration_number: null, resource_type: null, session_id: null, source_contribution_id: null, stage_slug: null }, error: null }),
        assembleAndSaveFinalDocument: () => Promise.resolve({ finalPath: null, error: null }),
       },
      deleteFromStorage: deleteFromStorageOk,
    };

    // 3. Execute the function.
    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        mockDeps,
        'jwt.token.here'
    );

    // 4. Assertions verify the function achieves the successful outcome.
    assertEquals(result.success, true, "The function should succeed in creating jobs.");
    assertExists(result.data, "Successful result should contain a data object.");
    assertEquals(result.data?.job_ids[0], mockJobId, "The correct job ID should be returned.");
});