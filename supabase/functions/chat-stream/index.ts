import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
	handleCorsPreflightRequest,
	createErrorResponse,
	createSuccessResponse,
	baseCorsHeaders,
	isOriginAllowed,
} from "../_shared/cors-headers.ts";
import { getAiProviderAdapter } from "../_shared/ai_service/factory.ts";
import { logger } from "../_shared/logger.ts";
import type {
	ChatApiRequest,
	AdapterResponsePayload,
} from "../_shared/types.ts";
import type { Database } from "../types_db.ts";

console.log("Loading chat-stream function...");

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

// Helper function to get proper CORS headers for the request
const getCorsHeaders = (req: Request): Record<string, string> => {
	const origin = req.headers.get("Origin");
	const headers: Record<string, string> = { ...baseCorsHeaders };

	if (isOriginAllowed(origin)) {
		headers["Access-Control-Allow-Origin"] = origin as string;
	}

	return headers;
};

interface ChatStreamRequest {
	message: string;
	providerId: string;
	promptId: string;
	chatId?: string;
	organizationId?: string;
	rewindFromMessageId?: string;
	contextMessages?: Record<string, unknown>[];
	continue_until_complete?: boolean;
}

serve(async (req: Request) => {
	// Handle CORS preflight requests
	const corsResponse = handleCorsPreflightRequest(req);
	if (corsResponse) return corsResponse;

	try {
		console.log("Chat stream request received");
		console.log("Request method:", req.method);
		console.log("Request headers:", Object.fromEntries(req.headers.entries()));

		// Get auth token
		const authHeader = req.headers.get("authorization");
		console.log("Auth header present:", !!authHeader);

		// TEMPORARY: Skip authentication for testing streaming
		console.log(
			"TEMP: Skipping authentication to test streaming functionality",
		);

		// Parse request body
		const requestData: ChatStreamRequest = await req.json();
		console.log("Request data:", requestData);

		// Validate required fields
		if (!requestData.message || !requestData.providerId) {
			return createErrorResponse("Missing required fields", 400, req);
		}

		// Create supabase client for database operations
		const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

		// Get provider data from database
		const { data: providerData, error: providerError } = await supabaseClient
			.from("ai_providers")
			.select("*")
			.eq("id", requestData.providerId)
			.single();

		if (providerError || !providerData) {
			console.error("Provider lookup error:", providerError);
			return createErrorResponse("Provider not found", 404, req);
		}

		if (!providerData.is_active) {
			return createErrorResponse(
				`Provider '${providerData.name}' is currently inactive`,
				400,
				req,
			);
		}

		// Get API key for the provider
		const apiKeyEnvVarName = `${providerData.provider.toUpperCase()}_API_KEY`;
		const apiKey = Deno.env.get(apiKeyEnvVarName);
		if (!apiKey) {
			console.error(
				`API key not found for provider: ${providerData.provider} (expected env var ${apiKeyEnvVarName})`,
			);
			return createErrorResponse(
				`API key for ${providerData.provider} is not configured`,
				500,
				req,
			);
		}

		console.log(
			`Successfully retrieved API key for ${providerData.provider} from env var ${apiKeyEnvVarName}`,
		);

		// Get AI provider adapter
		const aiProviderAdapter = getAiProviderAdapter(
			providerData.api_identifier,
			providerData.config,
			apiKey,
			logger,
		);

		if (!aiProviderAdapter) {
			console.error(`No adapter found for provider: ${providerData.provider}`);
			return createErrorResponse("Provider adapter not available", 500, req);
		}

		// Create SSE response
		const stream = new ReadableStream({
			start(controller) {
				console.log("Starting SSE stream with real AI");

				// Send initial connection event
				const connectionEvent = `event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`;
				controller.enqueue(new TextEncoder().encode(connectionEvent));

				// Handle AI streaming response
				const streamAiResponse = async () => {
					try {
						console.log("Preparing request for AI adapter...");

						// Prepare chat request for adapter
						const adapterChatRequest: ChatApiRequest = {
							message: requestData.message,
							messages: (requestData.contextMessages || []).map((msg) => ({
								role: msg.role as "system" | "user" | "assistant",
								content: String(msg.content),
							})),
							providerId: requestData.providerId,
							promptId: requestData.promptId,
							chatId: requestData.chatId,
							organizationId: requestData.organizationId,
							continue_until_complete: requestData.continue_until_complete,
							max_tokens_to_generate: 1000, // Default, could be configurable
						};

						console.log("Calling AI adapter...");

						// Check if provider supports streaming (currently OpenAI does)
						if (providerData.provider.toLowerCase() === "openai") {
							// Use OpenAI streaming
							await streamOpenAIResponse(
								controller,
								adapterChatRequest,
								providerData.api_identifier,
								apiKey,
								requestData,
							);
						} else {
							// Fallback to non-streaming for other providers
							console.log(
								"Using non-streaming adapter for provider:",
								providerData.provider,
							);
							const adapterResponse = await aiProviderAdapter.sendMessage(
								adapterChatRequest,
								providerData.api_identifier,
							);

							// Send the complete response as chunks
							const content = adapterResponse.content;
							const words = content.split(" ");

							for (let i = 0; i < words.length; i++) {
								const chunk = words[i] + (i < words.length - 1 ? " " : "");

								const chunkEvent = `event: chunk\ndata: ${JSON.stringify({
									content: chunk,
									index: i,
									total: words.length,
								})}\n\n`;

								controller.enqueue(new TextEncoder().encode(chunkEvent));

								// Add small delay to simulate streaming
								await new Promise((resolve) => setTimeout(resolve, 50));
							}

							// Send completion event
							const completeEvent = `event: complete\ndata: ${JSON.stringify({
								userMessage: {
									id: `user_${Date.now()}`,
									content: requestData.message,
									role: "user",
								},
								assistantMessage: {
									id: `assistant_${Date.now()}`,
									content: content,
									role: "assistant",
								},
								chatId: requestData.chatId || `chat_${Date.now()}`,
								tokenUsage: adapterResponse.token_usage,
							})}\n\n`;

							controller.enqueue(new TextEncoder().encode(completeEvent));
						}

						console.log("AI streaming completed");
						controller.close();
					} catch (error) {
						console.error("AI streaming error:", error);
						const errorMessage =
							error instanceof Error ? error.message : "AI streaming error";
						const errorEvent = `event: error\ndata: ${JSON.stringify({
							error: errorMessage,
						})}\n\n`;
						controller.enqueue(new TextEncoder().encode(errorEvent));
						controller.close();
					}
				};

				// Start the AI streaming
				streamAiResponse();
			},
		});

		return new Response(stream, {
			headers: {
				...getCorsHeaders(req),
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Chat stream error:", error);
		return createErrorResponse(
			(error as Error).message || "Internal server error",
			500,
			req,
		);
	}
});

// OpenAI streaming implementation
async function streamOpenAIResponse(
	controller: ReadableStreamDefaultController,
	adapterChatRequest: ChatApiRequest,
	apiIdentifier: string,
	apiKey: string,
	originalRequest: ChatStreamRequest,
) {
	const OPENAI_API_BASE = "https://api.openai.com/v1";
	const openaiUrl = `${OPENAI_API_BASE}/chat/completions`;

	// Remove provider prefix if present
	const modelApiName = apiIdentifier.replace(/^openai-/i, "");

	// Map app messages to OpenAI format
	const openaiMessages = (adapterChatRequest.messages ?? [])
		.map((msg) => ({
			role: msg.role,
			content: msg.content,
		}))
		.filter((msg) => msg.content);

	// Add the current user message
	if (adapterChatRequest.message) {
		openaiMessages.push({ role: "user", content: adapterChatRequest.message });
	}

	const openaiPayload = {
		model: modelApiName,
		messages: openaiMessages,
		stream: true, // Enable streaming
		max_tokens: adapterChatRequest.max_tokens_to_generate || 1000,
	};

	console.log(`Sending streaming request to OpenAI model: ${modelApiName}`);

	const response = await fetch(openaiUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(openaiPayload),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		console.error(`OpenAI API error (${response.status}): ${errorBody}`);
		throw new Error(
			`OpenAI API request failed: ${response.status} ${response.statusText}`,
		);
	}

	if (!response.body) {
		throw new Error("No response body from OpenAI");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let fullContent = "";
	let chunkIndex = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");

			// Keep the last incomplete line in buffer
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = line.slice(6).trim();

					if (data === "[DONE]") {
						// OpenAI streaming completion signal
						continue;
					}

					try {
						const parsed = JSON.parse(data);
						const delta = parsed.choices?.[0]?.delta;

						if (delta?.content) {
							const content = delta.content;
							fullContent += content;
							chunkIndex++;

							// Send chunk event
							const chunkEvent = `event: chunk\ndata: ${JSON.stringify({
								content: content,
								index: chunkIndex,
								delta: true, // Indicates this is a streaming delta
							})}\n\n`;

							controller.enqueue(new TextEncoder().encode(chunkEvent));
							console.log(`Sent chunk ${chunkIndex}: "${content}"`);
						}
					} catch (parseError) {
						console.warn(
							"Failed to parse OpenAI stream data:",
							data,
							parseError,
						);
					}
				}
			}
		}

		// Send completion event with full message
		const completeEvent = `event: complete\ndata: ${JSON.stringify({
			userMessage: {
				id: `user_${Date.now()}`,
				content: adapterChatRequest.message,
				role: "user",
			},
			assistantMessage: {
				id: `assistant_${Date.now()}`,
				content: fullContent,
				role: "assistant",
			},
			chatId: originalRequest.chatId || `chat_${Date.now()}`,
			tokenUsage: {
				// Note: We don't get exact token counts from streaming
				// These would need to be estimated or calculated separately
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
				cost: 0,
			},
		})}\n\n`;

		controller.enqueue(new TextEncoder().encode(completeEvent));
		console.log("OpenAI streaming completed successfully");
	} finally {
		reader.releaseLock();
	}
}
