import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    AiStreamEventBody,
    AiStreamEventData,
    BoundEnqueueModelCallFn,
    EnqueueModelCallDeps,
    EnqueueModelCallErrorReturn,
    EnqueueModelCallEventSizeErrorReturn,
    EnqueueModelCallFn,
    EnqueueModelCallJobRowErrorReturn,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallPreparationErrorReturn,
    EnqueueModelCallPreparationFailure,
    EnqueueModelCallQueueFailure,
    EnqueueModelCallQueueRejectedErrorReturn,
    EnqueueModelCallQueueUnreachableErrorReturn,
    EnqueueModelCallReturn,
    EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";

Deno.test(
    "EnqueueModelCallDeps declares five dependency keys",
    () => {
        const surface: Record<keyof EnqueueModelCallDeps, true> = {
            logger: true,
            netlifyQueueUrl: true,
            netlifyApiKey: true,
            apiKeyForProvider: true,
            computeJobSig: true,
        };
        assertEquals(Object.keys(surface).length, 5);
    },
);

Deno.test(
    "EnqueueModelCallParams declares dbClient only",
    () => {
        const surface: Record<keyof EnqueueModelCallParams, true> = {
            dbClient: true,
        };
        assertEquals(surface.dbClient, true);
    },
);

Deno.test(
    "EnqueueModelCallPayload declares job, providerRow, userConfig, chatApiRequest and preflightInputTokens",
    () => {
        const surface: Record<keyof EnqueueModelCallPayload, true> = {
            job: true,
            providerRow: true,
            userConfig: true,
            chatApiRequest: true,
            preflightInputTokens: true,
        };
        assertEquals(surface.job, true);
        assertEquals(surface.providerRow, true);
        assertEquals(surface.userConfig, true);
        assertEquals(surface.chatApiRequest, true);
        assertEquals(surface.preflightInputTokens, true);
    },
);

Deno.test(
    "EnqueueModelCallSuccessReturn queued true",
    () => {
        const surface: Record<keyof EnqueueModelCallSuccessReturn, true> = {
            queued: true,
            jobId: true,
            sig: true,
            preflightInputTokens: true,
            eventBodyBytes: true,
            queueStatus: true,
        };
        assertEquals(surface.queued, true);
        assertEquals(surface.jobId, true);
        assertEquals(surface.sig, true);
        assertEquals(surface.preflightInputTokens, true);
        assertEquals(surface.eventBodyBytes, true);
        assertEquals(surface.queueStatus, true);
    },
);

Deno.test(
    "EnqueueModelCallPreparationErrorReturn declares failure, error and retriable",
    () => {
        const surface: Record<keyof EnqueueModelCallPreparationErrorReturn, true> = {
            failure: true,
            error: true,
            retriable: true,
        };
        assertEquals(surface.failure, true);
        assertEquals(surface.error, true);
        assertEquals(surface.retriable, true);
    },
);

Deno.test(
    "EnqueueModelCallJobRowErrorReturn declares failure, error and retriable",
    () => {
        const surface: Record<keyof EnqueueModelCallJobRowErrorReturn, true> = {
            failure: true,
            error: true,
            retriable: true,
        };
        assertEquals(surface.failure, true);
        assertEquals(surface.error, true);
        assertEquals(surface.retriable, true);
    },
);

Deno.test(
    "EnqueueModelCallEventSizeErrorReturn declares failure, error, retriable, eventBodyBytes and limitBytes",
    () => {
        const surface: Record<keyof EnqueueModelCallEventSizeErrorReturn, true> = {
            failure: true,
            error: true,
            retriable: true,
            eventBodyBytes: true,
            limitBytes: true,
        };
        assertEquals(surface.failure, true);
        assertEquals(surface.error, true);
        assertEquals(surface.retriable, true);
        assertEquals(surface.eventBodyBytes, true);
        assertEquals(surface.limitBytes, true);
    },
);

Deno.test(
    "EnqueueModelCallQueueRejectedErrorReturn declares failure, error, retriable and queueStatus",
    () => {
        const surface: Record<keyof EnqueueModelCallQueueRejectedErrorReturn, true> = {
            failure: true,
            error: true,
            retriable: true,
            queueStatus: true,
        };
        assertEquals(surface.failure, true);
        assertEquals(surface.error, true);
        assertEquals(surface.retriable, true);
        assertEquals(surface.queueStatus, true);
    },
);

