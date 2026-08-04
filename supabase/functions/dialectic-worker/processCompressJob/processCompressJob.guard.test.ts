import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
  isBoundProcessCompressJobFn,
  isProcessCompressJobDeps,
  isProcessCompressJobErrorReturn,
  isProcessCompressJobFn,
  isProcessCompressJobParams,
  isProcessCompressJobPayload,
  isProcessCompressJobReturn,
  isProcessCompressJobSuccessReturn,
} from "./processCompressJob.guard.ts";
import {
  buildProcessCompressJobDeps,
  buildProcessCompressJobErrorReturn,
  buildProcessCompressJobParams,
  buildProcessCompressJobSuccessReturn,
  invalidateProcessCompressJobDeps,
  invalidateProcessCompressJobErrorReturn,
  invalidateProcessCompressJobParams,
  invalidateProcessCompressJobSuccessReturn,
  mockProcessCompressJobFn,
} from "./processCompressJob.mock.ts";

Deno.test("isProcessCompressJobDeps accepts full deps", () => {
  assertEquals(isProcessCompressJobDeps(buildProcessCompressJobDeps()), true);
});

Deno.test("isProcessCompressJobDeps rejects non-record roots", () => {
  assertEquals(isProcessCompressJobDeps(null), false);
  assertEquals(isProcessCompressJobDeps("x"), false);
});

Deno.test(
  "isProcessCompressJobDeps rejects undefined assembleCompressionPrompt",
  () => {
    assertEquals(
      isProcessCompressJobDeps(
        buildProcessCompressJobDeps({ assembleCompressionPrompt: undefined }),
      ),
      false,
    );
  },
);

Deno.test("isProcessCompressJobDeps rejects null enqueueModelCall", () => {
  assertEquals(
    isProcessCompressJobDeps(
      invalidateProcessCompressJobDeps({ enqueueModelCall: null }),
    ),
    false,
  );
});

Deno.test("isProcessCompressJobDeps rejects undefined countTokens", () => {
  assertEquals(
    isProcessCompressJobDeps(
      buildProcessCompressJobDeps({ countTokens: undefined }),
    ),
    false,
  );
});

Deno.test("isProcessCompressJobDeps rejects null constructStoragePath", () => {
  assertEquals(
    isProcessCompressJobDeps(
      invalidateProcessCompressJobDeps({ constructStoragePath: null }),
    ),
    false,
  );
});

Deno.test("isProcessCompressJobDeps rejects undefined logger", () => {
  assertEquals(
    isProcessCompressJobDeps(buildProcessCompressJobDeps({ logger: undefined })),
    false,
  );
});

Deno.test("isProcessCompressJobDeps rejects undefined getEncoding", () => {
  assertEquals(
    isProcessCompressJobDeps(buildProcessCompressJobDeps({ getEncoding: undefined })),
    false,
  );
});

Deno.test("isProcessCompressJobDeps rejects null countTokensAnthropic", () => {
  assertEquals(
    isProcessCompressJobDeps(invalidateProcessCompressJobDeps({ countTokensAnthropic: null })),
    false,
  );
});

Deno.test(
  "isProcessCompressJobDeps rejects omitted assembleContinuationPrompt",
  () => {
    const { assembleContinuationPrompt: _omit, ...missing } = buildProcessCompressJobDeps();
    assertEquals(isProcessCompressJobDeps(missing), false);
  },
);

Deno.test(
  "isProcessCompressJobDeps rejects non-function assembleContinuationPrompt",
  () => {
    assertEquals(
      isProcessCompressJobDeps(
        invalidateProcessCompressJobDeps({ assembleContinuationPrompt: "not-a-function" }),
      ),
      false,
    );
  },
);

Deno.test("isProcessCompressJobParams accepts full params", () => {
  assertEquals(isProcessCompressJobParams(buildProcessCompressJobParams()), true);
});

Deno.test("isProcessCompressJobParams rejects non-record roots", () => {
  assertEquals(isProcessCompressJobParams(null), false);
  assertEquals(isProcessCompressJobParams("x"), false);
});

Deno.test("isProcessCompressJobParams rejects null dbClient", () => {
  assertEquals(
    isProcessCompressJobParams(invalidateProcessCompressJobParams({ dbClient: null })),
    false,
  );
});

Deno.test("isProcessCompressJobParams rejects undefined jobId", () => {
  assertEquals(
    isProcessCompressJobParams(buildProcessCompressJobParams({ job: undefined })),
    false,
  );
});

Deno.test("isProcessCompressJobParams rejects null projectOwnerUserId", () => {
  assertEquals(
    isProcessCompressJobParams(
      invalidateProcessCompressJobParams({ projectOwnerUserId: null }),
    ),
    false,
  );
});

