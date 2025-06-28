export interface ParsedProductDescription {
  subtitle: string;
  features: string[];
}

export function parseProductDescription(
  productName: string,
  description: string | null | undefined,
): ParsedProductDescription {
  if (!description) {
    return { subtitle: productName, features: [] }; // Default to product name if no description
  }
  try {
    // Attempt to parse as JSON array (for features)
    const featuresArray = JSON.parse(description);
    if (Array.isArray(featuresArray) && featuresArray.every(f => typeof f === 'string')) {
      return {
        subtitle: productName, // Use product name as subtitle when description is a feature list
        features: featuresArray,
      };
    }
    // If not a valid JSON array of strings, treat as plain text subtitle
    return { subtitle: description, features: [] };
  } catch (e) {
    // If JSON.parse fails, it's a plain string description
    return { subtitle: description, features: [] };
  }
} 