// supabase/functions/_shared/utils/type_guards.ts
import type { Database, Tables, Json } from "../../types_db.ts";
import type { 
    ProcessingStrategy, 
    DialecticContributionRow, 
    DialecticJobPayload,
    DialecticJobRow,
    JobResultsWithModelProcessing,
    ModelProcessingResult,
    DialecticStageRecipe,
    DialecticPlanJobPayload,
    DialecticExecuteJobPayload,
    DialecticRecipeStep,
    DialecticStepInfo,
    ContributionType,
    DocumentRelationships,
} from '../../dialectic-service/dialectic.interface.ts';
import { FileType, CanonicalPathParams } from "../types/file_manager.types.ts";
import { ProjectContext, StageContext } from "../prompt-assembler.interface.ts";
import { FailedAttemptError } from "../../dialectic-service/dialectic.interface.ts";
import { AiModelExtendedConfig, TokenUsage, ChatMessageRole, ChatInsert, ContinueReason, FinishReason, ChatApiRequest, Messages } from "../types.ts";
import type { PostgrestError } from "npm:@supabase/supabase-js@2";

// Helper type to represent the structure we're checking for.
type StageWithProcessingStrategy = Tables<'dialectic_stages'> & {
    input_artifact_rules: {
        processing_strategy: ProcessingStrategy;
    };
};

// Helper type for the citations array
export type Citation = {
  text: string;
  url?: string;
};

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
    walletId: ('walletId' in payload && typeof payload.walletId === 'string') ? payload.walletId : undefined,
    continueUntilComplete: ('continueUntilComplete' in payload && typeof payload.continueUntilComplete === 'boolean') ? payload.continueUntilComplete : undefined,
    maxRetries: ('maxRetries' in payload && typeof payload.maxRetries === 'number') ? payload.maxRetries : undefined,
    continuation_count: ('continuation_count' in payload && typeof payload.continuation_count === 'number') ? payload.continuation_count : undefined,
    target_contribution_id: ('target_contribution_id' in payload && typeof payload.target_contribution_id === 'string') ? payload.target_contribution_id : undefined,
  };
  
  return validatedPayload;
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

export function isStageContext(obj: unknown): obj is StageContext {
    if (!isRecord(obj)) return false;

    const checks = [
        { key: 'id', type: 'string' },
        { key: 'slug', type: 'string' },
        { key: 'system_prompts', type: 'object' }, // Can be null
        { key: 'domain_specific_prompt_overlays', type: 'array' }, // Is an array
    ];

    for (const check of checks) {
        if (!Object.prototype.hasOwnProperty.call(obj, check.key)) return false;
        const value = obj[check.key];
        
        if (value === null) {
            // This is valid only if the field is not one of our specifically checked objects/arrays
             if (check.key !== 'system_prompts' && check.key !== 'domain_specific_prompt_overlays') {
                continue;
            }
        }

        if (check.type === 'array') {
            if (!Array.isArray(value)) return false;
        } else if (typeof value !== check.type) {
            // Allow null for system_prompts which is type 'object'
            if (check.key === 'system_prompts' && value === null) {
                continue;
            }
            return false;
        }
    }

    return true;
}

/**
 * Type guard to check if a value is a valid array of Citation objects.
 * @param value The value to check.
 * @returns True if the value is a Citation[], false otherwise.
 */
export function isCitationsArray(value: unknown): value is Citation[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'text' in item &&
        typeof item.text === 'string'
    )
  );
}

export function isDocumentRelationships(obj: unknown): obj is DocumentRelationships {
    if (!isRecord(obj)) {
        // `null` is not a DocumentRelationships object. This guard correctly identifies it as such.
        // The console.log was removed to prevent spam for valid null cases.
        return false;
    }

    // Check if all values in the object are either strings or null
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (typeof value !== 'string' && value !== null) {
                // This log is useful for debugging genuinely malformed objects.
                console.log(`[isDocumentRelationships] FAILED: Key '${key}' has invalid value:`, value);
                return false;
            }
        }
    }
    return true;
}

