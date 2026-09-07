import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { Database } from "../../types_db.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import { mockNotificationService, resetMockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import type { EnqueueModelCallReturn } from "./enqueueModelCall.interface.ts";
import { enqueueModelCall } from "./enqueueModelCall.ts";
import {
    buildEnqueueModelCallDeps,
    buildEnqueueModelCallParams,
    buildEnqueueModelCallPayload,
} from "./enqueueModelCall.mock.ts";
import { invalidateDialecticExecuteJobPayload } from "../../_shared/dialectic.mock.ts";
import { mockComputeJobSigThrows } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";

Deno.test(
    "enqueueModelCall posts to netlify with chat_api_request and api_identifier from payload",
    async () => {
        /**
         * Contract: given a proven job payload, the posted event body carries the
         *   chat_api_request message and api_identifier from the payload.
         * Arrange: a mock DB whose update succeeds; a payload with a known
         *   chatApiRequest message and a providerRow with a known api_identifier.
         * Act:     enqueueModelCall.
         * Assert:  fetch is called once; the posted body's data.chat_api_request.message
         *   matches the payload marker; data.api_identifier matches the providerRow.
         */
        const payloadMarker: string = "unique-payload-marker-enqueue";
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = buildEnqueueModelCallDeps();
        const basePayload = buildEnqueueModelCallPayload();
        const payload = buildEnqueueModelCallPayload({
            providerRow: { ...basePayload.providerRow, api_identifier: "expected-api-id-enqueue" },
            chatApiRequest: {
                message: payloadMarker,
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(deps, buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }), payload);

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const callUrl: string = String(fetchStub.calls[0].args[0]);
            assertEquals(callUrl, deps.netlifyQueueUrl);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            const bodyRaw = initArg.body;
            assert(typeof bodyRaw === "string");
            const parsed = JSON.parse(bodyRaw);
            assert(isRecord(parsed));
            assertEquals(parsed.eventName, "ai-stream-background");
            assert(isRecord(parsed.data));
            const data = parsed.data;
            assert(isRecord(data.chat_api_request));
            assertEquals(data.chat_api_request.message, payloadMarker);
            assertEquals(data.api_identifier, "expected-api-id-enqueue");
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall updates dialectic_generation_jobs to queued for payload.job.id",
    async () => {
        /**
         * Contract: given a proven job payload, the queueing update sets status to
         *   'queued' and filters on payload.job.id.
         * Arrange: a mock DB whose update succeeds; a payload with a default job.
         * Act:     enqueueModelCall.
         * Assert:  the update argument's status equals 'queued'; the query filter
         *   on 'id' equals payload.job.id.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const params = buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> });
        const payload = buildEnqueueModelCallPayload();
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(buildEnqueueModelCallDeps(), params, payload);

            // Assert
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertExists(updateSpy);
            assert(updateSpy.callCount >= 1);
            const updatePayload = updateSpy.callsArgs[0][0];
            assert(isRecord(updatePayload));
            assertEquals(updatePayload.status, "queued");
            const builder = mockSetup.client.getLatestBuilder(
                "dialectic_generation_jobs",
            );
            assertExists(builder);
            const state = builder.getQueryBuilderState();
            const idFilter = state.filters.find((f) => f.column === "id");
            assertExists(idFilter);
            assertEquals(idFilter.value, payload.job.id);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when providerRow.config is invalid",
    async () => {
        /**
         * Contract: given a providerRow whose config fails isAiModelExtendedConfig,
         *   the function returns the preparation error arm with failure
         *   'provider_config_invalid', performs no DB update and calls no fetch.
         * Arrange: a mock DB whose update would succeed; a payload with a
         *   providerRow whose config is an empty object.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'provider_config_invalid'; retriable is false; no
         *   update was issued; no fetch was made.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const basePayload = buildEnqueueModelCallPayload();
        const payload = buildEnqueueModelCallPayload({
            providerRow: { ...basePayload.providerRow, config: {} },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                payload,
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "provider_config_invalid");
            assertEquals(result.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertEquals(updateSpy?.callCount ?? 0, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when api key is missing",
    async () => {
        /**
         * Contract: given a providerRow whose api_identifier has no API key,
         *   the function returns the preparation error arm with failure
         *   'api_key_missing', performs no DB update and calls no fetch.
         * Arrange: a mock DB whose update would succeed; deps whose
         *   apiKeyForProvider returns null.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'api_key_missing'; retriable is false; no update
         *   was issued; no fetch was made.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = buildEnqueueModelCallDeps({
            apiKeyForProvider: () => null,
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "api_key_missing");
            assertEquals(result.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertEquals(updateSpy?.callCount ?? 0, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall runs DB update before fetch when both succeed",
    async () => {
        /**
         * Contract: given a proven job payload, the DB update is committed before
         *   the fetch is issued.
         * Arrange: a mock DB whose update succeeds; a fetch stub that asserts the
         *   update spy has already recorded at least one call when fetch runs.
         * Act:     enqueueModelCall.
         * Assert:  fetch is called exactly once.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> => {
                const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                    "dialectic_generation_jobs",
                    "update",
                );
                assertExists(updateSpy);
                assert(updateSpy.callCount >= 1);
                return Promise.resolve(new Response("{}", { status: 200 }));
            },
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable true when DB update fails and does not call fetch",
    async () => {
        /**
         * Contract: given a proven job payload whose DB update returns a Postgrest
         *   error, the function returns the job-row error arm with failure
         *   'job_row_update_failed' and does not call fetch.
         * Arrange: a mock DB whose update returns an error; a fetch stub that
         *   records calls.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'job_row_update_failed'; retriable is true; no fetch
         *   was made.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: {
                        data: null,
                        error: new Error("db update failed"),
                    },
                },
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "job_row_update_failed");
            assertEquals(result.retriable, true);
            assertEquals(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall fetch sends Authorization, Content-Type, and AiStreamEvent fields",
    async () => {
        /**
         * Contract: given a proven job payload, the fetch call carries the
         *   Authorization and Content-Type headers and an AiStreamEvent body whose
         *   data fields match the payload.
         * Arrange: a mock DB whose update succeeds; deps with a known netlifyApiKey;
         *   a payload with a known job, providerRow and userConfig.
         * Act:     enqueueModelCall.
         * Assert:  the Authorization header is the bearer key; the Content-Type is
         *   application/json; the body's data.job_id, api_identifier, sig,
         *   user_config and model_config match the payload.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = buildEnqueueModelCallDeps({
            netlifyApiKey: "explicit-awl-key",
        });
        const payload = buildEnqueueModelCallPayload();
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(deps, buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }), payload);

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            const headerObj = initArg.headers;
            if (headerObj instanceof Headers) {
                assertEquals(headerObj.get("Authorization"), "Bearer explicit-awl-key");
                assertEquals(headerObj.get("Content-Type"), "application/json");
            } else {
                assert(isRecord(headerObj));
                assertEquals(headerObj["Authorization"], "Bearer explicit-awl-key");
                assertEquals(headerObj["Content-Type"], "application/json");
            }
            const bodyRaw = initArg.body;
            assert(typeof bodyRaw === "string");
            const parsed = JSON.parse(bodyRaw);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            const data = parsed.data;
            assertEquals(data.job_id, payload.job.id);
            assertEquals("user_jwt" in data, false);
            assertEquals(data.sig, "mock-sig");
            assertEquals("user_config" in data, true);
            assert(isRecord(data.user_config));
            assertEquals(data.user_config.tier_output_cap_tokens, null);
            assert(isRecord(data.model_config));
            assertEquals(data.model_config.api_identifier, payload.providerRow.api_identifier);
            assert(payload.providerRow.config !== null);
            assert(isAiModelExtendedConfig(payload.providerRow.config));
            const extendedConfig: AiModelExtendedConfig = payload.providerRow.config;
            assertEquals(data.model_config.context_window_tokens, extendedConfig.context_window_tokens);
            assertEquals(data.model_config.input_token_cost_rate, extendedConfig.input_token_cost_rate);
            assertEquals(data.model_config.output_token_cost_rate, extendedConfig.output_token_cost_rate);
            assertEquals(data.model_config.provider_max_input_tokens, extendedConfig.provider_max_input_tokens);
            assertEquals(data.model_config.provider_max_output_tokens, extendedConfig.provider_max_output_tokens);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns queued true when fetch returns 2xx",
    async () => {
        /**
         * Contract: given a proven job payload and a 2xx queue response, the
         *   function returns the success arm with every member populated from the
         *   values it produced.
         * Arrange: a mock DB whose update succeeds; a stubbed computeJobSig
         *   returning a known sig; a stubbed fetch returning 2xx with a known
         *   status; a payload with a known preflightInputTokens.
         * Act:     enqueueModelCall.
         * Assert:  queued is true; jobId matches payload.job.id; sig matches the
         *   stubbed computeJobSig output; preflightInputTokens matches the payload;
         *   eventBodyBytes matches the serialized body's length; queueStatus
         *   matches the stubbed response status.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const mockSig: string = "test-sig-from-stub";
        const stubStatus: number = 200;
        const preflightTokens: number = 999;
        const deps = buildEnqueueModelCallDeps({
            computeJobSig: async () => mockSig,
        });
        const params = buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> });
        const payload = buildEnqueueModelCallPayload({ preflightInputTokens: preflightTokens });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: stubStatus })),
        );
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(deps, params, payload);

            // Assert
            assert("queued" in result);
            assertEquals(result.queued, true);
            assertEquals(result.jobId, payload.job.id);
            assertEquals(result.sig, mockSig);
            assertEquals(result.preflightInputTokens, preflightTokens);
            assertEquals(result.queueStatus, stubStatus);
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            assert(typeof initArg.body === "string");
            assertEquals(result.eventBodyBytes, initArg.body.length);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable true when fetch returns non-2xx",
    async () => {
        /**
         * Contract: given a proven job payload and a non-2xx queue response, the
         *   function returns the queue-rejected error arm with failure
         *   'queue_rejected' and queueStatus set to the response status, read from
         *   the member rather than from the error's message.
         * Arrange: a mock DB whose update succeeds; a fetch stub returning 503.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'queue_rejected'; retriable is true; queueStatus is
         *   503, read from the member.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const stubStatus: number = 503;
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: stubStatus })),
        );
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "queue_rejected");
            assertEquals(result.retriable, true);
            if (result.failure === "queue_rejected") {
                assertEquals(result.queueStatus, stubStatus);
            }
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable true when fetch throws a network error",
    async () => {
        /**
         * Contract: given a proven job payload and a fetch that rejects, the
         *   function returns the queue-unreachable error arm with failure
         *   'queue_unreachable' and the thrown error carried on the error member.
         * Arrange: a mock DB whose update succeeds; a fetch stub that rejects with
         *   a known Error.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'queue_unreachable'; retriable is true; error is the
         *   thrown Error instance.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const networkError: Error = new Error("network failure");
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> => Promise.reject(networkError),
        );
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "queue_unreachable");
            assertEquals(result.retriable, true);
            assertEquals(result.error, networkError);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall deps surface does not include getAiProviderAdapter",
    () => {
        /**
         * Contract: the deps surface carries no getAiProviderAdapter key.
         * Arrange: a default deps builder.
         * Act:     build the deps.
         * Assert:  getAiProviderAdapter is absent.
         */
        const deps = buildEnqueueModelCallDeps();
        assertEquals("getAiProviderAdapter" in deps, false);
    },
);

Deno.test(
    "enqueueModelCall serializes AiStreamEvent under Netlify size limit for large-but-valid chatApiRequest",
    async () => {
        /**
         * Contract: given a proven job payload with a large-but-valid chatApiRequest,
         *   the serialized event body stays under the 500 KB limit and fetch is called.
         * Arrange: a mock DB whose update succeeds; a payload with a 400 KB message.
         * Act:     enqueueModelCall.
         * Assert:  fetch is called once; the posted body is under 500 KB.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const largePayload = buildEnqueueModelCallPayload({
            chatApiRequest: {
                message: "Z".repeat(400_000),
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                largePayload,
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            const bodyRaw = initArg.body;
            assert(typeof bodyRaw === "string");
            const limit = 500 * 1024;
            assert(bodyRaw.length <= limit);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when serialized event exceeds 500 KB and does not fetch",
    async () => {
        /**
         * Contract: given a proven job payload whose serialized event body exceeds
         *   500 KB, the function returns the event-size error arm with failure
         *   'event_body_too_large', eventBodyBytes set to the serialized length and
         *   limitBytes set to the 500 KB constant, and does not call fetch.
         * Arrange: a mock DB whose update succeeds; a payload with a 700 KB message.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'event_body_too_large'; retriable is false;
         *   eventBodyBytes exceeds the limit; limitBytes equals 500 * 1024;
         *   no fetch was made.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const hugePayload = buildEnqueueModelCallPayload({
            chatApiRequest: {
                message: "Z".repeat(700_000),
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                hugePayload,
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "event_body_too_large");
            assertEquals(result.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
            if (result.failure === "event_body_too_large") {
                assertEquals(result.limitBytes, 500 * 1024);
                assert(result.eventBodyBytes > 500 * 1024);
            }
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall calls computeJobSig with job.id job.user_id job.created_at and posts sig in event body",
    async () => {
        /**
         * Contract: given a proven job payload, computeJobSig is called with
         *   payload.job.id, payload.job.user_id and payload.job.created_at, and the
         *   returned sig is posted in the event body's data.sig.
         * Arrange: a mock DB whose update succeeds; a deps whose computeJobSig
         *   captures its arguments and returns a known sig.
         * Act:     enqueueModelCall.
         * Assert:  computeJobSig received job.id, job.user_id and job.created_at;
         *   the posted body's data.sig matches the stubbed sig.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const payload = buildEnqueueModelCallPayload();
        const capturedArgs: string[] = [];
        const mockSig: string = "test-hmac-sig-value";
        const deps = buildEnqueueModelCallDeps({
            computeJobSig: async (jobId: string, userId: string, createdAt: string): Promise<string> => {
                capturedArgs.push(jobId, userId, createdAt);
                return mockSig;
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(deps, buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }), payload);

            // Assert
            assertEquals(capturedArgs.length, 3);
            assertEquals(capturedArgs[0], payload.job.id);
            assertEquals(capturedArgs[1], payload.job.user_id);
            assertEquals(capturedArgs[2], payload.job.created_at);
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            assert(typeof initArg.body === "string");
            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            assertEquals(parsed.data.sig, mockSig);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when job.user_id is null and does not call computeJobSig or fetch",
    async () => {
        /**
         * Contract: given a job whose user_id is null, the function returns the
         *   preparation error arm with failure 'job_user_id_missing', and does not
         *   call computeJobSig or fetch.
         * Arrange: a mock DB whose update would succeed; a payload with a job whose
         *   user_id is null; a deps whose computeJobSig tracks whether it was called.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'job_user_id_missing'; retriable is false;
         *   computeJobSig was not called; fetch was not called.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const basePayload = buildEnqueueModelCallPayload();
        const nullUserIdJob: DialecticJobRow = { ...basePayload.job, user_id: null } as unknown as DialecticJobRow;
        let computeJobSigCalled: boolean = false;
        const deps = buildEnqueueModelCallDeps({
            computeJobSig: async (): Promise<string> => {
                computeJobSigCalled = true;
                return "mock-sig";
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload({ job: nullUserIdJob }),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "job_user_id_missing");
            assertEquals(result.retriable, false);
            assertEquals(computeJobSigCalled, false);
            assertEquals(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when computeJobSig throws and does not call fetch",
    async () => {
        /**
         * Contract: given a proven job payload whose computeJobSig throws an Error,
         *   the function returns the preparation error arm with failure
         *   'job_signature_failed' and does not call fetch.
         * Arrange: a mock DB whose update would succeed; deps whose computeJobSig
         *   throws an Error.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'job_signature_failed'; retriable is false; no fetch
         *   was made.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = buildEnqueueModelCallDeps({
            computeJobSig: mockComputeJobSigThrows,
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "job_signature_failed");
            assertEquals(result.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall wraps a non-Error computeJobSig rejection as job_signature_failed",
    async () => {
        /**
         * Contract: given a computeJobSig that rejects with a non-Error value, the
         *   function returns the preparation error arm with failure
         *   'job_signature_failed' and an Error on the error member, proving no
         *   value escapes the return union.
         * Arrange: a mock DB whose update would succeed; deps whose computeJobSig
         *   throws a string.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'job_signature_failed'; retriable is false; error is
         *   an instance of Error.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = buildEnqueueModelCallDeps({
            computeJobSig: async (): Promise<string> => {
                throw "non-error-string";
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "job_signature_failed");
            assertEquals(result.retriable, false);
            assert(result.error instanceof Error);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall regression - user_jwt does not appear in the posted event body",
    async () => {
        /**
         * Contract: given a proven job payload, the posted event body's data
         *   carries no user_jwt field.
         * Arrange: a mock DB whose update succeeds.
         * Act:     enqueueModelCall.
         * Assert:  the posted body's data has no user_jwt key.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            assert(typeof initArg.body === "string");
            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            assertEquals("user_jwt" in parsed.data, false);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall does not emit job notification events on success path",
    async () => {
        /**
         * Contract: given a proven job payload and a successful dispatch, no job
         *   notification event is sent.
         * Arrange: a reset notification service; a mock DB whose update succeeds.
         * Act:     enqueueModelCall.
         * Assert:  fetch is called once; sendJobNotificationEvent is called zero times.
         */
        resetMockNotificationService();
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            assertEquals(
                mockNotificationService.sendJobNotificationEvent.calls.length,
                0,
            );
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall posts user_config.tier_output_cap_tokens from payload onto enqueued event data",
    async () => {
        /**
         * Contract: given a payload whose userConfig carries a tier_output_cap_tokens
         *   number, the posted event body's data.user_config.tier_output_cap_tokens
         *   matches that number.
         * Arrange: a mock DB whose update succeeds; a payload with a known
         *   tier_output_cap_tokens.
         * Act:     enqueueModelCall.
         * Assert:  the posted body's data.user_config.tier_output_cap_tokens
         *   matches the payload value.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const tierCap: number = 32768;
        const payload = buildEnqueueModelCallPayload({
            userConfig: { tier_output_cap_tokens: tierCap },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                payload,
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            assert(typeof initArg.body === "string");
            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            assert(isRecord(parsed.data.user_config));
            assertEquals(parsed.data.user_config.tier_output_cap_tokens, tierCap);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall includes user_config.tier_output_cap_tokens null in JSON body when payload supplies null",
    async () => {
        /**
         * Contract: given a payload whose userConfig has tier_output_cap_tokens
         *   null, the posted JSON body includes user_config.tier_output_cap_tokens
         *   as null.
         * Arrange: a mock DB whose update succeeds; a payload with
         *   tier_output_cap_tokens null.
         * Act:     enqueueModelCall.
         * Assert:  the raw body contains the null literal; the parsed body's
         *   data.user_config.tier_output_cap_tokens is null.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const payload = buildEnqueueModelCallPayload({
            userConfig: { tier_output_cap_tokens: null },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                payload,
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            assert(typeof initArg.body === "string");
            const bodyRaw: string = initArg.body;
            assertEquals(bodyRaw.includes('"user_config":{"tier_output_cap_tokens":null}'), true);
            const parsed = JSON.parse(bodyRaw);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            assertEquals("user_config" in parsed.data, true);
            assert(isRecord(parsed.data.user_config));
            assertEquals(parsed.data.user_config.tier_output_cap_tokens, null);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall writes preflight_input_tokens from payload.preflightInputTokens onto the update argument",
    async () => {
        /**
         * Contract: given a proven job payload, the queueing update's argument
         *   carries preflight_input_tokens equal to the preflightInputTokens
         *   supplied on the function payload, asserted against an independent literal.
         * Arrange: a mock DB whose update succeeds; a function payload with
         *   preflightInputTokens set to an independent literal (999).
         * Act:     enqueueModelCall.
         * Assert:  the update argument's payload field carries preflight_input_tokens
         *   equal to 999.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const params = buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> });
        const payload = buildEnqueueModelCallPayload({
            preflightInputTokens: 999,
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(buildEnqueueModelCallDeps(), params, payload);

            // Assert
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertExists(updateSpy);
            assert(updateSpy.callCount >= 1);
            const updatePayload = updateSpy.callsArgs[0][0];
            assert(isRecord(updatePayload));
            assert(isRecord(updatePayload.payload));
            assertEquals(updatePayload.payload.preflight_input_tokens, 999);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall writes status queued alongside the composed payload in the update argument",
    async () => {
        /**
         * Contract: given a proven job payload, the queueing update's argument
         *   carries status: 'queued'.
         * Arrange: a mock DB whose update succeeds.
         * Act:     enqueueModelCall.
         * Assert:  the update argument's status field equals 'queued'.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload(),
            );

            // Assert
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertExists(updateSpy);
            assert(updateSpy.callCount >= 1);
            const updatePayload = updateSpy.callsArgs[0][0];
            assert(isRecord(updatePayload));
            assertEquals(updatePayload.status, "queued");
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall writes every member of the job row's payload back unchanged alongside preflight_input_tokens",
    async () => {
        /**
         * Contract: given a proven job payload, the queueing update's payload field
         *   carries every member of the job row's original payload with its original
         *   value, in addition to preflight_input_tokens.
         * Arrange: a mock DB whose update succeeds; a job row carrying a known
         *   execute payload.
         * Act:     enqueueModelCall.
         * Assert:  for every key in the original job payload, the update argument's
         *   payload field carries that key with the same value.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const payload = buildEnqueueModelCallPayload({ preflightInputTokens: 128 });
        const originalPayload = payload.job.payload;
        assert(isRecord(originalPayload));
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                payload,
            );

            // Assert
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertExists(updateSpy);
            assert(updateSpy.callCount >= 1);
            const updatePayload = updateSpy.callsArgs[0][0];
            assert(isRecord(updatePayload));
            assert(isRecord(updatePayload.payload));
            const writtenPayload = updatePayload.payload;
            for (const key of Object.keys(originalPayload)) {
                assert(key in writtenPayload, `expected key ${key} in written payload`);
                assertEquals(writtenPayload[key], (originalPayload as Record<string, unknown>)[key]);
            }
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when the job payload fails isDialecticBaseJobPayload and performs no update or fetch",
    async () => {
        /**
         * Contract: given a job row whose payload fails isDialecticBaseJobPayload,
         *   the function returns the preparation error arm with failure
         *   'job_payload_invalid', performs no DB update and calls no fetch.
         * Arrange: a mock DB whose update would succeed; a payload whose job
         *   carries an invalidated execute payload (sessionId corrupted to a number).
         * Act:     enqueueModelCall.
         * Assert:  failure is 'job_payload_invalid'; retriable is false; no update
         *   was issued; no fetch was made.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const basePayload = buildEnqueueModelCallPayload();
        const invalidJobPayload = invalidateDialecticExecuteJobPayload({ sessionId: 123 });
        const jobWithInvalidPayload = {
            ...basePayload.job,
            payload: invalidJobPayload,
        } as unknown as DialecticJobRow;
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload({ job: jobWithInvalidPayload }),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "job_payload_invalid");
            assertEquals(result.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertEquals(updateSpy?.callCount ?? 0, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when the composed payload fails isJson and performs no row update",
    async () => {
        /**
         * Contract: given a job payload that passes isDialecticBaseJobPayload but
         *   whose composed form fails isJson, the function returns the preparation
         *   error arm with failure 'composed_payload_not_json' and performs no row update.
         * Arrange: a mock DB whose update would succeed; a payload whose job
         *   carries a valid base payload with an extra non-JSON field (a function)
         *   that isDialecticBaseJobPayload does not check but isJson rejects.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'composed_payload_not_json'; retriable is false; no
         *   update was issued.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const basePayload = buildEnqueueModelCallPayload();
        assert(isRecord(basePayload.job.payload));
        const jobWithNonJsonExtra = {
            ...basePayload.job,
            payload: { ...basePayload.job.payload, nonJsonExtra: () => {} },
        } as unknown as DialecticJobRow;
        const fetchStub = stub(globalThis, "fetch");
        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                buildEnqueueModelCallPayload({ job: jobWithNonJsonExtra }),
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "composed_payload_not_json");
            assertEquals(result.retriable, false);
            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertEquals(updateSpy?.callCount ?? 0, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall posts an AiStreamEventData that carries no token count",
    async () => {
        /**
         * Contract: given a proven job payload, the posted AiStreamEventData carries
         *   no token count of any kind.
         * Arrange: a mock DB whose update succeeds; a function payload carrying a
         *   preflightInputTokens value (to confirm it is not leaked into the event).
         * Act:     enqueueModelCall.
         * Assert:  the posted event data has no preflight_input_tokens, token_usage,
         *   prompt_tokens, completion_tokens, or total_tokens field.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const payload = buildEnqueueModelCallPayload({
            preflightInputTokens: 999,
        });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            // Act
            await enqueueModelCall(
                buildEnqueueModelCallDeps(),
                buildEnqueueModelCallParams({ dbClient: mockSetup.client as unknown as SupabaseClient<Database> }),
                payload,
            );

            // Assert
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            assert(typeof initArg.body === "string");
            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            const data = parsed.data;
            assertEquals("preflight_input_tokens" in data, false);
            assertEquals("token_usage" in data, false);
            assertEquals("prompt_tokens" in data, false);
            assertEquals("completion_tokens" in data, false);
            assertEquals("total_tokens" in data, false);
        } finally {
            fetchStub.restore();
        }
    },
);
