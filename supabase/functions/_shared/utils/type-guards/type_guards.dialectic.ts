// supabase/functions/_shared/utils/type_guards.ts
import type { Tables, Json } from "../../../types_db.ts";
import { 
    ProcessingStrategy, 
    DialecticContributionRow, 
    DialecticJobPayload,
    DialecticJobRow,
    JobResultsWithModelProcessing,
    ModelProcessingResult,
    DialecticStageRecipe,
    DialecticPlanJobPayload,
    DialecticExecuteJobPayload,
    DialecticStepInfo,
    ContributionType,
    DocumentRelationships,
    JobInsert,
    PlanJobInsert,
    FailedAttemptError,
    DialecticStepPlannerMetadata,
    BranchKey,
    OutputType,
} from '../../../dialectic-service/dialectic.interface.ts';
import { isPlainObject, isRecord } from './type_guards.common.ts';
import { FileType } from '../../types/file_manager.types.ts';
import { isFileType } from './type_guards.file_manager.ts';

// Helper type for the citations array
export type Citation = {
  text: string;
  url?: string;
};

const validContributionTypes: ContributionType[] = [
    'thesis',
    'antithesis',
    'synthesis',
    'parenthesis',
    'paralysis',
    'pairwise_synthesis_chunk',
    'reduced_synthesis',
    'final_synthesis',
    'rag_context_summary'
];

const validBranchKeys = new Set<string>(Object.values(BranchKey));
const validOutputTypes = new Set<string>([...Object.values(OutputType), ...validContributionTypes]);

function isPlannerMetadata(value: unknown): value is DialecticStepPlannerMetadata {
    if (!isRecord(value)) return false;

    const { dependencies, parallel_successors, ...rest } = value;

    if (dependencies !== undefined) {
        if (!Array.isArray(dependencies) || !dependencies.every(item => typeof item === 'string')) {
            return false;
        }
    }

    if (parallel_successors !== undefined) {
        if (!Array.isArray(parallel_successors) || !parallel_successors.every(item => typeof item === 'string')) {
            return false;
        }
    }

    for (const key in rest) {
        const prop = rest[key];
        if (prop === undefined) continue;
        const type = typeof prop;
        if (type !== 'string' && type !== 'number' && type !== 'boolean' && type !== 'object') {
            return false;
        }
    }

    return true;
}

function isHeaderContextDocuments(value: unknown): value is Array<{
    document_key: FileType;
    content_to_include: unknown;
}> {
    if (!Array.isArray(value)) {
        return false;
    }

    for (const entry of value) {
        if (!isRecord(entry)) {
            return false;
        }

        if (!('document_key' in entry) || typeof entry.document_key !== 'string' || !isFileType(entry.document_key)) {
            return false;
        }

        if (!('content_to_include' in entry)) {
            return false;
        }
    }

    return true;
}

function isHeaderContextArtifact(value: unknown): value is {
    type: string;
    document_key: string;
    artifact_class: string;
    file_type: string;
} {
    if (!isRecord(value)) return false;

    const requiredKeys: Array<{ key: string; typeCheck: (v: unknown) => boolean }> = [
        { key: 'type', typeCheck: (v) => v === 'header_context' },
        { key: 'document_key', typeCheck: (v) => v === 'header_context' },
        { key: 'artifact_class', typeCheck: (v) => typeof v === 'string' && v.length > 0 },
        { key: 'file_type', typeCheck: (v) => typeof v === 'string' && v.length > 0 },
    ];

    for (const { key, typeCheck } of requiredKeys) {
        if (!(key in value) || !typeCheck(value[key])) {
            return false;
        }
    }

    return true;
}

