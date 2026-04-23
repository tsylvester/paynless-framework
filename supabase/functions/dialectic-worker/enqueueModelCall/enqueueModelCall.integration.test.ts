import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AiModelExtendedConfig, ApiKeyForProviderFn } from "../../_shared/types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { Database, Tables } from "../../types_db.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
    createMockDialecticExecuteJobPayload,
    createMockJobRow,
} from "../saveResponse/saveResponse.mock.ts";
import type {
    EnqueueModelCallDeps,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallReturn,
} from "./enqueueModelCall.interface.ts";
import { enqueueModelCall } from "./enqueueModelCall.ts";
import { mockComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";
import type { ComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.interface.ts";
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
};

const integrationApiKeyForProvider: ApiKeyForProviderFn = (
    _apiIdentifier: string,
): string | null => "integration-provider-api-key";

Deno.test(
    "Integration: enqueueModelCall writes DB status then POSTs to Netlify and returns queued true",
    async () => {
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const dbClient: SupabaseClient<Database> =
            mockSetup.client as unknown as SupabaseClient<Database>;

        const deps: EnqueueModelCallDeps = {
            logger: new MockLogger(),
            computeJobSig: mockComputeJobSig,
            netlifyQueueUrl:
                "https://integration.netlify/.netlify/functions/async-workloads-router",
            netlifyApiKey: "integration-awl-api-key",
            apiKeyForProvider: integrationApiKeyForProvider,
        };

        const job = createMockJobRow(createMockDialecticExecuteJobPayload());

        const params: EnqueueModelCallParams = {
            dbClient,
            job,
            providerRow: integrationProviderRow,
            userAuthToken: "integration-user-jwt",
            output_type: FileType.HeaderContext,
        };

        const payload: EnqueueModelCallPayload = {
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
            (): Promise<Response> => {
                const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
                    "dialectic_generation_jobs",
                    "update",
                );
                assertExists(updateSpy);
                assert(updateSpy.callCount >= 1, "DB update must precede fetch POST");
                return Promise.resolve(new Response("{}", { status: 200 }));
            },
        );

        try {
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                params,
                payload,
            );

            assert("queued" in result);
            assertEquals(result.queued, true);
            assertEquals(fetchStub.calls.length, 1);

            const callUrl: string = String(fetchStub.calls[0].args[0]);
            assertEquals(callUrl, deps.netlifyQueueUrl);

            const initArg = fetchStub.calls[0].args[1];
            assertExists(initArg);
            assert(typeof initArg.body === "string");
            const parsed = JSON.parse(initArg.body);
            assert(isRecord(parsed));
            assertEquals(parsed.eventName, "ai-stream-background");
            assert(isRecord(parsed.data));
            assertEquals(parsed.data.job_id, job.id);
            assertEquals(parsed.data.api_identifier, integrationProviderRow.api_identifier);
            assertEquals(parsed.data.sig, "mock-sig");
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
        const mockSetup = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    update: { data: [{}], error: null },
                },
            },
        });
        const dbClient: SupabaseClient<Database> =
            mockSetup.client as unknown as SupabaseClient<Database>;

        const deps: EnqueueModelCallDeps = {
            logger: new MockLogger(),
            computeJobSig: mockComputeJobSig,
            netlifyQueueUrl:
                "https://integration.netlify/.netlify/functions/async-workloads-router",
            netlifyApiKey: "integration-awl-api-key",
            apiKeyForProvider: integrationApiKeyForProvider,
        };

        const job = createMockJobRow(createMockDialecticExecuteJobPayload());

        const params: EnqueueModelCallParams = {
            dbClient,
            job,
            providerRow: integrationProviderRow,
            userAuthToken: "integration-user-jwt",
            output_type: FileType.HeaderContext,
        };

        const payload: EnqueueModelCallPayload = {
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
            const result: EnqueueModelCallReturn = await enqueueModelCall(
                deps,
                params,
                payload,
            );

            assert("error" in result);
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