Deno.test(
    "EnqueueModelCallQueueUnreachableErrorReturn declares failure, error and retriable",
    () => {
        const surface: Record<keyof EnqueueModelCallQueueUnreachableErrorReturn, true> = {
            failure: true,
            error: true,
            retriable: true,
        };
        assertEquals(surface.failure, true);
        assertEquals(surface.error, true);
        assertEquals(surface.retriable, true);
    },
);

Deno.test(
    "EnqueueModelCallPreparationErrorReturn is a member of EnqueueModelCallErrorReturn and EnqueueModelCallReturn",
    () => {
        const flavor: EnqueueModelCallPreparationErrorReturn = {
            failure: "provider_config_invalid",
            error: new Error("x"),
            retriable: false,
        };
        const errorArm: EnqueueModelCallErrorReturn = flavor;
        const result: EnqueueModelCallReturn = errorArm;
        assertEquals(result === flavor, true);
    },
);

Deno.test(
    "EnqueueModelCallJobRowErrorReturn is a member of EnqueueModelCallErrorReturn and EnqueueModelCallReturn",
    () => {
        const flavor: EnqueueModelCallJobRowErrorReturn = {
            failure: "job_row_update_failed",
            error: new Error("x"),
            retriable: true,
        };
        const errorArm: EnqueueModelCallErrorReturn = flavor;
        const result: EnqueueModelCallReturn = errorArm;
        assertEquals(result === flavor, true);
    },
);

Deno.test(
    "EnqueueModelCallEventSizeErrorReturn is a member of EnqueueModelCallErrorReturn and EnqueueModelCallReturn",
    () => {
        const flavor: EnqueueModelCallEventSizeErrorReturn = {
            failure: "event_body_too_large",
            error: new Error("x"),
            retriable: false,
            eventBodyBytes: 600000,
            limitBytes: 512000,
        };
        const errorArm: EnqueueModelCallErrorReturn = flavor;
        const result: EnqueueModelCallReturn = errorArm;
        assertEquals(result === flavor, true);
    },
);

Deno.test(
    "EnqueueModelCallQueueRejectedErrorReturn is a member of EnqueueModelCallErrorReturn and EnqueueModelCallReturn",
    () => {
        const flavor: EnqueueModelCallQueueRejectedErrorReturn = {
            failure: "queue_rejected",
            error: new Error("x"),
            retriable: true,
            queueStatus: 503,
        };
        const errorArm: EnqueueModelCallErrorReturn = flavor;
        const result: EnqueueModelCallReturn = errorArm;
        assertEquals(result === flavor, true);
    },
);

Deno.test(
    "EnqueueModelCallQueueUnreachableErrorReturn is a member of EnqueueModelCallErrorReturn and EnqueueModelCallReturn",
    () => {
        const flavor: EnqueueModelCallQueueUnreachableErrorReturn = {
            failure: "queue_unreachable",
            error: new Error("x"),
            retriable: true,
        };
        const errorArm: EnqueueModelCallErrorReturn = flavor;
        const result: EnqueueModelCallReturn = errorArm;
        assertEquals(result === flavor, true);
    },
);

Deno.test(
    "EnqueueModelCallSuccessReturn is a member of EnqueueModelCallReturn",
    () => {
        const success: EnqueueModelCallSuccessReturn = {
            queued: true,
            jobId: "job-1",
            sig: "sig-1",
            preflightInputTokens: 0,
            eventBodyBytes: 0,
            queueStatus: 200,
        };
        const result: EnqueueModelCallReturn = success;
        assertEquals(result === success, true);
    },
);

Deno.test(
    "EnqueueModelCallPreparationFailure admits its six string literals",
    () => {
        const f1: EnqueueModelCallPreparationFailure = "provider_config_invalid";
        const f2: EnqueueModelCallPreparationFailure = "api_key_missing";
        const f3: EnqueueModelCallPreparationFailure = "job_user_id_missing";
        const f4: EnqueueModelCallPreparationFailure = "job_signature_failed";
        const f5: EnqueueModelCallPreparationFailure = "job_payload_invalid";
        const f6: EnqueueModelCallPreparationFailure = "composed_payload_not_json";
        assertEquals(f1, "provider_config_invalid");
        assertEquals(f2, "api_key_missing");
        assertEquals(f3, "job_user_id_missing");
        assertEquals(f4, "job_signature_failed");
        assertEquals(f5, "job_payload_invalid");
        assertEquals(f6, "composed_payload_not_json");
    },
);

Deno.test(
    "EnqueueModelCallQueueFailure admits its two string literals",
    () => {
        const f1: EnqueueModelCallQueueFailure = "queue_rejected";
        const f2: EnqueueModelCallQueueFailure = "queue_unreachable";
        assertEquals(f1, "queue_rejected");
        assertEquals(f2, "queue_unreachable");
    },
);