export function isCanonicalPathParams(obj: unknown): obj is CanonicalPathParams {
    if (!isRecord(obj)) return false;

    if (!('contributionType' in obj) || typeof obj.contributionType !== 'string') {
        return false;
    }
    // This guard can be expanded to check for other required properties if needed,
    // but for now, ensuring the core required property is present is sufficient.
    return true;
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

type SelectedAiProviderRow = Database['public']['Tables']['ai_providers']['Row'];

/**
 * A true type guard that safely checks if an object is a SelectedAiProvider
 * using runtime property inspection without any type casting.
 */
export function isSelectedAiProvider(obj: unknown): obj is SelectedAiProviderRow {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const checks = [
    { key: 'id', type: 'string', required: true },
    { key: 'provider', type: 'string', required: false }, // Can be null
    { key: 'name', type: 'string', required: true },
    { key: 'api_identifier', type: 'string', required: true },
  ];

  for (const check of checks) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, check.key);
    if (check.required && (!descriptor || typeof descriptor.value !== check.type)) {
      return false;
    }
    if (!check.required && descriptor && typeof descriptor.value !== check.type && descriptor.value !== null) {
        return false;
    }
    // Ensure required strings are not empty
    if (check.required && typeof descriptor?.value === 'string' && descriptor.value.length === 0) {
      return false;
    }
  }

  return true;
}

export function isUserRole(role: unknown): role is Database['public']['Enums']['user_role'] {
  return typeof role === 'string' && ['user', 'admin'].includes(role);
}

/*export function isIsolatedExecutionDeps(deps: unknown): deps is IIsolatedExecutionDeps {
    if (typeof deps !== 'object' || deps === null) {
        return false;
    }

    const functionChecks = ['getSourceStage', 'calculateTotalSteps', 'getSeedPromptForStage'];
    for (const funcName of functionChecks) {
        const descriptor = Object.getOwnPropertyDescriptor(deps, funcName);
        if (!descriptor || typeof descriptor.value !== 'function') {
            return false;
        }
    }
    return true;
}*/ 

export function isRecord(item: unknown): item is Record<PropertyKey, unknown> {
    return (item !== null && typeof item === 'object' && !Array.isArray(item));
} 

export function isKeyOf<T extends object>(obj: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(obj, key);
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

// --- Type Guard for Success Payload ---
type SuccessPayload = { success: boolean; message: string };

export function isSuccessPayload(payload: unknown): payload is SuccessPayload {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'success' in payload &&
        'message' in payload &&
        typeof (payload).success === 'boolean' &&
        typeof (payload).message === 'string'
    );
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    // It's a plain object if its prototype is Object.prototype or it has no prototype (e.g., Object.create(null)).
    return proto === Object.prototype || proto === null;
}

export function isJson(value: unknown, isObjectProperty = false): value is Json {
    const typeOfValue = typeof value;

    if (typeOfValue === 'undefined') {
        return isObjectProperty;
    }

    if (value === null || typeOfValue === 'boolean' || typeOfValue === 'number' || typeOfValue === 'string') {
        return true;
    }

    if (typeOfValue === 'object') {
        if (Array.isArray(value)) {
            return value.every((item) => isJson(item, false));
        }
        
        if (isPlainObject(value)) {
            return Object.values(value).every((v) => isJson(v, true));
        }
    }

    return false;
}

/**
 * A true type guard that safely checks if an object is a ProjectContext
 * using runtime property inspection without any type casting.
 * @param obj The object to check.
 * @returns True if the object is a valid ProjectContext, false otherwise.
 */
