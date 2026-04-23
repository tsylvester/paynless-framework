import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { netlifyResponseHandler } from "./netlifyResponseHandler.ts";
import { createMockNetlifyResponseDeps } from "./netlifyResponse.mock.ts";

const VALID_SIG = "mock-sig";
const RECENT_CREATED_AT = new Date().toISOString();
const EXPIRED_CREATED_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const JOB_ROW = { id: "job-1", user_id: "user-1", created_at: RECENT_CREATED_AT };

Deno.test("Handler: POST + valid sig + unexpired job → saveResponse called; 200 completed", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: VALID_SIG,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "completed");
    assertEquals(saveResponseCalled, true);
});

Deno.test("Handler: POST + valid sig + unexpired job + saveResponse retriable error → 503", async () => {
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => ({ error: new Error("db timeout"), retriable: true }),
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: VALID_SIG,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 503);
});

Deno.test("Handler: POST + valid sig + unexpired job + saveResponse non-retriable error → 500", async () => {
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => ({ error: new Error("invalid state"), retriable: false }),
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: VALID_SIG,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 500);
});

Deno.test("Handler: POST + sig mismatch → 401; saveResponse not called", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: "wrong-sig",
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Handler: POST + expired job → 401; saveResponse not called", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: { id: "job-1", user_id: "user-1", created_at: EXPIRED_CREATED_AT },
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: VALID_SIG,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Handler: POST + job not found in DB → 404; saveResponse not called", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: null,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "nonexistent",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: VALID_SIG,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 404);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Handler: POST + body missing job_id → 400; saveResponse not called", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: VALID_SIG,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Handler: POST + body missing sig → 400; saveResponse not called", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
        }),
    });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Handler: non-POST request → 405; saveResponse not called", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
        saveResponse: async () => {
            saveResponseCalled = true;
            return { status: "completed" };
        },
    });
    const req = new Request("http://localhost/", { method: "GET" });
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 405);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Handler: POST + invalid JSON body → 400", async () => {
    let saveResponseCalled = false;
    const deps = createMockNetlifyResponseDeps({
        computeJobSig: async () => VALID_SIG,
        jobRow: JOB_ROW,
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
    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
});