Deno.test("isProcessCompressJobParams rejects empty authToken", () => {
  assertEquals(
    isProcessCompressJobParams(
      buildProcessCompressJobParams({ authToken: "" }),
    ),
    false,
  );
});

Deno.test("isProcessCompressJobPayload accepts full payload", () => {
  assertEquals(
    isProcessCompressJobPayload(buildDialecticCompressJobPayload()),
    true,
  );
});

Deno.test("isProcessCompressJobPayload rejects non-record roots", () => {
  assertEquals(isProcessCompressJobPayload(null), false);
  assertEquals(isProcessCompressJobPayload("x"), false);
});

Deno.test("isProcessCompressJobReturn accepts full success", () => {
  assertEquals(
    isProcessCompressJobReturn(buildProcessCompressJobSuccessReturn()),
    true,
  );
});

Deno.test("isProcessCompressJobReturn accepts full error", () => {
  assertEquals(
    isProcessCompressJobReturn(buildProcessCompressJobErrorReturn()),
    true,
  );
});

Deno.test("isProcessCompressJobReturn rejects non-record roots", () => {
  assertEquals(isProcessCompressJobReturn(null), false);
  assertEquals(isProcessCompressJobReturn("x"), false);
});

Deno.test("isProcessCompressJobFn accepts full fn", () => {
  assertEquals(isProcessCompressJobFn(mockProcessCompressJobFn), true);
});

Deno.test("isProcessCompressJobFn rejects non-function roots", () => {
  assertEquals(isProcessCompressJobFn(null), false);
  assertEquals(isProcessCompressJobFn("x"), false);
});

Deno.test("isBoundProcessCompressJobFn accepts full fn", () => {
  assertEquals(
    isBoundProcessCompressJobFn(mockProcessCompressJobFn),
    true,
  );
});

Deno.test("isBoundProcessCompressJobFn rejects non-function roots", () => {
  assertEquals(isBoundProcessCompressJobFn(null), false);
  assertEquals(isBoundProcessCompressJobFn("x"), false);
});

Deno.test("isProcessCompressJobSuccessReturn accepts full success", () => {
  assertEquals(
    isProcessCompressJobSuccessReturn(buildProcessCompressJobSuccessReturn()),
    true,
  );
});

Deno.test("isProcessCompressJobSuccessReturn rejects non-record roots", () => {
  assertEquals(isProcessCompressJobSuccessReturn(null), false);
  assertEquals(isProcessCompressJobSuccessReturn("x"), false);
});

Deno.test(
  "isProcessCompressJobSuccessReturn rejects undefined queued",
  () => {
    assertEquals(
      isProcessCompressJobSuccessReturn(
        buildProcessCompressJobSuccessReturn({ queued: undefined }),
      ),
      false,
    );
  },
);

Deno.test("isProcessCompressJobSuccessReturn rejects null queued", () => {
  assertEquals(
    isProcessCompressJobSuccessReturn(
      invalidateProcessCompressJobSuccessReturn({ queued: null }),
    ),
    false,
  );
});

Deno.test(
  "isProcessCompressJobSuccessReturn rejects error-present value",
  () => {
    assertEquals(
      isProcessCompressJobSuccessReturn(buildProcessCompressJobErrorReturn()),
      false,
    );
  },
);

Deno.test("isProcessCompressJobErrorReturn accepts full error", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(buildProcessCompressJobErrorReturn()),
    true,
  );
});

Deno.test("isProcessCompressJobErrorReturn rejects non-record roots", () => {
  assertEquals(isProcessCompressJobErrorReturn(null), false);
  assertEquals(isProcessCompressJobErrorReturn("x"), false);
});

Deno.test(
  "isProcessCompressJobErrorReturn rejects undefined error",
  () => {
    assertEquals(
      isProcessCompressJobErrorReturn(
        buildProcessCompressJobErrorReturn({ error: undefined }),
      ),
      false,
    );
  },
);

Deno.test("isProcessCompressJobErrorReturn rejects null error", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(
      invalidateProcessCompressJobErrorReturn({ error: null }),
    ),
    false,
  );
});

Deno.test(
  "isProcessCompressJobErrorReturn rejects undefined retriable",
  () => {
    assertEquals(
      isProcessCompressJobErrorReturn(
        buildProcessCompressJobErrorReturn({ retriable: undefined }),
      ),
      false,
    );
  },
);

Deno.test("isProcessCompressJobErrorReturn rejects null retriable", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(
      invalidateProcessCompressJobErrorReturn({ retriable: null }),
    ),
    false,
  );
});

Deno.test(
  "isProcessCompressJobErrorReturn rejects success-present value",
  () => {
    assertEquals(
      isProcessCompressJobErrorReturn(buildProcessCompressJobSuccessReturn()),
      false,
    );
  },
);
