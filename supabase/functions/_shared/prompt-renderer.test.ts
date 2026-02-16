import { assertEquals } from "https://deno.land/std@0.208.0/assert/assert_equals.ts";
import { Json } from "../types_db.ts"; // Assuming Json type is useful here
import { renderPrompt } from "./prompt-renderer.ts"; // Function to be created
import { RenderContext } from "./prompt-assembler/prompt-assembler.interface.ts";
import { DialecticRecipeStep } from "../dialectic-service/dialectic.interface.ts";
import { FileType } from "./types/file_manager.types.ts";
import { OutputRule } from "../dialectic-service/dialectic.interface.ts";

interface PromptRenderTestCase {
  name: string;
  basePromptText: string;
  renderContext: RenderContext;
  systemDefaultOverlayValues?: Json | null;
  userProjectOverlayValues?: Json | null;
  expectedOutput: string;
  expectedError?: string;
}

const mockOutputsRequired: OutputRule = {
  documents: [{
    document_key: FileType.business_case,
    artifact_class: 'rendered_document',
    file_type: 'markdown',
    template_filename: 'business_case.md',
  }],
};
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
  outputs_required: mockOutputsRequired,
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

  await t.step("should substitute double-brace placeholders without leaving extra braces", () => {
    const basePromptText = "You are a {{role}}, act accordingly.";
    const renderContext = {
      ...mockBaseRenderContext,
      role: "senior product strategist and technical architect",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null,
    );

    const expectedOutput = "You are a senior product strategist and technical architect, act accordingly.";
    assertEquals(result, expectedOutput);
  });

  await t.step("should support both single and double brace placeholders in the same template", () => {
    const basePromptText = "User request: {{original_user_request}}. Context: {context_description}.";
    const renderContext = {
      ...mockBaseRenderContext,
      original_user_request: "User wants a notepad app",
      context_description: "I want to create a notepad app",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null,
    );

    const expectedOutput = "User request: User wants a notepad app. Context: I want to create a notepad app.";
    assertEquals(result, expectedOutput);
  });

  await t.step("should remove lines containing unknown double-brace placeholders", () => {
    const basePromptText = "- **User Objective**: {{unknown_var}}\n- **Stage Role**: {{role}}";
    const renderContext = {
      ...mockBaseRenderContext,
      role: "architect",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null,
    );

    const expectedOutput = "- **Stage Role**: architect";
    assertEquals(result, expectedOutput);
  });

  await t.step("should remove unknown double-brace placeholders in final cleanup", () => {
    const basePromptText = "Known: {{role}}. Unknown: {{missing_var}}.";
    const renderContext = {
      ...mockBaseRenderContext,
      role: "architect",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null,
    );

    // Final cleanup removes entire lines containing unknown placeholders
    const expectedOutput = "";
    assertEquals(result, expectedOutput);
  });

  await t.step("should maintain backward compatibility with single-brace placeholders", () => {
    const basePromptText = "Hello {name}! Welcome to {place}.";
    const renderContext = {
      ...mockBaseRenderContext,
      name: "World",
      place: "Earth",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null,
    );

    const expectedOutput = "Hello World! Welcome to Earth.";
    assertEquals(result, expectedOutput);
  });

  await t.step("should handle mixed single and double brace placeholders correctly", () => {
    const basePromptText = "Double: {{role}}. Single: {stage_instructions}. Both: {{original_user_request}} and {domain}.";
    const renderContext = {
      ...mockBaseRenderContext,
      role: "architect",
      stage_instructions: "establish baseline",
      original_user_request: "Create app",
      domain: "Software Development",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null,
    );

    const expectedOutput = "Double: architect. Single: establish baseline. Both: Create app and Software Development.";
    assertEquals(result, expectedOutput);
  });

  await t.step("should preserve {{handlebars}} inside substituted content", () => {
    const basePromptText = `HeaderContext: {{header_context}}`;
    const headerContextContent = `{"some_key": "{{some_template_value}}"}`;
    
    const renderContext = {
      ...mockBaseRenderContext,
      header_context: headerContextContent
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null
    );

    const expectedOutput = `HeaderContext: ${headerContextContent}`;
    assertEquals(result, expectedOutput);
  });

  await t.step("should handle section tags with special characters like &", () => {
    const basePromptText = `Start
{{#section:differentiation_&_value_proposition}}
This content should be kept.
{{/section:differentiation_&_value_proposition}}
End`;

    const renderContext = {
      ...mockBaseRenderContext,
      "differentiation_&_value_proposition": "true" 
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null
    );

    const expectedOutput = `Start
This content should be kept.
End`;
    
    assertEquals(result.replace(/\n+/g, '\n').trim(), expectedOutput.replace(/\n+/g, '\n').trim());
  });

  await t.step("should preserve JSON structure inside markdown code blocks", () => {
    const basePromptText = `## HeaderContext Schema

Generate a JSON object with this exact structure:

\`\`\`json
{
  "system_materials": {
    "agent_internal_summary": "REQUIRED: Generate an outline",
    "stage_rationale": "REQUIRED: Explain why"
  },
  "header_context_artifact": {
    "type": "header_context",
    "document_key": "header_context"
  },
  "context_for_documents": []
}
\`\`\`

Begin your response with \`{\` immediately.`;

    const renderContext = {
      ...mockBaseRenderContext,
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null
    );

    // The JSON code block should be preserved intact
    assertEquals(result.includes('"system_materials": {'), true, "system_materials key should be preserved");
    assertEquals(result.includes('"agent_internal_summary": "REQUIRED: Generate an outline"'), true, "agent_internal_summary should be preserved");
    assertEquals(result.includes('"header_context_artifact": {'), true, "header_context_artifact key should be preserved");
    assertEquals(result.includes('"type": "header_context"'), true, "type field should be preserved");
    assertEquals(result.includes('"context_for_documents": []'), true, "context_for_documents should be preserved");
  });

  await t.step("should preserve nested JSON objects inside code blocks", () => {
    const jsonBlock = `\`\`\`json
{
  "outer": {
    "inner": {
      "deep": "value"
    }
  }
}
\`\`\``;

    const basePromptText = `Instructions:

${jsonBlock}

End.`;

    const renderContext = {
      ...mockBaseRenderContext,
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null
    );

    // All nested structure should be preserved
    assertEquals(result.includes('"outer": {'), true, "outer key should be preserved");
    assertEquals(result.includes('"inner": {'), true, "inner key should be preserved");
    assertEquals(result.includes('"deep": "value"'), true, "deep value should be preserved");
  });

  await t.step("should still substitute placeholders outside code blocks while preserving code blocks", () => {
    const basePromptText = `User objective: {{user_objective}}

\`\`\`json
{
  "schema_example": {
    "field": "value"
  }
}
\`\`\`

Domain: {domain}`;

    const renderContext = {
      ...mockBaseRenderContext,
      user_objective: "Build an app",
      domain: "Software",
    };

    const result = renderPrompt(
      basePromptText,
      renderContext,
      null,
      null
    );

    // Placeholders outside code block should be substituted
    assertEquals(result.includes("User objective: Build an app"), true, "user_objective should be substituted");
    assertEquals(result.includes("Domain: Software"), true, "domain should be substituted");
    
    // JSON inside code block should be preserved
    assertEquals(result.includes('"schema_example": {'), true, "JSON structure should be preserved");
    assertEquals(result.includes('"field": "value"'), true, "JSON content should be preserved");
  });

  await t.step("should preserve JSON with nested arrays outside code blocks (feature_spec pattern)", () => {
    // This is the exact pattern from thesis_feature_spec_turn_v1.md that was being stripped
    // The }]}} ending pattern was triggering the single-brace regex incorrectly
    const basePromptText = `Replace the placeholder value for each key of the JSON object below:

{"content":{"features":[{"feature_name":"Provide the name of the feature.","feature_objective":"Describe the objective.","user_stories":["List each user story."],"acceptance_criteria":["List each criterion."],"dependencies":["List each dependency."],"success_metrics":["List each metric."]}]}}

Return only the JSON object shown above.`;

    const result = renderPrompt(
      basePromptText,
      mockBaseRenderContext,
      null,
      null
    );

    // The entire JSON template line must be preserved - this was the bug
    assertEquals(
      result.includes('{"content":{"features":[{"feature_name":"Provide the name of the feature."'),
      true,
      "JSON with nested arrays should NOT be stripped"
    );
    assertEquals(
      result.includes('"user_stories":["List each user story."]'),
      true,
      "Nested arrays in JSON should be preserved"
    );
    assertEquals(
      result.includes('}]}}'),
      true,
      "The }]}} ending pattern should be preserved"
    );
  });

  await t.step("should preserve flat JSON outside code blocks (technical_approach pattern)", () => {
    // This pattern from thesis_technical_approach_turn_v1.md was NOT being stripped
    // Included as a control to ensure the fix doesn't break working patterns
    const basePromptText = `Replace the placeholder value for each key of the JSON object below:

{"content":{"architecture":"Describe the architecture.","components":"Detail the components.","data":"Explain data models.","deployment":"Outline deployment.","sequencing":"Provide sequencing.","risk_mitigation":"Summarize risks.","open_questions":"List questions."}}

Return only the JSON object shown above.`;

    const result = renderPrompt(
      basePromptText,
      mockBaseRenderContext,
      null,
      null
    );

    // The flat JSON template should remain preserved
    assertEquals(
      result.includes('{"content":{"architecture":"Describe the architecture."'),
      true,
      "Flat JSON should be preserved"
    );
    assertEquals(
      result.includes('"open_questions":"List questions."}}'),
      true,
      "The }} ending pattern should be preserved"
    );
  });
}); 