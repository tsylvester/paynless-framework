import { ResourceDocument } from "../types.ts";
import { InputRule } from "../../dialectic-service/dialectic.interface.ts";

export function applyInputsRequiredScope(
    docs: Required<ResourceDocument>[],
    inputsRequired: InputRule[] | undefined,
): Required<ResourceDocument>[] {
    if (!inputsRequired || inputsRequired.length === 0) return [];
    const filtered: Required<ResourceDocument>[] = [];
    for (const d of docs) {
        let match = false;
        for (const scopeRule of inputsRequired) {
            if (scopeRule.type === d.type && scopeRule.slug === d.stage_slug && scopeRule.document_key === d.document_key) {
                match = true;
                break;
            }
        }
        if (match) filtered.push(d);
    }
    return filtered;
}
