// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.guard.test.ts

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TemplateResolutionError } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import { buildDialecticRenderJobPayload } from "../../_shared/dialectic.mock.ts";
import {
  buildDialecticRenderCompressedContextJobPayload,
  buildEnqueueRenderCompressedContextPayload,
  buildEnqueueRenderJobDeps,
  buildEnqueueRenderJobErrorReturn,
  buildEnqueueRenderJobParams,
  buildEnqueueRenderJobPayload,
  buildEnqueueRenderJobSuccessReturn,
  invalidateDialecticRenderCompressedContextJobPayload,
  invalidateEnqueueRenderCompressedContextPayload,
  invalidateEnqueueRenderJobDeps,
  invalidateEnqueueRenderJobErrorReturn,
  invalidateEnqueueRenderJobParams,
  invalidateEnqueueRenderJobPayload,
  invalidateEnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.mock.ts";
import {
  isCompressedRenderPayloadShape,
  isDialecticRenderCompressedContextJobPayload,
  isEnqueueRenderCompressedContextPayload,
  isEnqueueRenderJobDeps,
  isEnqueueRenderJobErrorReturn,
  isEnqueueRenderJobParams,
  isEnqueueRenderJobPayload,
  isEnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.guards.ts";

Deno.test("isEnqueueRenderJobDeps accepts a valid built object", () => {
  assertEquals(isEnqueueRenderJobDeps(buildEnqueueRenderJobDeps()), true);
});

Deno.test("isEnqueueRenderJobDeps accepts a valid override", () => {
  assertEquals(
    isEnqueueRenderJobDeps(
      buildEnqueueRenderJobDeps({
        resolveTemplateFilename: async () => ({ templateFilename: "override.md" }),
      }),
    ),
    true,
  );
});

Deno.test("isEnqueueRenderJobDeps rejects non-records", () => {
  assertEquals(isEnqueueRenderJobDeps(null), false);
  assertEquals(isEnqueueRenderJobDeps(undefined), false);
  assertEquals(isEnqueueRenderJobDeps(42), false);
  assertEquals(isEnqueueRenderJobDeps("string"), false);
  assertEquals(isEnqueueRenderJobDeps([]), false);
});

Deno.test("isEnqueueRenderJobDeps rejects corrupted properties", () => {
  assertEquals(isEnqueueRenderJobDeps(invalidateEnqueueRenderJobDeps({ dbClient: {} })), false);
  assertEquals(isEnqueueRenderJobDeps(invalidateEnqueueRenderJobDeps({ logger: {} })), false);
  assertEquals(
    isEnqueueRenderJobDeps(invalidateEnqueueRenderJobDeps({ shouldEnqueueRenderJob: "not-fn" })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobDeps(invalidateEnqueueRenderJobDeps({ resolveTemplateFilename: "not-fn" })),
    false,
  );
});

Deno.test("isEnqueueRenderJobDeps rejects missing required properties", () => {
  const { dbClient: _omitDb, ...missingDbClient } = buildEnqueueRenderJobDeps();
  assertEquals(isEnqueueRenderJobDeps(missingDbClient), false);

  const { logger: _omitLogger, ...missingLogger } = buildEnqueueRenderJobDeps();
  assertEquals(isEnqueueRenderJobDeps(missingLogger), false);

  const { shouldEnqueueRenderJob: _omitShould, ...missingShould } = buildEnqueueRenderJobDeps();
  assertEquals(isEnqueueRenderJobDeps(missingShould), false);

  const { resolveTemplateFilename: _omitResolve, ...missingResolve } = buildEnqueueRenderJobDeps();
  assertEquals(isEnqueueRenderJobDeps(missingResolve), false);
});

Deno.test("isEnqueueRenderJobParams accepts a valid built object", () => {
  assertEquals(isEnqueueRenderJobParams(buildEnqueueRenderJobParams()), true);
});

Deno.test("isEnqueueRenderJobParams accepts a valid override", () => {
  assertEquals(
    isEnqueueRenderJobParams(buildEnqueueRenderJobParams({ jobId: "override-job" })),
    true,
  );
});

Deno.test("isEnqueueRenderJobParams rejects non-records", () => {
  assertEquals(isEnqueueRenderJobParams(null), false);
  assertEquals(isEnqueueRenderJobParams(undefined), false);
  assertEquals(isEnqueueRenderJobParams(42), false);
  assertEquals(isEnqueueRenderJobParams("string"), false);
  assertEquals(isEnqueueRenderJobParams([]), false);
});

Deno.test("isEnqueueRenderJobParams rejects corrupted properties", () => {
  assertEquals(isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ jobId: null })), false);
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ sessionId: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ stageSlug: "not-a-stage" })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ iterationNumber: -1 })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ outputType: "not-a-type" })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ projectId: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(
      invalidateEnqueueRenderJobParams({ projectOwnerUserId: null }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ userAuthToken: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ modelId: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ walletId: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobParams(invalidateEnqueueRenderJobParams({ isTestJob: null })),
    false,
  );
});

