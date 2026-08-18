import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { LoadJobContextJobNotFoundError } from "./loadJobContext.interface.ts";
import type {
  LoadJobContextDeps,
  LoadJobContextParams,
  LoadJobContextPayload,
  LoadJobContextSuccessReturn,
  LoadJobContextErrorReturn,
  LoadJobContextReturn,
  LoadJobContextFn,
  LoadJobContextJobReadErrorConstructorParams,
  LoadJobContextJobNotFoundErrorConstructorParams,
  LoadJobContextProviderReadErrorConstructorParams,
  LoadJobContextProviderNotFoundErrorConstructorParams,
  LoadJobContextProviderInvalidErrorConstructorParams,
  LoadJobContextConfigInvalidErrorConstructorParams,
} from "./loadJobContext.interface.ts";

/** Contract: LoadJobContextDeps' required key surface is empty, proving the deps object is declared and empty rather than absent from the signature. */
Deno.test("LoadJobContextDeps has the required surface", () => {
  const surface: Record<keyof LoadJobContextDeps, true> = {};
  assertEquals(Object.keys(surface).length, 0);
});

/** Contract: LoadJobContextParams' required key surface is exactly dbClient. */
Deno.test("LoadJobContextParams has the required surface", () => {
  const surface: Record<keyof LoadJobContextParams, true> = {
    dbClient: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: LoadJobContextPayload's required key surface is exactly jobId, proving the identifier the function operates on is the payload and the client is not. */
Deno.test("LoadJobContextPayload has the required surface", () => {
  const surface: Record<keyof LoadJobContextPayload, true> = {
    jobId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: LoadJobContextSuccessReturn's required key surface is exactly job, providerRow, modelConfig, walletId and projectId — exhaustive in both directions, so a member re-derived downstream cannot be quietly omitted here and a row column cannot be duplicated into it. */
Deno.test("LoadJobContextSuccessReturn has the required surface", () => {
  const surface: Record<keyof LoadJobContextSuccessReturn, true> = {
    job: true,
    providerRow: true,
    modelConfig: true,
    walletId: true,
    projectId: true,
  };
  assertEquals(Object.keys(surface).length, 5);
});

/** Contract: LoadJobContextErrorReturn's required key surface is exactly error and retriable. */
Deno.test("LoadJobContextErrorReturn has the required surface", () => {
  const surface: Record<keyof LoadJobContextErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: LoadJobContextErrorReturn is a member of LoadJobContextReturn, proving the union admits the error arm. */
Deno.test("LoadJobContextErrorReturn is a member of LoadJobContextReturn", () => {
  const errorReturn: LoadJobContextErrorReturn = {
    error: new LoadJobContextJobNotFoundError({ jobId: "job-1" }),
    retriable: false,
  };
  const result: LoadJobContextReturn = errorReturn;
  assertEquals(result, errorReturn);
});

/** Contract: LoadJobContextJobReadErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("LoadJobContextJobReadErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof LoadJobContextJobReadErrorConstructorParams,
    true
  > = {
    jobId: true,
    driverMessage: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: LoadJobContextJobNotFoundErrorConstructorParams' required key surface is exactly jobId. */
Deno.test("LoadJobContextJobNotFoundErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof LoadJobContextJobNotFoundErrorConstructorParams,
    true
  > = {
    jobId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: LoadJobContextProviderReadErrorConstructorParams' required key surface is exactly modelId and driverMessage. */
Deno.test("LoadJobContextProviderReadErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof LoadJobContextProviderReadErrorConstructorParams,
    true
  > = {
    modelId: true,
    driverMessage: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: LoadJobContextProviderNotFoundErrorConstructorParams' required key surface is exactly modelId. */
Deno.test("LoadJobContextProviderNotFoundErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof LoadJobContextProviderNotFoundErrorConstructorParams,
    true
  > = {
    modelId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: LoadJobContextProviderInvalidErrorConstructorParams' required key surface is exactly modelId. */
Deno.test("LoadJobContextProviderInvalidErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof LoadJobContextProviderInvalidErrorConstructorParams,
    true
  > = {
    modelId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: LoadJobContextConfigInvalidErrorConstructorParams' required key surface is exactly modelId. */
Deno.test("LoadJobContextConfigInvalidErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof LoadJobContextConfigInvalidErrorConstructorParams,
    true
  > = {
    modelId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: LoadJobContextFn's declared Promise return admits its error arm, proving the signature is asynchronous. */
Deno.test("LoadJobContextFn resolves to its declared return type", () => {
  const errorReturn: LoadJobContextErrorReturn = {
    error: new LoadJobContextJobNotFoundError({ jobId: "job-1" }),
    retriable: false,
  };
  const returned: ReturnType<LoadJobContextFn> = Promise.resolve(errorReturn);
  const declared: Promise<LoadJobContextReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});
