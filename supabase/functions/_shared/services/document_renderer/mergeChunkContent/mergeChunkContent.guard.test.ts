import { assertEquals } from "jsr:@std/assert";
import {
  buildDownloadedChunkText,
  buildMergeChunkContentDeps,
  buildMergeChunkContentErrorReturn,
  buildMergeChunkContentParams,
  buildMergeChunkContentPayload,
  buildMergeChunkContentSuccessReturn,
  invalidateDownloadedChunkText,
  invalidateMergeChunkContentDeps,
  invalidateMergeChunkContentErrorReturn,
  invalidateMergeChunkContentParams,
  invalidateMergeChunkContentPayload,
  invalidateMergeChunkContentSuccessReturn,
} from "./mergeChunkContent.mock.ts";
import {
  isDownloadedChunkText,
  isMergeChunkContentDeps,
  isMergeChunkContentErrorReturn,
  isMergeChunkContentParams,
  isMergeChunkContentPayload,
  isMergeChunkContentSuccessReturn,
} from "./mergeChunkContent.guard.ts";

Deno.test("isMergeChunkContentParams accepts a valid built object", () => {
  assertEquals(isMergeChunkContentParams(buildMergeChunkContentParams()), true);
});

Deno.test("isMergeChunkContentParams rejects non-records", () => {
  assertEquals(isMergeChunkContentParams(null), false);
  assertEquals(isMergeChunkContentParams(undefined), false);
  assertEquals(isMergeChunkContentParams(42), false);
  assertEquals(isMergeChunkContentParams("string"), false);
  assertEquals(isMergeChunkContentParams([]), false);
});

Deno.test("isMergeChunkContentParams rejects missing or non-object dbClient", () => {
  const { dbClient: _omitDbClient, ...missingDbClient } = buildMergeChunkContentParams();
  assertEquals(isMergeChunkContentParams(missingDbClient), false);

  assertEquals(
    isMergeChunkContentParams(
      invalidateMergeChunkContentParams({ dbClient: "not-object" }),
    ),
    false,
  );
});

Deno.test("isMergeChunkContentPayload accepts a valid built object", () => {
  assertEquals(isMergeChunkContentPayload(buildMergeChunkContentPayload()), true);
});

Deno.test("isMergeChunkContentPayload rejects non-records", () => {
  assertEquals(isMergeChunkContentPayload(null), false);
  assertEquals(isMergeChunkContentPayload(undefined), false);
  assertEquals(isMergeChunkContentPayload(42), false);
  assertEquals(isMergeChunkContentPayload("string"), false);
  assertEquals(isMergeChunkContentPayload([]), false);
});

Deno.test(
  "isMergeChunkContentPayload rejects missing, empty, or non-array orderedChunks",
  () => {
    const { orderedChunks: _omitOrderedChunks, ...missingOrderedChunks } =
      buildMergeChunkContentPayload();
    assertEquals(isMergeChunkContentPayload(missingOrderedChunks), false);

    assertEquals(
      isMergeChunkContentPayload(
        invalidateMergeChunkContentPayload({ orderedChunks: [] }),
      ),
      false,
    );
    assertEquals(
      isMergeChunkContentPayload(
        invalidateMergeChunkContentPayload({ orderedChunks: "not-array" }),
      ),
      false,
    );
  },
);

Deno.test("isMergeChunkContentSuccessReturn accepts a valid built object", () => {
  assertEquals(
    isMergeChunkContentSuccessReturn(buildMergeChunkContentSuccessReturn()),
    true,
  );
});

Deno.test("isMergeChunkContentSuccessReturn rejects non-records and malformed objects", () => {
  assertEquals(isMergeChunkContentSuccessReturn(null), false);
  assertEquals(isMergeChunkContentSuccessReturn(undefined), false);
  assertEquals(isMergeChunkContentSuccessReturn(42), false);
  assertEquals(isMergeChunkContentSuccessReturn("string"), false);
  assertEquals(isMergeChunkContentSuccessReturn([]), false);

  const { mergedStructuredData: _omitMergedStructuredData, ...missingMergedStructuredData } =
    buildMergeChunkContentSuccessReturn();
  assertEquals(isMergeChunkContentSuccessReturn(missingMergedStructuredData), false);

  assertEquals(
    isMergeChunkContentSuccessReturn(
      invalidateMergeChunkContentSuccessReturn({ mergedStructuredData: "not-record" }),
    ),
    false,
  );
  assertEquals(
    isMergeChunkContentSuccessReturn(buildMergeChunkContentErrorReturn()),
    false,
  );
});

Deno.test("isMergeChunkContentErrorReturn accepts a valid built object", () => {
  assertEquals(
    isMergeChunkContentErrorReturn(buildMergeChunkContentErrorReturn()),
    true,
  );
});

