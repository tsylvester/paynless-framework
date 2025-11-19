import type { JsonSanitizationResult } from '../types/jsonSanitizer.interface.ts';

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
        originalLength: originalLength
    };

    return result;
}

