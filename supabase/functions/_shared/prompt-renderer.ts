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

  // 4. Handle conditional sections first
  let renderedText = basePromptText;
  const sectionRegex = /{{\s*#section:(\w+)\s*}}([\s\S]*?){{\s*\/section:\1\s*}}/g;

  renderedText = renderedText.replace(sectionRegex, (match, key, content) => {
    const value = mergedVariables[key];
    if (value !== null && value !== undefined && value !== '') {
      // If the value exists, keep the content, but remove the section tags.
      return content;
    }
    // If the value is missing, remove the entire section.
    return '';
  });

  // 5. Substitute remaining variables in the processed text
  for (const key in mergedVariables) {
    if (Object.prototype.hasOwnProperty.call(mergedVariables, key)) {
      const value = mergedVariables[key];
      const escapedKey = escapeRegExp(key);
      const placeholderRegex = new RegExp(`{\\s*${escapedKey}\\s*}`, 'g');

      if (value === null || value === undefined || value === '') {
        // This will now primarily handle single-line placeholders like list items
        const lineRemovalRegex = new RegExp(`^.*${placeholderRegex.source}.*$\\n?`, "gm");
        renderedText = renderedText.replace(lineRemovalRegex, '');
      } else {
        let stringValue;
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
          stringValue = value.join(", ");
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          stringValue = String(value);
        } else {
          stringValue = JSON.stringify(value);
        }
        renderedText = renderedText.replace(placeholderRegex, stringValue);
      }
    }
  }

  // 6. Final cleanup of any leftover empty lines to avoid large gaps
  renderedText = renderedText.replace(/\n{3,}/g, '\n\n');

  // 7. GREEN cleanup: remove any remaining lines that still contain single-brace placeholders like {key}
  //    This ensures unknown variables that were not supplied by overlays or dynamic context
  //    do not leak into the final prompt text sent to the model.
  renderedText = renderedText.replace(/^.*\{[A-Za-z0-9_]+\}.*$\n?/gm, '');

  // Normalize trailing whitespace
  renderedText = renderedText.replace(/\n{3,}/g, '\n\n').trimEnd();

  return renderedText;
} 