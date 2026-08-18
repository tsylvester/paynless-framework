import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DebitForResponseWalletReadError,
  DebitForResponseWalletNotFoundError,
  DebitForResponseWalletCurrencyError,
  DebitForResponseWalletBalanceError,
  DebitForResponseTokenUsageError,
} from "./debitForResponse.interface.ts";
import type {
  DebitForResponseDeps,
  DebitForResponseParams,
  DebitForResponsePayload,
  DebitForResponseSuccessReturn,
  DebitForResponseErrorReturn,
  DebitForResponseReturn,
  DebitForResponseFn,
  DebitForResponseWalletReadErrorConstructorParams,
  DebitForResponseWalletNotFoundErrorConstructorParams,
  DebitForResponseWalletCurrencyErrorConstructorParams,
  DebitForResponseWalletBalanceErrorConstructorParams,
  DebitForResponseTokenUsageErrorConstructorParams,
} from "./debitForResponse.interface.ts";

/** Contract: DebitForResponseDeps' required key surface is exactly debitTokens. */
Deno.test("DebitForResponseDeps has the required surface", () => {
  const surface: Record<keyof DebitForResponseDeps, true> = {
    debitTokens: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: DebitForResponseParams' required key surface is exactly dbClient, jobId, walletId, providerRow, modelConfig and projectOwnerUserId. */
Deno.test("DebitForResponseParams has the required surface", () => {
  const surface: Record<keyof DebitForResponseParams, true> = {
    dbClient: true,
    jobId: true,
    walletId: true,
    providerRow: true,
    modelConfig: true,
    projectOwnerUserId: true,
  };
  assertEquals(Object.keys(surface).length, 6);
});

/** Contract: DebitForResponsePayload's required key surface is exactly aiResponse. */
Deno.test("DebitForResponsePayload has the required surface", () => {
  const surface: Record<keyof DebitForResponsePayload, true> = {
    aiResponse: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: DebitForResponseSuccessReturn's required key surface is exactly debited. */
Deno.test("DebitForResponseSuccessReturn has the required surface", () => {
  const surface: Record<keyof DebitForResponseSuccessReturn, true> = {
    debited: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: DebitForResponseErrorReturn's required key surface is exactly error and retriable. */
Deno.test("DebitForResponseErrorReturn has the required surface", () => {
  const surface: Record<keyof DebitForResponseErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: DebitForResponseSuccessReturn is a member of DebitForResponseReturn, proving the union admits the success arm. */
Deno.test("DebitForResponseSuccessReturn is a member of DebitForResponseReturn", () => {
  const success: DebitForResponseSuccessReturn = { debited: true };
  const result: DebitForResponseReturn = success;
  assertEquals(result, success);
});

/** Contract: DebitForResponseErrorReturn is a member of DebitForResponseReturn, proving the union admits the error arm. */
Deno.test("DebitForResponseErrorReturn is a member of DebitForResponseReturn", () => {
  const errorReturn: DebitForResponseErrorReturn = {
    error: new DebitForResponseWalletNotFoundError({ walletId: "wallet-1" }),
    retriable: false,
  };
  const result: DebitForResponseReturn = errorReturn;
  assertEquals(result, errorReturn);
});

/** Contract: DebitForResponseWalletReadErrorConstructorParams' required key surface is exactly walletId and driverMessage. */
Deno.test("DebitForResponseWalletReadErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof DebitForResponseWalletReadErrorConstructorParams, true> = {
    walletId: true,
    driverMessage: true,
  };
  assertEquals(Object.keys(surface).length, 2);
  const error: DebitForResponseWalletReadError = new DebitForResponseWalletReadError({
    walletId: "wallet-1",
    driverMessage: "driver error",
  });
  assertEquals(error instanceof DebitForResponseWalletReadError, true);
});

/** Contract: DebitForResponseWalletNotFoundErrorConstructorParams' required key surface is exactly walletId. */
Deno.test("DebitForResponseWalletNotFoundErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof DebitForResponseWalletNotFoundErrorConstructorParams, true> = {
    walletId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
  const error: DebitForResponseWalletNotFoundError = new DebitForResponseWalletNotFoundError({
    walletId: "wallet-1",
  });
  assertEquals(error instanceof DebitForResponseWalletNotFoundError, true);
});

/** Contract: DebitForResponseWalletCurrencyErrorConstructorParams' required key surface is exactly walletId and currency. */
Deno.test("DebitForResponseWalletCurrencyErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof DebitForResponseWalletCurrencyErrorConstructorParams, true> = {
    walletId: true,
    currency: true,
  };
  assertEquals(Object.keys(surface).length, 2);
  const error: DebitForResponseWalletCurrencyError = new DebitForResponseWalletCurrencyError({
    walletId: "wallet-1",
    currency: "USD",
  });
  assertEquals(error instanceof DebitForResponseWalletCurrencyError, true);
});

/** Contract: DebitForResponseWalletBalanceErrorConstructorParams' required key surface is exactly walletId. */
Deno.test("DebitForResponseWalletBalanceErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof DebitForResponseWalletBalanceErrorConstructorParams, true> = {
    walletId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
  const error: DebitForResponseWalletBalanceError = new DebitForResponseWalletBalanceError({
    walletId: "wallet-1",
  });
  assertEquals(error instanceof DebitForResponseWalletBalanceError, true);
});

/** Contract: DebitForResponseTokenUsageErrorConstructorParams' required key surface is exactly jobId. */
Deno.test("DebitForResponseTokenUsageErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof DebitForResponseTokenUsageErrorConstructorParams, true> = {
    jobId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
  const error: DebitForResponseTokenUsageError = new DebitForResponseTokenUsageError({
    jobId: "job-1",
  });
  assertEquals(error instanceof DebitForResponseTokenUsageError, true);
});

/** Contract: DebitForResponseFn's declared Promise return admits its success arm, proving the signature is asynchronous. */
Deno.test("DebitForResponseFn resolves to its declared success type", () => {
  const success: DebitForResponseSuccessReturn = { debited: true };
  const returned: ReturnType<DebitForResponseFn> = Promise.resolve(success);
  const declared: Promise<DebitForResponseReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: DebitForResponseFn's declared Promise return admits its error arm, proving the signature is asynchronous. */
Deno.test("DebitForResponseFn resolves to its declared error type", () => {
  const error: DebitForResponseErrorReturn = {
    error: new DebitForResponseWalletNotFoundError({ walletId: "wallet-1" }),
    retriable: false,
  };
  const returned: ReturnType<DebitForResponseFn> = Promise.resolve(error);
  const declared: Promise<DebitForResponseReturn> = returned;
  assert(declared instanceof Promise);
});
