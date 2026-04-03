import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { logger } from "../../_shared/logger.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { pickLatest } from "../../_shared/utils/pickLatest.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { gatherArtifacts } from "./gatherArtifacts.ts";
import { isGatherArtifactsSuccessReturn } from "./gatherArtifacts.guard.ts";
import {
  buildDialecticContributionRow,
  buildDialecticFeedbackRow,
  buildDialecticProjectResourceRow,
  buildDocumentRule,
  buildFeedbackRule,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildHeaderContextRule,
  buildProjectResourceRule,
  buildSeedPromptRule,
  buildSelectHandler,
} from "./gatherArtifacts.mock.ts";

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(content);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

Deno.test("integration: document rule returns expected artifact shape", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "int-doc-1",
          }),
        ]),
      },
    },
  });

  const deps = {
    logger,
    pickLatest,
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: toArrayBuffer("document-content"),
    }),
  };
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const payload = buildGatherArtifactsPayload([buildDocumentRule()]);
  const result = await gatherArtifacts(deps, params, payload);

  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts[0].id, "int-doc-1");
    assertEquals(result.artifacts[0].type, "document");
    assertEquals(result.artifacts[0].document_key, FileType.business_case);
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].content, "document-content");
  }
});

Deno.test("integration: feedback rule returns expected artifact shape", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_feedback: {
        select: buildSelectHandler([
          buildDialecticFeedbackRow({
            id: "int-feedback-1",
          }),
        ]),
      },
    },
  });

  const deps = {
    logger,
    pickLatest,
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: toArrayBuffer("feedback-content"),
    }),
  };
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const payload = buildGatherArtifactsPayload([buildFeedbackRule()]);
  const result = await gatherArtifacts(deps, params, payload);

  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts[0].id, "int-feedback-1");
    assertEquals(result.artifacts[0].type, "feedback");
    assertEquals(result.artifacts[0].document_key, FileType.business_case);
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].content, "feedback-content");
  }
});

Deno.test("integration: seed_prompt and project_resource rules return expected artifact shapes", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "int-seed-1",
            resource_type: "seed_prompt",
            file_name: "seed_prompt.md",
            storage_path: "project-abc/session_session-456/iteration_1/thesis",
          }),
        ]),
      },
    },
  });
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: toArrayBuffer("seed-content"),
    }),
  };

  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const seedPayload = buildGatherArtifactsPayload([buildSeedPromptRule()]);
  const seedResult = await gatherArtifacts(deps, params, seedPayload);
  assertEquals(isGatherArtifactsSuccessReturn(seedResult), true);
  if (isGatherArtifactsSuccessReturn(seedResult)) {
    assertEquals(seedResult.artifacts[0].id, "int-seed-1");
    assertEquals(seedResult.artifacts[0].type, "seed_prompt");
    assertEquals(seedResult.artifacts[0].document_key, FileType.SeedPrompt);
    assertEquals(seedResult.artifacts[0].stage_slug, "thesis");
    assertEquals(seedResult.artifacts[0].content, "seed-content");
  }

  const { client: projectDbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "int-project-resource-1",
            session_id: null,
            iteration_number: null,
            stage_slug: null,
            resource_type: "initial_user_prompt",
            storage_path: "project-abc/0_seed_inputs",
            file_name: "initial_prompt.md",
          }),
        ]),
      },
    },
  });
  const projectParams = buildGatherArtifactsParams(
    projectDbClient as unknown as SupabaseClient<Database>,
  );
  const projectPayload = buildGatherArtifactsPayload([buildProjectResourceRule()]);
  const projectResult = await gatherArtifacts(deps, projectParams, projectPayload);
  assertEquals(isGatherArtifactsSuccessReturn(projectResult), true);
  if (isGatherArtifactsSuccessReturn(projectResult)) {
    assertEquals(projectResult.artifacts[0].id, "int-project-resource-1");
    assertEquals(projectResult.artifacts[0].type, "project_resource");
    assertEquals(projectResult.artifacts[0].document_key, FileType.InitialUserPrompt);
    assertEquals(projectResult.artifacts[0].stage_slug, "project");
    assertEquals(projectResult.artifacts[0].content, "seed-content");
  }
});

Deno.test("integration: header_context and contribution rules return expected artifact shapes", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "int-header-1",
          }),
        ]),
      },
    },
  });

  const deps = {
    logger,
    pickLatest,
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: toArrayBuffer("header-content"),
    }),
  };
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);

  const headerResult = await gatherArtifacts(
    deps,
    params,
    buildGatherArtifactsPayload([buildHeaderContextRule()]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(headerResult), true);
  if (isGatherArtifactsSuccessReturn(headerResult)) {
    assertEquals(headerResult.artifacts[0].id, "int-header-1");
    assertEquals(headerResult.artifacts[0].type, "header_context");
    assertEquals(headerResult.artifacts[0].document_key, FileType.HeaderContext);
    assertEquals(headerResult.artifacts[0].stage_slug, "thesis");
    assertEquals(headerResult.artifacts[0].content, "header-content");
  }

  const contributionResult = await gatherArtifacts(
    deps,
    params,
    buildGatherArtifactsPayload([
      buildHeaderContextRule({ type: "contribution", document_key: FileType.HeaderContext }),
    ]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(contributionResult), true);
  if (isGatherArtifactsSuccessReturn(contributionResult)) {
    assertEquals(contributionResult.artifacts[0].id, "int-header-1");
    assertEquals(contributionResult.artifacts[0].type, "contribution");
    assertEquals(contributionResult.artifacts[0].document_key, FileType.HeaderContext);
    assertEquals(contributionResult.artifacts[0].stage_slug, "thesis");
    assertEquals(contributionResult.artifacts[0].content, "header-content");
  }
});
