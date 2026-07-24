import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CanonicalPathParams } from "../../types/file_manager.types.ts";
import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import type { BuildUploadContextParams, BuildUploadContextResourceParams } from "./buildUploadContext.interface.ts";
import type { BuildUploadContextFn } from "../../../dialectic-worker/createJobContext/JobContext.interface.ts";

Deno.test(
  "Contract: BuildUploadContextParams requires all fields as specified",
  async (t) => {
    const restOfCanonicalPathParams: Omit<CanonicalPathParams, "contributionType"> = {
      stageSlug: "thesis",
    };

    await t.step("all keys present with typed values", () => {
      const params: BuildUploadContextParams = {
        projectId: "proj-1",
        storageFileType: FileType.ModelContributionRawJson,
        sessionId: "sess-1",
        iterationNumber: 1,
        modelSlug: "gpt-4",
        attemptCount: 0,
        restOfCanonicalPathParams,
        documentKey: "business_case",
        contributionType: "thesis",
        isContinuationForStorage: false,
        continuationCount: 1,
        sourceGroupFragment: "abcd1234",
        contentForStorage: "{}",
        projectOwnerUserId: "owner-1",
        description: "model_contribution_raw_json for stage 'thesis' by model Test",
        providerDetails: { id: "prov-1", name: "Test" },
        aiResponse: { inputTokens: 1, outputTokens: 2, processingTimeMs: 3 },
        sourcePromptResourceId: "spr-1",
        targetContributionId: "tc-1",
        documentRelationships: { k: "v" },
        isIntermediate: false,
      };

      assertEquals("projectId" in params, true);
      assertEquals("storageFileType" in params, true);
      assertEquals("sessionId" in params, true);
      assertEquals("iterationNumber" in params, true);
      assertEquals("modelSlug" in params, true);
      assertEquals("attemptCount" in params, true);
      assertEquals("restOfCanonicalPathParams" in params, true);
      assertEquals("documentKey" in params, true);
      assertEquals("contributionType" in params, true);
      assertEquals("isContinuationForStorage" in params, true);
      assertEquals("continuationCount" in params, true);
      assertEquals("sourceGroupFragment" in params, true);
      assertEquals("contentForStorage" in params, true);
      assertEquals("projectOwnerUserId" in params, true);
      assertEquals("description" in params, true);
      assertEquals("providerDetails" in params, true);
      assertEquals("aiResponse" in params, true);
      assertEquals("sourcePromptResourceId" in params, true);
      assertEquals("targetContributionId" in params, true);
      assertEquals("documentRelationships" in params, true);
      assertEquals("isIntermediate" in params, true);

      assertEquals(typeof params.projectId, "string");
      assertEquals(typeof params.sessionId, "string");
      assertEquals(typeof params.iterationNumber, "number");
      assertEquals(typeof params.modelSlug, "string");
      assertEquals(typeof params.attemptCount, "number");
      assertEquals(typeof params.restOfCanonicalPathParams, "object");
      assertEquals(typeof params.documentKey, "string");
      assertEquals(typeof params.isContinuationForStorage, "boolean");
      assertEquals(typeof params.contentForStorage, "string");
      assertEquals(typeof params.projectOwnerUserId, "string");
      assertEquals(typeof params.description, "string");
      assertEquals(typeof params.providerDetails, "object");
      assertEquals(typeof params.aiResponse, "object");
      assertEquals(typeof params.isIntermediate, "boolean");
    });

    await t.step(
      "optional undefined fields and null documentRelationships are accepted",
      () => {
        const params: BuildUploadContextParams = {
          projectId: "proj-1",
          storageFileType: FileType.ModelContributionRawJson,
          sessionId: "sess-1",
          iterationNumber: 1,
          modelSlug: "gpt-4",
          attemptCount: 0,
          restOfCanonicalPathParams,
          documentKey: "business_case",
          contributionType: undefined,
          isContinuationForStorage: false,
          continuationCount: undefined,
          sourceGroupFragment: undefined,
          contentForStorage: "{}",
          projectOwnerUserId: "owner-1",
          description: "desc",
          providerDetails: { id: "prov-1", name: "Test" },
          aiResponse: {},
          sourcePromptResourceId: undefined,
          targetContributionId: undefined,
          documentRelationships: null,
          isIntermediate: false,
        };
        assertEquals(params.contributionType, undefined);
        assertEquals(params.continuationCount, undefined);
        assertEquals(params.sourceGroupFragment, undefined);
        assertEquals(params.sourcePromptResourceId, undefined);
        assertEquals(params.targetContributionId, undefined);
        assertEquals(params.documentRelationships, null);
      },
    );
  },
);

