import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { EnqueueModelCallDeps } from "./enqueueModelCall.interface.ts";
import { invalidateDialecticJobRow } from "../../_shared/dialectic.mock.ts";
import {
    buildAiStreamEventBody,
    buildAiStreamEventData,
    buildEnqueueModelCallDeps,
    buildEnqueueModelCallEventSizeErrorReturn,
    buildEnqueueModelCallJobRowErrorReturn,
    buildEnqueueModelCallParams,
    buildEnqueueModelCallPayload,
    buildEnqueueModelCallPreparationErrorReturn,
    buildEnqueueModelCallQueueRejectedErrorReturn,
    buildEnqueueModelCallQueueUnreachableErrorReturn,
    buildEnqueueModelCallSuccessReturn,
    invalidateAiStreamEventBody,
    invalidateAiStreamEventData,
    invalidateEnqueueModelCallDeps,
    invalidateEnqueueModelCallEventSizeErrorReturn,
    invalidateEnqueueModelCallJobRowErrorReturn,
    invalidateEnqueueModelCallParams,
    invalidateEnqueueModelCallPayload,
    invalidateEnqueueModelCallPreparationErrorReturn,
    invalidateEnqueueModelCallQueueRejectedErrorReturn,
    invalidateEnqueueModelCallQueueUnreachableErrorReturn,
    invalidateEnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.mock.ts";
import {
    isAiStreamEventBody,
    isAiStreamEventData,
    isEnqueueModelCallDeps,
    isEnqueueModelCallErrorReturn,
    isEnqueueModelCallEventSizeErrorReturn,
    isEnqueueModelCallJobRowErrorReturn,
    isEnqueueModelCallParams,
    isEnqueueModelCallPayload,
    isEnqueueModelCallPreparationErrorReturn,
    isEnqueueModelCallQueueRejectedErrorReturn,
    isEnqueueModelCallQueueUnreachableErrorReturn,
    isEnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.guard.ts";

// isEnqueueModelCallDeps

Deno.test("isEnqueueModelCallDeps accepts the valid default", () => {
    const deps: EnqueueModelCallDeps = buildEnqueueModelCallDeps();
    assert(isEnqueueModelCallDeps(deps));
});

Deno.test("isEnqueueModelCallDeps rejects non-objects", () => {
    for (const x of [null, 0, "x", []]) assert(!isEnqueueModelCallDeps(x));
});

Deno.test("isEnqueueModelCallDeps rejects each missing required key", () => {
    const full = buildEnqueueModelCallDeps();
    assert(!isEnqueueModelCallDeps({ netlifyQueueUrl: full.netlifyQueueUrl, netlifyApiKey: full.netlifyApiKey, apiKeyForProvider: full.apiKeyForProvider, computeJobSig: full.computeJobSig }));
    assert(!isEnqueueModelCallDeps({ logger: full.logger, netlifyApiKey: full.netlifyApiKey, apiKeyForProvider: full.apiKeyForProvider, computeJobSig: full.computeJobSig }));
    assert(!isEnqueueModelCallDeps({ logger: full.logger, netlifyQueueUrl: full.netlifyQueueUrl, apiKeyForProvider: full.apiKeyForProvider, computeJobSig: full.computeJobSig }));
    assert(!isEnqueueModelCallDeps({ logger: full.logger, netlifyQueueUrl: full.netlifyQueueUrl, netlifyApiKey: full.netlifyApiKey, computeJobSig: full.computeJobSig }));
    assert(!isEnqueueModelCallDeps({ logger: full.logger, netlifyQueueUrl: full.netlifyQueueUrl, netlifyApiKey: full.netlifyApiKey, apiKeyForProvider: full.apiKeyForProvider }));
});

Deno.test("isEnqueueModelCallDeps rejects each corrupted member", () => {
    assert(!isEnqueueModelCallDeps(invalidateEnqueueModelCallDeps({ logger: "not-a-logger" })));
    assert(!isEnqueueModelCallDeps(invalidateEnqueueModelCallDeps({ netlifyQueueUrl: 7 })));
    assert(!isEnqueueModelCallDeps(invalidateEnqueueModelCallDeps({ netlifyApiKey: 7 })));
    assert(!isEnqueueModelCallDeps(invalidateEnqueueModelCallDeps({ apiKeyForProvider: "not-a-fn" })));
    assert(!isEnqueueModelCallDeps(invalidateEnqueueModelCallDeps({ computeJobSig: 42 })));
});

// isEnqueueModelCallParams

Deno.test("isEnqueueModelCallParams accepts the valid default", () => {
    assert(isEnqueueModelCallParams(buildEnqueueModelCallParams()));
});

Deno.test("isEnqueueModelCallParams rejects non-objects", () => {
    for (const x of [null, "x", 7, []]) assert(!isEnqueueModelCallParams(x));
});

Deno.test("isEnqueueModelCallParams rejects each corrupted member", () => {
    assert(!isEnqueueModelCallParams(invalidateEnqueueModelCallParams({ dbClient: "not-a-client" })));
});

Deno.test("isEnqueueModelCallParams rejects each omitted required member", () => {
    const { dbClient: _dbClient, ...rest } = buildEnqueueModelCallParams();
    assert(!isEnqueueModelCallParams(rest));
});

Deno.test("isEnqueueModelCallParams accepts params carrying none of job, providerRow, userConfig or userAuthToken", () => {
    const params = buildEnqueueModelCallParams();
    assertEquals("job" in params, false);
    assertEquals("providerRow" in params, false);
    assertEquals("userConfig" in params, false);
    assertEquals("userAuthToken" in params, false);
    assert(isEnqueueModelCallParams(params));
});

// isEnqueueModelCallPayload

Deno.test("isEnqueueModelCallPayload accepts the valid default", () => {
    assert(isEnqueueModelCallPayload(buildEnqueueModelCallPayload()));
});

Deno.test("isEnqueueModelCallPayload rejects non-objects", () => {
    for (const x of [null, [], 7, "x"]) assert(!isEnqueueModelCallPayload(x));
});

Deno.test("isEnqueueModelCallPayload rejects each corrupted member", () => {
    assert(!isEnqueueModelCallPayload(invalidateEnqueueModelCallPayload({ job: invalidateDialecticJobRow({ id: null }) })));
    const validPayload = buildEnqueueModelCallPayload();
    assert(!isEnqueueModelCallPayload(invalidateEnqueueModelCallPayload({ providerRow: { ...validPayload.providerRow, api_identifier: 123 } })));
    assert(!isEnqueueModelCallPayload(invalidateEnqueueModelCallPayload({ userConfig: { tier_output_cap_tokens: "invalid" } })));
    assert(!isEnqueueModelCallPayload(invalidateEnqueueModelCallPayload({ chatApiRequest: "not-a-record" })));
    assert(!isEnqueueModelCallPayload(invalidateEnqueueModelCallPayload({ preflightInputTokens: "not-a-number" })));
});

Deno.test("isEnqueueModelCallPayload rejects each omitted required member", () => {
    const { job: _a, ...r1 } = buildEnqueueModelCallPayload();
    assert(!isEnqueueModelCallPayload(r1));
    const { providerRow: _b, ...r2 } = buildEnqueueModelCallPayload();
    assert(!isEnqueueModelCallPayload(r2));
    const { userConfig: _c, ...r3 } = buildEnqueueModelCallPayload();
    assert(!isEnqueueModelCallPayload(r3));
    const { chatApiRequest: _d, ...r4 } = buildEnqueueModelCallPayload();
    assert(!isEnqueueModelCallPayload(r4));
    const { preflightInputTokens: _e, ...r5 } = buildEnqueueModelCallPayload();
    assert(!isEnqueueModelCallPayload(r5));
});

// isEnqueueModelCallSuccessReturn

Deno.test("isEnqueueModelCallSuccessReturn accepts the valid default", () => {
    assert(isEnqueueModelCallSuccessReturn(buildEnqueueModelCallSuccessReturn()));
});

Deno.test("isEnqueueModelCallSuccessReturn accepts valid overrides", () => {
    assert(isEnqueueModelCallSuccessReturn(buildEnqueueModelCallSuccessReturn({ queueStatus: 201 })));
});

Deno.test("isEnqueueModelCallSuccessReturn rejects non-objects", () => {
    for (const x of [null, "x", 7, []]) assert(!isEnqueueModelCallSuccessReturn(x));
});

Deno.test("isEnqueueModelCallSuccessReturn rejects each corrupted member", () => {
    assert(!isEnqueueModelCallSuccessReturn(invalidateEnqueueModelCallSuccessReturn({ queued: false })));
    assert(!isEnqueueModelCallSuccessReturn(invalidateEnqueueModelCallSuccessReturn({ jobId: 123 })));
    assert(!isEnqueueModelCallSuccessReturn(invalidateEnqueueModelCallSuccessReturn({ sig: 123 })));
    assert(!isEnqueueModelCallSuccessReturn(invalidateEnqueueModelCallSuccessReturn({ preflightInputTokens: "not-a-number" })));
    assert(!isEnqueueModelCallSuccessReturn(invalidateEnqueueModelCallSuccessReturn({ eventBodyBytes: "not-a-number" })));
    assert(!isEnqueueModelCallSuccessReturn(invalidateEnqueueModelCallSuccessReturn({ queueStatus: "not-a-number" })));
});

Deno.test("isEnqueueModelCallSuccessReturn rejects each omitted required member", () => {
    const { queued: _a, ...r1 } = buildEnqueueModelCallSuccessReturn();
    assert(!isEnqueueModelCallSuccessReturn(r1));
    const { jobId: _b, ...r2 } = buildEnqueueModelCallSuccessReturn();
    assert(!isEnqueueModelCallSuccessReturn(r2));
    const { sig: _c, ...r3 } = buildEnqueueModelCallSuccessReturn();
    assert(!isEnqueueModelCallSuccessReturn(r3));
    const { preflightInputTokens: _d, ...r4 } = buildEnqueueModelCallSuccessReturn();
    assert(!isEnqueueModelCallSuccessReturn(r4));
    const { eventBodyBytes: _e, ...r5 } = buildEnqueueModelCallSuccessReturn();
    assert(!isEnqueueModelCallSuccessReturn(r5));
    const { queueStatus: _f, ...r6 } = buildEnqueueModelCallSuccessReturn();
    assert(!isEnqueueModelCallSuccessReturn(r6));
});

// isEnqueueModelCallPreparationErrorReturn

Deno.test("isEnqueueModelCallPreparationErrorReturn accepts the valid default", () => {
    assert(isEnqueueModelCallPreparationErrorReturn(buildEnqueueModelCallPreparationErrorReturn()));
});

Deno.test("isEnqueueModelCallPreparationErrorReturn accepts valid overrides", () => {
    assert(isEnqueueModelCallPreparationErrorReturn(buildEnqueueModelCallPreparationErrorReturn({ failure: "api_key_missing" })));
});

Deno.test("isEnqueueModelCallPreparationErrorReturn rejects non-objects", () => {
    for (const x of [null, undefined, 7, "x", []]) assert(!isEnqueueModelCallPreparationErrorReturn(x));
});

Deno.test("isEnqueueModelCallPreparationErrorReturn rejects each corrupted member", () => {
    assert(!isEnqueueModelCallPreparationErrorReturn(invalidateEnqueueModelCallPreparationErrorReturn({ failure: "not-a-preparation-failure" })));
    assert(!isEnqueueModelCallPreparationErrorReturn(invalidateEnqueueModelCallPreparationErrorReturn({ error: "not-an-error" })));
    assert(!isEnqueueModelCallPreparationErrorReturn(invalidateEnqueueModelCallPreparationErrorReturn({ retriable: "not-a-boolean" })));
});

Deno.test("isEnqueueModelCallPreparationErrorReturn rejects each omitted required member", () => {
    const { failure: _a, ...r1 } = buildEnqueueModelCallPreparationErrorReturn();
    assert(!isEnqueueModelCallPreparationErrorReturn(r1));
    const { error: _b, ...r2 } = buildEnqueueModelCallPreparationErrorReturn();
    assert(!isEnqueueModelCallPreparationErrorReturn(r2));
    const { retriable: _c, ...r3 } = buildEnqueueModelCallPreparationErrorReturn();
    assert(!isEnqueueModelCallPreparationErrorReturn(r3));
});

Deno.test("isEnqueueModelCallPreparationErrorReturn rejects the other four flavors' builders", () => {
    assert(!isEnqueueModelCallPreparationErrorReturn(buildEnqueueModelCallJobRowErrorReturn()));
    assert(!isEnqueueModelCallPreparationErrorReturn(buildEnqueueModelCallEventSizeErrorReturn()));
    assert(!isEnqueueModelCallPreparationErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn()));
    assert(!isEnqueueModelCallPreparationErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn()));
});

