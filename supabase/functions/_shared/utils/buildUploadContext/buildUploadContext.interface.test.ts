import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CanonicalPathParams } from "../../types/file_manager.types.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type { BuildUploadContextParams } from "./buildUploadContext.interface.ts";

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
