import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import { ContextForDocument } from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../types/file_manager.types.ts";
import { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { Messages } from "../types.ts";
import { AssembleChunksSignature } from "../utils/assembleChunks/assembleChunks.interface.ts";
import {
    GatherContinuationInputsDeps,
    GatherContinuationInputsParams,
    GatherContinuationInputsPayload,
    GatherContinuationInputsReturn,
    GatherContinuationInputsSuccess,
} from "./gatherContinuationInputs.interface.ts";

Deno.test(
    "Contract: GatherContinuationInputsDeps requires assembleChunks, downloadFromStorageFn, and dbClient — none optional",
    () => {
        const assembleChunks: AssembleChunksSignature = async (
            _deps,
            _params,
            _payload,
        ) => ({
            success: true,
            mergedObject: {},
            chunkCount: 0,
            rawGroupCount: 0,
            parseableCount: 0,
        });
        const downloadFromStorageFn = async (
            _bucket: string,
            _path: string,
        ): Promise<DownloadStorageResult> => ({
            data: null,
            error: null,
        });
        const dbClient: SupabaseClient<Database> = {} as SupabaseClient<Database>;
        const deps: GatherContinuationInputsDeps = {
            assembleChunks,
            downloadFromStorageFn,
            dbClient,
        };
        assertEquals("assembleChunks" in deps, true);
        assertEquals("downloadFromStorageFn" in deps, true);
        assertEquals("dbClient" in deps, true);
        assertEquals(typeof deps.assembleChunks, "function");
        assertEquals(typeof deps.downloadFromStorageFn, "function");
        assertEquals(typeof deps.dbClient, "object");
    },
);

Deno.test(
    "Contract: GatherContinuationInputsParams.chunkId is string — not optional",
    () => {
        const params: GatherContinuationInputsParams = { chunkId: "root-id" };
        assertEquals("chunkId" in params, true);
        assertEquals(typeof params.chunkId, "string");
    },
);

Deno.test(
    "Contract: GatherContinuationInputsPayload.expectedSchema is optional ContextForDocument",
    async (t) => {
        await t.step("payload may omit expectedSchema", () => {
            const payload: GatherContinuationInputsPayload = {};
            assertEquals("expectedSchema" in payload, false);
        });

        await t.step("payload may include expectedSchema as ContextForDocument", () => {
            const expectedSchema: ContextForDocument = {
                document_key: FileType.TurnPrompt,
                content_to_include: {
                    title: "",
                },
            };
            const payload: GatherContinuationInputsPayload = { expectedSchema };
            assertEquals("expectedSchema" in payload, true);
            assertEquals(payload.expectedSchema?.document_key, FileType.TurnPrompt);
        });
    },
);

Deno.test(
    "Contract: GatherContinuationInputsSuccess.messages is Messages[] — not optional",
    () => {
        const messages: Messages[] = [
            { role: "user", content: "seed" },
            { role: "assistant", content: "{}" },
            { role: "user", content: "continue" },
        ];
        const ok: GatherContinuationInputsSuccess = {
            success: true,
            messages,
        };
        assertEquals("messages" in ok, true);
        assertEquals(Array.isArray(ok.messages), true);
        assertEquals(ok.messages.length, 3);
    },
);

Deno.test(
    "Contract: GatherContinuationInputsReturn discriminates on success: true | false",
    async (t) => {
        await t.step("success === true", () => {
            const resolved: Awaited<GatherContinuationInputsReturn> = {
                success: true,
                messages: [
                    { role: "user", content: "a" },
                    { role: "assistant", content: "b" },
                    { role: "user", content: "c" },
                ],
            };
            if (resolved.success === true) {
                assertEquals(Array.isArray(resolved.messages), true);
            } else {
                throw new Error("expected success branch");
            }
        });

        await t.step("success === false", () => {
            const resolved: Awaited<GatherContinuationInputsReturn> = {
                success: false,
                error: "assembly failed",
            };
            if (resolved.success === false) {
                assertEquals(resolved.error, "assembly failed");
            } else {
                throw new Error("expected error branch");
            }
        });
    },
);