// isEnqueueModelCallJobRowErrorReturn

Deno.test("isEnqueueModelCallJobRowErrorReturn accepts the valid default", () => {
    assert(isEnqueueModelCallJobRowErrorReturn(buildEnqueueModelCallJobRowErrorReturn()));
});

Deno.test("isEnqueueModelCallJobRowErrorReturn accepts valid overrides", () => {
    assert(isEnqueueModelCallJobRowErrorReturn(buildEnqueueModelCallJobRowErrorReturn({ error: new Error("other") })));
});

Deno.test("isEnqueueModelCallJobRowErrorReturn rejects non-objects", () => {
    for (const x of [null, undefined, 7, "x", []]) assert(!isEnqueueModelCallJobRowErrorReturn(x));
});

Deno.test("isEnqueueModelCallJobRowErrorReturn rejects each corrupted member", () => {
    assert(!isEnqueueModelCallJobRowErrorReturn(invalidateEnqueueModelCallJobRowErrorReturn({ failure: "not-a-job-row-failure" })));
    assert(!isEnqueueModelCallJobRowErrorReturn(invalidateEnqueueModelCallJobRowErrorReturn({ error: "not-an-error" })));
    assert(!isEnqueueModelCallJobRowErrorReturn(invalidateEnqueueModelCallJobRowErrorReturn({ retriable: "not-a-boolean" })));
});

