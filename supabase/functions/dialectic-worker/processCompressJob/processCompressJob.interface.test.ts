import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    BoundProcessCompressJobFn,
    ProcessCompressJobDeps,
    ProcessCompressJobErrorReturn,
    ProcessCompressJobFn,
    ProcessCompressJobParams,
    ProcessCompressJobPayload,
    ProcessCompressJobReturn,
    ProcessCompressJobSuccessReturn,
} from "./processCompressJob.interface.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";

Deno.test(
    "Contract: ProcessCompressJobDeps declares seven dependency keys",
    () => {
        const surface: Record<keyof ProcessCompressJobDeps, true> = {
            assembleCompressionPrompt: true,
            enqueueModelCall: true,
            countTokens: true,
            getEncoding: true,
            countTokensAnthropic: true,
            constructStoragePath: true,
            logger: true,
        };
        assertEquals(Object.keys(surface).length, 7);
    },
);

Deno.test(
    "Contract: ProcessCompressJobParams declares four fields",
    () => {
        const surface: Record<keyof ProcessCompressJobParams, true> = {
            dbClient: true,
            job: true,
            projectOwnerUserId: true,
            authToken: true,
        };
        assertEquals(Object.keys(surface).length, 4);
    },
);

Deno.test(
    "Contract: ProcessCompressJobPayload type-checks from this interface file",
    () => {
        const payload: ProcessCompressJobPayload = {
            job_type: "COMPRESS",
            sessionId: "session-1",
            projectId: "project-1",
            stageSlug: DialecticStageSlug.Thesis,
            targetKey: FileType.business_case,
            iterationNumber: 1,
            model_id: "model-1",
            mode: "text",
            content: "some content",
            sourceType: "contribution",
            documentKey: FileType.business_case,
            walletId: "wallet-1",
            user_id: "user-1",
        };
        assertEquals(payload.job_type, "COMPRESS");
        assertEquals(payload.mode, "text");
        assertEquals(typeof payload.iterationNumber, "number");
    },
);

Deno.test(
    "Contract: ProcessCompressJobSuccessReturn queued boolean",
    () => {
        const r: ProcessCompressJobSuccessReturn = { queued: false };
        assertEquals(typeof r.queued, "boolean");
    },
);

Deno.test(
    "Contract: ProcessCompressJobErrorReturn has Error and retriable boolean",
    () => {
        const err: ProcessCompressJobErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        assertEquals(err.error instanceof Error, true);
        assertEquals(typeof err.retriable, "boolean");
    },
);

Deno.test(
    "Contract: ProcessCompressJobReturn is a union of success and error",
    () => {
        const ok: ProcessCompressJobSuccessReturn = { queued: true };
        const unionOk: ProcessCompressJobReturn = ok;
        assertEquals("queued" in unionOk, true);

        const err: ProcessCompressJobErrorReturn = {
            error: new Error("x"),
            retriable: true,
        };
        const unionErr: ProcessCompressJobReturn = err;
        assertEquals("error" in unionErr, true);
    },
);

Deno.test(
    "Contract: ProcessCompressJobFn signature",
    () => {
        const fn: ProcessCompressJobFn = async (
            _deps: ProcessCompressJobDeps,
            _params: ProcessCompressJobParams,
            _payload: ProcessCompressJobPayload,
        ): Promise<ProcessCompressJobReturn> => {
            const ok: ProcessCompressJobSuccessReturn = { queued: true };
            return ok;
        };
        assertEquals(typeof fn, "function");
    },
);

Deno.test(
    "Contract: BoundProcessCompressJobFn signature",
    () => {
        const bound: BoundProcessCompressJobFn = async (
            _params: ProcessCompressJobParams,
            _payload: ProcessCompressJobPayload,
        ): Promise<ProcessCompressJobReturn> => {
            const err: ProcessCompressJobErrorReturn = {
                error: new Error("x"),
                retriable: false,
            };
            return err;
        };
        assertEquals(typeof bound, "function");
    },
);
