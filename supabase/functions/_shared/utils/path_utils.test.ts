import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { extractSourceGroupFragment } from "./path_utils.ts";

describe("extractSourceGroupFragment", () => {
  it("should return first 8 characters after removing hyphens", () => {
    const sourceGroup = '550e8400-e29b-41d4-a716-446655440000';
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, '550e8400');
  });

  it("should convert to lowercase", () => {
    const sourceGroup = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, 'a1b2c3d4');
  });

  it("should handle UUID without hyphens", () => {
    const sourceGroup = '550e8400e29b41d4a716446655440000';
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, '550e8400');
  });

  it("should return undefined for undefined input", () => {
    const sourceGroup = undefined;
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, undefined);
  });

  it("should return undefined for null input", () => {
    const sourceGroup = null as unknown as string;
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, undefined);
  });

  it("should return undefined for empty string", () => {
    const sourceGroup = '';
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, undefined);
  });

  it("should handle UUID shorter than 8 characters after hyphen removal", () => {
    const sourceGroup = 'abc-def';
    const result = extractSourceGroupFragment(sourceGroup);
    assertEquals(result, 'abcdef');
  });
});