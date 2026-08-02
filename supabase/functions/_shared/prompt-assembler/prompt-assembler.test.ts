import { assert, assertThrows, assertEquals } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import { PromptAssembler } from "./prompt-assembler.ts";
import { createMockSupabaseClient } from "../supabase.mock.ts";
import type { MockSupabaseDataConfig } from "../supabase.mock.ts";
import { mockDownloadFromStorageTwoArg } from "../supabase_storage_utils.mock.ts";
import { MockFileManagerService } from "../services/file_manager.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  AssembledPrompt,
  AssembleSeedPromptFn,
  AssemblePlannerPromptDeps,
  AssembleTurnPromptDeps,
  AssembleTurnPromptParams,
  AssembleContinuationPromptDeps,
} from "./prompt-assembler.interface.ts";
import type { GatherContextFn } from "./gatherContext/gatherContext.ts";
import type { GatherInputsForStageFn } from "./gatherInputsForStage/gatherInputsForStage.ts";
import type { AssembleCompressionPromptFn } from "./assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import { gatherContinuationInputs } from "./gatherContinuationInputs/gatherContinuationInputs.ts";
import { mockGatherContinuationInputs } from "./gatherContinuationInputs/gatherContinuationInputs.mock.ts";
import {
  TEST_STORAGE_BUCKET,
  withEnv,
  buildProjectContext,
  buildSessionContext,
  buildStageContext,
  buildDynamicContextVariables,
  buildAssembledPrompt,
  buildAssemblePromptOptions,
  buildAssembleSeedPromptDeps,
  buildAssemblePlannerPromptDeps,
  buildAssembleTurnPromptDeps,
  buildAssembleTurnPromptParams,
  buildAssembleContinuationPromptDeps,
} from "./prompt-assembler.mock.ts";
import {
  buildAssembleCompressionPromptDeps,
  buildAssembleCompressionPromptParams,
  buildAssembleCompressionPromptPayload,
  buildAssembleCompressionPromptSuccessReturn,
} from "./assembleCompressionPrompt/assembleCompressionPrompt.mock.ts";
import {
  buildDialecticJobRow,
  buildDialecticRecipeTemplateStep,
} from "../dialectic.mock.ts";

