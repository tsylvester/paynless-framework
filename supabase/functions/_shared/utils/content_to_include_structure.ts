import { isRecord } from "./type_guards.ts";

/**
 * Compares the structure (not values) of two content_to_include objects.
 * Returns true if they have the same keys, same nested structure, same array positions.
 * 
 * Structure comparison rules:
 * - Both must be objects (not arrays at top level)
 * - Must have the same keys (order doesn't matter for top level, but structure must match)
 * - Nested objects must have matching keys and structure recursively
 * - Arrays must have the same length and matching element structure
 * - Primitive types (string, boolean, number) must match types (values don't need to match)
 * 
 * @param expected - The expected structure from recipe step's documents[].content_to_include
 * @param actual - The actual structure from header_context.context_for_documents[].content_to_include
 * @returns true if structures match, false otherwise
 */
export function compareContentToIncludeStructure(
  expected: unknown,
  actual: unknown
): boolean {
  // Both must be objects (not arrays at top level)
  if (!isRecord(expected) || !isRecord(actual)) {
    return false;
  }
  
  // Reject arrays at top level
  if (Array.isArray(expected) || Array.isArray(actual)) {
    return false;
  }
  
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  
  // Must have same keys
  if (expectedKeys.length !== actualKeys.length ||
      !expectedKeys.every((key, i) => key === actualKeys[i])) {
    return false;
  }
  
  // Recursively compare nested structures
  for (const key of expectedKeys) {
    const expectedValue = expected[key];
    const actualValue = actual[key];
    
    // Compare types - both must be same type category
    const expectedIsArray = Array.isArray(expectedValue);
    const actualIsArray = Array.isArray(actualValue);
    const expectedIsRecord = isRecord(expectedValue);
    const actualIsRecord = isRecord(actualValue);
    const expectedType = typeof expectedValue;
    const actualType = typeof actualValue;
    
    // Type mismatch: one is array, other is not
    if (expectedIsArray !== actualIsArray) {
      return false;
    }
    
    // Type mismatch: one is object, other is not (and not array)
    if (!expectedIsArray && !actualIsArray && expectedIsRecord !== actualIsRecord) {
      return false;
    }
    
    // Type mismatch: primitive types don't match
    if (!expectedIsArray && !actualIsArray && !expectedIsRecord && !actualIsRecord) {
      if (expectedType !== actualType) {
        return false;
      }
      // For primitives, type match is sufficient (values don't need to match)
      continue;
    }
    
    // If both are arrays, compare structure recursively
    if (expectedIsArray && actualIsArray) {
      const expectedArray = expectedValue;
      const actualArray = actualValue;
      
      // If expected array is empty, it matches any length array of the same type (template pattern)
      if (expectedArray.length === 0) {
        // Empty template array matches any length array
        // This allows recipe templates with empty arrays to match filled arrays from header_context
        continue;
      }
      
      // Compare structure of first element to determine array type
      const firstExpected = expectedArray[0];
      const firstActual = actualArray.length > 0 ? actualArray[0] : undefined;
      
      // If first element is an object, it's a template for array of objects
      // Template with single object matches any length array where all elements match structure
      if (isRecord(firstExpected)) {
        if (firstActual === undefined || !isRecord(firstActual)) {
          return false;
        }
        // Verify first actual element matches template structure
        if (!compareContentToIncludeStructure(firstExpected, firstActual)) {
          return false;
        }
        // Template structure matches - continue to next key
        // (We don't check length for object arrays - template shows structure, actual can have multiple)
        continue;
      }
      // If first element is a string, it's a string array template
      // String arrays require exact length match (not template pattern)
      else if (typeof firstExpected === 'string') {
        if (typeof firstActual !== 'string') {
          return false;
        }
        // String arrays must have exact length match
        if (expectedArray.length !== actualArray.length) {
          return false;
        }
        // Structure matches - all elements are strings and lengths match
        continue;
      }
      // Mixed or invalid array structure
      else {
        return false;
      }
    }
    
    // If both are objects, compare structure recursively
    if (expectedIsRecord && actualIsRecord) {
      if (!compareContentToIncludeStructure(expectedValue, actualValue)) {
        return false;
      }
      continue;
    }
    
    // Should not reach here, but if we do, structures don't match
    return false;
  }
  
  return true;
}

/**
 * Extracts the structure keys and types from a content_to_include object for error messages.
 * Returns a simplified representation showing the structure without values.
 * 
 * @param obj - The content_to_include object to analyze
 * @returns A record mapping keys to their type descriptions
 */
export function getStructureKeys(obj: unknown): Record<string, string> {
  if (!isRecord(obj)) {
    return {};
  }
  
  // Reject arrays at top level
  if (Array.isArray(obj)) {
    return { "[array]": "array (invalid - must be object)" };
  }
  
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        result[key] = "array[0]";
      } else if (isRecord(value[0])) {
        result[key] = `array[${value.length}] of objects`;
      } else if (typeof value[0] === 'string') {
        result[key] = `array[${value.length}] of strings`;
      } else {
        result[key] = `array[${value.length}]`;
      }
    } else if (isRecord(value)) {
      result[key] = "object";
    } else {
      result[key] = typeof value;
    }
  }
  return result;
}

