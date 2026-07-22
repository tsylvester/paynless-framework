import { assertEquals } from "jsr:@std/assert";
import type {
  AssembleContributionChainErrorReturn,
  AssembleContributionChainParams,
  AssembleContributionChainPayload,
  AssembleContributionChainReturn,
  AssembleContributionChainSuccessReturn,
} from "./assembleContributionChain.interface.ts";
import { DialecticStageSlug } from "../../../types/file_manager.types.ts";

Deno.test(
  "Valid: a payload with non-empty sessionId/stageSlug/documentIdentity and a numeric iterationNumber, plus a params.dbClient, type-checks",
  () => {
    const paramsSurface: Record<keyof AssembleContributionChainParams, true> = {
      dbClient: true,
    };
    assertEquals("dbClient" in paramsSurface, true);
    assertEquals(Object.keys(paramsSurface).length, 1);

    const payload: AssembleContributionChainPayload = {
      sessionId: "session_abc",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      documentIdentity: "root-id-1",
    };

    assertEquals("sessionId" in payload, true);
    assertEquals("iterationNumber" in payload, true);
    assertEquals("stageSlug" in payload, true);
    assertEquals("documentIdentity" in payload, true);
    assertEquals(payload.sessionId, "session_abc");
    assertEquals(payload.iterationNumber, 1);
    assertEquals(payload.stageSlug, "thesis");
    assertEquals(payload.documentIdentity, "root-id-1");
  },
);

Deno.test(
  "AssembleContributionChainSuccessReturn and AssembleContributionChainErrorReturn never co-occur",
  () => {
    const success: AssembleContributionChainSuccessReturn = {
      orderedChunks: [],
      modelSlug: "mock-model",
      attemptCount: 0,
      sourceGroupFragment: undefined,
      sourceAnchorModelSlug: undefined,
    };

    const errorReturn: AssembleContributionChainErrorReturn = {
      error: new Error("test error"),
      retriable: false,
    };

    const result1: AssembleContributionChainReturn = success;
    const result2: AssembleContributionChainReturn = errorReturn;

    assertEquals("orderedChunks" in success, true);
    assertEquals("modelSlug" in success, true);
    assertEquals("attemptCount" in success, true);
    assertEquals("sourceGroupFragment" in success, true);
    assertEquals("sourceAnchorModelSlug" in success, true);
    assertEquals("error" in success, false);
    assertEquals("error" in errorReturn, true);
    assertEquals("retriable" in errorReturn, true);
    assertEquals("orderedChunks" in errorReturn, false);
    assertEquals("orderedChunks" in result1, true);
    assertEquals("error" in result2, true);
  },
);
