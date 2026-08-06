import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import { assembleSeedPrompt } from "../assembleSeedPrompt/assembleSeedPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  DynamicContextVariables,
  AssembledPrompt,
  RenderPromptFunctionType,
} from "../prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../../supabase.mock.ts";
import { isRecord } from "../../utils/type_guards.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Database } from "../../../types_db.ts";
import type { GatherInputsForStageFn } from "../gatherInputsForStage/gatherInputsForStage.ts";
import { createMockFileManagerService, buildFileRecord } from "../../services/file_manager.mock.ts";
import { DialecticStageSlug, FileType } from "../../types/file_manager.types.ts";
import { FileRecord } from "../../types/file_manager.types.ts";
import { mockDownloadFromStorageTwoArg } from "../../supabase_storage_utils.mock.ts";
import {
  buildProjectContext,
  buildSessionContext,
  buildStageContext,
  buildGatheredRecipeContext,
  mockRenderPromptFn,
} from "../prompt-assembler.mock.ts";
import { buildSeedPromptRecipeStep } from "../../dialectic.mock.ts";

Deno.test("assembleSeedPrompt", async (t) => {  
  await t.step("should include sourceContributionId when provided", async () => {
      /**
       * Contract: when sourceContributionId is provided as a dep,
       *   assembleSeedPrompt forwards it to the upload path context.
       * Arrange: a file manager returning a registered file record;
       *   a mock gatherInputsForStageFn returning a built GatheredRecipeContext;
       *   a mock renderPromptFn returning a string; a sourceContributionId
       *   of "contrib-123".
       * Act:     assembleSeedPrompt with the assembled deps.
       * Assert:  upload called once; upload path context sourceContributionId
       *   equals the provided value.
       */
      // Arrange
      const sourceContributionId = "contrib-123";

      const mockSupabaseSetup = createMockSupabaseClient();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const fileManager = createMockFileManagerService();

      const gatherInputsForStageFn: GatherInputsForStageFn = async () =>
        buildGatheredRecipeContext();

      fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      // Act
      await assembleSeedPrompt({
        dbClient: client,
        downloadFromStorageFn: mockDownloadFromStorageTwoArg,
        gatherInputsForStageFn,
        renderPromptFn: mockRenderPromptFn,
        fileManager,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: buildStageContext(),
        projectInitialUserPrompt: "resolved prompt from storage",
        iterationNumber: 1,
        sourceContributionId,
      });

      // Assert
      assertSpyCalls(uploadSpy, 1);
      const uploadContext = uploadSpy.calls[0].args[0];
      assertEquals(
        uploadContext.pathContext.sourceContributionId,
        sourceContributionId,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should correctly assemble, persist, and render a prompt for the initial stage", async () => {
    /**
     * Contract: assembleSeedPrompt gathers context, renders the prompt with
     *   the stage's system prompt text and overlays, uploads the result with
     *   fileType SeedPrompt, and returns the rendered content and file record id.
     * Arrange: a stage with a specific system prompt text and a single overlay;
     *   a project with user_domain_overlay_values null; a mock
     *   gatherInputsForStageFn returning a GatheredRecipeContext with empty
     *   sourceDocuments and a seed recipe step (no outputs_required injection);
     *   a spy on renderPromptFn returning a known string; a file manager
     *   returning a built file record.
     * Act:     assembleSeedPrompt with the assembled deps.
     * Assert:  result.promptContent equals the rendered string;
     *   result.source_prompt_resource_id equals the file record id;
     *   render called once with the stage's prompt text, the expected
     *   DynamicContextVariables, the stage's overlay values, and null user overlays;
     *   upload called once with fileType SeedPrompt and the rendered content.
     */
    // Arrange
    const expectedRenderedPrompt = "Mocked Rendered Prompt Output";
    const stagePromptText = "System prompt for {user_objective} in {domain}.";
    const stageOverlayValues: Json = { style: "formal" };

    const project = buildProjectContext();
    const session = buildSessionContext();
    const stage = buildStageContext({
      system_prompts: { prompt_text: stagePromptText },
      domain_specific_prompt_overlays: [{ overlay_values: stageOverlayValues }],
    });

    const gatheredContext = buildGatheredRecipeContext({
      sourceDocuments: [],
      recipeStep: buildSeedPromptRecipeStep(),
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () => gatheredContext;

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => expectedRenderedPrompt);

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const mockFileRecord = buildFileRecord();
    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    const uploadSpy = fileManager.uploadAndRegisterFile;

    // Act
    const result: AssembledPrompt = await assembleSeedPrompt({
      dbClient: client,
      downloadFromStorageFn: mockDownloadFromStorageTwoArg,
      gatherInputsForStageFn,
      renderPromptFn,
      fileManager,
      project,
      session,
      stage,
      projectInitialUserPrompt: project.initial_user_prompt,
      iterationNumber: 1,
    });

    // Assert
    assertEquals(result.promptContent, expectedRenderedPrompt);
    assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
    assertSpyCalls(renderPromptFn, 1);

    assertSpyCalls(uploadSpy, 1);
    const uploadContext = uploadSpy.calls[0].args[0];
    assertEquals(uploadContext.pathContext.fileType, FileType.SeedPrompt);
    assertEquals(uploadContext.fileContent, expectedRenderedPrompt);

    const renderArgs = renderPromptFn.calls[0].args;
    assertEquals(renderArgs[0], stagePromptText);

    const expectedDynamicVars: DynamicContextVariables = {
      user_objective: project.project_name,
      domain: project.dialectic_domains.name,
      context_description: project.initial_user_prompt,
      original_user_request: project.initial_user_prompt,
      recipeStep: gatheredContext.recipeStep,
      sourceDocuments: [],
    };
    assertEquals(renderArgs[1], expectedDynamicVars);
    assertEquals(renderArgs[2], stageOverlayValues);
    assertEquals(renderArgs[3], null);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("correctly handles recipe_step with an empty outputs_required array", async () => {
    /**
     * Contract: when the gathered recipe step has an empty outputs_required
     *   array, render does NOT inject outputs_required into the system
     *   default overlay values passed to renderPromptFn.
     * Arrange: a mock gatherInputsForStageFn returning a GatheredRecipeContext
     *   whose recipeStep has outputs_required: []; a spy on renderPromptFn
     *   capturing the system overlay arg; a file manager returning a built
     *   file record.
     * Act:     assembleSeedPrompt with the assembled deps.
     * Assert:  result.promptContent equals the rendered string; the captured
     *   system overlay does not contain an outputs_required key.
     */
    // Arrange
    const stageOverlayValues: Json = { style: "formal" };

    const stage = buildStageContext({
      domain_specific_prompt_overlays: [{ overlay_values: stageOverlayValues }],
    });

    const gatheredContext = buildGatheredRecipeContext({
      sourceDocuments: [],
      recipeStep: buildSeedPromptRecipeStep({ outputs_required: [] }),
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () => gatheredContext;

    let capturedSysOverlay: Json | undefined;
    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(
      (_base, _vars, sysOverlays) => {
        capturedSysOverlay = sysOverlays;
        return "ok";
      },
    );

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    const result = await assembleSeedPrompt({
      dbClient: client,
      downloadFromStorageFn: mockDownloadFromStorageTwoArg,
      gatherInputsForStageFn,
      renderPromptFn,
      fileManager,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      iterationNumber: 1,
    });

    // Assert
    assertEquals(result.promptContent, "ok");

    if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
      assert(
        !("outputs_required" in capturedSysOverlay),
        "outputs_required should NOT be passed to the renderer for a seed prompt",
      );
    }

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should correctly assemble for a subsequent stage with prior inputs", async () => {
    /**
     * Contract: assembleSeedPrompt works correctly for a non-initial stage
     *   (e.g., Antithesis), forwarding the gathered context to render and
     *   uploading the rendered content with fileType SeedPrompt.
     * Arrange: a stage with slug Antithesis; a mock gatherInputsForStageFn
     *   returning a GatheredRecipeContext with empty sourceDocuments (no
     *   prior inputs gathered for a seed prompt); a spy on renderPromptFn
     *   returning a known string; a file manager returning a built file record.
     * Act:     assembleSeedPrompt with the assembled deps.
     * Assert:  result.promptContent equals the rendered string; render called
     *   once with the gathered dynamic context variables.
     */
    // Arrange
    const expectedRenderedPrompt = "Mocked Subsequent Stage Output";

    const stage = buildStageContext({
      slug: DialecticStageSlug.Antithesis,
    });

    const gatheredContext = buildGatheredRecipeContext({
      sourceDocuments: [],
      recipeStep: buildSeedPromptRecipeStep(),
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () => gatheredContext;

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => expectedRenderedPrompt);

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    const result = await assembleSeedPrompt({
      dbClient: client,
      downloadFromStorageFn: mockDownloadFromStorageTwoArg,
      gatherInputsForStageFn,
      renderPromptFn,
      fileManager,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      iterationNumber: 1,
    });

    // Assert
    assertEquals(result.promptContent, expectedRenderedPrompt);
    assertSpyCalls(renderPromptFn, 1);

    const renderArgs = renderPromptFn.calls[0].args;
    const dynamicVars = renderArgs[1] as DynamicContextVariables;
    assert(
      dynamicVars,
      "Dynamic variables were not passed to the renderer",
    );
    assertEquals(dynamicVars.sourceDocuments, []);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should propagate errors from the general input gathering stage", async () => {
    /**
     * Contract: when gatherInputsForStageFn throws, assembleSeedPrompt
     *   propagates the error without catching it.
     * Arrange: a mock gatherInputsForStageFn that rejects with a known
     *   error message; a mock renderPromptFn (should never be called);
     *   a file manager returning a built file record.
     * Act:     assembleSeedPrompt via assertRejects.
     * Assert:  rejects with Error matching the gather error message.
     */
    // Arrange
    const errorMessage = "Database query failed";

    const gatherInputsForStageFn: GatherInputsForStageFn = async () => {
      throw new Error(errorMessage);
    };

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => "irrelevant");

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act + Assert
    await assertRejects(
      () =>
        assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: mockDownloadFromStorageTwoArg,
          gatherInputsForStageFn,
          renderPromptFn,
          fileManager,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: buildStageContext(),
          projectInitialUserPrompt: "resolved prompt from storage",
          iterationNumber: 1,
        }),
      Error,
      errorMessage,
      "assembleSeedPrompt must propagate errors from gatherInputsForStageFn",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should correctly merge and pass user-specific overlay values to the renderer", async () => {
    /**
     * Contract: assembleSeedPrompt forwards project.user_domain_overlay_values
     *   to renderPromptFn as the userProjectOverlayValues argument.
     * Arrange: a project with user_domain_overlay_values set to a known
     *   overlay object; a mock gatherInputsForStageFn returning a built
     *   GatheredRecipeContext; a spy on renderPromptFn capturing the user
     *   overlay arg; a file manager returning a built file record.
     * Act:     assembleSeedPrompt with the assembled deps.
     * Assert:  render's 4th arg equals the project's user_domain_overlay_values.
     */
    // Arrange
    const userOverlay: Json = { custom_instruction: "Be concise" };

    const project = buildProjectContext({
      user_domain_overlay_values: userOverlay,
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () =>
      buildGatheredRecipeContext();

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => "ok");

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assembleSeedPrompt({
      dbClient: client,
      downloadFromStorageFn: mockDownloadFromStorageTwoArg,
      gatherInputsForStageFn,
      renderPromptFn,
      fileManager,
      project,
      session: buildSessionContext(),
      stage: buildStageContext(),
      projectInitialUserPrompt: project.initial_user_prompt,
      iterationNumber: 1,
    });

    // Assert
    assertSpyCalls(renderPromptFn, 1);
    const renderArgs = renderPromptFn.calls[0].args;
    assertEquals(renderArgs[3], userOverlay);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw an error if stage is missing system prompt", async () => {
    /**
     * Contract: when stage.system_prompts is null, assembleSeedPrompt throws
     *   a RENDER_PRECONDITION_FAILED error mentioning the missing system
     *   prompt text for the stage slug.
     * Arrange: a stage with system_prompts set to null; a mock
     *   gatherInputsForStageFn returning a built GatheredRecipeContext;
     *   a mock renderPromptFn (should never be called); a file manager
     *   returning a built file record.
     * Act:     assembleSeedPrompt via assertRejects.
     * Assert:  rejects with Error matching the missing-system-prompt message.
     */
    // Arrange
    const stage = buildStageContext({
      system_prompts: null,
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () =>
      buildGatheredRecipeContext();

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => "irrelevant");

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act + Assert
    await assertRejects(
      () =>
        assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: mockDownloadFromStorageTwoArg,
          gatherInputsForStageFn,
          renderPromptFn,
          fileManager,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          iterationNumber: 1,
        }),
      Error,
      `RENDER_PRECONDITION_FAILED: missing system prompt text for stage ${stage.slug}`,
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw if prompt requires 'style_guide_markdown' but it is not provided", async () => {
    /**
     * Contract: when the stage's system prompt text contains
     *   {{#section:style_guide_markdown}} but the stage overlays do not
     *   include a valid style_guide_markdown string, assembleSeedPrompt
     *   throws a RENDER_PRECONDITION_FAILED error.
     * Arrange: a stage with prompt text containing the style guide marker
     *   and empty domain_specific_prompt_overlays; a mock
     *   gatherInputsForStageFn returning a built GatheredRecipeContext;
     *   a mock renderPromptFn (should never be called); a file manager
     *   returning a built file record.
     * Act:     assembleSeedPrompt via assertRejects.
     * Assert:  rejects with Error matching the missing-style-guide message.
     */
    // Arrange
    const stage = buildStageContext({
      system_prompts: {
        prompt_text: "This prompt requires a {{#section:style_guide_markdown}}.",
      },
      domain_specific_prompt_overlays: [],
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () =>
      buildGatheredRecipeContext();

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => "irrelevant");

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act + Assert
    await assertRejects(
      () =>
        assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: mockDownloadFromStorageTwoArg,
          gatherInputsForStageFn,
          renderPromptFn,
          fileManager,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          iterationNumber: 1,
        }),
      Error,
      `RENDER_PRECONDITION_FAILED: missing style_guide_markdown for stage ${stage.slug}`,
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw if prompt requires 'outputs_required' but it is not provided", async () => {
    /**
     * Contract: when the stage's system prompt text contains
     *   {{outputs_required}} but the gathered recipe step has an empty
     *   outputs_required array, assembleSeedPrompt throws a
     *   RENDER_PRECONDITION_FAILED error.
     * Arrange: a stage with prompt text containing {{outputs_required}} and
     *   empty domain_specific_prompt_overlays; a mock gatherInputsForStageFn
     *   returning a GatheredRecipeContext whose recipeStep has
     *   outputs_required: []; a mock renderPromptFn (should never be called);
     *   a file manager returning a built file record.
     * Act:     assembleSeedPrompt via assertRejects.
     * Assert:  rejects with Error matching the missing-outputs_required message.
     */
    // Arrange
    const stage = buildStageContext({
      system_prompts: {
        prompt_text: "This prompt requires a {{outputs_required}}.",
      },
      domain_specific_prompt_overlays: [],
    });

    const gatheredContext = buildGatheredRecipeContext({
      recipeStep: buildSeedPromptRecipeStep({ outputs_required: [] }),
    });

    const gatherInputsForStageFn: GatherInputsForStageFn = async () => gatheredContext;

    const renderPromptFn: Spy<RenderPromptFunctionType> = spy(() => "irrelevant");

    const mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act + Assert
    await assertRejects(
      () =>
        assembleSeedPrompt({
          dbClient: client,
          downloadFromStorageFn: mockDownloadFromStorageTwoArg,
          gatherInputsForStageFn,
          renderPromptFn,
          fileManager,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          iterationNumber: 1,
        }),
      Error,
      `RENDER_PRECONDITION_FAILED: missing outputs_required for stage ${stage.slug}`,
    );

    mockSupabaseSetup.clearAllStubs?.();
  });
});
