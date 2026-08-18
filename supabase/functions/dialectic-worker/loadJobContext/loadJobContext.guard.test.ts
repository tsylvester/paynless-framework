import { assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  buildLoadJobContextDeps,
  invalidateLoadJobContextDeps,
  buildLoadJobContextParams,
  invalidateLoadJobContextParams,
  buildLoadJobContextPayload,
  invalidateLoadJobContextPayload,
  buildLoadJobContextSuccessReturn,
  invalidateLoadJobContextSuccessReturn,
  buildLoadJobContextErrorReturn,
  invalidateLoadJobContextErrorReturn,
  buildLoadJobContextJobReadError,
  buildLoadJobContextJobNotFoundError,
  buildLoadJobContextProviderReadError,
  buildLoadJobContextProviderNotFoundError,
  buildLoadJobContextProviderInvalidError,
  buildLoadJobContextConfigInvalidError,
} from "./loadJobContext.mock.ts";
import { invalidateDialecticJobRow } from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import {
  isLoadJobContextDeps,
  isLoadJobContextParams,
  isLoadJobContextPayload,
  isLoadJobContextSuccessReturn,
  isLoadJobContextErrorReturn,
  isLoadJobContextJobReadError,
  isLoadJobContextJobNotFoundError,
  isLoadJobContextProviderReadError,
  isLoadJobContextProviderNotFoundError,
  isLoadJobContextProviderInvalidError,
  isLoadJobContextConfigInvalidError,
} from "./loadJobContext.guard.ts";

Deno.test("Type Guard: isLoadJobContextDeps", async (t) => {
  await t.step("accepts the built deps", () => {
    assert(isLoadJobContextDeps(buildLoadJobContextDeps()));
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextDeps(null));
  });

  await t.step("rejects undefined", () => {
    assert(!isLoadJobContextDeps(undefined));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextDeps(42));
  });

  await t.step("rejects an array", () => {
    assert(!isLoadJobContextDeps([]));
  });
});

Deno.test("Type Guard: isLoadJobContextParams", async (t) => {
  await t.step("accepts the built params", () => {
    assert(isLoadJobContextParams(buildLoadJobContextParams()));
  });

  await t.step("rejects dbClient absent", () => {
    const { dbClient: _omit, ...rest } = buildLoadJobContextParams();
    assert(!isLoadJobContextParams(rest));
  });

  await t.step("rejects dbClient a string", () => {
    assert(
      !isLoadJobContextParams(
        invalidateLoadJobContextParams({ dbClient: "not-a-client" }),
      ),
    );
  });

  await t.step("rejects a non-record root", () => {
    assert(!isLoadJobContextParams(null));
    assert(!isLoadJobContextParams("string"));
    assert(!isLoadJobContextParams(42));
  });
});

Deno.test("Type Guard: isLoadJobContextPayload", async (t) => {
  await t.step("accepts the built payload", () => {
    assert(isLoadJobContextPayload(buildLoadJobContextPayload()));
  });

  await t.step("rejects jobId absent", () => {
    const { jobId: _omit, ...rest } = buildLoadJobContextPayload();
    assert(!isLoadJobContextPayload(rest));
  });

  await t.step("rejects jobId non-string", () => {
    assert(
      !isLoadJobContextPayload(invalidateLoadJobContextPayload({ jobId: 42 })),
    );
  });

  await t.step("rejects jobId the empty string", () => {
    assert(
      !isLoadJobContextPayload(invalidateLoadJobContextPayload({ jobId: "" })),
    );
  });

  await t.step("rejects jobId a whitespace-only string", () => {
    assert(
      !isLoadJobContextPayload(
        invalidateLoadJobContextPayload({ jobId: "   " }),
      ),
    );
  });

  await t.step("rejects a non-record root", () => {
    assert(!isLoadJobContextPayload(null));
    assert(!isLoadJobContextPayload("string"));
    assert(!isLoadJobContextPayload(42));
  });
});

