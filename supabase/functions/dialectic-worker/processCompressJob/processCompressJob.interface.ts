import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger } from "../../_shared/types.ts";
import type { ConstructStoragePathFn } from "../../_shared/utils/path_constructor.types.ts";
import type { BoundAssembleCompressionPromptFn, AssembleCompressionPromptError } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { BoundAssembleContinuationPromptFn } from "../../_shared/prompt-assembler/prompt-assembler.interface.ts";
import type { BoundPrepareModelJobFn } from "../prepareModelJob/prepareModelJob.interface.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";

export interface ProcessCompressJobDeps {
    assembleCompressionPrompt: BoundAssembleCompressionPromptFn;
    assembleContinuationPrompt: BoundAssembleContinuationPromptFn;
    prepareModelJob: BoundPrepareModelJobFn;
    constructStoragePath: ConstructStoragePathFn;
    logger: ILogger;
}

export interface ProcessCompressJobParams {
    dbClient: SupabaseClient<Database>;
}

export interface ProcessCompressJobPayload {
    job: DialecticJobRow;
}

export class ProcessCompressJobError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProcessCompressJobError";
    }
}

export interface ProcessCompressJobSuccessReturn {
    queued: boolean;
}

export interface ProcessCompressJobErrorReturn {
    error: AssembleCompressionPromptError;
    retriable: boolean;
}

export type ProcessCompressJobReturn =
    | ProcessCompressJobSuccessReturn
    | ProcessCompressJobErrorReturn;

export type ProcessCompressJobFn = (
    deps: ProcessCompressJobDeps,
    params: ProcessCompressJobParams,
    payload: unknown,
) => Promise<ProcessCompressJobReturn>;

export type BoundProcessCompressJobFn = (
    params: ProcessCompressJobParams,
    payload: unknown,
) => Promise<ProcessCompressJobReturn>;