Deno.test("isEnqueueModelCallJobRowErrorReturn rejects each omitted required member", () => {
    const { failure: _a, ...r1 } = buildEnqueueModelCallJobRowErrorReturn();
    assert(!isEnqueueModelCallJobRowErrorReturn(r1));
    const { error: _b, ...r2 } = buildEnqueueModelCallJobRowErrorReturn();
    assert(!isEnqueueModelCallJobRowErrorReturn(r2));
    const { retriable: _c, ...r3 } = buildEnqueueModelCallJobRowErrorReturn();
    assert(!isEnqueueModelCallJobRowErrorReturn(r3));
});

Deno.test("isEnqueueModelCallJobRowErrorReturn rejects the other four flavors' builders", () => {
    assert(!isEnqueueModelCallJobRowErrorReturn(buildEnqueueModelCallPreparationErrorReturn()));
    assert(!isEnqueueModelCallJobRowErrorReturn(buildEnqueueModelCallEventSizeErrorReturn()));
    assert(!isEnqueueModelCallJobRowErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn()));
    assert(!isEnqueueModelCallJobRowErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn()));
});

// isEnqueueModelCallEventSizeErrorReturn

Deno.test("isEnqueueModelCallEventSizeErrorReturn accepts the valid default", () => {
    assert(isEnqueueModelCallEventSizeErrorReturn(buildEnqueueModelCallEventSizeErrorReturn()));
});

