import type { ShouldEnqueueRenderJobDeps, ShouldEnqueueRenderJobParams } from '../types/shouldEnqueueRenderJob.interface.ts';
import { isRecord } from './type-guards/type_guards.common.ts';

/**
 * Helper to convert a value to a plain array
 */
function toPlainArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || value === undefined) {
        return [];
    }
    return [value];
}

/**
 * Helper to check if a filename is a markdown template
 */
function isMarkdownTemplate(value: string): boolean {
    const lower = value.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/**
 * Extract markdown document keys from a single rule object
 * This mirrors the logic in packages/store/src/dialecticStore.selectors.ts lines 933-1000
 */
function extractMarkdownDocumentKeysFromRule(
    rawRule: unknown,
    documentKeys: Set<string>
): void {
    if (!isRecord(rawRule)) {
        return;
    }

    const register = (documentKey: unknown) => {
        if (typeof documentKey === 'string' && documentKey.trim().length > 0) {
            documentKeys.add(documentKey);
        }
    };

    // Handle legacy document_key/file_type at root level
    const legacyDocumentKey = rawRule['document_key'];
    const legacyFileType = rawRule['file_type'];
    if (legacyFileType === 'markdown') {
        register(legacyDocumentKey);
    }

    // Helper to evaluate a document entry
    const evaluateDocumentEntry = (entry: unknown) => {
        if (!isRecord(entry)) {
            return;
        }

        const documentKey = entry['document_key'];
        const fileType = entry['file_type'];
        const templateFilename = entry['template_filename'];

        if (fileType === 'markdown') {
            register(documentKey);
            return;
        }

        if (typeof templateFilename === 'string' && isMarkdownTemplate(templateFilename)) {
            register(documentKey);
        }
    };

    // Handle documents array
    const documents = toPlainArray(rawRule['documents']);
    documents.forEach(evaluateDocumentEntry);

    // Handle assembled_json array
    const assembledJson = toPlainArray(rawRule['assembled_json']);
    assembledJson.forEach(evaluateDocumentEntry);

    // Handle files_to_generate array
    const filesToGenerate = toPlainArray(rawRule['files_to_generate']);
    filesToGenerate.forEach((entry) => {
        if (!isRecord(entry)) {
            return;
        }

        const documentKey = entry['from_document_key'];
        const templateFilename = entry['template_filename'];
        if (
            typeof documentKey === 'string' &&
            documentKey.trim().length > 0 &&
            typeof templateFilename === 'string' &&
            isMarkdownTemplate(templateFilename)
        ) {
            register(documentKey);
        }
    });
}

/**
 * Determines if a render job should be enqueued for a given output type
 * by querying recipe steps and checking if the output type corresponds to a markdown document.
 */
export async function shouldEnqueueRenderJob(
    deps: ShouldEnqueueRenderJobDeps,
    params: ShouldEnqueueRenderJobParams
): Promise<boolean> {
    const { dbClient } = deps;
    const { outputType, stageSlug } = params;

    // 1. Query dialectic_stages to get active_recipe_instance_id for the stageSlug
    const { data: stageData, error: stageError } = await dbClient
        .from('dialectic_stages')
        .select('active_recipe_instance_id')
        .eq('slug', stageSlug)
        .single();

    if (stageError || !stageData || !stageData.active_recipe_instance_id) {
        return false;
    }

    // 2. Query dialectic_stage_recipe_instances to check if is_cloned
    const { data: instance, error: instanceError } = await dbClient
        .from('dialectic_stage_recipe_instances')
        .select('*')
        .eq('id', stageData.active_recipe_instance_id)
        .single();

    if (instanceError || !instance) {
        return false;
    }

    // 3. Query recipe steps based on whether instance is cloned
    let steps: unknown[] = [];

    if (instance.is_cloned === true) {
        // If cloned, query dialectic_stage_recipe_steps where instance_id = active_recipe_instance_id
        const { data: stepRows, error: stepErr } = await dbClient
            .from('dialectic_stage_recipe_steps')
            .select('*')
            .eq('instance_id', instance.id);

        if (stepErr || !stepRows || stepRows.length === 0) {
            return false;
        }

        steps = stepRows;
    } else {
        // If not cloned, query dialectic_recipe_template_steps where template_id = instance.template_id
        const { data: stepRows, error: stepErr } = await dbClient
            .from('dialectic_recipe_template_steps')
            .select('*')
            .eq('template_id', instance.template_id);

        if (stepErr || !stepRows || stepRows.length === 0) {
            return false;
        }

        steps = stepRows;
    }

    // 4. For each step, examine outputs_required (which is JSONB)
    // Parse it as JSON if it's a string, then extract markdown document keys
    const markdownDocumentKeys = new Set<string>();

    for (const step of steps) {
        if (!isRecord(step)) {
            continue;
        }

        let outputsRequired: unknown = step['outputs_required'];

        // Handle string JSONB - parse if needed
        if (typeof outputsRequired === 'string') {
            try {
                outputsRequired = JSON.parse(outputsRequired);
            } catch {
                // If parsing fails, skip this step
                continue;
            }
        }

        // Convert to array and process each rule (matching reference implementation)
        const rules = toPlainArray(outputsRequired);
        rules.forEach((rule) => {
            extractMarkdownDocumentKeysFromRule(rule, markdownDocumentKeys);
        });
    }

    // 5. Return true if outputType matches any extracted document_key, false otherwise
    return markdownDocumentKeys.has(outputType);
}