Deno.test("isEnqueueRenderJobParams rejects missing required properties", () => {
  const { jobId: _omitJobId, ...missingJobId } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingJobId), false);

  const { sessionId: _omitSessionId, ...missingSessionId } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingSessionId), false);

  const { stageSlug: _omitStageSlug, ...missingStageSlug } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingStageSlug), false);

  const { iterationNumber: _omitIteration, ...missingIteration } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingIteration), false);

  const { outputType: _omitOutput, ...missingOutput } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingOutput), false);

  const { projectId: _omitProject, ...missingProject } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingProject), false);

  const { projectOwnerUserId: _omitOwner, ...missingOwner } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingOwner), false);

  const { userAuthToken: _omitToken, ...missingToken } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingToken), false);

  const { modelId: _omitModel, ...missingModel } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingModel), false);

  const { walletId: _omitWallet, ...missingWallet } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingWallet), false);

  const { isTestJob: _omitTest, ...missingTest } = buildEnqueueRenderJobParams();
  assertEquals(isEnqueueRenderJobParams(missingTest), false);
});

Deno.test("isEnqueueRenderJobPayload accepts a valid built object", () => {
  assertEquals(isEnqueueRenderJobPayload(buildEnqueueRenderJobPayload()), true);
});

Deno.test("isEnqueueRenderJobPayload accepts valid undefined optional values", () => {
  assertEquals(
    isEnqueueRenderJobPayload(buildEnqueueRenderJobPayload({ documentKey: undefined })),
    true,
  );
  assertEquals(
    isEnqueueRenderJobPayload(
      buildEnqueueRenderJobPayload({ stageRelationshipForStage: undefined }),
    ),
    true,
  );
});

Deno.test("isEnqueueRenderJobPayload rejects non-records", () => {
  assertEquals(isEnqueueRenderJobPayload(null), false);
  assertEquals(isEnqueueRenderJobPayload(undefined), false);
  assertEquals(isEnqueueRenderJobPayload(42), false);
  assertEquals(isEnqueueRenderJobPayload("string"), false);
  assertEquals(isEnqueueRenderJobPayload([]), false);
});