Deno.test("isEnqueueModelCallEventSizeErrorReturn accepts valid overrides", () => {
    assert(isEnqueueModelCallEventSizeErrorReturn(buildEnqueueModelCallEventSizeErrorReturn({ eventBodyBytes: 700000 })));
});

Deno.test("isEnqueueModelCallEventSizeErrorReturn rejects non-objects", () => {
    for (const x of [null, undefined, 7, "x", []]) assert(!isEnqueueModelCallEventSizeErrorReturn(x));
});

Deno.test("isEnqueueModelCallEventSizeErrorReturn rejects each corrupted member", () => {
    assert(!isEnqueueModelCallEventSizeErrorReturn(invalidateEnqueueModelCallEventSizeErrorReturn({ failure: "not-an-event-size-failure" })));
    assert(!isEnqueueModelCallEventSizeErrorReturn(invalidateEnqueueModelCallEventSizeErrorReturn({ error: "not-an-error" })));
    assert(!isEnqueueModelCallEventSizeErrorReturn(invalidateEnqueueModelCallEventSizeErrorReturn({ retriable: "not-a-boolean" })));
    assert(!isEnqueueModelCallEventSizeErrorReturn(invalidateEnqueueModelCallEventSizeErrorReturn({ eventBodyBytes: "not-a-number" })));
    assert(!isEnqueueModelCallEventSizeErrorReturn(invalidateEnqueueModelCallEventSizeErrorReturn({ limitBytes: "not-a-number" })));
});

