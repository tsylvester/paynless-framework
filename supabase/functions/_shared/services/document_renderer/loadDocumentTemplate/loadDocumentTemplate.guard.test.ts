import { assertEquals } from "jsr:@std/assert";
import {
  buildLoadDocumentTemplateErrorReturn,
  buildLoadDocumentTemplateParams,
  buildLoadDocumentTemplatePayload,
  buildLoadDocumentTemplateSuccessReturn,
  invalidateLoadDocumentTemplateErrorReturn,
  invalidateLoadDocumentTemplateParams,
  invalidateLoadDocumentTemplatePayload,
  invalidateLoadDocumentTemplateSuccessReturn,
} from "./loadDocumentTemplate.mock.ts";
import {
  isLoadDocumentTemplateErrorReturn,
  isLoadDocumentTemplateParams,
  isLoadDocumentTemplatePayload,
  isLoadDocumentTemplateSuccessReturn,
} from "./loadDocumentTemplate.guard.ts";

Deno.test("isLoadDocumentTemplateParams accepts a valid built object", () => {
  assertEquals(isLoadDocumentTemplateParams(buildLoadDocumentTemplateParams()), true);
});

Deno.test("isLoadDocumentTemplateParams rejects non-records", () => {
  assertEquals(isLoadDocumentTemplateParams(null), false);
  assertEquals(isLoadDocumentTemplateParams(undefined), false);
  assertEquals(isLoadDocumentTemplateParams(42), false);
  assertEquals(isLoadDocumentTemplateParams("string"), false);
  assertEquals(isLoadDocumentTemplateParams([]), false);
});

Deno.test("isLoadDocumentTemplateParams rejects missing or non-object dbClient", () => {
  const { dbClient: _omitDbClient, ...missingDbClient } = buildLoadDocumentTemplateParams();
  assertEquals(isLoadDocumentTemplateParams(missingDbClient), false);

  assertEquals(
    isLoadDocumentTemplateParams(
      invalidateLoadDocumentTemplateParams({ dbClient: "not-object" }),
    ),
    false,
  );
});

Deno.test("isLoadDocumentTemplatePayload accepts a valid built object", () => {
  assertEquals(isLoadDocumentTemplatePayload(buildLoadDocumentTemplatePayload()), true);
});

Deno.test("isLoadDocumentTemplatePayload rejects non-records", () => {
  assertEquals(isLoadDocumentTemplatePayload(null), false);
  assertEquals(isLoadDocumentTemplatePayload(undefined), false);
  assertEquals(isLoadDocumentTemplatePayload(42), false);
  assertEquals(isLoadDocumentTemplatePayload("string"), false);
  assertEquals(isLoadDocumentTemplatePayload([]), false);
});

Deno.test(
  "isLoadDocumentTemplatePayload rejects missing or empty required string fields",
  () => {
    const { projectId: _omitProjectId, ...missingProjectId } = buildLoadDocumentTemplatePayload();
    assertEquals(isLoadDocumentTemplatePayload(missingProjectId), false);

    const { templateFilename: _omitTemplateFilename, ...missingTemplateFilename } = buildLoadDocumentTemplatePayload();
    assertEquals(isLoadDocumentTemplatePayload(missingTemplateFilename), false);

    assertEquals(
      isLoadDocumentTemplatePayload(
        invalidateLoadDocumentTemplatePayload({ projectId: "" }),
      ),
      false,
    );
    assertEquals(
      isLoadDocumentTemplatePayload(
        invalidateLoadDocumentTemplatePayload({ templateFilename: "" }),
      ),
      false,
    );
    assertEquals(
      isLoadDocumentTemplatePayload(
        invalidateLoadDocumentTemplatePayload({ projectId: 42 }),
      ),
      false,
    );
    assertEquals(
      isLoadDocumentTemplatePayload(
        invalidateLoadDocumentTemplatePayload({ templateFilename: 42 }),
      ),
      false,
    );
  },
);