function isHeaderContextSystemMaterials(value: unknown): value is {
    stage_rationale: string;
    executive_summary: string;
    input_artifacts_summary: string;
    validation_checkpoint?: string[];
    quality_standards?: string[];
    diversity_rubric?: Record<string, string>;
    progress_update?: string;
} {
    if (!isRecord(value)) return false;

    const requiredKeys: Array<[string, (v: unknown) => boolean]> = [
        ['stage_rationale', (v) => typeof v === 'string'],
        ['executive_summary', (v) => typeof v === 'string'],
        ['input_artifacts_summary', (v) => typeof v === 'string'],
    ];

    for (const [key, check] of requiredKeys) {
        if (!(key in value) || !check(value[key])) {
            return false;
        }
    }

    if ('validation_checkpoint' in value && (!Array.isArray(value.validation_checkpoint) || !value.validation_checkpoint.every(item => typeof item === 'string'))) {
        return false;
    }

    if ('quality_standards' in value && (!Array.isArray(value.quality_standards) || !value.quality_standards.every(item => typeof item === 'string'))) {
        return false;
    }

    if ('diversity_rubric' in value) {
        const rubric = value.diversity_rubric;
        if (!isRecord(rubric)) {
            return false;
        }
        for (const rubricKey in rubric) {
            if (typeof rubric[rubricKey] !== 'string') {
                return false;
            }
        }
    }

    if ('progress_update' in value && typeof value.progress_update !== 'string') {
        return false;
    }

    return true;
}

export function isHeaderContext(value: unknown): value is ReturnType<typeof JSON.parse> {
    if (!isRecord(value)) return false;

    if (!('system_materials' in value) || !isHeaderContextSystemMaterials(value.system_materials)) {
        return false;
    }

    if (!('header_context_artifact' in value) || !isHeaderContextArtifact(value.header_context_artifact)) {
        return false;
    }

    if (!('context_for_documents' in value) || !isHeaderContextDocuments(value.context_for_documents)) {
        return false;
    }

    if ('files_to_generate' in value) {
        const files = value.files_to_generate;
        if (!Array.isArray(files) || !files.every(file => isRecord(file) && typeof file.template_filename === 'string' && typeof file.from_document_key === 'string' && isFileType(file.from_document_key))) {
            return false;
        }
    }

    return true;
}

// Helper type to represent the structure we're checking for.
type StageWithProcessingStrategy = Tables<'dialectic_stages'> & {
    input_artifact_rules: {
        processing_strategy: ProcessingStrategy;
    };
};

// Helper type to represent the structure we're checking for.
type StageWithStepsRecipe = Tables<'dialectic_stages'> & {
    input_artifact_rules: {
        steps: unknown[];
    };
};

export interface DialecticChunkMetadata {
  source_contribution_id: string;
  [key: string]: unknown; // Allow other properties
}

export function hasModelResultWithContributionId(results: unknown): results is { modelProcessingResult: { contributionId: string } } {
    if (!isRecord(results)) return false;
    if (!('modelProcessingResult' in results)) return false;

    const modelResult = results.modelProcessingResult;
    if (!isRecord(modelResult)) return false;
    if (!('contributionId' in modelResult)) return false;

    return typeof modelResult.contributionId === 'string';
}

/**
 * A true type guard that checks if a stage's input_artifact_rules contain a valid processing_strategy.
 * This function validates the structure at runtime to ensure type safety.
 * @param stage The dialectic_stages object to check.
 * @returns boolean indicating if the stage has a valid processing strategy.
 */
export function hasProcessingStrategy(stage: Tables<'dialectic_stages'>): stage is StageWithProcessingStrategy {
    if (stage.input_artifact_rules &&
        typeof stage.input_artifact_rules === 'object' &&
        !Array.isArray(stage.input_artifact_rules) &&
        stage.input_artifact_rules !== null &&
        'processing_strategy' in stage.input_artifact_rules) {
        
        const strategy = stage.input_artifact_rules.processing_strategy;
        if (strategy && 
            typeof strategy === 'object' && 
            strategy !== null &&
            'type' in strategy && 
            typeof strategy.type === 'string' &&
            strategy.type === 'task_isolation') {
            return true;
        }
    }
    return false;
}

export function hasStepsRecipe(stage: Tables<'dialectic_stages'>): stage is StageWithStepsRecipe {
    if (stage.input_artifact_rules &&
        isRecord(stage.input_artifact_rules) &&
        'steps' in stage.input_artifact_rules &&
        Array.isArray(stage.input_artifact_rules.steps)) {
        return true;
    }
    return false;
}

/**
 * Type guard to check if a value is a valid array of Citation objects.
 * A citation must have a 'text' property of type string.
 * It may optionally have a 'url' property of type string.
 * @param value The value to check.
 * @returns True if the value is a Citation[], false otherwise.
 */
export function isCitationsArray(value: unknown): value is { text: string; url?: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        'text' in item &&
        typeof item.text === 'string' &&
        (!('url' in item) || typeof item.url === 'string')
    )
  );
}

