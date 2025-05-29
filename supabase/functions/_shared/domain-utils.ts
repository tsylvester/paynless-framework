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

// New utility function to check if a domain tag is valid
// Note: dbClient type should ideally be more specific if possible, e.g., SupabaseClient
export async function isValidDomainTag(dbClient: any, domainTag: string): Promise<boolean> {
  if (!domainTag) return false; // Or handle as per requirements, empty string might not be valid

  const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('domain_tag')
    .eq('domain_tag', domainTag)
    .limit(1);

  if (error) {
    console.error(`Error validating domain tag "${domainTag}":`, error);
    return false; // Treat database errors as invalid for safety
  }
  return data && data.length > 0;
} 