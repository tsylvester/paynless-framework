/**
 * Represents the result of sanitizing JSON content.
 * 
 * This type establishes the contract for the sanitization utility and enables
 * consumers to log sanitization events without exposing implementation details.
 */
export interface JsonSanitizationResult {
    /** The sanitized JSON string content. */
    sanitized: string;
    /** A flag indicating whether any sanitization operations were performed (removal of wrappers, trimming, etc.). */
    wasSanitized: boolean;
    /** The original content length before sanitization for debugging/logging purposes. */
    originalLength: number;
}

