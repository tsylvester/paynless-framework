import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import { type GenerateContributionsPayload } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

Deno.test("generateContributions - Happy Path: Successfully enqueues a job", async () => {
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
        selectedModelIds: [mockModelId],
        continueUntilComplete: true,
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { 
                insert: { data: [{ id: mockJobId }] } 
            },
        },
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            mockUserId,
        );

        // Assertions for the main function result
        assertEquals(result.success, true, "Function should return success: true");
        assertExists(result.data, "Result should contain data");
        assertEquals(result.data.job_id, mockJobId, "Returned data should contain the correct job_id");

        // Assert that the insert spy was called correctly
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy, "Insert spy for dialectic_generation_jobs should exist");
        assertEquals(insertSpy.callCount, 1, "Insert should be called exactly once");

        // Assert the shape of the data passed to insert
        const insertArgs = insertSpy.callsArgs[0][0];
        if (typeof insertArgs === 'object' && insertArgs !== null) {
            assertObjectMatch(insertArgs, {
                session_id: mockSessionId,
                user_id: mockUserId,
                stage_slug: 'thesis',
                status: 'pending',
                payload: mockPayload, // The entire payload should be passed through
            });
        } else {
            throw new Error("insert was not called with an object");
        }

    } finally {
        localLoggerInfo.restore();
        mockSupabase.clearAllStubs?.();
    }
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
        selectedModelIds: ['model-id-fail'],
    };
    
    const dbError = { name: 'DBError', message: "Database permission denied", details: "RLS policy violation", code: "42501" };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { 
                insert: { data: null, error: dbError } 
            },
        },
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockPayload,
            mockUserId,
        );

        // Assertions for the main function result
        assertEquals(result.success, false, "Function should return success: false");
        assertExists(result.error, "Result should contain an error object");
        assertEquals(result.error.message, "Failed to create generation job.", "Error message should be correct");
        assertEquals(result.error.status, 500, "HTTP status should be 500");
        assertEquals(result.error.details, dbError.message, "Error details should contain the DB error message");

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Validation: Fails if stageSlug is missing", async () => {
    const mockPayload: GenerateContributionsPayload = {
        sessionId: 'session-123',
        projectId: 'project-123',
        selectedModelIds: ['model-123'],
        // stageSlug is intentionally omitted
    };

    const mockSupabase = createMockSupabaseClient(); // No DB calls should be made

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        'user-123',
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
        selectedModelIds: ['model-123'],
    } as GenerateContributionsPayload; // Cast to satisfy the function signature for the test

    const mockSupabase = createMockSupabaseClient();

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        'user-123',
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
        selectedModelIds: ['model-123'],
    };

    const mockSupabase = createMockSupabaseClient();

    const result = await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        // userId is intentionally passed as an empty string
        '', 
    );

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "User could not be identified for job creation.");
    assertEquals(result.error.status, 401);
});

Deno.test("generateContributions - Happy Path (with defaults): Correctly applies default iteration and retries", async () => {
    const mockSessionId = "test-session-id-defaults";
    const mockProjectId = "test-project-id-defaults";
    const mockUserId = "test-user-id-defaults";
    const mockJobId = "new-job-id-defaults";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: 'thesis',
        projectId: mockProjectId,
        selectedModelIds: ['model-id-defaults'],
        // iterationNumber and maxRetries are omitted to test defaults
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { 
                insert: { data: [{ id: mockJobId }] } 
            },
        },
    });

    await generateContributions(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockPayload,
        mockUserId,
    );

    const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, 1);

    const insertArgs = insertSpy.callsArgs[0][0];
    if (typeof insertArgs === 'object' && insertArgs !== null) {
        assertObjectMatch(insertArgs, {
            iteration_number: 1, // Should be defaulted
            max_retries: 3,      // Should be defaulted
        });
    } else {
        throw new Error("insert was not called with an object");
    }
});
