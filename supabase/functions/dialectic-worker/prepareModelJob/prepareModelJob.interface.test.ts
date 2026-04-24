import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
import { PrepareModelJobExecutionError } from "./prepareModelJob.interface.ts";

Deno.test("Contract: PrepareModelJobDeps declares seven dependency keys", () => {
  const surface: Record<keyof PrepareModelJobDeps, true> = {
    logger: true,
    applyInputsRequiredScope: true,
    tokenWalletService: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    calculateAffordability: true,
    enqueueModelCall: true,
  };
  assertEquals(Object.keys(surface).length, 7);
});

Deno.test("Contract: PrepareModelJobParams declares six fields", () => {
  const surface: Record<keyof PrepareModelJobParams, true> = {
    dbClient: true,
    authToken: true,
    job: true,
    projectOwnerUserId: true,
    providerRow: true,
    sessionData: true,
  };
  assertEquals(Object.keys(surface).length, 6);
});

Deno.test("Contract: PrepareModelJobPayload declares four fields", () => {
  const surface: Record<keyof PrepareModelJobPayload, true> = {
    promptConstructionPayload: true,
    compressionStrategy: true,
    inputsRelevance: true,
    inputsRequired: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

Deno.test("Contract: PrepareModelJobSuccessReturn queued true", () => {
  const r: PrepareModelJobSuccessReturn = { queued: true };
  assertEquals(r.queued, true);
});

Deno.test("Contract: PrepareModelJobErrorReturn has error and retriable", () => {
  const err: PrepareModelJobErrorReturn = {
    error: new Error("contract-err"),
    retriable: false,
  };
  assertEquals(err.error instanceof Error, true);
  assertEquals(typeof err.retriable, "boolean");
});

Deno.test("Contract: PrepareModelJobReturn accepts success branch", () => {
  const r: PrepareModelJobReturn = { queued: true };
  assertEquals("queued" in r, true);
});

Deno.test("Contract: PrepareModelJobReturn accepts error branch", () => {
  const r: PrepareModelJobReturn = { error: new Error("x"), retriable: true };
  assertEquals("error" in r, true);
  assertEquals("retriable" in r, true);
});

Deno.test("Contract: PrepareModelJobFn signature accepts (deps, params, payload) and returns PrepareModelJobReturn", () => {
  const fn: PrepareModelJobFn = async (
    _deps,
    _params,
    _payload,
  ): Promise<PrepareModelJobReturn> => {
    const ok: PrepareModelJobSuccessReturn = { queued: true };
    return ok;
  };
  assertEquals(typeof fn, "function");
});

Deno.test("Contract: PrepareModelJobExecutionError constructs with name, retriable, causeError", () => {
  const cause: Error = new Error("cause");
  const err: PrepareModelJobExecutionError = new PrepareModelJobExecutionError(
    "wrapped",
    true,
    cause,
  );
  assertEquals(err.name, "PrepareModelJobExecutionError");
  assertEquals(typeof err.retriable, "boolean");
  assertEquals(err.causeError instanceof Error, true);
  assertEquals(err instanceof Error, true);
});