Deno.test("isEnqueueModelCallEventSizeErrorReturn rejects each omitted required member", () => {
    const { failure: _a, ...r1 } = buildEnqueueModelCallEventSizeErrorReturn();
    assert(!isEnqueueModelCallEventSizeErrorReturn(r1));
    const { error: _b, ...r2 } = buildEnqueueModelCallEventSizeErrorReturn();
    assert(!isEnqueueModelCallEventSizeErrorReturn(r2));
    const { retriable: _c, ...r3 } = buildEnqueueModelCallEventSizeErrorReturn();
    assert(!isEnqueueModelCallEventSizeErrorReturn(r3));
    const { eventBodyBytes: _d, ...r4 } = buildEnqueueModelCallEventSizeErrorReturn();
    assert(!isEnqueueModelCallEventSizeErrorReturn(r4));
    const { limitBytes: _e, ...r5 } = buildEnqueueModelCallEventSizeErrorReturn();
    assert(!isEnqueueModelCallEventSizeErrorReturn(r5));
});

Deno.test("isEnqueueModelCallEventSizeErrorReturn rejects the other four flavors' builders", () => {
    assert(!isEnqueueModelCallEventSizeErrorReturn(buildEnqueueModelCallPreparationErrorReturn()));
    assert(!isEnqueueModelCallEventSizeErrorReturn(buildEnqueueModelCallJobRowErrorReturn()));
    assert(!isEnqueueModelCallEventSizeErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn()));
    assert(!isEnqueueModelCallEventSizeErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn()));
});

// isEnqueueModelCallQueueRejectedErrorReturn

Deno.test("isEnqueueModelCallQueueRejectedErrorReturn accepts the valid default", () => {
    assert(isEnqueueModelCallQueueRejectedErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn()));
});

Deno.test("isEnqueueModelCallQueueRejectedErrorReturn accepts valid overrides", () => {
    assert(isEnqueueModelCallQueueRejectedErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn({ queueStatus: 500 })));
});

Deno.test("isEnqueueModelCallQueueRejectedErrorReturn rejects non-objects", () => {
    for (const x of [null, undefined, 7, "x", []]) assert(!isEnqueueModelCallQueueRejectedErrorReturn(x));
});

