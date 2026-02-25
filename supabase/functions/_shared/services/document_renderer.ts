import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";
import type { Database } from "../../types_db.ts";
import { FileType, type PathContext } from "../types/file_manager.types.ts";
import { deconstructStoragePath } from "../utils/path_deconstructor.ts";
import { extractSourceGroupFragment } from "../utils/path_utils.ts";
import type {
  RenderDocumentParams,
  RenderDocumentResult,
  DocumentRendererDeps,
} from "./document_renderer.interface.ts";
import type { ResourceUploadContext } from "../types/file_manager.types.ts";
import type { DownloadFromStorageFn } from "../supabase_storage_utils.ts";
import type { DialecticContributionRow } from "../../dialectic-service/dialectic.interface.ts";
import { renderPrompt } from "../prompt-renderer.ts";
import { isRecord } from "../utils/type_guards.ts";
 
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
    // Array of strings → bullet list
    if (typeof value[0] === 'string') {
      return value.map((item: string) => `- ${item}`).join('\n');
    }
    // Array of objects → format each, separated by blank line
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

async function downloadText(
  supabase: SupabaseClient<Database>,
  downloadFromStorage: DownloadFromStorageFn,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await downloadFromStorage(supabase, bucket, path);
  if (error) throw error;
  if (!data) return "";
  return new TextDecoder().decode(data);
}

