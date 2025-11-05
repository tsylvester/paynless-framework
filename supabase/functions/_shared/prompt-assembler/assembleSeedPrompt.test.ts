import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { assembleSeedPrompt } from "./assembleSeedPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  DynamicContextVariables,
  AssembledPrompt,
} from "./prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from "../supabase.mock.ts";
import { isRecord } from "../utils/type_guards.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Database } from "../../types_db.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { renderPrompt } from "../prompt-renderer.ts";
import { gatherInputsForStage } from "./gatherInputsForStage.ts";
import { createMockFileManagerService } from "../services/file_manager.mock.ts";
import { FileType, UploadContext } from "../types/file_manager.types.ts";
import { FileRecord } from "../types/file_manager.types.ts";
import {
  DialecticStageRecipeStep,
  OutputRule,
  SeedPromptRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";

// Define a type for the mock implementation of renderPrompt
type RenderPromptMock = (
  _basePromptText: string,
  _dynamicContextVariables: DynamicContextVariables,
  _systemDefaultOverlayValues?: Json,
  _userProjectOverlayValues?: Json,
) => string;

Deno.test("assembleSeedPrompt", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let denoEnvStub: any = null;
  const consoleSpies: { error?: Spy<Console>; warn?: Spy<Console> } = {};
  const mockFileManager = createMockFileManagerService();

  const setup = (
    config: MockSupabaseDataConfig = {},
  ) => {
    denoEnvStub = stub(Deno.env, "get", (key: string) => {
      if (key === "SB_CONTENT_STORAGE_BUCKET") {
        return "test-bucket";
      }
      return undefined;
    });

    mockSupabaseSetup = createMockSupabaseClient(undefined, config);

    consoleSpies.error = spy(console, "error");
    consoleSpies.warn = spy(console, "warn");

    return {
      client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      spies: mockSupabaseSetup.spies,
      fileManager: mockFileManager,
    };
  };

  const teardown = () => {
    denoEnvStub?.restore();
    consoleSpies.error?.restore();
    consoleSpies.warn?.restore();
    if (mockSupabaseSetup) {
      mockSupabaseSetup.clearAllStubs?.();
    }
  };

  const defaultProject: ProjectContext = {
    id: "proj-123",
    user_id: "user-123",
    project_name: "Test Project Objective",
    initial_user_prompt: "This is the initial user prompt content.",
    initial_prompt_resource_id: null,
    selected_domain_id: "domain-123",
    dialectic_domains: { name: "Software Development Domain" },
    process_template_id: "pt-123",
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
    repo_url: null,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const defaultSession: SessionContext = {
    id: "sess-123",
    project_id: "proj-123",
    selected_model_ids: ["model-1", "model-2"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_stage_id: "stage-123",
    iteration_count: 1,
    session_description: "Test session",
    status: "pending_thesis",
    associated_chat_id: null,
    user_input_reference_url: null,
  };

  const stageSystemPromptText = "System prompt for {user_objective} in {domain}.";
  const stageOverlayValues: Json = { style: "formal" };
  const mockSimpleRecipeStep: SeedPromptRecipeStep = {
    prompt_type: "Seed",
    step_number: 1,
    step_name: "Assemble Seed Prompt",
    output_type: "seed_prompt",
  };

  const mockStageRecipeStep: SeedPromptRecipeStep = {
    output_type: "seed_prompt",
    step_name: "Assemble Seed Prompt",
    step_number: 1,
    prompt_type: "Seed",
  };

  const defaultStage: StageContext = {
    id: "stage-123",
    system_prompts: { prompt_text: stageSystemPromptText },
    domain_specific_prompt_overlays: [{ overlay_values: stageOverlayValues }],
    slug: "initial-hypothesis",
    display_name: "Initial hypothesis",
    description: "Initial hypothesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: null,
    recipe_step: mockSimpleRecipeStep,
    active_recipe_instance_id: null,
    expected_output_template_ids: [],
    recipe_template_id: null,
  };

  await t.step("should correctly assemble, persist, and render a prompt for the initial stage", async () => {
      const expectedRenderedPrompt = "Mocked Rendered Prompt Output";
      const mockFileRecord: FileRecord = {
        id: "mock-resource-id-123",
        storage_path: "path/to/mock/",
        storage_bucket: "test-bucket",
        file_name: "mock-file.md",
        iteration_number: 1,
        mime_type: "text/markdown",
        created_at: new Date().toISOString(),
        project_id: "mock-project-id",
        resource_description: { test: "test" },
        resource_type: "test",
        size_bytes: 100,
        user_id: "mock-user-id",
        session_id: "mock-session-id",
        source_contribution_id: "mock-source-contribution-id",
        stage_slug: "mock-stage-slug",
        updated_at: new Date().toISOString(),
      };

      let renderPromptCallCount = 0;
      let lastRenderPromptArgs: [
        string,
        Record<string, unknown>,
        Json | undefined,
        Json | undefined,
      ] | null = null;

      const renderPromptMockFn: RenderPromptMock = (
        base,
        vars,
        sysOverlays,
        userOverlays,
      ) => {
        renderPromptCallCount++;
        lastRenderPromptArgs = [base, vars, sysOverlays, userOverlays];
        return expectedRenderedPrompt;
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_stages: {
            select: () => Promise.resolve({ data: [], error: null }),
          },
          dialectic_contributions: {
            select: () => Promise.resolve({ data: [], error: null }),
          },
          dialectic_feedback: {
            select: () =>
              Promise.resolve({
                data: [{
                  storage_bucket: "test-bucket",
                  storage_path: "path/to/feedback",
                  file_name: "user_feedback.md",
                }],
                error: null,
              }),
          },
        },
      };

      const { client, fileManager } = setup(config);
      fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
      const downloadFn = (bucket: string, path: string) =>
        downloadFromStorage(client, bucket, path);

      try {
        const result: AssembledPrompt = await assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: downloadFn,
          gatherInputsForStageFn: gatherInputsForStage,
          renderPromptFn: renderPromptMockFn,
          fileManager,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          iterationNumber: 1,
        });

        assertEquals(result.promptContent, expectedRenderedPrompt);
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
        assertEquals(renderPromptCallCount, 1);
        
        assert(fileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadContext.pathContext.fileType, FileType.SeedPrompt);
        assertEquals(uploadContext.fileContent, expectedRenderedPrompt);


        const renderArgs = lastRenderPromptArgs;
        assertEquals(renderArgs?.[0], stageSystemPromptText);

        const expectedDynamicVars: DynamicContextVariables = {
          user_objective: "Test Project Objective",
          domain: "Software Development Domain",
          context_description: "This is the initial user prompt content.",
          original_user_request: "",
          recipeStep: defaultStage.recipe_step,
          sourceDocuments: [],
        };
        assertEquals(renderArgs?.[1], expectedDynamicVars);
        assertEquals(renderArgs?.[2], stageOverlayValues);
        assertEquals(renderArgs?.[3], null);
      } finally {
        teardown();
      }
    },
  );

  await t.step("correctly handles recipe_step with an empty outputs_required array", async () => {
      let capturedSysOverlay: Json | undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        capturedSysOverlay = sysOverlays;
        return "ok";
      };

      const stageWithEmptyArtifacts: StageContext = {
        ...defaultStage,
        recipe_step: {
          ...mockStageRecipeStep,
          outputs_required: [], // Conforms to the SeedPromptRecipeStep type
        },
      };

      const { client, fileManager } = setup({});
      fileManager.setUploadAndRegisterFileResponse({
        id: "mock-id",
        created_at: new Date().toISOString(),
        file_name: "mock-file.md",
        iteration_number: 1,
        mime_type: "text/markdown",
        project_id: "mock-project-id",
        resource_description: { test: "test" },
        resource_type: "test",
        size_bytes: 100,
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/",
        user_id: "mock-user-id",
        session_id: "mock-session-id",
        source_contribution_id: "mock-source-contribution-id",
        stage_slug: "mock-stage-slug",
        updated_at: new Date().toISOString(),
      }, null);

      const downloadFn = (bucket: string, path: string) =>
        downloadFromStorage(client, bucket, path);

      try {
        const result = await assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: downloadFn,
          gatherInputsForStageFn: gatherInputsForStage,
          renderPromptFn: renderPromptMockFn,
          fileManager,
          project: defaultProject,
          session: defaultSession,
          stage: stageWithEmptyArtifacts,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          iterationNumber: 1,
        });
        assertEquals(result.promptContent, "ok");

        if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
          assert(
            !("outputs_required" in capturedSysOverlay),
            "outputs_required should NOT be passed to the renderer for a seed prompt",
          );
        }
      } finally {
        teardown();
      }
    },
  );

  await t.step("should correctly assemble for a subsequent stage with prior inputs", async () => {
      const stageSlug = "prev-stage";
      const contribContent = "AI contribution content.";
      const feedbackContent = "User feedback content.";

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_stages: {
            select: () =>
              Promise.resolve({
                data: [{ slug: stageSlug, display_name: "Previous Stage" }],
                error: null,
              }),
          },
          dialectic_contributions: {
            select: () =>
              Promise.resolve({
                data: [{
                  id: "c1",
                  storage_path: "path/to/contrib.md",
                  storage_bucket: "test-bucket",
                  model_name: "Test Model",
                }],
                error: null,
              }),
          },
          dialectic_feedback: {
            select: () =>
              Promise.resolve({
                data: [{
                  storage_bucket: "test-bucket",
                  storage_path: "path/to/feedback",
                  file_name: "user_feedback.md",
                }],
                error: null,
              }),
          },
        },
        storageMock: {
          downloadResult: (bucket, path) => {
            if (path.includes("contrib.md")) {
              return Promise.resolve({
                data: new Blob([contribContent]),
                error: null,
              });
            }
            if (path.includes("user_feedback")) {
              return Promise.resolve({
                data: new Blob([feedbackContent]),
                error: null,
              });
            }
            return Promise.resolve({
              data: null,
              error: new Error("File not found in mock"),
            });
          },
        },
      };

      const expectedRenderedPrompt = "Mocked Subsequent Stage Output";
      let capturedDynamicVars: DynamicContextVariables | undefined;
      const renderPromptMockFn: RenderPromptMock = (_b, vars) => {
        capturedDynamicVars = vars;
        return expectedRenderedPrompt;
      };

      const { client, spies, fileManager } = setup(config);
      fileManager.setUploadAndRegisterFileResponse({
        id: "mock-id",
        created_at: new Date().toISOString(),
        file_name: "mock-file.md",
        iteration_number: 1,
        mime_type: "text/markdown",
        project_id: "mock-project-id",
        resource_description: { test: "test" },
        resource_type: "test",
        size_bytes: 100,
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/",
        user_id: "mock-user-id",
        session_id: "mock-session-id",
        source_contribution_id: "mock-source-contribution-id",
        stage_slug: "mock-stage-slug",
        updated_at: new Date().toISOString(),
      }, null);

      const downloadFn = (bucket: string, path: string) =>
        downloadFromStorage(client, bucket, path);

      try {
        const subsequentStage: StageContext = {
          ...defaultStage,
          id: "stage-subsequent",
          slug: "subsequent-stage",
          recipe_step: {
            ...mockStageRecipeStep,
            inputs_required: [], // Conforms to the SeedPromptRecipeStep type
          },
        };

        const result = await assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: downloadFn,
          gatherInputsForStageFn: gatherInputsForStage,
          renderPromptFn: renderPromptMockFn,
          fileManager,
          project: defaultProject,
          session: defaultSession,
          stage: subsequentStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          iterationNumber: 1,
        });

        assertEquals(result.promptContent, expectedRenderedPrompt);

        const downloadSpy = spies.storage.from("test-bucket").downloadSpy;
        assert(
          !downloadSpy.calls.some((call) =>
            call.args[0].includes("user_feedback")
          ),
          "Download SHOULD NOT be called for feedback file in a seed prompt",
        );
        assert(
          !downloadSpy.calls.some((call) => call.args[0].includes("contrib.md")),
          "Download SHOULD NOT be called for contribution file in a seed prompt",
        );

        assert(
          capturedDynamicVars,
          "Dynamic variables were not passed to the renderer",
        );
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "should propagate errors from the general input gathering stage",
    async () => {
      const stageSlug = "prev-stage";
      const errorMessage = "Database query failed";
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_stages: {
            select: () =>
              Promise.resolve({
                data: [{ slug: stageSlug, display_name: "Previous Stage" }],
                error: null,
              }),
          },
          dialectic_contributions: {
            select: () =>
              Promise.resolve({
                data: null,
                error: new Error(errorMessage),
              }),
          },
        },
      };

      const { client, fileManager } = setup(config);
      fileManager.setUploadAndRegisterFileResponse({ 
        id: "mock-id", 
        created_at: new Date().toISOString(), 
        file_name: "mock-file.md", 
        iteration_number: 1, 
        mime_type: "text/markdown", 
        project_id: "mock-project-id", 
        resource_description: { test: "test" }, 
        resource_type: "test", 
        size_bytes: 100, 
        storage_bucket: "mock-bucket", 
        storage_path: "mock-path", 
        user_id: "mock-user-id",
        session_id: "mock-session-id",
        source_contribution_id: "mock-source-contribution-id",
        stage_slug: "mock-stage-slug",
        updated_at: new Date().toISOString(),
      }, null);

      const downloadFn = (bucket: string, path: string) =>
        downloadFromStorage(client, bucket, path);

      try {
        const subsequentStage: StageContext = {
          ...defaultStage,
          recipe_step: {
            ...mockStageRecipeStep,
            inputs_required: [], // Conforms to the SeedPromptRecipeStep type
          },
        };

        // This test now asserts that the function SUCCEEDS because it should
        // never attempt to query for contributions and trigger the mocked error.
        await assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: downloadFn,
          gatherInputsForStageFn: gatherInputsForStage,
          renderPromptFn: renderPrompt,
          fileManager,
          project: defaultProject,
          session: defaultSession,
          stage: subsequentStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          iterationNumber: 1,
        });
      } finally {
        teardown();
      }
    },
  );

  await t.step("should correctly merge and pass user-specific overlay values to the renderer", async () => {
      let capturedUserOverlay: Json | null | undefined = undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        _sysOverlays,
        userOverlays,
      ) => {
        capturedUserOverlay = userOverlays;
        return "ok";
      };

      const userOverlay = { "custom_instruction": "Be concise" };
      const projectWithUserOverlay: ProjectContext = {
        ...defaultProject,
        user_domain_overlay_values: userOverlay,
      };

      const { client, fileManager } = setup({});
      fileManager.setUploadAndRegisterFileResponse({ 
        id: "mock-id", 
        created_at: new Date().toISOString(), 
        file_name: "mock-file.md", 
        iteration_number: 1, 
        mime_type: "text/markdown", 
        project_id: "mock-project-id", 
        resource_description: { test: "test" }, 
        resource_type: "test", 
        size_bytes: 100, 
        storage_bucket: "mock-bucket", 
        storage_path: "mock-path", 
        user_id: "mock-user-id",
        session_id: "mock-session-id",
        source_contribution_id: "mock-source-contribution-id",
        stage_slug: "mock-stage-slug",
        updated_at: new Date().toISOString(),
      }, null);

      const downloadFn = (bucket: string, path: string) =>
        downloadFromStorage(client, bucket, path);

      try {
        await assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: downloadFn,
          gatherInputsForStageFn: gatherInputsForStage,
          renderPromptFn: renderPromptMockFn,
          fileManager,
          project: projectWithUserOverlay,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: projectWithUserOverlay.initial_user_prompt,
          iterationNumber: 1,
        });
        assertEquals(capturedUserOverlay, userOverlay);
      } finally {
        teardown();
      }
    },
  );

  await t.step("should throw an error if stage is missing system prompt", async () => {
    const { client, fileManager } = setup();
    fileManager.setUploadAndRegisterFileResponse({ 
      id: "mock-id", 
      created_at: new Date().toISOString(), 
      file_name: "mock-file.md", 
      iteration_number: 1, 
      mime_type: "text/markdown", 
      project_id: "mock-project-id", 
      resource_description: { test: "test" }, 
      resource_type: "test", 
      size_bytes: 100, 
      storage_bucket: "mock-bucket", 
      storage_path: "mock-path", 
      user_id: "mock-user-id",
      session_id: "mock-session-id",
      source_contribution_id: "mock-source-contribution-id",
      stage_slug: "mock-stage-slug",
      updated_at: new Date().toISOString(),
    }, null);
    const downloadFn = (bucket: string, path: string) =>
      downloadFromStorage(client, bucket, path);

    try {
      const stageWithMissingPrompt: StageContext = {
        ...defaultStage,
        system_prompts: null,
      };

      await assertRejects(
        async () => {
          await assembleSeedPrompt({
            dbClient: client,
            downloadFromStorageFn: downloadFn,
            gatherInputsForStageFn: gatherInputsForStage,
            renderPromptFn: renderPrompt,
            fileManager,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithMissingPrompt,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            iterationNumber: 1,
          });
        },
        Error,
        `RENDER_PRECONDITION_FAILED: missing system prompt text for stage ${stageWithMissingPrompt.slug}`,
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw if prompt requires 'style_guide_markdown' but it is not provided", async () => {
    const { client, fileManager } = setup();
    fileManager.setUploadAndRegisterFileResponse({ 
      id: "mock-id",
      created_at: new Date().toISOString(),
      file_name: "mock-file.md",
      iteration_number: 1,
      mime_type: "text/markdown",
      project_id: "mock-project-id",
      resource_description: { test: "test" },
      resource_type: "test",  
      size_bytes: 100,
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/",
      user_id: "mock-user-id",
      session_id: "mock-session-id",
      source_contribution_id: "mock-source-contribution-id",
      stage_slug: "mock-stage-slug",
      updated_at: new Date().toISOString(),
    }, null);

    const downloadFn = (bucket: string, path: string) =>
      downloadFromStorage(client, bucket, path);

    try {
      const stageWithStyleGuidePrompt: StageContext = {
        ...defaultStage,
        system_prompts: {
          prompt_text: "This prompt requires a {{#section:style_guide_markdown}}.",
        },
        domain_specific_prompt_overlays: [],
      };

      await assertRejects(
        async () => {
          await assembleSeedPrompt({
            dbClient: client,
            downloadFromStorageFn: downloadFn,
            gatherInputsForStageFn: gatherInputsForStage,
            renderPromptFn: renderPrompt,
            fileManager,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithStyleGuidePrompt,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            iterationNumber: 1,
          });
        },
        Error,
        `RENDER_PRECONDITION_FAILED: missing style_guide_markdown for stage ${stageWithStyleGuidePrompt.slug}`,
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw if prompt requires 'outputs_required' but it is not provided", async () => {
    const { client, fileManager } = setup();
    fileManager.setUploadAndRegisterFileResponse({ 
      id: "mock-id",
      created_at: new Date().toISOString(),
      file_name: "mock-file.md",
      iteration_number: 1,
      mime_type: "text/markdown",
      project_id: "mock-project-id",
      resource_description: { test: "test" },
      resource_type: "test",
      size_bytes: 100,
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/",
      user_id: "mock-user-id",
      session_id: "mock-session-id",
      source_contribution_id: "mock-source-contribution-id",
      stage_slug: "mock-stage-slug",
      updated_at: new Date().toISOString(),
    }, null);

    const downloadFn = (bucket: string, path: string) =>
      downloadFromStorage(client, bucket, path);

    try {
      const stageWithArtifactsPrompt: StageContext = {
        ...defaultStage,
        system_prompts: {
          prompt_text:
            "This prompt requires a {{outputs_required}}.",
        },
        recipe_step: { ...mockStageRecipeStep, outputs_required: [] },
      };

      await assertRejects(
        async () => {
          await assembleSeedPrompt({
            dbClient: client,
            downloadFromStorageFn: downloadFn,
            gatherInputsForStageFn: gatherInputsForStage,
            renderPromptFn: renderPrompt,
            fileManager,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithArtifactsPrompt,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            iterationNumber: 1,
          });
        },
        Error,
        `RENDER_PRECONDITION_FAILED: missing outputs_required for stage ${stageWithArtifactsPrompt.slug}`,
      );
    } finally {
      teardown();
    }
  });
});