Deno.test("isEnqueueRenderJobPayload rejects corrupted properties", () => {
  assertEquals(
    isEnqueueRenderJobPayload(invalidateEnqueueRenderJobPayload({ contributionId: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobPayload(invalidateEnqueueRenderJobPayload({ needsContinuation: null })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobPayload(invalidateEnqueueRenderJobPayload({ documentKey: 42 })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobPayload(
      invalidateEnqueueRenderJobPayload({ stageRelationshipForStage: 42 }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderJobPayload(invalidateEnqueueRenderJobPayload({ fileType: "not-a-type" })),
    false,
  );
  assertEquals(
    isEnqueueRenderJobPayload(
      invalidateEnqueueRenderJobPayload({ storageFileType: "not-a-type" }),
    ),
    false,
  );
});

Deno.test("isEnqueueRenderJobPayload rejects missing required properties", () => {
  const { contributionId: _omitContrib, ...missingContrib } = buildEnqueueRenderJobPayload();
  assertEquals(isEnqueueRenderJobPayload(missingContrib), false);

  const { needsContinuation: _omitNeeds, ...missingNeeds } = buildEnqueueRenderJobPayload();
  assertEquals(isEnqueueRenderJobPayload(missingNeeds), false);

  const { documentKey: _omitDocKey, ...missingDocKey } = buildEnqueueRenderJobPayload();
  assertEquals(isEnqueueRenderJobPayload(missingDocKey), false);

  const { stageRelationshipForStage: _omitRel, ...missingRel } = buildEnqueueRenderJobPayload();
  assertEquals(isEnqueueRenderJobPayload(missingRel), false);

  const { fileType: _omitFile, ...missingFile } = buildEnqueueRenderJobPayload();
  assertEquals(isEnqueueRenderJobPayload(missingFile), false);

  const { storageFileType: _omitStorage, ...missingStorage } = buildEnqueueRenderJobPayload();
  assertEquals(isEnqueueRenderJobPayload(missingStorage), false);
});

Deno.test("isEnqueueRenderJobSuccessReturn accepts a valid built object", () => {
  assertEquals(isEnqueueRenderJobSuccessReturn(buildEnqueueRenderJobSuccessReturn()), true);
});

Deno.test("isEnqueueRenderJobSuccessReturn accepts a valid null renderJobId", () => {
  assertEquals(
    isEnqueueRenderJobSuccessReturn(buildEnqueueRenderJobSuccessReturn({ renderJobId: null })),
    true,
  );
});

Deno.test("isEnqueueRenderJobSuccessReturn rejects non-records", () => {
  assertEquals(isEnqueueRenderJobSuccessReturn(null), false);
  assertEquals(isEnqueueRenderJobSuccessReturn(undefined), false);
  assertEquals(isEnqueueRenderJobSuccessReturn(42), false);
  assertEquals(isEnqueueRenderJobSuccessReturn("string"), false);
  assertEquals(isEnqueueRenderJobSuccessReturn([]), false);
});

Deno.test("isEnqueueRenderJobSuccessReturn rejects corrupted and missing properties", () => {
  assertEquals(
    isEnqueueRenderJobSuccessReturn(
      invalidateEnqueueRenderJobSuccessReturn({ renderJobId: 42 }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderJobSuccessReturn(buildEnqueueRenderJobErrorReturn()),
    false,
  );
  const { renderJobId: _omitRenderJobId, ...missingRenderJobId } =
    buildEnqueueRenderJobSuccessReturn();
  assertEquals(isEnqueueRenderJobSuccessReturn(missingRenderJobId), false);
});

Deno.test("isEnqueueRenderJobErrorReturn accepts a valid built object", () => {
  assertEquals(isEnqueueRenderJobErrorReturn(buildEnqueueRenderJobErrorReturn()), true);
});

Deno.test("isEnqueueRenderJobErrorReturn accepts all valid error flavors", () => {
  assertEquals(
    isEnqueueRenderJobErrorReturn(
      buildEnqueueRenderJobErrorReturn({ error: new TemplateResolutionError("x") }),
    ),
    true,
  );
});

Deno.test("isEnqueueRenderJobErrorReturn rejects non-records", () => {
  assertEquals(isEnqueueRenderJobErrorReturn(null), false);
  assertEquals(isEnqueueRenderJobErrorReturn(undefined), false);
  assertEquals(isEnqueueRenderJobErrorReturn(42), false);
  assertEquals(isEnqueueRenderJobErrorReturn("string"), false);
  assertEquals(isEnqueueRenderJobErrorReturn([]), false);
});

Deno.test("isEnqueueRenderJobErrorReturn rejects corrupted and missing properties", () => {
  assertEquals(
    isEnqueueRenderJobErrorReturn(
      invalidateEnqueueRenderJobErrorReturn({ error: new Error("x") }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderJobErrorReturn(
      invalidateEnqueueRenderJobErrorReturn({ retriable: "false" }),
    ),
    false,
  );
  const { error: _omitError, ...missingError } = buildEnqueueRenderJobErrorReturn();
  assertEquals(isEnqueueRenderJobErrorReturn(missingError), false);

  const { retriable: _omitRetriable, ...missingRetriable } = buildEnqueueRenderJobErrorReturn();
  assertEquals(isEnqueueRenderJobErrorReturn(missingRetriable), false);
});

Deno.test("isEnqueueRenderCompressedContextPayload accepts a valid built object", () => {
  assertEquals(isEnqueueRenderCompressedContextPayload(buildEnqueueRenderCompressedContextPayload()), true);
});

Deno.test("isEnqueueRenderCompressedContextPayload accepts a sourceType: 'resource' variant", () => {
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      buildEnqueueRenderCompressedContextPayload({ sourceType: "resource" }),
    ),
    true,
  );
});

Deno.test("isEnqueueRenderCompressedContextPayload rejects non-records", () => {
  assertEquals(isEnqueueRenderCompressedContextPayload(null), false);
  assertEquals(isEnqueueRenderCompressedContextPayload(undefined), false);
  assertEquals(isEnqueueRenderCompressedContextPayload(42), false);
  assertEquals(isEnqueueRenderCompressedContextPayload("string"), false);
  assertEquals(isEnqueueRenderCompressedContextPayload([]), false);
});

Deno.test("isEnqueueRenderCompressedContextPayload rejects an EnqueueRenderJobPayload (structure alone discriminates)", () => {
  assertEquals(isEnqueueRenderCompressedContextPayload(buildEnqueueRenderJobPayload()), false);
});

Deno.test("isEnqueueRenderCompressedContextPayload rejects missing required properties", () => {
  const { sourceType: _omitSource, ...missingSource } = buildEnqueueRenderCompressedContextPayload();
  assertEquals(isEnqueueRenderCompressedContextPayload(missingSource), false);

  const { documentKey: _omitDocKey, ...missingDocKey } = buildEnqueueRenderCompressedContextPayload();
  assertEquals(isEnqueueRenderCompressedContextPayload(missingDocKey), false);

  const { docType: _omitDocType, ...missingDocType } = buildEnqueueRenderCompressedContextPayload();
  assertEquals(isEnqueueRenderCompressedContextPayload(missingDocType), false);

  const { sourceStageSlug: _omitStage, ...missingStage } = buildEnqueueRenderCompressedContextPayload();
  assertEquals(isEnqueueRenderCompressedContextPayload(missingStage), false);

  const { targetKey: _omitTarget, ...missingTarget } = buildEnqueueRenderCompressedContextPayload();
  assertEquals(isEnqueueRenderCompressedContextPayload(missingTarget), false);
});

Deno.test("isEnqueueRenderCompressedContextPayload rejects text-mode sourceTypes (feedback and history are never rendered)", () => {
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      invalidateEnqueueRenderCompressedContextPayload({ sourceType: "feedback" }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      invalidateEnqueueRenderCompressedContextPayload({ sourceType: "history" }),
    ),
    false,
  );
});

Deno.test("isEnqueueRenderCompressedContextPayload rejects corrupted properties", () => {
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      invalidateEnqueueRenderCompressedContextPayload({ documentKey: 42 }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      invalidateEnqueueRenderCompressedContextPayload({ docType: "not-a-type" }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      invalidateEnqueueRenderCompressedContextPayload({ targetKey: "not-a-type" }),
    ),
    false,
  );
  assertEquals(
    isEnqueueRenderCompressedContextPayload(
      invalidateEnqueueRenderCompressedContextPayload({ sourceStageSlug: "not-a-stage" }),
    ),
    false,
  );
});

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isDialecticRenderCompressedContextJobPayload accepts a valid built object", () => {
  assertEquals(isDialecticRenderCompressedContextJobPayload(buildDialecticRenderCompressedContextJobPayload()), true);
});

/** Contract: case 3 — non-record roots throw the base guard's non-null-object diagnostic. */
Deno.test("isDialecticRenderCompressedContextJobPayload throws on non-records", () => {
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(null), Error, "Payload must be a non-null object.");
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(undefined), Error, "Payload must be a non-null object.");
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(42), Error, "Payload must be a non-null object.");
  assertThrows(() => isDialecticRenderCompressedContextJobPayload("string"), Error, "Payload must be a non-null object.");
  assertThrows(() => isDialecticRenderCompressedContextJobPayload([]), Error, "Payload must be a non-null object.");
});

/** Contract: case 5 — each own declared member, omitted in turn, throws a per-member diagnostic. */
Deno.test("isDialecticRenderCompressedContextJobPayload throws when an own member is absent", () => {
  const { targetKey: _omitTarget, ...missingTarget } = buildDialecticRenderCompressedContextJobPayload();
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(missingTarget), Error, "Missing or invalid targetKey.");

  const { sourceType: _omitSource, ...missingSource } = buildDialecticRenderCompressedContextJobPayload();
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(missingSource), Error, "Missing or invalid sourceType.");

  const { documentKey: _omitDocKey, ...missingDocKey } = buildDialecticRenderCompressedContextJobPayload();
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(missingDocKey), Error, "Missing or invalid documentKey.");

  const { template_filename: _omitTemplate, ...missingTemplate } = buildDialecticRenderCompressedContextJobPayload();
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(missingTemplate), Error, "Missing or invalid template_filename.");

  const { stageSlug: _omitStage, ...missingStage } = buildDialecticRenderCompressedContextJobPayload();
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(missingStage), Error, "Missing or invalid stageSlug.");

  const { iterationNumber: _omitIter, ...missingIter } = buildDialecticRenderCompressedContextJobPayload();
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(missingIter), Error, "Missing or invalid iterationNumber.");
});

