import { assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { render } from "./render.ts";
import {
  DynamicContextVariables,
  RenderPromptFunctionType,
  StageContext,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import type { Json } from "../../types_db.ts";
import { DialecticRecipeStep } from "../../dialectic-service/dialectic.interface.ts";

// Define a type for the mock implementation of renderPrompt
type RenderPromptMock = (
  _basePromptText: string,
  _dynamicContextVariables: DynamicContextVariables,
  _systemDefaultOverlayValues?: Json,
  _userProjectOverlayValues?: Json,
) => string;

Deno.test("render", async (t) => {
  const stageSystemPromptText =
    "System prompt for {user_objective} in {domain}.";
  const stageOverlayValues: Json = { "style": "formal" };
  const mockSimpleRecipeStep: DialecticRecipeStep = {
    id: 'step-123',
    instance_id: 'instance-123',
    job_type: 'EXECUTE',
    step_key: 'simple-step',
    step_slug: 'simple-step-slug',
    step_name: 'Simple Step',
    step_number: 1,
    prompt_type: 'Turn',
    granularity_strategy: 'per_source_document',
    output_type: 'thesis',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: [],
    config_override: {},
    object_filter: {},
    output_overrides: {},
    is_skipped: false,
    parallel_group: null,
    prompt_template_id: null,
    template_step_id: null,
    branch_key: null,
    execution_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

  const defaultContext: DynamicContextVariables = {
    user_objective: "Test Project Objective",
    domain: "Software Development Domain",
    agent_count: 2,
    context_description: "This is the initial user prompt content.",
    original_user_request: null,
    prior_stage_ai_outputs: "",
    prior_stage_user_feedback: "",
    deployment_context: null,
    reference_documents: null,
    constraint_boundaries: null,
    stakeholder_considerations: null,
    deliverable_format: "Standard markdown format.",
  };

  await t.step(
    "should throw an error if stage is missing system prompt",
    async () => {
      const stageWithMissingPrompt: StageContext = {
        ...defaultStage,
        system_prompts: null,
      };
      const renderPromptFn = () => "should not be called";

      await assertRejects(
        async () => {
          render(renderPromptFn, stageWithMissingPrompt, defaultContext, null);
        },
        Error,
        `RENDER_PRECONDITION_FAILED: missing system prompt text for stage ${stageWithMissingPrompt.slug}`,
      );
    },
  );

  await t.step(
    "should throw an error if rendering the prompt fails",
    async () => {
      const renderPromptMockFn_ThrowsError = () => {
        throw new Error("Simulated prompt rendering failure.");
      };

      await assertRejects(
        async () => {
          render(
            renderPromptMockFn_ThrowsError,
            defaultStage,
            defaultContext,
            null,
          );
        },
        Error,
        "Failed to render prompt",
      );
    },
  );

  await t.step("should correctly call the renderPromptFn", () => {
    const expectedRenderedPrompt = "Mocked Rendered Prompt Output";
    let renderPromptCallCount = 0;
    let lastRenderPromptArgs: [
      string,
      DynamicContextVariables,
      Json | undefined,
      Json | undefined,
    ] | null = null;

    const renderPromptMockFn = (
      base: string,
      vars: DynamicContextVariables,
      sysOverlays?: Json,
      userOverlays?: Json,
    ) => {
      renderPromptCallCount++;
      lastRenderPromptArgs = [base, vars, sysOverlays, userOverlays];
      return expectedRenderedPrompt;
    };

    const result = render(
      renderPromptMockFn,
      defaultStage,
      defaultContext,
      null,
    );

    assertEquals(result, expectedRenderedPrompt);
    assertEquals(renderPromptCallCount, 1);

    const renderArgs = lastRenderPromptArgs;
    assertEquals(renderArgs?.[0], stageSystemPromptText);
    assertEquals(renderArgs?.[1], defaultContext);
    assertEquals(renderArgs?.[2], stageOverlayValues);
    assertEquals(renderArgs?.[3], null);
  });

  await t.step(
    "enforces required style guide and artifacts when template includes those sections",
    () => {
      const basePrompt = [
        "SYSTEM INSTRUCTIONS",
        "{{#section:style_guide_markdown}}",
        "Style Guide:\n{style_guide_markdown}",
        "{{/section:style_guide_markdown}}",
        "",
        "EXPECTED JSON OUTPUT",
        "{{#section:outputs_required_json}}",
        "Artifacts:\n{outputs_required_json}",
        "{{/section:outputs_required_json}}",
      ].join("\n");

      const stageMissingValues: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: { role: "architect" },
        }],
      };

      let rendererCalled = false;
      const renderPromptMockFn: RenderPromptMock = () => {
        rendererCalled = true;
        return "ok";
      };

      let threw = false;
      try {
        render(renderPromptMockFn, stageMissingValues, defaultContext, null);
      } catch (_e) {
        threw = true;
      }

      assertEquals(threw, true);
      assertEquals(rendererCalled, false);
    },
  );

  await t.step(
    "fails with precondition error when style guide section is present but overlay value is missing",
    () => {
      const basePrompt = [
        "{{#section:style_guide_markdown}}",
        "Style Guide:\n{style_guide_markdown}",
        "{{/section:style_guide_markdown}}",
      ].join("\n");

      const stageMissingStyle: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: { role: "architect" },
        }],
      };

      let rendererCalled = false;
      const renderPromptMockFn: RenderPromptMock = () => {
        rendererCalled = true;
        return "ok";
      };

      let threw = false;
      try {
        render(renderPromptMockFn, stageMissingStyle, defaultContext, null);
      } catch (e) {
        threw = true;
        if (e instanceof Error) {
          assertEquals(e.message.includes("RENDER_PRECONDITION_FAILED"), true);
        }
      }

      assertEquals(threw, true);
      assertEquals(rendererCalled, false);
    },
  );

  await t.step(
    "proceeds and provides both style guide and artifacts when present",
    () => {
      const basePrompt = [
        "{{#section:style_guide_markdown}}",
        "Style Guide:\n{style_guide_markdown}",
        "{{/section:style_guide_markdown}}",
        "",
        "Artifacts:\n{{outputs_required}}",
      ].join("\n");

      const artifacts = [{ type: "document", document_key: "test_doc" }];
      const stageOk: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: {
            role: "architect",
            style_guide_markdown: "# Guide",
          },
        }],
      };

      let rendererCalled = false;
      let capturedOverlay: Json | undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        rendererCalled = true;
        capturedOverlay = sysOverlays;

        if (!isRecord(sysOverlays)) {
          throw new Error("system overlays must be a record");
        }
        if (typeof sysOverlays["outputs_required_json"] === 'string') {
          throw new Error("Test failed: Incorrectly received stringified JSON property.")
        }
        if (sysOverlays["outputs_required"] !== artifacts) {
          throw new Error("Test failed: Did not receive raw outputs_required object.")
        }

        return "ok";
      };

      const contextWithRecipeStep: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: artifacts },
      };

      const result = render(renderPromptMockFn, stageOk, contextWithRecipeStep, null);
      assertEquals(result, "ok");
      assertEquals(rendererCalled, true);
      if (capturedOverlay && isRecord(capturedOverlay)) {
        const sg = capturedOverlay["style_guide_markdown"];
        assertEquals(typeof sg === "string" && sg.length > 0, true);
        assertEquals(capturedOverlay["outputs_required"], artifacts);
      } else {
        throw new Error("system overlays missing in renderer call");
      }
    },
  );

  await t.step(
    "fails because it incorrectly provides stringified JSON for a section helper",
    async () => {
      const basePrompt =
        "Artifacts: {{#section:outputs_required_json}}{{outputs_required_json}}{{/section:outputs_required_json}}";
      const artifacts = [{ type: "document", document_key: "test_doc" }];
      const stageOk: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
      };

      const contextWithRecipeStep: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: artifacts },
      };

      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        if (isRecord(sysOverlays)) {
          if (typeof sysOverlays["outputs_required_json"] !== 'string') {
            throw new Error(
              "Test failed: expected stringified JSON property was not found.",
            );
          }
        }
        return "ok";
      };
      
      await assertRejects(
          async () => {
              render(renderPromptMockFn, stageOk, contextWithRecipeStep, null);
          },
          Error,
          "Test failed: expected stringified JSON property was not found.",
      )
    },
  );

  await t.step(
    "succeeds because template requires a raw object and implementation provides it",
    () => {
      const basePrompt = "Artifacts: {{outputs_required}}";
      const artifacts = [{ type: "document", document_key: "test_doc" }];
      const stageOk: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
      };

      const contextWithRecipeStep: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: artifacts },
      };

      let rendererCalled = false;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        rendererCalled = true;
        if (isRecord(sysOverlays)) {
          if (sysOverlays["outputs_required"] !== artifacts) {
            throw new Error(
              "Test failed: did not receive raw outputs_required object.",
            );
          }
        } else {
            throw new Error("Test failed: sysOverlays is not a record.")
        }
        return "ok";
      };

      const result = render(renderPromptMockFn, stageOk, contextWithRecipeStep, null);
      assertEquals(result, "ok");
      assertEquals(rendererCalled, true);
    },
  );

  await t.step(
    "succeeds because implementation provides a raw object, not a string",
    () => {
      const basePrompt = "Artifacts: {{outputs_required}}";
      const artifacts = [{ type: "document", document_key: "test_doc" }];
      const stageOk: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
      };

      const contextWithRecipeStep: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: artifacts },
      };

      let rendererCalled = false;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        rendererCalled = true;
        if (isRecord(sysOverlays)) {
          if (typeof sysOverlays["outputs_required"] === "string") {
            throw new Error(
              "Smart mock failed: outputs_required should be a raw object, not a string.",
            );
          }
        }
        return "ok";
      };

      const result = render(
        renderPromptMockFn,
        stageOk,
        contextWithRecipeStep,
        null,
      );
      assertEquals(result, "ok");
      assertEquals(rendererCalled, true);
    },
  );

  await t.step(
    "does not include outputs_required when context.recipeStep is null or has empty outputs_required",
    () => {
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
        userOverlays,
      ) => {
        const sysVal = isRecord(sysOverlays)
          ? sysOverlays["outputs_required"]
          : undefined;
        const usrVal = isRecord(userOverlays)
          ? userOverlays["outputs_required"]
          : undefined;
        if (sysVal !== undefined || usrVal !== undefined) {
          throw new Error(
            "outputs_required should not be present when context.recipeStep is null or has empty outputs_required",
          );
        }
        return "ok";
      };

      const stageWithoutArtifacts: StageContext = {
        ...defaultStage,
      };

      // Test with no recipeStep in context
      const result1 = render(
        renderPromptMockFn,
        stageWithoutArtifacts,
        defaultContext,
        null,
      );
      assertEquals(result1, "ok");

      // Test with recipeStep but empty outputs_required
      const contextWithEmptyOutputs: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: [] },
      };
      const result2 = render(
        renderPromptMockFn,
        stageWithoutArtifacts,
        contextWithEmptyOutputs,
        null,
      );
      assertEquals(result2, "ok");
    },
  );

  await t.step(
    "includes outputs_required when context.recipeStep.outputs_required is provided",
    () => {
      let capturedSysOverlay: Json | undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        capturedSysOverlay = sysOverlays;
        return "ok";
      };

      const mockOutputsRequired = [{ type: "document", document_key: "test_output" }];
      const mockRecipeStepWithOutputs: DialecticRecipeStep = {
        ...mockSimpleRecipeStep,
        outputs_required: mockOutputsRequired,
      };

      const contextWithRecipeStep: DynamicContextVariables = {
          ...defaultContext,
          recipeStep: mockRecipeStepWithOutputs,
      };

      const result = render(
        renderPromptMockFn,
        defaultStage,
        contextWithRecipeStep,
        null,
      );
      assertEquals(result, "ok");

      if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
        const val = capturedSysOverlay["outputs_required"];
        assertEquals(val, mockOutputsRequired);
      } else {
        throw new Error("System overlays were not provided to renderer");
      }
    },
  );

  await t.step(
    "preserves existing system overlays when injecting artifacts",
    () => {
      let capturedSysOverlay: Json | undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        capturedSysOverlay = sysOverlays;
        return "ok";
      };

      const artifacts = [{ type: "document", document_key: "test_doc" }];
      const stageWithOverlaysAndArtifacts: StageContext = {
        ...defaultStage,
        domain_specific_prompt_overlays: [{
          overlay_values: { role: "tester" },
        }],
      };

      const contextWithRecipeStep: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: artifacts },
      };

      render(
        renderPromptMockFn,
        stageWithOverlaysAndArtifacts,
        contextWithRecipeStep,
        null,
      );

      if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
        // Prove original overlay value is preserved
        assertEquals(capturedSysOverlay["role"], "tester");
        // Prove artifact value is injected
        const artifactsVal = capturedSysOverlay["outputs_required"];
        assertEquals(artifactsVal, artifacts);
      } else {
        throw new Error("System overlays were not provided to renderer");
      }
    },
  );

  await t.step(
    "throws an error for non-JSON-compatible outputs_required",
    async () => {
      const invalidOutputs = {
        a: 1,
        b: () => "invalid", // Functions are not valid in JSON
      };

      const contextWithInvalidArtifacts: DynamicContextVariables = {
        ...defaultContext,
        // @ts-expect-error - Intentionally passing invalid type for testing
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: invalidOutputs },
      };

      const renderPromptFn = () => "should not be called";

      await assertRejects(
        async () => {
          render(
            renderPromptFn,
            defaultStage,
            contextWithInvalidArtifacts,
            null,
          );
        },
        Error,
        "context.recipeStep.outputs_required must be JSON-compatible",
      );
    },
  );

  await t.step(
    "correctly passes userProjectOverlayValues to the renderer",
    () => {
      let capturedUserOverlay: Json | undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        _sysOverlays,
        userOverlays,
      ) => {
        capturedUserOverlay = userOverlays;
        return "ok";
      };

      const userOverlays = { "user-specific": "value" };

      render(
        renderPromptMockFn,
        defaultStage,
        defaultContext,
        userOverlays,
      );

      assertEquals(capturedUserOverlay, userOverlays);
    },
  );

  await t.step(
    "throws an error for empty or whitespace system prompt",
    async () => {
      const renderPromptFn = () => "should not be called";
      const expectedError = `RENDER_PRECONDITION_FAILED: missing system prompt text for stage ${defaultStage.slug}`;

      // Test with empty string
      const stageWithEmptyPrompt: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: "" },
      };
      await assertRejects(
        async () => {
          render(
            renderPromptFn,
            stageWithEmptyPrompt,
            defaultContext,
            null,
          );
        },
        Error,
        expectedError,
      );

      // Test with whitespace string
      const stageWithWhitespacePrompt: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: "   " },
      };
      await assertRejects(
        async () => {
          render(
            renderPromptFn,
            stageWithWhitespacePrompt,
            defaultContext,
            null,
          );
        },
        Error,
        expectedError,
      );
    },
  );

  await t.step(
    "throws an error for empty or whitespace style_guide_markdown",
    async () => {
      const basePrompt = "{{#section:style_guide_markdown}}{style_guide_markdown}{{/section:style_guide_markdown}}";
      const renderPromptFn = () => "should not be called";
      const expectedError = `RENDER_PRECONDITION_FAILED: missing style_guide_markdown for stage ${defaultStage.slug}`;

      // Test with empty string
      const stageWithEmptyStyleGuide: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: { style_guide_markdown: "" },
        }],
      };
      await assertRejects(
        async () => {
          render(
            renderPromptFn,
            stageWithEmptyStyleGuide,
            defaultContext,
            null,
          );
        },
        Error,
        expectedError,
      );

      // Test with whitespace string
      const stageWithWhitespaceStyleGuide: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: { style_guide_markdown: "   " },
        }],
      };
      await assertRejects(
        async () => {
          render(
            renderPromptFn,
            stageWithWhitespaceStyleGuide,
            defaultContext,
            null,
          );
        },
        Error,
        expectedError,
      );
    },
  );

  await t.step(
    "injects artifacts even when no system overlays exist",
    () => {
      let capturedSysOverlay: Json | undefined;
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
      ) => {
        capturedSysOverlay = sysOverlays;
        return "ok";
      };

      const artifacts = [{ type: "document", document_key: "test_doc" }];
      const stageWithNoOverlays: StageContext = {
        ...defaultStage,
        domain_specific_prompt_overlays: [], // No overlays
      };

      const contextWithRecipeStep: DynamicContextVariables = {
        ...defaultContext,
        recipeStep: { ...mockSimpleRecipeStep, outputs_required: artifacts },
      };

      render(
        renderPromptMockFn,
        stageWithNoOverlays,
        contextWithRecipeStep,
        null,
      );

      if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
        const artifactsVal = capturedSysOverlay["outputs_required"];
        assertEquals(artifactsVal, artifacts);
        // Ensure no other keys were added
        assertEquals(Object.keys(capturedSysOverlay).length, 1);
      } else {
        throw new Error("System overlays were not provided to renderer");
      }
    },
  );
});
