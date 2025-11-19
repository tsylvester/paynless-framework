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

    // Construct result using JsonSanitizationResult type (per 125.b.ii)
    const result: JsonSanitizationResult = {
        sanitized: sanitized,
        wasSanitized: wasSanitized,
        originalLength: originalLength
    };

    return result;
}

