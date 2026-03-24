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

    // Step 5: Attempt structural fixes for invalid JSON
    let wasStructurallyFixed = false;
    let structurallyFixed = sanitized;

    // Only attempt structural fixes if the content is not already valid JSON
    try {
        JSON.parse(sanitized);
        // Content is already valid, no structural fix needed
    } catch {
        // Content is not valid JSON — attempt simple brace/bracket fixes first,
        // then fall back to stream truncation repair
        const trimmedContent = sanitized.trim();
        let simpleFixWorked = false;

        // Simple fixes: try adding missing opening/closing braces or brackets
        const simpleFixes: string[] = [];
        if (!trimmedContent.startsWith('{') && !trimmedContent.startsWith('[')) {
            simpleFixes.push(
                `{${trimmedContent}`,
                `{${trimmedContent}}`,
                `${trimmedContent}}`,
                `[${trimmedContent}`,
                `[${trimmedContent}]`,
                `${trimmedContent}]`,
            );
        } else if (trimmedContent.startsWith('{') && !trimmedContent.endsWith('}')) {
            simpleFixes.push(`${trimmedContent}}`);
        } else if (trimmedContent.startsWith('[') && !trimmedContent.endsWith(']')) {
            simpleFixes.push(`${trimmedContent}]`);
        }

        for (let f = 0; f < simpleFixes.length; f++) {
            try {
                JSON.parse(simpleFixes[f]);
                structurallyFixed = simpleFixes[f];
                wasStructurallyFixed = true;
                wasSanitized = true;
                simpleFixWorked = true;
                break;
            } catch {
                // This simple fix didn't work, try next
            }
        }

        // If simple fixes failed, attempt stream truncation repair
        if (!simpleFixWorked) {
            const repaired: string | null = repairStreamTruncation(trimmedContent);
            if (repaired !== null) {
                try {
                    JSON.parse(repaired);
                    structurallyFixed = repaired;
                    wasStructurallyFixed = true;
                    wasSanitized = true;
                } catch {
                    // Repair produced invalid JSON — keep original
                    structurallyFixed = sanitized;
                }
            } else {
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

// --- Module-Private Helper: Stream Truncation Repair ---

/**
 * Walks the JSON string character-by-character to determine the structural state
 * at the truncation point, then appends the minimal closing sequence to produce
 * valid JSON. Removes incomplete key-value pairs where the value is unknown.
 *
 * Returns a repaired JSON string, or null if repair is not possible.
 */
function repairStreamTruncation(content: string): string | null {
    if (content.length === 0) {
        return null;
    }

    // State tracking
    let inString = false;
    let escapeNext = false;
    const containerStack: string[] = []; // '{' or '['
    // Track the byte offset where the last *complete* top-level-ish structure token ended,
    // so we can truncate back to a known-good boundary when needed.
    let lastSafeEnd = 0;
    // Track whether we are in a position where a value is expected (after ':')
    // or a new key/element is expected (after ',' or container open)
    let afterColon = false;
    let afterComma = false;

    for (let i = 0; i < content.length; i++) {
        const ch: string = content[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (inString) {
            if (ch === '\\') {
                escapeNext = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
                // If we just completed a value string (afterColon was true),
                // the key-value pair is now complete.
                if (afterColon) {
                    afterColon = false;
                    lastSafeEnd = i + 1;
                }
            }
            continue;
        }

        // Outside of strings
        switch (ch) {
            case '"':
                inString = true;
                break;
            case '{':
                containerStack.push('{');
                afterColon = false;
                afterComma = false;
                break;
            case '[':
                containerStack.push('[');
                afterColon = false;
                afterComma = false;
                break;
            case '}':
                containerStack.pop();
                afterColon = false;
                afterComma = false;
                lastSafeEnd = i + 1;
                break;
            case ']':
                containerStack.pop();
                afterColon = false;
                afterComma = false;
                lastSafeEnd = i + 1;
                break;
            case ':':
                afterColon = true;
                afterComma = false;
                break;
            case ',':
                afterComma = true;
                afterColon = false;
                // A comma means the previous pair was complete
                lastSafeEnd = i;
                break;
            default:
                // whitespace or value characters
                break;
        }
    }

    // If content is already valid (no open containers, no dangling state), nothing to do
    if (!inString && !escapeNext && containerStack.length === 0 && !afterColon && !afterComma) {
        return null;
    }

    // Strategy: build the repaired string based on the truncation state
    let repaired: string = content;

    // Case 1: Dangling escape at end of string — remove the trailing backslash,
    // close the string, then close containers
    if (escapeNext) {
        repaired = repaired.slice(0, -1);
        inString = true; // still in the string since escape was incomplete
    }

    // Case 2: Inside a string — we need to determine context
    if (inString) {
        // Close the string
        repaired = repaired + '"';

        // Now determine what context we're in after closing the string.
        // Walk the repaired content to find the structural state.
        // We need to know: are we in a value position, key position, etc.
        // Re-walk from the truncation point context rather than re-parsing everything.
        // The key question: is this string a key or a value?

        // Find the last unescaped quote before our added one to determine context.
        // If afterColon was true when we entered the string, this is a value string — keep it.
        // If afterColon was false, this could be a key (after comma or container open).
        if (afterColon) {
            // This is a value string — we closed it, now close containers
            // The value is truncated but present — keep it
        } else {
            // This could be:
            // - A key that was being written (after comma or at start)
            // - A value in an array
            // Check if the innermost container is an array
            const innermostContainer: string | undefined = containerStack[containerStack.length - 1];
            if (innermostContainer === '[') {
                // Inside an array — truncated array data is unreliable.
                // Remove the entire key that owns this array by truncating to lastSafeEnd.
                if (lastSafeEnd > 0) {
                    repaired = trimTrailingJsonNoise(content.slice(0, lastSafeEnd));
                }
            } else {
                // Inside an object — this is a partial key. Remove it.
                // Find where this key started (the opening quote)
                const lastQuoteBeforeTruncation: number = findLastUnescapedQuoteStart(content);
                if (lastQuoteBeforeTruncation >= 0) {
                    // Back up to before the quote, trim trailing comma/whitespace
                    repaired = trimTrailingJsonNoise(content.slice(0, lastQuoteBeforeTruncation));
                }
            }
        }
    } else if (afterColon) {
        // Truncated right after colon, or mid-value (keyword, number start, etc.)
        // We don't know what the value was supposed to be — remove the key entirely.
        // Find the comma or container-open before this key-value pair.
        repaired = removeLastIncompleteKeyValue(repaired);
    } else if (afterComma) {
        // Trailing comma — just remove it
        repaired = trimTrailingJsonNoise(repaired);
    }

    // Now close all open containers
    // Re-walk the repaired content to get accurate container state
    const finalContainers: string[] = [];
    let finalInString = false;
    let finalEscape = false;
    for (let i = 0; i < repaired.length; i++) {
        const ch: string = repaired[i];
        if (finalEscape) {
            finalEscape = false;
            continue;
        }
        if (finalInString) {
            if (ch === '\\') { finalEscape = true; continue; }
            if (ch === '"') { finalInString = false; }
            continue;
        }
        if (ch === '"') { finalInString = true; }
        else if (ch === '{') { finalContainers.push('{'); }
        else if (ch === '[') { finalContainers.push('['); }
        else if (ch === '}') { finalContainers.pop(); }
        else if (ch === ']') { finalContainers.pop(); }
    }

    // If we're still in a string after all repairs, close it
    if (finalInString) {
        repaired = repaired + '"';
    }

    // Close all remaining open containers in reverse order
    for (let c = finalContainers.length - 1; c >= 0; c--) {
        const opener: string = finalContainers[c];
        repaired = repaired + (opener === '{' ? '}' : ']');
    }

    // Final validation — if what we produced doesn't parse, return null
    try {
        JSON.parse(repaired);
        return repaired;
    } catch {
        // The repair didn't produce valid JSON. Try a more aggressive approach:
        // truncate back to the last known safe boundary and close from there.
        if (lastSafeEnd > 0 && lastSafeEnd < content.length) {
            let aggressive: string = content.slice(0, lastSafeEnd);
            aggressive = trimTrailingJsonNoise(aggressive);

            // Re-walk for containers
            const aggContainers: string[] = [];
            let aggInStr = false;
            let aggEsc = false;
            for (let i = 0; i < aggressive.length; i++) {
                const ch: string = aggressive[i];
                if (aggEsc) { aggEsc = false; continue; }
                if (aggInStr) {
                    if (ch === '\\') { aggEsc = true; continue; }
                    if (ch === '"') { aggInStr = false; }
                    continue;
                }
                if (ch === '"') { aggInStr = true; }
                else if (ch === '{') { aggContainers.push('{'); }
                else if (ch === '[') { aggContainers.push('['); }
                else if (ch === '}') { aggContainers.pop(); }
                else if (ch === ']') { aggContainers.pop(); }
            }

            for (let c = aggContainers.length - 1; c >= 0; c--) {
                aggressive = aggressive + (aggContainers[c] === '{' ? '}' : ']');
            }

            try {
                JSON.parse(aggressive);
                return aggressive;
            } catch {
                return null;
            }
        }
        return null;
    }
}

/**
 * Find the index of the last unescaped `"` that opens a string (i.e., is not preceded
 * by an odd number of backslashes). Returns -1 if not found.
 */
function findLastUnescapedQuoteStart(content: string): number {
    for (let i = content.length - 1; i >= 0; i--) {
        if (content[i] === '"') {
            // Count preceding backslashes
            let backslashes = 0;
            let j: number = i - 1;
            while (j >= 0 && content[j] === '\\') {
                backslashes++;
                j--;
            }
            // If even number of backslashes, this quote is unescaped
            if (backslashes % 2 === 0) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * Removes trailing JSON noise: commas, colons, whitespace — anything that would
 * be invalid at the end of a JSON structure.
 */
function trimTrailingJsonNoise(content: string): string {
    let end: number = content.length;
    while (end > 0) {
        const ch: string = content[end - 1];
        if (ch === ',' || ch === ':' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            end--;
        } else {
            break;
        }
    }
    return content.slice(0, end);
}

/**
 * Removes the last incomplete key-value pair from a JSON string.
 * Walks backward from the end to find and remove the dangling key:incomplete_value.
 * Handles cases like: `{"a":"b","c":tru` → `{"a":"b"` and `{"a":"b","c":` → `{"a":"b"`
 */
function removeLastIncompleteKeyValue(content: string): string {
    // Find the last comma that's outside a string — that's the separator before
    // the incomplete pair. Everything from that comma onward gets removed.
    let inStr = false;
    let esc = false;
    let lastCommaOutsideString = -1;

    for (let i = 0; i < content.length; i++) {
        const ch: string = content[i];
        if (esc) { esc = false; continue; }
        if (inStr) {
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = false; }
            continue;
        }
        if (ch === '"') { inStr = true; }
        else if (ch === ',') { lastCommaOutsideString = i; }
    }

    if (lastCommaOutsideString >= 0) {
        return content.slice(0, lastCommaOutsideString);
    }

    // No comma found — the incomplete pair is the only pair.
    // Find the opening container and return just that.
    const firstBrace: number = content.indexOf('{');
    const firstBracket: number = content.indexOf('[');
    if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
        return content.slice(0, firstBrace + 1);
    }
    if (firstBracket >= 0) {
        return content.slice(0, firstBracket + 1);
    }

    return content;
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