Deno.test("PromptAssembler", async (t) => {
  await t.step(
    "constructor should throw an error if SB_CONTENT_STORAGE_BUCKET is not set",
    () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      withEnv({ SB_CONTENT_STORAGE_BUCKET: undefined }, () => {
        assertThrows(
          () => new PromptAssembler(client, fm),
          Error,
          "SB_CONTENT_STORAGE_BUCKET",
        );
      });
    },
  );

  await t.step("assembleSeedPrompt should call the injected function", async () => {
    const client = createMockSupabaseClient().client as unknown as SupabaseClient<
      Database
    >;
    const fm = new MockFileManagerService();
    const seedFn: AssembleSeedPromptFn = async () => buildAssembledPrompt();
    const seedSpy = spy(seedFn);
    const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
      new PromptAssembler(
        client, fm,
        undefined, undefined, seedSpy,
      ),
    );
    const deps = buildAssembleSeedPromptDeps();
    const result = await assembler.assembleSeedPrompt(deps);
    assertSpyCalls(seedSpy, 1);
    assertEquals(result, buildAssembledPrompt());
  });

  await t.step("assemblePlannerPrompt should call the injected function", async () => {
    const client = createMockSupabaseClient().client as unknown as SupabaseClient<
      Database
    >;
    const fm = new MockFileManagerService();
    const plannerFn = async (_deps: AssemblePlannerPromptDeps): Promise<AssembledPrompt> => buildAssembledPrompt();
    const plannerSpy = spy(plannerFn);
    const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
      new PromptAssembler(
        client, fm,
        undefined, undefined, undefined, plannerSpy,
      ),
    );
    const deps = buildAssemblePlannerPromptDeps();
    const result = await assembler.assemblePlannerPrompt(deps);
    assertSpyCalls(plannerSpy, 1);
    assertEquals(result, buildAssembledPrompt());
  });

  await t.step("assembleTurnPrompt should call the injected function", async () => {
    const client = createMockSupabaseClient().client as unknown as SupabaseClient<
      Database
    >;
    const fm = new MockFileManagerService();
    const turnFn = async (
      _deps: AssembleTurnPromptDeps,
      _params: AssembleTurnPromptParams,
    ): Promise<AssembledPrompt> => buildAssembledPrompt();
    const turnSpy = spy(turnFn);
    const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
      new PromptAssembler(
        client, fm,
        undefined, undefined, undefined, undefined, turnSpy,
      ),
    );
    const deps = buildAssembleTurnPromptDeps();
    const params = buildAssembleTurnPromptParams();
    const result = await assembler.assembleTurnPrompt(deps, params);
    assertSpyCalls(turnSpy, 1);
    assertEquals(result, buildAssembledPrompt());
  });

  await t.step(
    "assembleContinuationPrompt should call the injected function",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, continuationSpy,
        ),
      );
      const deps = buildAssembleContinuationPromptDeps();
      const result = await assembler.assembleContinuationPrompt(deps);
      assertSpyCalls(continuationSpy, 1);
      assertEquals(result, buildAssembledPrompt());
    },
  );

  await t.step("assembleCompressionPrompt should call the injected function", async () => {
    const client = createMockSupabaseClient().client as unknown as SupabaseClient<
      Database
    >;
    const fm = new MockFileManagerService();
    const compressionFn: AssembleCompressionPromptFn = async () =>
      buildAssembleCompressionPromptSuccessReturn();
    const compressionSpy = spy(compressionFn);
    const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
      new PromptAssembler(
        client, fm,
        undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, compressionSpy,
      ),
    );
    const deps = buildAssembleCompressionPromptDeps();
    const params = buildAssembleCompressionPromptParams();
    const payload = buildAssembleCompressionPromptPayload();
    const result = await assembler.assembleCompressionPrompt(deps, params, payload);
    assertSpyCalls(compressionSpy, 1);
    assertEquals(result, buildAssembleCompressionPromptSuccessReturn());
  });

  await t.step("assembleCompressionPrompt should default to the real function", async () => {
    const errorConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: null, error: new Error("DB error") },
        },
      },
    };
    const errorClient = createMockSupabaseClient(undefined, errorConfig).client as unknown as SupabaseClient<Database>;
    const fm = new MockFileManagerService();
    const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
      new PromptAssembler(errorClient, fm),
    );
    const deps = buildAssembleCompressionPromptDeps({ dbClient: errorClient });
    const params = buildAssembleCompressionPromptParams();
    const payload = buildAssembleCompressionPromptPayload();
    const result = await assembler.assembleCompressionPrompt(deps, params, payload);
    assert("error" in result);
  });

  await t.step(
    "assemble router should delegate to assembleSeedPrompt",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const seedFn: AssembleSeedPromptFn = async () => buildAssembledPrompt();
      const seedSpy = spy(seedFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, seedSpy,
        ),
      );
      const options = buildAssemblePromptOptions();
      const result = await assembler.assemble(options);
      assertSpyCalls(seedSpy, 1);
      assertEquals(result, buildAssembledPrompt());
    },
  );

  await t.step(
    "assemble router should delegate to assemblePlannerPrompt",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const plannerFn = async (_deps: AssemblePlannerPromptDeps): Promise<AssembledPrompt> => buildAssembledPrompt();
      const plannerSpy = spy(plannerFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, plannerSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ target_contribution_id: null }),
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ job_type: "PLAN" }),
        }),
      });
      const result = await assembler.assemble(options);
      assertSpyCalls(plannerSpy, 1);
      assertEquals(result, buildAssembledPrompt());
    },
  );

  await t.step(
    "assemble router should delegate to assemblePlannerPrompt when recipe step is PLAN even if payload is EXECUTE",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const plannerFn = async (_deps: AssemblePlannerPromptDeps): Promise<AssembledPrompt> => buildAssembledPrompt();
      const plannerSpy = spy(plannerFn);
      const turnFn = async (
        _deps: AssembleTurnPromptDeps,
        _params: AssembleTurnPromptParams,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const turnSpy = spy(turnFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, plannerSpy, turnSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ job_type: "EXECUTE", target_contribution_id: null }),
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ job_type: "PLAN" }),
        }),
      });
      await assembler.assemble(options);
      assertSpyCalls(plannerSpy, 1);
      assertSpyCalls(turnSpy, 0);
    },
  );

  await t.step(
    "assemble router should delegate to assembleContinuationPrompt",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, continuationSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ target_contribution_id: "contrib-123" }),
      });
      const result = await assembler.assemble(options);
      assertSpyCalls(continuationSpy, 1);
      assertEquals(result, buildAssembledPrompt());
    },
  );

  await t.step(
    "assemble router passes gatherContinuationInputs and downloadFromStorage in deps when dispatching to continuation path",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const gciSpy = spy(mockGatherContinuationInputs);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          mockDownloadFromStorageTwoArg,
          undefined, undefined, undefined, undefined, continuationSpy,
          undefined, undefined, undefined, gciSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ target_contribution_id: "contrib-123" }),
      });
      await assembler.assemble(options);
      const continuationDeps = continuationSpy.calls[0].args[0];
      assertEquals(continuationDeps.gatherContinuationInputs, gciSpy);
      assertEquals(continuationDeps.downloadFromStorage, mockDownloadFromStorageTwoArg);
    },
  );

  await t.step(
    "assemble router should delegate to assembleContinuationPrompt when target_contribution_id is set, regardless of job type",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const plannerFn = async (_deps: AssemblePlannerPromptDeps): Promise<AssembledPrompt> => buildAssembledPrompt();
      const plannerSpy = spy(plannerFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, plannerSpy, undefined, continuationSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ job_type: "PLAN", target_contribution_id: "contrib-456" }),
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ job_type: "PLAN" }),
        }),
      });
      await assembler.assemble(options);
      assertSpyCalls(continuationSpy, 1);
      assertSpyCalls(plannerSpy, 0);
    },
  );

  await t.step(
    "assemble router should NOT delegate to assembleContinuationPrompt when target_contribution_id is null",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const plannerFn = async (_deps: AssemblePlannerPromptDeps): Promise<AssembledPrompt> => buildAssembledPrompt();
      const plannerSpy = spy(plannerFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, plannerSpy, undefined, continuationSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ job_type: "PLAN", target_contribution_id: null }),
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ job_type: "PLAN" }),
        }),
      });
      await assembler.assemble(options);
      assertSpyCalls(plannerSpy, 1);
      assertSpyCalls(continuationSpy, 0);
    },
  );

  await t.step("assemble should pass sourceContributionId through to upload context", async () => {
    const client = createMockSupabaseClient().client as unknown as SupabaseClient<
      Database
    >;
    const fm = new MockFileManagerService();
    const seedFn: AssembleSeedPromptFn = async () => buildAssembledPrompt();
    const seedSpy = spy(seedFn);
    const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
      new PromptAssembler(
        client, fm,
        undefined, undefined, seedSpy,
      ),
    );
    const options = buildAssemblePromptOptions({
      sourceContributionId: "src-contrib-123",
    });
    await assembler.assemble(options);
    assertEquals(seedSpy.calls[0].args[0].sourceContributionId, "src-contrib-123");
  });

  await t.step(
    "should pass projectInitialUserPrompt from options to assemblePlannerPrompt",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const plannerFn = async (_deps: AssemblePlannerPromptDeps): Promise<AssembledPrompt> => buildAssembledPrompt();
      const plannerSpy = spy(plannerFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, plannerSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        projectInitialUserPrompt: "Custom initial prompt",
        job: buildDialecticJobRow({ target_contribution_id: null }),
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ job_type: "PLAN" }),
        }),
      });
      await assembler.assemble(options);
      assertEquals(
        plannerSpy.calls[0].args[0].projectInitialUserPrompt,
        "Custom initial prompt",
      );
    },
  );

  await t.step(
    "default gatherInputsForStageFn wrapper forwards modelId when provided",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const seedFn: AssembleSeedPromptFn = async () => buildAssembledPrompt();
      const seedSpy = spy(seedFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, seedSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ inputs_required: [] }),
        }),
      });
      await assembler.assemble(options);
      const seedDeps = seedSpy.calls[0].args[0];
      const result = await seedDeps.gatherInputsForStageFn(
        client,
        mockDownloadFromStorageTwoArg,
        options.stage,
        options.project,
        options.session,
        options.iterationNumber,
        "model-1",
      );
      assertEquals(result.sourceDocuments, []);
      assertEquals(result.recipeStep, options.stage.recipe_step);
    },
  );

  await t.step(
    "_gatherContext forwards modelId to gatherContextFn",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const gatherContextFn: GatherContextFn = async () =>
        buildDynamicContextVariables();
      const gatherContextSpy = spy(gatherContextFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, undefined,
          gatherContextSpy,
        ),
      );
      const project = buildProjectContext();
      const session = buildSessionContext();
      const stage = buildStageContext();
      await assembler["_gatherContext"](
        project,
        session,
        stage,
        "Initial prompt",
        1,
        "model-1",
      );
      assertSpyCalls(gatherContextSpy, 1);
      assertEquals(gatherContextSpy.calls[0].args[8], "model-1");
    },
  );

  await t.step(
    "_gatherInputsForStage forwards modelId to gatherInputsForStageFn",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const gatherInputsFn: GatherInputsForStageFn = async (_db, _dl, stage) => ({
        sourceDocuments: [],
        recipeStep: stage.recipe_step,
      });
      const gatherInputsSpy = spy(gatherInputsFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, undefined,
          undefined, undefined, gatherInputsSpy,
        ),
      );
      const stage = buildStageContext();
      const project = buildProjectContext();
      const session = buildSessionContext();
      await assembler["_gatherInputsForStage"](
        stage,
        project,
        session,
        1,
        "model-1",
      );
      assertSpyCalls(gatherInputsSpy, 1);
      assertEquals(gatherInputsSpy.calls[0].args[6], "model-1");
    },
  );

  await t.step(
    "all three methods work unchanged when modelId is omitted (backward-compatible)",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const gatherContextFn: GatherContextFn = async () =>
        buildDynamicContextVariables();
      const gatherContextSpy = spy(gatherContextFn);
      const gatherInputsFn: GatherInputsForStageFn = async (_db, _dl, stage) => ({
        sourceDocuments: [],
        recipeStep: stage.recipe_step,
      });
      const gatherInputsSpy = spy(gatherInputsFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, undefined,
          gatherContextSpy, undefined, gatherInputsSpy,
        ),
      );
      const project = buildProjectContext();
      const session = buildSessionContext();
      const stage = buildStageContext();

      await assembler["_gatherContext"](
        project,
        session,
        stage,
        "Initial prompt",
        1,
      );
      assertSpyCalls(gatherContextSpy, 1);
      assertEquals(gatherContextSpy.calls[0].args[8], undefined);

      await assembler["_gatherInputsForStage"](stage, project, session, 1);
      assertSpyCalls(gatherInputsSpy, 1);
      assertEquals(gatherInputsSpy.calls[0].args[6], undefined);

      const seedFn: AssembleSeedPromptFn = async () => buildAssembledPrompt();
      const seedSpy = spy(seedFn);
      const defaultAssembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, seedSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        stage: buildStageContext({
          recipe_step: buildDialecticRecipeTemplateStep({ inputs_required: [] }),
        }),
      });
      await defaultAssembler.assemble(options);
      const seedDeps = seedSpy.calls[0].args[0];
      const result = await seedDeps.gatherInputsForStageFn(
        client,
        mockDownloadFromStorageTwoArg,
        options.stage,
        options.project,
        options.session,
        options.iterationNumber,
      );
      assertEquals(result.sourceDocuments, []);
    },
  );

  await t.step(
    "assembleContinuationPrompt deps.gatherContinuationInputs is the GatherContinuationInputsSignature passed to the constructor",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const gciSpy = spy(mockGatherContinuationInputs);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, continuationSpy,
          undefined, undefined, undefined, gciSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ target_contribution_id: "contrib-123" }),
      });
      await assembler.assemble(options);
      assertEquals(
        continuationSpy.calls[0].args[0].gatherContinuationInputs,
        gciSpy,
      );
    },
  );

  await t.step(
    "when no GatherContinuationInputsSignature is injected, deps.gatherContinuationInputs is the gatherContinuationInputs export",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const continuationFn = async (
        _deps: AssembleContinuationPromptDeps,
      ): Promise<AssembledPrompt> => buildAssembledPrompt();
      const continuationSpy = spy(continuationFn);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, undefined, undefined, undefined, continuationSpy,
        ),
      );
      const options = buildAssemblePromptOptions({
        job: buildDialecticJobRow({ target_contribution_id: "contrib-123" }),
      });
      await assembler.assemble(options);
      assertEquals(
        continuationSpy.calls[0].args[0].gatherContinuationInputs,
        gatherContinuationInputs,
      );
    },
  );

  await t.step(
    "non-continuation paths do not invoke the injected GatherContinuationInputsSignature",
    async () => {
      const client = createMockSupabaseClient().client as unknown as SupabaseClient<
        Database
      >;
      const fm = new MockFileManagerService();
      const seedFn: AssembleSeedPromptFn = async () => buildAssembledPrompt();
      const seedSpy = spy(seedFn);
      const gciSpy = spy(mockGatherContinuationInputs);
      const assembler = withEnv({ SB_CONTENT_STORAGE_BUCKET: TEST_STORAGE_BUCKET }, () =>
        new PromptAssembler(
          client, fm,
          undefined, undefined, seedSpy,
          undefined, undefined, undefined,
          undefined, undefined, undefined, gciSpy,
        ),
      );
      const options = buildAssemblePromptOptions();
      await assembler.assemble(options);
      assertSpyCalls(seedSpy, 1);
      assertSpyCalls(gciSpy, 0);
    },
  );
});
