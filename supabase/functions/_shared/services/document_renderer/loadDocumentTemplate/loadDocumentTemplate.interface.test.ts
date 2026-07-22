import { assertEquals } from "jsr:@std/assert";
import type {
  BoundLoadDocumentTemplateFn,
  LoadDocumentTemplateErrorReturn,
  LoadDocumentTemplateFn,
  LoadDocumentTemplateParams,
  LoadDocumentTemplatePayload,
  LoadDocumentTemplateReturn,
  LoadDocumentTemplateSuccessReturn,
} from "./loadDocumentTemplate.interface.ts";

Deno.test(
  "Valid: a payload with non-empty projectId/templateFilename and a params.dbClient type-checks",
  () => {
    const paramsSurface: Record<keyof LoadDocumentTemplateParams, true> = {
      dbClient: true,
    };
    assertEquals("dbClient" in paramsSurface, true);
    assertEquals(Object.keys(paramsSurface).length, 1);

    const payload: LoadDocumentTemplatePayload = {
      projectId: "project_123",
      templateFilename: "thesis_business_case.md",
    };

    assertEquals("projectId" in payload, true);
    assertEquals("templateFilename" in payload, true);
    assertEquals(payload.projectId, "project_123");
    assertEquals(payload.templateFilename, "thesis_business_case.md");
  },
);

Deno.test(
  "LoadDocumentTemplateSuccessReturn and LoadDocumentTemplateErrorReturn never co-occur",
  () => {
    const success: LoadDocumentTemplateSuccessReturn = {
      templateText: "# Executive Summary\n...",
    };
    const errorReturn: LoadDocumentTemplateErrorReturn = {
      error: new Error("template not found"),
      retriable: false,
    };

    const result1: LoadDocumentTemplateReturn = success;
    const result2: LoadDocumentTemplateReturn = errorReturn;

    assertEquals("templateText" in success, true);
    assertEquals("error" in success, false);
    assertEquals("error" in errorReturn, true);
    assertEquals("retriable" in errorReturn, true);
    assertEquals("templateText" in errorReturn, false);
    assertEquals("templateText" in result1, true);
    assertEquals("error" in result2, true);
  },
);

Deno.test("LoadDocumentTemplateFn and BoundLoadDocumentTemplateFn signatures", () => {
  const fn: LoadDocumentTemplateFn = async () => ({
    templateText: "# Executive Summary\n...",
  });
  const bound: BoundLoadDocumentTemplateFn = async () => ({
    templateText: "# Executive Summary\n...",
  });

  assertEquals(typeof fn, "function");
  assertEquals(typeof bound, "function");
});
