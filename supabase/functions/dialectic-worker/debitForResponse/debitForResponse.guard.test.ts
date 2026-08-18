import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDebitForResponseDeps,
  invalidateDebitForResponseDeps,
  buildDebitForResponseParams,
  invalidateDebitForResponseParams,
  buildDebitForResponsePayload,
  invalidateDebitForResponsePayload,
  buildDebitForResponseSuccessReturn,
  invalidateDebitForResponseSuccessReturn,
  buildDebitForResponseErrorReturn,
  invalidateDebitForResponseErrorReturn,
  buildDebitForResponseWalletReadError,
  buildDebitForResponseWalletNotFoundError,
  buildDebitForResponseWalletCurrencyError,
  buildDebitForResponseWalletBalanceError,
  buildDebitForResponseTokenUsageError,
} from "./debitForResponse.mock.ts";
import { invalidateUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import {
  isDebitForResponseDeps,
  isDebitForResponseParams,
  isDebitForResponsePayload,
  isDebitForResponseSuccessReturn,
  isDebitForResponseErrorReturn,
  isDebitForResponseWalletReadError,
  isDebitForResponseWalletNotFoundError,
  isDebitForResponseWalletCurrencyError,
  isDebitForResponseWalletBalanceError,
  isDebitForResponseTokenUsageError,
} from "./debitForResponse.guard.ts";

Deno.test("Type Guard: isDebitForResponseDeps", async (t) => {
  await t.step("accepts the built deps", () => {
    assert(isDebitForResponseDeps(buildDebitForResponseDeps()));
  });

  await t.step("rejects debitTokens absent", () => {
    const { debitTokens: _omit, ...rest } = buildDebitForResponseDeps();
    assert(!isDebitForResponseDeps(rest));
  });

  await t.step("rejects debitTokens non-function", () => {
    assert(!isDebitForResponseDeps(invalidateDebitForResponseDeps({ debitTokens: "not-a-fn" })));
  });

  await t.step("rejects debitTokens a plain object", () => {
    assert(!isDebitForResponseDeps(invalidateDebitForResponseDeps({ debitTokens: { foo: "bar" } })));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitForResponseDeps(null));
    assert(!isDebitForResponseDeps("string"));
    assert(!isDebitForResponseDeps(42));
  });
});

Deno.test("Type Guard: isDebitForResponseParams", async (t) => {
  await t.step("accepts the built params", () => {
    assert(isDebitForResponseParams(buildDebitForResponseParams()));
  });

  await t.step("rejects dbClient absent", () => {
    const { dbClient: _omit, ...rest } = buildDebitForResponseParams();
    assert(!isDebitForResponseParams(rest));
  });

  await t.step("rejects dbClient a string", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ dbClient: "not-a-client" })));
  });

  await t.step("rejects jobId absent", () => {
    const { jobId: _omit, ...rest } = buildDebitForResponseParams();
    assert(!isDebitForResponseParams(rest));
  });

  await t.step("rejects jobId non-string", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ jobId: 42 })));
  });

  await t.step("rejects jobId empty", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ jobId: "" })));
  });

  await t.step("rejects walletId absent", () => {
    const { walletId: _omit, ...rest } = buildDebitForResponseParams();
    assert(!isDebitForResponseParams(rest));
  });

  await t.step("rejects walletId non-string", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ walletId: 42 })));
  });

  await t.step("rejects walletId empty", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ walletId: "" })));
  });

  await t.step("rejects projectOwnerUserId absent", () => {
    const { projectOwnerUserId: _omit, ...rest } = buildDebitForResponseParams();
    assert(!isDebitForResponseParams(rest));
  });

  await t.step("rejects projectOwnerUserId non-string", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ projectOwnerUserId: 42 })));
  });

  await t.step("rejects projectOwnerUserId empty", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ projectOwnerUserId: "" })));
  });

  await t.step("rejects providerRow with a required member rest-destructured away", () => {
    const { id: _omit, ...restProvider } = buildMockProvider();
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ providerRow: restProvider })));
  });

  await t.step("rejects modelConfig absent", () => {
    const { modelConfig: _omit, ...rest } = buildDebitForResponseParams();
    assert(!isDebitForResponseParams(rest));
  });

  await t.step("rejects modelConfig failing its owner's guard", () => {
    assert(!isDebitForResponseParams(invalidateDebitForResponseParams({ modelConfig: { corrupted: true } })));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitForResponseParams(null));
    assert(!isDebitForResponseParams("string"));
    assert(!isDebitForResponseParams(42));
  });
});

