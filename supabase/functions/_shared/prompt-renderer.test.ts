// @deno-types="npm:@types/chai@4.3.1"
import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { Json } from "../types_db.ts"; // Assuming Json type is useful here
import { renderPrompt } from "./prompt-renderer.ts"; // Function to be created

interface PromptRenderTestCase {
  name: string;
  basePromptText: string;
  dynamicContextVariables: Record<string, unknown>;
  systemDefaultOverlayValues?: Json | null;
  userProjectOverlayValues?: Json | null;
  expectedOutput: string;
  expectedError?: string;
}

Deno.test("Prompt Rendering Utility", async (t) => {
  const testCases: PromptRenderTestCase[] = [
    {
      name: "Basic variable substitution from dynamic context",
      basePromptText: "Hello {name}! Welcome to {place}.",
      dynamicContextVariables: { name: "World", place: "Earth" },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "Hello World! Welcome to Earth.",
    },
    {
      name: "Simple system overlay",
      basePromptText: "System setting: {setting_a}.",
      dynamicContextVariables: {},
      systemDefaultOverlayValues: { setting_a: "SystemValueA" },
      userProjectOverlayValues: null,
      expectedOutput: "System setting: SystemValueA.",
    },
    {
      name: "Simple user overlay",
      basePromptText: "User preference: {pref_b}.",
      dynamicContextVariables: {},
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: { pref_b: "UserValueB" },
      expectedOutput: "User preference: UserValueB.",
    },
    {
      name: "Overlay merge - user overrides system",
      basePromptText: "Conflict: {item}, UniqueSystem: {sys_only}, UniqueUser: {usr_only}.",
      dynamicContextVariables: {},
      systemDefaultOverlayValues: { item: "SysItem", sys_only: "SystemOnlyValue" },
      userProjectOverlayValues: { item: "UsrItem", usr_only: "UserOnlyValue" },
      expectedOutput: "Conflict: UsrItem, UniqueSystem: SystemOnlyValue, UniqueUser: UserOnlyValue.",
    },
    {
      name: "Variable in base prompt, value from system overlay",
      basePromptText: "Base needs {var_from_sys}.",
      dynamicContextVariables: {},
      systemDefaultOverlayValues: { var_from_sys: "ValueFromSystem" },
      userProjectOverlayValues: null,
      expectedOutput: "Base needs ValueFromSystem.",
    },
    {
      name: "Variable in base prompt, value from user overlay",
      basePromptText: "Base needs {var_from_usr}.",
      dynamicContextVariables: {},
      systemDefaultOverlayValues: { var_from_usr: "ShouldBeOverridden" },
      userProjectOverlayValues: { var_from_usr: "ValueFromUser" },
      expectedOutput: "Base needs ValueFromUser.",
    },
    {
      name: "Dynamic context overrides overlays",
      basePromptText: "Priority: {important_var}.",
      dynamicContextVariables: { important_var: "DynamicValue" },
      systemDefaultOverlayValues: { important_var: "SystemValue" },
      userProjectOverlayValues: { important_var: "UserValue" },
      expectedOutput: "Priority: DynamicValue.",
    },
    {
      name: "removes unknown placeholders in mixed lines",
      basePromptText: "Data: {present_var}, {missing_var}.",
      dynamicContextVariables: { present_var: "Exists" },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "",
    },
    {
      name: "Whitespace in placeholders is handled",
      basePromptText: "Hello { name }. Value: { value_test }. End.",
      dynamicContextVariables: { name: "Spaced World", value_test: "Trimmed" },
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: null,
      expectedOutput: "Hello Spaced World. Value: Trimmed. End.",
    },
    {
      name: "Handles object/array values by JSON stringifying them",
      basePromptText: "Object: {my_object}, Array: {my_array}",
      dynamicContextVariables: {
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
      dynamicContextVariables: { var: "value" },
      expectedOutput: "",
    },
    {
      name: "No variables in base prompt",
      basePromptText: "Just a static string.",
      dynamicContextVariables: { var: "value" },
      expectedOutput: "Just a static string.",
    },
    {
      name: "removes lines containing only unknown placeholders",
      basePromptText: "Static with {placeholder}.",
      dynamicContextVariables: {},
      systemDefaultOverlayValues: null,
      userProjectOverlayValues: {},
      expectedOutput: "",
    }
    // Future tests:
    // - Nested variables in overlays (e.g. system_overlay: { details: { title: "SysTitle" } }, prompt: {{details.title}} - current simple replace won't handle this)
    // - Error cases (e.g. non-object overlays if function expects objects)
  ];

  for (const tc of testCases) {
    await t.step(tc.name, () => {
      const result = renderPrompt(
        tc.basePromptText,
        tc.dynamicContextVariables,
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