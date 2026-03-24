import { assertEquals } from "https://deno.land/std@0.208.0/assert/assert_equals.ts";
import type {
  KitTagConfig,
  GetTagIdForRefDeps,
  GetTagIdForRefParams,
} from "./kit.interface.ts";
import { getTagIdForRef } from "./getTagIdForRef.ts";

const testTagMap: Record<string, KitTagConfig> = {
  vibecoder: { tagId: "tag-111", description: "Vibecoder funnel" },
  startup: { tagId: "tag-222", description: "Startup funnel" },
};

Deno.test("getTagIdForRef", async (t) => {
  await t.step("returns tagId when ref exists in the map", () => {
    const deps: GetTagIdForRefDeps = { tagMap: testTagMap };
    const params: GetTagIdForRefParams = { ref: "vibecoder" };
    const result: string | null = getTagIdForRef(deps, params);
    assertEquals(result, "tag-111");
  });

  await t.step("returns tagId for a different existing ref", () => {
    const deps: GetTagIdForRefDeps = { tagMap: testTagMap };
    const params: GetTagIdForRefParams = { ref: "startup" };
    const result: string | null = getTagIdForRef(deps, params);
    assertEquals(result, "tag-222");
  });

  await t.step("returns null when ref does not exist in the map", () => {
    const deps: GetTagIdForRefDeps = { tagMap: testTagMap };
    const params: GetTagIdForRefParams = { ref: "unknown_ref" };
    const result: string | null = getTagIdForRef(deps, params);
    assertEquals(result, null);
  });

  await t.step("returns null for empty string ref", () => {
    const deps: GetTagIdForRefDeps = { tagMap: testTagMap };
    const params: GetTagIdForRefParams = { ref: "" };
    const result: string | null = getTagIdForRef(deps, params);
    assertEquals(result, null);
  });

  await t.step("returns null when tagMap is empty", () => {
    const deps: GetTagIdForRefDeps = { tagMap: {} };
    const params: GetTagIdForRefParams = { ref: "vibecoder" };
    const result: string | null = getTagIdForRef(deps, params);
    assertEquals(result, null);
  });
});
