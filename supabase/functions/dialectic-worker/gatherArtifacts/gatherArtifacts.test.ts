import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  GatherArtifactsDeps,
} from "./gatherArtifacts.interface.ts";
import {
  isGatherArtifactsErrorReturn,
  isGatherArtifactsSuccessReturn,
} from "./gatherArtifacts.guard.ts";
import { gatherArtifacts } from "./gatherArtifacts.ts";
import {
  buildDialecticContributionRow,
  buildDialecticFeedbackRow,
  buildDialecticProjectResourceRow,
  buildDocumentRule,
  buildFeedbackRule,
  buildGatherArtifactsDeps,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildHeaderContextRule,
  buildProjectResourceRule,
  buildSeedPromptRule,
  buildSelectHandler,
} from "./gatherArtifacts.mock.ts";

Deno.test("document rule queries project resources rendered_document and returns document artifact", async () => {
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "res-doc-1",
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([buildDocumentRule()]);

  const result = await gatherArtifacts(deps, params, payload);
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].type, "document");
  }

  const resourceSpies = spies.getLatestQueryBuilderSpies("dialectic_project_resources");
  assertExists(resourceSpies?.eq);
});

Deno.test("feedback rule queries dialectic_feedback and returns feedback artifact", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_feedback: {
        select: buildSelectHandler([
          buildDialecticFeedbackRow({
            id: "fb-1",
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([buildFeedbackRule()]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts[0].type, "feedback");
  }
});

Deno.test("seed_prompt rule queries project resources seed_prompt", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "seed-1",
            resource_type: "seed_prompt",
            storage_path: "project-abc/session_session-456/iteration_1/thesis",
            file_name: "seed_prompt.md",
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([buildSeedPromptRule()]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
});

Deno.test("project_resource rule queries project_resource or initial_user_prompt", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "project-res-1",
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
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([buildProjectResourceRule()]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
});

Deno.test("header_context rule queries dialectic_contributions and returns contribution artifact", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "contrib-1",
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([buildHeaderContextRule()]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
});

Deno.test("optional rule DB miss returns success and omits artifact", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([buildDocumentRule({ required: false })]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 0);
  }
});

Deno.test("required rule DB miss returns GatherArtifactsErrorReturn with retriable false", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([buildDocumentRule({ required: true })]),
  );
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assertEquals(result.retriable, false);
    assertEquals(result.error.message.length > 0, true);
  }
});

Deno.test("required rule storage download failure returns GatherArtifactsErrorReturn retriable false", async () => {
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "res-doc-fail",
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps({
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "error",
      error: new Error("download failed"),
    }),
  });
  const result = await gatherArtifacts(
    deps,
    params,
    buildGatherArtifactsPayload([buildDocumentRule({ required: true })]),
  );
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("multiple rules resolving same id deduplicates artifacts to one", async () => {
  const createdAt = new Date().toISOString();
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "dup-id-1",
            created_at: createdAt,
            updated_at: createdAt,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const result = await gatherArtifacts(
    buildGatherArtifactsDeps(),
    params,
    buildGatherArtifactsPayload([
      buildHeaderContextRule({ required: true }),
      buildHeaderContextRule({ type: "contribution", required: true }),
    ]),
  );
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "dup-id-1");
  }
});
