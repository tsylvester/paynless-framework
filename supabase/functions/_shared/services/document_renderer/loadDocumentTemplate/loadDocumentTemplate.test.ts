import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import { downloadFromStorage } from "../../../supabase_storage_utils.ts";
import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";
import {
  mockDocumentTemplateRow,
  mockProjectRow,
  REAL_THESIS_BUSINESS_CASE_TEMPLATE,
} from "./loadDocumentTemplate.mock.ts";
import { loadDocumentTemplate, TemplateLoadError } from "./loadDocumentTemplate.ts";

function setupSupabase(config: {
  projects?: object[];
  templates?: object[];
  projectError?: Error | null;
  templateError?: Error | null;
  storageMock?: { downloadResult: (_bucketId: string, _path: string) => Promise<{ data: Blob | null; error: Error | null }> };
}) {
  const genericMockResults: NonNullable<Parameters<typeof createMockSupabaseClient>[1]>["genericMockResults"] = {};
  if (config.projects !== undefined || config.projectError !== undefined) {
    genericMockResults.dialectic_projects = {
      select: { data: config.projects ?? [], error: config.projectError ?? null, count: null, status: 200, statusText: "OK" },
    };
  }
  if (config.templates !== undefined || config.templateError !== undefined) {
    genericMockResults.dialectic_document_templates = {
      select: { data: config.templates ?? [], error: config.templateError ?? null, count: null, status: 200, statusText: "OK" },
    };
  }
  const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults,
    storageMock: config.storageMock,
  });
  return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
}

Deno.test("success: loads and decodes a single matching template", async () => {
  const templateRecord = mockDocumentTemplateRow();
  const { dbClient, spies, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("domain-1")],
    templates: [templateRecord],
    storageMock: {
      downloadResult: async (_bucketId: string, path: string) => {
        if (path === "templates/thesis/thesis_business_case.md") {
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        }
        return { data: null, error: new Error(`Unexpected download path: ${path}`) };
      },
    },
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.templateText, REAL_THESIS_BUSINESS_CASE_TEMPLATE);

  const projectSpies = spies.getHistoricQueryBuilderSpies("dialectic_projects", "select");
  const templateSpies = spies.getHistoricQueryBuilderSpies("dialectic_document_templates", "select");
  assert(projectSpies !== undefined && projectSpies.callCount > 0, "dialectic_projects should be queried");
  assert(templateSpies !== undefined && templateSpies.callCount > 0, "dialectic_document_templates should be queried");

  clearAllStubs?.();
});

Deno.test("success: disambiguates by unique name and returns the matching document template", async () => {
  const domainId = "domain-1";
  const documentTemplate = mockDocumentTemplateRow({
    id: "template-doc-1",
    description: "Document template for thesis business case",
    storage_path: "docs/templates/thesis/",
  });
  const promptTemplate = mockDocumentTemplateRow({
    id: "template-prompt-1",
    description: "Prompt template for thesis business case",
    file_name: "thesis_business_case_turn_v1.md",
    name: "thesis_business_case_turn_v1",
    storage_path: "docs/prompts/thesis/",
  });

  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow(domainId)],
    templates: [documentTemplate],
    storageMock: {
      downloadResult: async (_bucketId: string, path: string) => {
        if (path === "docs/templates/thesis/thesis_business_case.md") {
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        }
        return { data: new Blob([], { type: "text/plain" }), error: null };
      },
    },
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.templateText, REAL_THESIS_BUSINESS_CASE_TEMPLATE);

  clearAllStubs?.();
});

Deno.test("fresh error: project has no selected_domain_id", async () => {
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("")],
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof TemplateLoadError);
  assertEquals(result.retriable, false);
  assertEquals(
    result.error.message,
    "Project 'project_123' does not have a selected_domain_id. Template lookup requires domain_id.",
  );

  clearAllStubs?.();
});

Deno.test("fresh error: no matching template row", async () => {
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("domain-1")],
    templates: [],
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof TemplateLoadError);
  assertEquals(result.retriable, false);
  assertEquals(
    result.error.message,
    "No template mapping found for name='thesis_business_case' (from template_filename='thesis_business_case.md') domain_id='domain-1'",
  );

  clearAllStubs?.();
});

Deno.test("fresh error: invalid template row (missing storage fields)", async () => {
  const invalidTemplate = mockDocumentTemplateRow({ storage_bucket: "" });
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("domain-1")],
    templates: [invalidTemplate],
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof TemplateLoadError);
  assertEquals(result.retriable, false);
  assertEquals(result.error.message, `Invalid template row: ${JSON.stringify(invalidTemplate)}`);

  clearAllStubs?.();
});

Deno.test("fresh error: storage download returns no data", async () => {
  const templateRecord = mockDocumentTemplateRow();
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("domain-1")],
    templates: [templateRecord],
  });

  const noDataDownload: DownloadFromStorageFn = async () => ({
    data: null,
    error: null,
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage: noDataDownload },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof TemplateLoadError);
  assertEquals(result.retriable, false);
  assertEquals(
    result.error.message,
    "No data returned downloading template 'templates/thesis/thesis_business_case.md' from bucket 'prompt-templates'",
  );

  clearAllStubs?.();
});

Deno.test("received error: project query error is passed through unmodified", async () => {
  const projectError = new Error("project query failed");
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [],
    projectError,
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error === projectError);
  assertEquals(result.retriable, false);
  assert(!(result.error instanceof TemplateLoadError));

  clearAllStubs?.();
});

Deno.test("received error: template query error is passed through unmodified", async () => {
  const templateError = new Error("template query failed");
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("domain-1")],
    templates: [],
    templateError,
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error === templateError);
  assertEquals(result.retriable, false);
  assert(!(result.error instanceof TemplateLoadError));

  clearAllStubs?.();
});

Deno.test("received error: storage download error is passed through unmodified", async () => {
  const templateRecord = mockDocumentTemplateRow();
  const downloadError = new Error("storage download failed");
  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow("domain-1")],
    templates: [templateRecord],
  });

  const failingDownload: DownloadFromStorageFn = async () => ({
    data: null,
    error: downloadError,
  });

  const result = await loadDocumentTemplate(
    { downloadFromStorage: failingDownload },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert("error" in result, "expected error return");
  assert(result.error === downloadError);
  assertEquals(result.retriable, false);
  assert(!(result.error instanceof TemplateLoadError));

  clearAllStubs?.();
});

Deno.test("real walk with both external boundaries mocked returns storage-provided text", async () => {
  const domainId = "domain-1";
  const expectedText = "mock storage template content";
  const encoded = new TextEncoder().encode(expectedText);
  const storageBytes = new ArrayBuffer(encoded.length);
  new Uint8Array(storageBytes).set(encoded);
  const templateRecord = mockDocumentTemplateRow({
    storage_bucket: "prompt-templates",
    storage_path: "docs/templates/thesis/",
    file_name: "thesis_business_case.md",
  });
  const fullPath = "docs/templates/thesis/thesis_business_case.md";

  const { dbClient, clearAllStubs } = setupSupabase({
    projects: [mockProjectRow(domainId)],
    templates: [templateRecord],
  });

  const storageDownload: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    if (path === fullPath) {
      return { data: storageBytes, error: null };
    }
    return { data: null, error: new Error(`Unexpected download path: ${path}`) };
  };

  const result = await loadDocumentTemplate(
    { downloadFromStorage: storageDownload },
    { dbClient },
    { projectId: "project_123", templateFilename: "thesis_business_case.md" },
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.templateText, expectedText);

  clearAllStubs?.();
});