Deno.test("Type Guard: isDebitForResponsePayload", async (t) => {
  await t.step("accepts the built payload", () => {
    assert(isDebitForResponsePayload(buildDebitForResponsePayload()));
  });

  await t.step("rejects aiResponse absent", () => {
    const { aiResponse: _omit, ...rest } = buildDebitForResponsePayload();
    assert(!isDebitForResponsePayload(rest));
  });

  await t.step("rejects aiResponse set to invalidateUnifiedAIResponse({ content: 42 })", () => {
    assert(!isDebitForResponsePayload(invalidateDebitForResponsePayload({ aiResponse: invalidateUnifiedAIResponse({ content: 42 }) })));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitForResponsePayload(null));
    assert(!isDebitForResponsePayload("string"));
    assert(!isDebitForResponsePayload(42));
  });
});

Deno.test("Type Guard: isDebitForResponseSuccessReturn", async (t) => {
  await t.step("accepts the built return", () => {
    assert(isDebitForResponseSuccessReturn(buildDebitForResponseSuccessReturn()));
  });

  await t.step("rejects debited absent", () => {
    const { debited: _omit, ...rest } = buildDebitForResponseSuccessReturn();
    assert(!isDebitForResponseSuccessReturn(rest));
  });

  await t.step("rejects debited not exactly true", () => {
    assert(!isDebitForResponseSuccessReturn(invalidateDebitForResponseSuccessReturn({ debited: false })));
    assert(!isDebitForResponseSuccessReturn(invalidateDebitForResponseSuccessReturn({ debited: "true" })));
    assert(!isDebitForResponseSuccessReturn(invalidateDebitForResponseSuccessReturn({ debited: 1 })));
  });

  await t.step("rejects the error return", () => {
    assert(!isDebitForResponseSuccessReturn(buildDebitForResponseErrorReturn()));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitForResponseSuccessReturn(null));
    assert(!isDebitForResponseSuccessReturn("string"));
    assert(!isDebitForResponseSuccessReturn(42));
  });
});

Deno.test("Type Guard: isDebitForResponseErrorReturn", async (t) => {
  await t.step("accepts the built return", () => {
    assert(isDebitForResponseErrorReturn(buildDebitForResponseErrorReturn()));
  });

  await t.step("accepts one whose error is a plain Error", () => {
    assert(isDebitForResponseErrorReturn({ error: new Error("propagated"), retriable: false }));
  });

  await t.step("rejects error absent", () => {
    const { error: _omit, ...rest } = buildDebitForResponseErrorReturn();
    assert(!isDebitForResponseErrorReturn(rest));
  });

  await t.step("rejects error a plain object", () => {
    assert(!isDebitForResponseErrorReturn(invalidateDebitForResponseErrorReturn({ error: { message: "oops" } })));
  });

  await t.step("rejects error a string", () => {
    assert(!isDebitForResponseErrorReturn(invalidateDebitForResponseErrorReturn({ error: "failure" })));
  });

  await t.step("rejects retriable absent", () => {
    const { retriable: _omit, ...rest } = buildDebitForResponseErrorReturn();
    assert(!isDebitForResponseErrorReturn(rest));
  });

  await t.step("rejects retriable non-boolean", () => {
    assert(!isDebitForResponseErrorReturn(invalidateDebitForResponseErrorReturn({ retriable: "yes" })));
    assert(!isDebitForResponseErrorReturn(invalidateDebitForResponseErrorReturn({ retriable: 1 })));
  });

  await t.step("rejects a non-record root", () => {
    assert(!isDebitForResponseErrorReturn(null));
    assert(!isDebitForResponseErrorReturn("string"));
    assert(!isDebitForResponseErrorReturn(42));
  });
});

