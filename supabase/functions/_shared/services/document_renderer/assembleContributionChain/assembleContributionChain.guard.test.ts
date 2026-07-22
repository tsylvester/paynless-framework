import { assertEquals } from "jsr:@std/assert";
import {
  buildAssembleContributionChainErrorReturn,
  buildAssembleContributionChainParams,
  buildAssembleContributionChainPayload,
  buildAssembleContributionChainSuccessReturn,
  invalidateAssembleContributionChainErrorReturn,
  invalidateAssembleContributionChainParams,
  invalidateAssembleContributionChainPayload,
  invalidateAssembleContributionChainSuccessReturn,
} from "./assembleContributionChain.mock.ts";
import {
  isAssembleContributionChainErrorReturn,
  isAssembleContributionChainParams,
  isAssembleContributionChainPayload,
  isAssembleContributionChainSuccessReturn,
} from "./assembleContributionChain.guard.ts";

Deno.test("isAssembleContributionChainParams accepts a valid built object", () => {
  assertEquals(isAssembleContributionChainParams(buildAssembleContributionChainParams()), true);
});

Deno.test("isAssembleContributionChainParams rejects non-records", () => {
  assertEquals(isAssembleContributionChainParams(null), false);
  assertEquals(isAssembleContributionChainParams(undefined), false);
  assertEquals(isAssembleContributionChainParams(42), false);
  assertEquals(isAssembleContributionChainParams("string"), false);
  assertEquals(isAssembleContributionChainParams([]), false);
});

Deno.test(
  "isAssembleContributionChainParams rejects missing or non-object dbClient",
  () => {
    const { dbClient: _omitDbClient, ...missingDbClient } = buildAssembleContributionChainParams();
    assertEquals(isAssembleContributionChainParams(missingDbClient), false);

    assertEquals(
      isAssembleContributionChainParams(
        invalidateAssembleContributionChainParams({ dbClient: "not-object" }),
      ),
      false,
    );
  },
);

Deno.test("isAssembleContributionChainPayload accepts a valid built object", () => {
  assertEquals(isAssembleContributionChainPayload(buildAssembleContributionChainPayload()), true);
});

Deno.test("isAssembleContributionChainPayload rejects non-records", () => {
  assertEquals(isAssembleContributionChainPayload(null), false);
  assertEquals(isAssembleContributionChainPayload(undefined), false);
  assertEquals(isAssembleContributionChainPayload(42), false);
  assertEquals(isAssembleContributionChainPayload("string"), false);
  assertEquals(isAssembleContributionChainPayload([]), false);
});

Deno.test(
  "isAssembleContributionChainPayload rejects missing or empty required fields",
  () => {
    const { sessionId: _omitSessionId, ...missingSessionId } = buildAssembleContributionChainPayload();
    assertEquals(isAssembleContributionChainPayload(missingSessionId), false);

    const { stageSlug: _omitStageSlug, ...missingStageSlug } = buildAssembleContributionChainPayload();
    assertEquals(isAssembleContributionChainPayload(missingStageSlug), false);

    const { documentIdentity: _omitDocumentIdentity, ...missingDocumentIdentity } =
      buildAssembleContributionChainPayload();
    assertEquals(isAssembleContributionChainPayload(missingDocumentIdentity), false);

    const { iterationNumber: _omitIterationNumber, ...missingIterationNumber } =
      buildAssembleContributionChainPayload();
    assertEquals(isAssembleContributionChainPayload(missingIterationNumber), false);

    assertEquals(
      isAssembleContributionChainPayload(
        invalidateAssembleContributionChainPayload({ sessionId: "" }),
      ),
      false,
    );
    assertEquals(
      isAssembleContributionChainPayload(
        invalidateAssembleContributionChainPayload({ documentIdentity: "" }),
      ),
      false,
    );
    assertEquals(
      isAssembleContributionChainPayload(
        invalidateAssembleContributionChainPayload({ stageSlug: "" }),
      ),
      false,
    );
    assertEquals(
      isAssembleContributionChainPayload(
        invalidateAssembleContributionChainPayload({ iterationNumber: "not-a-number" }),
      ),
      false,
    );
  },
);

