import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    AiStreamEventBody,
    AiStreamEventData,
    BoundEnqueueModelCallFn,
    EnqueueModelCallDeps,
    EnqueueModelCallErrorReturn,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallReturn,
    EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";

Deno.test(
    "Contract: EnqueueModelCallDeps declares four dependency keys",
    () => {
        const surface: Record<keyof EnqueueModelCallDeps, true> = {
            logger: true,
            netlifyQueueUrl: true,
            netlifyApiKey: true,
            apiKeyForProvider: true,
        };
        assertEquals(Object.keys(surface).length, 4);
    },
);

Deno.test(
    "Contract: EnqueueModelCallParams declares five fields",
    () => {
        const surface: Record<keyof EnqueueModelCallParams, true> = {
            dbClient: true,
            job: true,
            providerRow: true,
            userAuthToken: true,
            output_type: true,
        };
        assertEquals(Object.keys(surface).length, 5);
    },
);

Deno.test(
    "Contract: EnqueueModelCallPayload chatApiRequest and preflightInputTokens",
    () => {
        const payload: EnqueueModelCallPayload = {
            chatApiRequest: {
                message: "m",
                providerId: "00000000-0000-0000-0000-000000000001",
                promptId: "__none__",
            },
            preflightInputTokens: 50,
        };
        assertEquals(typeof payload.preflightInputTokens, "number");
        assertEquals(typeof payload.chatApiRequest.message, "string");
    },
);

Deno.test(
    "Contract: EnqueueModelCallSuccessReturn queued true",
    () => {
        const r: EnqueueModelCallSuccessReturn = { queued: true };
        assertEquals(r.queued, true);
    },
);

Deno.test(
    "Contract: EnqueueModelCallErrorReturn has Error and retriable boolean",
    () => {
        const err: EnqueueModelCallErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        assertEquals(err.error instanceof Error, true);
        assertEquals(typeof err.retriable, "boolean");
    },
);

Deno.test(
    "Contract: AiStreamEventData declares five fields",
    () => {
        const surface: Record<keyof AiStreamEventData, true> = {
            job_id: true,
            api_identifier: true,
            model_config: true,
            chat_api_request: true,
            user_jwt: true,
        };
        assertEquals(Object.keys(surface).length, 5);
    },
);

Deno.test(
    "Contract: AiStreamEventBody declares eventName and data",
    () => {
        const surface: Record<keyof AiStreamEventBody, true> = {
            eventName: true,
            data: true,
        };
        assertEquals(Object.keys(surface).length, 2);
    },
);

Deno.test(
    "Contract: BoundEnqueueModelCallFn signature",
    () => {
        const bound: BoundEnqueueModelCallFn = async (
            _params: EnqueueModelCallParams,
            _payload: EnqueueModelCallPayload,
        ): Promise<EnqueueModelCallReturn> => {
            const ok: EnqueueModelCallSuccessReturn = { queued: true };
            return ok;
        };
        assertEquals(typeof bound, "function");
    },
);