Deno.test("Type Guard: isLoadJobContextSuccessReturn", async (t) => {
  await t.step("accepts the built return", () => {
    assert(isLoadJobContextSuccessReturn(buildLoadJobContextSuccessReturn()));
  });

  await t.step("rejects job set to invalidateDialecticJobRow({ id: 42 })", () => {
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({
          job: invalidateDialecticJobRow({ id: 42 }),
        }),
      ),
    );
  });

  await t.step("rejects providerRow set to the builder's output with a required member rest-destructured away", () => {
    const { id: _omit, ...rest } = buildMockProvider();
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({ providerRow: rest }),
      ),
    );
  });

  await t.step("rejects modelConfig absent", () => {
    const { modelConfig: _omit, ...rest } =
      buildLoadJobContextSuccessReturn();
    assert(!isLoadJobContextSuccessReturn(rest));
  });

  await t.step("rejects modelConfig a plain object failing its owner's guard", () => {
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({
          modelConfig: { corrupted: true },
        }),
      ),
    );
  });

  await t.step("rejects walletId absent", () => {
    const { walletId: _omit, ...rest } = buildLoadJobContextSuccessReturn();
    assert(!isLoadJobContextSuccessReturn(rest));
  });

  await t.step("rejects walletId non-string", () => {
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({ walletId: 42 }),
      ),
    );
  });

  await t.step("rejects walletId empty", () => {
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({ walletId: "" }),
      ),
    );
  });

  await t.step("rejects projectId absent", () => {
    const { projectId: _omit, ...rest } = buildLoadJobContextSuccessReturn();
    assert(!isLoadJobContextSuccessReturn(rest));
  });

  await t.step("rejects projectId non-string", () => {
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({ projectId: 42 }),
      ),
    );
  });

  await t.step("rejects projectId empty", () => {
    assert(
      !isLoadJobContextSuccessReturn(
        invalidateLoadJobContextSuccessReturn({ projectId: "" }),
      ),
    );
  });

  await t.step("rejects a non-record root", () => {
    assert(!isLoadJobContextSuccessReturn(null));
    assert(!isLoadJobContextSuccessReturn("string"));
    assert(!isLoadJobContextSuccessReturn(42));
  });
});

Deno.test("Type Guard: isLoadJobContextErrorReturn", async (t) => {
  await t.step("accepts the built return", () => {
    assert(isLoadJobContextErrorReturn(buildLoadJobContextErrorReturn()));
  });

  await t.step("accepts error a plain Error, the member being typed Error so a propagated census diagnostic is admitted", () => {
    assert(
      isLoadJobContextErrorReturn(
        invalidateLoadJobContextErrorReturn({ error: new Error("plain") }),
      ),
    );
  });

  await t.step("rejects error absent", () => {
    const { error: _omit, ...rest } = buildLoadJobContextErrorReturn();
    assert(!isLoadJobContextErrorReturn(rest));
  });

  await t.step("rejects error a plain object", () => {
    assert(
      !isLoadJobContextErrorReturn(
        invalidateLoadJobContextErrorReturn({ error: { message: "oops" } }),
      ),
    );
  });

  await t.step("rejects error a string", () => {
    assert(
      !isLoadJobContextErrorReturn(
        invalidateLoadJobContextErrorReturn({ error: "string" }),
      ),
    );
  });

  await t.step("rejects retriable absent", () => {
    const { retriable: _omit, ...rest } = buildLoadJobContextErrorReturn();
    assert(!isLoadJobContextErrorReturn(rest));
  });

  await t.step("rejects retriable non-boolean", () => {
    assert(
      !isLoadJobContextErrorReturn(
        invalidateLoadJobContextErrorReturn({ retriable: "yes" }),
      ),
    );
  });

  await t.step("rejects a non-record root", () => {
    assert(!isLoadJobContextErrorReturn(null));
    assert(!isLoadJobContextErrorReturn("string"));
    assert(!isLoadJobContextErrorReturn(42));
  });
});

