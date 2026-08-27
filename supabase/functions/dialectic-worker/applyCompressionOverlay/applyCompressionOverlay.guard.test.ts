import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import {
  isApplyCompressionOverlayDeps,
  isApplyCompressionOverlayParams,
  isApplyCompressionOverlayPayload,
  isApplyCompressionOverlaySuccessReturn,
  isApplyCompressionOverlayErrorReturn,
} from "./applyCompressionOverlay.guard.ts";
import {
  buildApplyCompressionOverlayDeps,
  buildApplyCompressionOverlayParams,
  buildApplyCompressionOverlayPayload,
  buildApplyCompressionOverlaySuccessReturn,
  buildApplyCompressionOverlayErrorReturn,
  invalidateApplyCompressionOverlayDeps,
  invalidateApplyCompressionOverlayParams,
  invalidateApplyCompressionOverlayPayload,
  invalidateApplyCompressionOverlaySuccessReturn,
  invalidateApplyCompressionOverlayErrorReturn,
} from "./applyCompressionOverlay.mock.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";

const mockDbClient = (): SupabaseClient<Database> =>
  createMockSupabaseClient().client as unknown as SupabaseClient<Database>;

// --- isApplyCompressionOverlayDeps ---

/** the builder's valid default is accepted. */
Deno.test("isApplyCompressionOverlayDeps accepts the valid default", () => {
  assertEquals(isApplyCompressionOverlayDeps(buildApplyCompressionOverlayDeps()), true);
});

