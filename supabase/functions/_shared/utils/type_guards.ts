// supabase/functions/_shared/utils/type_guards.ts
import type { Database, Tables, Json } from "../../types_db.ts";
import type { 
    ProcessingStrategy, 
    DialecticContributionRow, 
    GenerateContributionsPayload,
    DialecticJobPayload,
    DialecticJobRow,
} from '../../dialectic-service/dialectic.interface.ts';
import type { IIsolatedExecutionDeps } from "../../dialectic-worker/task_isolator.ts";
import { ProjectContext, StageContext } from "../prompt-assembler.interface.ts";

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

// Validation function that safely converts Json to GenerateContributionsPayload
export function validatePayload(payload: Json): GenerateContributionsPayload {
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
  if (!('selectedModelIds' in payload) || !Array.isArray(payload.selectedModelIds) || 
      !payload.selectedModelIds.every((id: unknown) => typeof id === 'string')) {
    throw new Error('selectedModelIds must be an array of strings');
  }
  
  // Build the validated payload with proper types
  const validatedPayload: GenerateContributionsPayload = {
    sessionId: payload.sessionId,
    projectId: payload.projectId,
    selectedModelIds: payload.selectedModelIds,
    stageSlug: ('stageSlug' in payload && typeof payload.stageSlug === 'string') ? payload.stageSlug : undefined,
    iterationNumber: ('iterationNumber' in payload && typeof payload.iterationNumber === 'number') ? payload.iterationNumber : undefined,
    chatId: ('chatId' in payload && (typeof payload.chatId === 'string' || payload.chatId === null)) ? payload.chatId : undefined,
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
export function isDialecticJobPayload(payload: Json): payload is Json & DialecticJobPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
    }

    try {
        // First, validate the base properties of GenerateContributionsPayload
        validatePayload(payload);

        // If base validation passes, check for the optional 'prompt' property.
        if ('prompt' in payload && typeof payload.prompt !== 'string') {
            return false;
        }

        return true;
    } catch (error) {
        // If validatePayload throws, it's not a valid payload.
        return false;
    }
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
    if (typeof obj !== 'object' || obj === null) return false;

    const checks = [
        { key: 'id', type: 'string' },
        { key: 'slug', type: 'string' },
        { key: 'system_prompts', type: 'object' }, // Can be null
        { key: 'domain_specific_prompt_overlays', type: 'object' }, // Is an array
    ];

    for (const check of checks) {
        if (!Object.prototype.hasOwnProperty.call(obj, check.key)) return false;
        const value = (obj as Record<string, unknown>)[check.key];
        if (value === null) continue; // Allow null for nullable fields
        if (check.key === 'domain_specific_prompt_overlays' && !Array.isArray(value)) return false;
        if (typeof value !== check.type) return false;
    }

    return true;
}

export function isProjectContext(obj: unknown): obj is ProjectContext {
    if (typeof obj !== 'object' || obj === null) return false;

    const checks = [
        { key: 'id', type: 'string' },
        { key: 'project_name', type: 'string' },
        { key: 'initial_user_prompt', type: 'string' },
        { key: 'dialectic_domains', type: 'object' }, // Not null
    ];

    for (const check of checks) {
        if (!Object.prototype.hasOwnProperty.call(obj, check.key)) return false;
        const value = (obj as Record<string, unknown>)[check.key];
        if (value === null) return false; // None of these are nullable
        if (typeof value !== check.type) return false;
    }
    
    // Check nested property
    if (typeof (obj as ProjectContext).dialectic_domains.name !== 'string') return false;

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


/**
 * A true type guard that safely checks if a record is a DialecticContribution
 * using runtime property inspection without any type casting.
 */
export function isDialecticContribution(record: unknown): record is DialecticContributionRow {
  if (typeof record !== 'object' || record === null) {
    return false;
  }

  // Define checks based on DialecticContributionRow properties.
  // This avoids using properties from the local DialecticContribution interface,
  // which was the source of the type mismatch.
  const checks: { key: keyof DialecticContributionRow, type: string, nullable?: boolean }[] = [
    { key: 'id', type: 'string' },
    { key: 'session_id', type: 'string' },
    { key: 'stage', type: 'string' }, // stage must be a non-null string as per the error.
    { key: 'iteration_number', type: 'number' },
    { key: 'model_id', type: 'string', nullable: true }, 
    { key: 'edit_version', type: 'number' },
    { key: 'is_latest_edit', type: 'boolean' },
    { key: 'citations', type: 'object', nullable: true }, // citations is of type Json, which can be object or null.
  ];

  for (const check of checks) {
    const descriptor = Object.getOwnPropertyDescriptor(record, check.key);
    // Property must exist for non-nullable checks
    if (!descriptor && !check.nullable) return false;

    if (descriptor) {
        const value = descriptor.value;
        if (check.nullable && value === null) {
            continue; // Null is allowed, so skip to the next check
        }

        if (typeof value !== check.type) {
            return false;
        }
    } else if (!check.nullable) {
        // If the descriptor doesn't exist and it's not nullable, fail.
        return false;
    }
  }

  return true;
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

export function isIsolatedExecutionDeps(deps: unknown): deps is IIsolatedExecutionDeps {
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
} 

export function isRecord(item: unknown): item is Record<PropertyKey, unknown> {
    return (item !== null && typeof item === 'object' && !Array.isArray(item));
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
