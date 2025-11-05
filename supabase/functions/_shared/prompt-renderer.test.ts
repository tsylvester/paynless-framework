import { assertEquals } from "https://deno.land/std@0.208.0/assert/assert_equals.ts";
import { Json } from "../types_db.ts"; // Assuming Json type is useful here
import { renderPrompt } from "./prompt-renderer.ts"; // Function to be created
import { RenderContext } from "./prompt-assembler/prompt-assembler.interface.ts";
import { DialecticRecipeStep } from "../dialectic-service/dialectic.interface.ts";
import { FileType } from "./types/file_manager.types.ts";

interface PromptRenderTestCase {
  name: string;
  basePromptText: string;
  renderContext: RenderContext;
  systemDefaultOverlayValues?: Json | null;
  userProjectOverlayValues?: Json | null;
  expectedOutput: string;
  expectedError?: string;
}

const mockSimpleRecipeStep: DialecticRecipeStep = {
  id: "1",
  job_type: "EXECUTE",
  step_key: "simple-step",
  step_slug: "simple-step-slug",
  step_name: "Simple Step",
  step_number: 1,
  prompt_type: "Turn",
  granularity_strategy: "per_source_document",
  output_type: FileType.business_case,
  inputs_required: [],
  inputs_relevance: [],
  outputs_required: [{ type: FileType.business_case, document_key: "business_case" }],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  prompt_template_id: "pt-exec-summary-123",
  branch_key: "executive_summary",
  parallel_group: 1,
  template_id: "pt-exec-summary-123",
  step_description: "Simple Step Description",
};

const mockBaseRenderContext: RenderContext = {
  user_objective: "World",
  domain: "Earth",
  context_description: "Hello World! Welcome to Earth.",
  original_user_request: "Hello World! Welcome to Earth.",
  recipeStep: mockSimpleRecipeStep,
  name: "World", 
  place: "Earth",
};

Deno.test("Prompt Rendering Utility", async (t) => {
  const testCases: PromptRenderTestCase[] = [
    {
      name: "Basic variable substitution from dynamic context",
      basePromptText: "Hello {name}! Welcome to {place}.",
      renderContext: mockBaseRenderContext,
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "Hello World! Welcome to Earth.",
    },
    {
      name: "Simple system overlay",
      basePromptText: "System setting: {setting_a}.",
      renderContext: mockBaseRenderContext,
      systemDefaultOverlayValues: { setting_a: "SystemValueA" },
      userProjectOverlayValues: null,
      expectedOutput: "System setting: SystemValueA.",
    },
    {
      name: "Simple user overlay",
      basePromptText: "User preference: {pref_b}.",
      renderContext: mockBaseRenderContext,
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: { pref_b: "UserValueB" },
      expectedOutput: "User preference: UserValueB.",
    },
    {
      name: "Overlay merge - user overrides system",
      basePromptText: "Conflict: {item}, UniqueSystem: {sys_only}, UniqueUser: {usr_only}.",
      renderContext: mockBaseRenderContext,
      systemDefaultOverlayValues: { item: "SysItem", sys_only: "SystemOnlyValue" },
      userProjectOverlayValues: { item: "UsrItem", usr_only: "UserOnlyValue" },
      expectedOutput: "Conflict: UsrItem, UniqueSystem: SystemOnlyValue, UniqueUser: UserOnlyValue.",
    },
    {
      name: "Variable in base prompt, value from system overlay",
      basePromptText: "Base needs {var_from_sys}.",
      renderContext: mockBaseRenderContext,
      systemDefaultOverlayValues: { var_from_sys: "ValueFromSystem" },
      userProjectOverlayValues: null,
      expectedOutput: "Base needs ValueFromSystem.",
    },
    {
      name: "Variable in base prompt, value from user overlay",
      basePromptText: "Base needs {var_from_usr}.",
      renderContext: mockBaseRenderContext,
      systemDefaultOverlayValues: { var_from_usr: "ShouldBeOverridden" },
      userProjectOverlayValues: { var_from_usr: "ValueFromUser" },
      expectedOutput: "Base needs ValueFromUser.",
    },
    {
      name: "Dynamic context overrides overlays",
      basePromptText: "Priority: {important_var}.",
      renderContext: { ...mockBaseRenderContext, important_var: "DynamicValue" },
      systemDefaultOverlayValues: { important_var: "SystemValue" },
      userProjectOverlayValues: { important_var: "UserValue" },
      expectedOutput: "Priority: DynamicValue.",
    },
    {
      name: "removes unknown placeholders in mixed lines",
      basePromptText: "Data: {present_var}, {missing_var}.",
      renderContext: { present_var: "Present" },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "",
    },
    {
      name: "Whitespace in placeholders is handled",
      basePromptText: "Hello { name }. Value: { value_test }. End.",
      renderContext: { " name ": "Spaced World", " value_test ": "Trimmed" },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "Hello Spaced World. Value: Trimmed. End.",
    },
    {
      name: "Handles object/array values by JSON stringifying them",
      basePromptText: "Object: {my_object}, Array: {my_array}",
      renderContext: {
        my_object: { key: "value", num: 123 },
        my_array: [1, "test", true]
      },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: 'Object: {"key":"value","num":123}, Array: [1,"test",true]',
    },
    {
      name: "Empty base prompt",
      basePromptText: "",
      renderContext: { var: "value" },
      expectedOutput: "",
    },
    {
      name: "No variables in base prompt",
      basePromptText: "Just a static string.",
      renderContext: { var: "value" },
      expectedOutput: "Just a static string.",
    },
    {
      name: "removes lines containing only unknown placeholders",
      basePromptText: "Static with {placeholder}.",
      renderContext: {},
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: {},
      expectedOutput: "",
    },
    {
      name: "Correctly renders an array of strings as a simple comma-separated list",
      basePromptText: "Cover these points: {points_to_cover}",
      renderContext: {
        points_to_cover: ["Problem", "Solution", "Market"],
      },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "Cover these points: Problem, Solution, Market",
    }
    // Future tests:
    // - Nested variables in overlays (e.g. system_overlay: { details: { title: "SysTitle" } }, prompt: {{details.title}} - current simple replace won't handle this)
    // - Error cases (e.g. non-object overlays if function expects objects)
  ];

  for (const tc of testCases) {
    await t.step(tc.name, () => {
      const result = renderPrompt(
        tc.basePromptText,
        tc.renderContext,
        tc.systemDefaultOverlayValues,
        tc.userProjectOverlayValues
      );
      assertEquals(result, tc.expectedOutput);
    });
  }
  
  // RED: Unknown single-brace placeholders should not remain after render
  await t.step("removes unknown single-brace placeholders from final output (RED)", () => {
    const base = [
      "Intro:",
      "Known: {user_objective}",
      "Unknown A: {domain_standards}",
      "Unknown B: {success_criteria}",
      "Unknown C: {compliance_requirements}",
    ].join("\n");

    const result = renderPrompt(
      base,
      { user_objective: "Project X" },
      null,
      null,
    );

    // Assert there are no remaining single-brace placeholders like {key}
    const hasPlaceholder = /\{[A-Za-z0-9_]+\}/.test(result);
    assertEquals(hasPlaceholder, false);
  });
}); 