export function isContinuablePayload(payload: unknown): payload is {
    sessionId: string;
    projectId: string;
    model_id: string;
    stageSlug: string;
    iterationNumber: number;
    continueUntilComplete?: boolean;
    continuation_count?: number;
    walletId?: string;
    maxRetries?: number;
} {
    if (!isRecord(payload)) return false;
    return (
        typeof payload.sessionId === 'string' &&
        typeof payload.projectId === 'string' &&
        typeof payload.model_id === 'string' &&
        typeof payload.stageSlug === 'string' &&
        typeof payload.iterationNumber === 'number'
    );
}

export function isContributionType(value: string): value is ContributionType {
    return validContributionTypes.some((type) => type === value);
}

export function isDialecticChunkMetadata(obj: unknown): obj is DialecticChunkMetadata {
    if (!isRecord(obj)) return false;
    return (
        'source_contribution_id' in obj &&
        typeof obj.source_contribution_id === 'string'
    );
}

/**
 * A true type guard that safely checks if a record is a DialecticContribution
 * using runtime property inspection without any type casting.
 */
export function isDialecticContribution(record: unknown): record is DialecticContributionRow {
  //console.log('[isDialecticContribution] Starting validation for record:', JSON.stringify(record, null, 2));
  if (typeof record !== 'object' || record === null) {
    console.log('[isDialecticContribution] FAILED: Record is not an object or is null.');
    return false;
  }

  const checks: { key: keyof DialecticContributionRow, type: string, nullable?: boolean }[] = [
    // Non-nullable fields
    { key: 'id', type: 'string' },
    { key: 'created_at', type: 'string' },
    { key: 'edit_version', type: 'number' },
    { key: 'is_latest_edit', type: 'boolean' },
    { key: 'iteration_number', type: 'number' },
    { key: 'mime_type', type: 'string' },
    { key: 'session_id', type: 'string' },
    { key: 'stage', type: 'string' },
    { key: 'storage_bucket', type: 'string' },
    { key: 'storage_path', type: 'string' },
    { key: 'updated_at', type: 'string' },
    { key: 'is_header', type: 'boolean' },

    // Nullable fields
    { key: 'citations', type: 'object', nullable: true }, // Json can be object or null
    { key: 'contribution_type', type: 'string', nullable: true },
    { key: 'error', type: 'string', nullable: true },
    { key: 'file_name', type: 'string', nullable: true },
    { key: 'model_id', type: 'string', nullable: true },
    { key: 'model_name', type: 'string', nullable: true },
    { key: 'original_model_contribution_id', type: 'string', nullable: true },
    { key: 'processing_time_ms', type: 'number', nullable: true },
    { key: 'prompt_template_id_used', type: 'string', nullable: true },
    { key: 'raw_response_storage_path', type: 'string', nullable: true },
    { key: 'seed_prompt_url', type: 'string', nullable: true },
    { key: 'size_bytes', type: 'number', nullable: true },
    { key: 'target_contribution_id', type: 'string', nullable: true },
    { key: 'tokens_used_input', type: 'number', nullable: true },
    { key: 'tokens_used_output', type: 'number', nullable: true },
    { key: 'user_id', type: 'string', nullable: true },
    { key: 'source_prompt_resource_id', type: 'string', nullable: true },
  ];

  for (const check of checks) {
    const descriptor = Object.getOwnPropertyDescriptor(record, check.key);
    //console.log(`[isDialecticContribution] Checking key: '${check.key}', Exists: ${!!descriptor}`);
    if (!descriptor && !check.nullable) {
        console.log(`[isDialecticContribution] FAILED: Required key '${check.key}' is missing.`);
        return false;
    }

    if (descriptor) {
        const value = descriptor.value;
        const valueType = typeof value;
        //console.log(`[isDialecticContribution]   Value:`, value, `Type: ${valueType}, Expected: ${check.type}`);
        if (check.nullable && value === null) {
            //console.log(`[isDialecticContribution]   PASSED (nullable): Key '${check.key}' is null.`);
            continue;
        }

        if (valueType !== check.type) {
            console.log(`[isDialecticContribution]   FAILED: Key '${check.key}' has wrong type. Expected ${check.type}, got ${valueType}.`);
            return false;
        }
    } else if (!check.nullable) {
        console.log(`[isDialecticContribution] FAILED: Required key '${check.key}' is missing (second check).`);
        return false;
    }
  }

  console.log('[isDialecticContribution] PASSED: All checks passed.');
  return true;
}