Deno.test("isMergeChunkContentErrorReturn rejects non-records and malformed objects", () => {
  assertEquals(isMergeChunkContentErrorReturn(null), false);
  assertEquals(isMergeChunkContentErrorReturn(undefined), false);
  assertEquals(isMergeChunkContentErrorReturn(42), false);
  assertEquals(isMergeChunkContentErrorReturn("string"), false);
  assertEquals(isMergeChunkContentErrorReturn([]), false);

  const { error: _omitError, ...missingError } = buildMergeChunkContentErrorReturn();
  assertEquals(isMergeChunkContentErrorReturn(missingError), false);

  const { retriable: _omitRetriable, ...missingRetriable } = buildMergeChunkContentErrorReturn();
  assertEquals(isMergeChunkContentErrorReturn(missingRetriable), false);

  assertEquals(
    isMergeChunkContentErrorReturn(
      invalidateMergeChunkContentErrorReturn({ error: "not-an-error" }),
    ),
    false,
  );
  assertEquals(
    isMergeChunkContentErrorReturn(
      invalidateMergeChunkContentErrorReturn({ retriable: "false" }),
    ),
    false,
  );
  assertEquals(
    isMergeChunkContentErrorReturn(buildMergeChunkContentSuccessReturn()),
    false,
  );
});

Deno.test(
  "isMergeChunkContentSuccessReturn and isMergeChunkContentErrorReturn are mutually exclusive",
  () => {
    const success = buildMergeChunkContentSuccessReturn();
    const error = buildMergeChunkContentErrorReturn();
    const both = {
      ...buildMergeChunkContentSuccessReturn(),
      ...buildMergeChunkContentErrorReturn(),
    };

    assertEquals(isMergeChunkContentSuccessReturn(success), true);
    assertEquals(isMergeChunkContentSuccessReturn(error), false);
    assertEquals(isMergeChunkContentSuccessReturn(both), false);

    assertEquals(isMergeChunkContentErrorReturn(error), true);
    assertEquals(isMergeChunkContentErrorReturn(success), false);
    assertEquals(isMergeChunkContentErrorReturn(both), false);

    assertEquals(isMergeChunkContentSuccessReturn({}), false);
    assertEquals(isMergeChunkContentErrorReturn({}), false);
  },
);

Deno.test("isMergeChunkContentDeps accepts a valid built object", () => {
  assertEquals(isMergeChunkContentDeps(buildMergeChunkContentDeps()), true);
});

Deno.test("isMergeChunkContentDeps rejects non-records", () => {
  assertEquals(isMergeChunkContentDeps(null), false);
  assertEquals(isMergeChunkContentDeps(undefined), false);
  assertEquals(isMergeChunkContentDeps(42), false);
  assertEquals(isMergeChunkContentDeps("string"), false);
  assertEquals(isMergeChunkContentDeps([]), false);
});

Deno.test(
  "isMergeChunkContentDeps rejects missing or malformed dependencies",
  () => {
    const { downloadFromStorage: _omitDownload, ...missingDownload } =
      buildMergeChunkContentDeps();
    assertEquals(isMergeChunkContentDeps(missingDownload), false);

    const { logger: _omitLogger, ...missingLogger } = buildMergeChunkContentDeps();
    assertEquals(isMergeChunkContentDeps(missingLogger), false);

    const { sanitizeJsonContent: _omitSanitize, ...missingSanitize } =
      buildMergeChunkContentDeps();
    assertEquals(isMergeChunkContentDeps(missingSanitize), false);

    assertEquals(
      isMergeChunkContentDeps(
        invalidateMergeChunkContentDeps({ downloadFromStorage: "not-function" }),
      ),
      false,
    );
    assertEquals(
      isMergeChunkContentDeps(
        invalidateMergeChunkContentDeps({ logger: "not-logger" }),
      ),
      false,
    );
    assertEquals(
      isMergeChunkContentDeps(
        invalidateMergeChunkContentDeps({ sanitizeJsonContent: "not-function" }),
      ),
      false,
    );
  },
);

Deno.test("isDownloadedChunkText accepts a valid built object", () => {
  assertEquals(isDownloadedChunkText(buildDownloadedChunkText()), true);
});

Deno.test("isDownloadedChunkText rejects non-records", () => {
  assertEquals(isDownloadedChunkText(null), false);
  assertEquals(isDownloadedChunkText(undefined), false);
  assertEquals(isDownloadedChunkText(42), false);
  assertEquals(isDownloadedChunkText("string"), false);
  assertEquals(isDownloadedChunkText([]), false);
});

Deno.test(
  "isDownloadedChunkText rejects missing or non-string fields",
  () => {
    const { chunkId: _omitChunkId, ...missingChunkId } = buildDownloadedChunkText();
    assertEquals(isDownloadedChunkText(missingChunkId), false);

    const { text: _omitText, ...missingText } = buildDownloadedChunkText();
    assertEquals(isDownloadedChunkText(missingText), false);

    const { rawJsonPath: _omitRawJsonPath, ...missingRawJsonPath } =
      buildDownloadedChunkText();
    assertEquals(isDownloadedChunkText(missingRawJsonPath), false);

    assertEquals(
      isDownloadedChunkText(
        invalidateDownloadedChunkText({ chunkId: 42 }),
      ),
      false,
    );
    assertEquals(
      isDownloadedChunkText(
        invalidateDownloadedChunkText({ text: 42 }),
      ),
      false,
    );
    assertEquals(
      isDownloadedChunkText(
        invalidateDownloadedChunkText({ rawJsonPath: 42 }),
      ),
      false,
    );
  },
);
