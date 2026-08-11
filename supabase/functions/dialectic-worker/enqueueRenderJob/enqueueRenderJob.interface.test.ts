import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import {
  RenderJobEnqueueError,
  RenderJobValidationError,
} from "../../_shared/utils/errors.ts";
import { TemplateResolutionError } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import type {
  BoundEnqueueRenderJobFn,
  DialecticRenderCompressedContextJobPayload,
  EnqueueRenderCompressedContextPayload,
  EnqueueRenderJobCallPayload,
  EnqueueRenderJobDeps,
  EnqueueRenderJobErrorReturn,
  EnqueueRenderJobFn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobReturn,
  EnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.interface.ts";
import type { DialecticBaseJobPayload } from "../../dialectic-service/dialectic.interface.ts";

Deno.test("EnqueueRenderJobDeps declares the expected dependency keys", () => {
  const surface: Record<keyof EnqueueRenderJobDeps, true> = {
    dbClient: true,
    logger: true,
    shouldEnqueueRenderJob: true,
    resolveTemplateFilename: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

Deno.test(
  "EnqueueRenderJobParams declares all job context fields",
  async (t) => {
    await t.step("surface keys", () => {
      const surface: Record<keyof EnqueueRenderJobParams, true> = {
        jobId: true,
        sessionId: true,
        stageSlug: true,
        iterationNumber: true,
        outputType: true,
        projectId: true,
        projectOwnerUserId: true,
        userAuthToken: true,
        modelId: true,
        walletId: true,
        isTestJob: true,
      };
      assertEquals(Object.keys(surface).length, 11);
    });

    await t.step("literal type-checks", () => {
      const params: EnqueueRenderJobParams = {
        jobId: "job-1",
        sessionId: "session-1",
        stageSlug: DialecticStageSlug.Thesis,
        iterationNumber: 1,
        outputType: FileType.business_case,
        projectId: "project-1",
        projectOwnerUserId: "owner-1",
        userAuthToken: "jwt-token",
        modelId: "model-1",
        walletId: "wallet-1",
        isTestJob: false,
      };
      assertEquals(typeof params.jobId, "string");
      assertEquals(typeof params.iterationNumber, "number");
      assertEquals(typeof params.isTestJob, "boolean");
    });
  },
);

Deno.test(
  "EnqueueRenderJobPayload literal type-checks with optional fields",
  async (t) => {
    await t.step("all keys present", () => {
      const payload: EnqueueRenderJobPayload = {
        contributionId: "contrib-1",
        needsContinuation: false,
        documentKey: FileType.business_case,
        stageRelationshipForStage: "rel-1",
        fileType: FileType.business_case,
        storageFileType: FileType.ModelContributionRawJson,
      };

      assertEquals("contributionId" in payload, true);
      assertEquals("needsContinuation" in payload, true);
      assertEquals("documentKey" in payload, true);
      assertEquals("stageRelationshipForStage" in payload, true);
      assertEquals("fileType" in payload, true);
      assertEquals("storageFileType" in payload, true);
    });

    await t.step("optional fields may be undefined", () => {
      const payload: EnqueueRenderJobPayload = {
        contributionId: "contrib-2",
        needsContinuation: true,
        documentKey: undefined,
        stageRelationshipForStage: undefined,
        fileType: FileType.HeaderContext,
        storageFileType: FileType.ModelContributionRawJson,
      };
      assertEquals(payload.documentKey, undefined);
      assertEquals(payload.stageRelationshipForStage, undefined);
    });
  },
);

Deno.test(
  "EnqueueRenderJobSuccessReturn and ErrorReturn form a union",
  () => {
    const success: EnqueueRenderJobSuccessReturn = { renderJobId: "render-job-1" };
    const skipped: EnqueueRenderJobSuccessReturn = { renderJobId: null };
    const validationError: EnqueueRenderJobErrorReturn = {
      error: new RenderJobValidationError("validation failed"),
      retriable: false,
    };
    const enqueueError: EnqueueRenderJobErrorReturn = {
      error: new RenderJobEnqueueError("enqueue failed"),
      retriable: true,
    };
    const templateResolutionError: EnqueueRenderJobErrorReturn = {
      error: new TemplateResolutionError("template missing"),
      retriable: false,
    };

    const result1: EnqueueRenderJobReturn = success;
    const result2: EnqueueRenderJobReturn = skipped;
    const result3: EnqueueRenderJobReturn = validationError;
    const result4: EnqueueRenderJobReturn = enqueueError;
    const result5: EnqueueRenderJobReturn = templateResolutionError;

    assertEquals("renderJobId" in result1, true);
    assertEquals("renderJobId" in result2, true);
    assertEquals("error" in result3, true);
    assertEquals("retriable" in result3, true);
    assertEquals("error" in result4, true);
    assertEquals("error" in result5, true);
    assertEquals("retriable" in result5, true);
    assertEquals("error" in success, false);
    assertEquals("renderJobId" in validationError, false);
    assertEquals("renderJobId" in templateResolutionError, false);
  },
);

Deno.test("EnqueueRenderJobFn and BoundEnqueueRenderJobFn signatures", () => {
  const fn: EnqueueRenderJobFn = async () => ({ renderJobId: "render-job-1" });
  const bound: BoundEnqueueRenderJobFn = async () => ({ renderJobId: "render-job-1" });

  assertEquals(typeof fn, "function");
  assertEquals(typeof bound, "function");
});

Deno.test(
  "EnqueueRenderCompressedContextPayload declares all five keys",
  () => {
    const surface: Record<keyof EnqueueRenderCompressedContextPayload, true> = {
      sourceType: true,
      documentKey: true,
      docType: true,
      sourceStageSlug: true,
      targetKey: true,
    };
    assertEquals(Object.keys(surface).length, 5);
  },
);

/** Contract: DialecticRenderCompressedContextJobPayload declares targetKey, sourceType, documentKey and template_filename. */
Deno.test(
  "DialecticRenderCompressedContextJobPayload declares its four own members by typed literal",
  () => {
    const payload: DialecticRenderCompressedContextJobPayload = {
      idempotencyKey: "idem-1",
      projectId: "project-1",
      sessionId: "session-1",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      model_id: "model-1",
      walletId: "wallet-1",
      user_jwt: "jwt-1",
      targetKey: FileType.technical_approach,
      sourceType: "contribution",
      documentKey: FileType.business_case,
      template_filename: "template.md",
    };
    assertEquals(payload.targetKey, FileType.technical_approach);
    assertEquals(payload.sourceType, "contribution");
    assertEquals(payload.documentKey, FileType.business_case);
    assertEquals(payload.template_filename, "template.md");
  },
);

/** Contract: DialecticRenderCompressedContextJobPayload is assignable to DialecticBaseJobPayload. */
Deno.test(
  "DialecticRenderCompressedContextJobPayload is a member of DialecticBaseJobPayload",
  () => {
    const payload: DialecticRenderCompressedContextJobPayload = {
      idempotencyKey: "idem-1",
      projectId: "project-1",
      sessionId: "session-1",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      model_id: "model-1",
      walletId: "wallet-1",
      user_jwt: "jwt-1",
      targetKey: FileType.technical_approach,
      sourceType: "contribution",
      documentKey: FileType.business_case,
      template_filename: "template.md",
    };
    const base: DialecticBaseJobPayload = payload;
    assertEquals(base, payload);
  },
);

/** Contract: stageSlug and iterationNumber are required on DialecticRenderCompressedContextJobPayload where DialecticBaseJobPayload declares them optional, and idempotencyKey, projectId, sessionId, user_jwt, model_id and walletId remain required through inheritance. */
Deno.test(
  "DialecticRenderCompressedContextJobPayload narrows stageSlug and iterationNumber to required and keeps the six inherited members required",
  () => {
    const base: DialecticBaseJobPayload = {
      sessionId: "session-1",
      projectId: "project-1",
      walletId: "wallet-1",
      user_jwt: "jwt-1",
      idempotencyKey: "idem-1",
      model_id: "model-1",
    };
    assertEquals(base.stageSlug, undefined);
    assertEquals(base.iterationNumber, undefined);

    const payload: DialecticRenderCompressedContextJobPayload = {
      idempotencyKey: "idem-1",
      projectId: "project-1",
      sessionId: "session-1",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      model_id: "model-1",
      walletId: "wallet-1",
      user_jwt: "jwt-1",
      targetKey: FileType.technical_approach,
      sourceType: "contribution",
      documentKey: FileType.business_case,
      template_filename: "template.md",
    };
    assertEquals(payload.stageSlug, DialecticStageSlug.Thesis);
    assertEquals(payload.iterationNumber, 1);
    assertEquals(payload.idempotencyKey, "idem-1");
    assertEquals(payload.projectId, "project-1");
    assertEquals(payload.sessionId, "session-1");
    assertEquals(payload.user_jwt, "jwt-1");
    assertEquals(payload.model_id, "model-1");
    assertEquals(payload.walletId, "wallet-1");
  },
);

/** Contract: EnqueueRenderJobCallPayload is the declared payload parameter of EnqueueRenderJobFn and BoundEnqueueRenderJobFn, and each member assigns to it. */
Deno.test(
  "EnqueueRenderJobCallPayload is the declared payload parameter of both function types",
  () => {
    const contribution: EnqueueRenderJobPayload = {
      contributionId: "contrib-1",
      needsContinuation: false,
      documentKey: FileType.business_case,
      stageRelationshipForStage: "rel-1",
      fileType: FileType.business_case,
      storageFileType: FileType.ModelContributionRawJson,
    };
    const compressed: EnqueueRenderCompressedContextPayload = {
      sourceType: "contribution",
      documentKey: FileType.business_case,
      docType: FileType.business_case,
      sourceStageSlug: DialecticStageSlug.Thesis,
      targetKey: FileType.technical_approach,
    };

    const callPayload: EnqueueRenderJobCallPayload = contribution;

    const fnParam: Parameters<EnqueueRenderJobFn>[2] = callPayload;
    const boundParam: Parameters<BoundEnqueueRenderJobFn>[1] = callPayload;

    assertEquals(fnParam, callPayload);
    assertEquals(boundParam, callPayload);

    const fnFromContribution: Parameters<EnqueueRenderJobFn>[2] = contribution;
    const fnFromCompressed: Parameters<EnqueueRenderJobFn>[2] = compressed;
    const boundFromContribution: Parameters<BoundEnqueueRenderJobFn>[1] = contribution;
    const boundFromCompressed: Parameters<BoundEnqueueRenderJobFn>[1] = compressed;

    assertEquals(fnFromContribution, contribution);
    assertEquals(fnFromCompressed, compressed);
    assertEquals(boundFromContribution, contribution);
    assertEquals(boundFromCompressed, compressed);
  },
);