export function isDialecticExecuteJobPayload(payload: unknown): payload is DialecticExecuteJobPayload {
    if (!isRecord(payload)) return false;

    // Check for the new contract
    const hasCanonicalParams = 'canonicalPathParams' in payload &&
        isRecord(payload.canonicalPathParams) &&
        'contributionType' in payload.canonicalPathParams &&
        typeof payload.canonicalPathParams.contributionType === 'string';

    // Check for the legacy property (which should NOT be present)
    const hasLegacyFileName = 'originalFileName' in payload;

    // The property is optional. If it exists, it must be valid. If it doesn't, that's OK.
    const hasValidRelationships = !('document_relationships' in payload) || 
                                  payload.document_relationships === undefined || 
                                  payload.document_relationships === null || 
                                  isDocumentRelationships(payload.document_relationships);

    return (
        payload.job_type === 'execute' &&
        (!('prompt_template_name' in payload) || payload.prompt_template_name === undefined || typeof payload.prompt_template_name === 'string') &&
        typeof payload.output_type === 'string' && validOutputTypes.has(payload.output_type) &&
        (!('step_info' in payload) || isDialecticStepInfo(payload.step_info)) &&
        isRecord(payload.inputs) &&
        hasCanonicalParams &&
        !hasLegacyFileName &&
        hasValidRelationships &&
        (!('document_key' in payload) || payload.document_key === undefined || (typeof payload.document_key === 'string' && isFileType(payload.document_key))) &&
        (!('branch_key' in payload) || payload.branch_key === undefined || (typeof payload.branch_key === 'string' && validBranchKeys.has(payload.branch_key))) &&
        (!('parallel_group' in payload) || payload.parallel_group === undefined || typeof payload.parallel_group === 'number') &&
        (!('planner_metadata' in payload) || payload.planner_metadata === undefined || payload.planner_metadata === null || isPlannerMetadata(payload.planner_metadata))
    );
}

/**
 * A type guard that checks if a JSON object conforms to the DialecticJobPayload interface.
 * It extends the validation for GenerateContributionsPayload by also checking for an optional prompt.
 * @param payload The JSON object to validate.
 * @returns boolean indicating if the payload is a valid DialecticJobPayload.
 */
export function isDialecticJobPayload(payload: unknown): payload is DialecticJobPayload {
    if (!isPlainObject(payload)) {
        return false;
    }

    if ('is_test_job' in payload) {
        return false;
    }

    const hasSessionId = 'sessionId' in payload && typeof payload.sessionId === 'string';
    const hasProjectId = 'projectId' in payload && typeof payload.projectId === 'string';
    
    const hasModelId = 'model_id' in payload && typeof payload.model_id === 'string';
    const hasSelectedModelIds = 'selectedModelIds' in payload && 
                              Array.isArray(payload.selectedModelIds) && 
                              payload.selectedModelIds.every(id => typeof id === 'string');

    if (!hasSessionId || !hasProjectId || (!hasModelId && !hasSelectedModelIds)) {
        return false;
    }

    // Optional fields
    if ('prompt' in payload && typeof payload.prompt !== 'string') {
        return false;
    }
    
    // Ensure that if other properties exist, they are of the correct type.
    // This part is crucial for robust validation beyond the required fields.
    const allowedKeys: (keyof DialecticJobPayload)[] = [
        'sessionId', 'projectId', 'model_id', 'stageSlug', 
        'iterationNumber', 'walletId', 'continueUntilComplete', 'maxRetries', 
        'continuation_count', 'target_contribution_id', 'job_type'
    ];

    for (const key in payload) {
        if (!allowedKeys.some(k => k === key)) {
            // If you want to be strict and reject unknown properties, you can return false here.
            // console.log(`Unknown key: ${key}`);
        }
    }
    
    return true;
}

