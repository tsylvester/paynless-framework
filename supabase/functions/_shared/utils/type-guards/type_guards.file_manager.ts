// supabase/functions/_shared/utils/type_guards.ts
import { FileType, CanonicalPathParams } from "../../types/file_manager.types.ts";
import { isRecord } from './type_guards.common.ts';

export function isCanonicalPathParams(obj: unknown): obj is CanonicalPathParams {
    if (!isRecord(obj)) return false;

    if (!('contributionType' in obj) || typeof obj.contributionType !== 'string') {
        return false;
    }
    // This guard can be expanded to check for other required properties if needed,
    // but for now, ensuring the core required property is present is sufficient.
    return true;
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