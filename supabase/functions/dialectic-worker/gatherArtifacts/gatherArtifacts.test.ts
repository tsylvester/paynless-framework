import {
  assert,
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
  GatherArtifactsReturn,
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

Deno.test(
  "returns error when required feedback input is missing",
  async () => {
    const { client: dbClient } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_feedback: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const result: GatherArtifactsReturn = await gatherArtifacts(
      buildGatherArtifactsDeps(),
      params,
      buildGatherArtifactsPayload([buildFeedbackRule()]),
    );
    assertEquals(isGatherArtifactsErrorReturn(result), true);
    if (!isGatherArtifactsErrorReturn(result)) {
      throw new Error("expected GatherArtifactsErrorReturn");
    }
    const msg: string = result.error.message;
    assert(
      msg.includes("Required input document missing") ||
        msg.includes("document_key") ||
        msg.includes("thesis"),
      `Error message should identify missing document_key and stage; got: ${msg}`,
    );
    assertEquals(
      msg.includes("thesis"),
      true,
      "Error message should include stage slug (thesis)",
    );
  },
);

Deno.test(
  "error message identifies missing document_key and stage",
  async () => {
    const { client: dbClient } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_feedback: {
          select: buildSelectHandler([]),
        },
      },
    });
    const missingKey: FileType = FileType.UserFeedback;
    const missingStage: string = "thesis";
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const result: GatherArtifactsReturn = await gatherArtifacts(
      buildGatherArtifactsDeps(),
      params,
      buildGatherArtifactsPayload([
        buildFeedbackRule({
          document_key: missingKey,
          slug: missingStage,
        }),
      ]),
    );
    assertEquals(isGatherArtifactsErrorReturn(result), true);
    if (!isGatherArtifactsErrorReturn(result)) {
      throw new Error("expected GatherArtifactsErrorReturn");
    }
    const msg: string = result.error.message;
    assert(
      msg.includes(missingKey),
      `Error message should include missing document_key '${missingKey}'; got: ${msg}`,
    );
    assert(
      msg.includes(missingStage),
      `Error message should include missing stage '${missingStage}'; got: ${msg}`,
    );
  },
);


Deno.test(
  "queries resources first and finds rendered document, does not query contributions",
  async () => {
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: "resource-123",
            }),
          ]),
        },
        dialectic_contributions: {
          select: () => {
            throw new Error(
              "Contributions should not be queried when resources are found",
            );
          },
        },
      },
    });
    const encodedContent = new TextEncoder().encode("Rendered document content");
    const documentContentBuffer = new ArrayBuffer(encodedContent.byteLength);
    new Uint8Array(documentContentBuffer).set(encodedContent);
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: documentContentBuffer,
      }),
    });
    const result = await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildDocumentRule()]),
    );
    assertEquals(isGatherArtifactsSuccessReturn(result), true);

    const resourcesSpies = spies.getLatestQueryBuilderSpies(
      "dialectic_project_resources",
    );
    assertExists(resourcesSpies?.select, "Resources select should be called");
    assert(resourcesSpies.select.calls.length > 0, "Resources should be queried");

    const contributionsSpies = spies.getLatestQueryBuilderSpies(
      "dialectic_contributions",
    );
    if (contributionsSpies?.select) {
      assertEquals(
        contributionsSpies.select.calls.length,
        0,
        "Contributions should NOT be queried when resources are found",
      );
    }
  },
);

Deno.test(
  "prefers resources over contributions when both exist, returns only resource",
  async () => {
    let contributionsQueried = false;
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: "resource-123",
            }),
          ]),
        },
        dialectic_contributions: {
          select: () => {
            contributionsQueried = true;
            return buildSelectHandler([
              buildDialecticContributionRow({
                id: "contrib-123",
              }),
            ])();
          },
        },
      },
    });
    const encodedContent2 = new TextEncoder().encode(
      "Rendered document content from resources",
    );
    const contentBuffer2 = new ArrayBuffer(encodedContent2.byteLength);
    new Uint8Array(contentBuffer2).set(encodedContent2);
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: contentBuffer2,
      }),
    });
    await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildDocumentRule()]),
    );

    const resourcesSpies = spies.getLatestQueryBuilderSpies(
      "dialectic_project_resources",
    );
    assertExists(resourcesSpies?.select, "Resources select should be called");
    assert(resourcesSpies.select.calls.length > 0, "Resources should be queried first");

    assert(
      !contributionsQueried,
      "Contributions should NOT be queried when resources are found (resources take precedence)",
    );
  },
);