/** Contract: case 4 — each own declared member, corrupted in turn, throws a per-member diagnostic. */
Deno.test("isDialecticRenderCompressedContextJobPayload throws when an own member is wrong-typed", () => {
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ targetKey: 42 })),
    Error, "Missing or invalid targetKey.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ sourceType: 123 })),
    Error, "Missing or invalid sourceType.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ documentKey: 42 })),
    Error, "Missing or invalid documentKey.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ template_filename: 42 })),
    Error, "Missing or invalid template_filename.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ stageSlug: "not-a-stage" })),
    Error, "Missing or invalid stageSlug.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ iterationNumber: "not-a-number" })),
    Error, "Invalid iterationNumber.",
  );
});

/** Contract: case 4 — template_filename empty string throws the per-member diagnostic. */
Deno.test("isDialecticRenderCompressedContextJobPayload throws when template_filename is empty", () => {
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ template_filename: "" })),
    Error, "Missing or invalid template_filename.",
  );
});

/** Contract: case 4 — a valid CompressionSourceType outside 'contribution' | 'resource' throws the per-member diagnostic. */
Deno.test("isDialecticRenderCompressedContextJobPayload throws when sourceType is a valid CompressionSourceType outside the render restriction", () => {
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ sourceType: "feedback" })),
    Error, "Missing or invalid sourceType.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ sourceType: "history" })),
    Error, "Missing or invalid sourceType.",
  );
});