export function isProjectContext(obj: unknown): obj is ProjectContext {
    if (!isRecord(obj)) return false;

    const checks: { key: keyof ProjectContext, type: string, nullable?: boolean }[] = [
        { key: 'id', type: 'string' },
        { key: 'project_name', type: 'string' },
        { key: 'initial_user_prompt', type: 'string' },
        { key: 'dialectic_domains', type: 'object', nullable: true }, // Can be null in some contexts
    ];

    for (const check of checks) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, check.key);

        if (!descriptor) {
            if (check.nullable) continue;
            return false;
        }

        const value = descriptor.value;

        if (check.nullable && (value === null || typeof value === 'undefined')) {
            continue;
        }

        if (check.key === 'dialectic_domains') {
            if (value !== null && typeof value !== 'object') return false;
            if (value && isRecord(value)) {
                if(!('name' in value) || typeof value.name !== 'string') return false;
            }
        } else if (typeof value !== check.type) {
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

export function isAiModelExtendedConfig(obj: unknown): obj is AiModelExtendedConfig {
    if (!isRecord(obj)) return false;

    // Check for a few key properties to be reasonably sure it's the right type.
    // This isn't exhaustive but prevents the most common errors.
    const hasTokenization = 'tokenization_strategy' in obj && isRecord(obj.tokenization_strategy);
    if (!hasTokenization) return false;

    const strategy = obj.tokenization_strategy;
    if (!isRecord(strategy) || typeof strategy.type !== 'string') return false;

    if (strategy.type === 'tiktoken' && typeof strategy.tiktoken_encoding_name !== 'string') {
        return false;
    }

    if (strategy.type === 'rough_char_count' && strategy.chars_per_token_ratio && typeof strategy.chars_per_token_ratio !== 'number') {
        return false;
    }

    return true;
}

// Helper type to represent the structure we're checking for.
type StageWithStepsRecipe = Tables<'dialectic_stages'> & {
    input_artifact_rules: {
        steps: unknown[];
    };
};

export function hasStepsRecipe(stage: Tables<'dialectic_stages'>): stage is StageWithStepsRecipe {
    if (stage.input_artifact_rules &&
        isRecord(stage.input_artifact_rules) &&
        'steps' in stage.input_artifact_rules &&
        Array.isArray(stage.input_artifact_rules.steps)) {
        return true;
    }
    return false;
}

export function isDialecticStageRecipe(value: unknown): value is DialecticStageRecipe {
    if (!isRecord(value)) return false;

    return (
        isRecord(value.processing_strategy) &&
        value.processing_strategy.type === 'task_isolation' &&
        Array.isArray(value.steps) &&
        value.steps.every(
            (step: DialecticRecipeStep) =>
                typeof step.step === 'number' &&
                typeof step.prompt_template_name === 'string' &&
                typeof step.granularity_strategy === 'string' &&
                typeof step.output_type === 'string' &&
                Array.isArray(step.inputs_required)
        )
    );
}

export function isDialecticPlanJobPayload(payload: unknown): payload is DialecticPlanJobPayload {
    if (!isRecord(payload)) return false;
    return (
        payload.job_type === 'plan' &&
        isRecord(payload.step_info) &&
        typeof payload.step_info.current_step === 'number'
    );
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
        typeof payload.output_type === 'string' &&
        (!('step_info' in payload) || isDialecticStepInfo(payload.step_info)) &&
        isRecord(payload.inputs) &&
        hasCanonicalParams &&
        !hasLegacyFileName &&
        hasValidRelationships
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

export function isStringRecord(obj: unknown): obj is Record<string, string> {
    if (!isRecord(obj)) return false;
    return Object.values(obj).every(value => typeof value === 'string');
}

export function isDialecticStepInfo(obj: unknown): obj is DialecticStepInfo {
    if (!isRecord(obj)) return false;
    return (
        typeof obj.current_step === 'number' &&
        typeof obj.total_steps === 'number'
    );
}

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

export function isContributionType(value: string): value is ContributionType {
    return validContributionTypes.some((type) => type === value);
}

export interface DialecticChunkMetadata {
  source_contribution_id: string;
  [key: string]: unknown; // Allow other properties
}

export function isFileType(value: unknown): value is FileType {
    if (typeof value !== 'string') {
        return false;
    }
    for (const type of Object.values(FileType)) {
        if (type === value) {
            return true;
        }
    }
    return false;
}

export function isDialecticChunkMetadata(obj: unknown): obj is DialecticChunkMetadata {
    if (!isRecord(obj)) return false;
    return (
        'source_contribution_id' in obj &&
        typeof obj.source_contribution_id === 'string'
    );
}

export function isChatMessageRole(role: string): role is ChatMessageRole {
    return ['system', 'user', 'assistant'].includes(role);
}

export function isChatMessageRow(record: unknown): record is Tables<'chat_messages'> {
    if (!isRecord(record)) {
        return false;
    }

    const checks: { key: keyof Tables<'chat_messages'>, type: string, nullable?: boolean }[] = [
        { key: 'id', type: 'string' },
        { key: 'chat_id', type: 'string' },
        { key: 'user_id', type: 'string', nullable: true },
        { key: 'role', type: 'string' },
        { key: 'content', type: 'string', nullable: true },
        { key: 'created_at', type: 'string' },
        { key: 'updated_at', type: 'string' },
        { key: 'is_active_in_thread', type: 'boolean' },
        { key: 'token_usage', type: 'object', nullable: true },
        { key: 'ai_provider_id', type: 'string', nullable: true },
        { key: 'system_prompt_id', type: 'string', nullable: true },
        { key: 'error_type', type: 'string', nullable: true },
        { key: 'response_to_message_id', type: 'string', nullable: true },
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

export function isChatInsert(record: unknown): record is ChatInsert {
    if (!isRecord(record)) {
        return false;
    }

    // Required field
    if (typeof record.user_id !== 'string') {
        return false;
    }

    // Optional fields
    if ('created_at' in record && typeof record.created_at !== 'string') {
        return false;
    }
    if ('id' in record && typeof record.id !== 'string') {
        return false;
    }
    if ('organization__id' in record && typeof record.organization_id !== 'string' && record.organization_id !== null) {
        return false;
    }
    if ('system_prompt_id' in record && typeof record.system_prompt_id !== 'string' && record.system_prompt_id !== null) {
        return false;
    }
    if ('title' in record && typeof record.title !== 'string' && record.title !== null) {
        return false;
    }
    if ('updated_at' in record && typeof record.updated_at !== 'string') {
        return false;
    }

    return true;
}

export function isTokenUsage(obj: unknown): obj is TokenUsage {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      'prompt_tokens' in obj &&
      typeof obj.prompt_tokens === 'number' &&
      'completion_tokens' in obj &&
      typeof obj.completion_tokens === 'number' &&
      'total_tokens' in obj &&
      typeof obj.total_tokens === 'number'
    );
  }

export function isContinueReason(reason: FinishReason): reason is ContinueReason {
    if (typeof reason !== 'string') {
        return false;
    }
    for (const value of Object.values(ContinueReason)) {
        if (value === reason) {
            return true;
        }
    }
    return false;
}

export function hasModelResultWithContributionId(results: unknown): results is { modelProcessingResult: { contributionId: string } } {
    if (!isRecord(results)) return false;
    if (!('modelProcessingResult' in results)) return false;

    const modelResult = results.modelProcessingResult;
    if (!isRecord(modelResult)) return false;
    if (!('contributionId' in modelResult)) return false;

    return typeof modelResult.contributionId === 'string';
}

export function isPostgrestError(error: unknown): error is PostgrestError {
    if (!isRecord(error)) {
        return false;
    }

    return (
        'message' in error && typeof error.message === 'string' &&
        'code' in error && typeof error.code === 'string' &&
        'details' in error && typeof error.details === 'string' &&
        'hint' in error && typeof error.hint === 'string'
    );
}

export function isChatApiRequest(obj: unknown): obj is ChatApiRequest {
    if (typeof obj !== 'object' || obj === null) return false;
    const req = obj as Record<string, unknown>;
    return (
        typeof req.message === 'string' &&
        typeof req.providerId === 'string' &&
        typeof req.promptId === 'string'
    );
}

export function isApiChatMessage(message: Messages): message is { role: 'user' | 'assistant' | 'system', content: string | null } {
    return message.role === 'user' || message.role === 'assistant' || message.role === 'system';
}
