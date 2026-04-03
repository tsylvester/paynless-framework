import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPrepareModelJobDeps,
  isPrepareModelJobErrorReturn,
  isPrepareModelJobParams,
  isPrepareModelJobPayload,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.guard.ts";
import {
  buildBoundExecuteModelCallAndSaveStub,
  buildBoundEnqueueRenderJobStub,
  buildDialecticContributionRow,
  buildPrepareModelJobDepsMissingCalculateAffordability,
  buildPrepareModelJobDepsMissingEnqueueRenderJob,
  buildPrepareModelJobDepsStructuralContract,
  buildPrepareModelJobDepsWithInvalidCalculateAffordability,
  buildPrepareModelJobParamsForGuard,
  buildPrepareModelJobPayloadForGuard,
} from "./prepareModelJob.mock.ts";

Deno.test("isPrepareModelJobDeps accepts valid PrepareModelJobDeps from structural contract", () => {
  assertEquals(isPrepareModelJobDeps(buildPrepareModelJobDepsStructuralContract()), true);
});

Deno.test("isPrepareModelJobDeps rejects null", () => {
  assertEquals(isPrepareModelJobDeps(null), false);
});

Deno.test("isPrepareModelJobDeps rejects empty object", () => {
  assertEquals(isPrepareModelJobDeps({}), false);
});

Deno.test("isPrepareModelJobDeps rejects object missing calculateAffordability", () => {
  assertEquals(isPrepareModelJobDeps(buildPrepareModelJobDepsMissingCalculateAffordability()), false);
});

Deno.test("isPrepareModelJobDeps rejects object with non-function calculateAffordability", () => {
  assertEquals(isPrepareModelJobDeps(buildPrepareModelJobDepsWithInvalidCalculateAffordability()), false);
});

Deno.test("isPrepareModelJobDeps rejects object missing enqueueRenderJob", () => {
  assertEquals(isPrepareModelJobDeps(buildPrepareModelJobDepsMissingEnqueueRenderJob()), false);
});

Deno.test("isPrepareModelJobDeps rejects partial deps", () => {
  assertEquals(
    isPrepareModelJobDeps({
      executeModelCallAndSave: buildBoundExecuteModelCallAndSaveStub(),
    }),
    false,
  );
  assertEquals(
    isPrepareModelJobDeps({
      enqueueRenderJob: buildBoundEnqueueRenderJobStub(),
    }),
    false,
  );
});

Deno.test("isPrepareModelJobParams accepts valid params", () => {
  assertEquals(isPrepareModelJobParams(buildPrepareModelJobParamsForGuard()), true);
});

Deno.test("isPrepareModelJobParams rejects null and empty object", () => {
  assertEquals(isPrepareModelJobParams(null), false);
  assertEquals(isPrepareModelJobParams({}), false);
});

Deno.test("isPrepareModelJobPayload accepts valid payload", () => {
  assertEquals(isPrepareModelJobPayload(buildPrepareModelJobPayloadForGuard()), true);
});

Deno.test("isPrepareModelJobPayload rejects null and empty object", () => {
  assertEquals(isPrepareModelJobPayload(null), false);
  assertEquals(isPrepareModelJobPayload({}), false);
});

Deno.test("isPrepareModelJobSuccessReturn accepts valid success return", () => {
  assertEquals(
    isPrepareModelJobSuccessReturn({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: "render-1",
    }),
    true,
  );
});

Deno.test("isPrepareModelJobSuccessReturn rejects null and error-shaped object", () => {
  assertEquals(isPrepareModelJobSuccessReturn(null), false);
  assertEquals(
    isPrepareModelJobSuccessReturn({ error: new Error("x"), retriable: false }),
    false,
  );
});

Deno.test("isPrepareModelJobErrorReturn accepts valid error return", () => {
  assertEquals(
    isPrepareModelJobErrorReturn({
      error: new Error("guard err"),
      retriable: true,
    }),
    true,
  );
});

Deno.test("isPrepareModelJobErrorReturn rejects null and success-shaped object", () => {
  assertEquals(isPrepareModelJobErrorReturn(null), false);
  assertEquals(
    isPrepareModelJobErrorReturn({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: null,
    }),
    false,
  );
});
