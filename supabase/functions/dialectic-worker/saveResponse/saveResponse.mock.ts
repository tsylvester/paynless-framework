import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { mockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { sanitizeJsonContent } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.ts";
import { resolveFinishReason } from "../../_shared/utils/resolveFinishReason.ts";
import { isIntermediateChunk } from "../../_shared/utils/isIntermediateChunk.ts";
import { determineContinuation } from "../../_shared/utils/determineContinuation/determineContinuation.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import type { Database, Tables } from "../../types_db.ts";
import type {
    ContentToInclude,
    ContextForDocument,
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    DialecticJobPayload,
    DialecticJobRow,
    HeaderContext,
    HeaderContextArtifact,
    SystemMaterials,
} from "../../dialectic-service/dialectic.interface.ts";
import type { ServiceError } from "../../_shared/types.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import type {
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseErrorReturn,
    SaveResponseParams,
    SaveResponsePayload,
    SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";

export type SaveResponseDepsOverrides = {
    [K in keyof SaveResponseDeps]?: SaveResponseDeps[K];
};

export type SaveResponseParamsOverrides = Partial<SaveResponseParams>;

export type CreateMockSaveResponseParamsOptions = {
    dbClient?: SupabaseClient<Database>;
    supabaseUserId?: string;
    supabaseConfig?: Parameters<typeof createMockSupabaseClient>[1];
};

export type SaveResponsePayloadOverrides = Partial<SaveResponsePayload>;

export type SaveResponseSuccessReturnOverrides = Partial<SaveResponseSuccessReturn>;

export type SaveResponseErrorReturnOverrides = Partial<SaveResponseErrorReturn>;

export function createMockSaveResponseDeps(
    overrides?: SaveResponseDepsOverrides,
): SaveResponseDeps {
    const logger: MockLogger = new MockLogger();
    const base: SaveResponseDeps = {
        logger,
        fileManager: new MockFileManagerService(),
        notificationService: mockNotificationService,
        continueJob: async () => ({ enqueued: false }),
        retryJob: async () => ({}),
        resolveFinishReason,
        isIntermediateChunk,
        determineContinuation,
        buildUploadContext,
        debitTokens: async () => ({
            result: {
                userMessage: {
                    id: crypto.randomUUID(),
                    chat_id: null,
                    user_id: null,
                    role: "user",
                    content: "mock-user-message",
                    ai_provider_id: null,
                    system_prompt_id: null,
                    token_usage: null,
                    is_active_in_thread: true,
                    error_type: null,
                    response_to_message_id: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                assistantMessage: {
                    id: crypto.randomUUID(),
                    chat_id: null,
                    user_id: null,
                    role: "assistant",
                    content: "mock-assistant-message",
                    ai_provider_id: null,
                    system_prompt_id: null,
                    token_usage: null,
                    is_active_in_thread: true,
                    error_type: null,
                    response_to_message_id: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            },
            transactionRecordedSuccessfully: true,
        }),
        userTokenWalletService: createMockUserTokenWalletService().instance,
        sanitizeJsonContent: sanitizeJsonContent,
    };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export function createMockSaveResponseParams(
    overrides?: SaveResponseParamsOverrides,
    options?: CreateMockSaveResponseParamsOptions,
): SaveResponseParams {
    let base: SaveResponseParams;
    if (options?.dbClient !== undefined) {
        base = {
            job_id: "mock-job-id",
            dbClient: options.dbClient,
        };
    } else if (options?.supabaseConfig !== undefined) {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient(
                options.supabaseUserId,
                options.supabaseConfig,
            );
        const dbClient: SupabaseClient<Database> =
            mockSetup.client as unknown as SupabaseClient<Database>;
        base = {
            job_id: "mock-job-id",
            dbClient,
        };
    } else {
        const { params: queuedParams } = createMockSaveResponseParamsWithQueuedJob(
            saveResponseTestPayload,
        );
        base = queuedParams;
    }
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export function createMockSaveResponsePayload(
    overrides?: SaveResponsePayloadOverrides,
): SaveResponsePayload {
    const defaultUsage: NodeTokenUsage = {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
    };
    const base: SaveResponsePayload = {
        assembled_content: "{}",
        token_usage: defaultUsage,
    };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export function createMockSaveResponseSuccessReturn(
    overrides?: SaveResponseSuccessReturnOverrides,
): SaveResponseSuccessReturn {
    const base: SaveResponseSuccessReturn = { status: "completed" };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export function createMockSaveResponseErrorReturn(
    overrides?: SaveResponseErrorReturnOverrides,
): SaveResponseErrorReturn {
    const base: SaveResponseErrorReturn = {
        error: new Error("mock-save-response-error"),
        retriable: false,
    };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

/* ------------------------------------------------------------------ */
/*  Continuation-test factories (saveResponse's own, not EMCAS)       */
/* ------------------------------------------------------------------ */

export type ContributionRowOverrides = Partial<DialecticContributionRow>;

export function createMockContributionRow(
    overrides?: ContributionRowOverrides,
): DialecticContributionRow {
    const base: Tables<"dialectic_contributions"> = {
        id: "contrib-test-1",
        citations: null,
        contribution_type: "thesis",
        created_at: new Date().toISOString(),
        document_relationships: { thesis: "contrib-test-1" },
        edit_version: 1,
        error: null,
        file_name: null,
        is_header: false,
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: "application/json",
        model_id: "model-def",
        model_name: null,
        original_model_contribution_id: null,
        processing_time_ms: 1,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        session_id: "session-456",
        size_bytes: 10,
        source_prompt_resource_id: null,
        stage: "thesis",
        storage_bucket: "test-bucket",
        storage_path: "test/path.json",
        target_contribution_id: null,
        tokens_used_input: 1,
        tokens_used_output: 1,
        updated_at: new Date().toISOString(),
        user_id: "user-789",
    };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export type CreateMockFileManagerOptions =
    | { outcome: "success"; contribution: DialecticContributionRow }
    | { outcome: "error"; message: string };

export function createMockFileManager(
    options: CreateMockFileManagerOptions,
): MockFileManagerService {
    const fm: MockFileManagerService = new MockFileManagerService();
    if (options.outcome === "success") {
        fm.setUploadAndRegisterFileResponse(options.contribution, null);
        return fm;
    }
    const err: ServiceError = { message: options.message };
    fm.setUploadAndRegisterFileResponse(null, err);
    return fm;
}

export function createValidHeaderContext(): HeaderContext {
    const systemMaterials: SystemMaterials = {
        agent_notes_to_self: "Test executive summary",
        input_artifacts_summary: "Test input artifacts summary",
        stage_rationale: "Test stage rationale",
    };

    const headerContextArtifact: HeaderContextArtifact = {
        type: "header_context",
        document_key: FileType.HeaderContext,
        artifact_class: "header_context",
        file_type: "json",
    };

    const contentToInclude: ContentToInclude = {
        field1: "filled value 1",
        field2: ["item1", "item2"],
    };

    const contextForDocuments: ContextForDocument[] = [
        {
            document_key: FileType.business_case,
            content_to_include: contentToInclude,
        },
    ];

    return {
        system_materials: systemMaterials,
        header_context_artifact: headerContextArtifact,
        context_for_documents: contextForDocuments,
    };
}

export const saveResponseTestPayload: DialecticExecuteJobPayload = {
    prompt_template_id: "test-prompt",
    inputs: {},
    output_type: FileType.HeaderContext,
    document_key: "header_context",
    projectId: "project-abc",
    sessionId: "session-456",
    stageSlug: "thesis",
    model_id: "model-def",
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: "wallet-ghi",
    user_jwt: "jwt.token.here",
    canonicalPathParams: {
        contributionType: "thesis",
        stageSlug: "thesis",
    },
    idempotencyKey: "job-id-123_execute",
};

export const saveResponseTestPayloadDocumentArtifact: DialecticExecuteJobPayload = {
    ...saveResponseTestPayload,
    output_type: FileType.business_case,
    document_key: "business_case",
    document_relationships: {
        thesis: "contrib-test-1",
        source_group: "00000000-0000-4000-8000-000000000002",
    },
    canonicalPathParams: {
        ...saveResponseTestPayload.canonicalPathParams,
    },
};

export type DialecticExecuteJobPayloadOverrides = Partial<DialecticExecuteJobPayload>;

export function createMockDialecticExecuteJobPayload(
    overrides?: DialecticExecuteJobPayloadOverrides,
): DialecticExecuteJobPayload {
    const base: DialecticExecuteJobPayload = { ...saveResponseTestPayload };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export type JobRowOverrides = Partial<DialecticJobRow>;

export function createMockJobRow(
    payload: DialecticJobPayload,
    overrides?: JobRowOverrides,
): DialecticJobRow {
    if (!isJson(payload)) {
        throw new Error(
            "Test payload is not valid JSON. Check the mock payload object.",
        );
    }
    const base: Tables<"dialectic_generation_jobs"> = {
        id: "job-id-123",
        session_id: "session-456",
        stage_slug: "thesis",
        iteration_number: 1,
        status: "queued",
        user_id: "user-789",
        attempt_count: 0,
        completed_at: null,
        created_at: new Date().toISOString(),
        error_details: null,
        max_retries: 3,
        parent_job_id: null,
        prerequisite_job_id: null,
        results: null,
        started_at: null,
        target_contribution_id: null,
        payload: payload,
        is_test_job: false,
        job_type: "EXECUTE",
        idempotency_key: null,
    };
    if (!overrides) {
        return base;
    }
    return { ...base, ...overrides };
}

export type AiProviderRowOverrides = Partial<Tables<"ai_providers">>;

export function createMockSaveResponseParamsWithQueuedJob(
    jobPayload: DialecticExecuteJobPayload,
    jobRowOverrides?: JobRowOverrides,
    providerRowOverrides?: AiProviderRowOverrides,
): {
    params: SaveResponseParams;
    mockSetup: ReturnType<typeof createMockSupabaseClient>;
} {
    const jobRow: DialecticJobRow = createMockJobRow(
        jobPayload,
        jobRowOverrides,
    );
    const baseProviderRow: Tables<"ai_providers"> = {
        id: "model-def",
        provider: "mock-provider",
        name: "Mock AI",
        api_identifier: "mock-ai-v1",
        config: {
            tokenization_strategy: {
                type: "rough_char_count",
            },
            context_window_tokens: 10000,
            input_token_cost_rate: 0.001,
            output_token_cost_rate: 0.002,
            provider_max_input_tokens: 100,
            provider_max_output_tokens: 50,
            api_identifier: "mock-ai-v1",
        },
        created_at: new Date().toISOString(),
        description: null,
        is_active: true,
        is_enabled: true,
        is_default_embedding: false,
        is_default_generation: false,
        updated_at: new Date().toISOString(),
    };
    const providerRow: Tables<"ai_providers"> = providerRowOverrides
        ? { ...baseProviderRow, ...providerRowOverrides }
        : baseProviderRow;
    const mockSetup: ReturnType<typeof createMockSupabaseClient> =
        createMockSupabaseClient("save-response-continue-test", {
            genericMockResults: {
                dialectic_generation_jobs: {
                    select: { data: [jobRow], error: null },
                },
                ai_providers: {
                    select: {
                        data: [providerRow],
                        error: null,
                    },
                },
                dialectic_sessions: {
                    select: {
                        data: [
                            {
                                id: "session-456",
                                project_id: "project-abc",
                                session_description: "A mock session",
                                user_input_reference_url: null,
                                iteration_count: 1,
                                selected_model_ids: ["model-def"],
                                status: "in-progress",
                                associated_chat_id: "chat-789",
                                current_stage_id: "stage-1",
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                                idempotency_key: "session-456_render",
                                viewing_stage_id: null,
                            },
                        ],
                        error: null,
                    },
                },
            },
        });
    const dbClient: SupabaseClient<Database> =
        mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = {
        job_id: jobRow.id,
        dbClient,
    };
    return { params, mockSetup };
}