Deno.test(
  "throws error when required rendered document not found in resources, does not query contributions",
  async () => {
    let contributionsQueried = false;
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([]),
        },
        dialectic_contributions: {
          select: () => {
            contributionsQueried = true;
            return buildSelectHandler([])();
          },
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const result = await gatherArtifacts(
      buildGatherArtifactsDeps(),
      params,
      buildGatherArtifactsPayload([buildDocumentRule()]),
    );
    assertEquals(isGatherArtifactsErrorReturn(result), true);
    if (isGatherArtifactsErrorReturn(result)) {
      assert(
        result.error.message.includes("Required rendered document"),
        `expected Required rendered document in message, got: ${result.error.message}`,
      );
    }
    assert(
      !contributionsQueried,
      "Contributions should NOT be queried when resources are found (finished documents must be in resources, not contributions)",
    );
    const allResourcesSpies = spies.getAllQueryBuilderSpies('dialectic_project_resources');
    assertExists(allResourcesSpies, 'Resources query builders should exist');
    assert(allResourcesSpies.length > 0, 'At least one resources query builder should exist');
    const resourcesSpies = allResourcesSpies[allResourcesSpies.length - 1];
    assertExists(resourcesSpies?.select, 'Resources select should be called');
    assert(resourcesSpies.select.calls.length > 0, 'Resources should be queried first');
  },
);

Deno.test(
  'finds required seed_prompt in dialectic_project_resources when app stores it there (target behavior)',
  async () => {
    let projectResourcesQueried = false;
    const encodedSeed = new TextEncoder().encode('Seed prompt content');
    const seedBuffer = new ArrayBuffer(encodedSeed.byteLength);
    new Uint8Array(seedBuffer).set(encodedSeed);
    const baseDownload = createMockDownloadFromStorage({
      mode: 'success',
      data: seedBuffer,
    });
    let seedDownloadCalled = false;
    const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (
      supabase,
      bucket,
      path,
    ) => {
      seedDownloadCalled = true;
      return baseDownload(supabase, bucket, path);
    };
    const { client: dbClient } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: () => {
            projectResourcesQueried = true;
            return buildSelectHandler([
              buildDialecticProjectResourceRow({
                id: 'resource-seed-prompt-123',
                resource_type: 'seed_prompt',
                storage_path: 'project-abc/session_session-456/iteration_1/thesis',
                file_name: 'seed_prompt.md',
              }),
            ])();
          },
        },
        dialectic_contributions: {
          select: buildSelectHandler([]),
        },
        dialectic_feedback: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: downloadWithProbe,
    });
    const result = await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildSeedPromptRule()]),
    );
    assertEquals(isGatherArtifactsSuccessReturn(result), true);
    assert(
      projectResourcesQueried,
      'Executor should query dialectic_project_resources for required seed_prompt (app stores it there)',
    );
    assert(
      seedDownloadCalled,
      'downloadFromStorage must be called to get seed_prompt content from storage — there is no content column on dialectic_project_resources',
    );
  },
);

Deno.test(
  'continues to query contributions for intermediate artifacts (non-document inputs)',
  async () => {
    let contributionsQueried = false;
    const encodedHeader = new TextEncoder().encode('Header context content');
    const headerBuffer = new ArrayBuffer(encodedHeader.byteLength);
    new Uint8Array(headerBuffer).set(encodedHeader);
    const baseDownload = createMockDownloadFromStorage({
      mode: 'success',
      data: headerBuffer,
    });
    let headerDownloadCalled = false;
    const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (
      supabase,
      bucket,
      path,
    ) => {
      headerDownloadCalled = true;
      return baseDownload(supabase, bucket, path);
    };
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([]),
        },
        dialectic_contributions: {
          select: () => {
            contributionsQueried = true;
            return buildSelectHandler([
              buildDialecticContributionRow({
                id: 'header-contrib-123',
                file_name: 'model-collect_1_header_context.json',
              }),
            ])();
          },
        },
        dialectic_feedback: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: downloadWithProbe,
    });
    const result = await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildHeaderContextRule()]),
    );
    assertEquals(isGatherArtifactsSuccessReturn(result), true);
    assert(
      contributionsQueried,
      'Contributions should be queried for intermediate artifacts like header_context',
    );
    const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    if (resourcesSpies?.select) {
      assertEquals(
        resourcesSpies.select.calls.length,
        0,
        'Resources should NOT be queried for intermediate artifacts (header_context is stored in contributions)',
      );
    }
    assert(
      headerDownloadCalled,
      'downloadFromStorage must be called to get header_context content from storage — there is no content column on dialectic_contributions',
    );
  },
);

Deno.test(
  'queries dialectic_contributions by session_id only, never by project_id',
  async () => {
    const encodedHeaderCtx = new TextEncoder().encode('Header context content');
    const headerCtxBuffer = new ArrayBuffer(encodedHeaderCtx.byteLength);
    new Uint8Array(headerCtxBuffer).set(encodedHeaderCtx);
    const baseDownload = createMockDownloadFromStorage({
      mode: 'success',
      data: headerCtxBuffer,
    });
    let headerCtxDownloadCalled = false;
    const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (
      supabase,
      bucket,
      path,
    ) => {
      headerCtxDownloadCalled = true;
      return baseDownload(supabase, bucket, path);
    };
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([]),
        },
        dialectic_contributions: {
          select: buildSelectHandler([
            buildDialecticContributionRow({
              id: 'header-contrib-123',
              file_name: 'model-collect_1_header_context.json',
            }),
          ]),
        },
        dialectic_feedback: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: downloadWithProbe,
    });
    await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildHeaderContextRule()]),
    );
    const allContributionsSpies = spies.getAllQueryBuilderSpies('dialectic_contributions');
    assertExists(allContributionsSpies, 'At least one dialectic_contributions query should occur');
    for (const builder of allContributionsSpies) {
      if (builder.eq?.calls) {
        for (const call of builder.eq.calls) {
          const column: unknown = call.args?.[0];
          assert(
            column !== 'project_id',
            'dialectic_contributions has no project_id column; query by session_id only. Found .eq("project_id", ...) in gatherArtifacts contributions query.',
          );
        }
      }
    }
    assert(
      headerCtxDownloadCalled,
      'downloadFromStorage must be called to get header_context content from storage — there is no content column on dialectic_contributions',
    );
  },
);

