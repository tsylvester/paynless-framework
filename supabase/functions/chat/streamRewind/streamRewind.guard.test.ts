import { assertEquals } from "jsr:@std/assert@0.225.3";
import {
  isStreamRewindDeps,
  isStreamRewindPayload,
  isStreamRewindReturn,
} from "./streamRewind.guard.ts";
import {
  buildContractStreamRewindDeps,
  buildContractStreamRewindPayload,
  buildStreamRewindDepsMalformedAdminTokenWallet,
  buildStreamRewindDepsMissingAdminTokenWallet,
  buildStreamRewindDepsMissingCountTokens,
  buildStreamRewindDepsMissingCreateErrorResponse,
  buildStreamRewindDepsMissingDebitTokens,
  buildStreamRewindDepsMissingGetMaxOutputTokens,
  buildStreamRewindDepsMissingLogger,
} from "./streamRewind.mock.ts";
import {
  StreamRewindPayload,
  StreamRewindReturn,
} from "./streamRewind.interface.ts";

Deno.test(
  "isStreamRewindDeps returns true when value matches StreamRewindDeps shape",
  () => {
    assertEquals(isStreamRewindDeps(buildContractStreamRewindDeps()), true);
  },
);

Deno.test("isStreamRewindDeps returns false for null", () => {
  assertEquals(isStreamRewindDeps(null), false);
});

Deno.test("isStreamRewindDeps returns false for empty object", () => {
  assertEquals(isStreamRewindDeps({}), false);
});

Deno.test(
  "isStreamRewindDeps returns false when adminTokenWalletService key is absent",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMissingAdminTokenWallet()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when logger key is absent",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMissingLogger()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when countTokens key is absent",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMissingCountTokens()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when debitTokens key is absent",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMissingDebitTokens()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when createErrorResponse key is absent",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMissingCreateErrorResponse()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when getMaxOutputTokens key is absent",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMissingGetMaxOutputTokens()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when adminTokenWalletService is present but not IAdminTokenWalletService shape",
  () => {
    assertEquals(
      isStreamRewindDeps(buildStreamRewindDepsMalformedAdminTokenWallet()),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindDeps returns false when value is not a non-null object record",
  () => {
    assertEquals(isStreamRewindDeps(0), false);
  },
);

Deno.test(
  "isStreamRewindPayload returns true for value with ChatApiRequest requestBody",
  () => {
    const payload: StreamRewindPayload = buildContractStreamRewindPayload();
    assertEquals(isStreamRewindPayload(payload), true);
  },
);

Deno.test("isStreamRewindPayload returns false for null", () => {
  assertEquals(isStreamRewindPayload(null), false);
});

Deno.test("isStreamRewindPayload returns false for empty object", () => {
  assertEquals(isStreamRewindPayload({}), false);
});

Deno.test(
  "isStreamRewindPayload returns false when requestBody is missing required strings",
  () => {
    assertEquals(
      isStreamRewindPayload({
        requestBody: { message: "x", providerId: "p" },
      }),
      false,
    );
  },
);

Deno.test(
  "isStreamRewindReturn returns true for Response",
  () => {
    const value: StreamRewindReturn = new Response(null, { status: 200 });
    assertEquals(isStreamRewindReturn(value), true);
  },
);

Deno.test(
  "isStreamRewindReturn returns true for Error",
  () => {
    const value: StreamRewindReturn = new Error("guard-return");
    assertEquals(isStreamRewindReturn(value), true);
  },
);

Deno.test("isStreamRewindReturn returns false for null", () => {
  assertEquals(isStreamRewindReturn(null), false);
});

Deno.test("isStreamRewindReturn returns false for plain record", () => {
  assertEquals(isStreamRewindReturn({}), false);
});
