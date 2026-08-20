import { assertEquals } from "jsr:@std/assert";
import {
  buildRenderCompressedContextParams,
  buildRenderDocumentParams,
  invalidateRenderCompressedContextParams,
} from "./renderDocument.mock.ts";
import { isRenderCompressedContextParams } from "./renderDocument.guard.ts";

Deno.test("isRenderCompressedContextParams accepts a valid built object", () => {
  assertEquals(isRenderCompressedContextParams(buildRenderCompressedContextParams()), true);
});

Deno.test("isRenderCompressedContextParams accepts a sourceType: 'resource' variant", () => {
  assertEquals(
    isRenderCompressedContextParams(buildRenderCompressedContextParams({ sourceType: "resource" })),
    true,
  );
});

Deno.test("isRenderCompressedContextParams rejects non-records", () => {
  assertEquals(isRenderCompressedContextParams(null), false);
  assertEquals(isRenderCompressedContextParams(undefined), false);
  assertEquals(isRenderCompressedContextParams(42), false);
  assertEquals(isRenderCompressedContextParams("string"), false);
  assertEquals(isRenderCompressedContextParams([]), false);
});

Deno.test("isRenderCompressedContextParams rejects the existing RenderDocumentParams member", () => {
  assertEquals(isRenderCompressedContextParams(buildRenderDocumentParams()), false);
});

Deno.test("isRenderCompressedContextParams rejects when each key is absent", () => {
  const {
    projectId: _projectId,
    ...missingProjectId
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingProjectId), false);

  const {
    sessionId: _sessionId,
    ...missingSessionId
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingSessionId), false);

  const {
    iterationNumber: _iterationNumber,
    ...missingIterationNumber
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingIterationNumber), false);

  const {
    stageSlug: _stageSlug,
    ...missingStageSlug
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingStageSlug), false);

  const {
    output_type: _output_type,
    ...missingoutput_type
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingoutput_type), false);

  const {
    sourceType: _sourceType,
    ...missingSourceType
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingSourceType), false);

  const {
    documentKey: _documentKey,
    ...missingDocumentKey
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingDocumentKey), false);

  const {
    template_filename: _template_filename,
    ...missingTemplateFilename
  } = buildRenderCompressedContextParams();
  assertEquals(isRenderCompressedContextParams(missingTemplateFilename), false);
});

Deno.test("isRenderCompressedContextParams rejects non-string projectId", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ projectId: 123 })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects non-string sessionId", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ sessionId: 123 })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects non-string template_filename", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ template_filename: 123 })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects non-number iterationNumber", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ iterationNumber: "not-a-number" })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects stageSlug failing isDialecticStageSlug", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ stageSlug: "not-a-stage" })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects output_type failing isModelContributionFileType", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ output_type: "not-a-model-contribution-file-type" })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects sourceType: 'feedback'", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ sourceType: "feedback" })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects sourceType: 'history'", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ sourceType: "history" })),
    false,
  );
});

Deno.test("isRenderCompressedContextParams rejects documentKey failing isFileType", () => {
  assertEquals(
    isRenderCompressedContextParams(invalidateRenderCompressedContextParams({ documentKey: "not-a-file-type" })),
    false,
  );
});