Deno.test(
  'finds required project_resource initial_user_prompt in dialectic_project_resources (target behavior)',
  async () => {
    let projectResourcesQueriedForInitialPrompt = false;
    const encodedPrompt = new TextEncoder().encode(
      'Test prompt for full DAG traversal integration test',
    );
    const promptBuffer = new ArrayBuffer(encodedPrompt.byteLength);
    new Uint8Array(promptBuffer).set(encodedPrompt);
    const baseDownload = createMockDownloadFromStorage({
      mode: 'success',
      data: promptBuffer,
    });
    let promptDownloadCalled = false;
    const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (
      supabase,
      bucket,
      path,
    ) => {
      promptDownloadCalled = true;
      return baseDownload(supabase, bucket, path);
    };
    const { client: dbClient } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: () => {
            projectResourcesQueriedForInitialPrompt = true;
            return buildSelectHandler([
              buildDialecticProjectResourceRow({
                id: 'resource-initial-prompt-123',
                stage_slug: null,
                session_id: null,
                iteration_number: null,
                resource_type: 'initial_user_prompt',
                storage_path: 'project-abc/0_seed_inputs',
                file_name: 'initial_prompt_1769983040943.md',
              }),
            ])();
          },
        },
        dialectic_contributions: {
          select: buildSelectHandler([]),
        },
        dialectic_feedback: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: downloadWithProbe,
    });
    const result = await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildProjectResourceRule()]),
    );
    assertEquals(isGatherArtifactsSuccessReturn(result), true);
    assert(
      projectResourcesQueriedForInitialPrompt,
      'Executor should query dialectic_project_resources for required project_resource/initial_user_prompt (app stores it there, same as findSourceDocuments)',
    );
    assert(
      promptDownloadCalled,
      'downloadFromStorage must be called to get project_resource content from storage — there is no content column on dialectic_project_resources',
    );
  },
);

Deno.test(
  'skips optional document input when not found in resources',
  async () => {
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([]),
        },
        dialectic_contributions: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const result = await gatherArtifacts(
      buildGatherArtifactsDeps(),
      params,
      buildGatherArtifactsPayload([
        buildDocumentRule({
          required: false,
          slug: 'parenthesis',
          document_key: FileType.master_plan,
        }),
      ]),
    );
    assertEquals(isGatherArtifactsSuccessReturn(result), true);
    const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    assertExists(resourcesSpies?.select, 'Resources select should be called');
    assert(
      resourcesSpies.select.calls.length > 0,
      'Resources should be queried for optional document input',
    );
  },
);

Deno.test(
  'required input with failed storage download throws, does not fall back to empty string',
  async () => {
    const { client: dbClient } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: 'resource-fail-download-123',
            }),
          ]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: 'error',
        error: new Error('Storage download failed: file not found'),
      }),
    });
    const result = await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([buildDocumentRule()]),
    );
    assertEquals(isGatherArtifactsErrorReturn(result), true);
    if (isGatherArtifactsErrorReturn(result)) {
      assert(
        result.error.message.includes('Failed to download content from storage'),
        `expected storage failure message, got: ${result.error.message}`,
      );
    }
  },
);

Deno.test(
  'optional input with failed storage download skips, does not throw',
  async () => {
    const { client: dbClient } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: 'resource-optional-fail-123',
              stage_slug: 'parenthesis',
              storage_path: 'project-abc/session_session-456/iteration_1/parenthesis/documents',
              file_name: 'model-collect_1_master_plan.md',
            }),
          ]),
        },
        dialectic_contributions: {
          select: buildSelectHandler([]),
        },
      },
    });
    const params = buildGatherArtifactsParams(
      dbClient as unknown as SupabaseClient<Database>,
    );
    const deps = buildGatherArtifactsDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: 'error',
        error: new Error('Storage download failed: file not found'),
      }),
    });
    const result = await gatherArtifacts(
      deps,
      params,
      buildGatherArtifactsPayload([
        buildDocumentRule({
          required: false,
          slug: 'parenthesis',
          document_key: FileType.master_plan,
        }),
      ]),
    );
    assertEquals(isGatherArtifactsSuccessReturn(result), true);
    if (isGatherArtifactsSuccessReturn(result)) {
      assertEquals(result.artifacts.length, 0);
    }
  },
);
