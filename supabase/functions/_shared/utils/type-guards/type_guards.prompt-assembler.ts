// supabase/functions/_shared/utils/type_guards.ts
import { ProjectContext, StageContext } from "../../prompt-assembler/prompt-assembler.interface.ts";
import { isRecord } from './type_guards.common.ts';

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

