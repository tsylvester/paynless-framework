import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import { mockNotificationService, resetMockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import type {
    EnqueueModelCallErrorReturn,
    EnqueueModelCallReturn,
} from "./enqueueModelCall.interface.ts";
import { enqueueModelCall } from "./enqueueModelCall.ts";
import {
    createMockEnqueueModelCallDeps,
    createMockEnqueueModelCallParams,
    createMockEnqueueModelCallPayload,
} from "./enqueueModelCall.mock.ts";
import { mockComputeJobSig, mockComputeJobSigThrows } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";
Deno.test(
    "enqueueModelCall posts to netlify with chat_api_request and api_identifier from params and payload",
    async () => {
        const payloadMarker: string = "unique-payload-marker-enqueue";
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const baseParams = createMockEnqueueModelCallParams({}, {
            mockSetup,
        });
        const params = createMockEnqueueModelCallParams({
            providerRow: {
                ...baseParams.providerRow,
                api_identifier: "expected-api-id-enqueue",
            },
        }, { mockSetup });
        const payload = createMockEnqueueModelCallPayload({
            chatApiRequest: {
                message: payloadMarker,
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
        });
        const deps = createMockEnqueueModelCallDeps();
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            await enqueueModelCall(deps, params, payload);
            assertEquals(fetchStub.calls.length, 1);
            const callUrl: string = String(fetchStub.calls[0].args[0]);
            assertEquals(callUrl, deps.netlifyQueueUrl);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            const bodyRaw = initArg.body;
            assert(typeof bodyRaw === "string");
            const parsed = JSON.parse(bodyRaw);
            assert(isRecord(parsed));
            assertEquals(parsed.eventName, "ai-stream");
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
    "enqueueModelCall updates dialectic_generation_jobs to queued for params.job.id",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const params = createMockEnqueueModelCallParams({}, { mockSetup });
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                params,
                createMockEnqueueModelCallPayload(),
            );
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
            assertEquals(idFilter.value, params.job.id);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when output_type is invalid",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({
                    output_type: "___invalid_model_contribution_output___",
                }, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, false);
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
    "enqueueModelCall returns retriable false when providerRow.config is invalid",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const baseParams = createMockEnqueueModelCallParams({}, { mockSetup });
        const badProvider = {
            ...baseParams.providerRow,
            config: {},
        };
        const fetchStub = stub(globalThis, "fetch");
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({
                    providerRow: badProvider,
                }, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, false);
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
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps({
                    apiKeyForProvider: () => null,
                }),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, false);
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
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const params = createMockEnqueueModelCallParams({}, { mockSetup });
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
            await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                params,
                createMockEnqueueModelCallPayload(),
            );
            assertEquals(fetchStub.calls.length, 1);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable true when DB update fails and does not call fetch",
    async () => {
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
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, true);
            assertEquals(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall fetch sends Authorization, Content-Type, and AiStreamEvent fields",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = createMockEnqueueModelCallDeps({
            netlifyApiKey: "explicit-awl-key",
        });
        const params = createMockEnqueueModelCallParams({
            userAuthToken: "jwt-from-params",
        }, { mockSetup });
        const payload = createMockEnqueueModelCallPayload();
        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );
        try {
            await enqueueModelCall(deps, params, payload);
            assertEquals(fetchStub.calls.length, 1);
            const initArg = fetchStub.calls[0].args[1];
            assert(initArg !== undefined);
            const headerObj = initArg.headers;
            if (headerObj instanceof Headers) {
                assertEquals(
                    headerObj.get("Authorization"),
                    "Bearer explicit-awl-key",
                );
                assertEquals(
                    headerObj.get("Content-Type"),
                    "application/json",
                );
            } else {
                assert(isRecord(headerObj));
                assertEquals(
                    headerObj["Authorization"],
                    "Bearer explicit-awl-key",
                );
                assertEquals(
                    headerObj["Content-Type"],
                    "application/json",
                );
            }
            const bodyRaw = initArg.body;
            assert(typeof bodyRaw === "string");
            const parsed = JSON.parse(bodyRaw);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            const data = parsed.data;
            assertEquals(data.job_id, params.job.id);
            assertEquals("user_jwt" in data, false);
            assertEquals(data.sig, "mock-sig");
            assert(isRecord(data.model_config));
            assertEquals(
                data.model_config.api_identifier,
                params.providerRow.api_identifier,
            );
            assert(params.providerRow.config !== null);
            assert(isAiModelExtendedConfig(params.providerRow.config));
            const extendedConfig: AiModelExtendedConfig =
                params.providerRow.config;
            assertEquals(
                data.model_config.context_window_tokens,
                extendedConfig.context_window_tokens,
            );
            assertEquals(
                data.model_config.input_token_cost_rate,
                extendedConfig.input_token_cost_rate,
            );
            assertEquals(
                data.model_config.output_token_cost_rate,
                extendedConfig.output_token_cost_rate,
            );
            assertEquals(
                data.model_config.provider_max_input_tokens,
                extendedConfig.provider_max_input_tokens,
            );
            assertEquals(
                data.model_config.provider_max_output_tokens,
                extendedConfig.provider_max_output_tokens,
            );
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns queued true when fetch returns 2xx",
    async () => {
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
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("queued" in result);
            assertEquals(result.queued, true);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable true when fetch returns non-2xx",
    async () => {
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
                Promise.resolve(new Response("{}", { status: 503 })),
        );
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, true);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall deps surface does not include getAiProviderAdapter",
    () => {
        const deps = createMockEnqueueModelCallDeps();
        assertEquals("getAiProviderAdapter" in deps, false);
    },
);

