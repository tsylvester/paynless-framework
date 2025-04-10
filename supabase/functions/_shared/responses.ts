// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { corsHeaders } from "./cors-headers.ts";

/**
 * Creates a standardized success JSON response.
 * @param data - The payload to include in the response body.
 * @param status - The HTTP status code (default: 200).
 * @param headers - Additional headers to merge.
 * @returns A Response object.
 */
export function createSuccessResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
    }
  );
}

/**
 * Creates a standardized error JSON response.
 * Logs the error using console.error.
 * @param message - The error message.
 * @param status - The HTTP status code (default: 500).
 * @param error - The original error object (optional, for logging).
 * @param headers - Additional headers to merge.
 * @returns A Response object.
 */
export function createErrorResponse(
  message: string,
  status = 500,
  error?: Error | unknown, // Allow unknown for broader catch compatibility
  headers: Record<string, string> = {}
): Response {
  const logParts: any[] = [`API Error (${status}): ${message}`];
  if (error instanceof Error) {
    logParts.push("\nError Details:", error.stack || error.message);
  } else if (error) {
    logParts.push("\nError Details:", error);
  }
  
  console.error(...logParts);
  
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
    }
  );
} 