/** Contract: delegation — each inherited member, corrupted in turn, throws the base guard's own diagnostic unchanged and uncaught. */
Deno.test("isDialecticRenderCompressedContextJobPayload delegates inherited member corruption to the base guard", () => {
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ sessionId: 42 })),
    Error, "Missing or invalid sessionId.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ projectId: 42 })),
    Error, "Missing or invalid projectId.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ model_id: 42 })),
    Error, "Missing or invalid model_id.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ walletId: 42 })),
    Error, "Missing or invalid walletId.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ user_jwt: 42 })),
    Error, "Missing or invalid user_jwt.",
  );
  assertThrows(
    () => isDialecticRenderCompressedContextJobPayload(invalidateDialecticRenderCompressedContextJobPayload({ idempotencyKey: 42 })),
    Error, "Missing or invalid idempotencyKey.",
  );
});

/** Contract: case 4 — a DialecticRenderJobPayload-shaped record lacks targetKey and throws the per-member diagnostic. */
Deno.test("isDialecticRenderCompressedContextJobPayload throws on a DialecticRenderJobPayload-shaped record (no cross-match)", () => {
  const renderJobPayloadShaped: Record<string, unknown> = {
    idempotencyKey: "job-1_render",
    projectId: "project-1",
    sessionId: "session-1",
    iterationNumber: 1,
    stageSlug: "thesis",
    documentIdentity: "doc-identity-1",
    documentKey: "business_case",
    sourceContributionId: "contrib-1",
    template_filename: "thesis_business_case.md",
    user_jwt: "jwt-token",
    model_id: "model-1",
    walletId: "wallet-1",
  };
  assertThrows(() => isDialecticRenderCompressedContextJobPayload(renderJobPayloadShaped), Error, "Missing or invalid targetKey.");
});

