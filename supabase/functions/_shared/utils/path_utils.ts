export type ExtractSourceGroupFragmentFn = (sourceGroup: string | undefined) => string | undefined;

/**
 * Extracts and sanitizes a source_group UUID fragment for filename disambiguation.
 * 
 * This helper function takes a UUID string (with or without hyphens) from
 * `document_relationships.source_group` and extracts the first 8 characters after
 * removing hyphens, converting to lowercase, for use in filename construction.
 * 
 * The function handles undefined, null, and empty string inputs gracefully by
 * returning undefined. This ensures consistent fragment extraction across
 * `path_constructor.ts`, `executeModelCallAndSave.ts`, and `document_renderer.ts`.
 * 
 * @param sourceGroup - The UUID string from `document_relationships.source_group`, or undefined
 * @returns The first 8 characters (sanitized) as a lowercase string, or undefined if input is invalid
 */
export const extractSourceGroupFragment: ExtractSourceGroupFragmentFn = (sourceGroup: string | undefined): string | undefined => {
  // Handle undefined, null, and empty string inputs gracefully by returning undefined
  if (!sourceGroup || typeof sourceGroup !== 'string' || sourceGroup.trim() === '') {
    return undefined;
  }
  
  // Remove all hyphens using .replace(/-/g, '')
  const withoutHyphens = sourceGroup.replace(/-/g, '');
  
  // Extract first 8 characters using .substring(0, 8)
  // This gracefully handles UUIDs shorter than 8 characters after hyphen removal
  // by returning all available characters (no error thrown)
  const firstEight = withoutHyphens.substring(0, 8);
  
  // Convert to lowercase using .toLowerCase()
  return firstEight.toLowerCase();
}