/** valid overrides are accepted. */
Deno.test("isApplyCompressionOverlayDeps accepts valid overrides", () => {
  const deps = buildApplyCompressionOverlayDeps({
    downloadFromStorage: createMockDownloadFromStorage({ mode: "empty" }),
  });
  assertEquals(isApplyCompressionOverlayDeps(deps), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isApplyCompressionOverlayDeps rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isApplyCompressionOverlayDeps(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayDeps rejects each corrupted property", () => {
  assertEquals(
    isApplyCompressionOverlayDeps(
      invalidateApplyCompressionOverlayDeps({ logger: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayDeps(
      invalidateApplyCompressionOverlayDeps({ downloadFromStorage: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayDeps rejects each omitted required property", () => {
  const { logger: _l, ...missingLogger } = buildApplyCompressionOverlayDeps();
  assertEquals(isApplyCompressionOverlayDeps(missingLogger), false);
  const { downloadFromStorage: _d, ...missingDownload } =
    buildApplyCompressionOverlayDeps();
  assertEquals(isApplyCompressionOverlayDeps(missingDownload), false);
});

// --- isApplyCompressionOverlayParams ---

/** the builder's valid default is accepted. */
Deno.test("isApplyCompressionOverlayParams accepts the valid default", () => {
  assertEquals(
    isApplyCompressionOverlayParams(buildApplyCompressionOverlayParams()),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isApplyCompressionOverlayParams accepts valid overrides", () => {
  const params = buildApplyCompressionOverlayParams({
    projectId: "project-xyz",
  });
  assertEquals(isApplyCompressionOverlayParams(params), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isApplyCompressionOverlayParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isApplyCompressionOverlayParams(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayParams rejects each corrupted property", () => {
  assertEquals(
    isApplyCompressionOverlayParams(
      invalidateApplyCompressionOverlayParams({ dbClient: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayParams(
      invalidateApplyCompressionOverlayParams({ projectId: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayParams(
      invalidateApplyCompressionOverlayParams({ sessionId: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayParams(
      invalidateApplyCompressionOverlayParams({ iterationNumber: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayParams(
      invalidateApplyCompressionOverlayParams({ stageSlug: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayParams(
      invalidateApplyCompressionOverlayParams({ output_type: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayParams rejects each omitted required property", () => {
  const built = buildApplyCompressionOverlayParams();
  const { dbClient: _a, ...missingDbClient } = built;
  assertEquals(isApplyCompressionOverlayParams(missingDbClient), false);
  const { projectId: _b, ...missingProjectId } = built;
  assertEquals(isApplyCompressionOverlayParams(missingProjectId), false);
  const { sessionId: _c, ...missingSessionId } = built;
  assertEquals(isApplyCompressionOverlayParams(missingSessionId), false);
  const { iterationNumber: _d, ...missingIteration } = built;
  assertEquals(isApplyCompressionOverlayParams(missingIteration), false);
  const { stageSlug: _e, ...missingStageSlug } = built;
  assertEquals(isApplyCompressionOverlayParams(missingStageSlug), false);
  const { output_type: _f, ...missingOutputType } = built;
  assertEquals(isApplyCompressionOverlayParams(missingOutputType), false);
});

// --- isApplyCompressionOverlayPayload ---

/** the builder's valid default is accepted. */
Deno.test("isApplyCompressionOverlayPayload accepts the valid default", () => {
  assertEquals(
    isApplyCompressionOverlayPayload(buildApplyCompressionOverlayPayload()),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isApplyCompressionOverlayPayload accepts valid overrides", () => {
  const payload = buildApplyCompressionOverlayPayload({
    resourceDocuments: [
      { id: "doc-1", content: "content", document_key: FileType.business_case, stage_slug: DialecticStageSlug.Thesis, type: "document" },
    ],
  });
  assertEquals(isApplyCompressionOverlayPayload(payload), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isApplyCompressionOverlayPayload rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isApplyCompressionOverlayPayload(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayPayload rejects each corrupted property", () => {
  assertEquals(
    isApplyCompressionOverlayPayload(
      invalidateApplyCompressionOverlayPayload({ resourceDocuments: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayPayload(
      invalidateApplyCompressionOverlayPayload({ conversationHistory: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayPayload rejects each omitted required property", () => {
  const { resourceDocuments: _a, ...missingDocs } =
    buildApplyCompressionOverlayPayload();
  assertEquals(isApplyCompressionOverlayPayload(missingDocs), false);
  const { conversationHistory: _b, ...missingHistory } =
    buildApplyCompressionOverlayPayload();
  assertEquals(isApplyCompressionOverlayPayload(missingHistory), false);
});

// --- isApplyCompressionOverlaySuccessReturn ---

/** the builder's valid default is accepted. */
Deno.test("isApplyCompressionOverlaySuccessReturn accepts the valid default", () => {
  assertEquals(
    isApplyCompressionOverlaySuccessReturn(
      buildApplyCompressionOverlaySuccessReturn(),
    ),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isApplyCompressionOverlaySuccessReturn accepts valid overrides", () => {
  const success = buildApplyCompressionOverlaySuccessReturn({ overlaidCount: 3 });
  assertEquals(isApplyCompressionOverlaySuccessReturn(success), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isApplyCompressionOverlaySuccessReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isApplyCompressionOverlaySuccessReturn(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isApplyCompressionOverlaySuccessReturn rejects each corrupted property", () => {
  assertEquals(
    isApplyCompressionOverlaySuccessReturn(
      invalidateApplyCompressionOverlaySuccessReturn({ resourceDocuments: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlaySuccessReturn(
      invalidateApplyCompressionOverlaySuccessReturn({ conversationHistory: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlaySuccessReturn(
      invalidateApplyCompressionOverlaySuccessReturn({ overlaidCount: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isApplyCompressionOverlaySuccessReturn rejects each omitted required property", () => {
  const { resourceDocuments: _a, ...missingDocs } =
    buildApplyCompressionOverlaySuccessReturn();
  assertEquals(isApplyCompressionOverlaySuccessReturn(missingDocs), false);
  const { conversationHistory: _b, ...missingHistory } =
    buildApplyCompressionOverlaySuccessReturn();
  assertEquals(isApplyCompressionOverlaySuccessReturn(missingHistory), false);
  const { overlaidCount: _c, ...missingCount } =
    buildApplyCompressionOverlaySuccessReturn();
  assertEquals(isApplyCompressionOverlaySuccessReturn(missingCount), false);
});

// --- isApplyCompressionOverlayErrorReturn ---

/** the builder's valid default is accepted. */
Deno.test("isApplyCompressionOverlayErrorReturn accepts the valid default", () => {
  assertEquals(
    isApplyCompressionOverlayErrorReturn(
      buildApplyCompressionOverlayErrorReturn(),
    ),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isApplyCompressionOverlayErrorReturn accepts valid overrides", () => {
  const error = buildApplyCompressionOverlayErrorReturn({ retriable: true });
  assertEquals(isApplyCompressionOverlayErrorReturn(error), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isApplyCompressionOverlayErrorReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isApplyCompressionOverlayErrorReturn(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayErrorReturn rejects each corrupted property", () => {
  assertEquals(
    isApplyCompressionOverlayErrorReturn(
      invalidateApplyCompressionOverlayErrorReturn({ error: null }),
    ),
    false,
  );
  assertEquals(
    isApplyCompressionOverlayErrorReturn(
      invalidateApplyCompressionOverlayErrorReturn({ retriable: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isApplyCompressionOverlayErrorReturn rejects each omitted required property", () => {
  const { error: _a, ...missingError } =
    buildApplyCompressionOverlayErrorReturn();
  assertEquals(isApplyCompressionOverlayErrorReturn(missingError), false);
  const { retriable: _b, ...missingRetriable } =
    buildApplyCompressionOverlayErrorReturn();
  assertEquals(isApplyCompressionOverlayErrorReturn(missingRetriable), false);
});