/** Contract: case 1 — a built compressed row payload is recognised as the compressed shape. */
Deno.test("isCompressedRenderPayloadShape accepts a built compressed row payload", () => {
  assertEquals(isCompressedRenderPayloadShape(buildDialecticRenderCompressedContextJobPayload()), true);
});

/** Contract: case 4 — a built DialecticRenderJobPayload is rejected, which is the discrimination the predicate exists to make. */
Deno.test("isCompressedRenderPayloadShape rejects a built DialecticRenderJobPayload", () => {
  assertEquals(isCompressedRenderPayloadShape(buildDialecticRenderJobPayload()), false);
});

/** Contract: case 4 — a record carrying targetKey without sourceType is rejected. */
Deno.test("isCompressedRenderPayloadShape rejects targetKey without sourceType", () => {
  const { sourceType: _omit, ...rest } = buildDialecticRenderCompressedContextJobPayload();
  assertEquals(isCompressedRenderPayloadShape(rest), false);
});

/** Contract: case 4 — a record carrying sourceType without targetKey is rejected. */
Deno.test("isCompressedRenderPayloadShape rejects sourceType without targetKey", () => {
  const { targetKey: _omit, ...rest } = buildDialecticRenderCompressedContextJobPayload();
  assertEquals(isCompressedRenderPayloadShape(rest), false);
});

/** Contract: case 4 — a record carrying both targetKey and sourceType alongside documentIdentity is rejected. */
Deno.test("isCompressedRenderPayloadShape rejects both markers alongside documentIdentity", () => {
  const withDocIdentity = { ...buildDialecticRenderCompressedContextJobPayload(), documentIdentity: "doc-1" };
  assertEquals(isCompressedRenderPayloadShape(withDocIdentity), false);
});

/** Contract: case 4 — a record carrying both targetKey and sourceType alongside sourceContributionId is rejected. */
Deno.test("isCompressedRenderPayloadShape rejects both markers alongside sourceContributionId", () => {
  const withSourceContrib = { ...buildDialecticRenderCompressedContextJobPayload(), sourceContributionId: "contrib-1" };
  assertEquals(isCompressedRenderPayloadShape(withSourceContrib), false);
});

/** Contract: case 3 — non-record roots are rejected. */
Deno.test("isCompressedRenderPayloadShape rejects non-records", () => {
  assertEquals(isCompressedRenderPayloadShape(null), false);
  assertEquals(isCompressedRenderPayloadShape(undefined), false);
  assertEquals(isCompressedRenderPayloadShape(42), false);
  assertEquals(isCompressedRenderPayloadShape("string"), false);
  assertEquals(isCompressedRenderPayloadShape([]), false);
});
