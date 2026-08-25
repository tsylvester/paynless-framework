import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { netlifyResponseHandler } from "./netlifyResponseHandler.ts";
import {
    buildNetlifyResponseDeps,
    buildNetlifyResponseBody,
} from "./netlifyResponse.mock.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";

const RECENT_CREATED_AT = new Date().toISOString();
const EXPIRED_CREATED_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const JOB_ROW = { id: "job-1", user_id: "user-1", created_at: RECENT_CREATED_AT };
const EXPIRED_JOB_ROW = { id: "job-1", user_id: "user-1", created_at: EXPIRED_CREATED_AT };

/**
 * Contract: given a valid body, matching job row, matching signature and unexpired TTL,
 *   the handler dispatches to saveResponse and returns 200 carrying status.
 * Arrange: a valid body from the builder; a deps bag with a job-row-returning adminClient
 *   and a success-returning saveResponse.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 200; response body status is "completed"; saveResponse was called.
 */
Deno.test("Handler: POST + valid sig + unexpired job → saveResponse called; 200 completed", async () => {
    // Arrange
    let saveResponseCalled = false;
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [JOB_ROW], error: null },
            },
        },
    });
    const deps = buildNetlifyResponseDeps({
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNetlifyResponseBody()),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "completed");
    assertEquals(saveResponseCalled, true);
});

/**
 * Contract: given saveResponse returns a retriable error, the handler returns 503
 *   carrying error.message.
 * Arrange: a valid body from the builder; a deps bag with a job-row-returning adminClient
 *   and a retriable-error saveResponse.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 503.
 */
Deno.test("Handler: POST + valid sig + unexpired job + saveResponse retriable error → 503", async () => {
    // Arrange
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [JOB_ROW], error: null },
            },
        },
    });
    const deps = buildNetlifyResponseDeps({
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: async () => ({ error: new Error("db timeout"), retriable: true }),
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNetlifyResponseBody()),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 503);
});

/**
 * Contract: given saveResponse returns a non-retriable error, the handler returns 500
 *   carrying error.message.
 * Arrange: a valid body from the builder; a deps bag with a job-row-returning adminClient
 *   and a non-retriable-error saveResponse.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 500.
 */
Deno.test("Handler: POST + valid sig + unexpired job + saveResponse non-retriable error → 500", async () => {
    // Arrange
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [JOB_ROW], error: null },
            },
        },
    });
    const deps = buildNetlifyResponseDeps({
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: async () => ({ error: new Error("invalid state"), retriable: false }),
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNetlifyResponseBody()),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 500);
});

/**
 * Contract: given the body's sig does not match computeJobSig's result, the handler
 *   returns 401 and does not call saveResponse.
 * Arrange: a valid body with a wrong sig; a deps bag with a job-row-returning adminClient.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 401; saveResponse was not called.
 */
