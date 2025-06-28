// deno-lint-ignore-file no-explicit-any

// Define a more specific type for items from domain_specific_prompt_overlays
export interface DomainOverlayItem {
    domain_id: string | null;
    // other properties if needed by other functions, but only domain_id is used here
}

// Exported for unit testing
export function extractDistinctDomainIds(items: DomainOverlayItem[]): string[] {
  if (!items || items.length === 0) {
    return [];
  }
  return [...new Set(items.map((item: DomainOverlayItem) => item.domain_id).filter((id: string | null): id is string => id !== null))] as string[];
}

// New utility function to check if a domain id is valid
// Note: dbClient type should ideally be more specific if possible, e.g., SupabaseClient
export async function isValidDomainId(dbClient: any, domainId: string): Promise<boolean> {
  if (!domainId) return false; // Or handle as per requirements, empty string might not be valid

  const { data, error } = await dbClient
    .from('dialectic_domains')
    .select('id')
    .eq('id', domainId)
    .limit(1);

  if (error) {
    console.error(`Error validating domain id "${domainId}":`, error);
    // return false; // Treat database errors as invalid for safety
    throw error; // Re-throw the error to be caught by the caller
  }
  return data && data.length > 0;
} 