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
  const sectionRegex = /{{\s*#section:([\w&]+)\s*}}([\s\S]*?){{\s*\/section:\1\s*}}/g;

  renderedText = renderedText.replace(sectionRegex, (match, key, content) => {
    const value = mergedVariables[key];
    if (value !== null && value !== undefined && value !== '') {
      // If the value exists, keep the content, but remove the section tags.
      return content;
    }
    // If the value is missing, remove the entire section.
    return '';
  });

  // 4.5. Pre-cleanup: Identify and remove lines with unknown variables *before* substitution
  // This prevents cleanup from accidentally deleting lines where a substituted value
  // contains text that looks like a placeholder (e.g. {{template}} in a JSON object).
  
  // We use new RegExp objects with 'g' flag for exec loops
  // Capture content inside braces non-greedily
  const doubleBraceScanRegex = /{{([\s\S]*?)}}/g;
  // Use lookarounds to ensure we don't match double braces as single braces
  const singleBraceScanRegex = /(?<!{){(?!{)([\s\S]*?)(?<!})}(?!})/g;
  
  // We need to identify which placeholders in the text are NOT covered by mergedVariables.
  // Since keys in mergedVariables can have whitespace and be matched by regexes in step 5,
  // we must simulate that matching logic to determine if a placeholder is "known".

  const knownKeys = Object.keys(mergedVariables);
  
  // Helper to check if a placeholder string matches any known key
  const isKnownPlaceholder = (placeholderContent: string, isDouble: boolean): boolean => {
    // Check exact match first (optimization)
    if (Object.prototype.hasOwnProperty.call(mergedVariables, placeholderContent)) return true;
    
    // Check against all keys using the same regex logic as step 5
    for (const key of knownKeys) {
        const escapedKey = escapeRegExp(key);
        // Step 5 regexes:
        // Double: {{escapedKey}}
        // Single: {\s*escapedKey\s*}
        
        if (isDouble) {
            // For double braces, step 5 uses exact match of the key inside {{...}}
            // So {{key}} matches key.
            // If placeholderContent is "key", and we have key "key", it matches.
            if (placeholderContent === key) return true;
        } else {
            // For single braces, step 5 allows whitespace around the key.
            // Regex: /^\s*escapedKey\s*$/
            const matcher = new RegExp(`^\\s*${escapedKey}\\s*$`);
            if (matcher.test(placeholderContent)) return true;
        }
    }
    return false;
  };

  const unknownDoublePlaceholders = new Set<string>();
  const unknownSinglePlaceholders = new Set<string>();

  let match;
  // Scan for double braces
  while ((match = doubleBraceScanRegex.exec(renderedText)) !== null) {
      // match[1] is the content inside {{...}}
      if (!isKnownPlaceholder(match[1], true)) {
          unknownDoublePlaceholders.add(match[1]);
      }
  }
  
  // Scan for single braces
  while ((match = singleBraceScanRegex.exec(renderedText)) !== null) {
      // match[1] is the content inside {...}
      if (!isKnownPlaceholder(match[1], false)) {
          unknownSinglePlaceholders.add(match[1]);
      }
  }
  
  // Remove lines for unknown double braces
  for (const tag of unknownDoublePlaceholders) {
      const escapedTag = escapeRegExp(tag);
      const dbLineRegex = new RegExp(`^.*{{${escapedTag}}}.*$\\n?`, "gm");
      renderedText = renderedText.replace(dbLineRegex, '');
  }

  // Remove lines for unknown single braces
  for (const tag of unknownSinglePlaceholders) {
      const escapedTag = escapeRegExp(tag);
      // We must match the tag exactly as it appeared in the text (including whitespace if any)
      // The tag variable holds the exact captured content.
      const sbLineRegex = new RegExp(`^.*{${escapedTag}}.*$\\n?`, "gm");
      renderedText = renderedText.replace(sbLineRegex, '');
  }

  // 5. Substitute remaining variables in the processed text
  // First pass: handle double-brace placeholders {{key}}
  for (const key in mergedVariables) {
    if (Object.prototype.hasOwnProperty.call(mergedVariables, key)) {
      const value = mergedVariables[key];
      const escapedKey = escapeRegExp(key);
      const placeholderRegex = new RegExp(`{{${escapedKey}}}`, 'g');

      if (value === null || value === undefined || value === '') {
        // Remove lines containing double-brace placeholders when value is empty
        const lineRemovalRegex = new RegExp(`^.*{{${escapedKey}}}.*$\\n?`, "gm");
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

  // Second pass: handle single-brace placeholders {key}
  for (const key in mergedVariables) {
    if (Object.prototype.hasOwnProperty.call(mergedVariables, key)) {
      const value = mergedVariables[key];
      const escapedKey = escapeRegExp(key);
      const placeholderRegex = new RegExp(`{\\s*${escapedKey}\\s*}`, 'g');

      if (value === null || value === undefined || value === '') {
        // Remove lines containing single-brace placeholders when value is empty
        const lineRemovalRegex = new RegExp(`^.*{\\s*${escapedKey}\\s*}.*$\\n?`, "gm");
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

  // Normalize trailing whitespace
  renderedText = renderedText.replace(/\n{3,}/g, '\n\n').trimEnd();

  return renderedText;
} 