Deno.test(
    "AiStreamEventData declares six fields including sig not user_jwt",
    () => {
        const surface: Record<keyof AiStreamEventData, true> = {
            job_id: true,
            api_identifier: true,
            model_config: true,
            chat_api_request: true,
            sig: true,
            user_config: true,
        };
        assertEquals(Object.keys(surface).length, 6);
    },
);

Deno.test(
    "AiStreamEventBody declares eventName and data",
    () => {
        const surface: Record<keyof AiStreamEventBody, true> = {
            eventName: true,
            data: true,
        };
        assertEquals(Object.keys(surface).length, 2);
    },
);

Deno.test(
    "BoundEnqueueModelCallFn signature",
    () => {
        const bound: BoundEnqueueModelCallFn = async (
            _params: EnqueueModelCallParams,
            _payload: EnqueueModelCallPayload,
        ): Promise<EnqueueModelCallReturn> => {
            const ok: EnqueueModelCallSuccessReturn = {
                queued: true,
                jobId: "job-1",
                sig: "sig-1",
                preflightInputTokens: 0,
                eventBodyBytes: 0,
                queueStatus: 200,
            };
            return ok;
        };
        assertEquals(typeof bound, "function");
    },
);

Deno.test(
    "EnqueueModelCallFn resolves to its declared return union",
    () => {
        const success: EnqueueModelCallSuccessReturn = {
            queued: true,
            jobId: "job-1",
            sig: "sig-1",
            preflightInputTokens: 0,
            eventBodyBytes: 0,
            queueStatus: 200,
        };
        const returned: ReturnType<EnqueueModelCallFn> = Promise.resolve(success);
        const declared: Promise<EnqueueModelCallReturn> = returned;
        assert(declared instanceof Promise);
    },
);

Deno.test(
    "EnqueueModelCallDeps computeJobSig is typed as a function",
    () => {
        const fn: EnqueueModelCallDeps["computeJobSig"] = async (
            _jobId: string,
            _userId: string,
            _createdAt: string,
        ): Promise<string> => "sig";
        assertEquals(typeof fn, "function");
    },
);

Deno.test(
    "EnqueueModelCallDeps invalid - missing computeJobSig",
    () => {
        const required: (keyof EnqueueModelCallDeps)[] = [
            "logger",
            "netlifyQueueUrl",
            "netlifyApiKey",
            "apiKeyForProvider",
            "computeJobSig",
        ];
        assertEquals(required.includes("computeJobSig"), true);
        assertEquals(required.length, 5);
    },
);

Deno.test(
    "AiStreamEventData valid - has sig field and no user_jwt field",
    () => {
        const surface: Record<keyof AiStreamEventData, true> = {
            job_id: true,
            api_identifier: true,
            model_config: true,
            chat_api_request: true,
            sig: true,
            user_config: true,
        };
        assertEquals("sig" in surface, true);
        assertEquals("user_jwt" in surface, false);
    },
);

Deno.test(
    "EnqueueModelCallPayload userConfig is UserConfig object shape",
    () => {
        const uc: EnqueueModelCallPayload["userConfig"] = {
            tier_output_cap_tokens: null,
        };
        const uc2: EnqueueModelCallPayload["userConfig"] = {
            tier_output_cap_tokens: 32768,
        };
        assertEquals(uc.tier_output_cap_tokens, null);
        assertEquals(uc2.tier_output_cap_tokens, 32768);
    },
);

Deno.test(
    "AiStreamEventData user_config is UserConfig object shape",
    () => {
        const uc: AiStreamEventData["user_config"] = {
            tier_output_cap_tokens: null,
        };
        const uc2: AiStreamEventData["user_config"] = {
            tier_output_cap_tokens: 32768,
        };
        assertEquals(uc.tier_output_cap_tokens, null);
        assertEquals(uc2.tier_output_cap_tokens, 32768);
    },
);

Deno.test(
    "userConfig and user_config accept tier_output_cap_tokens null",
    () => {
        const payloadUserConfig: EnqueueModelCallPayload["userConfig"] = {
            tier_output_cap_tokens: null,
        };
        const eventUserConfig: AiStreamEventData["user_config"] = {
            tier_output_cap_tokens: null,
        };
        assertEquals(payloadUserConfig.tier_output_cap_tokens, null);
        assertEquals(eventUserConfig.tier_output_cap_tokens, null);
    },
);
