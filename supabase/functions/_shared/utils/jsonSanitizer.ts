import { JsonSanitizationResult } from '../types/jsonSanitizer.interface.ts';
import { parseTree, Node } from 'https://esm.sh/jsonc-parser@3.2.0';

/**
 * Sanitizes JSON content by removing common wrapper patterns (triple backticks, quotes, whitespace).
 * Handles AI response formatting deviations while preserving valid JSON content.
 * 
 * @param rawContent - The raw JSON string content, potentially wrapped in backticks, quotes, or whitespace
 * @returns A JsonSanitizationResult containing the sanitized content, sanitization flag, and original length
 */
export function sanitizeJsonContent(rawContent: string): JsonSanitizationResult {
    const originalLength = rawContent.length;
    let sanitized = rawContent;
    let wasSanitized = false;

    // Handle nested wrapper patterns by iterating until no more removals are possible
    // Order: backticks first, then quotes, then trimming (per 125.b.iii)
    let continueRemoval = true;
    while (continueRemoval) {
        continueRemoval = false;

        // Step 1: Remove triple backticks (with optional json/JSON tag) from start and end
        // DO NOT trim during this step - trimming comes last per 125.b.iii
        const backtickStartPattern = /^```(?:json|JSON)?\n?/;
        const backtickEndPattern = /\n?```$/;
        const hadBackticks = backtickStartPattern.test(sanitized) || backtickEndPattern.test(sanitized);
        if (hadBackticks) {
            sanitized = sanitized.replace(backtickStartPattern, '').replace(backtickEndPattern, '');
            wasSanitized = true;
            continueRemoval = true;
            continue;
        }

        // Step 2: Remove surrounding single quotes if they match at start/end
        if (sanitized.length >= 2 && sanitized[0] === "'" && sanitized[sanitized.length - 1] === "'") {
            sanitized = sanitized.slice(1, -1);
            wasSanitized = true;
            continueRemoval = true;
            continue;
        }

        // Step 3: Remove surrounding double quotes if they wrap the entire content
        // If the unwrapped content starts with { or [, those are wrapper quotes that should be removed
        // (per 125.b.ii.5: JSON is defined by {} or [], not by "" - outer quotes are wrappers around valid JSON)
        if (sanitized.length >= 2 && sanitized[0] === '"' && sanitized[sanitized.length - 1] === '"') {
            const potentialContent = sanitized.slice(1, -1);
            const trimmedPotential = potentialContent.trimStart();
            // Remove wrapper quotes if content starts with { or [ (valid JSON structure)
            // The outer quotes are wrappers, not part of the JSON itself
            if (trimmedPotential.startsWith('{') || trimmedPotential.startsWith('[')) {
                sanitized = potentialContent;
                wasSanitized = true;
                continueRemoval = true;
                continue;
            }
        }
    }

    // Step 4: Trim leading and trailing whitespace (final step per 125.b.iii)
    const trimmed = sanitized.trim();
    if (trimmed !== sanitized) {
        sanitized = trimmed;
        wasSanitized = true;
    }

    // Step 4.5: Deduplicate keys using AST
    // Run this BEFORE structural fixes (which rely on JSON.parse)
    const deduplicationResult = deduplicateJsonKeys(sanitized);
    const hasDuplicateKeys = deduplicationResult.hasDuplicateKeys;
    const duplicateKeysResolved = deduplicationResult.duplicateKeysResolved;
    
    if (hasDuplicateKeys) {
        sanitized = deduplicationResult.deduplicated;
        wasSanitized = true;
    }

    // Step 5: Attempt structural fixes for simple missing braces/brackets
    let wasStructurallyFixed = false;
    let structurallyFixed = sanitized;
    
    // Only attempt structural fixes if the content is not already valid JSON
    try {
        JSON.parse(sanitized);
        // Content is already valid, no structural fix needed
    } catch {
        // Content is not valid JSON, attempt structural fixes
        const trimmedContent = sanitized.trim();
        
        // Try fixes in order of likelihood:
        // 1. Missing opening brace for object (most common case from terminal output)
        if (!trimmedContent.startsWith('{') && !trimmedContent.startsWith('[')) {
            // Try adding opening brace
            const withOpeningBrace = `{${trimmedContent}`;
            try {
                JSON.parse(withOpeningBrace);
                structurallyFixed = withOpeningBrace;
                wasStructurallyFixed = true;
                wasSanitized = true;
            } catch {
                // Opening brace alone didn't work, try adding both opening and closing
                const withBothBraces = `{${trimmedContent}}`;
                try {
                    JSON.parse(withBothBraces);
                    structurallyFixed = withBothBraces;
                    wasStructurallyFixed = true;
                    wasSanitized = true;
                } catch {
                    // Try closing brace only
                    const withClosingBrace = `${trimmedContent}}`;
                    try {
                        JSON.parse(withClosingBrace);
                        structurallyFixed = withClosingBrace;
                        wasStructurallyFixed = true;
                        wasSanitized = true;
                    } catch {
                        // Try opening bracket for array
                        const withOpeningBracket = `[${trimmedContent}`;
                        try {
                            JSON.parse(withOpeningBracket);
                            structurallyFixed = withOpeningBracket;
                            wasStructurallyFixed = true;
                            wasSanitized = true;
                        } catch {
                            // Try both brackets
                            const withBothBrackets = `[${trimmedContent}]`;
                            try {
                                JSON.parse(withBothBrackets);
                                structurallyFixed = withBothBrackets;
                                wasStructurallyFixed = true;
                                wasSanitized = true;
                            } catch {
                                // Try closing bracket only
                                const withClosingBracket = `${trimmedContent}]`;
                                try {
                                    JSON.parse(withClosingBracket);
                                    structurallyFixed = withClosingBracket;
                                    wasStructurallyFixed = true;
                                    wasSanitized = true;
                                } catch {
                                    // No structural fix worked, keep original sanitized content
                                    structurallyFixed = sanitized;
                                }
                            }
                        }
                    }
                }
            }
        } else if (trimmedContent.startsWith('{') && !trimmedContent.endsWith('}')) {
            // Has opening brace but missing closing brace
            const withClosingBrace = `${trimmedContent}}`;
            try {
                JSON.parse(withClosingBrace);
                structurallyFixed = withClosingBrace;
                wasStructurallyFixed = true;
                wasSanitized = true;
            } catch {
                // Closing brace didn't work, keep original
                structurallyFixed = sanitized;
            }
        } else if (trimmedContent.startsWith('[') && !trimmedContent.endsWith(']')) {
            // Has opening bracket but missing closing bracket
            const withClosingBracket = `${trimmedContent}]`;
            try {
                JSON.parse(withClosingBracket);
                structurallyFixed = withClosingBracket;
                wasStructurallyFixed = true;
                wasSanitized = true;
            } catch {
                // Closing bracket didn't work, keep original
                structurallyFixed = sanitized;
            }
        }
    }

    // Construct result using JsonSanitizationResult type (per 125.b.ii)
    const result: JsonSanitizationResult = {
        sanitized: structurallyFixed,
        wasSanitized: wasSanitized,
        wasStructurallyFixed: wasStructurallyFixed,
        hasDuplicateKeys: hasDuplicateKeys,
        duplicateKeysResolved: duplicateKeysResolved,
        originalLength: originalLength
    };

    return result;
}

