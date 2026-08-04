import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger } from "../../_shared/types.ts";
import type { CountTokensDeps, CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { ConstructStoragePathFn } from "../../_shared/utils/path_constructor.types.ts";
import type { BoundAssembleCompressionPromptFn, AssembleCompressionPromptError } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { BoundAssembleContinuationPromptFn } from "../../_shared/prompt-assembler/prompt-assembler.interface.ts";
import type { BoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";

export interface ProcessCompressJobDeps {
    assembleCompressionPrompt: BoundAssembleCompressionPromptFn;
    assembleContinuationPrompt: BoundAssembleContinuationPromptFn;
    enqueueModelCall: BoundEnqueueModelCallFn;
    countTokens: CountTokensFn;
    getEncoding: CountTokensDeps["getEncoding"];
    countTokensAnthropic: CountTokensDeps["countTokensAnthropic"];
    constructStoragePath: ConstructStoragePathFn;
    logger: ILogger;
}

export interface ProcessCompressJobParams {
    dbClient: SupabaseClient<Database>;
    job: DialecticJobRow;
    projectOwnerUserId: string;
    authToken: string;
}

export type ProcessCompressJobPayload = DialecticCompressJobPayload;

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
    payload: ProcessCompressJobPayload,
) => Promise<ProcessCompressJobReturn>;

export type BoundProcessCompressJobFn = (
    params: ProcessCompressJobParams,
    payload: ProcessCompressJobPayload,
) => Promise<ProcessCompressJobReturn>;
