// deno-lint-ignore-file no-explicit-any

// Define a more specific type for items from domain_specific_prompt_overlays
export interface DomainOverlayItem {
    domain_tag: string | null;
    // other properties if needed by other functions, but only domain_tag is used here
}

// Exported for unit testing
export function extractDistinctDomainTags(items: DomainOverlayItem[]): string[] {
  if (!items || items.length === 0) {
    return [];
  }
  return [...new Set(items.map((item: DomainOverlayItem) => item.domain_tag).filter((tag: string | null): tag is string => tag !== null))] as string[];
} 