Deno.test("isEnqueueModelCallQueueRejectedErrorReturn rejects each corrupted member", () => {
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(invalidateEnqueueModelCallQueueRejectedErrorReturn({ failure: "not-a-queue-rejected-failure" })));
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(invalidateEnqueueModelCallQueueRejectedErrorReturn({ error: "not-an-error" })));
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(invalidateEnqueueModelCallQueueRejectedErrorReturn({ retriable: "not-a-boolean" })));
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(invalidateEnqueueModelCallQueueRejectedErrorReturn({ queueStatus: "not-a-number" })));
});

Deno.test("isEnqueueModelCallQueueRejectedErrorReturn rejects each omitted required member", () => {
    const { failure: _a, ...r1 } = buildEnqueueModelCallQueueRejectedErrorReturn();
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(r1));
    const { error: _b, ...r2 } = buildEnqueueModelCallQueueRejectedErrorReturn();
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(r2));
    const { retriable: _c, ...r3 } = buildEnqueueModelCallQueueRejectedErrorReturn();
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(r3));
    const { queueStatus: _d, ...r4 } = buildEnqueueModelCallQueueRejectedErrorReturn();
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(r4));
});

Deno.test("isEnqueueModelCallQueueRejectedErrorReturn rejects the other four flavors' builders", () => {
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(buildEnqueueModelCallPreparationErrorReturn()));
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(buildEnqueueModelCallJobRowErrorReturn()));
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(buildEnqueueModelCallEventSizeErrorReturn()));
    assert(!isEnqueueModelCallQueueRejectedErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn()));
});

// isEnqueueModelCallQueueUnreachableErrorReturn

Deno.test("isEnqueueModelCallQueueUnreachableErrorReturn accepts the valid default", () => {
    assert(isEnqueueModelCallQueueUnreachableErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn()));
});

Deno.test("isEnqueueModelCallQueueUnreachableErrorReturn accepts valid overrides", () => {
    assert(isEnqueueModelCallQueueUnreachableErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn({ error: new Error("other") })));
});

Deno.test("isEnqueueModelCallQueueUnreachableErrorReturn rejects non-objects", () => {
    for (const x of [null, undefined, 7, "x", []]) assert(!isEnqueueModelCallQueueUnreachableErrorReturn(x));
});

Deno.test("isEnqueueModelCallQueueUnreachableErrorReturn rejects each corrupted member", () => {
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(invalidateEnqueueModelCallQueueUnreachableErrorReturn({ failure: "not-a-queue-unreachable-failure" })));
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(invalidateEnqueueModelCallQueueUnreachableErrorReturn({ error: "not-an-error" })));
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(invalidateEnqueueModelCallQueueUnreachableErrorReturn({ retriable: "not-a-boolean" })));
});

Deno.test("isEnqueueModelCallQueueUnreachableErrorReturn rejects each omitted required member", () => {
    const { failure: _a, ...r1 } = buildEnqueueModelCallQueueUnreachableErrorReturn();
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(r1));
    const { error: _b, ...r2 } = buildEnqueueModelCallQueueUnreachableErrorReturn();
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(r2));
    const { retriable: _c, ...r3 } = buildEnqueueModelCallQueueUnreachableErrorReturn();
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(r3));
});

Deno.test("isEnqueueModelCallQueueUnreachableErrorReturn rejects the other four flavors' builders", () => {
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(buildEnqueueModelCallPreparationErrorReturn()));
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(buildEnqueueModelCallJobRowErrorReturn()));
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(buildEnqueueModelCallEventSizeErrorReturn()));
    assert(!isEnqueueModelCallQueueUnreachableErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn()));
});

// isEnqueueModelCallErrorReturn

