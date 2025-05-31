import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { extractDistinctDomainTags, DomainOverlayItem } from "../_shared/domain-utils.ts"; // Adjusted path

Deno.test("extractDistinctDomainTags - Unit Tests", async (t) => {
  await t.step("should return an empty array for empty input", () => {
    const items: DomainOverlayItem[] = [];
    const result = extractDistinctDomainTags(items);
    assertEquals(result, []);
  });

  await t.step("should return an empty array for input with only null tags", () => {
    const items: DomainOverlayItem[] = [
      { domain_tag: null },
      { domain_tag: null },
    ];
    const result = extractDistinctDomainTags(items);
    assertEquals(result, []);
  });

  await t.step("should extract distinct tags and filter out nulls", () => {
    const items: DomainOverlayItem[] = [
      { domain_tag: "tech" },
      { domain_tag: "writing" },
      { domain_tag: null },
      { domain_tag: "tech" },
      { domain_tag: "editing" },
    ];
    const result = extractDistinctDomainTags(items);
    assertEquals(result.sort(), ["editing", "tech", "writing"].sort());
  });

  await t.step("should return distinct tags when all tags are non-null", () => {
    const items: DomainOverlayItem[] = [
      { domain_tag: "one" },
      { domain_tag: "two" },
      { domain_tag: "one" },
      { domain_tag: "three" },
    ];
    const result = extractDistinctDomainTags(items);
    assertEquals(result.sort(), ["one", "three", "two"].sort());
  });

  await t.step("should handle an array with a single item (non-null tag)", () => {
    const items: DomainOverlayItem[] = [{ domain_tag: "single" }];
    const result = extractDistinctDomainTags(items);
    assertEquals(result, ["single"]);
  });

  await t.step("should handle an array with a single item (null tag)", () => {
    const items: DomainOverlayItem[] = [{ domain_tag: null }];
    const result = extractDistinctDomainTags(items);
    assertEquals(result, []);
  });
}); 