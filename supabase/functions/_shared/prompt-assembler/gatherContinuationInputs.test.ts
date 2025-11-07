import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { gatherContinuationInputs } from "./gatherContinuationInputs.ts";
import { DynamicContextVariables } from "./prompt-assembler.interface.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockSupabaseClientSetup } from "../supabase.mock.ts";
import { isRecord } from "../utils/type_guards.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Database } from "../../types_db.ts";
import type { AiModelExtendedConfig, Messages } from "../types.ts";
import { MockQueryBuilderState } from "../supabase.mock.ts";
import { DownloadStorageResult, downloadFromStorage } from "../supabase_storage_utils.ts";


// Define a type for the mock implementation of renderPrompt
type RenderPromptMock = (
    _basePromptText: string, 
    _dynamicContextVariables: DynamicContextVariables, 
    _systemDefaultOverlayValues?: Json, 
    _userProjectOverlayValues?: Json
) => string;

// Define the correct two-argument function type for the download mock
type DownloadFnMock = (bucket: string, path: string) => Promise<DownloadStorageResult>;

Deno.test("PromptAssembler", async (t) => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
    let denoEnvStub: any = null;
    const consoleSpies: { error?: Spy<Console>, warn?: Spy<Console> } = {};

    const mockModelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-model',
        tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 1 },
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0002,
        hard_cap_output_tokens: 1000,
        context_window_tokens: 1000,
        provider_max_input_tokens: 1000,
        provider_max_output_tokens: 1000,
        default_temperature: 0.5,
    };

    const setup = (
        config: MockSupabaseDataConfig = {}, 
        renderPromptFn?: RenderPromptMock, 
        countTokensFn?: () => number,
        downloadFn?: DownloadFnMock
    ) => {
        denoEnvStub = stub(Deno.env, "get", (key: string) => {
            if (key === "SB_CONTENT_STORAGE_BUCKET") {
                return "test-bucket";
            }
            return undefined;
        });

        mockSupabaseSetup = createMockSupabaseClient(undefined, config);
        
        consoleSpies.error = spy(console, "error");
        consoleSpies.warn = spy(console, "warn");

        const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const effectiveDownloadFn = downloadFn || ((bucket: string, path: string) => downloadFromStorage(client, bucket, path));

        return { 
            client, 
            spies: mockSupabaseSetup.spies, 
            downloadFn: effectiveDownloadFn 
        };
    };

    const teardown = () => {
        denoEnvStub?.restore();
        consoleSpies.error?.restore();
        consoleSpies.warn?.restore();
        if (mockSupabaseSetup) {
            mockSupabaseSetup.clearAllStubs?.();
        }
    };

    await t.step("gatherContinuationInputs returns an atomic message for each chunk", async () => {
        const rootContributionId = 'contrib-root-123';
        const continuationId = 'contrib-cont-456';
        const seedPromptContent = "This is the original seed prompt.";
        const rootAiChunkContent = "This is the root AI part.";
        const continuationAiChunkContent = "This is the continuation AI part.";

        const mockContributions: Database['public']['Tables']['dialectic_contributions']['Row'][] = [
            {
                id: rootContributionId,
                session_id: 'sess-123',
                iteration_number: 1,
                storage_path: 'path/to/root',
                file_name: 'root_chunk.md',
                storage_bucket: 'test-bucket',
                document_relationships: { "thesis": rootContributionId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: 'test-model',
                user_id: 'user-123',
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: 'text/markdown',
                model_id: 'model-123',
                original_model_contribution_id: null,
                processing_time_ms: 100,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 100,
                tokens_used_input: 100,
                tokens_used_output: 100,
                stage: 'thesis',
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            },
            {
                id: 'contrib-cont-456',
                session_id: 'sess-123',
                iteration_number: 1,
                storage_path: 'path/to/cont1',
                file_name: 'cont1_chunk.md',
                storage_bucket: 'test-bucket',
                document_relationships: { 
                    "thesis": rootContributionId,
                    "isContinuation": true,
                    "turnIndex": 0
                },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: 'test-model',
                user_id: 'user-123',
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: 'text/markdown',
                model_id: 'model-123',
                original_model_contribution_id: null,
                processing_time_ms: 100,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 100,
                tokens_used_input: 100,
                tokens_used_output: 100,
                stage: 'thesis',
                updated_at: new Date().toISOString(),
                is_header: false,
                source_prompt_resource_id: null,
            }
        ];

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isQueryingForRootById = modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId);
                        if (isQueryingForRootById) {
                            const rootChunk = mockContributions.find(c => c.id === rootContributionId);
                            // The .single() is called on the builder, so .select() should return an array.
                            return Promise.resolve({ data: rootChunk ? [rootChunk] : [], error: null });
                        }
                        return Promise.resolve({ data: mockContributions, error: null });
                    }
                },
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.includes('seed_prompt.md')) {
                        return Promise.resolve({ data: new Blob([seedPromptContent]), error: null });
                    }
                    if (path.includes('root_chunk.md')) {
                        return Promise.resolve({ data: new Blob([rootAiChunkContent]), error: null });
                    }
                    if (path.includes('cont1_chunk.md')) {
                        return Promise.resolve({ data: new Blob([continuationAiChunkContent]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('File not found in mock') });
                }
            }
        };

        const { client, downloadFn } = setup(config);

        try {
            const expectedMessages: Messages[] = [
                { role: 'user', content: seedPromptContent },
                { role: 'assistant', content: rootAiChunkContent, id: rootContributionId },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: continuationAiChunkContent, id: continuationId },
            ];

            const result = await gatherContinuationInputs(client, downloadFn, rootContributionId);

            assertEquals(result, expectedMessages);

        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs creates a valid, alternating 3-turn conversation history", async () => {
        const rootId = 'root-3-turn';
        const stageSlug = 'test-stage';
        const seedContent = "Initial user prompt for 3-turn test.";
        const turn1Content = "Assistant turn 1 content.";
        const turn2Content = "Assistant turn 2 content.";
        const turn3Content = "Assistant turn 3 content.";

        const baseRow = (
            id: string,
            content: string,
            turnIndex?: number,
            createdAtOffset = 0
        ): Database['public']['Tables']['dialectic_contributions']['Row'] => ({
            id,
            session_id: 'sess-3-turn',
            iteration_number: 1,
            storage_path: `path/to/${id}`,
            file_name: `${id}.md`,
            storage_bucket: 'test-bucket',
            document_relationships: {
                [stageSlug]: rootId,
                ...(turnIndex !== undefined && { isContinuation: true, turnIndex: turnIndex }),
            },
            created_at: new Date(Date.now() + createdAtOffset).toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-3-turn',
            stage: stageSlug,
            // --- other fields ---
            citations: null, contribution_type: null, edit_version: 1, error: null, mime_type: 'text/markdown',
            model_id: 'model-3-turn', original_model_contribution_id: null, processing_time_ms: 1,
            target_contribution_id: turnIndex !== undefined ? rootId : null, prompt_template_id_used: null, raw_response_storage_path: null,
            seed_prompt_url: null, size_bytes: 1, tokens_used_input: 1, tokens_used_output: 1, updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,

        });

        const turn1Chunk = baseRow('turn1', turn1Content, 1, 100);
        const turn3Chunk = baseRow('turn3', turn3Content, 3, 300);
        const rootChunk = baseRow(rootId, 'Root content should be included but its content is from a separate download', undefined, 0);
        const turn2Chunk = baseRow('turn2', turn2Content, 2, 200);
        
        const mockChunks = [turn1Chunk, turn3Chunk, rootChunk, turn2Chunk];

        const { client, downloadFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // Return all chunks for the .contains query
                        return Promise.resolve({ data: mockChunks, error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.endsWith('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedContent]), error: null });
                    if (path.endsWith(`${rootId}.md`)) return Promise.resolve({ data: new Blob([rootChunk.id]), error: null });
                    if (path.endsWith('turn1.md')) return Promise.resolve({ data: new Blob([turn1Content]), error: null });
                    if (path.endsWith('turn2.md')) return Promise.resolve({ data: new Blob([turn2Content]), error: null });
                    if (path.endsWith('turn3.md')) return Promise.resolve({ data: new Blob([turn3Content]), error: null });
                    return Promise.resolve({ data: null, error: new Error(`Mock download fail for path: ${path}`) });
                }
            }
        });

        try {
            const result = await gatherContinuationInputs(client, downloadFn, rootId);

            const expectedMessages: Messages[] = [
                { role: 'user', content: seedContent },
                { role: 'assistant', content: rootId, id: rootId },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: turn1Content, id: 'turn1' },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: turn2Content, id: 'turn2' },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: turn3Content, id: 'turn3' },
            ];
            
            assertEquals(result.length, expectedMessages.length, "Should have the correct number of messages");
            for (let i = 0; i < expectedMessages.length; i++) {
                assertEquals(result[i].role, expectedMessages[i].role, `Message ${i} should have role '${expectedMessages[i].role}'`);
                // Only assert content for user messages as assistant content is complex
                if(expectedMessages[i].role === 'user') {
                    assertEquals(result[i].content, expectedMessages[i].content, `Message ${i} should have correct content`);
                }
            }

        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs correctly downloads seed and a single root chunk", async () => {
        const stageRoot = 'proj-xyz/session_abcd1234/iteration_1/1_thesis';
        const rootContributionId = 'root-abc';
        const bucket = 'test-bucket';

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-xyz',
            user_id: 'user-xyz',
            stage: 'thesis',
            iteration_number: 1,
            model_id: 'model-1',
            model_name: 'model-one',
            prompt_template_id_used: null,
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 1,
            tokens_used_output: 1,
            processing_time_ms: 1,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'thesis',
            file_name: 'gpt-4_0_thesis.md',
            storage_bucket: bucket,
            storage_path: `${stageRoot}`,
            mime_type: 'text/markdown',
            size_bytes: 10,
            document_relationships: { thesis: rootContributionId },
            is_header: false,
            source_prompt_resource_id: null,
        };

        const seedPromptPath = `${stageRoot}/seed_prompt.md`;
        const rootChunkPath = `${stageRoot}/${rootChunk.file_name}`;

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: async (state: MockQueryBuilderState) => {
                        // First select for root by id
                        if (state.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return { data: [rootChunk], error: null, count: 1, status: 200, statusText: 'OK' };
                        }
                        // Then the .contains query will find no other chunks
                        return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
                    },
                },
            },
            storageMock: {
                downloadResult: async (_bucket: string, path: string) => {
                    if (path === seedPromptPath) {
                        return { data: new Blob(["Seed content"], { type: 'text/markdown' }), error: null };
                    }
                    // The bug fix causes the root chunk to be downloaded. The mock must provide it.
                    if (path === rootChunkPath) {
                        return { data: new Blob(["Root chunk content"], { type: 'text/markdown' }), error: null };
                    }
                    return { data: null, error: new Error(`Mock not implemented for path: ${path}`) };
                },
            },
        };

        const { client, downloadFn } = setup(config);
        try {
            const messages = await gatherContinuationInputs(client, downloadFn, rootContributionId);

            const expectedMessages: Messages[] = [
                { role: 'user', content: 'Seed content' },
                { role: 'assistant', content: 'Root chunk content', id: rootContributionId },
            ];

            assertEquals(messages, expectedMessages);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs should NOT read seed prompt from _work directory", async () => {
        const rootContributionId = 'root-seed-001';
        const stageRootPath = 'project123/session_sess-123/iteration_1/1_thesis';
        const wrongWorkPath = `${stageRootPath}/_work`;
        const expectedSeedPromptPath = `${stageRootPath}/seed_prompt.md`; // correct path (no _work)

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-123',
            iteration_number: 1,
            storage_path: wrongWorkPath, // Current implementation derives from this and appends seed_prompt.md → wrong
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { thesis: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-123',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-123',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            stage: 'thesis',
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const contChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            ...rootChunk,
            id: 'cont-xyz',
            storage_path: `${stageRootPath}/cont`,
            file_name: 'cont.md',
            document_relationships: { thesis: rootContributionId, isContinuation: true, turnIndex: 0 },
        };

        const { client, downloadFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isRootQuery = modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId);
                        if (isRootQuery) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [rootChunk, contChunk], error: null });
                    }
                }
            },
            storageMock: {
                // Only return data when the CORRECT seed prompt path (no _work) is requested
                downloadResult: (_bucket, path) => {
                    if (path === expectedSeedPromptPath) {
                        return Promise.resolve({ data: new Blob(["seed content"]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('Wrong path requested') });
                }
            }
        });

        try {
            await assertRejects(
                async () => {
                    await gatherContinuationInputs(client, downloadFn, rootContributionId);
                },
                Error,
                'Failed to download content for chunk'
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs orders root first, then by turnIndex, then created_at", async () => {
        const rootId = 'root-ordered-1';
        const createdAtBase = Date.parse('2025-01-01T00:00:00.000Z');

        const seedPromptContent = "Seed prompt ordered.";
        const rootContent = "Root content.";
        const cont0Content = "Cont turnIndex 0.";
        const cont1Content = "Cont turnIndex 1.";
        const cont2Content = "Cont turnIndex 2.";
        const noTiEarlyContent = "Cont no turnIndex (early).";
        const noTiLateContent = "Cont no turnIndex (late).";

        const row = (overrides: Partial<Database['public']['Tables']['dialectic_contributions']['Row']>): Database['public']['Tables']['dialectic_contributions']['Row'] => ({
            id: '',
            session_id: 'sess-ord',
            iteration_number: 1,
            storage_path: 'path/to',
            file_name: 'file.md',
            storage_bucket: 'test-bucket',
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-ord',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-ord',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 10,
            tokens_used_output: 10,
            stage: 'thesis',
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
            ...overrides,
        });

        // Root and continuation chunks (provided in scrambled DB order)
        const cont2 = row({ id: 'cont-2', storage_path: 'path/to/cont2', file_name: 'cont2.md', document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 2 }, created_at: new Date(createdAtBase + 3000).toISOString() });
        const root = row({ id: rootId, storage_path: 'path/to/root', file_name: 'root.md', document_relationships: { thesis: rootId }, created_at: new Date(createdAtBase + 0).toISOString() });
        const noTiLate = row({ id: 'cont-no-ti-late', storage_path: 'path/to/noTiLate', file_name: 'no_ti_late.md', document_relationships: { thesis: rootId, isContinuation: true }, created_at: new Date(createdAtBase + 6000).toISOString() });
        const cont0 = row({ id: 'cont-0', storage_path: 'path/to/cont0', file_name: 'cont0.md', document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 0 }, created_at: new Date(createdAtBase + 1000).toISOString() });
        const noTiEarly = row({ id: 'cont-no-ti-early', storage_path: 'path/to/noTiEarly', file_name: 'no_ti_early.md', document_relationships: { thesis: rootId, isContinuation: true }, created_at: new Date(createdAtBase + 4000).toISOString() });
        const cont1 = row({ id: 'cont-1', storage_path: 'path/to/cont1', file_name: 'cont1.md', document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 1 }, created_at: new Date(createdAtBase + 2000).toISOString() });

        const scrambled: Database['public']['Tables']['dialectic_contributions']['Row'][] = [cont2, root, noTiLate, cont0, noTiEarly, cont1];

        const { client, downloadFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isQueryingForRootById = modifier.filters.some(f => f.column === 'id' && f.value === rootId);
                        if (isQueryingForRootById) {
                            return Promise.resolve({ data: [root], error: null });
                        }
                        // Return scrambled list to ensure client-side sort is applied
                        return Promise.resolve({ data: scrambled, error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.includes('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedPromptContent]), error: null });
                    if (path.includes('root.md')) return Promise.resolve({ data: new Blob([rootContent]), error: null });
                    if (path.includes('cont0.md')) return Promise.resolve({ data: new Blob([cont0Content]), error: null });
                    if (path.includes('cont1.md')) return Promise.resolve({ data: new Blob([cont1Content]), error: null });
                    if (path.includes('cont2.md')) return Promise.resolve({ data: new Blob([cont2Content]), error: null });
                    if (path.includes('no_ti_early.md')) return Promise.resolve({ data: new Blob([noTiEarlyContent]), error: null });
                    if (path.includes('no_ti_late.md')) return Promise.resolve({ data: new Blob([noTiLateContent]), error: null });
                    return Promise.resolve({ data: null, error: new Error('Not found') });
                }
            }
        });

        try {
            const messages = await gatherContinuationInputs(client, downloadFn, rootId);
            const contents = messages.map(m => m.content);
            // Expected order: seed, root, cont0, cont1, cont2, noTiEarly (earlier created_at), noTiLate (later created_at), followed by 'Please continue.' after each assistant turn
            const expectedContents = [
                seedPromptContent,
                rootContent, "Please continue.",
                cont0Content, "Please continue.",
                cont1Content, "Please continue.",
                cont2Content, "Please continue.",
                noTiEarlyContent, "Please continue.",
                noTiLateContent,
            ];
            assertEquals(contents, expectedContents);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs uses direct stage field instead of parsing document_relationships", async () => {
        const rootContributionId = 'contrib-stage-test-123';
        const correctStageSlug = 'correct-stage';
        const incorrectStageSlug = 'incorrect-stage';

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-stage-test',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { [incorrectStageSlug]: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-stage-test',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-stage-test',
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

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // This query should use the correct stage slug.
                        if (modifier.filters.some(f => f.column === 'document_relationships' && f.type === 'contains' && isRecord(f.value) && f.value[correctStageSlug])) {
                            return Promise.resolve({ data: [], error: null });
                        }
                        return Promise.resolve({ data: [], error: new Error(`Query was called with incorrect stage slug`) });
                    }
                },
            },
            storageMock: {
                downloadResult: () => Promise.resolve({ data: new Blob(["seed content"]), error: null })
            }
        };

        const { client, downloadFn } = setup(config);

        try {
            // This will throw if the mock receives a query with the incorrect stage slug.
            await gatherContinuationInputs(client, downloadFn, rootContributionId);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs includes root chunk when no other chunks are found", async () => {
        const rootContributionId = 'contrib-root-only-123';
        const rootContent = "Root content here.";
        const seedContent = "Seed prompt for root-only test.";

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-root-only',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root.md',
            storage_bucket: 'test-bucket',
            document_relationships: { 'thesis': rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-root-only',
            stage: 'thesis',
            citations: null, contribution_type: null, edit_version: 1, error: null, mime_type: 'text/markdown',
            model_id: 'model-root-only', original_model_contribution_id: null, processing_time_ms: 1,
            target_contribution_id: null, prompt_template_id_used: null, raw_response_storage_path: null,
            seed_prompt_url: null, size_bytes: 1, tokens_used_input: 1, tokens_used_output: 1, updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // Simulate no other chunks being found.
                        return Promise.resolve({ data: [], error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.endsWith('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedContent]), error: null });
                    if (path.endsWith('root.md')) return Promise.resolve({ data: new Blob([rootContent]), error: null });
                    return Promise.resolve({ data: null, error: new Error('File not found') });
                }
            }
        };

        const { client, downloadFn } = setup(config);

        try {
            const messages = await gatherContinuationInputs(client, downloadFn, rootContributionId);
            const expectedMessages: Messages[] = [
                { role: 'user', content: seedContent },
                { role: 'assistant', content: rootContent, id: rootContributionId },
            ];
            assertEquals(messages, expectedMessages);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs throws error when stage field is missing", async () => {
        const rootContributionId = 'contrib-missing-stage-123';

        // Create a root contribution without a stage field
        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-missing-stage',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { "thesis": rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-missing-stage',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-missing-stage',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            // Missing stage field - should cause error
            stage: null as any,
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isQueryingForRootById = modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId);
                        if (isQueryingForRootById) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    }
                },
            },
        };

        const { client, downloadFn } = setup(config);

        try {
            await assertRejects(
                async () => {
                    await gatherContinuationInputs(client, downloadFn, rootContributionId);
                },
                Error,
                'Root contribution contrib-missing-stage-123 has no stage information'
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs throws an error when a content chunk download fails", async () => {
        const rootContributionId = 'contrib-download-fail-123';
        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-download-fail',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { thesis: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-download-fail',
            citations: null, contribution_type: null, edit_version: 1, error: null,
            mime_type: 'text/markdown', model_id: 'model-download-fail', original_model_contribution_id: null,
            processing_time_ms: 100, target_contribution_id: null, prompt_template_id_used: null,
            raw_response_storage_path: null, seed_prompt_url: null, size_bytes: 100,
            tokens_used_input: 100, tokens_used_output: 100,
            stage: 'thesis',
            updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // Return the same chunk for the 'contains' query to trigger the download
                        return Promise.resolve({ data: [rootChunk], error: null });
                    }
                },
            },
        };

        // Create a mock download function that simulates an error only for the chunk
        const failingDownloadFn: DownloadFnMock = async (_bucket, path) => {
            if (path.includes('seed_prompt.md')) {
                // Allow the seed prompt download to succeed by creating a proper ArrayBuffer from a Blob.
                return {
                    data: await new Blob(['seed content']).arrayBuffer(),
                    error: null,
                };
            }
            // Fail the chunk download
            return {
                data: null,
                error: new Error('File not found'),
            };
        };

        const { client } = setup(config, undefined, undefined, failingDownloadFn);

        try {
            // This test must fail initially. The current implementation catches the download error,
            // logs it, and continues, which means assertRejects will not find a thrown error.
            await assertRejects(
                async () => {
                    await gatherContinuationInputs(client, failingDownloadFn, rootContributionId);
                },
                Error,
                'Failed to download content for chunk'
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs history ends with the last assistant message", async () => {
        const rootId = 'root-last-msg-test';
        const stageSlug = 'test-stage';
        const seedContent = "Initial user prompt for last message test.";
        const turn1Content = "Assistant turn 1 content.";
        const turn2Content = "Assistant turn 2 content.";

        const baseRow = (
            id: string,
            turnIndex?: number
        ): Database['public']['Tables']['dialectic_contributions']['Row'] => ({
            id,
            session_id: 'sess-last-msg-test',
            iteration_number: 1,
            storage_path: `path/to/${id}`,
            file_name: `${id}.md`,
            storage_bucket: 'test-bucket',
            document_relationships: {
                [stageSlug]: rootId,
                ...(turnIndex !== undefined && { isContinuation: true, turnIndex: turnIndex }),
            },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-last-msg-test',
            stage: stageSlug,
            citations: null, contribution_type: null, edit_version: 1, error: null, mime_type: 'text/markdown',
            model_id: 'model-last-msg-test', original_model_contribution_id: null, processing_time_ms: 1,
            target_contribution_id: null, prompt_template_id_used: null, raw_response_storage_path: null,
            seed_prompt_url: null, size_bytes: 1, tokens_used_input: 1, tokens_used_output: 1, updated_at: new Date().toISOString(),
            is_header: false,
            source_prompt_resource_id: null,
        });

        const rootChunk = baseRow(rootId);
        const turn1Chunk = baseRow('turn1', 1);
        const turn2Chunk = baseRow('turn2', 2);
        
        const mockChunks = [rootChunk, turn1Chunk, turn2Chunk];

        const { client, downloadFn } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: mockChunks, error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.endsWith('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedContent]), error: null });
                    if (path.endsWith(`${rootId}.md`)) return Promise.resolve({ data: new Blob([rootId]), error: null });
                    if (path.endsWith('turn1.md')) return Promise.resolve({ data: new Blob([turn1Content]), error: null });
                    if (path.endsWith('turn2.md')) return Promise.resolve({ data: new Blob([turn2Content]), error: null });
                    return Promise.resolve({ data: null, error: new Error(`Mock download fail for path: ${path}`) });
                }
            }
        });

        try {
            const result = await gatherContinuationInputs(client, downloadFn, rootId);

            // This test will fail because the current implementation adds a final user message.
            assert(result.length > 0, "Should have messages");
            const lastMessage = result[result.length - 1];
            assertEquals(lastMessage.role, 'assistant', "The last message in the history should be from the assistant");
            assertEquals(lastMessage.content, turn2Content);

        } finally {
            teardown();
        }
    });
});
