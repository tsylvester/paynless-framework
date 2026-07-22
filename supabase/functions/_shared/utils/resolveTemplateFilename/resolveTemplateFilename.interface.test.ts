import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DialecticStageSlug, FileType } from "../../types/file_manager.types.ts";
import type {
  BoundResolveTemplateFilenameFn,
  ResolveTemplateFilenameDeps,
  ResolveTemplateFilenameErrorReturn,
  ResolveTemplateFilenameFn,
  ResolveTemplateFilenameParams,
  ResolveTemplateFilenamePayload,
  ResolveTemplateFilenameReturn,
  ResolveTemplateFilenameSuccessReturn,
} from "./resolveTemplateFilename.interface.ts";

Deno.test("Contract: ResolveTemplateFilenameDeps is empty", () => {
  const deps: ResolveTemplateFilenameDeps = {};
  assertEquals(Object.keys(deps).length, 0);
});

Deno.test(
  "Valid: a payload with stageSlug: DialecticStageSlug.Thesis, outputType: FileType.business_case, documentKey: FileType.business_case and a params.dbClient type-checks",
  () => {
    const surface: Record<keyof ResolveTemplateFilenameParams, true> = { dbClient: true };
    assertEquals("dbClient" in surface, true);
    assertEquals(Object.keys(surface).length, 1);

    const payload: ResolveTemplateFilenamePayload = {
      stageSlug: DialecticStageSlug.Thesis,
      outputType: FileType.business_case,
      documentKey: FileType.business_case,
    };

    assertEquals("stageSlug" in payload, true);
    assertEquals("outputType" in payload, true);
    assertEquals("documentKey" in payload, true);
    assertEquals(payload.stageSlug, DialecticStageSlug.Thesis);
    assertEquals(payload.outputType, FileType.business_case);
    assertEquals(payload.documentKey, FileType.business_case);
  },
);

Deno.test(
  "Contract: ResolveTemplateFilenameSuccessReturn and ErrorReturn never co-occur",
  () => {
    const success: ResolveTemplateFilenameSuccessReturn = {
      templateFilename: "thesis_business_case.md",
    };
    const errorReturn: ResolveTemplateFilenameErrorReturn = {
      error: new Error("validation failed"),
      retriable: false,
    };
    const result1: ResolveTemplateFilenameReturn = success;
    const result2: ResolveTemplateFilenameReturn = errorReturn;

    assertEquals("templateFilename" in success, true);
    assertEquals("error" in success, false);
    assertEquals("error" in errorReturn, true);
    assertEquals("retriable" in errorReturn, true);
    assertEquals("templateFilename" in errorReturn, false);
    assertEquals("templateFilename" in result1, true);
    assertEquals("error" in result2, true);
  },
);

Deno.test(
  "Contract: ResolveTemplateFilenameFn and BoundResolveTemplateFilenameFn signatures",
  () => {
    const fn: ResolveTemplateFilenameFn = async () => ({
      templateFilename: "thesis_business_case.md",
    });
    const bound: BoundResolveTemplateFilenameFn = async () => ({
      templateFilename: "thesis_business_case.md",
    });
    assertEquals(typeof fn, "function");
    assertEquals(typeof bound, "function");
  },
);