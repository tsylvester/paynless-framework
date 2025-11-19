// supabase/functions/_shared/utils/type_guards.ts
import type { Tables, Json } from "../../../types_db.ts";
import { Constants } from "../../../types_db.ts";
import { 
    DialecticContributionRow, 
    DialecticJobPayload,
    DialecticJobRow,
    JobResultsWithModelProcessing,
    ModelProcessingResult,
    DialecticPlanJobPayload,
    DialecticExecuteJobPayload,
    ContributionType,
    DocumentRelationships,
    JobInsert,
    PlanJobInsert,
    FailedAttemptError,
    DialecticStepPlannerMetadata,
    BranchKey,
    StageWithRecipeSteps,
    DialecticRecipeStep,
    DatabaseRecipeSteps,
    PromptType,
    PromptTypes,
    GranularityStrategy,
    GranularityStrategies,
    InputRule,
    RelevanceRule,
    OutputRule,
    DialecticStageRecipeStep,
    JobType,
    SystemMaterials,
    HeaderContextArtifact,
    ContextForDocument,
    RenderedDocumentArtifact,
    AssembledJsonArtifact,
    ReviewMetadata,
    EditedDocumentResource,
    SaveContributionEditSuccessResponse,
    DialecticProjectResourceRow,
} from '../../../dialectic-service/dialectic.interface.ts';
import { isPlainObject, isRecord } from './type_guards.common.ts';
import { FileType } from '../../types/file_manager.types.ts';
import { isFileType } from './type_guards.file_manager.ts';
import { ContinueReason } from "../../types.ts";
import { isContinueReason } from './type_guards.chat.ts';

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
];

const validBranchKeys = new Set<string>(Object.values(BranchKey));

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

