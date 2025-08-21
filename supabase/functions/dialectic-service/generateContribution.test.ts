import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import { type GenerateContributionsPayload, type GenerateContributionsDeps } from "./dialectic.interface.ts";
import type { Database, Json } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import { createMockSupabaseClient, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type JobInsert = {
    payload: {
        model_id: string;
        selectedModelIds?: string[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

// A more specific type guard for the job insert payload with the new recipe-aware fields.
type PlanJobInsert = JobInsert & {
    payload: {
        job_type: 'plan';
        step_info: {
            current_step: number;
            total_steps: number;
            status: string;
        }
    }
}

// Type guard for our specific insert payload, written without any type casting.
function isJobInsert(item: unknown): item is JobInsert {
    if (typeof item !== 'object' || item === null) {
        return false;
    }

    const payloadDescriptor = Object.getOwnPropertyDescriptor(item, 'payload');
    if (!payloadDescriptor) return false;

    const payloadValue = payloadDescriptor.value;
    if (typeof payloadValue !== 'object' || payloadValue === null) return false;

    const modelIdDescriptor = Object.getOwnPropertyDescriptor(payloadValue, 'model_id');
    if (!modelIdDescriptor) return false;

    const modelIdValue = modelIdDescriptor.value;
    if (typeof modelIdValue !== 'string') return false;

    return true;
}

function isPlanJobInsert(item: unknown): item is PlanJobInsert {
    if (!isJobInsert(item)) return false;

    const payload = item.payload;

    if (typeof payload !== 'object' || payload === null) return false;

    if (!('job_type' in payload) || payload.job_type !== 'plan') return false;

    if (!('step_info' in payload) || typeof payload.step_info !== 'object' || payload.step_info === null) return false;

    const stepInfo = payload.step_info;
    if (!('current_step' in stepInfo) || typeof stepInfo.current_step !== 'number') return false;
    if (!('total_steps' in stepInfo) || typeof stepInfo.total_steps !== 'number') return false;
    if (!('status' in stepInfo) || typeof stepInfo.status !== 'string') return false;

    return true;
}


Deno.test("generateContributions - Happy Path: Successfully enqueues multiple jobs for multiple models", async () => {
    const localLoggerInfo = spy(logger, 'info');

    // Mocks
    const mockSessionId = "test-session-id-happy";
    const mockProjectId = "test-project-id-happy";
    const mockUserId = "test-user-id-happy";
    const mockModelIds = ["model-A", "model-B"];
    const mockJobIds = ["new-job-id-A", "new-job-id-B"];
    let insertCallCount = 0;

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        continueUntilComplete: true,
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
                    data: [{
                        id: 'stage-1',
                        slug: 'thesis',
                        input_artifact_rules: { steps: [{}]}, // Simple 1-step recipe
                        created_at: new Date().toISOString(),
                        default_system_prompt_id: 'prompt-1',
                        description: 'Test stage',
                        display_name: 'Thesis',
                        expected_output_artifacts: {},
                    }],
                    error: null
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
                downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
                getExtensionFromMimeType: () => 'txt',
                logger: logger,
                randomUUID: () => '123',
                fileManager: {
                    uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId }, error: null }),
                },
                deleteFromStorage: () => Promise.resolve({ error: null }),
            }
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
            assertEquals(firstInsertPayload.model_id, mockModelIds[0]);
            assertEquals(firstInsertPayload.job_type, 'plan');
            assertEquals(firstInsertPayload.step_info.total_steps, 1);
        } else {
            throw new Error(`First insert call did not have the expected payload shape. Got: ${JSON.stringify(firstInsertCallArgs)}`);
        }

        // Assert the shape of the data passed to the second insert call
        const secondInsertCallArgs = insertSpy.callsArgs[1][0];
        if (isPlanJobInsert(secondInsertCallArgs)) {
            const secondInsertPayload = secondInsertCallArgs.payload;
            assertEquals(secondInsertPayload.model_id, mockModelIds[1]);
        } else {
            throw new Error(`Second insert call did not have the expected payload shape. Got: ${JSON.stringify(secondInsertCallArgs)}`);
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

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: mockProjectId,
        continueUntilComplete: true,
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
                    data: [{
                        id: 'stage-1',
                        slug: 'thesis',
                        input_artifact_rules: { steps: [{}, {}, {}] }, // 3-step recipe
                        created_at: new Date().toISOString(),
                        default_system_prompt_id: 'prompt-1',
                        description: 'Test stage',
                        display_name: 'Thesis',
                        expected_output_artifacts: {},
                    }],
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
                downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
                getExtensionFromMimeType: () => 'txt',
                logger: logger,
                randomUUID: () => '123',
                fileManager: {
                    uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId }, error: null }),
                },
                deleteFromStorage: () => Promise.resolve({ error: null }),
            }
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
                status: 'pending'
            });
            assertEquals(insertArgs.payload.model_id, mockModelId);
            assertEquals(insertArgs.payload.job_type, 'plan');
            assertEquals(insertArgs.payload.step_info.current_step, 1);
            assertEquals(insertArgs.payload.step_info.total_steps, 3);
        } else {
            throw new Error(`insert was not called with an object of the expected shape. Got: ${JSON.stringify(insertArgs)}`);
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
            downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
            getExtensionFromMimeType: () => '.txt',
            logger,
            randomUUID: () => 'mock-uuid',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123' }, error: null }),
            },
            deleteFromStorage: () => Promise.resolve({ error: null }),
        }
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
    };

    const dbError = { name: 'DBError', message: "Database permission denied", details: "RLS policy violation", code: "42501" };

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
                    data: [{
                        id: 'stage-1',
                        slug: 'thesis',
                        input_artifact_rules: { steps: [{}]}, // Simple 1-step recipe
                        created_at: new Date().toISOString(),
                        default_system_prompt_id: 'prompt-1',
                        description: 'Test stage',
                        display_name: 'Thesis',
                        expected_output_artifacts: {},
                    }],
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
      downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
      getExtensionFromMimeType: () => '.txt',
      logger,
      randomUUID: () => 'mock-uuid',
      deleteFromStorage: () => Promise.resolve({ data: [], error: null }),
      fileManager: {
        uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: mockUserId }, error: null }),
      },
    };

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
            mockDeps
        );

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
    };

    const mockSupabase = createMockSupabaseClient(); // No DB calls should be made

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        { id: 'user-123', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123' }, error: null }),
            },
            deleteFromStorage: () => Promise.resolve({ error: null }),
        }
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
            downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123' }, error: null }),
            },
            deleteFromStorage: () => Promise.resolve({ error: null }),
        }
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
    };

    const mockSupabase = createMockSupabaseClient();

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        // userId is intentionally passed as an empty string
        { id: '', app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() },
        {
            callUnifiedAIModel: () => Promise.resolve({ content: 'test-content' }),
            downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123' }, error: null }),
            },
            deleteFromStorage: () => Promise.resolve({ error: null }),
        }
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
            downloadFromStorage: () => Promise.resolve({ data: new ArrayBuffer(100), error: null }),
            getExtensionFromMimeType: () => 'txt',
            logger: logger,
            randomUUID: () => '123',
            fileManager: {
                uploadAndRegisterFile: () => Promise.resolve({ record: { id: 'test-file-id', created_at: new Date().toISOString(), file_name: 'test-file-name', mime_type: 'text/plain', project_id: 'test-project-id', resource_description: {}, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test-path', updated_at: new Date().toISOString(), user_id: 'user-123' }, error: null }),
            },
            deleteFromStorage: () => Promise.resolve({ error: null }),
        }
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "The session has no selected models. Please select at least one model.");
    assertEquals(result.error.status, 400);
});