export function isDialecticJobRow(record: unknown): record is DialecticJobRow {
    if (typeof record !== 'object' || record === null) {
      return false;
    }
  
    const checks: { key: keyof DialecticJobRow, type: string, nullable?: boolean }[] = [
      { key: 'id', type: 'string' },
      { key: 'session_id', type: 'string' },
      { key: 'stage_slug', type: 'string' },
      { key: 'iteration_number', type: 'number' },
      { key: 'status', type: 'string' },
      { key: 'payload', type: 'object' },
      { key: 'user_id', type: 'string' },
      { key: 'is_test_job', type: 'boolean' },
      { key: 'job_type', type: 'string' },
    ];
  
    for (const check of checks) {
      const descriptor = Object.getOwnPropertyDescriptor(record, check.key);
      if (!descriptor && !check.nullable) {
          return false;
      }
  
      if (descriptor) {
          const value = descriptor.value;
          const valueType = typeof value;
          if (check.nullable && value === null) {
              continue;
          }
          if (valueType !== check.type) {
              return false;
          }
      } else if (!check.nullable) {
          return false;
      }
    }
  
    return true;
}

export function isDialecticJobRowArray(arr: unknown): arr is DialecticJobRow[] {
    if (!Array.isArray(arr)) {
        return false;
    }
    // You can add more specific checks for each item if necessary,
    // for example, by calling a new 'isDialecticJobRow' guard.
    // For now, checking if it's an array is a good start.
    return arr.every(item => typeof item === 'object' && item !== null && 'id' in item && 'session_id' in item);
} 

export function isDialecticPlanJobPayload(payload: unknown): payload is DialecticPlanJobPayload {
    if (!isRecord(payload)) return false;
    return (
        payload.job_type === 'plan' &&
        isRecord(payload.step_info) &&
        typeof payload.step_info.current_step === 'number'
    );
}

export function isDialecticStageRecipe(value: unknown): value is DialecticStageRecipe {
    if (!isRecord(value)) return false;

    if (!isRecord(value.processing_strategy) || value.processing_strategy.type !== 'task_isolation') {
        return false;
    }

    if (!Array.isArray(value.steps) || value.steps.length === 0) {
        return false;
    }

    for (const step of value.steps) {
        if (!isRecord(step)) {
            return false;
        }

        if (typeof step.step !== 'number') {
            return false;
        }

        if (typeof step.name !== 'string' || step.name.length === 0) {
            return false;
        }

        if (typeof step.prompt_template_name !== 'string' || step.prompt_template_name.length === 0) {
            return false;
        }

        if (typeof step.granularity_strategy !== 'string') {
            return false;
        }

        if (typeof step.output_type !== 'string' || !validOutputTypes.has(step.output_type)) {
            return false;
        }

        if (!Array.isArray(step.inputs_required)) {
            return false;
        }

        for (const rule of step.inputs_required) {
            if (!isRecord(rule)) {
                return false;
            }

            if (typeof rule.type !== 'string') {
                return false;
            }

            if (rule.stage_slug !== undefined && typeof rule.stage_slug !== 'string') {
                return false;
            }

            if (rule.required !== undefined && typeof rule.required !== 'boolean') {
                return false;
            }

            const requiresDocumentKey = rule.type === 'header_context';

            if (requiresDocumentKey) {
                if (typeof rule.document_key !== 'string' || !isFileType(rule.document_key)) {
                    return false;
                }
            } else if (rule.document_key !== undefined && (typeof rule.document_key !== 'string' || !isFileType(rule.document_key))) {
                return false;
            }
        }

        if ('branch_key' in step && step.branch_key !== undefined) {
            if (typeof step.branch_key !== 'string' || !validBranchKeys.has(step.branch_key)) {
                return false;
            }
        }

        if ('parallel_group' in step && step.parallel_group !== undefined) {
            if (typeof step.parallel_group !== 'number' || step.parallel_group < 0) {
                return false;
            }
        }

        if ('outputs_required' in step) {
            const outputs = step.outputs_required;
            if (!isRecord(outputs)) {
                return false;
            }

            if ('system_materials' in outputs && !isHeaderContextSystemMaterials(outputs.system_materials)) {
                return false;
            }

            if ('header_context_artifact' in outputs && !isHeaderContextArtifact(outputs.header_context_artifact)) {
                return false;
            }

            if ('context_for_documents' in outputs && !isHeaderContextDocuments(outputs.context_for_documents)) {
                return false;
            }

            if ('documents' in outputs) {
                const documents = outputs.documents;
                if (!Array.isArray(documents)) {
                    return false;
                }
                for (const doc of documents) {
                    if (!isRecord(doc) || typeof doc.document_key !== 'string' || !isFileType(doc.document_key) || typeof doc.template_filename !== 'string') {
                        return false;
                    }
                }
            }

            if ('files_to_generate' in outputs) {
                const files = outputs.files_to_generate;
                if (!Array.isArray(files) || !files.every(file => isRecord(file) && typeof file.template_filename === 'string' && typeof file.from_document_key === 'string' && isFileType(file.from_document_key))) {
                    return false;
                }
            }
        }
    }

    return true;
}

