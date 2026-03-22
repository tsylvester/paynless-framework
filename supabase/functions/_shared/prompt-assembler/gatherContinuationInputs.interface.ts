import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import { ContextForDocument } from "../../dialectic-service/dialectic.interface.ts";
import { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { Messages } from "../types.ts";
import { AssembleChunksSignature } from "../utils/assembleChunks/assembleChunks.interface.ts";

export interface GatherContinuationInputsDeps {
    assembleChunks: AssembleChunksSignature;
    downloadFromStorageFn: (
        bucket: string,
        path: string,
    ) => Promise<DownloadStorageResult>;
    dbClient: SupabaseClient<Database>;
}

export interface GatherContinuationInputsParams {
    chunkId: string;
}

export interface GatherContinuationInputsPayload {
    expectedSchema?: ContextForDocument;
}

export interface GatherContinuationInputsSuccess {
    success: true;
    messages: Messages[];
}

export interface GatherContinuationInputsError {
    success: false;
    error: string;
}

export type GatherContinuationInputsReturn = Promise<
    GatherContinuationInputsSuccess | GatherContinuationInputsError
>;

export type GatherContinuationInputsSignature = (
    deps: GatherContinuationInputsDeps,
    params: GatherContinuationInputsParams,
    payload: GatherContinuationInputsPayload,
) => GatherContinuationInputsReturn;
