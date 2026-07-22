import { FileType } from '../../../types/file_manager.types.ts';
import { renderPrompt } from '../../../prompt-renderer.ts';
import { isRecord } from '../../../utils/type_guards.ts';

function titleFromDocumentKey(documentKey: string): string {
  const withSpaces = documentKey.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Recursively formats a structured value (object, array, or primitive) as
 * readable Markdown. Used by the flat rendering path so that nested objects
 * appear as labelled fields rather than raw JSON.
 */
function formatValueAsMarkdown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    // Array of strings -> bullet list
    if (typeof value[0] === 'string') {
      return value.map((item: string) => `- ${item}`).join('\n');
    }
    // Array of objects -> format each, separated by blank line
    if (isRecord(value[0])) {
      return value
        .filter(isRecord)
        .map((item: Record<PropertyKey, unknown>) => formatObjectFieldsAsMarkdown(item))
        .join('\n\n');
    }
    return JSON.stringify(value);
  }

  if (isRecord(value)) {
    return formatObjectFieldsAsMarkdown(value);
  }

  return String(value);
}

/**
 * Formats a plain object's fields as labelled Markdown lines.
 * - String fields:       **Label:** value
 * - Array-of-string:     **Label:**\n- item\n- item
 * - Array-of-object:     **Label:**\n  (recursive per item)
 * - Nested object:       **Label:**\n  (recursive)
 * - Empty arrays:        skipped
 */
function formatObjectFieldsAsMarkdown(obj: Record<PropertyKey, unknown>): string {
  const lines: string[] = [];
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;

    const label = titleFromDocumentKey(String(key));

    if (typeof val === 'string') {
      lines.push(`**${label}:** ${val}`);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      lines.push(`**${label}:** ${String(val)}`);
    } else if (Array.isArray(val)) {
      if (typeof val[0] === 'string') {
        lines.push(`**${label}:**`);
        for (const item of val) {
          lines.push(`- ${item}`);
        }
      } else if (isRecord(val[0])) {
        lines.push(`**${label}:**`);
        for (const item of val) {
          if (!isRecord(item)) continue;
          // Render each sub-object's fields as indented entries
          const subFields = Object.entries(item)
            .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && (v as unknown[]).length === 0))
            .map(([k, v]) => {
              const subLabel = titleFromDocumentKey(k);
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                return `  - **${subLabel}:** ${String(v)}`;
              }
              return `  - **${subLabel}:** ${formatValueAsMarkdown(v)}`;
            });
          lines.push(subFields.join('\n'));
        }
      } else {
        lines.push(`**${label}:** ${JSON.stringify(val)}`);
      }
    } else if (isRecord(val)) {
      lines.push(`**${label}:**\n${formatObjectFieldsAsMarkdown(val)}`);
    }
  }
  return lines.join('\n\n');
}

// Helper: strip template comments from output
function stripTemplateComments(text: string): string {
  return text.replace(/<!--\s*Template:.*?-->\s*/gi, '');
}

// Helper: extract section names from {{#section:NAME}} patterns in the template
function extractTemplateSectionNames(templateText: string): Set<string> {
  const names = new Set<string>();
  const sectionRegex = /\{\{\s*#section:([\w&]+)\s*\}\}/g;
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(templateText)) !== null) {
    names.add(sectionMatch[1]);
  }
  return names;
}

// Helper: format a flat record's values as Markdown-ready strings for renderPrompt
function formatRecordForRender(data: Record<string, unknown>, docKey: string): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};
  for (const key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const val = data[key];
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      formatted[key] = val;
    } else {
      formatted[key] = formatValueAsMarkdown(val);
    }
  }
  return { title: titleFromDocumentKey(String(docKey)), ...formatted };
}

export function renderStructuredDocument(
  templateText: string,
  structuredRecord: Record<string, unknown>,
  documentKey: FileType,
): string {
  // Determine rendering strategy: flat (single render) vs per-item (render template per array item)
  //
  // Per-item rendering applies when ALL of the following are true:
  //   1. No top-level data key matches any template section name
  //   2. There is exactly one top-level key whose value is an array of objects
  //   3. The inner object fields DO overlap with template section names
  //
  // This distinguishes:
  //   - feature_spec: data = { features: [{feature_name, ...}] }, template has {feature_name} -> per-item
  //   - tech_stack: data = { frontend_stack, components: [{...}], ... }, template has {frontend_stack}, {components} -> flat
  //   - product_requirements: data = { executive_summary, features: [{...}], ... }, template has {features} -> flat
  const templateSections = extractTemplateSectionNames(templateText);
  const dataKeys = Object.keys(structuredRecord);
  const topLevelMatchCount = dataKeys.filter(k => templateSections.has(k)).length;

  let rendered: string;

  if (topLevelMatchCount === 0) {
    // No top-level key matches template sections -- check for per-item rendering
    const arrayOfObjectsKeys = dataKeys.filter(k => {
      const val = structuredRecord[k];
      return Array.isArray(val) && val.length > 0 && isRecord(val[0]);
    });

    if (arrayOfObjectsKeys.length === 1) {
      const items = structuredRecord[arrayOfObjectsKeys[0]] as Record<PropertyKey, unknown>[];
      const sampleItemKeys = Object.keys(items[0]);
      const itemFieldMatchCount = sampleItemKeys.filter(k => templateSections.has(k)).length;

      if (itemFieldMatchCount > 0) {
        // Per-item rendering: render template once per array item, join results
        const renderedItems: string[] = [];
        for (const item of items) {
          if (!isRecord(item)) continue;
          const itemRecord: Record<string, unknown> = {};
          for (const fieldKey in item) {
            if (Object.prototype.hasOwnProperty.call(item, fieldKey)) {
              itemRecord[fieldKey] = item[fieldKey];
            }
          }
          renderedItems.push(renderPrompt(templateText, formatRecordForRender(itemRecord, documentKey)));
        }
        rendered = renderedItems.join('\n\n---\n\n');
      } else {
        rendered = renderPrompt(templateText, formatRecordForRender(structuredRecord, documentKey));
      }
    } else {
      rendered = renderPrompt(templateText, formatRecordForRender(structuredRecord, documentKey));
    }
  } else {
    // At least one top-level key matches a template section -- flat rendering
    rendered = renderPrompt(templateText, formatRecordForRender(structuredRecord, documentKey));
  }

  // Strip template comments from final output
  rendered = stripTemplateComments(rendered);

  return rendered;
}
