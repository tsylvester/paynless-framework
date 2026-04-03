import type {
  GetTagIdForRefDeps,
  GetTagIdForRefParams,
  GetTagIdForRefReturn,
} from "./kit.interface.ts";

export function getTagIdForRef(
  deps: GetTagIdForRefDeps,
  params: GetTagIdForRefParams,
): GetTagIdForRefReturn {
  const entry = deps.tagMap[params.ref];
  if (!entry) {
    return null;
  }
  return entry.tagId;
}