export function isDialecticStepInfo(obj: unknown): obj is DialecticStepInfo {
    if (!isRecord(obj)) return false;
    if (typeof obj.current_step !== 'number' || typeof obj.total_steps !== 'number') {
        return false;
    }

    if ('step_key' in obj && obj.step_key !== undefined && typeof obj.step_key !== 'string') {
        return false;
    }

    if ('step_slug' in obj && obj.step_slug !== undefined && typeof obj.step_slug !== 'string') {
        return false;
    }

    if ('name' in obj && obj.name !== undefined && typeof obj.name !== 'string') {
        return false;
    }

    if ('prompt_template_name' in obj && obj.prompt_template_name !== undefined && typeof obj.prompt_template_name !== 'string') {
        return false;
    }

    if ('output_type' in obj && obj.output_type !== undefined && (typeof obj.output_type !== 'string' || !validOutputTypes.has(obj.output_type))) {
        return false;
    }

    if ('document_key' in obj && obj.document_key !== undefined && (typeof obj.document_key !== 'string' || !isFileType(obj.document_key))) {
        return false;
    }

    if ('branch_key' in obj && obj.branch_key !== undefined && (typeof obj.branch_key !== 'string' || !validBranchKeys.has(obj.branch_key))) {
        return false;
    }

    if ('parallel_group' in obj && obj.parallel_group !== undefined && typeof obj.parallel_group !== 'number') {
        return false;
    }

    if ('planner_metadata' in obj && obj.planner_metadata !== undefined && obj.planner_metadata !== null && !isPlannerMetadata(obj.planner_metadata)) {
        return false;
    }

    return true;
}

export function isDocumentRelationships(obj: unknown): obj is DocumentRelationships {
    if (!isRecord(obj)) {
        return false;
    }

    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const value = obj[key];

        if (key === 'isContinuation') {
            if (typeof value !== 'boolean') {
                console.log(`[isDocumentRelationships] FAILED: Key 'isContinuation' has invalid value:`, value);
                return false;
            }
            continue;
        }

        if (key === 'turnIndex') {
            if (typeof value !== 'number') {
                console.log(`[isDocumentRelationships] FAILED: Key 'turnIndex' has invalid value:`, value);
                return false;
            }
            continue;
        }

        // Stage-slug keys must map to a contribution id string or null
        if (typeof value !== 'string' && value !== null) {
            console.log(`[isDocumentRelationships] FAILED: Stage key '${key}' has invalid value:`, value);
            return false;
        }
    }
    return true;
}

export function isFailedAttemptError(record: unknown): record is FailedAttemptError {
    if (!isRecord(record)) return false;
    return (
        'error' in record && typeof record.error === 'string' &&
        'modelId' in record && typeof record.modelId === 'string' &&
        'api_identifier' in record && typeof record.api_identifier === 'string'
    );
}

export function isFailedAttemptErrorArray(records: unknown): records is FailedAttemptError[] {
    return Array.isArray(records) && records.every(isFailedAttemptError);
}

// Type guard for our specific insert payload, written without any type casting.
export function isJobInsert(item: unknown): item is JobInsert {
    if (typeof item !== 'object' || item === null) {
        return false;
    }

    if ('is_test_job' in item && typeof item.is_test_job !== 'boolean' && typeof item.is_test_job !== 'undefined') {
        return false;
    }

    if (!('job_type' in item) || typeof item.job_type !== 'string') {
        return false;
    }

    const payloadDescriptor = Object.getOwnPropertyDescriptor(item, 'payload');
    if (!payloadDescriptor) return false;

    const payloadValue = payloadDescriptor.value;
    if (typeof payloadValue !== 'object' || payloadValue === null) return false;

    const modelIdDescriptor = Object.getOwnPropertyDescriptor(payloadValue, 'model_id');
    if (!modelIdDescriptor) return false;

    const modelIdValue = modelIdDescriptor.value;
    if (typeof modelIdValue !== 'string') return false;

    return true;
}