export function isHeaderContextArtifact(value: unknown): value is HeaderContextArtifact {
    if (!isRecord(value)) return false;

    return (
        'type' in value && value.type === 'header_context' &&
        'document_key' in value && value.document_key === 'header_context' &&
        'artifact_class' in value && value.artifact_class === 'header_context' &&
        'file_type' in value && value.file_type === 'json'
    );
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

function isDialecticRecipeStep(step: unknown): step is DialecticRecipeStep {
    if (!isRecord(step)) return false;

    const templateChecks: (keyof Tables<'dialectic_recipe_template_steps'>)[] = [
        'id', 'template_id', 'job_type', 'created_at', 'updated_at', 'step_number', 
        'step_key', 'step_slug', 'step_name', 'output_type', 'granularity_strategy', 
        'inputs_required', 'inputs_relevance', 'outputs_required', 'prompt_type'
    ];
    const instanceChecks: (keyof Tables<'dialectic_stage_recipe_steps'>)[] = [
        'id', 'instance_id', 'job_type', 'created_at', 'updated_at', 'step_key', 
        'step_slug', 'step_name', 'output_type', 'granularity_strategy', 
        'inputs_required', 'inputs_relevance', 'outputs_required', 'prompt_type'
    ];

    const hasTemplateKeys = templateChecks.every(key => key in step);
    const hasInstanceKeys = instanceChecks.every(key => key in step);

    return hasTemplateKeys || hasInstanceKeys;
}

function isDialecticStage(record: unknown): record is Tables<'dialectic_stages'> {
    if (!isRecord(record)) return false;
    const requiredKeys: (keyof Tables<'dialectic_stages'>)[] = [
        'id', 'slug', 'display_name', 'created_at', 'expected_output_template_ids'
    ];
    return requiredKeys.every(key => key in record);
}

function isDialecticStageRecipeInstance(record: unknown): record is Tables<'dialectic_stage_recipe_instances'> {
    if (!isRecord(record)) return false;
    const requiredKeys: (keyof Tables<'dialectic_stage_recipe_instances'>)[] = [
        'id', 'stage_id', 'template_id', 'created_at', 'updated_at'
    ];
    return requiredKeys.every(key => key in record);
}

function isDbDialecticStageRecipeStep(record: unknown): record is Tables<'dialectic_stage_recipe_steps'> {
    if (!isRecord(record)) return false;
    const requiredKeys: (keyof Tables<'dialectic_stage_recipe_steps'>)[] = [
        'id', 'instance_id', 'job_type', 'step_key', 'created_at', 'updated_at', 'granularity_strategy', 'output_type'
    ];
    return requiredKeys.every(key => key in record);
}

/**
 * A true type guard that checks if a stage has a valid, non-empty array of recipe steps
 * that are logically linked to the stage itself.
 * @param data The unknown object to check.
 * @returns boolean indicating if the object is a valid StageWithRecipeSteps.
 */
export function isStageWithRecipeSteps(data: unknown): data is StageWithRecipeSteps {
    if (!isRecord(data)) return false;

    if (!('dialectic_stage' in data) || !isDialecticStage(data.dialectic_stage)) {
        return false;
    }

    if (!('dialectic_stage_recipe_instances' in data) || !isDialecticStageRecipeInstance(data.dialectic_stage_recipe_instances)) {
        return false;
    }

    if (!('dialectic_stage_recipe_steps' in data) || !Array.isArray(data.dialectic_stage_recipe_steps) || !data.dialectic_stage_recipe_steps.every(isDialecticStageRecipeStep)) {
        return false;
    }

    return true;
}

export function isDatabaseRecipeSteps(data: unknown): data is DatabaseRecipeSteps {
    if (!isRecord(data) || !isDialecticStage(data)) {
        return false;
    }

    if (!('dialectic_stage_recipe_instances' in data)) {
        return false;
    }

    const instances = Array.isArray(data.dialectic_stage_recipe_instances) 
        ? data.dialectic_stage_recipe_instances 
        : [data.dialectic_stage_recipe_instances];

    for (const instance of instances) {
        if (!isDialecticStageRecipeInstance(instance)) {
            return false;
        }
        if (!('dialectic_stage_recipe_steps' in instance) || !Array.isArray(instance.dialectic_stage_recipe_steps) || !instance.dialectic_stage_recipe_steps.every(isDbDialecticStageRecipeStep)) {
            return false;
        }
    }

    return true;
}

/**
 * A type guard to check if a string is a valid DialecticJobTypeEnum value.
 * @param value The string to check.
 * @returns boolean indicating if the string is a valid job type enum.
 */
export function isJobTypeEnum(value: string): value is JobType {
    return Constants.public.Enums.dialectic_job_type_enum.some(enumValue => enumValue === value);
}

export function isPromptType(value: unknown): value is PromptType {
    if (typeof value !== 'string') return false;
    return PromptTypes.some(v => v === value);
}

export function isGranularityStrategy(value: unknown): value is GranularityStrategy {
    if (typeof value !== 'string') return false;
    return GranularityStrategies.some(v => v === value);
}

export function isInputRule(value: unknown): value is InputRule {
    if (!isRecord(value)) return false;

    if (typeof value.slug !== 'string') return false;
    if (typeof value.type !== 'string' || !['document', 'feedback', 'header_context', 'seed_prompt', 'project_resource'].includes(value.type)) return false;

    if ('document_key' in value) {
        // Recipe documents can introduce new keys at runtime; ensure we only enforce non-empty strings.
        if (typeof value.document_key !== 'string' || value.document_key.length === 0) {
            return false;
        }
    }

    if ('required' in value && typeof value.required !== 'boolean') return false;
    if ('multiple' in value && typeof value.multiple !== 'boolean') return false;

    return true;
}

export function isInputRuleArray(value: unknown): value is InputRule[] {
    return Array.isArray(value) && value.every(isInputRule);
}

export function isRelevanceRule(value: unknown): value is RelevanceRule {
    if (!isRecord(value)) return false;

    // Relevance rules track recipe-driven document identifiers; treat them as opaque strings.
    if (typeof value.document_key !== 'string' || value.document_key.length === 0) {
        return false;
    }

    if (typeof value.relevance !== 'number') {
        return false;
    }

    if ('type' in value && value.type !== null && typeof value.type !== 'string') {
        return false;
    }

    if ('slug' in value && value.slug !== null && typeof value.slug !== 'string') {
        return false;
    }

    if ('stage_slug' in value && typeof value.stage_slug !== 'string') {
        return false;
    }

    return true;
}

export function isRelevanceRuleArray(value: unknown): value is RelevanceRule[] {
    return Array.isArray(value) && value.every(isRelevanceRule);
}

export function isEditedDocumentResource(value: unknown): value is EditedDocumentResource {
    if (!isRecord(value)) return false;

    if (typeof value.id !== 'string') return false;
    if (value.resource_type !== null && typeof value.resource_type !== 'string') return false;
    if (value.project_id !== null && typeof value.project_id !== 'string') return false;
    if (value.session_id !== null && typeof value.session_id !== 'string') return false;
    if (value.stage_slug !== null && typeof value.stage_slug !== 'string') return false;
    if (value.iteration_number !== null && typeof value.iteration_number !== 'number') return false;
    if (value.document_key !== null) {
        if (typeof value.document_key !== 'string' || !isFileType(value.document_key)) {
            return false;
        }
    }
    if (value.source_contribution_id !== null && typeof value.source_contribution_id !== 'string') return false;
    if (typeof value.storage_bucket !== 'string') return false;
    if (typeof value.storage_path !== 'string') return false;
    if (typeof value.file_name !== 'string') return false;
    if (typeof value.mime_type !== 'string') return false;
    if (typeof value.size_bytes !== 'number') return false;
    if (typeof value.created_at !== 'string') return false;
    if (typeof value.updated_at !== 'string') return false;

    return true;
}

export function isDialecticProjectResourceRow(value: unknown): value is DialecticProjectResourceRow {
    if (!isRecord(value)) return false;

    const requiredStringKeys: Array<keyof DialecticProjectResourceRow> = [
        'id',
        'project_id',
        'storage_bucket',
        'storage_path',
        'mime_type',
        'created_at',
        'updated_at',
    ];

    for (const key of requiredStringKeys) {
        if (typeof value[key] !== 'string') {
            return false;
        }
    }

    if (value.user_id !== null && typeof value.user_id !== 'string') return false;
    if (value.file_name !== null && typeof value.file_name !== 'string') return false;
    if (value.resource_type !== null && typeof value.resource_type !== 'string') return false;
    if (value.session_id !== null && typeof value.session_id !== 'string') return false;
    if (value.stage_slug !== null && typeof value.stage_slug !== 'string') return false;
    if (value.iteration_number !== null && typeof value.iteration_number !== 'number') return false;
    if (value.size_bytes !== null && typeof value.size_bytes !== 'number') return false;
    if (value.source_contribution_id !== null && typeof value.source_contribution_id !== 'string') return false;

    return 'resource_description' in value;
}

export function isObjectWithOptionalId(value: unknown): value is { id?: string } {
    if (!isRecord(value)) return false;
    if (!('id' in value)) return true;
    const { id } = value;
    return typeof id === 'string' || typeof id === 'undefined';
}

export function isArrayWithOptionalId(value: unknown): value is Array<{ id?: string }> {
    return Array.isArray(value) && value.every(isObjectWithOptionalId);
}

export function isSaveContributionEditSuccessResponse(value: unknown): value is SaveContributionEditSuccessResponse {
    if (!isRecord(value)) return false;
    if (typeof value.sourceContributionId !== 'string') return false;
    if (!('resource' in value) || !isEditedDocumentResource(value.resource)) return false;
    return true;
}

export function isReviewMetadata(value: unknown): value is ReviewMetadata {
    if (!isRecord(value)) return false;

    if (!isRecord(value.proposal_identifier) || typeof value.proposal_identifier.lineage_key !== 'string' || typeof value.proposal_identifier.source_model_slug !== 'string') {
        return false;
    }
    if (typeof value.proposal_summary !== 'string') return false;
    if (!Array.isArray(value.review_focus) || !value.review_focus.every(item => typeof item === 'string')) {
        return false;
    }
    if (!Array.isArray(value.user_constraints) || !value.user_constraints.every(item => typeof item === 'string')) {
        return false;
    }
    if (!isRecord(value.normalization_guidance) || typeof value.normalization_guidance.scoring_scale !== 'string' || !Array.isArray(value.normalization_guidance.required_dimensions) || !value.normalization_guidance.required_dimensions.every(item => typeof item === 'string')) {
        return false;
    }

    return true;
}

export function isSystemMaterials(value: unknown): value is SystemMaterials {
    if (!isRecord(value)) return false;

    // Planner payloads often omit the prose fields that execution steps use; gate only on type correctness when present.
    if ('stage_rationale' in value && typeof value.stage_rationale !== 'string') {
        return false;
    }

    if ('executive_summary' in value && typeof value.executive_summary !== 'string') {
        return false;
    }

    if ('input_artifacts_summary' in value && typeof value.input_artifacts_summary !== 'string') {
        return false;
    }

    if ('files_to_generate' in value && value.files_to_generate !== undefined) {
        const files = value.files_to_generate;
        if (!Array.isArray(files) || !files.every(file => isRecord(file) && typeof file.template_filename === 'string' && typeof file.from_document_key === 'string')) {
            return false;
        }
    }

    if ('validation_checkpoint' in value && value.validation_checkpoint !== undefined && (!Array.isArray(value.validation_checkpoint) || !value.validation_checkpoint.every(item => typeof item === 'string'))) {
        return false;
    }

    if ('quality_standards' in value && value.quality_standards !== undefined && (!Array.isArray(value.quality_standards) || !value.quality_standards.every(item => typeof item === 'string'))) {
        return false;
    }

    if ('diversity_rubric' in value && value.diversity_rubric !== undefined) {
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

    if ('progress_update' in value && value.progress_update !== undefined && typeof value.progress_update !== 'string') {
        return false;
    }

    return true;
}

export function isContextForDocument(value: unknown): value is ContextForDocument {
    if (!isRecord(value)) return false;

    return (
        // Document keys are dynamic per recipe; only require non-empty strings.
        'document_key' in value && typeof value.document_key === 'string' && value.document_key.length > 0 &&
        'content_to_include' in value && (isRecord(value.content_to_include) || Array.isArray(value.content_to_include))
    );
}
export function isContextForDocumentArray(value: unknown): value is ContextForDocument[] {
    return Array.isArray(value) && value.every(isContextForDocument);
}

export function isRenderedDocumentArtifact(value: unknown): value is RenderedDocumentArtifact {
    if (!isRecord(value)) return false;

    return (
        'artifact_class' in value && value.artifact_class === 'rendered_document' &&
        // Rendered artifacts may target dynamic document identifiers; accept any non-empty string.
        'document_key' in value && typeof value.document_key === 'string' && value.document_key.length > 0 &&
        'template_filename' in value && typeof value.template_filename === 'string' &&
        (!('content_to_include' in value) || (isRecord(value.content_to_include) || Array.isArray(value.content_to_include)))
    );
}

export function isRenderedDocumentArtifactArray(value: unknown): value is RenderedDocumentArtifact[] {
    return Array.isArray(value) && value.every(isRenderedDocumentArtifact);
}

export function isAssembledJsonArtifact(value: unknown): value is AssembledJsonArtifact {
    if (!isRecord(value)) return false;

    if (!('artifact_class' in value) || (value.artifact_class !== 'assembled_document_json' && value.artifact_class !== 'assembled_json')) {
        return false;
    }

    // Assembled JSON artifacts follow the same dynamic naming as the rendered counterparts.
    if (!('document_key' in value) || typeof value.document_key !== 'string' || value.document_key.length === 0) {
        return false;
    }

    const hasFields = 'fields' in value && Array.isArray(value.fields) && value.fields.every(item => typeof item === 'string');
    const hasTemplate = 'template_filename' in value && typeof value.template_filename === 'string' && 'content_to_include' in value && 'file_type' in value && value.file_type === 'json';

    if (hasFields && hasTemplate) return false;
    
    if(hasFields) {
        return !('template_filename' in value) && !('content_to_include' in value) && !('file_type' in value);
    }

    if(hasTemplate) {
        return !('fields' in value);
    }

    return false;
}

export function isAssembledJsonArtifactArray(value: unknown): value is AssembledJsonArtifact[] {
    return Array.isArray(value) && value.every(isAssembledJsonArtifact);
}

export function isOutputRule(value: unknown): value is OutputRule {
    if (!isRecord(value)) return false;

    if ('system_materials' in value && value.system_materials !== undefined && !isSystemMaterials(value.system_materials)) {
        return false;
    }

    if ('header_context_artifact' in value && value.header_context_artifact !== undefined && !isHeaderContextArtifact(value.header_context_artifact)) {
        return false;
    }

    if ('context_for_documents' in value && value.context_for_documents !== undefined && !isContextForDocumentArray(value.context_for_documents)) {
        return false;
    }

    if ('documents' in value && value.documents !== undefined) {
        if (!Array.isArray(value.documents)) return false;
        if (!value.documents.every(doc => isRenderedDocumentArtifact(doc) || isAssembledJsonArtifact(doc))) return false;
    }

    if ('assembled_json' in value && value.assembled_json !== undefined && !isAssembledJsonArtifactArray(value.assembled_json)) {
        return false;
    }

    if ('review_metadata' in value && value.review_metadata !== undefined && !isReviewMetadata(value.review_metadata)) {
        return false;
    }

    return true;
}

/**
 * A true type guard that checks if an object is a dialectic recipe step
 * and has a `job_type` of 'PLAN'.
 * @param step The unknown object to check.
 * @returns boolean indicating if the object is a DialecticRecipeStep with a 'PLAN' job type.
 */
export function hasProcessingStrategy(step: unknown): step is DialecticRecipeStep {
    if (!isDialecticRecipeStep(step)) return false;

    if (typeof step.job_type !== 'string' || !isJobTypeEnum(step.job_type)) {
        return false;
    }
    
    return step.job_type === 'PLAN';
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
    { key: 'document_relationships', type: 'object', nullable: true }, // Added check

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

export function isDialecticStageRecipeStep(record: unknown): record is DialecticStageRecipeStep {
    if (!isRecord(record)) return false;

    const requiredStringKeys: (keyof DialecticStageRecipeStep)[] = ['id', 'created_at', 'updated_at', 'instance_id', 'step_key', 'step_slug', 'step_name'];
    for (const key of requiredStringKeys) {
        if (typeof record[key] !== 'string') return false;
    }

    // --- Nullable properties from DB schema ---
    if (record.branch_key !== null && typeof record.branch_key !== 'string') return false;
    if (record.execution_order !== null && typeof record.execution_order !== 'number') return false;
    if (record.parallel_group !== null && typeof record.parallel_group !== 'number') return false;
    if (record.prompt_template_id !== null && typeof record.prompt_template_id !== 'string') return false;
    if (record.step_description !== null && typeof record.step_description !== 'string') return false;
    if (record.template_step_id !== null && typeof record.template_step_id !== 'string') return false;
    
    if (typeof record.is_skipped !== 'boolean') return false;

    if (typeof record.job_type !== 'string' || !isJobTypeEnum(record.job_type)) return false;
    if (!isPromptType(record.prompt_type)) return false;
    if (!isGranularityStrategy(record.granularity_strategy)) return false;
    // Output types are coupled to recipe document identifiers; accept any non-empty string.
    if (typeof record.output_type !== 'string' || record.output_type.length === 0) return false;

    if (!isInputRuleArray(record.inputs_required)) return false;
    if (!isRelevanceRuleArray(record.inputs_relevance)) return false;
    if (!isOutputRule(record.outputs_required)) return false;

    // Check for existence of other Json properties inherited from the DB type
    if (!('config_override' in record)) return false;
    if (!('object_filter' in record)) return false;
    if (!('output_overrides' in record)) return false;

    return true;
}

export function isDialecticExecuteJobPayload(payload: unknown): payload is DialecticExecuteJobPayload {
    if (!isRecord(payload)) {
        throw new Error('Payload must be a non-null object.');
    }

    // Base Payload Checks
    if (!('sessionId' in payload) || typeof payload.sessionId !== 'string') throw new Error('Missing or invalid sessionId.');
    if (!('projectId' in payload) || typeof payload.projectId !== 'string') throw new Error('Missing or invalid projectId.');
    if (!('model_id' in payload) || typeof payload.model_id !== 'string') throw new Error('Missing or invalid model_id.');
    if (!('walletId' in payload) || typeof payload.walletId !== 'string') throw new Error('Missing or invalid walletId.');
    if (!('stageSlug' in payload) || typeof payload.stageSlug !== 'string') throw new Error('Invalid stageSlug.');
    if (!('iterationNumber' in payload) || typeof payload.iterationNumber !== 'number') throw new Error('Invalid iterationNumber.');
    if (!('user_jwt' in payload) || typeof payload.user_jwt !== 'string' || payload.user_jwt.length === 0) throw new Error('Missing or invalid user_jwt.');

    // Required ExecuteJobPayload properties
    if (payload.job_type !== 'execute') throw new Error("Invalid job_type: expected 'execute'");
    if (!('output_type' in payload) || !isFileType(payload.output_type)) throw new Error('Missing or invalid output_type.');
    if (!('canonicalPathParams' in payload) || !isRecord(payload.canonicalPathParams) || !('contributionType' in payload.canonicalPathParams)) throw new Error('Missing or invalid canonicalPathParams.');
    if (!('inputs' in payload) || !isRecord(payload.inputs)) throw new Error('Missing or invalid inputs.');

    // Optional/Nullable properties
    if (('prompt_template_name' in payload) && typeof payload.prompt_template_name !== 'string') throw new Error('Invalid prompt_template_name.');
    if (('document_key' in payload) && payload.document_key !== null && typeof payload.document_key !== 'string') throw new Error('Invalid document_key.');
    if (('branch_key' in payload) && payload.branch_key !== null && (typeof payload.branch_key !== 'string' || !validBranchKeys.has(payload.branch_key))) throw new Error('Invalid branch_key.');
    if (('parallel_group' in payload) && payload.parallel_group !== null && typeof payload.parallel_group !== 'number') throw new Error('Invalid parallel_group.');
    if (('planner_metadata' in payload) && payload.planner_metadata !== null && !isPlannerMetadata(payload.planner_metadata)) throw new Error('Invalid planner_metadata.');
    if (('document_relationships' in payload) && payload.document_relationships !== null && !isDocumentRelationships(payload.document_relationships)) throw new Error('Invalid document_relationships.');
    if (('isIntermediate' in payload) && typeof payload.isIntermediate !== 'boolean') throw new Error('Invalid isIntermediate flag.');
    if (('target_contribution_id' in payload) && typeof payload.target_contribution_id !== 'string') throw new Error('Invalid target_contribution_id.');
    if (('sourceContributionId' in payload) && payload.sourceContributionId !== null && typeof payload.sourceContributionId !== 'string') throw new Error('Invalid sourceContributionId.');
    if (('model_slug' in payload) && typeof payload.model_slug !== 'string') throw new Error('Invalid model_slug.');

    // Legacy property check
    if ('originalFileName' in payload) throw new Error('Legacy property originalFileName is not allowed.');

    // Final check for extraneous properties to enforce a strict shape.
    const allowedKeys = new Set<string>([
        'sessionId', 'projectId', 'model_id', 'walletId', 'stageSlug', 'iterationNumber',
        'job_type', 'output_type', 'canonicalPathParams', 'inputs', 'prompt_template_id',
        'sourceContributionId', 'document_key', 'branch_key', 'parallel_group', 'planner_metadata',
        'document_relationships', 'isIntermediate', 'user_jwt', 'target_contribution_id',
        // Base job payload fields that may be present on execute jobs
        'continueUntilComplete', 'maxRetries', 'continuation_count', 'is_test_job', 'model_slug'
    ]);

    const unknownKeys = Object.keys(payload).filter(key => !allowedKeys.has(key));

    if (unknownKeys.length > 0) {
        throw new Error(`Payload contains unknown properties: ${unknownKeys.join(', ')}`);
    }

    return true;
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
    if ('model_slug' in payload && typeof payload.model_slug !== 'string') {
        return false;
    }
    
    // Ensure that if other properties exist, they are of the correct type.
    // This part is crucial for robust validation beyond the required fields.
    const allowedKeys: (keyof DialecticJobPayload)[] = [
        'sessionId', 'projectId', 'model_id', 'stageSlug', 
        'iterationNumber', 'walletId', 'continueUntilComplete', 'maxRetries', 
        'continuation_count', 'target_contribution_id', 'job_type', 'model_slug'
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
      { key: 'created_at', type: 'string' },
      { key: 'session_id', type: 'string' },
      { key: 'stage_slug', type: 'string' },
      { key: 'iteration_number', type: 'number' },
      { key: 'status', type: 'string' },
      { key: 'payload', type: 'object' },
      { key: 'user_id', type: 'string' },
      { key: 'is_test_job', type: 'boolean' },
      { key: 'attempt_count', type: 'number' },
      { key: 'max_retries', type: 'number' },
      
      // Nullable fields
      { key: 'job_type', type: 'string', nullable: true },
      { key: 'parent_job_id', type: 'string', nullable: true },
      { key: 'prerequisite_job_id', type: 'string', nullable: true },
      { key: 'target_contribution_id', type: 'string', nullable: true },
      { key: 'started_at', type: 'string', nullable: true },
      { key: 'completed_at', type: 'string', nullable: true },
      { key: 'results', type: 'object', nullable: true },
      { key: 'error_details', type: 'object', nullable: true },
    ];
  
    if (!isRecord(record)) {
        return false;
    }

    for (const check of checks) {
      if (!(check.key in record)) {
        return false;
      }
      const value = record[check.key];
      
      if (check.nullable && value === null) {
          continue;
      }

      if (typeof value !== check.type) {
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
    if (payload.job_type !== 'PLAN') return false;
    if (!('user_jwt' in payload)) return false;
    if (typeof payload.user_jwt !== 'string') return false;
    if (payload.user_jwt.length === 0) return false;
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
    user_jwt: ('user_jwt' in payload && typeof payload.user_jwt === 'string') ? payload.user_jwt : '',
  };
  
  return validatedPayload;
}

export type DialecticContinueReason = ContinueReason | 'next_document' | 'tool_calls' | 'function_call' | 'content_filter';

export function isDialecticContinueReason(reason: unknown): reason is DialecticContinueReason {
    if (isContinueReason(reason)) {
        return true;
    }

    const dialecticReasons: readonly string[] = ['next_document', 'tool_calls', 'function_call', 'content_filter'];
    
    if (typeof reason === 'string') {
        return dialecticReasons.includes(reason);
    }

    return false;
}