Deno.test("Type Guard: isLoadJobContextJobReadError", async (t) => {
  await t.step("accepts its builder's instance", () => {
    assert(isLoadJobContextJobReadError(buildLoadJobContextJobReadError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isLoadJobContextJobReadError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildLoadJobContextJobReadError();
    const plain = {
      message: instance.message,
      name: instance.name,
      jobId: instance.jobId,
      driverMessage: instance.driverMessage,
    };
    assert(!isLoadJobContextJobReadError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(
      !isLoadJobContextJobReadError(buildLoadJobContextJobNotFoundError()),
    );
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextJobReadError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextJobReadError("string"));
  });
});

Deno.test("Type Guard: isLoadJobContextJobNotFoundError", async (t) => {
  await t.step("accepts its builder's instance", () => {
    assert(isLoadJobContextJobNotFoundError(buildLoadJobContextJobNotFoundError()));
  });

  await t.step("rejects a plain Error", () => {
    assert(!isLoadJobContextJobNotFoundError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildLoadJobContextJobNotFoundError();
    const plain = {
      message: instance.message,
      name: instance.name,
      jobId: instance.jobId,
    };
    assert(!isLoadJobContextJobNotFoundError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(
      !isLoadJobContextJobNotFoundError(buildLoadJobContextJobReadError()),
    );
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextJobNotFoundError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextJobNotFoundError("string"));
  });
});

Deno.test("Type Guard: isLoadJobContextProviderReadError", async (t) => {
  await t.step("accepts its builder's instance", () => {
    assert(
      isLoadJobContextProviderReadError(buildLoadJobContextProviderReadError()),
    );
  });

  await t.step("rejects a plain Error", () => {
    assert(!isLoadJobContextProviderReadError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildLoadJobContextProviderReadError();
    const plain = {
      message: instance.message,
      name: instance.name,
      modelId: instance.modelId,
      driverMessage: instance.driverMessage,
    };
    assert(!isLoadJobContextProviderReadError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(
      !isLoadJobContextProviderReadError(
        buildLoadJobContextProviderNotFoundError(),
      ),
    );
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextProviderReadError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextProviderReadError("string"));
  });
});

Deno.test("Type Guard: isLoadJobContextProviderNotFoundError", async (t) => {
  await t.step("accepts its builder's instance", () => {
    assert(
      isLoadJobContextProviderNotFoundError(
        buildLoadJobContextProviderNotFoundError(),
      ),
    );
  });

  await t.step("rejects a plain Error", () => {
    assert(!isLoadJobContextProviderNotFoundError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildLoadJobContextProviderNotFoundError();
    const plain = {
      message: instance.message,
      name: instance.name,
      modelId: instance.modelId,
    };
    assert(!isLoadJobContextProviderNotFoundError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(
      !isLoadJobContextProviderNotFoundError(
        buildLoadJobContextProviderReadError(),
      ),
    );
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextProviderNotFoundError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextProviderNotFoundError("string"));
  });
});

Deno.test("Type Guard: isLoadJobContextProviderInvalidError", async (t) => {
  await t.step("accepts its builder's instance", () => {
    assert(
      isLoadJobContextProviderInvalidError(
        buildLoadJobContextProviderInvalidError(),
      ),
    );
  });

  await t.step("rejects a plain Error", () => {
    assert(!isLoadJobContextProviderInvalidError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildLoadJobContextProviderInvalidError();
    const plain = {
      message: instance.message,
      name: instance.name,
      modelId: instance.modelId,
    };
    assert(!isLoadJobContextProviderInvalidError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(
      !isLoadJobContextProviderInvalidError(
        buildLoadJobContextConfigInvalidError(),
      ),
    );
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextProviderInvalidError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextProviderInvalidError("string"));
  });
});

Deno.test("Type Guard: isLoadJobContextConfigInvalidError", async (t) => {
  await t.step("accepts its builder's instance", () => {
    assert(
      isLoadJobContextConfigInvalidError(
        buildLoadJobContextConfigInvalidError(),
      ),
    );
  });

  await t.step("rejects a plain Error", () => {
    assert(!isLoadJobContextConfigInvalidError(new Error("plain")));
  });

  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildLoadJobContextConfigInvalidError();
    const plain = {
      message: instance.message,
      name: instance.name,
      modelId: instance.modelId,
    };
    assert(!isLoadJobContextConfigInvalidError(plain));
  });

  await t.step("rejects another owned error of this module", () => {
    assert(
      !isLoadJobContextConfigInvalidError(
        buildLoadJobContextProviderInvalidError(),
      ),
    );
  });

  await t.step("rejects null", () => {
    assert(!isLoadJobContextConfigInvalidError(null));
  });

  await t.step("rejects a primitive", () => {
    assert(!isLoadJobContextConfigInvalidError("string"));
  });
});