Deno.test(
    "enqueueModelCall serializes AiStreamEvent under Netlify size limit for large-but-valid chatApiRequest",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const largePayload = createMockEnqueueModelCallPayload({
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
            await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                largePayload,
            );
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
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const hugePayload = createMockEnqueueModelCallPayload({
            chatApiRequest: {
                message: "Z".repeat(700_000),
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                hugePayload,
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
            assert(
                err.error.message.includes("500") ||
                    err.error.message.toLowerCase().includes("limit") ||
                    err.error.message.toLowerCase().includes("size"),
            );
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall calls computeJobSig with job.id job.user_id job.created_at and posts sig in event body",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const params = createMockEnqueueModelCallParams({}, { mockSetup });
        const capturedArgs: string[] = [];
        const mockSig: string = "test-hmac-sig-value";
        const deps = createMockEnqueueModelCallDeps({
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
            await enqueueModelCall(deps, params, createMockEnqueueModelCallPayload());
            assertEquals(capturedArgs.length, 3);
            assertEquals(capturedArgs[0], params.job.id);
            assertEquals(capturedArgs[1], params.job.user_id);
            assertEquals(capturedArgs[2], params.job.created_at);
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
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const baseParams = createMockEnqueueModelCallParams({}, { mockSetup });
        const nullUserIdJob: DialecticJobRow = { ...baseParams.job, user_id: null } as unknown as DialecticJobRow;
        const deps = createMockEnqueueModelCallDeps({
            computeJobSig: mockComputeJobSig,
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                createMockEnqueueModelCallParams({ job: nullUserIdJob }, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall returns retriable false when computeJobSig throws and does not call fetch",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const deps = createMockEnqueueModelCallDeps({
            computeJobSig: mockComputeJobSigThrows,
        });
        const fetchStub = stub(globalThis, "fetch");
        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
            assert("error" in result);
            const err: EnqueueModelCallErrorReturn = result;
            assertEquals(err.retriable, false);
            assertEquals(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "enqueueModelCall regression - user_jwt does not appear in the posted event body",
    async () => {
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
            await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
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
            await enqueueModelCall(
                createMockEnqueueModelCallDeps(),
                createMockEnqueueModelCallParams({}, { mockSetup }),
                createMockEnqueueModelCallPayload(),
            );
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
