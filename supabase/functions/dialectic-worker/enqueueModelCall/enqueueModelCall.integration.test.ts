import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ApiKeyForProviderFn } from "../../_shared/types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { Database, Tables } from "../../types_db.ts";
import { isJson, isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { buildDialecticJobRow, buildDialecticExecuteJobPayload } from "../../_shared/dialectic.mock.ts";
import type {
    EnqueueModelCallDeps,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallReturn,
} from "./enqueueModelCall.interface.ts";
import { enqueueModelCall } from "./enqueueModelCall.ts";
import { createComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.ts";
import { mockComputeJobSigSecret } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";

const integrationProviderRow: Tables<"ai_providers"> = {
    id: "integration-provider-id",
    provider: "integration-provider",
    name: "Integration AI",
    api_identifier: "integration-ai-v1",
    config: {
        api_identifier: "integration-ai-v1",
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        tokenization_strategy: { type: "rough_char_count" },
        context_window_tokens: 8000,
        provider_max_input_tokens: 200,
        provider_max_output_tokens: 100,
    },
    created_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    is_default_generation: false,
    updated_at: new Date().toISOString(),
    min_plan_tier_level: 0,
};

const integrationApiKeyForProvider: ApiKeyForProviderFn = (
    _apiIdentifier: string,
): string | null => "integration-provider-api-key";

Deno.test(
    "Integration: enqueueModelCall writes DB status then POSTs to Netlify and returns queued true",
    async () => {
        /**
         * Contract: given a proven job payload, the real enqueueModelCall writes the
         *   job row's status to 'queued', POSTs the serialized event to the Netlify
         *   queue, and returns the success arm with every member populated from the
         *   values the real serialization and the stubbed queue produced.
         * Arrange: a mock Supabase client whose update succeeds; a real computeJobSig
         *   built from the mock secret; a fetch stub returning 2xx with a known
         *   status; a payload carrying a known job, providerRow, userConfig and
         *   preflightInputTokens.
         * Act:     enqueueModelCall.
         * Assert:  queued is true; jobId matches payload.job.id; sig matches the real
         *   computeJobSig output for the same inputs; preflightInputTokens matches
         *   the payload; eventBodyBytes matches the serialized body's length;
         *   queueStatus matches the stubbed response status; the update argument's
         *   status is 'queued'; the fetch body's data.job_id and data.sig match.
         * Boundary: Supabase client (mocked) → real enqueueModelCall → real
         *   computeJobSig → Netlify queue POST (mocked).
         * Mocked: the Supabase client and the fetch to the Netlify queue; therefore
         *   this test does not prove the Supabase round-trip or the Netlify queue's
         *   own processing.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const dbClient: SupabaseClient<Database> =
            mockSetup.client as unknown as SupabaseClient<Database>;
        const computeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
        const deps: EnqueueModelCallDeps = {
            logger: new MockLogger(),
            computeJobSig,
            netlifyQueueUrl:
                "https://integration.netlify/.netlify/functions/async-workloads-router",
            netlifyApiKey: "integration-awl-api-key",
            apiKeyForProvider: integrationApiKeyForProvider,
        };

        const executePayload = buildDialecticExecuteJobPayload();
        if (!isJson(executePayload)) throw new Error("Payload must be JSON-compatible");
        const job = buildDialecticJobRow({ payload: executePayload });
        const stubStatus: number = 200;
        const preflightTokens: number = 10;

        const params: EnqueueModelCallParams = {
            dbClient,
        };

        const payload: EnqueueModelCallPayload = {
            job,
            providerRow: integrationProviderRow,
            userConfig: { tier_output_cap_tokens: null },
            chatApiRequest: {
                message: "integration test message",
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
            preflightInputTokens: preflightTokens,
        };

        const expectedSig: string = await computeJobSig(job.id, job.user_id, job.created_at);

        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> => {
                const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                    "dialectic_generation_jobs",
                    "update",
                );
                assertExists(updateSpy);
                assert(updateSpy.callCount >= 1, "DB update must precede fetch POST");
                return Promise.resolve(new Response("{}", { status: stubStatus }));
            },
        );

        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                params,
                payload,
            );

            // Assert
            assert("queued" in result);
            assertEquals(result.queued, true);
            assertEquals(result.jobId, job.id);
            assertEquals(result.sig, expectedSig);
            assertEquals(result.preflightInputTokens, preflightTokens);
            assertEquals(result.queueStatus, stubStatus);
            assertEquals(fetchStub.calls.length, 1);

            const callUrl: string = String(fetchStub.calls[0].args[0]);
            assertEquals(callUrl, deps.netlifyQueueUrl);

            const initArg = fetchStub.calls[0].args[1];
            assertExists(initArg);
            assert(typeof initArg.body === "string");
            assertEquals(result.eventBodyBytes, initArg.body.length);

            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assertEquals(parsed.eventName, "ai-stream-background");
            assert(isRecord(parsed.data));
            assertEquals(parsed.data.job_id, job.id);
            assertEquals(parsed.data.api_identifier, integrationProviderRow.api_identifier);
            assertEquals(parsed.data.sig, expectedSig);
            assert(isRecord(parsed.data.chat_api_request));
            assertEquals(parsed.data.chat_api_request.message, payload.chatApiRequest.message);

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
    "Integration: enqueueModelCall returns retriable true when fetch fails and DB update was already committed",
    async () => {
        /**
         * Contract: given a proven job payload and a non-2xx queue response, the real
         *   enqueueModelCall returns the queue-rejected error arm with failure
         *   'queue_rejected' and retriable true, and the DB update was already
         *   committed before the fetch was issued.
         * Arrange: a mock Supabase client whose update succeeds; a real computeJobSig;
         *   a fetch stub returning 503.
         * Act:     enqueueModelCall.
         * Assert:  failure is 'queue_rejected'; retriable is true; the update spy
         *   recorded at least one call.
         * Boundary: Supabase client (mocked) → real enqueueModelCall → real
         *   computeJobSig → Netlify queue POST (mocked).
         * Mocked: the Supabase client and the fetch to the Netlify queue; therefore
         *   this test does not prove the Supabase round-trip or the Netlify queue's
         *   own processing.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const dbClient: SupabaseClient<Database> =
            mockSetup.client as unknown as SupabaseClient<Database>;
        const computeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
        const deps: EnqueueModelCallDeps = {
            logger: new MockLogger(),
            computeJobSig,
            netlifyQueueUrl:
                "https://integration.netlify/.netlify/functions/async-workloads-router",
            netlifyApiKey: "integration-awl-api-key",
            apiKeyForProvider: integrationApiKeyForProvider,
        };

        const executePayload = buildDialecticExecuteJobPayload();
        if (!isJson(executePayload)) throw new Error("Payload must be JSON-compatible");
        const job = buildDialecticJobRow({ payload: executePayload });

        const params: EnqueueModelCallParams = {
            dbClient,
        };

        const payload: EnqueueModelCallPayload = {
            job,
            providerRow: integrationProviderRow,
            userConfig: { tier_output_cap_tokens: null },
            chatApiRequest: {
                message: "integration test message",
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
            preflightInputTokens: 10,
        };

        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 503 })),
        );

        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                params,
                payload,
            );

            // Assert
            assert("error" in result);
            assertEquals(result.failure, "queue_rejected");
            assertEquals(result.retriable, true);

            const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                "dialectic_generation_jobs",
                "update",
            );
            assertExists(updateSpy);
            assert(updateSpy.callCount >= 1);
        } finally {
            fetchStub.restore();
        }
    },
);

Deno.test(
    "Integration: enqueueModelCall forwards tier_output_cap_tokens onto enqueued AiStreamEventData",
    async () => {
        /**
         * Contract: given a payload whose userConfig carries a tier_output_cap_tokens
         *   number, the real enqueueModelCall posts an event body whose
         *   data.user_config.tier_output_cap_tokens matches that number.
         * Arrange: a mock Supabase client whose update succeeds; a real computeJobSig;
         *   a fetch stub returning 2xx; a payload with a known tier_output_cap_tokens.
         * Act:     enqueueModelCall.
         * Assert:  queued is true; the posted body's data.user_config.tier_output_cap_tokens
         *   matches the payload value.
         * Boundary: Supabase client (mocked) → real enqueueModelCall → real
         *   computeJobSig → Netlify queue POST (mocked).
         * Mocked: the Supabase client and the fetch to the Netlify queue; therefore
         *   this test does not prove the Supabase round-trip or the Netlify queue's
         *   own processing.
         */
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const dbClient: SupabaseClient<Database> =
            mockSetup.client as unknown as SupabaseClient<Database>;
        const computeJobSig = await createComputeJobSig(mockComputeJobSigSecret);
        const deps: EnqueueModelCallDeps = {
            logger: new MockLogger(),
            computeJobSig,
            netlifyQueueUrl:
                "https://integration.netlify/.netlify/functions/async-workloads-router",
            netlifyApiKey: "integration-awl-api-key",
            apiKeyForProvider: integrationApiKeyForProvider,
        };

        const executePayload = buildDialecticExecuteJobPayload();
        if (!isJson(executePayload)) throw new Error("Payload must be JSON-compatible");
        const job = buildDialecticJobRow({ payload: executePayload });
        const tierCap: number = 32768;

        const params: EnqueueModelCallParams = {
            dbClient,
        };

        const payload: EnqueueModelCallPayload = {
            job,
            providerRow: integrationProviderRow,
            userConfig: { tier_output_cap_tokens: tierCap },
            chatApiRequest: {
                message: "integration tier cap message",
                providerId: "00000000-0000-4000-8000-000000000001",
                promptId: "__none__",
            },
            preflightInputTokens: 10,
        };

        const fetchStub = stub(
            globalThis,
            "fetch",
            (): Promise<Response> =>
                Promise.resolve(new Response("{}", { status: 200 })),
        );

        try {
            // Act
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                params,
                payload,
            );

            // Assert
            assert("queued" in result);
            assertEquals(result.queued, true);
            assertEquals(fetchStub.calls.length, 1);

            const initArg = fetchStub.calls[0].args[1];
            assertExists(initArg);
            assert(typeof initArg.body === "string");
            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assert(isRecord(parsed.data));
            assertEquals("user_config" in parsed.data, true);
            assert(isRecord(parsed.data.user_config));
            assertEquals("tier_output_cap_tokens" in parsed.data.user_config, true);
            assertEquals(parsed.data.user_config.tier_output_cap_tokens, tierCap);
        } finally {
            fetchStub.restore();
        }
    },
);
