// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.guard.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TemplateResolutionError } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import {
  buildEnqueueRenderJobDeps,
  buildEnqueueRenderJobErrorReturn,
  buildEnqueueRenderJobParams,
  buildEnqueueRenderJobPayload,
  buildEnqueueRenderJobSuccessReturn,
  invalidateEnqueueRenderJobDeps,
  invalidateEnqueueRenderJobErrorReturn,
  invalidateEnqueueRenderJobParams,
  invalidateEnqueueRenderJobPayload,
  invalidateEnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.mock.ts";
import {
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