Deno.test("isEnqueueModelCallErrorReturn accepts each of the five flavors' builders", () => {
    assert(isEnqueueModelCallErrorReturn(buildEnqueueModelCallPreparationErrorReturn()));
    assert(isEnqueueModelCallErrorReturn(buildEnqueueModelCallJobRowErrorReturn()));
    assert(isEnqueueModelCallErrorReturn(buildEnqueueModelCallEventSizeErrorReturn()));
    assert(isEnqueueModelCallErrorReturn(buildEnqueueModelCallQueueRejectedErrorReturn()));
    assert(isEnqueueModelCallErrorReturn(buildEnqueueModelCallQueueUnreachableErrorReturn()));
});

Deno.test("isEnqueueModelCallErrorReturn rejects a record carrying error and retriable but no failure", () => {
    assert(!isEnqueueModelCallErrorReturn({ error: new Error("x"), retriable: false }));
});

Deno.test("isEnqueueModelCallErrorReturn rejects a built success return", () => {
    assert(!isEnqueueModelCallErrorReturn(buildEnqueueModelCallSuccessReturn()));
});

// isAiStreamEventData

Deno.test("isAiStreamEventData accepts the valid default", () => {
    assert(isAiStreamEventData(buildAiStreamEventData()));
});

Deno.test("isAiStreamEventData rejects non-objects", () => {
    for (const x of [null, "x", 7, []]) assert(!isAiStreamEventData(x));
});

Deno.test("isAiStreamEventData rejects each omitted required member", () => {
    const { job_id: _a, ...r1 } = buildAiStreamEventData();
    assert(!isAiStreamEventData(r1));
    const { api_identifier: _b, ...r2 } = buildAiStreamEventData();
    assert(!isAiStreamEventData(r2));
    const { model_config: _c, ...r3 } = buildAiStreamEventData();
    assert(!isAiStreamEventData(r3));
    const { chat_api_request: _d, ...r4 } = buildAiStreamEventData();
    assert(!isAiStreamEventData(r4));
    const { sig: _e, ...r5 } = buildAiStreamEventData();
    assert(!isAiStreamEventData(r5));
});

Deno.test("isAiStreamEventData rejects user_jwt in place of sig", () => {
    const { sig: _sig, ...rest } = buildAiStreamEventData({ user_config: { tier_output_cap_tokens: null } });
    assert(!isAiStreamEventData({ ...rest, user_jwt: "jwt-token" }));
});

Deno.test("isAiStreamEventData accepts tier_output_cap_tokens null and 32768", () => {
    assert(isAiStreamEventData(buildAiStreamEventData({ user_config: { tier_output_cap_tokens: null } })));
    assert(isAiStreamEventData(buildAiStreamEventData({ user_config: { tier_output_cap_tokens: 32768 } })));
});

Deno.test("isAiStreamEventData rejects corrupted user_config, model_config and chat_api_request", () => {
    assert(!isAiStreamEventData(invalidateAiStreamEventData({ user_config: {} })));
    assert(!isAiStreamEventData(invalidateAiStreamEventData({ model_config: {} })));
    assert(!isAiStreamEventData(invalidateAiStreamEventData({ chat_api_request: {} })));
});

// isAiStreamEventBody

Deno.test("isAiStreamEventBody accepts the valid default", () => {
    assert(isAiStreamEventBody(buildAiStreamEventBody()));
});

Deno.test("isAiStreamEventBody rejects non-objects", () => {
    for (const x of [null, 0, 7, "x", []]) assert(!isAiStreamEventBody(x));
});

Deno.test("isAiStreamEventBody rejects each omitted required member", () => {
    const { eventName: _a, ...r1 } = buildAiStreamEventBody();
    assert(!isAiStreamEventBody(r1));
    const { data: _b, ...r2 } = buildAiStreamEventBody();
    assert(!isAiStreamEventBody(r2));
});

Deno.test("isAiStreamEventBody rejects wrong eventName and malformed data", () => {
    assert(!isAiStreamEventBody(invalidateAiStreamEventBody({ eventName: "ai-stream" })));
    const { sig: _sig, ...malformedData } = buildAiStreamEventData();
    assert(!isAiStreamEventBody(invalidateAiStreamEventBody({ data: malformedData })));
});
