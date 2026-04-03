import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { logger } from "../../_shared/logger.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import type { ShouldEnqueueRenderJobResult } from "../../_shared/types/shouldEnqueueRenderJob.interface.ts";
import { RenderJobEnqueueError, RenderJobValidationError } from "../../_shared/utils/errors.ts";
import type {
  EnqueueRenderJobDeps,
  EnqueueRenderJobErrorReturn,
  EnqueueRenderJobFn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.interface.ts";

Deno.test(
  "Contract: EnqueueRenderJobDeps accepts dbClient, logger, shouldEnqueueRenderJob",
  () => {
    const mockSetup = createMockSupabaseClient(undefined, {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const shouldEnqueueRenderJob = async (
      _deps: unknown,
      _params: unknown,
    ): Promise<ShouldEnqueueRenderJobResult> => ({
      shouldRender: false,
      reason: "is_json",
    });

    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger,
      shouldEnqueueRenderJob,
    };

    assertEquals(typeof deps.dbClient.from, "function");
    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.shouldEnqueueRenderJob, "function");
  },
);

Deno.test(
  "Contract: EnqueueRenderJobParams accepts all job context fields",
  async (t) => {
    await t.step("all keys present with typed values", () => {
      const params: EnqueueRenderJobParams = {
        jobId: "exec-job-1",
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

      assertEquals("jobId" in params, true);
      assertEquals("sessionId" in params, true);
      assertEquals("stageSlug" in params, true);
      assertEquals("iterationNumber" in params, true);
      assertEquals("outputType" in params, true);
      assertEquals("projectId" in params, true);
      assertEquals("projectOwnerUserId" in params, true);
      assertEquals("userAuthToken" in params, true);
      assertEquals("modelId" in params, true);
      assertEquals("walletId" in params, true);
      assertEquals("isTestJob" in params, true);
      assertEquals(typeof params.jobId, "string");
      assertEquals(typeof params.iterationNumber, "number");
      assertEquals(typeof params.isTestJob, "boolean");
    });
  },
);

Deno.test(
  "Contract: EnqueueRenderJobPayload accepts all contribution-derived fields",
  async (t) => {
    await t.step("all keys present; optional fields may be undefined", () => {
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

    await t.step("documentKey and stageRelationshipForStage may be undefined", () => {
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
  "Contract: EnqueueRenderJobSuccessReturn accepts renderJobId string or null",
  () => {
    const withId: EnqueueRenderJobSuccessReturn = { renderJobId: "render-job-1" };
    const skipped: EnqueueRenderJobSuccessReturn = { renderJobId: null };

    assertEquals(withId.renderJobId, "render-job-1");
    assertEquals(skipped.renderJobId, null);
    assertEquals("renderJobId" in withId, true);
    assertEquals("renderJobId" in skipped, true);
  },
);

Deno.test(
  "Contract: EnqueueRenderJobErrorReturn accepts error and retriable",
  () => {
    const validationErr: EnqueueRenderJobErrorReturn = {
      error: new RenderJobValidationError("validation failed"),
      retriable: false,
    };
    const enqueueErr: EnqueueRenderJobErrorReturn = {
      error: new RenderJobEnqueueError("enqueue failed"),
      retriable: true,
    };

    assertEquals(validationErr.error instanceof RenderJobValidationError, true);
    assertEquals(validationErr.retriable, false);
    assertEquals(enqueueErr.error instanceof RenderJobEnqueueError, true);
    assertEquals(enqueueErr.retriable, true);
    assertEquals("error" in validationErr, true);
    assertEquals("retriable" in validationErr, true);
  },
);

Deno.test(
  "Contract: EnqueueRenderJobFn matches (deps, params, payload) => Promise<EnqueueRenderJobReturn>",
  async () => {
    const mockSetup = createMockSupabaseClient(undefined, {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const shouldEnqueueRenderJob = async (): Promise<ShouldEnqueueRenderJobResult> => ({
      shouldRender: false,
      reason: "is_json",
    });

    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger,
      shouldEnqueueRenderJob,
    };

    const params: EnqueueRenderJobParams = {
      jobId: "exec-job-fn",
      sessionId: "session-fn",
      stageSlug: DialecticStageSlug.Thesis,
      iterationNumber: 1,
      outputType: FileType.business_case,
      projectId: "project-fn",
      projectOwnerUserId: "owner-fn",
      userAuthToken: "jwt-fn",
      modelId: "model-fn",
      walletId: "wallet-fn",
      isTestJob: false,
    };

    const payload: EnqueueRenderJobPayload = {
      contributionId: "contrib-fn",
      needsContinuation: false,
      documentKey: FileType.business_case,
      stageRelationshipForStage: "stage-rel-fn",
      fileType: FileType.business_case,
      storageFileType: FileType.ModelContributionRawJson,
    };

    const fn: EnqueueRenderJobFn = async () => ({ renderJobId: null });
    const result = await fn(deps, params, payload);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test(
  "compile-time: missing required fields are rejected by the type checker",
  () => {
    // @ts-expect-error jobId is required on EnqueueRenderJobParams
    const _missingJobId: EnqueueRenderJobParams = {
      sessionId: "s",
      stageSlug: DialecticStageSlug.Thesis,
      iterationNumber: 1,
      outputType: FileType.business_case,
      projectId: "p",
      projectOwnerUserId: "u",
      userAuthToken: "jwt",
      modelId: "m",
      walletId: "w",
      isTestJob: false,
    };
    void _missingJobId;

    // @ts-expect-error dbClient is required on EnqueueRenderJobDeps
    const _missingDb: EnqueueRenderJobDeps = {
      logger,
      shouldEnqueueRenderJob: async () => ({
        shouldRender: false,
        reason: "is_json",
      }),
    };
    void _missingDb;

    // @ts-expect-error contributionId is required on EnqueueRenderJobPayload
    const _missingContribution: EnqueueRenderJobPayload = {
      needsContinuation: false,
      documentKey: undefined,
      stageRelationshipForStage: undefined,
      fileType: FileType.business_case,
      storageFileType: FileType.ModelContributionRawJson,
    };
    void _missingContribution;
  },
);