Deno.test(
  "Contract: BuildUploadContextResourceParams requires all fields as specified",
  async (t) => {
    await t.step("all keys present with typed values", () => {
      const params: BuildUploadContextResourceParams = {
        projectId: "proj-1",
        storageFileType: FileType.CompressedContextRawJson,
        sessionId: "sess-1",
        iterationNumber: 1,
        stageSlug: DialecticStageSlug.Thesis,
        targetKey: FileType.business_case,
        sourceType: "contribution",
        documentKey: FileType.feature_spec,
        sourceId: undefined,
        chunkIndex: 1,
        chunkTotal: 2,
        contentForStorage: '{"compressed":true}',
        projectOwnerUserId: "owner-1",
        description: "compressed_context_raw_json for stage 'thesis' target 'business_case'",
      };

      assertEquals("projectId" in params, true);
      assertEquals("storageFileType" in params, true);
      assertEquals("sessionId" in params, true);
      assertEquals("iterationNumber" in params, true);
      assertEquals("stageSlug" in params, true);
      assertEquals("targetKey" in params, true);
      assertEquals("sourceType" in params, true);
      assertEquals("documentKey" in params, true);
      assertEquals("sourceId" in params, true);
      assertEquals("chunkIndex" in params, true);
      assertEquals("chunkTotal" in params, true);
      assertEquals("contentForStorage" in params, true);
      assertEquals("projectOwnerUserId" in params, true);
      assertEquals("description" in params, true);

      assertEquals(typeof params.projectId, "string");
      assertEquals(typeof params.storageFileType, "string");
      assertEquals(typeof params.sessionId, "string");
      assertEquals(typeof params.iterationNumber, "number");
      assertEquals(typeof params.stageSlug, "string");
      assertEquals(typeof params.targetKey, "string");
      assertEquals(typeof params.sourceType, "string");
      assertEquals(typeof params.documentKey, "string");
      assertEquals(params.sourceId, undefined);
      assertEquals(typeof params.chunkIndex, "number");
      assertEquals(typeof params.chunkTotal, "number");
      assertEquals(typeof params.contentForStorage, "string");
      assertEquals(typeof params.projectOwnerUserId, "string");
      assertEquals(typeof params.description, "string");
    });

    await t.step(
      "optional undefined fields are accepted",
      () => {
        const params: BuildUploadContextResourceParams = {
          projectId: "proj-1",
          storageFileType: FileType.CompressedContext,
          sessionId: "sess-1",
          iterationNumber: 1,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          sourceType: "history",
          documentKey: undefined,
          sourceId: "src-1",
          chunkIndex: undefined,
          chunkTotal: undefined,
          contentForStorage: "compressed text content",
          projectOwnerUserId: "owner-1",
          description: "compressed_context for stage 'thesis'",
        };
        assertEquals(params.documentKey, undefined);
        assertEquals(params.chunkIndex, undefined);
        assertEquals(params.chunkTotal, undefined);
      },
    );

    await t.step(
      "single-signature contract: BuildUploadContextResourceParams is assignable to BuildUploadContextFn params",
      () => {
        const resourceParams: BuildUploadContextResourceParams = {
          projectId: "proj-1",
          storageFileType: FileType.CompressedContextRawJson,
          sessionId: "sess-1",
          iterationNumber: 1,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          sourceType: "contribution",
          documentKey: undefined,
          sourceId: undefined,
          chunkIndex: undefined,
          chunkTotal: undefined,
          contentForStorage: "{}",
          projectOwnerUserId: "owner-1",
          description: "desc",
        };
        const fnParams: Parameters<BuildUploadContextFn>[0] = resourceParams;
        assertEquals(fnParams, resourceParams);
      },
    );
  },
);