Deno.test("Handler: POST + sig mismatch → 401; saveResponse not called", async () => {
    // Arrange
    let saveResponseCalled = false;
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [JOB_ROW], error: null },
            },
        },
    });
    const deps = buildNetlifyResponseDeps({
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNetlifyResponseBody({ sig: "wrong-sig" })),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given the job row's created_at is older than the TTL, the handler returns 401
 *   and does not call saveResponse.
 * Arrange: a valid body from the builder; a deps bag with an expired-job-row adminClient.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 401; saveResponse was not called.
 */
Deno.test("Handler: POST + expired job → 401; saveResponse not called", async () => {
    // Arrange
    let saveResponseCalled = false;
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [EXPIRED_JOB_ROW], error: null },
            },
        },
    });
    const deps = buildNetlifyResponseDeps({
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNetlifyResponseBody()),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given no job row matches the body's job_id, the handler returns 404 and does
 *   not call saveResponse.
 * Arrange: a valid body from the builder; a deps bag with a default adminClient returning
 *   no rows.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 404; saveResponse was not called.
 */
Deno.test("Handler: POST + job not found in DB → 404; saveResponse not called", async () => {
    // Arrange
    let saveResponseCalled = false;
    const deps = buildNetlifyResponseDeps({
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNetlifyResponseBody()),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 404);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given a body failing isNetlifyResponseBody (missing job_id), the handler
 *   returns 400 and does not call saveResponse.
 * Arrange: a body with job_id omitted from the builder.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 400; saveResponse was not called.
 */
Deno.test("Handler: POST + body missing job_id → 400; saveResponse not called", async () => {
    // Arrange
    let saveResponseCalled = false;
    const deps = buildNetlifyResponseDeps({
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const { job_id: _j, ...bodyWithoutJobId } = buildNetlifyResponseBody();
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithoutJobId),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given a body failing isNetlifyResponseBody (missing sig), the handler returns
 *   400 and does not call saveResponse.
 * Arrange: a body with sig omitted from the builder.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 400; saveResponse was not called.
 */
Deno.test("Handler: POST + body missing sig → 400; saveResponse not called", async () => {
    // Arrange
    let saveResponseCalled = false;
    const deps = buildNetlifyResponseDeps({
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const { sig: _s, ...bodyWithoutSig } = buildNetlifyResponseBody();
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithoutSig),
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given a non-POST request, the handler returns 405 and does not call
 *   saveResponse.
 * Arrange: a GET request.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 405; saveResponse was not called.
 */
Deno.test("Handler: non-POST request → 405; saveResponse not called", async () => {
    // Arrange
    let saveResponseCalled = false;
    const deps = buildNetlifyResponseDeps({
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", { method: "GET" });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 405);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given an unparseable body, the handler returns 400 and does not call
 *   saveResponse.
 * Arrange: a POST request with an invalid JSON body.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  response status is 400; saveResponse was not called.
 */
Deno.test("Handler: POST + invalid JSON body → 400", async () => {
    // Arrange
    let saveResponseCalled = false;
    const deps = buildNetlifyResponseDeps({
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json {{",
    });

    // Act
    const res = await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
});

/**
 * Contract: given a valid body reaching saveResponse, the handler calls deps.saveResponse
 *   with exactly two arguments — SaveResponseParams and SaveResponsePayload carrying
 *   processingTimeMs from the body.
 * Arrange: a valid body with a distinct processingTimeMs; a deps bag with a job-row-returning
 *   adminClient and an argument-capturing saveResponse.
 * Act:     netlifyResponseHandler(deps, req).
 * Assert:  saveResponse received exactly two arguments; the first carries job_id and dbClient;
 *   the second carries assembled_content, token_usage, finish_reason and processingTimeMs
 *   matching the body's value.
 */
Deno.test("Handler: saveResponse receives exactly two arguments — params and payload with processingTimeMs", async () => {
    // Arrange
    let capturedArgs: unknown[] = [];
    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [JOB_ROW], error: null },
            },
        },
    });
    const deps = buildNetlifyResponseDeps({
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: async (params, payload) => {
            capturedArgs = [params, payload];
            return { status: "completed" };
        },
    });
    const body = buildNetlifyResponseBody({ processingTimeMs: 42 });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    // Act
    await netlifyResponseHandler(deps, req);

    // Assert
    assertEquals(capturedArgs.length, 2);
    const params = capturedArgs[0] as { job_id: string; dbClient: unknown };
    assertEquals(params.job_id, body.job_id);
    assertEquals(params.dbClient, deps.adminClient);
    const payload = capturedArgs[1] as {
        assembled_content: string;
        token_usage: unknown;
        finish_reason: unknown;
        processingTimeMs: number;
    };
    assertEquals(payload.assembled_content, body.assembled_content);
    assertEquals(payload.token_usage, body.token_usage);
    assertEquals(payload.finish_reason, body.finish_reason);
    assertEquals(payload.processingTimeMs, 42);
});