Deno.test("isAssembleContributionChainSuccessReturn accepts a valid built object", () => {
  assertEquals(
    isAssembleContributionChainSuccessReturn(buildAssembleContributionChainSuccessReturn()),
    true,
  );
});

Deno.test("isAssembleContributionChainSuccessReturn rejects non-records and malformed objects", () => {
  assertEquals(isAssembleContributionChainSuccessReturn(null), false);
  assertEquals(isAssembleContributionChainSuccessReturn(undefined), false);
  assertEquals(isAssembleContributionChainSuccessReturn(42), false);
  assertEquals(isAssembleContributionChainSuccessReturn("string"), false);
  assertEquals(isAssembleContributionChainSuccessReturn([]), false);

  const { orderedChunks: _omitOrderedChunks, ...missingOrderedChunks } =
    buildAssembleContributionChainSuccessReturn();
  assertEquals(isAssembleContributionChainSuccessReturn(missingOrderedChunks), false);

  assertEquals(
    isAssembleContributionChainSuccessReturn(
      invalidateAssembleContributionChainSuccessReturn({ orderedChunks: "not-array" }),
    ),
    false,
  );
  assertEquals(
    isAssembleContributionChainSuccessReturn(buildAssembleContributionChainErrorReturn()),
    false,
  );
});

Deno.test("isAssembleContributionChainErrorReturn accepts a valid built object", () => {
  assertEquals(
    isAssembleContributionChainErrorReturn(buildAssembleContributionChainErrorReturn()),
    true,
  );
});

Deno.test("isAssembleContributionChainErrorReturn rejects non-records and malformed objects", () => {
  assertEquals(isAssembleContributionChainErrorReturn(null), false);
  assertEquals(isAssembleContributionChainErrorReturn(undefined), false);
  assertEquals(isAssembleContributionChainErrorReturn(42), false);
  assertEquals(isAssembleContributionChainErrorReturn("string"), false);
  assertEquals(isAssembleContributionChainErrorReturn([]), false);

  const { error: _omitError, ...missingError } = buildAssembleContributionChainErrorReturn();
  assertEquals(isAssembleContributionChainErrorReturn(missingError), false);

  const { retriable: _omitRetriable, ...missingRetriable } = buildAssembleContributionChainErrorReturn();
  assertEquals(isAssembleContributionChainErrorReturn(missingRetriable), false);

  assertEquals(
    isAssembleContributionChainErrorReturn(
      invalidateAssembleContributionChainErrorReturn({ error: "not-an-error" }),
    ),
    false,
  );
  assertEquals(
    isAssembleContributionChainErrorReturn(
      invalidateAssembleContributionChainErrorReturn({ retriable: "false" }),
    ),
    false,
  );
  assertEquals(
    isAssembleContributionChainErrorReturn(buildAssembleContributionChainSuccessReturn()),
    false,
  );
});

Deno.test(
  "isAssembleContributionChainSuccessReturn and isAssembleContributionChainErrorReturn are mutually exclusive",
  () => {
    const success = buildAssembleContributionChainSuccessReturn();
    const error = buildAssembleContributionChainErrorReturn();
    const both = {
      ...buildAssembleContributionChainSuccessReturn(),
      ...buildAssembleContributionChainErrorReturn(),
    };

    assertEquals(isAssembleContributionChainSuccessReturn(success), true);
    assertEquals(isAssembleContributionChainSuccessReturn(error), false);
    assertEquals(isAssembleContributionChainSuccessReturn(both), false);

    assertEquals(isAssembleContributionChainErrorReturn(error), true);
    assertEquals(isAssembleContributionChainErrorReturn(success), false);
    assertEquals(isAssembleContributionChainErrorReturn(both), false);

    assertEquals(isAssembleContributionChainSuccessReturn({}), false);
    assertEquals(isAssembleContributionChainErrorReturn({}), false);
  },
);
