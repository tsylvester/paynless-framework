// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.

// Define allowed origins. Replace 'YOUR_PRODUCTION_FRONTEND_URL' with your actual production frontend URL.
// You might also want to load this from environment variables for more flexibility.
const allowedOrigins: (string | RegExp)[] = [
	"http://localhost:5173", // Local Vite dev server
	"http://127.0.0.1:5173", // Local Vite dev server unaliased
	"http://localhost:54321", // Local Supabase API server
	"http://127.0.0.1:54321", // Local Supabase API server unaliased
	"https://paynless.app", // Production URL 1
	"https://paynless-framework.netlify.app", // Production URL 2 (Netlify)
	/^https:\/\/.*paynless.*\.netlify\.app$/, // Netlify deploy previews
];

/**
 * Base CORS headers (excluding Access-Control-Allow-Origin, which is now dynamic)
 * Used in all API endpoints to ensure consistent CORS handling
 */
// Export base headers for use in SSE or other custom responses
export const baseCorsHeaders = {
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type, x-paynless-anon-secret",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", // SSE usually uses GET
	"Access-Control-Allow-Credentials": "true",
	"Access-Control-Max-Age": "86400", // 24 hours
};

/**
 * Helper function to check if a given origin is allowed.
 * Exported for use in special cases like SSE streams.
 */
export const isOriginAllowed = (requestOrigin: string | null): boolean => {
	console.log(`[cors-headers] Checking origin: ${requestOrigin}`); // Log received origin
	if (!requestOrigin) {
		console.log(`[cors-headers] Origin allowed? false (No origin header)`);
		return false;
	}

	for (const pattern of allowedOrigins) {
		if (typeof pattern === "string" && pattern === requestOrigin) {
			console.log(
				`[cors-headers] Origin allowed? true (Exact match: ${pattern})`,
			);
			return true;
		}
		if (pattern instanceof RegExp && pattern.test(requestOrigin)) {
			console.log(
				`[cors-headers] Origin allowed? true (Regex match: ${pattern})`,
			);
			return true;
		}
	}

	console.log(`[cors-headers] Origin allowed? false (No match found)`);
	return false;
};

/**
 * Helper function to get CORS headers for a specific request origin.
 */
// Keep this internal, used by the response creators below
const getCorsHeadersForRequest = (request: Request): Record<string, string> => {
	const origin = request.headers.get("Origin");
	console.log(
		`[cors-headers] getCorsHeadersForRequest called for Origin: ${origin}`,
	); // Log origin
	const headers: Record<string, string> = { ...baseCorsHeaders };
	if (isOriginAllowed(origin)) {
		headers["Access-Control-Allow-Origin"] = origin as string; // Dynamic origin
		console.log(`[cors-headers] Added Access-Control-Allow-Origin: ${origin}`);
		//console.log('[cors-headers] Processing request object:', request);
	} else {
		console.log(
			`[cors-headers] Origin not in allowed list. Not adding Access-Control-Allow-Origin.`,
		);
	}
	return headers;
};

/**
 * Create a CORS preflight response handler
 * Standard OPTIONS response for CORS preflight requests
 */
export const handleCorsPreflightRequest = (req: Request): Response | null => {
	console.log(
		`[cors-headers] handleCorsPreflightRequest called for Method: ${req.method}, Origin: ${req.headers.get("Origin")}`,
	);
	if (req.method === "OPTIONS") {
		const corsHeaders = getCorsHeadersForRequest(req);
		console.log(
			`[cors-headers] Responding to OPTIONS with headers:`,
			JSON.stringify(corsHeaders),
		);
		// Only return 204 if origin was allowed and header added
		if (corsHeaders["Access-Control-Allow-Origin"]) {
			return new Response(null, { status: 204, headers: corsHeaders });
		} else {
			console.warn(
				`[cors-headers] OPTIONS request from disallowed origin: ${req.headers.get("Origin")}. Responding without CORS headers.`,
			);
			return new Response(null, { status: 204 });
		}
	}
	return null;
};

/**
 * Create an error response with proper CORS headers and optional logging.
 * @param message - The error message.
 * @param status - The HTTP status code (default: 500).
 * @param request - The original Request object (for CORS origin).
 * @param error - The original error object (optional, for logging).
 * @param additionalHeaders - Additional headers to merge.
 * @returns A Response object.
 */
export const createErrorResponse = (
	message: string,
	status = 500,
	request: Request, // request is now mandatory
	error?: Error | unknown, // Optional error for logging
	additionalHeaders: Record<string, string> = {},
): Response => {
	// Logging logic from responses.ts
	const logParts: unknown[] = [`API Error (${status}): ${message}`];
	if (error instanceof Error) {
		logParts.push("\nError Details:", error.stack || error.message);
	} else if (error) {
		logParts.push("\nError Details:", error);
	}
	console.error(...logParts);

	// Get dynamic CORS headers
	const corsHeaders = getCorsHeadersForRequest(request);

	// Merge headers
	const finalHeaders = {
		...corsHeaders,
		"Content-Type": "application/json",
		...additionalHeaders,
	};

	return new Response(
		JSON.stringify({ error: message }), // Standardized error body
		{
			status,
			headers: finalHeaders,
		},
	);
};

/**
 * Create a success response with proper CORS headers.
 * @param data - The payload to include in the response body.
 * @param status - The HTTP status code (default: 200).
 * @param request - The original Request object (for CORS origin).
 * @param additionalHeaders - Additional headers to merge.
 * @returns A Response object.
 */
export const createSuccessResponse = (
	data: unknown, // Use unknown instead of any
	status = 200,
	request: Request, // request is now mandatory
	additionalHeaders: Record<string, string> = {},
): Response => {
	// Get dynamic CORS headers
	const corsHeaders = getCorsHeadersForRequest(request);

	// Define statuses that must not have a body according to HTTP standards
	const nullBodyStatuses = [204, 205, 304]; // 101 can also be added if needed

	// Merge headers
	const finalHeaders = {
		...corsHeaders,
		// Conditionally set Content-Type only if there will be a body
		...(!nullBodyStatuses.includes(status) && {
			"Content-Type": "application/json",
		}),
		...additionalHeaders,
	};

	// Return response with null body for specific statuses
	if (nullBodyStatuses.includes(status)) {
		// Ensure data is null or undefined before returning null body
		if (data !== null && data !== undefined) {
			console.warn(
				`[cors-headers] WARNING: createSuccessResponse called with status ${status} but received non-null data. Ignoring data for null body response.`,
			);
		}
		return new Response(null, {
			status,
			headers: finalHeaders,
		});
	}

	// For other statuses, return with stringified data
	return new Response(JSON.stringify(data), {
		status,
		headers: finalHeaders,
	});
};
