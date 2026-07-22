import {
  assert,
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../types_db.ts";
import { createMockSupabaseClient } from "../../supabase.mock.ts";
import {
  buildResolveTemplateFilenamePayload,
  mockClonedStepRow,
  mockStageRow,
  recipeChainConfig,
} from "./resolveTemplateFilename.mock.ts";
import {
  resolveTemplateFilename,
  TemplateResolutionError,
} from "./resolveTemplateFilename.ts";
import { DialecticStageSlug, FileType } from "../../types/file_manager.types.ts";



Deno.test(
  "resolveTemplateFilename returns the cloned-instance template filename and queries dialectic_stage_recipe_steps",
  async () => {
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("templateFilename" in result) {
      assertEquals(result.templateFilename, "thesis_business_case.md");
    } else {
      assert(false, "expected success return");
    }

    const tableNames: string[] = mockSetup.spies.fromSpy.calls.map((c) =>
      String(c.args[0])
    );
    assertEquals(tableNames.includes("dialectic_stage_recipe_steps"), true);
    assertEquals(tableNames.includes("dialectic_recipe_template_steps"), false);
  },
);

Deno.test(
  "resolveTemplateFilename returns the non-cloned-instance template filename and queries dialectic_recipe_template_steps",
  async () => {
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(false),
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("templateFilename" in result) {
      assertEquals(result.templateFilename, "thesis_business_case.md");
    } else {
      assert(false, "expected success return");
    }

    const tableNames: string[] = mockSetup.spies.fromSpy.calls.map((c) =>
      String(c.args[0])
    );
    assertEquals(tableNames.includes("dialectic_recipe_template_steps"), true);
    assertEquals(tableNames.includes("dialectic_stage_recipe_steps"), false);
  },
);

Deno.test(
  "resolveTemplateFilename returns the received stage query error unmodified",
  async () => {
    const stageError = Object.assign(
      new Error("stage query failed"),
      { code: "PGRST116", details: "", hint: "" },
    );
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_stages: {
          select: { data: null, error: stageError },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assertStrictEquals(result.error, stageError);
      assertEquals(result.retriable, false);
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename returns the received recipe-instance query error unmodified",
  async () => {
    const instanceError = Object.assign(
      new Error("instance query failed"),
      { code: "PGRST116", details: "", hint: "" },
    );
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_instances: {
          select: { data: null, error: instanceError },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assertStrictEquals(result.error, instanceError);
      assertEquals(result.retriable, false);
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename returns the received recipe-steps query error unmodified",
  async () => {
    const stepsError = Object.assign(
      new Error("steps query failed"),
      { code: "PGRST116", details: "", hint: "" },
    );
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: { data: null, error: stepsError },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assertStrictEquals(result.error, stepsError);
      assertEquals(result.retriable, false);
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename surfaces an unexpected caught exception unmodified",
  async () => {
    const thrownError = new TypeError("malformed step data");
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: async () => {
            throw thrownError;
          },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assertStrictEquals(result.error, thrownError);
      assertEquals(result.retriable, false);
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename fails when the stage has no active recipe instance",
  async () => {
    const stageNoActive = { ...mockStageRow, active_recipe_instance_id: null };
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_stages: {
          select: { data: [stageNoActive], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assert(result.error instanceof TemplateResolutionError);
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message,
        "Stage 'thesis' has no active recipe instance",
      );
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename fails when no recipe step matches the output_type",
  async () => {
    const step = { ...mockClonedStepRow(), output_type: "feature_spec" };
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: { data: [step], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assert(result.error instanceof TemplateResolutionError);
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message,
        "No recipe step found with output_type 'business_case' for stage 'thesis'",
      );
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename fails when the matching step has missing or invalid outputs_required",
  async () => {
    const step = { ...mockClonedStepRow(), outputs_required: null };
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: { data: [step], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assert(result.error instanceof TemplateResolutionError);
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message,
        "No recipe step found with output_type 'business_case' for stage 'thesis'",
      );
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename fails when the matching step has missing or empty files_to_generate",
  async () => {
    const step = {
      ...mockClonedStepRow(),
      outputs_required: { files_to_generate: [] },
    };
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: { data: [step], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assert(result.error instanceof TemplateResolutionError);
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message,
        "Recipe step with output_type 'business_case' has missing or empty files_to_generate array",
      );
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename fails when no files_to_generate entry matches the documentKey",
  async () => {
    const step = {
      ...mockClonedStepRow(),
      outputs_required: {
        files_to_generate: [{
          from_document_key: "feature_spec",
          template_filename: "thesis_feature_spec.md",
        }],
      },
    };
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: { data: [step], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assert(result.error instanceof TemplateResolutionError);
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message,
        "No files_to_generate entry found with from_document_key 'business_case' in recipe step with output_type 'business_case'",
      );
    } else {
      assert(false, "expected error return");
    }
  },
);

Deno.test(
  "resolveTemplateFilename fails when the matching files_to_generate entry has missing or invalid template_filename",
  async () => {
    const step = {
      ...mockClonedStepRow(),
      outputs_required: {
        files_to_generate: [{
          from_document_key: "business_case",
          template_filename: 123,
        }],
      },
    };
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(true),
        dialectic_stage_recipe_steps: {
          select: { data: [step], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      buildResolveTemplateFilenamePayload(),
    );

    if ("error" in result) {
      assert(result.error instanceof TemplateResolutionError);
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message,
        "Recipe step with output_type 'business_case' has missing or invalid outputs_required",
      );
    } else {
      assert(false, "expected error return");
    }
  },
);
// Bounded subsystem: real resolveTemplateFilename; only the Supabase client is mocked (external boundary).

Deno.test(
  "resolveTemplateFilename: non-cloned recipe chain returns the exact template_filename from the fixture",
  async () => {
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        ...recipeChainConfig(false),
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const result = await resolveTemplateFilename(
      {},
      { dbClient },
      {
        stageSlug: DialecticStageSlug.Thesis,
        outputType: FileType.business_case,
        documentKey: FileType.business_case,
      },
    );

    assert("templateFilename" in result, "expected templateFilename in result");
    assertEquals(result.templateFilename, "thesis_business_case.md");
  },
);
