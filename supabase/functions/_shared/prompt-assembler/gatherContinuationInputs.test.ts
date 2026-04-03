import { assertEquals, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { gatherContinuationInputs } from "./gatherContinuationInputs.ts";
import {
    GatherContinuationInputsDeps,
    GatherContinuationInputsPayload,
} from "./gatherContinuationInputs.interface.ts";
import {
    isGatherContinuationInputsError,
    isGatherContinuationInputsSuccess,
} from "./gatherContinuationInputs.interface.guards.ts";
import {
    createMockSupabaseClient,
    type MockSupabaseDataConfig,
    type MockSupabaseClientSetup,
    type MockQueryBuilderState,
} from "../supabase.mock.ts";
import { isRecord } from "../utils/type_guards.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import { DownloadStorageResult, downloadFromStorage } from "../supabase_storage_utils.ts";
import { createAssembleChunksMock } from "../utils/assembleChunks/assembleChunks.mock.ts";
import { AssembleChunksSignature } from "../utils/assembleChunks/assembleChunks.interface.ts";
import { ContextForDocument } from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../types/file_manager.types.ts";

const GENERIC_CONTINUE = "continue from where it ends";

/**
 * Target continuation instruction for Paths 1/3 (raw fragment or structurally-fixed last chunk).
 * Source: `troubleshooting/Continuation-to-Retry bug.md` §3.2 (lines 257–258).
 */
function expectedTruncationContinuationInstruction(anchorKey: string | null): string {
    const base: string =
        "Continue the JSON object from exactly where it ends. Do not restart the object or repeat prior content.";
    if (anchorKey === null) {
        return base;
    }
    return `${base} The incomplete or empty value is at top-level key "${anchorKey}".`;
}

const defaultSeedResource = {
    storage_path: "path/to",
    file_name: "seed_prompt.md",
    storage_bucket: "test-bucket",
};

Deno.test("gatherContinuationInputs", async (t) => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
    let denoEnvStub: { restore: () => void } | null = null;
    const consoleSpies: { error?: Spy<Console>; warn?: Spy<Console> } = {};

    const setup = (config: MockSupabaseDataConfig = {}) => {
        denoEnvStub = stub(Deno.env, "get", (key: string) => {
            if (key === "SB_CONTENT_STORAGE_BUCKET") return "test-bucket";
            return undefined;
        });
        mockSupabaseSetup = createMockSupabaseClient(undefined, config);
        consoleSpies.error = spy(console, "error");
        consoleSpies.warn = spy(console, "warn");
        const client: SupabaseClient<Database> = mockSupabaseSetup.client as unknown as SupabaseClient<
            Database
        >;
        const downloadFromStorageFn = (
            bucket: string,
            path: string,
        ): Promise<DownloadStorageResult> => downloadFromStorage(client, bucket, path);
        return { client, downloadFromStorageFn };
    };

    const teardown = () => {
        denoEnvStub?.restore();
        consoleSpies.error?.restore();
        consoleSpies.warn?.restore();
        mockSupabaseSetup?.clearAllStubs?.();
    };

    await t.step(
        "single chunk (root only): user seed, assistant JSON of merged object, user continuation instruction",
        async () => {
            const rootContributionId = "contrib-root-only";
            const seedPromptContent = "SEED_PROMPT_BODY";
            const rootChunkJson = '{"alpha":1}';

            const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                id: rootContributionId,
                session_id: "sess-1",
                iteration_number: 1,
                storage_path: "path/to/root",
                file_name: "root.md",
                storage_bucket: "test-bucket",
                document_relationships: { thesis: rootContributionId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: "test-model",
                user_id: "user-1",
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: "text/markdown",
                model_id: "model-1",
                original_model_contribution_id: null,
                processing_time_ms: 1,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 1,
                tokens_used_input: 1,
                tokens_used_output: 1,
                stage: "thesis",
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            };

            const { assembleChunks } = createAssembleChunksMock({
                result: {
                    success: true,
                    mergedObject: { alpha: 1 },
                    chunkCount: 1,
                    rawGroupCount: 0,
                    parseableCount: 1,
                },
            });

            const { client, downloadFromStorageFn } = setup({
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootContributionId)) {
                                return Promise.resolve({ data: [rootChunk], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.endsWith("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob([seedPromptContent]), error: null });
                        }
                        if (path.endsWith("root.md")) {
                            return Promise.resolve({ data: new Blob([rootChunkJson]), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error("missing " + path) });
                    },
                },
            });

            try {
                const deps: GatherContinuationInputsDeps = {
                    dbClient: client,
                    downloadFromStorageFn,
                    assembleChunks,
                };
                const out = await gatherContinuationInputs(deps, { chunkId: rootContributionId }, {});
                assert(isGatherContinuationInputsSuccess(out));
                assertEquals(out.messages.length, 3);
                assertEquals(out.messages[0].role, "user");
                assertEquals(out.messages[0].content, seedPromptContent);
                assertEquals(out.messages[1].role, "assistant");
                assertEquals(out.messages[1].content, JSON.stringify({ alpha: 1 }));
                assertEquals(out.messages[2].role, "user");
                assert(
                    typeof out.messages[2].content === "string" &&
                        out.messages[2].content.toLowerCase().includes(GENERIC_CONTINUE),
                );
            } finally {
                teardown();
            }
        },
    );

    await t.step(
        "multiple chunks: assistant content is JSON of merged object from assembleChunks",
        async () => {
            const rootId = "root-multi";
            const contId = "cont-multi";
            const seedContent = "SEED";
            const rootJson = '{"a":1}';
            const contJson = '{"b":2}';

            const rootRow: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                id: rootId,
                session_id: "sess-m",
                iteration_number: 1,
                storage_path: "p/root",
                file_name: "root.md",
                storage_bucket: "test-bucket",
                document_relationships: { thesis: rootId },
                created_at: new Date(0).toISOString(),
                is_latest_edit: true,
                model_name: "m",
                user_id: "u",
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: "text/markdown",
                model_id: "mid",
                original_model_contribution_id: null,
                processing_time_ms: 1,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 1,
                tokens_used_input: 1,
                tokens_used_output: 1,
                stage: "thesis",
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            };

            const { assembleChunks, calls } = createAssembleChunksMock({
                handler: async (_d, _p, payload) => {
                    assertEquals(payload.chunks.length, 2);
                    return {
                        success: true,
                        mergedObject: { a: 1, b: 2 },
                        chunkCount: payload.chunks.length,
                        rawGroupCount: 0,
                        parseableCount: payload.chunks.length,
                    };
                },
            });

            const contRow: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                ...rootRow,
                id: contId,
                storage_path: "p/c",
                file_name: "c.md",
                document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 0 },
                created_at: new Date(1).toISOString(),
            };

            const { client, downloadFromStorageFn } = setup({
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                                return Promise.resolve({ data: [rootRow], error: null });
                            }
                            return Promise.resolve({ data: [contRow, rootRow], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.endsWith("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob([seedContent]), error: null });
                        }
                        if (path.endsWith("root.md")) {
                            return Promise.resolve({ data: new Blob([rootJson]), error: null });
                        }
                        if (path.endsWith("c.md")) {
                            return Promise.resolve({ data: new Blob([contJson]), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error(path) });
                    },
                },
            });

            try {
                const out = await gatherContinuationInputs(
                    { dbClient: client, downloadFromStorageFn, assembleChunks },
                    { chunkId: rootId },
                    {},
                );
                assert(isGatherContinuationInputsSuccess(out));
                assertEquals(out.messages.length, 3);
                assertEquals(out.messages[1].content, JSON.stringify({ a: 1, b: 2 }));
                assertEquals(calls.length, 1);
                assertEquals(calls[0].payload.chunks.length, 2);
            } finally {
                teardown();
            }
        },
    );

    await t.step("continuation instruction references resume_cursor when last chunk JSON includes it", async () => {
        const rootId = "root-resume";
        const lastChunk =
            '{"content":"x","resume_cursor":{"offset":7,"unit":"chars"}}';

        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootId,
            session_id: "sess-r",
            iteration_number: 1,
            storage_path: "p/r",
            file_name: "r.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "m",
            user_id: "u",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "mid",
            original_model_contribution_id: null,
            processing_time_ms: 1,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 1,
            tokens_used_input: 1,
            tokens_used_output: 1,
            stage: "thesis",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock({
            result: {
                success: true,
                mergedObject: { content: "x" },
                chunkCount: 1,
                rawGroupCount: 0,
                parseableCount: 1,
            },
        });

        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
                dialectic_project_resources: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isSeed = modifier.filters.some((f) =>
                            f.column === "resource_type" && f.value === "seed_prompt"
                        );
                        if (isSeed) {
                            return Promise.resolve({ data: [defaultSeedResource], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (_b, path) => {
                    if (path.endsWith("seed_prompt.md")) {
                        return Promise.resolve({ data: new Blob(["S"]), error: null });
                    }
                    if (path.endsWith("r.md")) {
                        return Promise.resolve({ data: new Blob([lastChunk]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error(path) });
                },
            },
        });

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootId },
                {},
            );
            assert(isGatherContinuationInputsSuccess(out));
            const third: string | null = out.messages[2].content;
            assert(third !== null);
            assert(third.includes("resume_cursor"));
        } finally {
            teardown();
        }
    });

    await t.step(
        "truncation Path 1: last chunk raw — continuation instruction matches target (base only when no anchor key)",
        async () => {
            const rootId = "root-raw";
            const rawLast = "this is not json at all";

            const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                id: rootId,
                session_id: "sess-raw",
                iteration_number: 1,
                storage_path: "p/r",
                file_name: "r.md",
                storage_bucket: "test-bucket",
                document_relationships: { thesis: rootId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: "m",
                user_id: "u",
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: "text/markdown",
                model_id: "mid",
                original_model_contribution_id: null,
                processing_time_ms: 1,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 1,
                tokens_used_input: 1,
                tokens_used_output: 1,
                stage: "thesis",
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            };

            const { assembleChunks } = createAssembleChunksMock({
                result: {
                    success: true,
                    mergedObject: {},
                    chunkCount: 1,
                    rawGroupCount: 1,
                    parseableCount: 0,
                },
            });

            const { client, downloadFromStorageFn } = setup({
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                                return Promise.resolve({ data: [rootChunk], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.endsWith("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob(["S"]), error: null });
                        }
                        if (path.endsWith("r.md")) {
                            return Promise.resolve({ data: new Blob([rawLast]), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error(path) });
                    },
                },
            });

            try {
                const out = await gatherContinuationInputs(
                    { dbClient: client, downloadFromStorageFn, assembleChunks },
                    { chunkId: rootId },
                    {},
                );
                assert(isGatherContinuationInputsSuccess(out));
                const third: string | null = out.messages[2].content;
                assert(third !== null);
                const expected: string = expectedTruncationContinuationInstruction(null);
                assertEquals(third, expected);
            } finally {
                teardown();
            }
        },
    );

    await t.step(
        "truncation Path 3: last chunk structurally fixed — continuation instruction names anchor top-level key",
        async () => {
            const rootId = "root-structural-fix";
            const lastChunk = '{"content":"partial"';

            const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                id: rootId,
                session_id: "sess-structural",
                iteration_number: 1,
                storage_path: "p/s",
                file_name: "s.md",
                storage_bucket: "test-bucket",
                document_relationships: { thesis: rootId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: "m",
                user_id: "u",
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: "text/markdown",
                model_id: "mid",
                original_model_contribution_id: null,
                processing_time_ms: 1,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 1,
                tokens_used_input: 1,
                tokens_used_output: 1,
                stage: "thesis",
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            };

            const { assembleChunks } = createAssembleChunksMock({
                result: {
                    success: true,
                    mergedObject: { content: "partial" },
                    chunkCount: 1,
                    rawGroupCount: 1,
                    parseableCount: 0,
                },
            });

            const { client, downloadFromStorageFn } = setup({
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                                return Promise.resolve({ data: [rootChunk], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.endsWith("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob(["S"]), error: null });
                        }
                        if (path.endsWith("s.md")) {
                            return Promise.resolve({ data: new Blob([lastChunk]), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error(path) });
                    },
                },
            });

            try {
                const out = await gatherContinuationInputs(
                    { dbClient: client, downloadFromStorageFn, assembleChunks },
                    { chunkId: rootId },
                    {},
                );
                assert(isGatherContinuationInputsSuccess(out));
                const third: string | null = out.messages[2].content;
                assert(third !== null);
                const expected: string = expectedTruncationContinuationInstruction("content");
                assertEquals(third, expected);
            } finally {
                teardown();
            }
        },
    );

    await t.step(
        "expectedSchema: continuation instruction lists missing top-level key from content_to_include",
        async () => {
            const rootId = "root-schema";
            const rootJson = '{"title":"ok"}';
            const expectedSchema: ContextForDocument = {
                document_key: FileType.TurnPrompt,
                content_to_include: {
                    title: "",
                    body: "",
                },
            };
            const payload: GatherContinuationInputsPayload = { expectedSchema };

            const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                id: rootId,
                session_id: "sess-s",
                iteration_number: 1,
                storage_path: "p/r",
                file_name: "r.md",
                storage_bucket: "test-bucket",
                document_relationships: { thesis: rootId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: "m",
                user_id: "u",
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: "text/markdown",
                model_id: "mid",
                original_model_contribution_id: null,
                processing_time_ms: 1,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 1,
                tokens_used_input: 1,
                tokens_used_output: 1,
                stage: "thesis",
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            };

            const { assembleChunks } = createAssembleChunksMock({
                result: {
                    success: true,
                    mergedObject: { title: "ok" },
                    chunkCount: 1,
                    rawGroupCount: 0,
                    parseableCount: 1,
                },
            });

            const { client, downloadFromStorageFn } = setup({
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                                return Promise.resolve({ data: [rootChunk], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.endsWith("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob(["S"]), error: null });
                        }
                        if (path.endsWith("r.md")) {
                            return Promise.resolve({ data: new Blob([rootJson]), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error(path) });
                    },
                },
            });

            try {
                const out = await gatherContinuationInputs(
                    { dbClient: client, downloadFromStorageFn, assembleChunks },
                    { chunkId: rootId },
                    payload,
                );
                assert(isGatherContinuationInputsSuccess(out));
                const third: string | null = out.messages[2].content;
                assert(third !== null);
                assert(third.includes("body"));
            } finally {
                teardown();
            }
        },
    );

    await t.step("when assembleChunks returns an error, result is GatherContinuationInputsError", async () => {
        const rootId = "root-asm-err";

        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootId,
            session_id: "sess-e",
            iteration_number: 1,
            storage_path: "p/r",
            file_name: "r.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "m",
            user_id: "u",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "mid",
            original_model_contribution_id: null,
            processing_time_ms: 1,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 1,
            tokens_used_input: 1,
            tokens_used_output: 1,
            stage: "thesis",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const failingAssemble: AssembleChunksSignature = async () => ({
            success: false,
            error: "merge failed",
            failedAtStep: "merge",
        });

        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
                dialectic_project_resources: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isSeed = modifier.filters.some((f) =>
                            f.column === "resource_type" && f.value === "seed_prompt"
                        );
                        if (isSeed) {
                            return Promise.resolve({ data: [defaultSeedResource], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (_b, path) => {
                    if (path.endsWith("seed_prompt.md")) {
                        return Promise.resolve({ data: new Blob(["S"]), error: null });
                    }
                    if (path.endsWith("r.md")) {
                        return Promise.resolve({ data: new Blob(["{}"]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error(path) });
                },
            },
        });

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks: failingAssemble },
                { chunkId: rootId },
                {},
            );
            assert(isGatherContinuationInputsError(out));
            assertEquals(out.success, false);
            assertEquals(typeof out.error, "string");
            assert(out.error.length > 0);
        } finally {
            teardown();
        }
    });

    await t.step(
        "without expectedSchema and plain last chunk JSON, continuation uses generic continue phrase",
        async () => {
            const rootId = "root-plain";

            const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
                id: rootId,
                session_id: "sess-p",
                iteration_number: 1,
                storage_path: "p/r",
                file_name: "r.md",
                storage_bucket: "test-bucket",
                document_relationships: { thesis: rootId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: "m",
                user_id: "u",
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: "text/markdown",
                model_id: "mid",
                original_model_contribution_id: null,
                processing_time_ms: 1,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 1,
                tokens_used_input: 1,
                tokens_used_output: 1,
                stage: "thesis",
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            };

            const { assembleChunks } = createAssembleChunksMock({
                result: {
                    success: true,
                    mergedObject: { x: 1 },
                    chunkCount: 1,
                    rawGroupCount: 0,
                    parseableCount: 1,
                },
            });

            const { client, downloadFromStorageFn } = setup({
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                                return Promise.resolve({ data: [rootChunk], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.endsWith("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob(["S"]), error: null });
                        }
                        if (path.endsWith("r.md")) {
                            return Promise.resolve({ data: new Blob(['{"x":1}']), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error(path) });
                    },
                },
            });

            try {
                const out = await gatherContinuationInputs(
                    { dbClient: client, downloadFromStorageFn, assembleChunks },
                    { chunkId: rootId },
                    {},
                );
                assert(isGatherContinuationInputsSuccess(out));
                const third: string | null = out.messages[2].content;
                assert(third !== null);
                assert(third.toLowerCase().includes(GENERIC_CONTINUE));
            } finally {
                teardown();
            }
        },
    );

    await t.step("first message role is user (seed)", async () => {
        const rootId = "root-role1";
        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootId,
            session_id: "sess-1",
            iteration_number: 1,
            storage_path: "p/r",
            file_name: "r.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "m",
            user_id: "u",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "mid",
            original_model_contribution_id: null,
            processing_time_ms: 1,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 1,
            tokens_used_input: 1,
            tokens_used_output: 1,
            stage: "thesis",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock({
            result: {
                success: true,
                mergedObject: {},
                chunkCount: 1,
                rawGroupCount: 0,
                parseableCount: 1,
            },
        });

        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
                dialectic_project_resources: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isSeed = modifier.filters.some((f) =>
                            f.column === "resource_type" && f.value === "seed_prompt"
                        );
                        if (isSeed) {
                            return Promise.resolve({ data: [defaultSeedResource], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (_b, path) => {
                    if (path.endsWith("seed_prompt.md")) {
                        return Promise.resolve({ data: new Blob(["seed"]), error: null });
                    }
                    if (path.endsWith("r.md")) {
                        return Promise.resolve({ data: new Blob(["{}"]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error(path) });
                },
            },
        });

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootId },
                {},
            );
            assert(isGatherContinuationInputsSuccess(out));
            assertEquals(out.messages[0].role, "user");
        } finally {
            teardown();
        }
    });

    await t.step("second message role is assistant with assembled JSON string", async () => {
        const rootId = "root-role2";
        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootId,
            session_id: "sess-2",
            iteration_number: 1,
            storage_path: "p/r",
            file_name: "r.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "m",
            user_id: "u",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "mid",
            original_model_contribution_id: null,
            processing_time_ms: 1,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 1,
            tokens_used_input: 1,
            tokens_used_output: 1,
            stage: "thesis",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock({
            result: {
                success: true,
                mergedObject: { k: 9 },
                chunkCount: 1,
                rawGroupCount: 0,
                parseableCount: 1,
            },
        });

        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
                dialectic_project_resources: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isSeed = modifier.filters.some((f) =>
                            f.column === "resource_type" && f.value === "seed_prompt"
                        );
                        if (isSeed) {
                            return Promise.resolve({ data: [defaultSeedResource], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (_b, path) => {
                    if (path.endsWith("seed_prompt.md")) {
                        return Promise.resolve({ data: new Blob(["s"]), error: null });
                    }
                    if (path.endsWith("r.md")) {
                        return Promise.resolve({ data: new Blob(['{"k":9}']), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error(path) });
                },
            },
        });

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootId },
                {},
            );
            assert(isGatherContinuationInputsSuccess(out));
            assertEquals(out.messages[1].role, "assistant");
            assertEquals(out.messages[1].content, JSON.stringify({ k: 9 }));
        } finally {
            teardown();
        }
    });

    await t.step("third message role is user (continuation instruction)", async () => {
        const rootId = "root-role3";
        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootId,
            session_id: "sess-3",
            iteration_number: 1,
            storage_path: "p/r",
            file_name: "r.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "m",
            user_id: "u",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "mid",
            original_model_contribution_id: null,
            processing_time_ms: 1,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 1,
            tokens_used_input: 1,
            tokens_used_output: 1,
            stage: "thesis",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock({
            result: {
                success: true,
                mergedObject: {},
                chunkCount: 1,
                rawGroupCount: 0,
                parseableCount: 1,
            },
        });

        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
                dialectic_project_resources: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isSeed = modifier.filters.some((f) =>
                            f.column === "resource_type" && f.value === "seed_prompt"
                        );
                        if (isSeed) {
                            return Promise.resolve({ data: [defaultSeedResource], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (_b, path) => {
                    if (path.endsWith("seed_prompt.md")) {
                        return Promise.resolve({ data: new Blob(["s"]), error: null });
                    }
                    if (path.endsWith("r.md")) {
                        return Promise.resolve({ data: new Blob(["{}"]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error(path) });
                },
            },
        });

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootId },
                {},
            );
            assert(isGatherContinuationInputsSuccess(out));
            assertEquals(out.messages[2].role, "user");
        } finally {
            teardown();
        }
    });

    await t.step("uses stage column for .contains query", async () => {
        const rootContributionId = "contrib-stage-col";
        const correctStageSlug = "correct-stage";
        const wrongKeyInRelationships = "wrong-stage";

        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootContributionId,
            session_id: "sess-stg",
            iteration_number: 1,
            storage_path: "path/to/root",
            file_name: "root_chunk.md",
            storage_bucket: "test-bucket",
            document_relationships: { [wrongKeyInRelationships]: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "test-model",
            user_id: "user-stage-test",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "model-stage-test",
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            stage: correctStageSlug,
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock({
            result: {
                success: true,
                mergedObject: {},
                chunkCount: 1,
                rawGroupCount: 0,
                parseableCount: 1,
            },
        });

        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        if (
                            modifier.filters.some((f) =>
                                f.column === "document_relationships" && f.type === "contains" &&
                                isRecord(f.value) && f.value[correctStageSlug]
                            )
                        ) {
                            return Promise.resolve({ data: [], error: null });
                        }
                        return Promise.resolve({ data: [], error: new Error("wrong contains shape") });
                    },
                },
                dialectic_project_resources: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isSeed = modifier.filters.some((f) =>
                            f.column === "resource_type" && f.value === "seed_prompt"
                        );
                        if (isSeed) {
                            return Promise.resolve({ data: [defaultSeedResource], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
            storageMock: {
                downloadResult: (_b, path) => {
                    if (path.includes("seed_prompt.md")) {
                        return Promise.resolve({ data: new Blob(["seed"]), error: null });
                    }
                    if (path.includes("root_chunk.md")) {
                        return Promise.resolve({ data: new Blob(["{}"]), error: null });
                    }
                    return Promise.resolve({ data: new Blob(["{}"]), error: null });
                },
            },
        });

        try {
            await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootContributionId },
                {},
            );
        } finally {
            teardown();
        }
    });

    await t.step("returns GatherContinuationInputsError when stage is empty on root contribution", async () => {
        const rootContributionId = "contrib-missing-stage";

        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootContributionId,
            session_id: "sess-missing-stage",
            iteration_number: 1,
            storage_path: "path/to/root",
            file_name: "root_chunk.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "test-model",
            user_id: "user-missing-stage",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "model-missing-stage",
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            stage: "",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock();
        const { client, downloadFromStorageFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some((f) => f.column === "id" && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    },
                },
            },
        });

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootContributionId },
                {},
            );
            assert(isGatherContinuationInputsError(out));
            assertEquals(out.success, false);
            assertEquals(
                out.error,
                `Root contribution ${rootContributionId} has no stage information`,
            );
        } finally {
            teardown();
        }
    });

    await t.step("returns GatherContinuationInputsError when chunk content download fails", async () => {
        const rootContributionId = "contrib-download-fail";
        const rootChunk: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
            id: rootContributionId,
            session_id: "sess-download-fail",
            iteration_number: 1,
            storage_path: "path/to/root",
            file_name: "root_chunk.md",
            storage_bucket: "test-bucket",
            document_relationships: { thesis: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: "test-model",
            user_id: "user-download-fail",
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: "text/markdown",
            model_id: "model-download-fail",
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            stage: "thesis",
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const { assembleChunks } = createAssembleChunksMock();
        const { client, downloadFromStorageFn } = setup(
            {
                genericMockResults: {
                    dialectic_contributions: {
                        select: (modifier: MockQueryBuilderState) => {
                            if (modifier.filters.some((f) => f.column === "id" && f.value === rootContributionId)) {
                                return Promise.resolve({ data: [rootChunk], error: null });
                            }
                            return Promise.resolve({ data: [rootChunk], error: null });
                        },
                    },
                    dialectic_project_resources: {
                        select: (modifier: MockQueryBuilderState) => {
                            const isSeed = modifier.filters.some((f) =>
                                f.column === "resource_type" && f.value === "seed_prompt"
                            );
                            if (isSeed) {
                                return Promise.resolve({ data: [defaultSeedResource], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                    },
                },
                storageMock: {
                    downloadResult: (_b, path) => {
                        if (path.includes("seed_prompt.md")) {
                            return Promise.resolve({ data: new Blob(["seed content"]), error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error("File not found") });
                    },
                },
            },
        );

        try {
            const out = await gatherContinuationInputs(
                { dbClient: client, downloadFromStorageFn, assembleChunks },
                { chunkId: rootContributionId },
                {},
            );
            assert(isGatherContinuationInputsError(out));
            assertEquals(out.success, false);
            assertEquals(
                out.error,
                `Failed to download content for chunk ${rootContributionId}.`,
            );
        } finally {
            teardown();
        }
    });
});