export async function renderDocument(
  dbClient: SupabaseClient<Database>,
  deps: DocumentRendererDeps,
  params: RenderDocumentParams,
): Promise<RenderDocumentResult> {
  const {
    sessionId,
    iterationNumber,
    stageSlug,
    documentIdentity,
    documentKey,
    projectId,
    sourceContributionId,
  } = params;

  // 1) Load contribution rows for this document chain using DB-side filtering and ordering
  const { data: rows, error: selectError } = await dbClient
    .from("dialectic_contributions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("iteration_number", iterationNumber)
    .contains("document_relationships", { [stageSlug]: documentIdentity })
    .order("edit_version", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<DialecticContributionRow[]>();

  if (selectError) {
    throw new Error("Failed to query contributions for rendering");
  }

  if (rows.length === 0) {
    throw new Error("No contribution chunks found for requested document");
  }

  // 2) Filter chunks to only those that match the document identity
  // The DB query should have filtered, but we double-check here for safety
  const matchingChunks = rows.filter(row => {
    if (!isRecord(row.document_relationships)) {
      return false;
    }
    const relationships = row.document_relationships;
    const stageValue = relationships[stageSlug];
    return stageValue === documentIdentity;
  });

  if (matchingChunks.length === 0) {
    throw new Error("No matching contribution chunks found for requested document");
  }

  // 3) Prefer latest user edits over model chunks when duplicates exist (by file_name)
  const dedupedByFile: Record<string, DialecticContributionRow> = {};
  for (const row of matchingChunks) {
    if (typeof row.file_name !== "string") {
      throw new Error("Invalid file name type");
    }
    const existing = dedupedByFile[row.file_name];
    if (!existing) {
      dedupedByFile[row.file_name] = row;
    } else {
      const preferCurrent = Boolean(row.original_model_contribution_id) || (!existing.original_model_contribution_id && row.is_latest_edit);
      if (preferCurrent) dedupedByFile[row.file_name] = row;
    }
  }
  const dedupedChunks = Object.values(dedupedByFile);

  // 4) Find the root contribution (the one with documentIdentity and null target_contribution_id)
  const rootChunk = dedupedChunks.find(chunk => {
    if (!isRecord(chunk.document_relationships)) {
      return false;
    }
    const relationships = chunk.document_relationships;
    const stageValue = relationships[stageSlug];
    return stageValue === documentIdentity && chunk.target_contribution_id === null;
  });

  if (!rootChunk) {
    throw new Error(`No root contribution found for document identity ${documentIdentity}`);
  }

  // 5) Build ordered chain by traversing target_contribution_id links starting from root
  // This follows the same pattern as assembleAndSaveFinalDocument in file_manager.ts
  const chunkMap = new Map(dedupedChunks.map(c => [c.id, c]));
  const orderedChunks: DialecticContributionRow[] = [];
  let currentId: string | null = rootChunk.id;

  while (currentId) {
    const currentChunk = chunkMap.get(currentId);
    if (!currentChunk) {
      // Chain is broken - this shouldn't happen if data is consistent
      break;
    }
    orderedChunks.push(currentChunk);
    // Find the next chunk in the chain (one that has target_contribution_id pointing to current)
    const nextChunk = dedupedChunks.find(c => c.target_contribution_id === currentId);
    currentId = nextChunk ? nextChunk.id : null;
  }

  if (orderedChunks.length === 0) {
    throw new Error("No ordered chunks found for document chain");
  }

  const uniqueChunks = orderedChunks;

  // 6) Parse model slug and attempt from the first/base chunk
  const base = uniqueChunks[0];
  if (typeof base.file_name !== "string") {
    throw new Error("Invalid file name type");
  }
  const info = deconstructStoragePath({ storageDir: base.storage_path, fileName: base.file_name });
  if (!info.modelSlug || typeof info.attemptCount !== "number") {
    throw new Error("Unable to parse model slug and attempt count from path");
  }
  const modelSlug = info.modelSlug;
  const attemptCount = info.attemptCount;

  // Extract sourceGroupFragment from base chunk's document_relationships.source_group
  // Extract sourceAnchorModelSlug from deconstructed path info (if available for antithesis patterns)
  const sourceGroup = isRecord(base.document_relationships) && typeof base.document_relationships.source_group === 'string'
    ? base.document_relationships.source_group
    : undefined;
  const sourceGroupFragment = extractSourceGroupFragment(sourceGroup);
  const sourceAnchorModelSlug = info.sourceAnchorModelSlug;

  // 7) Load template by querying dialectic_document_templates (authoritative map)
  // Templates must be resolved deterministically via the authoritative template reference
  // carried by the RENDER job payload. No derived-name lookup.
  type DocumentTemplateRow = Database['public']['Tables']['dialectic_document_templates']['Row'];
  const stage = String(stageSlug).toLowerCase();
  const docKey = String(documentKey);
  
  // Query project to get domain_id (required for template lookup)
  const { data: projectData, error: projectError } = await dbClient
    .from('dialectic_projects')
    .select('selected_domain_id')
    .eq('id', projectId)
    .maybeSingle();
  
  if (projectError) {
    throw new Error(`Failed to query project for domain_id: ${projectError.message}`);
  }
  
  if (!projectData?.selected_domain_id) {
    throw new Error(`Project '${projectId}' does not have a selected_domain_id. Template lookup requires domain_id.`);
  }
  
  // Strip .md extension from template_filename to match the name field in dialectic_document_templates
  // The name field stores the base name (e.g., 'thesis_business_case') while template_filename includes .md (e.g., 'thesis_business_case.md')
  const templateNameForQuery = params.template_filename.endsWith('.md') 
    ? params.template_filename.slice(0, -3) 
    : params.template_filename;
  
  const { data: templateRow, error: templateErr } = await dbClient
    .from('dialectic_document_templates')
    .select('*')
    .eq('name', templateNameForQuery)
    .eq('domain_id', projectData.selected_domain_id)
    .eq('is_active', true)
    .maybeSingle<DocumentTemplateRow>();

  if (templateErr || !templateRow) {
    throw new Error(`No template mapping found for stage='${stage}' document='${docKey}' name='${templateNameForQuery}' (from template_filename='${params.template_filename}') domain_id='${projectData.selected_domain_id}': ${templateErr ? (templateErr).message ?? 'unknown error' : 'not found'}`);
  }

  const templateBucket = templateRow.storage_bucket;
  const templateStoragePath = templateRow.storage_path;
  const templateFileName = templateRow.file_name;
  const fullTemplatePath = `${templateStoragePath?.replace(/\/$/, '')}/${templateFileName}`;

  if (!templateBucket || !templateStoragePath || !templateFileName) {
    throw new Error(`Invalid template row: ${JSON.stringify(templateRow)}`);
  }
  const { data: templateData, error: templateDownloadErr } = await deps.downloadFromStorage(
    dbClient,
    templateBucket,
    fullTemplatePath,
  );
  if (templateDownloadErr || !templateData) {
    throw new Error(`Failed to download template '${fullTemplatePath}' from bucket '${templateBucket}': ${templateDownloadErr ? (templateDownloadErr).message ?? 'unknown error' : 'no data'}`);
  }
  const template = new TextDecoder().decode(templateData);

  // Collect structured data from all chunks
  // The agent returns JSON where content field is a JSON string containing structured data
  const mergedStructuredData: Record<string, unknown> = {};
  const contentBucket = base.storage_bucket;
  
  for (const chunk of uniqueChunks) {
    const fileName = chunk.file_name;
    if (!fileName || typeof fileName !== 'string') {
      throw new Error(`Contribution ${chunk.id} is missing file_name`);
    }
    const rawJsonPath = `${chunk.storage_path}/${fileName}`;
    const text = await downloadText(dbClient, deps.downloadFromStorage, contentBucket, rawJsonPath);
    const trimmedText = text.trim();
    
    deps.logger?.info?.('[renderDocument] DEBUG: Raw text length', { 
      chunkId: chunk.id, 
      rawJsonPath, 
      textLength: text.length,
      trimmedTextLength: trimmedText.length,
      textFirst100: text.substring(0, 100),
      textLast100: text.substring(Math.max(0, text.length - 100)),
      trimmedTextFirst100: trimmedText.substring(0, 100),
      trimmedTextLast100: trimmedText.substring(Math.max(0, trimmedText.length - 100)),
    });
    
    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
      try {
        deps.logger?.info?.('[renderDocument] DEBUG: Attempting JSON.parse', { 
          chunkId: chunk.id, 
          rawJsonPath,
          usingTrimmed: false,
          textLength: text.length,
        });
        const parsed = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error(`Parsed JSON is not an object for contribution ${chunk.id}`);
        }
        // Unwrap optional "content" envelope if present; otherwise use top-level object directly.
        // AI models may return { "content": { ... } } or { "field1": ..., "field2": ... } at the top level.
        const structuredData: Record<string, unknown> = isRecord(parsed.content)
          ? parsed.content
          : parsed;

        // Strip known AI metadata keys that are not template placeholders
        delete structuredData.continuation_needed;
        delete structuredData.stop_reason;

        // Merge structured data from this chunk into the merged data
        // For string values, concatenate them to preserve order from multiple chunks
        for (const key in structuredData) {
          if (Object.prototype.hasOwnProperty.call(structuredData, key)) {
            const value = structuredData[key];
            if (typeof value === 'string' && key in mergedStructuredData && typeof mergedStructuredData[key] === 'string') {
              // Concatenate string values to preserve order
              mergedStructuredData[key] = (mergedStructuredData[key]) + '\n\n' + value;
            } else {
              // New keys are added
              mergedStructuredData[key] = value;
            }
          }
        }
        deps.logger?.info?.('[renderDocument] Extracted structured data from content object', {
          chunkId: chunk.id,
          rawJsonPath,
          dataKeys: Object.keys(structuredData),
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes('contribution')) {
          throw e;
        }
        throw new Error(`Failed to parse JSON content from contribution ${chunk.id} (path: ${rawJsonPath}): ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      // Non-JSON content: treat as plain text
      // Append to _extra_content section if it exists in template
      const extraContentKey = '_extra_content';
      if (!mergedStructuredData[extraContentKey]) {
        mergedStructuredData[extraContentKey] = [];
      }
      const contentArray = Array.isArray(mergedStructuredData[extraContentKey]) ? mergedStructuredData[extraContentKey] : [];
      contentArray.push(text);
      mergedStructuredData[extraContentKey] = contentArray;
    }
  }

  // Convert array values to strings for renderPrompt
  // Arrays are joined with newlines for multi-chunk content
  for (const key in mergedStructuredData) {
    if (Object.prototype.hasOwnProperty.call(mergedStructuredData, key)) {
      const value = mergedStructuredData[key];
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
        // Array of strings (e.g., _extra_content from multiple chunks) - join with newlines
        mergedStructuredData[key] = value.join('\n\n');
      }
    }
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

  // Determine rendering strategy: flat (single render) vs per-item (render template per array item)
  //
  // Per-item rendering applies when ALL of the following are true:
  //   1. No top-level data key matches any template section name
  //   2. There is exactly one top-level key whose value is an array of objects
  //   3. The inner object fields DO overlap with template section names
  //
  // This distinguishes:
  //   - feature_spec: data = { features: [{feature_name, ...}] }, template has {feature_name} → per-item
  //   - tech_stack: data = { frontend_stack, components: [{...}], ... }, template has {frontend_stack}, {components} → flat
  //   - product_requirements: data = { executive_summary, features: [{...}], ... }, template has {features} → flat
  const templateSections = extractTemplateSectionNames(template);
  const dataKeys = Object.keys(mergedStructuredData);
  const topLevelMatchCount = dataKeys.filter(k => templateSections.has(k)).length;

  let rendered: string;

  if (topLevelMatchCount === 0) {
    // No top-level key matches template sections — check for per-item rendering
    const arrayOfObjectsKeys = dataKeys.filter(k => {
      const val = mergedStructuredData[k];
      return Array.isArray(val) && val.length > 0 && isRecord(val[0]);
    });

    if (arrayOfObjectsKeys.length === 1) {
      const items = mergedStructuredData[arrayOfObjectsKeys[0]] as Record<PropertyKey, unknown>[];
      const sampleItemKeys = Object.keys(items[0]);
      const itemFieldMatchCount = sampleItemKeys.filter(k => templateSections.has(k)).length;

      if (itemFieldMatchCount > 0) {
        // Per-item rendering: render template once per array item, join results
        deps.logger?.info?.('[renderDocument] Using per-item rendering strategy', {
          arrayKey: arrayOfObjectsKeys[0],
          itemCount: items.length,
          matchingFields: sampleItemKeys.filter(k => templateSections.has(k)),
        });

        const renderedItems: string[] = [];
        for (const item of items) {
          if (!isRecord(item)) continue;
          const itemRecord: Record<string, unknown> = {};
          for (const fieldKey in item) {
            if (Object.prototype.hasOwnProperty.call(item, fieldKey)) {
              itemRecord[fieldKey] = item[fieldKey];
            }
          }
          renderedItems.push(renderPrompt(template, formatRecordForRender(itemRecord, documentKey)));
        }
        rendered = renderedItems.join('\n\n---\n\n');
      } else {
        rendered = renderPrompt(template, formatRecordForRender(mergedStructuredData, documentKey));
      }
    } else {
      rendered = renderPrompt(template, formatRecordForRender(mergedStructuredData, documentKey));
    }
  } else {
    // At least one top-level key matches a template section — flat rendering
    rendered = renderPrompt(template, formatRecordForRender(mergedStructuredData, documentKey));
  }

  // Strip template comments from final output
  rendered = stripTemplateComments(rendered);

  const renderedBytes = new TextEncoder().encode(rendered);

  // 6) Compute final path context and write if a fileManager is available
  const pathContext: PathContext = {
    projectId,
    fileType: FileType.RenderedDocument,
    sessionId,
    iteration: iterationNumber,
    stageSlug,
    documentKey: String(documentKey),
    modelSlug,
    attemptCount,
    sourceContributionId: sourceContributionId,
    sourceGroupFragment,
    ...(sourceAnchorModelSlug ? { sourceAnchorModelSlug } : {}),
  };

  let latestRenderedResourceId: string | undefined = undefined;
  if (deps.fileManager && typeof deps.fileManager.uploadAndRegisterFile === "function") {
    try {
      const uploadContext: ResourceUploadContext = {
        pathContext: {
          projectId: pathContext.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: pathContext.sessionId,
          iteration: pathContext.iteration,
          stageSlug: pathContext.stageSlug,
          documentKey: pathContext.documentKey,
          modelSlug: pathContext.modelSlug,
          attemptCount: pathContext.attemptCount,
          sourceContributionId: pathContext.sourceContributionId ?? null,
          sourceGroupFragment: pathContext.sourceGroupFragment,
          ...(pathContext.sourceAnchorModelSlug ? { sourceAnchorModelSlug: pathContext.sourceAnchorModelSlug } : {}),
        },
        fileContent: Buffer.from(renderedBytes),
        mimeType: "text/markdown",
        sizeBytes: renderedBytes.length,
        userId: base.user_id,
        description: `Rendered document for ${stageSlug}:${String(documentKey)}`,
        resourceTypeForDb: FileType.RenderedDocument,
      };

      const uploadResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);
      
      // Check for error response (uploadAndRegisterFile returns { record, error } or { record: null, error })
      if (uploadResult.error) {
        // When upload succeeds but DB fails, file_manager.ts always returns ServiceError with:
        // { message: "Database registration failed after successful upload.", code?: string, details?: string }
        // ServiceError.details is already a plain string (not JSON) when present
        const error = uploadResult.error;
        let errorMessage = `Failed to save rendered document: ${error.message}`;
        
        if ('details' in error && typeof error.details === 'string') {
          errorMessage += ` (${error.details})`;
        }
        
        if ('code' in error && typeof error.code === 'string') {
          errorMessage += `; code: ${error.code}`;
        }
        
        throw new Error(errorMessage);
      }

      // Capture the resource ID from successful upload
      if (uploadResult.record && typeof uploadResult.record === 'object' && 'id' in uploadResult.record && typeof uploadResult.record.id === 'string') {
        latestRenderedResourceId = uploadResult.record.id;
      }
    } catch (e) {
      deps.logger?.error?.("Failed to upload rendered document", { error: e });
      throw e;
    }
  }

  // 7) Notification 
  const targetUser = base.user_id;
  if (deps.notificationService && typeof deps.notificationService.sendJobNotificationEvent === "function" && targetUser && latestRenderedResourceId) {
    const renderJobId = `render-${documentIdentity}`;
    const stepKey = 'document_step';
    try {
      if (!base.model_id) {
        throw new Error("Base model_id is required for render_completed notification");
      }
      await deps.notificationService.sendJobNotificationEvent({
        type: "render_completed",
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: renderJobId,
        document_key: documentKey,
        modelId: base.model_id,
        latestRenderedResourceId,
        step_key: stepKey,
      }, targetUser);
    } catch (e) {
      deps.logger?.warn?.("Failed to send render_completed notification", { error: e });
    }
  }

  return { pathContext, renderedBytes };
}

export default { renderDocument };


