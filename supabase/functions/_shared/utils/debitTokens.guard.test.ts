import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDebitTokensSuccess,
  invalidateDebitTokensSuccess,
  buildDebitTokensError,
  invalidateDebitTokensError,
} from "./debitTokens.mock.ts";
import {
  isDebitTokensSuccess,
  isDebitTokensError,
} from "./debitTokens.guard.ts";

Deno.test("Type Guard: isDebitTokensSuccess", async (t) => {
  await t.step("accepts the built success", () => {
    assert(isDebitTokensSuccess(buildDebitTokensSuccess()));
  });

  await t.step("rejects transactionRecordedSuccessfully absent", () => {
    const { transactionRecordedSuccessfully: _omit, ...rest } = buildDebitTokensSuccess();
    assert(!isDebitTokensSuccess(rest));
  });

  await t.step("rejects transactionRecordedSuccessfully not exactly true", () => {
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ transactionRecordedSuccessfully: false })));
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ transactionRecordedSuccessfully: "true" })));
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ transactionRecordedSuccessfully: 1 })));
  });

  await t.step("rejects result absent", () => {
    const { result: _omit, ...rest } = buildDebitTokensSuccess();
    assert(!isDebitTokensSuccess(rest));
  });

  await t.step("rejects result non-record", () => {
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ result: "not-a-record" })));
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ result: 42 })));
  });

  await t.step("rejects userMessage absent", () => {
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ result: { assistantMessage: "present" } })));
  });

  await t.step("rejects assistantMessage absent", () => {
    assert(!isDebitTokensSuccess(invalidateDebitTokensSuccess({ result: { userMessage: "present" } })));
  });

  await t.step("rejects the error arm", () => {
    assert(!isDebitTokensSuccess(buildDebitTokensError()));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitTokensSuccess(null));
    assert(!isDebitTokensSuccess(undefined));
    assert(!isDebitTokensSuccess("string"));
    assert(!isDebitTokensSuccess(42));
    assert(!isDebitTokensSuccess([]));
  });
});

Deno.test("Type Guard: isDebitTokensError", async (t) => {
  await t.step("accepts the built error", () => {
    assert(isDebitTokensError(buildDebitTokensError()));
  });

  await t.step("rejects error absent", () => {
    const { error: _omit, ...rest } = buildDebitTokensError();
    assert(!isDebitTokensError(rest));
  });

  await t.step("rejects error a plain object", () => {
    assert(!isDebitTokensError(invalidateDebitTokensError({ error: { message: "oops" } })));
  });

  await t.step("rejects error a string", () => {
    assert(!isDebitTokensError(invalidateDebitTokensError({ error: "failure" })));
  });

  await t.step("rejects retriable absent", () => {
    const { retriable: _omit, ...rest } = buildDebitTokensError();
    assert(!isDebitTokensError(rest));
  });

  await t.step("rejects retriable non-boolean", () => {
    assert(!isDebitTokensError(invalidateDebitTokensError({ retriable: "yes" })));
    assert(!isDebitTokensError(invalidateDebitTokensError({ retriable: 1 })));
  });

  await t.step("rejects the success arm", () => {
    assert(!isDebitTokensError(buildDebitTokensSuccess()));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitTokensError(null));
    assert(!isDebitTokensError(undefined));
    assert(!isDebitTokensError("string"));
    assert(!isDebitTokensError(42));
    assert(!isDebitTokensError([]));
  });
});