Deno.test("Type Guard: isDebitForResponseWalletReadError", async (t) => {
  await t.step("accepts its own builder's instance", () => {
    assert(isDebitForResponseWalletReadError(buildDebitForResponseWalletReadError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isDebitForResponseWalletReadError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildDebitForResponseWalletReadError();
    const plain = {
      message: instance.message,
      name: instance.name,
      walletId: instance.walletId,
      driverMessage: instance.driverMessage,
    };
    assert(!isDebitForResponseWalletReadError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(!isDebitForResponseWalletReadError(buildDebitForResponseWalletNotFoundError()));
  });

  await t.step("rejects null", () => {
    assert(!isDebitForResponseWalletReadError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isDebitForResponseWalletReadError("string"));
  });
});

Deno.test("Type Guard: isDebitForResponseWalletNotFoundError", async (t) => {
  await t.step("accepts its own builder's instance", () => {
    assert(isDebitForResponseWalletNotFoundError(buildDebitForResponseWalletNotFoundError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isDebitForResponseWalletNotFoundError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildDebitForResponseWalletNotFoundError();
    const plain = {
      message: instance.message,
      name: instance.name,
      walletId: instance.walletId,
    };
    assert(!isDebitForResponseWalletNotFoundError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(!isDebitForResponseWalletNotFoundError(buildDebitForResponseWalletCurrencyError()));
  });

  await t.step("rejects null", () => {
    assert(!isDebitForResponseWalletNotFoundError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isDebitForResponseWalletNotFoundError("string"));
  });
});

Deno.test("Type Guard: isDebitForResponseWalletCurrencyError", async (t) => {
  await t.step("accepts its own builder's instance", () => {
    assert(isDebitForResponseWalletCurrencyError(buildDebitForResponseWalletCurrencyError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isDebitForResponseWalletCurrencyError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildDebitForResponseWalletCurrencyError();
    const plain = {
      message: instance.message,
      name: instance.name,
      walletId: instance.walletId,
      currency: instance.currency,
    };
    assert(!isDebitForResponseWalletCurrencyError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(!isDebitForResponseWalletCurrencyError(buildDebitForResponseWalletBalanceError()));
  });

  await t.step("rejects null", () => {
    assert(!isDebitForResponseWalletCurrencyError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isDebitForResponseWalletCurrencyError("string"));
  });
});

Deno.test("Type Guard: isDebitForResponseWalletBalanceError", async (t) => {
  await t.step("accepts its own builder's instance", () => {
    assert(isDebitForResponseWalletBalanceError(buildDebitForResponseWalletBalanceError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isDebitForResponseWalletBalanceError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildDebitForResponseWalletBalanceError();
    const plain = {
      message: instance.message,
      name: instance.name,
      walletId: instance.walletId,
    };
    assert(!isDebitForResponseWalletBalanceError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(!isDebitForResponseWalletBalanceError(buildDebitForResponseTokenUsageError()));
  });

  await t.step("rejects null", () => {
    assert(!isDebitForResponseWalletBalanceError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isDebitForResponseWalletBalanceError("string"));
  });
});

Deno.test("Type Guard: isDebitForResponseTokenUsageError", async (t) => {
  await t.step("accepts its own builder's instance", () => {
    assert(isDebitForResponseTokenUsageError(buildDebitForResponseTokenUsageError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isDebitForResponseTokenUsageError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildDebitForResponseTokenUsageError();
    const plain = {
      message: instance.message,
      name: instance.name,
      jobId: instance.jobId,
    };
    assert(!isDebitForResponseTokenUsageError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(!isDebitForResponseTokenUsageError(buildDebitForResponseWalletReadError()));
  });

  await t.step("rejects null", () => {
    assert(!isDebitForResponseTokenUsageError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isDebitForResponseTokenUsageError("string"));
  });
});