export function isJobResultsWithModelProcessing(results: unknown): results is JobResultsWithModelProcessing {
    if (typeof results !== 'object' || results === null || !('modelProcessingResults' in results)) {
        return false;
    }
    const { modelProcessingResults } = results;
    if (!Array.isArray(modelProcessingResults)) {
        return false;
    }
    
    return modelProcessingResults.every(isModelProcessingResult);
}

export function isModelProcessingResult(record: unknown): record is ModelProcessingResult {
    if (typeof record !== 'object' || record === null) {
        return false;
    }

    const checks: { key: keyof ModelProcessingResult, type: string, nullable?: boolean }[] = [
        { key: 'modelId', type: 'string' },
        { key: 'status', type: 'string' },
        { key: 'attempts', type: 'number' },
        { key: 'contributionId', type: 'string', nullable: true },
        { key: 'error', type: 'string', nullable: true },
    ];

    for (const check of checks) {
        const descriptor = Object.getOwnPropertyDescriptor(record, check.key);

        if (!descriptor) {
            if (check.nullable) continue;
            return false;
        }

        const value = descriptor.value;

        if (check.nullable && (value === null || typeof value === 'undefined')) {
            continue;
        }

        if (typeof value !== check.type) {
            return false;
        }
        
        if (check.key === 'status') {
            if (!['completed', 'failed', 'needs_continuation'].includes(value)) {
                return false;
            }
        }
    }
    return true;
}

export function isPlanJobInsert(item: unknown): item is PlanJobInsert {
    if (!isJobInsert(item)) return false;

    if (item.job_type !== 'PLAN') return false;

    const payload = item.payload;

    if (typeof payload !== 'object' || payload === null) return false;

    if (!('job_type' in payload) || payload.job_type !== 'PLAN') return false;

    if (!('step_info' in payload) || typeof payload.step_info !== 'object' || payload.step_info === null) return false;

    const stepInfo = payload.step_info;
    if (!('current_step' in stepInfo) || typeof stepInfo.current_step !== 'number') return false;
    if (!('total_steps' in stepInfo) || typeof stepInfo.total_steps !== 'number') return false;
    if (!('status' in stepInfo) || typeof stepInfo.status !== 'string') return false;

    return true;
}
// Validation function that safely converts Json to DialecticJobPayload
export function validatePayload(payload: Json): DialecticJobPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload must be a valid object');
  }
  
  // Use proper type narrowing without casting
  if (!('sessionId' in payload) || typeof payload.sessionId !== 'string') {
    throw new Error('sessionId must be a string');
  }
  if (!('projectId' in payload) || typeof payload.projectId !== 'string') {
    throw new Error('projectId must be a string');
  }
  if (!('walletId' in payload) || typeof payload.walletId !== 'string' || payload.walletId.trim() === '') {
    throw new Error('walletId must be a string');
  }
  
  const hasModelId = 'model_id' in payload && typeof payload.model_id === 'string';

  if (!hasModelId) {
    throw new Error('Payload must have model_id (string)');
  }

  // Build the validated payload with proper types
  const validatedPayload: DialecticJobPayload = {
    sessionId: payload.sessionId,
    projectId: payload.projectId,
    model_id: ('model_id' in payload && typeof payload.model_id === 'string') ? payload.model_id : '',
    stageSlug: ('stageSlug' in payload && typeof payload.stageSlug === 'string') ? payload.stageSlug : undefined,
    iterationNumber: ('iterationNumber' in payload && typeof payload.iterationNumber === 'number') ? payload.iterationNumber : undefined,
    walletId: payload.walletId,
    continueUntilComplete: ('continueUntilComplete' in payload && typeof payload.continueUntilComplete === 'boolean') ? payload.continueUntilComplete : undefined,
    maxRetries: ('maxRetries' in payload && typeof payload.maxRetries === 'number') ? payload.maxRetries : undefined,
    continuation_count: ('continuation_count' in payload && typeof payload.continuation_count === 'number') ? payload.continuation_count : undefined,
    target_contribution_id: ('target_contribution_id' in payload && typeof payload.target_contribution_id === 'string') ? payload.target_contribution_id : undefined,
  };
  
  return validatedPayload;
}
