import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseErrorReturn,
    SaveResponseParams,
    SaveResponsePayload,
    SaveResponseRequestBody,
    SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";
import { createMockSaveResponseDeps } from "./saveResponse.mock.ts";

Deno.test(
    "Contract: valid SaveResponseParams has non-empty job_id and dbClient present",
    () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient("save-response-interface-test");
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = {
            job_id: "job-id-non-empty",
            dbClient,
        };
        assertEquals(params.job_id.length > 0, true);
        assertEquals("dbClient" in params, true);
        assertEquals(typeof params.dbClient, "object");
    },
);

Deno.test(
    "Contract: object with only dbClient is structurally incomplete for SaveResponseParams (missing job_id)",
    () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient("save-response-interface-test");
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
        const onlyDbClient: { dbClient: SupabaseClient<Database> } = {
            dbClient,
        };
        assertEquals("job_id" in onlyDbClient, false);
    },
);

Deno.test(
    "Contract: object with only job_id is structurally incomplete for SaveResponseParams (missing dbClient)",
    () => {
        const onlyJobId: { job_id: string } = {
            job_id: "job-id-only",
        };
        assertEquals("dbClient" in onlyJobId, false);
    },
);

Deno.test(
    "Contract: valid SaveResponsePayload has non-empty assembled_content and NodeTokenUsage token_usage",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
        };
        const payload: SaveResponsePayload = {
            assembled_content: "assembled",
            token_usage: usage,
        };
        assertEquals(payload.assembled_content.length > 0, true);
        if (payload.token_usage !== null) {
            const u: NodeTokenUsage = payload.token_usage;
            assertEquals(typeof u.prompt_tokens, "number");
            assertEquals(typeof u.completion_tokens, "number");
            assertEquals(typeof u.total_tokens, "number");
        }
    },
);

Deno.test(
    "Contract: valid SaveResponsePayload allows null token_usage",
    () => {
        const payload: SaveResponsePayload = {
            assembled_content: "assembled",
            token_usage: null,
        };
        assertEquals(payload.token_usage === null, true);
        assertEquals(payload.assembled_content.length > 0, true);
    },
);

Deno.test(
    "Contract: object missing assembled_content is structurally incomplete for SaveResponsePayload",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const missingContent: { token_usage: NodeTokenUsage | null } = {
            token_usage: usage,
        };
        assertEquals("assembled_content" in missingContent, false);
    },
);

Deno.test(
    "Contract: token_usage that is neither NodeTokenUsage nor null is wrong shape for SaveResponsePayload",
    () => {
        const wrongTokenUsage: { assembled_content: string; token_usage: string } = {
            assembled_content: "x",
            token_usage: "not-usage",
        };
        const tu: string = wrongTokenUsage.token_usage;
        assertEquals(tu === null, false);
        assertEquals(typeof tu === "object", false);
    },
);

Deno.test(
    "Contract: valid SaveResponseRequestBody matches transport shape job_id, assembled_content, token_usage",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const body: SaveResponseRequestBody = {
            job_id: "job",
            assembled_content: "content",
            token_usage: usage,
        };
        assertEquals("job_id" in body, true);
        assertEquals("assembled_content" in body, true);
        assertEquals("token_usage" in body, true);
    },
);

Deno.test(
    "Contract: SaveResponseRequestBody structurally incomplete when job_id missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const missingJob: { assembled_content: string; token_usage: NodeTokenUsage } = {
            assembled_content: "c",
            token_usage: usage,
        };
        assertEquals("job_id" in missingJob, false);
    },
);

Deno.test(
    "Contract: SaveResponseRequestBody structurally incomplete when assembled_content missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const missingAssembled: { job_id: string; token_usage: NodeTokenUsage } = {
            job_id: "j",
            token_usage: usage,
        };
        assertEquals("assembled_content" in missingAssembled, false);
    },
);

Deno.test(
    "Contract: SaveResponseRequestBody wrong token_usage type is not object-or-null shape",
    () => {
        const wrongBody: {
            job_id: string;
            assembled_content: string;
            token_usage: number;
        } = {
            job_id: "j",
            assembled_content: "c",
            token_usage: 1,
        };
        const tu: number = wrongBody.token_usage;
        assertEquals(tu === null, false);
        assertEquals(typeof tu === "object", false);
    },
);

Deno.test(
    "Contract: valid SaveResponseDeps has all twelve dependency fields present",
    () => {
        const deps: SaveResponseDeps = createMockSaveResponseDeps();
        assertEquals("logger" in deps, true);
        assertEquals("fileManager" in deps, true);
        assertEquals("notificationService" in deps, true);
        assertEquals("continueJob" in deps, true);
        assertEquals("retryJob" in deps, true);
        assertEquals("resolveFinishReason" in deps, true);
        assertEquals("isIntermediateChunk" in deps, true);
        assertEquals("determineContinuation" in deps, true);
        assertEquals("buildUploadContext" in deps, true);
        assertEquals("debitTokens" in deps, true);
        assertEquals("userTokenWalletService" in deps, true);
        assertEquals("sanitizeJsonContent" in deps, true);
    },
);

Deno.test(
    "Contract: SaveResponseDeps structurally incomplete when any single field is absent",
    () => {
        const full: SaveResponseDeps = createMockSaveResponseDeps();
        const missingLogger: Omit<SaveResponseDeps, "logger"> & {
            logger?: SaveResponseDeps["logger"];
        } = { ...full };
        delete missingLogger.logger;
        assertEquals("logger" in missingLogger, false);
    },
);

Deno.test(
    "Contract: SaveResponseSuccessReturn status is completed | needs_continuation | continuation_limit_reached",
    async (t) => {
        await t.step("status completed", () => {
            const r: SaveResponseSuccessReturn = { status: "completed" };
            assertEquals(r.status, "completed");
        });
        await t.step("status needs_continuation", () => {
            const r: SaveResponseSuccessReturn = { status: "needs_continuation" };
            assertEquals(r.status, "needs_continuation");
        });
        await t.step("status continuation_limit_reached", () => {
            const r: SaveResponseSuccessReturn = {
                status: "continuation_limit_reached",
            };
            assertEquals(r.status, "continuation_limit_reached");
        });
    },
);

Deno.test(
    "Contract: SaveResponseErrorReturn has Error and retriable boolean",
    () => {
        const err: SaveResponseErrorReturn = {
            error: new Error("failure"),
            retriable: true,
        };
        assertEquals(err.error instanceof Error, true);
        assertEquals(typeof err.retriable, "boolean");
    },
);
