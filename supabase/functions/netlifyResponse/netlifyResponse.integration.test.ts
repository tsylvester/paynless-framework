import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { netlifyResponseHandler } from "./netlifyResponseHandler.ts";
import { createComputeJobSig } from "../_shared/utils/computeJobSig/computeJobSig.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { createMockSaveResponseDeps } from "../dialectic-worker/saveResponse/saveResponse.provides.ts";
import type {
    SaveResponseFn,
    SaveResponseSuccessReturn,
} from "../dialectic-worker/saveResponse/saveResponse.interface.ts";
import type { NetlifyResponseDeps } from "./netlifyResponse.interface.ts";

const TEST_SECRET = "integration-test-hmac-secret";
const JOB_ID = "job-integ-1";
const USER_ID = "user-integ-1";
const RECENT_CREATED_AT = new Date().toISOString();
const EXPIRED_CREATED_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

const defaultSaveResponse: SaveResponseFn = async () => {
    const result: SaveResponseSuccessReturn = { status: "completed" };
    return result;
};

Deno.test("Integration: valid sig + unexpired job → 200; saveResponse called", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);
    const jobRow = { id: JOB_ID, user_id: USER_ID, created_at: RECENT_CREATED_AT };
    const sig = await computeJobSig(JOB_ID, USER_ID, RECENT_CREATED_AT);

    let saveResponseCalled = false;
    const saveResponseFn: SaveResponseFn = async (deps, params, payload) => {
        saveResponseCalled = true;
        const result: SaveResponseSuccessReturn = { status: "completed" };
        return result;
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
        saveResponseDeps: createMockSaveResponseDeps(),
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: JOB_ID,
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    assertEquals(saveResponseCalled, true);
});

Deno.test("Integration: invalid sig → 401; saveResponse not called", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);
    const jobRow = { id: JOB_ID, user_id: USER_ID, created_at: RECENT_CREATED_AT };

    let saveResponseCalled = false;
    const saveResponseFn: SaveResponseFn = async () => {
        saveResponseCalled = true;
        return defaultSaveResponse({} as never, {} as never, {} as never);
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
        saveResponseDeps: createMockSaveResponseDeps(),
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: JOB_ID,
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: "definitely-wrong-sig",
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Integration: expired job → 401; saveResponse not called", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);
    const jobRow = { id: JOB_ID, user_id: USER_ID, created_at: EXPIRED_CREATED_AT };
    const sig = await computeJobSig(JOB_ID, USER_ID, EXPIRED_CREATED_AT);

    let saveResponseCalled = false;
    const saveResponseFn: SaveResponseFn = async () => {
        saveResponseCalled = true;
        const result: SaveResponseSuccessReturn = { status: "completed" };
        return result;
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
        saveResponseDeps: createMockSaveResponseDeps(),
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: JOB_ID,
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Integration: missing job_id → 400; no DB call made", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);

    let saveResponseCalled = false;
    const saveResponseFn: SaveResponseFn = async () => {
        saveResponseCalled = true;
        const result: SaveResponseSuccessReturn = { status: "completed" };
        return result;
    };

    const { client, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
        saveResponseDeps: createMockSaveResponseDeps(),
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: "any-sig",
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
    assertEquals(spies.fromSpy.calls.length, 0);
});
