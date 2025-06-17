import { Json } from "../types_db.ts";

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param text The string to escape.
 * @returns The escaped string.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Renders a prompt template by first merging overlay values and then substituting variables.
 *
 * Merge Logic:
 * 1. Start with systemDefaultOverlayValues.
 * 2. Merge userProjectOverlayValues, with user values taking precedence over system values for the same keys.
 *
 * Substitution Logic:
 * 1. Variables are expected in the format {{variable_name}}.
 * 2. Substitutions are made from the merged overlay values first.
 * 3. Then, substitutions are made from dynamicContextVariables, taking precedence over overlay values for the same keys.
 * 4. If a variable is not found in any source, it should remain as is in the text (e.g., "{{undefined_variable}}").
 *
 * @param basePromptText The base prompt string with {{variable}} placeholders.
 * @param dynamicContextVariables Runtime variables to substitute.
 * @param systemDefaultOverlayValues System-defined JSONB overlay values.
 * @param userProjectOverlayValues User-defined JSONB overlay values.
 * @returns The rendered prompt string.
 */
export function renderPrompt(
  basePromptText: string,
  dynamicContextVariables: Record<string, unknown>,
  systemDefaultOverlayValues?: Json | null,
  userProjectOverlayValues?: Json | null
): string {
  let mergedVariables: Record<string, unknown> = {};

  // 1. Start with systemDefaultOverlayValues
  if (systemDefaultOverlayValues && typeof systemDefaultOverlayValues === 'object' && !Array.isArray(systemDefaultOverlayValues)) {
    mergedVariables = { ...systemDefaultOverlayValues };
  }

  // 2. Merge userProjectOverlayValues
  if (userProjectOverlayValues && typeof userProjectOverlayValues === 'object' && !Array.isArray(userProjectOverlayValues)) {
    mergedVariables = { ...mergedVariables, ...userProjectOverlayValues };
  }

  // 3. Merge dynamicContextVariables, taking precedence
  mergedVariables = { ...mergedVariables, ...dynamicContextVariables };

  // 4. Substitute variables in basePromptText
  let renderedText = basePromptText;

  for (const key in mergedVariables) {
    if (Object.prototype.hasOwnProperty.call(mergedVariables, key)) {
      const value = mergedVariables[key];
      const stringValue = (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') 
        ? String(value) 
        : JSON.stringify(value);
      
      const escapedKey = escapeRegExp(key);
      const regex = new RegExp(`{\\s*${escapedKey}\\s*}`, 'g'); 
      renderedText = renderedText.replace(regex, stringValue);
    }
  }
  return renderedText;
} 