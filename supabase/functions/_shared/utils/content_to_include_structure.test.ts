import { assertEquals, assert } from "jsr:@std/assert@0.225.3";
import {
  compareContentToIncludeStructure,
  getStructureKeys,
} from "./content_to_include_structure.ts";

Deno.test("compareContentToIncludeStructure", async (t) => {
  await t.step("should return true for identical simple structures", () => {
    const expected = { field1: "", field2: "" };
    const actual = { field1: "value1", field2: "value2" };
    assert(compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return true for structures with matching keys but different values", () => {
    const expected = { field1: "", field2: "", field3: 0 };
    const actual = { field1: "filled", field2: "also filled", field3: 42 };
    assert(compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when keys don't match", () => {
    const expected = { field1: "", field2: "" };
    const actual = { field1: "value1", field3: "value3" };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when missing keys", () => {
    const expected = { field1: "", field2: "", field3: "" };
    const actual = { field1: "value1", field2: "value2" };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return true for matching array structures (string arrays)", () => {
    const expected = { field1: [], field2: "" };
    const actual = { field1: ["value1", "value2"], field2: "value" };
    assert(compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when array lengths don't match", () => {
    const expected = { field1: ["", ""], field2: "" };
    const actual = { field1: ["value1"], field2: "value" };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return true for matching nested object structures", () => {
    const expected = {
      dimensions: {
        feasibility: { score: 0, rationale: "" }
      }
    };
    const actual = {
      dimensions: {
        feasibility: { score: 85, rationale: "High feasibility" }
      }
    };
    assert(compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when nested object keys don't match", () => {
    const expected = {
      dimensions: {
        feasibility: { score: 0, rationale: "" }
      }
    };
    const actual = {
      dimensions: {
        feasibility: { score: 85, otherField: "value" }
      }
    };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return true for matching array of objects structures", () => {
    const expected = {
      features: [{ name: "", stories: [] }]
    };
    const actual = {
      features: [
        { name: "Feature 1", stories: ["Story 1", "Story 2"] },
        { name: "Feature 2", stories: ["Story 3"] }
      ]
    };
    assert(compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when array of objects has mismatched structure", () => {
    const expected = {
      features: [{ name: "", stories: [] }]
    };
    const actual = {
      features: [
        { name: "Feature 1", otherField: "value" }
      ]
    };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when one is array and other is not", () => {
    const expected = { field1: "" };
    const actual = { field1: ["value1"] };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when one is object and other is primitive", () => {
    const expected = { field1: "" };
    const actual = { field1: { nested: "value" } };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when types don't match (string vs number)", () => {
    const expected = { field1: "" };
    const actual = { field1: 42 };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when expected is not a record", () => {
    const expected = "not an object";
    const actual = { field1: "" };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when actual is not a record", () => {
    const expected = { field1: "" };
    const actual = "not an object";
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return false when expected is array at top level", () => {
    const expected = ["value1", "value2"];
    const actual = { field1: "" };
    assert(!compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return true for empty objects", () => {
    const expected = {};
    const actual = {};
    assert(compareContentToIncludeStructure(expected, actual));
  });

  await t.step("should return true for complex mixed structures", () => {
    const expected = {
      string_field: "",
      array_field: [],
      nested: {
        score: 0,
        items: [{ name: "", tags: [] }]
      },
      boolean_field: false
    };
    const actual = {
      string_field: "filled",
      array_field: ["item1", "item2"],
      nested: {
        score: 95,
        items: [
          { name: "Item 1", tags: ["tag1", "tag2"] },
          { name: "Item 2", tags: ["tag3"] }
        ]
      },
      boolean_field: true
    };
    assert(compareContentToIncludeStructure(expected, actual));
  });
});

Deno.test("getStructureKeys", async (t) => {
  await t.step("should extract keys from simple object", () => {
    const obj = { field1: "value1", field2: "value2" };
    const result = getStructureKeys(obj);
    assertEquals(result, { field1: "string", field2: "string" });
  });

  await t.step("should extract keys with array types", () => {
    const obj = { field1: [], field2: ["value1", "value2"] };
    const result = getStructureKeys(obj);
    assertEquals(result, { field1: "array[0]", field2: "array[2] of strings" });
  });

  await t.step("should extract keys with nested objects", () => {
    const obj = {
      nested: {
        field: "value"
      }
    };
    const result = getStructureKeys(obj);
    assertEquals(result, { nested: "object" });
  });

  await t.step("should extract keys with array of objects", () => {
    const obj = {
      features: [
        { name: "Feature 1", stories: [] },
        { name: "Feature 2", stories: ["Story 1"] }
      ]
    };
    const result = getStructureKeys(obj);
    assertEquals(result, { features: "array[2] of objects" });
  });

  await t.step("should return empty object for non-record input", () => {
    const result = getStructureKeys("not an object");
    assertEquals(result, {});
  });

  await t.step("should handle empty object", () => {
    const result = getStructureKeys({});
    assertEquals(result, {});
  });

  await t.step("should handle mixed types", () => {
    const obj = {
      string_field: "value",
      number_field: 42,
      boolean_field: true,
      array_field: ["item1"],
      nested: { key: "value" },
      objects_array: [{ id: 1 }]
    };
    const result = getStructureKeys(obj);
    assertEquals(result, {
      array_field: "array[1] of strings",
      boolean_field: "boolean",
      nested: "object",
      number_field: "number",
      objects_array: "array[1] of objects",
      string_field: "string"
    });
  });
});