// --- Module-Private Helpers for Deduplication ---

function isEmpty(value: unknown): boolean {
    if (value === null) return true;
    if (value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (isPlainObject(value) && Object.keys(value).length === 0) return true;
    return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v) && v !== undefined;
}

function mergeValues(a: unknown, b: unknown): unknown {
    if (isEmpty(a)) return b;
    if (isEmpty(b)) return a;
    
    if (Array.isArray(a) && Array.isArray(b)) {
        return [...a, ...b];
    }
    
    if (isPlainObject(a) && isPlainObject(b)) {
        const result = { ...a };
        for (const key of Object.keys(b)) {
            if (key in result) {
                result[key] = mergeValues(result[key], b[key]);
            } else {
                result[key] = b[key];
            }
        }
        return result;
    }
    
    // Primitives or mixed types: first one wins if both populated
    return a;
}

function buildNode(node: Node, duplicatesFound: Set<string>): unknown {
    if (node.type === 'object' && node.children) {
        const result: Record<string, unknown> = {};
        for (const prop of node.children) {
            if (prop.children && prop.children.length === 2) {
                const keyNode = prop.children[0];
                const valueNode = prop.children[1];
                // Remove quotes from key if present
                const key = keyNode.value;
                const value = buildNode(valueNode, duplicatesFound);
                
                if (key in result) {
                    duplicatesFound.add(key);
                    result[key] = mergeValues(result[key], value);
                } else {
                    result[key] = value;
                }
            }
        }
        return result;
    } else if (node.type === 'array' && node.children) {
        return node.children.map(child => buildNode(child, duplicatesFound));
    } else {
        return node.value;
    }
}

function deduplicateJsonKeys(raw: string): { deduplicated: string, hasDuplicateKeys: boolean, duplicateKeysResolved: string[] } {
    const duplicatesFound = new Set<string>();
    const root = parseTree(raw);
    
    if (!root) {
        return { deduplicated: raw, hasDuplicateKeys: false, duplicateKeysResolved: [] };
    }
    
    const result = buildNode(root, duplicatesFound);
    
    if (duplicatesFound.size > 0) {
        return {
            deduplicated: JSON.stringify(result, null, 2),
            hasDuplicateKeys: true,
            duplicateKeysResolved: Array.from(duplicatesFound)
        };
    }
    
    return { deduplicated: raw, hasDuplicateKeys: false, duplicateKeysResolved: [] };
}
