import { assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { render } from "./render.ts";
import {
  DynamicContextVariables,
  RenderPromptFunctionType,
  StageContext,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import type { Json } from "../../types_db.ts";

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

  const defaultStage: StageContext = {
    id: "stage-123",
    system_prompts: { prompt_text: stageSystemPromptText },
    domain_specific_prompt_overlays: [{ overlay_values: stageOverlayValues }],
    slug: "initial-hypothesis",
    display_name: "Initial hypothesis",
    description: "Initial hypothesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: null,
    expected_output_artifacts: null,
    input_artifact_rules: null,
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
        "{{#section:expected_output_artifacts_json}}",
        "Artifacts:\n{expected_output_artifacts_json}",
        "{{/section:expected_output_artifacts_json}}",
      ].join("\n");

      const stageMissingValues: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: { role: "architect" },
        }],
        expected_output_artifacts: null,
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
        expected_output_artifacts: null,
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
        "{{#section:expected_output_artifacts_json}}",
        "Artifacts:\n{expected_output_artifacts_json}",
        "{{/section:expected_output_artifacts_json}}",
      ].join("\n");

      const artifacts = { shape: "object", ok: true };
      const stageOk: StageContext = {
        ...defaultStage,
        system_prompts: { prompt_text: basePrompt },
        domain_specific_prompt_overlays: [{
          overlay_values: {
            role: "architect",
            style_guide_markdown: "# Guide",
          },
        }],
        expected_output_artifacts: artifacts,
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
        return "ok";
      };

      const result = render(renderPromptMockFn, stageOk, defaultContext, null);
      assertEquals(result, "ok");
      assertEquals(rendererCalled, true);
      if (capturedOverlay && isRecord(capturedOverlay)) {
        const sg = capturedOverlay["style_guide_markdown"];
        const artifactsVal = capturedOverlay["expected_output_artifacts_json"];
        assertEquals(typeof sg === "string" && sg.length > 0, true);
        if (isRecord(artifactsVal)) {
          assertEquals(artifactsVal, artifacts);
        } else {
          throw new Error(
            "expected_output_artifacts_json must be a JSON object",
          );
        }
      } else {
        throw new Error("system overlays missing in renderer call");
      }
    },
  );

  await t.step(
    "does not include expected_output_artifacts_json when stage.expected_output_artifacts is null",
    () => {
      const renderPromptMockFn: RenderPromptMock = (
        _base,
        _vars,
        sysOverlays,
        userOverlays,
      ) => {
        const sysVal = isRecord(sysOverlays)
          ? sysOverlays["expected_output_artifacts_json"]
          : undefined;
        const usrVal = isRecord(userOverlays)
          ? userOverlays["expected_output_artifacts_json"]
          : undefined;
        if (typeof sysVal === "string" || typeof usrVal === "string") {
          throw new Error(
            "expected_output_artifacts_json should not be present when stage.expected_output_artifacts is null",
          );
        }
        return "ok";
      };

      const stageWithoutArtifacts: StageContext = {
        ...defaultStage,
        expected_output_artifacts: null,
      };

      const result = render(
        renderPromptMockFn,
        stageWithoutArtifacts,
        defaultContext,
        null,
      );
      assertEquals(result, "ok");
    },
  );

  await t.step(
    "includes expected_output_artifacts_json when stage.expected_output_artifacts is provided",
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

      const artifacts = { a: 1, b: { c: "x" } };
      const stageWithArtifacts: StageContext = {
        ...defaultStage,
        expected_output_artifacts: artifacts,
      };

      const result = render(
        renderPromptMockFn,
        stageWithArtifacts,
        defaultContext,
        null,
      );
      assertEquals(result, "ok");

      if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
        const val = capturedSysOverlay["expected_output_artifacts_json"];
        if (isRecord(val)) {
          assertEquals(val, artifacts);
        } else {
          throw new Error(
            "expected_output_artifacts_json must be a JSON object",
          );
        }
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

      const artifacts = { a: 1 };
      const stageWithOverlaysAndArtifacts: StageContext = {
        ...defaultStage,
        domain_specific_prompt_overlays: [{
          overlay_values: { role: "tester" },
        }],
        expected_output_artifacts: artifacts,
      };

      render(
        renderPromptMockFn,
        stageWithOverlaysAndArtifacts,
        defaultContext,
        null,
      );

      if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
        // Prove original overlay value is preserved
        assertEquals(capturedSysOverlay["role"], "tester");
        // Prove artifact value is injected
        assertEquals(
          isRecord(capturedSysOverlay["expected_output_artifacts_json"]),
          true,
        );
        assertEquals(
          capturedSysOverlay["expected_output_artifacts_json"],
          artifacts,
        );
      } else {
        throw new Error("System overlays were not provided to renderer");
      }
    },
  );

  await t.step(
    "throws an error for non-JSON-compatible artifacts",
    async () => {
      const stageWithInvalidArtifacts: StageContext = {
        ...defaultStage,
        // @ts-expect-error - Intentionally passing invalid type for testing
        expected_output_artifacts: {
          a: 1,
          b: () => "invalid", // Functions are not valid in JSON
        },
      };

      const renderPromptFn = () => "should not be called";

      await assertRejects(
        async () => {
          render(
            renderPromptFn,
            stageWithInvalidArtifacts,
            defaultContext,
            null,
          );
        },
        Error,
        "expected_output_artifacts must be JSON-compatible",
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

      const artifacts = { a: 1 };
      const stageWithNoOverlays: StageContext = {
        ...defaultStage,
        domain_specific_prompt_overlays: [], // No overlays
        expected_output_artifacts: artifacts,
      };

      render(
        renderPromptMockFn,
        stageWithNoOverlays,
        defaultContext,
        null,
      );

      if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
        assertEquals(
          capturedSysOverlay["expected_output_artifacts_json"],
          artifacts,
        );
        // Ensure no other keys were added
        assertEquals(Object.keys(capturedSysOverlay).length, 1);
      } else {
        throw new Error("System overlays were not provided to renderer");
      }
    },
  );
});
