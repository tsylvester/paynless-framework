import { assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, Spy } from "jsr:@std/testing@0.225.1/mock";
import { assemblePlannerPrompt } from "../assemblePlannerPrompt/assemblePlannerPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssembledPrompt,
  DynamicContextVariables,
  RenderFn,
  AssemblerSourceDocument,
} from "../prompt-assembler.interface.ts";
import { type GatherContextFn } from "../gatherContext/gatherContext.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from "../../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../types_db.ts";
import {
  createMockFileManagerService,
  MockFileManagerService,
  buildFileRecord,
} from "../../services/file_manager.mock.ts";
import {
  FileType,
  type FileRecord,
  type ResourceUploadContext,
} from "../../types/file_manager.types.ts";
import {
  DialecticJobRow,
  DialecticRecipeStep,
  ContextForDocument,
} from "../../../dialectic-service/dialectic.interface.ts";
import { assertSpyCall, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import { isRecord } from "../../utils/type_guards.ts";
import { assert } from "jsr:@std/assert@0.225.3";
import { isDialecticStageSlug } from "../../utils/type-guards/type_guards.file_manager.ts";
import {
  buildProjectContext,
  buildSessionContext,
  buildStageContext,
  buildDynamicContextVariables,
  buildAssemblerSourceDocument,
} from "../prompt-assembler.mock.ts";
import { buildDialecticJobRow, buildDialecticRecipeTemplateStep } from "../../dialectic.mock.ts";

Deno.test("assemblePlannerPrompt", async (t) => {
  /**
   * Contract: given a planner job with a valid model_id and a recipe step with
   *   context_for_documents outputs, assemblePlannerPrompt queries the step's
   *   prompt template, gathers context, injects context_for_documents into the
   *   dynamic context, renders the prompt with the overridden template, and
   *   uploads the result — returning the rendered content and resource id.
   * Arrange: a planner job with model_id "model-claude-3-opus"; a recipe step
   *   with prompt_template_id "spt-123" and context_for_documents outputs; a
   *   stage carrying that step; a mock DB returning the planner prompt text for
   *   that template id; a file manager returning a registered file record.
   * Act:     assemblePlannerPrompt with the assembled deps.
   * Assert:  result.promptContent is the render fn's output; result.source_prompt_resource_id
   *   is the file record's id; DB queried system_prompts by prompt_template_id;
   *   gatherContext called once with project, session, stage, resolved prompt,
   *   iteration count; render called with overridden prompt text and injected
   *   context_for_documents; upload called with the correct ResourceUploadContext.
   */
  await t.step("should correctly assemble a planner prompt and fulfill all dependency contracts",
    async () => {
      // Arrange
      const plannerPromptText = "This is the planner prompt for step {step_name}.";

      const recipeStep = buildDialecticRecipeTemplateStep({
        step_name: "GeneratePlan",
        prompt_template_id: "spt-123",
        outputs_required: {
          context_for_documents: [
            {
              document_key: FileType.business_case,
              content_to_include: {},
            },
          ],
        },
      });

      const project = buildProjectContext();

      const session = buildSessionContext();

      const stage = buildStageContext({
        recipe_step: recipeStep,
      });

      const job = buildDialecticJobRow({
        job_type: "PLAN",
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const mockDynamicContext = buildDynamicContextVariables({
        recipeStep: recipeStep,
      });

      const mockFileRecord = buildFileRecord({
        id: "mock-planner-resource-id-456",
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const fileManager = createMockFileManagerService();
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => mockDynamicContext);
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      // Act
      const result: AssembledPrompt = await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: job,
        project: project,
        session: session,
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      // Assert
      // 1. The final return value is correct
      assertEquals(result.promptContent, "rendered planner prompt");
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);

      // 2. The database was queried for the correct template
      const dbSpies = mockSupabaseSetup.spies.getLatestQueryBuilderSpies("system_prompts")!;
      assertSpyCalls(dbSpies.select!, 1);
      assertSpyCall(dbSpies.eq!, 0, {
        args: ["id", recipeStep.prompt_template_id],
      });
      assertSpyCalls(dbSpies.single!, 1);

      // 3. Context was gathered correctly with all dependencies
      assertSpyCalls(gatherContextFn, 1);
      const gatherArgs = gatherContextFn.calls[0].args;
      assertEquals(gatherArgs[0], client);
      assertEquals(typeof gatherArgs[1], "function"); // downloadFn
      assertEquals(typeof gatherArgs[2], "function"); // gatherInputsFn
      assertEquals(gatherArgs[3], project);
      assertEquals(gatherArgs[4], session);
      assertEquals(gatherArgs[5], stage);
      assertEquals(gatherArgs[6], "resolved prompt from storage");
      assertEquals(gatherArgs[7], session.iteration_count);

      // 4. Rendering was performed with the overridden template and correct context
      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      assertEquals(typeof renderCallArgs[0], "function"); // renderPromptFn
      const stageArgForRender = renderCallArgs[1];
      assertEquals(stageArgForRender.system_prompts!.prompt_text, plannerPromptText);
      // assemblePlannerPrompt adds context_for_documents and removes raw sourceDocuments
      const { sourceDocuments: _removed, ...contextWithoutRawDocs } = mockDynamicContext;
      const expectedContext = {
        ...contextWithoutRawDocs,
        context_for_documents: {
          _instructions: "You must fill in the content_to_include objects in the context_for_documents array with specific alignment values. These alignment details ensure cross-document coordination:\n\n1. Fill in each content_to_include object with shared terminology, consistent values, and coordinated decisions that will be used across all documents in this step group.\n2. Produce a header_context artifact with completed content_to_include objects containing these alignment values.\n3. Ensure all documents in the step group will use these alignment details when they are generated.\n\nThe context_for_documents array below contains empty content_to_include object models that you must fill in with specific alignment values.",
          documents: [
            {
              document_key: FileType.business_case,
              content_to_include: {},
            },
          ],
        },
      };
      assertEquals(renderCallArgs[2], expectedContext);
      assertEquals(renderCallArgs[3], project.user_domain_overlay_values);

      // 5. The file was saved with the correct and complete context
      assertSpyCalls(uploadSpy, 1);
      if (!isRecord(job.payload)) {
        throw new Error("Test setup error: job.payload is not a record.");
      }
      if (typeof job.payload.model_id !== 'string') {
        throw new Error("Test setup error: job.payload.model_id is not a string.");
      }
      if (!isDialecticStageSlug(stage.slug)) {
        throw new Error("Test setup error: stage.slug is not a valid dialectic stage slug.");
      }
      const expectedUploadContext: ResourceUploadContext = {
        pathContext: {
          projectId: project.id,
          sessionId: session.id,
          iteration: session.iteration_count,
          stageSlug: stage.slug,
          fileType: FileType.PlannerPrompt,
          modelSlug: "claude-3-opus",
          attemptCount: job.attempt_count,
          stepName: "GeneratePlan",
          branchKey: null,
          parallelGroup: null,
          sourceContributionId: null,
        },
        resourceTypeForDb: "planner_prompt",
        fileContent: "rendered planner prompt",
        mimeType: "text/markdown",
        sizeBytes: 23,
        userId: project.user_id,
        description: `Planner prompt for stage: ${stage.slug}, step: ${recipeStep.step_name}`,
      };
      assertEquals(uploadSpy.calls[0].args[0], expectedUploadContext);

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should forward sourceContributionId when continuation exists",
    async () => {
      /**
       * Contract: when a planner job carries a target_contribution_id (a
       *   continuation), assemblePlannerPrompt forwards it as
       *   sourceContributionId in the upload path context.
       * Arrange: a job with target_contribution_id set to "contrib-123";
       *   a recipe step with prompt_template_id (to pass the precondition);
       *   a mock DB returning a prompt row and model row; a file manager
       *   returning a registered file record.
       * Act:     assemblePlannerPrompt with the assembled deps.
       * Assert:  upload called once; uploadContext.pathContext.sourceContributionId
       *   equals the job's target_contribution_id.
       */
      // Arrange
      const continuationContributionId = "contrib-123";

      const stage = buildStageContext({
        recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
      });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
        target_contribution_id: continuationContributionId,
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const fileManager = createMockFileManagerService();
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      // Act
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: job,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      // Assert
      assertSpyCalls(uploadSpy, 1);
      const uploadContext = uploadSpy.calls[0].args[0];
      assertEquals(
        uploadContext.pathContext.sourceContributionId,
        continuationContributionId,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should correctly handle domain_specific_prompt_overlays",
    async () => {
      /**
       * Contract: assemblePlannerPrompt forwards the stage's
       *   domain_specific_prompt_overlays unchanged to the render function's
       *   stage argument.
       * Arrange: a stage with a single overlay carrying custom overlay_values;
       *   a recipe step with prompt_template_id (to pass the precondition);
       *   a mock DB returning a prompt row and model row.
       * Act:     assemblePlannerPrompt with the assembled deps.
       * Assert:  render called once; render's stage argument
       *   (args[1]).domain_specific_prompt_overlays[0] equals the overlay
       *   object passed in.
       */
      // Arrange
      const overlay = { overlay_values: { "custom_key": "custom_value" } };

      const stage = buildStageContext({
        recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
        domain_specific_prompt_overlays: [overlay],
      });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const fileManager = createMockFileManagerService();
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

      // Act
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: job,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      // Assert
      assertSpyCalls(renderFn, 1);
      assertEquals(
        renderFn.calls[0].args[1].domain_specific_prompt_overlays[0],
        overlay,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should use different names for db query and file naming when provided",
    async () => {
      /**
       * Contract: assemblePlannerPrompt uses the recipe step's
       *   prompt_template_id for the DB query and the recipe step's step_name
       *   for the upload path context — two distinct fields driving two
       *   distinct outputs.
       * Arrange: a recipe step with prompt_template_id "spt-special" and
       *   step_name "SpecialStep" (distinct values); context_for_documents
       *   outputs (minimum to pass PLAN preconditions); a mock DB returning a
       *   prompt row; a file manager returning a registered file record.
       * Act:     assemblePlannerPrompt with the assembled deps.
       * Assert:  DB eq call used prompt_template_id; upload path context
       *   stepName equals the recipe step's step_name.
       */
      // Arrange
      const recipeStep = buildDialecticRecipeTemplateStep({
        step_name: "SpecialStep",
        prompt_template_id: "spt-special",
      });

      const stage = buildStageContext({ recipe_step: recipeStep });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "special text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const fileManager = createMockFileManagerService();
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      // Act
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: job,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      // Assert
      const dbSpies = mockSupabaseSetup.spies.getLatestQueryBuilderSpies("system_prompts")!;
      assertSpyCall(dbSpies.eq!, 0, {
        args: ["id", recipeStep.prompt_template_id],
      });

      assertSpyCalls(uploadSpy, 1);
      assertEquals(
        uploadSpy.calls[0].args[0].pathContext.stepName,
        recipeStep.step_name,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should throw an error if the specified prompt template is not found",
    async () => {
      /**
       * Contract: when the DB returns no prompt row for the recipe step's
       *   prompt_template_id, assemblePlannerPrompt throws an Error naming the
       *   missing template id.
       * Arrange: a recipe step with prompt_template_id "spt-missing";
       *   context_for_documents outputs (minimum to pass PLAN preconditions);
       *   a mock DB returning null data for system_prompts.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the missing-template message
       *   containing the recipe step's prompt_template_id.
       */
      // Arrange
      const recipeStep = buildDialecticRecipeTemplateStep({
        prompt_template_id: "spt-missing",
      });

      const stage = buildStageContext({ recipe_step: recipeStep });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: null, error: null },
          },
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager: createMockFileManagerService(),
          job: job,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Act + Assert
      await assertRejects(
        assembleFn,
        Error,
        `Failed to find planner prompt template with ID ${recipeStep.prompt_template_id}`,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should propagate errors from the database when fetching the prompt template",
    async () => {
      /**
       * Contract: when the DB returns an error for the system_prompts query,
       *   assemblePlannerPrompt propagates that error unchanged.
       * Arrange: a recipe step with prompt_template_id (to pass the
       *   precondition); a mock DB returning an error for system_prompts.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the DB error's message.
       */
      // Arrange
      const dbError = new Error("Database query failed");

      const stage = buildStageContext({
        recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
      });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: null, error: dbError }
          },
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager: createMockFileManagerService(),
          job: job,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Act + Assert
      await assertRejects(
        assembleFn,
        Error,
        dbError.message,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );
  
  await t.step("should throw an error if file manager fails to save",
    async () => {
      /**
       * Contract: when the file manager's uploadAndRegisterFile returns an
       *   error, assemblePlannerPrompt throws an Error wrapping that error
       *   with a "Failed to save planner prompt" prefix.
       * Arrange: a recipe step with prompt_template_id (to pass the
       *   precondition); a mock DB returning a prompt row and model row;
       *   a file manager configured to return an upload error.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching "Failed to save planner prompt:
       *   <upload error message>".
       */
      // Arrange
      const fileManagerError = new Error("Failed to upload file");

      const stage = buildStageContext({
        recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
      });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null }
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const fileManager = createMockFileManagerService();
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      fileManager.setUploadAndRegisterFileResponse(null, fileManagerError);

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: job,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Act + Assert
      await assertRejects(
        assembleFn,
        Error,
        `Failed to save planner prompt: ${fileManagerError.message}`,
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should propagate errors from gatherContext dependency",
    async () => {
      /**
       * Contract: when the gatherContext dependency rejects, assemblePlannerPrompt
       *   propagates that error unchanged.
       * Arrange: a recipe step with prompt_template_id (to pass the
       *   precondition); a mock DB returning a prompt row and model row;
       *   a gatherContext fn that rejects with a known error.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the gatherContext error's message.
       */
      // Arrange
      const gatherError = new Error("Failed to gather context");

      const stage = buildStageContext({
        recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
      });

      const job = buildDialecticJobRow({
        payload: {
          model_id: "model-claude-3-opus",
          model_slug: "claude-3-opus",
        },
      });

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;

      const gatherContextFn: GatherContextFn = () => Promise.reject(gatherError);
      const renderFn: Spy<RenderFn> = spy(() => "should-not-be-called");

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager: createMockFileManagerService(),
          job: job,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Act + Assert
      await assertRejects(assembleFn, Error, gatherError.message);

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should propagate errors from render dependency", async () => {
    /**
     * Contract: when the render dependency throws, assemblePlannerPrompt
     *   propagates that error unchanged.
     * Arrange: a recipe step with prompt_template_id (to pass the
     *   precondition); a mock DB returning a prompt row and model row;
     *   a render fn that throws a known error.
     * Act:     assemblePlannerPrompt via assertRejects.
     * Assert:  rejects with Error matching the render error's message.
     */
    // Arrange
    const renderError = new Error("Failed to render prompt");

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;

    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: RenderFn = () => { throw renderError; };

    // Act + Assert
    await assertRejects(
      () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager: createMockFileManagerService(),
          job: job,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        }),
      Error,
      renderError.message,
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw an error if session has no selected models",
    async () => {
      /**
       * Contract: when the session's selected_model_ids is empty,
       *   assemblePlannerPrompt throws a PRECONDITION_FAILED error before
       *   doing any DB or file work.
       * Arrange: a session with selected_model_ids set to an empty array.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the no-selected-models message.
       */
      // Arrange
      const session = buildSessionContext({ selected_model_ids: [] });

      const mockSupabaseSetup = createMockSupabaseClient();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager: createMockFileManagerService(),
          job: buildDialecticJobRow(),
          project: buildProjectContext(),
          session: session,
          stage: buildStageContext(),
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Act + Assert
      await assertRejects(
        assembleFn,
        Error,
        "PRECONDITION_FAILED: Session must have at least one selected model.",
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should throw an error if job payload is invalid",
    async () => {
      /**
       * Contract: when the job payload is missing 'model_id',
       *   assemblePlannerPrompt throws a PRECONDITION_FAILED error.
       * Arrange: a job with the default empty payload (no model_id).
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the missing-model_id message.
       */
      // Arrange
      const mockSupabaseSetup = createMockSupabaseClient();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

      // Act + Assert
      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager: createMockFileManagerService(),
            job: buildDialecticJobRow(),
            project: buildProjectContext(),
            session: buildSessionContext(),
            stage: buildStageContext(),
            projectInitialUserPrompt: "resolved prompt from storage",
            gatherContext: gatherContextFn,
            render: renderFn,
          }),
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'model_id'.",
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should throw a precondition error if model_slug is missing from job payload",
    async () => {
      /**
       * Contract: when the job payload has model_id but is missing model_slug,
       *   assemblePlannerPrompt throws a PRECONDITION_FAILED error.
       * Arrange: a job with payload containing model_id but no model_slug.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the missing-model_slug message.
       */
      // Arrange
      const mockSupabaseSetup = createMockSupabaseClient();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

      // Act + Assert
      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager: createMockFileManagerService(),
            job: buildDialecticJobRow({
              payload: { model_id: "model-claude-3-opus" },
            }),
            project: buildProjectContext(),
            session: buildSessionContext(),
            stage: buildStageContext(),
            projectInitialUserPrompt: "resolved prompt from storage",
            gatherContext: gatherContextFn,
            render: renderFn,
          }),
        Error,
        "PRECONDITION_FAILED: Job payload is missing model_slug.",
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should throw a precondition error if recipe_step is missing from stage context",
    async () => {
      /**
       * Contract: when the stage context's recipe_step is null,
       *   assemblePlannerPrompt throws a PRECONDITION_FAILED error.
       * Arrange: a stage with recipe_step set to null (intentionally malformed
       *   — allowed type-cast exception for testing graceful error handling);
       *   a job with model_id and model_slug to pass the prior preconditions.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the missing-recipe_step message.
       */
      // Arrange
      const mockSupabaseSetup = createMockSupabaseClient();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

      // Intentionally malformed: recipe_step is null to test graceful error handling.
      const stageWithoutRecipe: StageContext = {
        ...buildStageContext(),
        recipe_step: null as unknown as DialecticRecipeStep,
      };

      // Act + Assert
      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager: createMockFileManagerService(),
            job: buildDialecticJobRow({
              payload: {
                model_id: "model-claude-3-opus",
                model_slug: "claude-3-opus",
              },
            }),
            project: buildProjectContext(),
            session: buildSessionContext(),
            stage: stageWithoutRecipe,
            projectInitialUserPrompt: "resolved prompt from storage",
            gatherContext: gatherContextFn,
            render: renderFn,
          }),
        Error,
        "PRECONDITION_FAILED: Stage context is missing recipe_step.",
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should throw a precondition error if the legacy step_info object is present in the job payload",
    async () => {
      /**
       * Contract: when the job payload contains the deprecated step_info
       *   object, assemblePlannerPrompt throws a PRECONDITION_FAILED error.
       * Arrange: a job with payload containing step_info.
       * Act:     assemblePlannerPrompt via assertRejects.
       * Assert:  rejects with Error matching the deprecated step_info message.
       */
      // Arrange
      const mockSupabaseSetup = createMockSupabaseClient();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
      const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

      const job = buildDialecticJobRow({
        payload: { step_info: {} },
      });

      // Act + Assert
      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager: createMockFileManagerService(),
            job: job,
            project: buildProjectContext(),
            session: buildSessionContext(),
            stage: buildStageContext(),
            projectInitialUserPrompt: "resolved prompt from storage",
            gatherContext: gatherContextFn,
            render: renderFn,
          }),
        Error,
        "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload. This field is deprecated.",
      );

      mockSupabaseSetup.clearAllStubs?.();
    },
  );

  await t.step("should pass branch_key and parallel_group from recipe_step to fileManager", async () => {
    /**
     * Contract: assemblePlannerPrompt forwards the recipe step's branch_key
     *   and parallel_group to the upload path context.
     * Arrange: a recipe step with branch_key "test-branch-key" and
     *   parallel_group 1 (distinct from the default null values); a mock DB
     *   returning a prompt row and model row; a file manager returning a
     *   registered file record.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  upload path context branchKey and parallelGroup equal the
     *   recipe step's values.
     */
    // Arrange
    const recipeStep = buildDialecticRecipeTemplateStep({
      prompt_template_id: "spt-123",
      branch_key: "test-branch-key",
      parallel_group: 1,
    });

    const stage = buildStageContext({ recipe_step: recipeStep });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
    const uploadSpy = fileManager.uploadAndRegisterFile;

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(uploadSpy, 1);
    const uploadContext = uploadSpy.calls[0].args[0];
    assertEquals(uploadContext.pathContext.branchKey, recipeStep.branch_key);
    assertEquals(uploadContext.pathContext.parallelGroup, recipeStep.parallel_group);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should fetch template from storage when prompt_text is null and document_template_id exists", async () => {
    /**
     * Contract: when the system_prompts row has null prompt_text but a
     *   document_template_id, assemblePlannerPrompt fetches the template
     *   content from storage and uses it as the prompt text for rendering.
     * Arrange: a mock DB returning a system_prompts row with null prompt_text
     *   and a document_template_id; a dialectic_document_templates row with
     *   storage metadata; a storage mock returning the template content as a
     *   Blob; a recipe step with prompt_template_id (to pass the precondition).
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  storage download called with the correct bucket and path;
     *   render called with the downloaded template content as prompt_text;
     *   system_prompts select queried for "prompt_text, document_template_id";
     *   dialectic_document_templates queried by template id.
     */
    // Arrange
    const templateContent = "# Template Content\n\nThis is the actual template.";
    const templateId = "template-uuid-123";
    const storageBucket = "prompt-templates";
    const storagePath = "docs/prompts/thesis/";
    const fileName = "thesis_planner_header_v1.md";
    const fullPath = `${storagePath}${fileName}`;
    const templateBlob = new Blob([templateContent], { type: "text/markdown" });

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: null, document_template_id: templateId }],
            error: null,
          },
        },
        dialectic_document_templates: {
          select: {
            data: [{ id: templateId, storage_bucket: storageBucket, storage_path: storagePath, file_name: fileName }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
      storageMock: {
        downloadResult: async (bucketId: string, path: string) => {
          assertEquals(bucketId, storageBucket);
          assertEquals(path, fullPath);
          return { data: templateBlob, error: null };
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    const storageBucketApi = mockSupabaseSetup.spies.storage.from(storageBucket);
    const downloadSpy = storageBucketApi.downloadSpy;

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(downloadSpy, 1);
    assertSpyCall(downloadSpy, 0, { args: [fullPath] });

    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    assertEquals(renderCallArgs[1].system_prompts!.prompt_text, templateContent);

    const dbSpies = mockSupabaseSetup.spies.getLatestQueryBuilderSpies("system_prompts")!;
    assertSpyCall(dbSpies.select!, 0, { args: ["prompt_text, document_template_id"] });

    const templateDbSpies = mockSupabaseSetup.spies.getLatestQueryBuilderSpies("dialectic_document_templates")!;
    assertSpyCalls(templateDbSpies.select!, 1);
    assertSpyCall(templateDbSpies.eq!, 0, { args: ["id", templateId] });

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw error when both prompt_text and document_template_id are null", async () => {
    /**
     * Contract: when the system_prompts row has null for both prompt_text
     *   and document_template_id, assemblePlannerPrompt throws an error.
     * Arrange: a mock DB returning a system_prompts row with both fields null
     *   and a valid ai_providers row (to pass the model fetch); a recipe step
     *   with prompt_template_id (to pass the precondition).
     * Act:     assemblePlannerPrompt via assertRejects.
     * Assert:  rejects with Error matching the missing-both-fields message.
     */
    // Arrange
    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: null, document_template_id: null }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

    const assembleFn = () =>
      assemblePlannerPrompt({
        dbClient: client,
        fileManager: createMockFileManagerService(),
        job: job,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

    // Act + Assert
    await assertRejects(
      assembleFn,
      Error,
      "System prompt template is missing both prompt_text and document_template_id",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw error when template download fails", async () => {
    /**
     * Contract: when the system_prompts row has a document_template_id but
     *   the storage download fails, assemblePlannerPrompt throws an error.
     * Arrange: a mock DB returning a system_prompts row with null prompt_text
     *   and a document_template_id; a dialectic_document_templates row with
     *   storage metadata; a storage mock returning a download error; a recipe
     *   step with prompt_template_id (to pass the precondition).
     * Act:     assemblePlannerPrompt via assertRejects.
     * Assert:  rejects with Error matching the download-failure message.
     */
    // Arrange
    const templateId = "template-uuid-123";
    const storageBucket = "prompt-templates";
    const storagePath = "docs/prompts/thesis/";
    const fileName = "thesis_planner_header_v1.md";
    const fullPath = `${storagePath}${fileName}`;
    const downloadError = new Error("File not found");

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: null, document_template_id: templateId }],
            error: null,
          },
        },
        dialectic_document_templates: {
          select: {
            data: [{ id: templateId, storage_bucket: storageBucket, storage_path: storagePath, file_name: fileName }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
      storageMock: {
        downloadResult: async (bucketId: string, path: string) => {
          assertEquals(bucketId, storageBucket);
          assertEquals(path, fullPath);
          return { data: null, error: downloadError };
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

    const assembleFn = () =>
      assemblePlannerPrompt({
        dbClient: client,
        fileManager: createMockFileManagerService(),
        job: job,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

    // Act + Assert
    await assertRejects(
      assembleFn,
      Error,
      "Failed to download template from storage",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should include context_for_documents in PLAN prompts when recipe step has context_for_documents", async () => {
    /**
     * Contract: assemblePlannerPrompt forwards the recipe step's
     *   context_for_documents array (with multiple entries and structured
     *   content_to_include) unchanged to the render context's
     *   context_for_documents.documents property, alongside _instructions.
     * Arrange: a recipe step with two context_for_documents entries
     *   (business_case and feature_spec) carrying non-empty content_to_include;
     *   a mock DB returning a prompt row and model row.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  render's context argument (args[2]) has a
     *   context_for_documents property with _instructions and documents
     *   equal to the input array.
     */
    // Arrange
    const contextForDocuments: ContextForDocument[] = [
      {
        document_key: FileType.business_case,
        content_to_include: {
          field1: "",
          field2: [],
        },
      },
      {
        document_key: FileType.feature_spec,
        content_to_include: {
          features: [{ name: "", stories: [] }],
        },
      },
    ];

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({
        prompt_template_id: "spt-123",
        outputs_required: { context_for_documents: contextForDocuments },
      }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    const contextArg = renderCallArgs[2];

    assert(isRecord(contextArg), "Context argument must be a record");
    assert('context_for_documents' in contextArg, "Context passed to render must include context_for_documents");
    const contextForDocsValue = contextArg['context_for_documents'];
    assert(isRecord(contextForDocsValue), "context_for_documents must be an object with _instructions and documents");
    assert('documents' in contextForDocsValue, "context_for_documents must have documents property");
    assert('_instructions' in contextForDocsValue, "context_for_documents must have _instructions property");
    assertEquals(contextForDocsValue.documents, contextForDocuments);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should include instructions telling agent to fill in content_to_include objects with alignment values", async () => {
    /**
     * Contract: assemblePlannerPrompt includes an _instructions string in
     *   the context_for_documents object passed to render, telling the agent
     *   to fill in content_to_include objects with alignment values.
     * Arrange: a recipe step with one context_for_documents entry carrying
     *   non-empty content_to_include (field1/field2); a mock DB returning a
     *   prompt row and model row.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  render's context argument (args[2]) has a
     *   context_for_documents._instructions string mentioning "fill in",
     *   "alignment", or "header_context"; documents equals the input array.
     */
    // Arrange
    const contextForDocuments: ContextForDocument[] = [
      {
        document_key: FileType.business_case,
        content_to_include: {
          field1: "",
          field2: [],
        },
      },
    ];

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({
        prompt_template_id: "spt-123",
        outputs_required: { context_for_documents: contextForDocuments },
      }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    const contextArg = renderCallArgs[2];

    assert(isRecord(contextArg), "Context argument must be a record");
    assert('context_for_documents' in contextArg, "Context passed to render must include context_for_documents");
    const contextForDocsValue = contextArg['context_for_documents'];
    assert(isRecord(contextForDocsValue), "context_for_documents must be an object with _instructions and documents");
    assert('_instructions' in contextForDocsValue, "context_for_documents must have _instructions property");
    const instructionsValue = contextForDocsValue['_instructions'];
    assert(typeof instructionsValue === 'string', "_instructions must be a string");
    assert(
      instructionsValue.includes('fill in') ||
      instructionsValue.includes('alignment') ||
      instructionsValue.includes('header_context'),
      "Context passed to render must include instructions telling agent to fill in content_to_include objects with alignment values"
    );
    assert('documents' in contextForDocsValue, "context_for_documents must have documents property");
    assertEquals(contextForDocsValue.documents, contextForDocuments);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw an error when recipe_step.outputs_required is missing context_for_documents for PLAN jobs", async () => {
    /**
     * Contract: when the recipe step's outputs_required is a record but
     *   lacks context_for_documents, assemblePlannerPrompt throws a
     *   PRECONDITION_FAILED error.
     * Arrange: a recipe step with prompt_template_id (to pass prior
     *   preconditions) and outputs_required set to an empty object;
     *   a mock DB returning a prompt row and model row.
     * Act:     assemblePlannerPrompt via assertRejects.
     * Assert:  rejects with Error matching the missing-context_for_documents
     *   message.
     */
    // Arrange
    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({
        prompt_template_id: "spt-123",
        outputs_required: {},
      }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => buildDynamicContextVariables());
    const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

    const assembleFn = () =>
      assemblePlannerPrompt({
        dbClient: client,
        fileManager: createMockFileManagerService(),
        job: job,
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: stage,
        projectInitialUserPrompt: "resolved prompt from storage",
        gatherContext: gatherContextFn,
        render: renderFn,
      });

    // Act + Assert
    await assertRejects(
      assembleFn,
      Error,
      "PRECONDITION_FAILED: PLAN job requires context_for_documents in recipe_step.outputs_required",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should create dot-notation template variables from sourceDocuments with header and documentKey", async () => {
    /**
     * Contract: assemblePlannerPrompt transforms sourceDocuments into
     *   dot-notation template variables keyed by header_snake.document_key
     *   (e.g., "thesis_documents.business_case") and passes them to render.
     * Arrange: a gatherContext spy returning a DynamicContextVariables with
     *   a sourceDocuments array containing one document with header
     *   "Thesis Documents" and documentKey business_case; a mock DB returning
     *   a prompt row and model row.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  render's context argument (args[2]) includes the key
     *   "thesis_documents.business_case" as a string containing the document
     *   content.
     */
    // Arrange
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      buildAssemblerSourceDocument({
        id: "doc-biz-case",
        content: "# Business Case\n\nThis proposal addresses market need X.",
        metadata: {
          displayName: "Thesis Business Case",
          header: "Thesis Documents",
          documentKey: FileType.business_case,
        },
      }),
    ];

    const mockContextWithDocs = buildDynamicContextVariables({
      sourceDocuments: mockSourceDocuments,
    });

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => mockContextWithDocs);
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    const contextArg = renderCallArgs[2];

    assert(isRecord(contextArg), "Context argument must be a record");
    assert(
      'thesis_documents.business_case' in contextArg,
      "Context must include dot-notation key 'thesis_documents.business_case'",
    );
    const bizCaseValue = contextArg['thesis_documents.business_case'];
    assert(typeof bizCaseValue === 'string', "Dot-notation variable must be a string");
    assert(
      bizCaseValue.includes("market need X"),
      "Dot-notation variable must contain the document content",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should create multiple dot-notation variables for different documentKeys under same header", async () => {
    /**
     * Contract: assemblePlannerPrompt creates separate dot-notation variables
     *   for each documentKey under the same header (e.g.,
     *   thesis_documents.business_case, thesis_documents.feature_spec, etc.).
     * Arrange: a gatherContext spy returning a DynamicContextVariables with
     *   four sourceDocuments all under header "Thesis Documents" but with
     *   different documentKeys; a mock DB returning a prompt row and model row.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  render's context argument includes all four dot-notation keys
     *   with their respective content values.
     */
    // Arrange
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      buildAssemblerSourceDocument({
        id: "doc-1",
        content: "Business case content",
        metadata: { displayName: "Thesis Business Case", documentKey: FileType.business_case },
      }),
      buildAssemblerSourceDocument({
        id: "doc-2",
        content: "Feature spec content",
        metadata: { displayName: "Thesis Feature Spec", modelName: "gemini-1.5-pro", documentKey: FileType.feature_spec },
      }),
      buildAssemblerSourceDocument({
        id: "doc-3",
        content: "Technical approach content",
        metadata: { displayName: "Thesis Technical Approach", documentKey: FileType.technical_approach },
      }),
      buildAssemblerSourceDocument({
        id: "doc-4",
        content: "Success metrics content",
        metadata: { displayName: "Thesis Success Metrics", modelName: "gemini-1.5-pro", documentKey: FileType.success_metrics },
      }),
    ];

    const mockContextWithDocs = buildDynamicContextVariables({
      sourceDocuments: mockSourceDocuments,
    });

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => mockContextWithDocs);
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    const contextArg = renderCallArgs[2];

    assert(isRecord(contextArg), "Context argument must be a record");

    assert(
      'thesis_documents.business_case' in contextArg,
      "Context must include 'thesis_documents.business_case'",
    );
    assert(
      'thesis_documents.feature_spec' in contextArg,
      "Context must include 'thesis_documents.feature_spec'",
    );
    assert(
      'thesis_documents.technical_approach' in contextArg,
      "Context must include 'thesis_documents.technical_approach'",
    );
    assert(
      'thesis_documents.success_metrics' in contextArg,
      "Context must include 'thesis_documents.success_metrics'",
    );

    assertEquals(contextArg['thesis_documents.business_case'], "Business case content");
    assertEquals(contextArg['thesis_documents.feature_spec'], "Feature spec content");
    assertEquals(contextArg['thesis_documents.technical_approach'], "Technical approach content");
    assertEquals(contextArg['thesis_documents.success_metrics'], "Success metrics content");

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should create section-level truthy variable when sourceDocuments exist with that header", async () => {
    /**
     * Contract: assemblePlannerPrompt creates a section-level truthy variable
     *   (header_snake, e.g., "thesis_feedback") when sourceDocuments exist
     *   with that header, enabling conditional template sections.
     * Arrange: a gatherContext spy returning a DynamicContextVariables with
     *   one sourceDocument with header "Thesis Feedback" and documentKey
     *   business_case; a mock DB returning a prompt row and model row.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  render's context argument includes "thesis_feedback" as a
     *   truthy value.
     */
    // Arrange
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      buildAssemblerSourceDocument({
        id: "feedback-1",
        type: "feedback",
        content: "Feedback on the business case",
        metadata: {
          displayName: "Thesis Feedback",
          header: "Thesis Feedback",
          documentKey: FileType.business_case,
        },
      }),
    ];

    const mockContextWithDocs = buildDynamicContextVariables({
      sourceDocuments: mockSourceDocuments,
    });

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => mockContextWithDocs);
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    const contextArg = renderCallArgs[2];

    assert(isRecord(contextArg), "Context argument must be a record");
    assert(
      'thesis_feedback' in contextArg,
      "Context must include section-level truthy variable 'thesis_feedback'",
    );
    const truthyValue = contextArg['thesis_feedback'];
    assert(
      truthyValue !== null && truthyValue !== undefined && truthyValue !== '',
      "Section-level variable must be truthy to enable conditional sections",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should throw error when documentKey is undefined", async () => {
    /**
     * Contract: when a sourceDocument has a header but no documentKey,
     *   assemblePlannerPrompt throws an error mentioning
     *   "missing required metadata.documentKey".
     * Arrange: a gatherContext spy returning a DynamicContextVariables with
     *   one sourceDocument with header "Thesis Documents" but documentKey
     *   undefined; a mock DB returning a prompt row and model row.
     * Act:     assemblePlannerPrompt via assertRejects.
     * Assert:  rejects with Error matching the missing-documentKey message.
     */
    // Arrange
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      buildAssemblerSourceDocument({
        id: "doc-no-key",
        content: "Content without a specific document key",
        metadata: {
          displayName: "Generic Document",
          documentKey: undefined,
        },
      }),
    ];

    const mockContextWithDocs = buildDynamicContextVariables({
      sourceDocuments: mockSourceDocuments,
    });

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => mockContextWithDocs);
    const renderFn: Spy<RenderFn> = spy(() => "irrelevant");

    // Act + Assert
    await assertRejects(
      () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager: createMockFileManagerService(),
          job: job,
          project: buildProjectContext(),
          session: buildSessionContext(),
          stage: stage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        }),
      Error,
      "missing required metadata.documentKey",
      "assemblePlannerPrompt must throw error when sourceDocument has header but no documentKey",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("should not create dot-notation keys when sourceDocuments is empty", async () => {
    /**
     * Contract: when sourceDocuments is an empty array, assemblePlannerPrompt
     *   creates no dot-notation keys and strips the raw sourceDocuments array
     *   from the render context.
     * Arrange: a gatherContext spy returning a DynamicContextVariables with
     *   sourceDocuments set to an empty array; a mock DB returning a prompt
     *   row and model row.
     * Act:     assemblePlannerPrompt with the assembled deps.
     * Assert:  render's context argument has no dot-notation keys and no
     *   raw sourceDocuments array.
     */
    // Arrange
    const mockContextNoDocs = buildDynamicContextVariables({
      sourceDocuments: [],
    });

    const stage = buildStageContext({
      recipe_step: buildDialecticRecipeTemplateStep({ prompt_template_id: "spt-123" }),
    });

    const job = buildDialecticJobRow({
      payload: {
        model_id: "model-claude-3-opus",
        model_slug: "claude-3-opus",
      },
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "planner prompt text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();
    const gatherContextFn: Spy<GatherContextFn> = spy(async () => mockContextNoDocs);
    const renderFn: Spy<RenderFn> = spy(() => "rendered planner prompt");

    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

    // Act
    await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: job,
      project: buildProjectContext(),
      session: buildSessionContext(),
      stage: stage,
      projectInitialUserPrompt: "resolved prompt from storage",
      gatherContext: gatherContextFn,
      render: renderFn,
    });

    // Assert
    assertSpyCalls(renderFn, 1);
    const renderCallArgs = renderFn.calls[0].args;
    const contextArg = renderCallArgs[2];

    assert(isRecord(contextArg), "Context argument must be a record");

    // When sourceDocuments is empty, no dot-notation keys should be created
    const keys = Object.keys(contextArg);
    const dotNotationKeys = keys.filter(key => key.includes('.'));
    assertEquals(
      dotNotationKeys.length,
      0,
      "No dot-notation keys should exist when sourceDocuments is empty",
    );

    // Raw sourceDocuments array should not be passed to render
    assert(
      !('sourceDocuments' in contextArg) || !Array.isArray(contextArg['sourceDocuments']),
      "Raw sourceDocuments array should not be passed to render",
    );

    mockSupabaseSetup.clearAllStubs?.();
  });
});