Deno.test("isLoadDocumentTemplateSuccessReturn accepts a valid built object", () => {
  assertEquals(
    isLoadDocumentTemplateSuccessReturn(buildLoadDocumentTemplateSuccessReturn()),
    true,
  );
});

Deno.test("isLoadDocumentTemplateSuccessReturn rejects non-records and malformed objects", () => {
  assertEquals(isLoadDocumentTemplateSuccessReturn(null), false);
  assertEquals(isLoadDocumentTemplateSuccessReturn(undefined), false);
  assertEquals(isLoadDocumentTemplateSuccessReturn(42), false);
  assertEquals(isLoadDocumentTemplateSuccessReturn("string"), false);
  assertEquals(isLoadDocumentTemplateSuccessReturn([]), false);

  const { templateText: _omitTemplateText, ...missingTemplateText } = buildLoadDocumentTemplateSuccessReturn();
  assertEquals(isLoadDocumentTemplateSuccessReturn(missingTemplateText), false);

  assertEquals(
    isLoadDocumentTemplateSuccessReturn(
      invalidateLoadDocumentTemplateSuccessReturn({ templateText: 123 }),
    ),
    false,
  );
  assertEquals(
    isLoadDocumentTemplateSuccessReturn(buildLoadDocumentTemplateErrorReturn()),
    false,
  );
});

Deno.test("isLoadDocumentTemplateErrorReturn accepts a valid built object", () => {
  assertEquals(
    isLoadDocumentTemplateErrorReturn(buildLoadDocumentTemplateErrorReturn()),
    true,
  );
});

Deno.test("isLoadDocumentTemplateErrorReturn rejects non-records and malformed objects", () => {
  assertEquals(isLoadDocumentTemplateErrorReturn(null), false);
  assertEquals(isLoadDocumentTemplateErrorReturn(undefined), false);
  assertEquals(isLoadDocumentTemplateErrorReturn(42), false);
  assertEquals(isLoadDocumentTemplateErrorReturn("string"), false);
  assertEquals(isLoadDocumentTemplateErrorReturn([]), false);

  const { error: _omitError, ...missingError } = buildLoadDocumentTemplateErrorReturn();
  assertEquals(isLoadDocumentTemplateErrorReturn(missingError), false);

  const { retriable: _omitRetriable, ...missingRetriable } = buildLoadDocumentTemplateErrorReturn();
  assertEquals(isLoadDocumentTemplateErrorReturn(missingRetriable), false);

  assertEquals(
    isLoadDocumentTemplateErrorReturn(
      invalidateLoadDocumentTemplateErrorReturn({ error: null }),
    ),
    false,
  );
  assertEquals(
    isLoadDocumentTemplateErrorReturn(
      invalidateLoadDocumentTemplateErrorReturn({ retriable: "false" }),
    ),
    false,
  );
});

Deno.test(
  "isLoadDocumentTemplateSuccessReturn and isLoadDocumentTemplateErrorReturn are mutually exclusive",
  () => {
    const success = buildLoadDocumentTemplateSuccessReturn();
    const error = buildLoadDocumentTemplateErrorReturn();
    const both = {
      ...buildLoadDocumentTemplateSuccessReturn(),
      ...buildLoadDocumentTemplateErrorReturn(),
    };

    assertEquals(isLoadDocumentTemplateSuccessReturn(success), true);
    assertEquals(isLoadDocumentTemplateSuccessReturn(error), false);
    assertEquals(isLoadDocumentTemplateSuccessReturn(both), false);

    assertEquals(isLoadDocumentTemplateErrorReturn(error), true);
    assertEquals(isLoadDocumentTemplateErrorReturn(success), false);
    assertEquals(isLoadDocumentTemplateErrorReturn(both), false);

    assertEquals(isLoadDocumentTemplateSuccessReturn({}), false);
    assertEquals(isLoadDocumentTemplateErrorReturn({}), false);
  },
);
