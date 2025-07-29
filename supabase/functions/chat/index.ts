// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
// Use js-tiktoken for simpler Deno compatibility
// Import shared response/error handlers
import {
	handleCorsPreflightRequest,
	createErrorResponse,
	createSuccessResponse,
} from "../_shared/cors-headers.ts";
// Import AI service factory and necessary types
import { getAiProviderAdapter } from "../_shared/ai_service/factory.ts";
// Use import type for type-only imports
import type {
	ChatApiRequest,
	ChatHandlerDeps,
	AdapterResponsePayload,
	ChatHandlerSuccessResponse,
	PerformChatRewindArgs,
	ChatMessageInsert,
	ChatMessageRow,
	ChatMessageRole,
} from "../_shared/types.ts";
import type { Database, Json } from "../types_db.ts";
import { logger } from "../_shared/logger.ts"; // Renamed to avoid conflict with deps.logger
import { TokenWalletService } from "../_shared/services/tokenWalletService.ts";
import { countTokensForMessages } from "../_shared/utils/tokenizer_utils.ts";
import { calculateActualChatCost } from "../_shared/utils/cost_utils.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import {
	TokenWallet,
	TokenWalletTransactionType,
} from "../_shared/types/tokenWallet.types.ts";
import { handleContinuationLoop } from "./continue.ts";

// --- Zod Schemas for Runtime Validation ---
const TokenUsageSchema = z.object({
	prompt_tokens: z.number(),
	completion_tokens: z.number(),
	total_tokens: z.number(),
});

const TiktokenEncodingSchema = z.enum([
	"cl100k_base",
	"p50k_base",
	"r50k_base",
	"gpt2",
	"o200k_base",
]);
const TiktokenModelForRulesSchema = z.enum([
	"gpt-4",
	"gpt-3.5-turbo",
	"gpt-4o",
	"gpt-3.5-turbo-0301",
]);

const TokenizationStrategySchema = z.union([
	z.object({
		type: z.literal("tiktoken"),
		tiktoken_encoding_name: TiktokenEncodingSchema,
		tiktoken_model_name_for_rules_fallback:
			TiktokenModelForRulesSchema.optional(),
		is_chatml_model: z.boolean().optional(),
		api_identifier_for_tokenization: z.string().optional(),
	}),
	z.object({
		type: z.literal("rough_char_count"),
		chars_per_token_ratio: z.number().optional(),
	}),
	z.object({ type: z.literal("claude_tokenizer") }),
	z.object({ type: z.literal("google_gemini_tokenizer") }),
	z.object({ type: z.literal("none") }),
]);

const AiModelExtendedConfigSchema = z.object({
	model_id: z.string().optional(),
	api_identifier: z.string(),
	input_token_cost_rate: z.number().nullable(),
	output_token_cost_rate: z.number().nullable(),
	tokenization_strategy: TokenizationStrategySchema,
	hard_cap_output_tokens: z.number().optional(),
	context_window_tokens: z.number().optional().nullable(),
	service_default_input_cost_rate: z.number().optional(),
	service_default_output_cost_rate: z.number().optional(),
	status: z.enum(["active", "beta", "deprecated", "experimental"]).optional(),
	features: z.array(z.string()).optional(),
	max_context_window_tokens: z.number().optional(),
	notes: z.string().optional(),
	provider_max_input_tokens: z.number().optional(),
	provider_max_output_tokens: z.number().optional(),
	default_temperature: z.number().optional(),
	default_top_p: z.number().optional(),
});

// --- Type Guard Functions ---
function isChatMessageRole(role: string): role is ChatMessageRole {
	return ["system", "user", "assistant"].includes(role);
}

// Create default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
	createSupabaseClient: createClient,
	fetch: fetch,
	handleCorsPreflightRequest,
	createSuccessResponse,
	createErrorResponse,
	getAiProviderAdapter: (
		providerApiIdentifier: string,
		providerDbConfig: Json | null,
		apiKey: string,
		logger?: import("../_shared/types.ts").ILogger,
	) => {
		const adapter = getAiProviderAdapter(
			providerApiIdentifier,
			providerDbConfig,
			apiKey,
			logger,
		);
		if (!adapter) {
			logger?.error(
				`[defaultDeps] No adapter found by factory for provider API identifier: ${providerApiIdentifier}`,
			);
			throw new Error(
				`Adapter not found for provider API identifier: ${providerApiIdentifier}`,
			);
		}
		return adapter;
	},
	verifyApiKey: async (
		apiKey: string,
		providerName: string,
	): Promise<boolean> => {
		logger.warn(
			"[defaultDeps] Using STUB for verifyApiKey. Actual implementation may differ or needs update in auth.ts.",
			{ apiKeyLen: apiKey.length, providerName },
		);
		return apiKey.startsWith("sk-test-");
	},
	logger: logger,
	tokenWalletService: undefined, // Will be created in handler with proper user and admin clients
	countTokensForMessages: countTokensForMessages,
};

// --- Zod Schema for ChatApiRequest ---
const ChatApiRequestSchema = z.object({
	message: z
		.string()
		.min(1, { message: "message is required and cannot be empty." }),
	providerId: z
		.string()
		.uuid({ message: "providerId is required and must be a valid UUID." }),
	promptId: z.union(
		[
			z.string().uuid({
				message:
					"promptId must be a valid UUID if provided and not '__none__'.",
			}),
			z.literal("__none__"),
		],
		{
			errorMap: () => ({
				message: "promptId is required and must be a valid UUID or '__none__'.",
			}),
		},
	),
	chatId: z
		.string()
		.uuid({ message: "If provided, chatId must be a valid UUID." })
		.optional(),
	walletId: z
		.string()
		.uuid({ message: "If provided, walletId must be a valid UUID." })
		.optional(),
	selectedMessages: z
		.array(
			z.object({
				role: z.enum(["system", "user", "assistant"], {
					errorMap: () => ({
						message:
							"selectedMessages.role must be 'system', 'user', or 'assistant'.",
					}),
				}),
				content: z.string(),
			}),
		)
		.optional(),
	messages: z
		.array(
			z.object({
				// This might be deprecated if selectedMessages is primary
				role: z.enum(["system", "user", "assistant"]),
				content: z.string(),
			}),
		)
		.optional(),
	organizationId: z
		.string()
		.uuid({ message: "If provided, organizationId must be a valid UUID." })
		.optional(),
	rewindFromMessageId: z
		.string()
		.uuid({ message: "If provided, rewindFromMessageId must be a valid UUID." })
		.optional(),
	max_tokens_to_generate: z
		.number()
		.int({ message: "max_tokens_to_generate must be an integer." })
		.positive({ message: "max_tokens_to_generate must be positive." })
		.optional(),
	continue_until_complete: z.boolean().optional(),
});

// --- Main Handler ---
export async function handler(
	req: Request,
	deps: ChatHandlerDeps = defaultDeps,
): Promise<Response> {
	const {
		createSupabaseClient: createSupabaseClientDep,
		handleCorsPreflightRequest,
		createSuccessResponse,
		createErrorResponse,
		logger,
	} = deps;

	const corsResponse = handleCorsPreflightRequest(req);
	if (corsResponse) return corsResponse;

	const authHeader = req.headers.get("Authorization");
	if (!authHeader) {
		logger.info("Chat function called without Authorization header.");
		if (req.method === "POST") {
			logger.info(
				"POST request without auth header. Returning AUTH_REQUIRED signal.",
			);
			return createSuccessResponse(
				{ error: "Authentication required", code: "AUTH_REQUIRED" },
				401,
				req,
			);
		} else if (req.method !== "DELETE") {
			logger.info(
				`Non-POST/Non-DELETE request (${req.method}) without auth header. Returning 405.`,
			);
			return createErrorResponse("Method Not Allowed", 405, req);
		}
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
	const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
	if (!supabaseUrl || !supabaseAnonKey) {
		logger.error(
			"Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.",
		);
		return createErrorResponse("Server configuration error.", 500, req);
	}

	const supabaseClient = createSupabaseClientDep(supabaseUrl, supabaseAnonKey, {
		global: { headers: { Authorization: authHeader ?? "" } },
	});

	const {
		data: { user },
		error: userError,
	} = await supabaseClient.auth.getUser();
	if (userError || !user) {
		logger.error("Auth error:", { error: userError || "User not found" });
		return createErrorResponse("Invalid authentication credentials", 401, req);
	}
	const userId = user.id;
	logger.info("Authenticated user:", { userId });

	// Create TokenWalletService with proper user and admin clients
	let tokenWalletService = deps.tokenWalletService;
	if (!tokenWalletService) {
		const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
		if (serviceRoleKey) {
			const adminClient = createClient(supabaseUrl, serviceRoleKey);
			tokenWalletService = new TokenWalletService(supabaseClient, adminClient);
		}
	}

	if (req.method === "POST") {
		try {
			let rawBody;
			try {
				rawBody = await req.json();
			} catch (jsonError) {
				logger.error("Failed to parse request body as JSON:", {
					error: jsonError,
				});
				return createErrorResponse(
					"Invalid JSON format in request body.",
					400,
					req,
				);
			}

			const parsedResult = ChatApiRequestSchema.safeParse(rawBody);

			if (!parsedResult.success) {
				const errorMessages = parsedResult.error.errors
					.map((e: z.ZodIssue) => `${e.path.join(".") || "body"}: ${e.message}`)
					.join(", ");
				logger.warn("Chat API request validation failed:", {
					errors: errorMessages,
					requestBody: rawBody,
				});
				return createErrorResponse(
					`Invalid request body: ${errorMessages}`,
					400,
					req,
				);
			}

			const requestBody = parsedResult.data;

			logger.info("Received chat POST request (validated):", {
				body: requestBody,
			});

			const result = await handlePostRequest(
				requestBody,
				supabaseClient,
				userId,
				{ ...deps, tokenWalletService },
			);

			if (result && "error" in result && result.error) {
				const { message, status } = result.error;
				logger.warn(
					"handlePostRequest returned an error. Propagating as an error response.",
					{
						message,
						status: status || 500,
					},
				);
				return createErrorResponse(message, status || 500, req);
			}

			return createSuccessResponse(result, 200, req);
		} catch (err) {
			logger.error("Unhandled error in POST mainHandler:", {
				error: err instanceof Error ? err.stack : String(err),
			});
			const errorMessage =
				err instanceof Error
					? err.message
					: "An unexpected error occurred processing the chat request.";
			return createErrorResponse(errorMessage, 500, req);
		}
	} else if (req.method === "DELETE") {
		try {
			const url = new URL(req.url);
			const pathSegments = url.pathname.split("/");
			const chatId = pathSegments[pathSegments.length - 1];
			if (!chatId || chatId === "chat") {
				return createErrorResponse(
					"Missing chat ID in URL path for DELETE request.",
					400,
					req,
				);
			}
			logger.info(`Received DELETE request for chat ID: ${chatId}`);
			const { error: rpcError } = await supabaseClient.rpc(
				"delete_chat_and_messages",
				{
					p_chat_id: chatId,
					p_user_id: userId,
				},
			);
			if (rpcError) {
				logger.error(
					`Error calling delete_chat_and_messages RPC for chat ${chatId}:`,
					{ error: rpcError },
				);
				if (
					rpcError.code === "PGRST01" ||
					rpcError.message.includes("permission denied")
				) {
					return createErrorResponse(
						"Permission denied to delete this chat.",
						403,
						req,
					);
				}
				return createErrorResponse(
					rpcError.message || "Failed to delete chat.",
					500,
					req,
				);
			}
			logger.info(`Successfully deleted chat ${chatId} via RPC.`);
			return createSuccessResponse(null, 204, req);
		} catch (err) {
			logger.error("Unhandled error in DELETE handler:", {
				error: err instanceof Error ? err.stack : String(err),
			});
			const errorMessage =
				err instanceof Error ? err.message : "An unexpected error occurred.";
			return createErrorResponse(errorMessage, 500, req);
		}
	} else {
		return createErrorResponse("Method Not Allowed", 405, req);
	}
}

// --- Helper to construct message history ---
async function constructMessageHistory(
	supabaseClient: SupabaseClient<Database>,
	existingChatId: string | null | undefined,
	newUserMessageContent: string,
	system_prompt_text: string | null,
	rewindFromMessageId: string | null | undefined, // Keep for potential future use, though not primary with selectedMessages
	selectedMessages: ChatApiRequest["selectedMessages"],
	logger: ChatHandlerDeps["logger"],
): Promise<{
	history: { role: ChatMessageRole; content: string }[];
	historyFetchError?: Error;
}> {
	const history: { role: ChatMessageRole; content: string }[] = [];
	let historyFetchError: Error | undefined = undefined;

	if (system_prompt_text) {
		history.push({ role: "system", content: system_prompt_text });
	}

	if (selectedMessages && selectedMessages.length > 0) {
		logger.info(
			"constructMessageHistory: Using provided selectedMessages for history.",
			{ count: selectedMessages.length },
		);
		const formattedSelectedMessages = selectedMessages.map((msg) => ({
			role: msg.role,
			content: msg.content,
		}));
		history.push(...formattedSelectedMessages);
	} else if (existingChatId && !rewindFromMessageId) {
		// Only fetch from DB if not rewinding and no selected messages
		logger.info(
			`constructMessageHistory: No selectedMessages, fetching history for chatId: ${existingChatId}`,
		);
		const { data: dbMessages, error: dbError } = await supabaseClient
			.from("chat_messages")
			.select("role, content")
			.eq("chat_id", existingChatId)
			.eq("is_active_in_thread", true) // Important filter
			.order("created_at", { ascending: true });

		if (dbError) {
			logger.error(
				"constructMessageHistory: Error fetching existing chat messages:",
				{ error: dbError },
			);
			historyFetchError = dbError; // Store the error
		} else if (dbMessages) {
			logger.info(
				`constructMessageHistory: Fetched ${dbMessages.length} messages from DB.`,
			);
			for (const msg of dbMessages) {
				if (
					msg &&
					typeof msg.role === "string" &&
					isChatMessageRole(msg.role) &&
					typeof msg.content === "string"
				) {
					history.push({
						role: msg.role,
						content: msg.content,
					});
				} else {
					logger.warn(
						"constructMessageHistory: Filtered out invalid message from DB history",
						{ problematicMessage: msg },
					);
				}
			}
		}
	} else if (rewindFromMessageId) {
		// If rewind is active, the main handlePostRequest logic handles history construction for rewind path
		logger.info(
			"constructMessageHistory: Rewind active, history construction handled by rewind path logic.",
		);
	} else {
		logger.info(
			"constructMessageHistory: No selectedMessages, no existingChatId, and no rewind. History will be minimal.",
		);
	}

	history.push({ role: "user", content: newUserMessageContent });
	logger.info("constructMessageHistory: Final history constructed:", {
		length: history.length,
		lastMessageRole: history[history.length - 1]?.role,
	});
	return { history, historyFetchError };
}

// --- handlePostRequest ---
async function handlePostRequest(
	requestBody: ChatApiRequest,
	supabaseClient: SupabaseClient<Database>,
	userId: string,
	deps: ChatHandlerDeps,
): Promise<
	ChatHandlerSuccessResponse | { error: { message: string; status?: number } }
> {
	const {
		logger,
		tokenWalletService,
		countTokensForMessages: countTokensFn,
		getAiProviderAdapterOverride,
		getAiProviderAdapter: getAiProviderAdapterDep,
	} = deps;

	const {
		message: userMessageContent,
		providerId: requestProviderId,
		promptId: requestPromptId,
		chatId: existingChatId,
		walletId: requestWalletId,
		rewindFromMessageId,
		selectedMessages,
		organizationId,
		max_tokens_to_generate,
		continue_until_complete,
	} = requestBody;

	// systemPromptDbId will be a UUID string or null.
	const systemPromptDbId =
		requestPromptId === "__none__" ? null : requestPromptId;
	let currentChatId: string | null | undefined = existingChatId;

	// --- START: Fetch actual system prompt text if ID is provided ---
	let actualSystemPromptText: string | null = null;
	// This will be the ID used for DB insert. It's null if requestPromptId was "__none__" OR if a UUID was given but not found OR if found but no text.
	let finalSystemPromptIdForDb: string | null = null;

	if (systemPromptDbId) {
		// if requestPromptId was a UUID string
		const clientToUseForSystemPrompt = deps.supabaseClient || supabaseClient;
		logger.info(
			`[SystemPromptFetch] Attempting to fetch system_prompt_text for id: ${systemPromptDbId} using ${deps.supabaseClient ? "deps.supabaseClient (mocked or overridden)" : "user supabaseClient"}`,
		);
		const { data: promptData, error: promptError } =
			await clientToUseForSystemPrompt
				.from("system_prompts")
				.select("prompt_text")
				.eq("id", systemPromptDbId)
				.single();

		if (promptError || !promptData || !promptData.prompt_text) {
			// Consolidated check
			logger.warn(
				"[SystemPromptFetch] Error fetching system_prompt_text, or prompt data/text is missing. finalSystemPromptIdForDb will be null.",
				{ systemPromptDbId, error: promptError, promptData },
			);
			finalSystemPromptIdForDb = null; // Ensure it's null if fetch fails or text is missing
			actualSystemPromptText = null;
		} else {
			actualSystemPromptText = promptData.prompt_text;
			finalSystemPromptIdForDb = systemPromptDbId; // Successfully fetched AND has text, so use the ID for DB.
			logger.info(
				"[SystemPromptFetch] Successfully fetched system_prompt_text (first 50 chars):",
				{ textStart: actualSystemPromptText?.substring(0, 50) },
			);
		}
	} else {
		// if requestPromptId was "__none__", so systemPromptDbId is null
		logger.info(
			`[SystemPromptFetch] No systemPromptDbId to fetch (requestPromptId was: '${requestPromptId}'). actualSystemPromptText remains null, finalSystemPromptIdForDb is null.`,
		);
		finalSystemPromptIdForDb = null; // Explicitly null
		actualSystemPromptText = null;
	}
	// --- END: Fetch actual system prompt text ---

	try {
		// --- 1. Fetch Provider Details & Configuration ---
		const { data: providerData, error: providerError } = await supabaseClient
			.from("ai_providers")
			.select("id, provider, api_identifier, config, is_active, name") // Select all needed fields
			.eq("id", requestProviderId)
			.single();

		if (providerError || !providerData) {
			logger.error("Failed to fetch provider details or provider not found:", {
				providerId: requestProviderId,
				error: providerError,
			});
			return {
				error: {
					message: `Provider with ID ${requestProviderId} not found or error fetching details.`,
					status: 404,
				},
			};
		}

		if (!providerData.is_active) {
			logger.warn("Attempt to use inactive provider:", {
				providerId: requestProviderId,
				name: providerData.name,
			});
			return {
				error: {
					message: `Provider '${providerData.name}' is currently inactive.`,
					status: 400,
				},
			};
		}

		const providerApiIdentifier = providerData.api_identifier; // e.g., "gpt-3.5-turbo", "dummy-echo-v1"
		const providerDatabaseConfig = providerData.config; // This is the Json | null object

		// Combine the top-level api_identifier into the config object before parsing
		const combinedConfigForParsing = {
			...(typeof providerDatabaseConfig === "object" &&
			providerDatabaseConfig !== null
				? providerDatabaseConfig
				: {}),
			api_identifier: providerApiIdentifier,
		};

		const parsedModelConfig = AiModelExtendedConfigSchema.safeParse(
			combinedConfigForParsing,
		);
		if (!parsedModelConfig.success) {
			logger.error("Failed to parse provider config:", {
				providerId: requestProviderId,
				error: parsedModelConfig.error,
			});
			return {
				error: {
					message: `Invalid configuration for provider ID '${requestProviderId}'.`,
					status: 500,
				},
			};
		}
		const modelConfig = parsedModelConfig.data;
		logger.info("Fetched provider details:", {
			providerString: providerData.provider,
			api_identifier: providerApiIdentifier,
		});

		if (
			!providerData.provider ||
			typeof providerData.provider !== "string" ||
			providerData.provider.trim() === ""
		) {
			logger.error(
				"Provider name (providerData.provider) is missing or invalid.",
				{
					providerId: requestProviderId,
					receivedProviderName: providerData.provider,
				},
			);
			return {
				error: {
					message: `Configuration for provider ID '${requestProviderId}' has an invalid provider name.`,
					status: 500,
				},
			};
		}

		if (!modelConfig || typeof modelConfig !== "object") {
			// This check is for AiModelExtendedConfig, separate from providerDatabaseConfig for factory
			logger.error(
				"Provider config (for AiModelExtendedConfig) is missing or invalid.",
				{
					providerId: requestProviderId,
					providerString: providerData.provider,
				},
			);
			return {
				error: {
					message: `Extended model configuration for provider '${providerData.name}' is missing or invalid.`,
					status: 500,
				},
			};
		}
		logger.info("Parsed AiModelExtendedConfig from providerData.config", {
			modelIdentifier: modelConfig.api_identifier,
		});

		const apiKeyEnvVarName = `${providerData.provider.toUpperCase()}_API_KEY`;
		const apiKey = Deno.env.get(apiKeyEnvVarName);
		if (!apiKey) {
			logger.error(
				`API key not found for provider: ${providerData.provider} (expected env var ${apiKeyEnvVarName})`,
			);
			return {
				error: {
					message: `API key for ${providerData.provider} is not configured.`,
					status: 500,
				},
			};
		}
		logger.info(
			`Successfully retrieved API key for ${providerData.provider} from env var ${apiKeyEnvVarName}`,
		);

		// --- 3. Instantiate AI Provider Adapter ---
		const adapterToUse = getAiProviderAdapterOverride
			? getAiProviderAdapterOverride
			: getAiProviderAdapterDep;

		let aiProviderAdapter;
		try {
			// Pass providerData.api_identifier, providerData.config (as providerDatabaseConfig), and the resolved apiKey
			aiProviderAdapter = adapterToUse(
				providerApiIdentifier,
				providerDatabaseConfig,
				apiKey,
				logger,
			);
		} catch (e) {
			if (e instanceof Error && e.message.startsWith("Adapter not found")) {
				logger.error(
					"Failed to instantiate AI provider adapter (caught in handlePostRequest):",
					{ providerApiIdentifier, error: e.message },
				);
				return {
					error: {
						message: `Unsupported or misconfigured AI provider: ${providerApiIdentifier}`,
						status: 400,
					},
				};
			}
			// Re-throw other errors to be caught by the main try-catch in the handler or the outer try-catch in this function.
			throw e;
		}

		if (!aiProviderAdapter) {
			// This check might now be redundant if adapterToUse always throws on failure, but kept for safety.
			logger.error(
				"Failed to instantiate AI provider adapter (post-try-catch check).",
				{ providerApiIdentifier },
			);
			return {
				error: {
					message: `Unsupported or misconfigured AI provider: ${providerApiIdentifier}`,
					status: 400,
				},
			};
		}

		let wallet: TokenWallet | null = null;
		try {
			if (requestWalletId) {
				// Placeholder for fetching a specific wallet by ID, ensuring user has access
				// This method will need to be implemented in TokenWalletService
				logger.info("Attempting to fetch specific wallet by ID.", {
					requestWalletId,
					userId,
				});
				wallet = await tokenWalletService!.getWalletByIdAndUser(
					requestWalletId,
					userId,
				);
				if (!wallet) {
					logger.warn("Specific token wallet not found or user lacks access.", {
						requestWalletId,
						userId,
					});
					return {
						error: {
							message: `Token wallet with ID ${requestWalletId} not found or access denied.`,
							status: 403,
						},
					}; // 403 Forbidden or 404 Not Found
				}
				logger.info("Specific wallet retrieved.", {
					walletId: wallet.walletId,
					currentBalance: wallet.balance,
				});
			} else {
				logger.info(
					"No specific walletId provided, using context-based wallet.",
					{ userId, organizationId },
				);
				wallet = await tokenWalletService!.getWalletForContext(
					userId,
					organizationId,
				);
				if (!wallet) {
					logger.warn("No token wallet found for context (user/org).", {
						userId,
						organizationId,
					});
					return {
						error: {
							message:
								"Token wallet not found for your context. Please set up or fund your wallet.",
							status: 402,
						},
					};
				}
				logger.info("Context wallet retrieved.", {
					walletId: wallet.walletId,
					currentBalance: wallet.balance,
				});
			}
		} catch (error) {
			logger.error("Error during token wallet operations:", {
				error: error,
				userId,
				organizationId,
				requestWalletId,
			});
			// It's important to distinguish between client errors (wallet not found) and server errors
			const errorMessage =
				error instanceof Error &&
				(error.message.includes("not found") ||
					error.message.includes("denied"))
					? error.message
					: "Server error during wallet check.";
			const errorStatus =
				error instanceof Error &&
				(error.message.includes("not found") ||
					error.message.includes("denied"))
					? error.message.includes("denied")
						? 403
						: 404
					: 500;
			return { error: { message: errorMessage, status: errorStatus } };
		}

		// --- 4. Branch Logic: Rewind vs. Normal ---
		if (rewindFromMessageId) {
			// --- 4a. Rewind Path ---
			logger.info(
				`Rewind request detected. Rewinding from message ID: ${rewindFromMessageId}`,
			);
			if (!currentChatId) {
				logger.warn(
					'handlePostRequest: Rewind requested but no "chatId" provided.',
				);
				return {
					error: {
						message: 'Cannot perform rewind without a "chatId"',
						status: 400,
					},
				};
			}

			const { data: rewindPointData, error: rewindPointError } =
				await supabaseClient
					.from("chat_messages")
					.select("created_at")
					.eq("id", rewindFromMessageId)
					.eq("chat_id", currentChatId)
					.single();
			if (rewindPointError || !rewindPointData) {
				logger.error(
					`Rewind error: Failed to find rewind point message ${rewindFromMessageId} in chat ${currentChatId}`,
					{ error: rewindPointError },
				);
				return {
					error: {
						message:
							rewindPointError?.message ||
							"Failed to retrieve rewind point details.",
						status: 404,
					},
				};
			}
			const rewindPointTimestamp = rewindPointData.created_at;
			logger.info(`Found rewind point timestamp: ${rewindPointTimestamp}`);

			const { data: historyData, error: historyError } = await supabaseClient
				.from("chat_messages")
				.select("*")
				.eq("chat_id", currentChatId)
				.eq("is_active_in_thread", true)
				.lte("created_at", rewindPointTimestamp)
				.order("created_at", { ascending: true });
			if (historyError) {
				logger.error(
					"Rewind error: Failed to fetch chat history for AI context.",
					{ error: historyError },
				);
				return { error: { message: historyError.message, status: 500 } };
			}
			const chatHistoryForAI: ChatMessageRow[] = historyData || [];
			logger.info(
				`Fetched ${chatHistoryForAI.length} messages for AI context (up to rewind point).`,
			);

			const messagesForAdapter: { role: ChatMessageRole; content: string }[] =
				[];
			if (actualSystemPromptText) {
				messagesForAdapter.push({
					role: "system",
					content: actualSystemPromptText,
				});
			}
			messagesForAdapter.push(
				...chatHistoryForAI
					.filter(
						(
							msg,
						): msg is ChatMessageRow & {
							role: ChatMessageRole;
							content: string;
						} =>
							!!(
								msg.role &&
								isChatMessageRole(msg.role) &&
								typeof msg.content === "string"
							),
					)
					.map((msg) => ({
						role: msg.role,
						content: msg.content,
					})),
			);

			const apiKeyForAdapter = apiKey;
			logger.info(
				`Rewind path: Using API key for ${providerData.provider} for token check and adapter.`,
			);

			let maxAllowedOutputTokens: number;
			try {
				if (!modelConfig) {
					logger.error(
						"Critical: modelConfig is null before token counting (rewind path).",
						{
							providerId: requestProviderId,
							apiIdentifier: providerApiIdentifier,
						},
					);
					return {
						error: {
							message:
								"Internal server error: Provider configuration missing for token calculation.",
							status: 500,
						},
					};
				}
				const tokensRequiredForRewind = await countTokensFn(
					messagesForAdapter,
					modelConfig,
				);
				logger.info("Estimated tokens for rewind prompt.", {
					tokensRequiredForRewind,
					model: providerApiIdentifier,
				});

				maxAllowedOutputTokens = getMaxOutputTokens(
					parseFloat(String(wallet.balance)),
					tokensRequiredForRewind,
					modelConfig,
					logger,
				);

				if (maxAllowedOutputTokens < 1) {
					logger.warn("Insufficient token balance for rewind prompt.", {
						currentBalance: wallet.balance,
						tokensRequired: tokensRequiredForRewind,
						maxAllowedOutput: maxAllowedOutputTokens,
					});
					return {
						error: {
							message: `Insufficient token balance. You cannot generate a response.`,
							status: 402,
						},
					};
				}
			} catch (tokenError: unknown) {
				const typedTokenError =
					tokenError instanceof Error
						? tokenError
						: new Error(String(tokenError));
				logger.error(
					"Error estimating tokens or checking balance for rewind prompt:",
					{ error: typedTokenError.message, model: providerApiIdentifier },
				);
				return {
					error: {
						message: `Server error: Could not estimate token cost or check balance. ${typedTokenError.message}`,
						status: 500,
					},
				};
			}
			// --- END: Token Check for Rewind Path ---

			logger.info(
				`Calling AI adapter (${providerData.provider}) for rewind...`,
			);
			let adapterResponsePayload: AdapterResponsePayload;
			try {
				const adapterChatRequest: ChatApiRequest = {
					message: userMessageContent,
					messages: messagesForAdapter,
					providerId: requestProviderId,
					promptId: requestPromptId,
					chatId: currentChatId,
					max_tokens_to_generate: Math.min(
						max_tokens_to_generate || Infinity,
						maxAllowedOutputTokens,
					),
				};
				adapterResponsePayload = await aiProviderAdapter.sendMessage(
					adapterChatRequest,
					providerApiIdentifier,
					apiKeyForAdapter, // Use the correctly scoped and determined API key
				);
				logger.info("AI adapter returned successfully for rewind.");
			} catch (adapterError) {
				logger.error(
					`Rewind error: AI adapter (${providerData.provider}) failed.`,
					{ error: adapterError },
				);
				const errorMessage =
					adapterError instanceof Error
						? adapterError.message
						: "AI service request failed.";

				const assistantErrorContent = `AI service request failed (rewind): ${errorMessage}`;
				const assistantErrorMessageData: ChatMessageInsert = {
					id: generateUUID(),
					chat_id: currentChatId,
					user_id: userId,
					role: "assistant",
					content: assistantErrorContent,
					ai_provider_id: requestProviderId,
					system_prompt_id: systemPromptDbId,
					token_usage: null,
					error_type: "ai_provider_error",
					is_active_in_thread: true,
				};

				// User message in rewind path is the new user message for the rewind.
				// It is NOT saved by the perform_chat_rewind RPC if AI fails.
				// So we should save it here.
				const userMessageInsertOnErrorRewind: ChatMessageInsert = {
					chat_id: currentChatId,
					user_id: userId,
					role: "user",
					content: userMessageContent, // This is the NEW user message
					is_active_in_thread: true,
					ai_provider_id: requestProviderId,
					system_prompt_id: systemPromptDbId,
				};
				const {
					data: savedUserMessageOnErrorRewind,
					error: userInsertErrorOnErrorRewind,
				} = await supabaseClient
					.from("chat_messages")
					.insert(userMessageInsertOnErrorRewind)
					.select()
					.single();

				if (userInsertErrorOnErrorRewind || !savedUserMessageOnErrorRewind) {
					logger.error(
						"Failed to save user message after AI provider error (rewind).",
						{ error: userInsertErrorOnErrorRewind },
					);
					return {
						error: {
							message: `AI service failed (rewind) and user message could not be saved: ${errorMessage}`,
							status: 500,
						},
					};
				}

				const {
					data: savedAssistantErrorMessageRewind,
					error: assistantErrorInsertErrorRewind,
				} = await supabaseClient
					.from("chat_messages")
					.insert(assistantErrorMessageData)
					.select()
					.single();

				if (
					assistantErrorInsertErrorRewind ||
					!savedAssistantErrorMessageRewind
				) {
					logger.error(
						"Failed to save assistant error message after AI provider error (rewind).",
						{ error: assistantErrorInsertErrorRewind },
					);
					return {
						error: {
							message: `AI service failed (rewind) and assistant error message could not be saved: ${errorMessage}`,
							status: 500,
						},
					};
				}

				// Mark prior messages in thread as inactive since this is a new turn after rewind point but AI failed
				// This is tricky because perform_chat_rewind would have handled this.
				// For now, let's rely on the fact that new messages are active.
				// The UI should primarily show active messages.

				return {
					userMessage: savedUserMessageOnErrorRewind,
					assistantMessage: savedAssistantErrorMessageRewind,
					chatId: currentChatId,
					isRewind: true, // Indicate it was a rewind attempt
					// _error_for_main_handler_status: { message: errorMessage, status: 502 } // REMOVED - Signal to main handler
				};
			}

			const rpcParams: PerformChatRewindArgs = {
				p_chat_id: currentChatId,
				p_rewind_from_message_id: rewindFromMessageId,
				p_user_id: userId,
				p_new_user_message_content: userMessageContent,
				p_new_user_message_ai_provider_id: requestProviderId,
				p_new_assistant_message_content: adapterResponsePayload.content,
				p_new_assistant_message_ai_provider_id: requestProviderId,
				// Optional parameters (defaults in SQL), pass undefined if null to match type generation
				p_new_user_message_system_prompt_id:
					systemPromptDbId === null ? undefined : systemPromptDbId,
				p_new_assistant_message_token_usage:
					adapterResponsePayload.token_usage === null
						? undefined
						: adapterResponsePayload.token_usage,
				p_new_assistant_message_system_prompt_id:
					systemPromptDbId === null ? undefined : systemPromptDbId,
				p_new_assistant_message_error_type: undefined, // For successful rewind, this is conceptually null/not set
			};
			logger.info("Calling perform_chat_rewind RPC with params:", {
				rpcParams,
			});

			const { data: rpcResultArray, error: rpcError } =
				await supabaseClient.rpc("perform_chat_rewind", rpcParams);

			if (rpcError) {
				logger.error("Rewind error: perform_chat_rewind RPC failed.", {
					error: rpcError,
				});
				return { error: { message: rpcError.message, status: 500 } };
			}

			// The RPC returns an array with a single object containing the two IDs
			const rpcResult = rpcResultArray;

			if (
				!rpcResult ||
				rpcResult.length !== 1 ||
				!rpcResult[0].new_user_message_id ||
				!rpcResult[0].new_assistant_message_id
			) {
				logger.error(
					"Rewind error: perform_chat_rewind RPC returned unexpected data format or missing IDs.",
					{ result: rpcResult },
				);
				return {
					error: {
						message: "Chat rewind operation failed to return expected ID data.",
						status: 500,
					},
				};
			}

			const newInsertedUserMessageId = rpcResult[0].new_user_message_id;
			const newInsertedAssistantMessageId =
				rpcResult[0].new_assistant_message_id;

			// Now fetch the full messages using these IDs
			const { data: newUserMessageData, error: newUserError } =
				await supabaseClient
					.from("chat_messages")
					.select("*")
					.eq("id", newInsertedUserMessageId)
					.single();

			const { data: newAssistantMessageData, error: newAssistantError } =
				await supabaseClient
					.from("chat_messages")
					.select("*")
					.eq("id", newInsertedAssistantMessageId)
					.single();

			if (newUserError || !newUserMessageData) {
				logger.error(
					"Rewind error: Failed to fetch new user message after RPC.",
					{ id: newInsertedUserMessageId, error: newUserError },
				);
				return {
					error: {
						message: "Failed to retrieve new user message post-rewind.",
						status: 500,
					},
				};
			}
			if (newAssistantError || !newAssistantMessageData) {
				logger.error(
					"Rewind error: Failed to fetch new assistant message after RPC.",
					{ id: newInsertedAssistantMessageId, error: newAssistantError },
				);
				return {
					error: {
						message: "Failed to retrieve new assistant message post-rewind.",
						status: 500,
					},
				};
			}

			const newUserMessageFromRpc = newUserMessageData;
			const newAssistantMessageFromRpc = newAssistantMessageData;

			// --- START: Token Debit for Rewind Path ---
			const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(
				adapterResponsePayload.token_usage,
			);
			if (!parsedTokenUsage.success) {
				logger.error("Rewind path: Failed to parse token_usage from adapter.", {
					error: parsedTokenUsage.error,
					payload: adapterResponsePayload.token_usage,
				});
				return {
					error: {
						message: "Received invalid token usage data from AI provider.",
						status: 502,
					},
				};
			}
			const tokenUsageFromAdapter = parsedTokenUsage.data;
			const actualTokensToDebit = calculateActualChatCost(
				tokenUsageFromAdapter,
				modelConfig,
				logger,
			);

			if (actualTokensToDebit > 0) {
				logger.info(
					"Attempting to record token transaction (debit) for rewind.",
					{
						walletId: wallet.walletId,
						actualTokensToDebit,
						relatedEntityId: newAssistantMessageFromRpc.id,
					},
				);
				try {
					const debitType: TokenWalletTransactionType = "DEBIT_USAGE";
					const transactionData = {
						walletId: wallet.walletId,
						type: debitType,
						amount: String(actualTokensToDebit),
						recordedByUserId: userId,
						idempotencyKey: crypto.randomUUID(),
						relatedEntityId: newAssistantMessageFromRpc.id,
						relatedEntityType: "chat_message",
						notes: `Token usage for rewind and new message in chat ${currentChatId}. Model: ${modelConfig?.api_identifier || "unknown"}. Input Tokens: ${tokenUsageFromAdapter?.prompt_tokens || 0}, Output Tokens: ${tokenUsageFromAdapter?.completion_tokens || 0}.`,
					};
					const transaction =
						await tokenWalletService!.recordTransaction(transactionData);
					logger.info("Token transaction recorded (debit) for rewind.", {
						transactionId: transaction.transactionId,
						walletId: wallet.walletId,
						amount: actualTokensToDebit,
					});
				} catch (debitError: unknown) {
					const typedDebitError =
						debitError instanceof Error
							? debitError
							: new Error(String(debitError));

					if (typedDebitError.message.includes("Insufficient funds")) {
						logger.warn("Insufficient token balance for rewind debit.", {
							walletId: wallet.walletId,
							debitAmount: actualTokensToDebit,
							error: typedDebitError.message,
						});
						return {
							error: {
								message:
									"Insufficient token balance to complete the rewind operation.",
								status: 402, // Payment Required
							},
						};
					}

					// For other debit errors, log it but don't block the response since the message is already saved.
					// This could be flagged for administrative review.
					logger.error(
						"Non-funds-related error recording token debit transaction for rewind. The user has received the response.",
						{
							error: typedDebitError.message,
							walletId: wallet.walletId,
							actualTokensConsumed: actualTokensToDebit,
						},
					);
				}
			} else {
				logger.warn(
					"Calculated debit amount for rewind is zero or less, skipping debit.",
					{ tokenUsageFromAdapter, calculatedAmount: actualTokensToDebit },
				);
			}
			// --- END: Token Debit for Rewind Path ---

			logger.info(
				"perform_chat_rewind RPC successful. Returning new user and assistant messages.",
			);
			return {
				userMessage: newUserMessageFromRpc,
				assistantMessage: newAssistantMessageFromRpc,
				chatId: currentChatId,
				isRewind: true,
			};
		} else {
			// --- 4b. Normal Path (No Rewind) ---
			logger.info("Normal request processing (no rewind).");

			if (currentChatId) {
				// A chatId (UUID) was provided by the client. Check if it exists.
				logger.info(
					`Client provided chatId: ${currentChatId}. Checking if chat exists.`,
				);
				const { data: chatLookupData, error: chatLookupError } =
					await supabaseClient
						.from("chats")
						.select("id")
						.eq("id", currentChatId)
						.maybeSingle(); // Use maybeSingle to not error if not found

				if (chatLookupError) {
					logger.error(
						`Error looking up chat by client-provided ID ${currentChatId}:`,
						{ error: chatLookupError },
					);
					return {
						error: {
							message: `Error verifying chat session: ${chatLookupError.message}`,
							status: 500,
						},
					};
				}

				if (chatLookupData) {
					logger.info(
						`Chat with client-provided ID ${currentChatId} already exists. Proceeding.`,
					);
					// currentChatId is already correctly set.
				} else {
					// Chat does not exist, create it with the client-provided UUID.
					logger.info(
						`Chat with client-provided ID ${currentChatId} not found. Creating new chat session with this ID.`,
					);
					const { data: newChatInsertData, error: newChatInsertError } =
						await supabaseClient
							.from("chats")
							.insert({
								id: currentChatId, // Use the client-provided UUID
								user_id: userId,
								organization_id: organizationId || null,
								system_prompt_id: finalSystemPromptIdForDb,
								title: userMessageContent.substring(0, 50),
							})
							.select("id") // Select to confirm
							.single();

					if (newChatInsertError) {
						// Error could be due to a race condition (e.g., unique violation '23505' if another request created it just now)
						if (newChatInsertError.code === "23505") {
							logger.warn(
								`Attempted to insert new chat with ID '${currentChatId}', but it was likely created by a concurrent request. Proceeding.`,
								{ error: newChatInsertError },
							);
							// currentChatId is already correct.
						} else {
							logger.error(
								`Error creating new chat session with client-provided ID ${currentChatId}:`,
								{ error: newChatInsertError },
							);
							return {
								error: {
									message:
										newChatInsertError.message ||
										`Failed to create new chat session with ID ${currentChatId}.`,
									status: 500,
								},
							};
						}
					} else if (!newChatInsertData) {
						logger.error(
							`Failed to create new chat session with client-provided ID ${currentChatId} (no data returned from insert).`,
						);
						return {
							error: {
								message: `Failed to create new chat session with ID ${currentChatId} (no data).`,
								status: 500,
							},
						};
					} else {
						logger.info(
							`New chat session successfully created with client-provided ID: ${newChatInsertData.id}`,
						);
						// currentChatId is already correct (and newChatInsertData.id should match)
					}
				}
			} else {
				// No chatId provided by the client (fallback, should be rare if client always sends UUID)
				logger.warn(
					"No existingChatId provided by client. Generating new UUID for chat session server-side.",
				);
				currentChatId = crypto.randomUUID(); // Generate UUID server-side

				const { data: newChatData, error: newChatError } = await supabaseClient
					.from("chats")
					.insert({
						id: currentChatId, // Use server-generated UUID
						user_id: userId,
						organization_id: organizationId || null,
						system_prompt_id: finalSystemPromptIdForDb,
						title: userMessageContent.substring(0, 50),
					})
					.select("id")
					.single();

				if (newChatError || !newChatData) {
					logger.error(
						"Error creating new chat session with server-generated UUID:",
						{ error: newChatError, generatedId: currentChatId },
					);
					return {
						error: {
							message:
								newChatError?.message || "Failed to create new chat session.",
							status: 500,
						},
					};
				}
				// currentChatId was already set to the generated UUID
				logger.info(
					`New chat session created with server-generated ID: ${currentChatId}`,
				);
			}

			// --- Construct Message History using the helper function ---
			// At this point, currentChatId is guaranteed to be a valid UUID for an existing or just-created chat.
			// The constructMessageHistory function will attempt to fetch messages.
			// If it's a brand new chat, it will correctly find no messages, which is fine.
			let { history: messagesForProvider, historyFetchError } =
				await constructMessageHistory(
					supabaseClient,
					currentChatId, // This might be an existingChatId or a newly generated one
					userMessageContent,
					actualSystemPromptText,
					rewindFromMessageId, // null in this path
					selectedMessages,
					logger,
				);

			if (
				historyFetchError &&
				existingChatId &&
				existingChatId === currentChatId
			) {
				// An error occurred fetching history for a chat that was supposed to exist (client-provided ID).
				// Log the error and treat this as a new chat creation.
				logger.warn(
					`Error fetching message history for client-provided chatId ${existingChatId}. Proceeding to create a new chat.`,
					{ error: historyFetchError },
				);

				// Generate a new chatId
				const newChatIdAfterHistoryError = crypto.randomUUID();
				logger.info(
					`New chat ID generated after history fetch error: ${newChatIdAfterHistoryError}`,
				);

				// Attempt to insert this new chat
				const { data: newChatData, error: newChatError } = await supabaseClient
					.from("chats")
					.insert({
						id: newChatIdAfterHistoryError, // Use the NEW server-generated UUID
						user_id: userId,
						organization_id: organizationId || null,
						system_prompt_id: finalSystemPromptIdForDb,
						title: userMessageContent.substring(0, 50),
					})
					.select("id")
					.single();

				if (newChatError || !newChatData) {
					logger.error(
						"Error creating new chat session after history fetch error:",
						{ error: newChatError, generatedId: newChatIdAfterHistoryError },
					);
					// If even creating a new chat fails, then it's a more serious problem.
					return {
						error: {
							message:
								newChatError?.message ||
								"Failed to create new chat session after history error.",
							status: 500,
						},
					};
				}

				currentChatId = newChatIdAfterHistoryError; // Update currentChatId to the new one
				logger.info(
					`Successfully created new chat ${currentChatId} after previous history fetch failure.`,
				);

				// Re-construct messagesForProvider: it will be just the system prompt (if any) and the user message
				// as no DB history is available for this new chat.
				messagesForProvider = [];
				if (actualSystemPromptText) {
					messagesForProvider.push({
						role: "system",
						content: actualSystemPromptText,
					});
				}
				messagesForProvider.push({ role: "user", content: userMessageContent });
				historyFetchError = undefined; // Clear the error as we've handled it by creating a new chat
			} else if (historyFetchError) {
				// This is an error fetching history, but it wasn't for an existingChatId that the client specified,
				// or some other unhandled scenario. This path should ideally not be hit if the logic above is correct for new chats.
				// For safety, retain the original error behavior.
				logger.error(
					`Error fetching message history for chat ${currentChatId} (chat should exist or was just server-created):`,
					{ error: historyFetchError },
				);
				return {
					error: {
						message: `Failed to fetch message history: ${historyFetchError.message}`,
						status: 500,
					},
				};
			}
			// The old blocks for re-checking !currentChatId or handling historyFetchError by nulling currentChatId are removed.

			// --- Pre-flight affordability check for Normal Path ---
			let maxAllowedOutputTokens: number;
			try {
				if (!modelConfig) {
					logger.error(
						"Critical: modelConfig is null before token counting (normal path).",
						{
							providerId: requestProviderId,
							apiIdentifier: providerApiIdentifier,
						},
					);
					return {
						error: {
							message:
								"Internal server error: Provider configuration missing for token calculation.",
							status: 500,
						},
					};
				}
				const tokensRequiredForNormal = await countTokensFn(
					messagesForProvider,
					modelConfig,
				);
				logger.info("Estimated tokens for normal prompt.", {
					tokensRequiredForNormal,
					model: providerApiIdentifier,
				});

				if (
					modelConfig.provider_max_input_tokens &&
					tokensRequiredForNormal > modelConfig.provider_max_input_tokens
				) {
					logger.warn("Request exceeds provider max input tokens.", {
						tokensRequired: tokensRequiredForNormal,
						providerMaxInput: modelConfig.provider_max_input_tokens,
						model: providerApiIdentifier,
					});
					return {
						error: {
							message: `Your message is too long. The maximum allowed length for this model is ${modelConfig.provider_max_input_tokens} tokens, but your message is ${tokensRequiredForNormal} tokens.`,
							status: 413,
						},
					};
				}

				maxAllowedOutputTokens = getMaxOutputTokens(
					parseFloat(String(wallet.balance)),
					tokensRequiredForNormal,
					modelConfig,
					logger,
				);

				if (maxAllowedOutputTokens < 1) {
					logger.warn(
						"Insufficient balance for estimated prompt tokens (normal path).",
						{
							walletId: wallet.walletId,
							balance: wallet.balance,
							estimatedCost: tokensRequiredForNormal,
							maxAllowedOutput: maxAllowedOutputTokens,
						},
					);
					return {
						error: {
							message: `Insufficient token balance for this request. Please add funds to your wallet.`,
							status: 402,
						},
					};
				}
			} catch (e: unknown) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				logger.error("Error during token counting for normal prompt:", {
					error: errorMessage,
					model: providerApiIdentifier,
				});
				return {
					error: {
						message: "Internal server error during token calculation.",
						status: 500,
					},
				};
			}
			// --- End pre-flight affordability check ---

			logger.info(`Processing with real provider: ${providerData.provider}`);
			// apiKeyNormal is fetched and used in this block, separate from rewind path's apiKey
			if (!apiKey) {
				logger.error(
					`Critical: API key for ${providerData.provider} was not resolved before normal path adapter call.`,
				);
				return {
					error: {
						message:
							"Internal server error: API key missing for chat operation.",
						status: 500,
					},
				};
			}
			const apiKeyForNormalAdapter = apiKey;

			const adapter = aiProviderAdapter; // Uses apiKeyForNormalAdapter
			if (!adapter) {
				logger.error(
					`Normal path error: No adapter found for provider: ${providerData.provider}`,
				);
				return {
					error: {
						message: `Unsupported AI provider: ${providerData.provider}`,
						status: 400,
					},
				};
			}

			logger.info(
				`Calling AI adapter (${providerData.provider}) for normal response...`,
			);
			let adapterResponsePayload: AdapterResponsePayload;
			try {
				const adapterChatRequestNormal: ChatApiRequest = {
					message: userMessageContent,
					messages: messagesForProvider,
					providerId: requestProviderId,
					promptId: requestPromptId,
					chatId: currentChatId,
					organizationId: organizationId,
					max_tokens_to_generate: Math.min(
						max_tokens_to_generate || Infinity,
						maxAllowedOutputTokens,
					),
				};

				if (continue_until_complete) {
					adapterResponsePayload = await handleContinuationLoop(
						adapter,
						adapterChatRequestNormal,
						providerApiIdentifier,
						apiKeyForNormalAdapter,
						deps.logger,
					);
				} else {
					adapterResponsePayload = await adapter.sendMessage(
						adapterChatRequestNormal,
						providerApiIdentifier,
						apiKeyForNormalAdapter, // Ensure this is the correct key
					);
				}
				logger.info("AI adapter returned successfully (normal path).");

				// --- START: Apply hard_cap_output_tokens if max_tokens_to_generate is not set ---
				const parsedTokenUsage = TokenUsageSchema.safeParse(
					adapterResponsePayload.token_usage,
				);

				if (parsedTokenUsage.success && parsedTokenUsage.data) {
					// Ensure token_usage is not null
					const tokenUsage = parsedTokenUsage.data;

					if (
						(!requestBody.max_tokens_to_generate ||
							requestBody.max_tokens_to_generate <= 0) &&
						modelConfig.hard_cap_output_tokens &&
						modelConfig.hard_cap_output_tokens > 0 &&
						typeof tokenUsage.completion_tokens === "number" && // Now this access is safe
						tokenUsage.completion_tokens > modelConfig.hard_cap_output_tokens
					) {
						logger.info("Applying hard_cap_output_tokens from model config.", {
							original_completion_tokens: tokenUsage.completion_tokens,
							hard_cap_output_tokens: modelConfig.hard_cap_output_tokens,
							model_api_identifier: providerApiIdentifier,
						});
						tokenUsage.completion_tokens = modelConfig.hard_cap_output_tokens;

						if (typeof tokenUsage.prompt_tokens === "number") {
							// Safe access
							tokenUsage.total_tokens =
								tokenUsage.prompt_tokens + tokenUsage.completion_tokens; // Safe access
						} else {
							tokenUsage.total_tokens = tokenUsage.completion_tokens; // Safe access
							logger.warn(
								"Prompt_tokens missing or invalid when recalculating total_tokens after capping. Total_tokens set to capped completion_tokens.",
								{
									model_api_identifier: providerApiIdentifier,
								},
							);
						}
						// Update the original payload with the modified tokenUsage
						adapterResponsePayload.token_usage = tokenUsage;
					}
				}
				// --- END: Apply hard_cap_output_tokens ---
			} catch (adapterError) {
				logger.error(
					`Normal path error: AI adapter (${providerData.provider}) failed.`,
					{ error: adapterError },
				);
				const errorMessage =
					adapterError instanceof Error
						? adapterError.message
						: "AI service request failed.";

				// Construct a ChatMessageRow-like object for the erroring assistant message
				const assistantErrorContent = `AI service request failed: ${errorMessage}`;
				const assistantErrorMessageData: ChatMessageInsert = {
					// Use Partial as not all fields will be populated like a real DB row initially
					id: generateUUID(), // Generate a new UUID for this error message
					chat_id: currentChatId!,
					user_id: userId,
					role: "assistant",
					content: assistantErrorContent,
					ai_provider_id: requestProviderId,
					system_prompt_id: systemPromptDbId,
					token_usage: null, // No token usage for a failed call
					error_type: "ai_provider_error", // Specific error type
					is_active_in_thread: true, // Mark as active, it's the latest turn
				};

				// Attempt to save user message first
				const userMessageInsertOnError: ChatMessageInsert = {
					chat_id: currentChatId,
					user_id: userId,
					role: "user",
					content: userMessageContent,
					is_active_in_thread: true,
					ai_provider_id: requestProviderId,
					system_prompt_id: systemPromptDbId,
				};
				const { data: savedUserMessageOnError, error: userInsertErrorOnError } =
					await supabaseClient
						.from("chat_messages")
						.insert(userMessageInsertOnError)
						.select()
						.single();

				if (userInsertErrorOnError || !savedUserMessageOnError) {
					logger.error("Failed to save user message after AI provider error.", {
						error: userInsertErrorOnError,
					});
					// If user message save fails, return generic error, not the assistantMessage structure
					return {
						error: {
							message: `AI service failed and user message could not be saved: ${errorMessage}`,
							status: 500,
						},
					};
				}

				// Attempt to save the erroring assistant message
				const {
					data: savedAssistantErrorMessage,
					error: assistantErrorInsertError,
				} = await supabaseClient
					.from("chat_messages")
					.insert(assistantErrorMessageData) // Cast to ChatMessageInsert
					.select()
					.single();

				// Regardless of DB save outcome for the error message, client gets the adapter error directly.
				// The errorMessage variable already holds adapterError.message if adapterError is an Error instance.
				if (assistantErrorInsertError || !savedAssistantErrorMessage) {
					logger.error(
						"Failed to save assistant error message after AI provider error. Client will still receive 502 with adapter error message.",
						{ error: assistantErrorInsertError },
					);
				}

				return {
					error: {
						message: errorMessage, // Use the direct adapterError.message
						status: 502,
					},
				};
			}

			// --- START: Token Debit for Normal Path (Moved Before Message Saves) ---
			let transactionRecordedSuccessfully = false;
			const parsedTokenUsageNormal = TokenUsageSchema.nullable().safeParse(
				adapterResponsePayload.token_usage,
			);
			if (!parsedTokenUsageNormal.success) {
				logger.error("Normal path: Failed to parse token_usage from adapter.", {
					error: parsedTokenUsageNormal.error,
					payload: adapterResponsePayload.token_usage,
				});
				return {
					error: {
						message: "Received invalid token usage data from AI provider.",
						status: 502,
					},
				};
			}
			const tokenUsageFromAdapterNormal = parsedTokenUsageNormal.data;
			const actualTokensToDebitNormal = calculateActualChatCost(
				tokenUsageFromAdapterNormal,
				modelConfig,
				logger,
			);

			if (actualTokensToDebitNormal > 0) {
				logger.info(
					"Attempting to record token transaction (debit) for normal path BEFORE saving messages.",
					{
						walletId: wallet.walletId,
						actualTokensToDebit: actualTokensToDebitNormal,
					},
				);
				try {
					const debitType: TokenWalletTransactionType = "DEBIT_USAGE";
					const transactionData = {
						walletId: wallet.walletId,
						type: debitType,
						amount: String(actualTokensToDebitNormal),
						recordedByUserId: userId,
						idempotencyKey: crypto.randomUUID(),
						relatedEntityType: "chat_message",
						notes: `Token usage for chat message in chat ${currentChatId}. Model: ${modelConfig?.api_identifier || "unknown"}. Input Tokens: ${tokenUsageFromAdapterNormal?.prompt_tokens || 0}, Output Tokens: ${tokenUsageFromAdapterNormal?.completion_tokens || 0}.`,
					};
					const transaction =
						await tokenWalletService!.recordTransaction(transactionData);
					logger.info("Token transaction recorded (debit) successfully.", {
						transactionId: transaction.transactionId,
						walletId: wallet.walletId,
						amount: actualTokensToDebitNormal,
					});
					transactionRecordedSuccessfully = true;
				} catch (debitError: unknown) {
					const typedDebitError =
						debitError instanceof Error
							? debitError
							: new Error(String(debitError));

					// Check if the error is due to insufficient funds, which the DB function raises as an exception.
					if (
						typedDebitError.message.includes("Insufficient funds") ||
						typedDebitError.message.includes(
							"new balance must be a non-negative integer",
						)
					) {
						logger.warn(
							"Insufficient funds for the actual cost of the AI operation.",
							{
								walletId: wallet.walletId,
								debitAmount: actualTokensToDebitNormal,
								error: typedDebitError.message,
							},
						);
						return {
							error: {
								message: `Insufficient funds for the actual cost of the AI operation. Your balance was not changed.`,
								status: 402, // Payment Required
							},
						};
					}

					logger.error(
						"CRITICAL: Failed to record token debit transaction for normal path AFTER successful AI response. Messages will NOT be saved.",
						{
							error: typedDebitError.message,
							walletId: wallet.walletId,
							actualTokensConsumed: actualTokensToDebitNormal,
							aiResponseContent: adapterResponsePayload.content.substring(
								0,
								100,
							),
						},
					);
					return {
						error: {
							message:
								"AI response was generated, but a critical error occurred while finalizing your transaction. Your message has not been saved. Please try again. If the issue persists, contact support.",
							status: 500,
						},
					};
				}
			} else {
				logger.warn(
					"Calculated debit amount for normal path is zero or less, debit step will be skipped if not already.",
					{
						tokenUsageFromAdapterNormal,
						calculatedAmount: actualTokensToDebitNormal,
					},
				);
				transactionRecordedSuccessfully = true;
			}

			// If debit failed critically (and returned 500), we won't reach here.
			// If debit was skipped (e.g. zero tokens, or bad token_usage object from AI but not a service crash),
			// transactionRecordedSuccessfully will allow us to proceed.

			// --- Message Saving (Only if debit was successful or legitimately skipped) ---
			try {
				const userMessageInsert: ChatMessageInsert = {
					chat_id: currentChatId,
					user_id: userId,
					role: "user",
					content: userMessageContent,
					is_active_in_thread: true,
					ai_provider_id: requestProviderId,
					system_prompt_id: finalSystemPromptIdForDb,
				};
				const { data: savedUserMessage, error: userInsertError } =
					await supabaseClient
						.from("chat_messages")
						.insert(userMessageInsert)
						.select()
						.single();
				if (userInsertError || !savedUserMessage) {
					logger.error(
						"Normal path error: Failed to insert user message. This happened AFTER a successful token debit (if applicable).",
						{ error: userInsertError, chatId: currentChatId },
					);
					throw (
						userInsertError ||
						new Error("Failed to save user message after token debit.")
					);
				}
				logger.info("Normal path: Inserted user message.", {
					id: savedUserMessage.id,
				});

				const assistantMessageInsert: ChatMessageInsert = {
					id: generateUUID(),
					chat_id: currentChatId,
					role: "assistant",
					content: adapterResponsePayload.content,
					ai_provider_id: adapterResponsePayload.ai_provider_id,
					system_prompt_id: finalSystemPromptIdForDb,
					token_usage: adapterResponsePayload.token_usage,
					is_active_in_thread: true,
					error_type: null,
					response_to_message_id: savedUserMessage.id,
				};
				const { data: insertedAssistantMessage, error: assistantInsertError } =
					await supabaseClient
						.from("chat_messages")
						.insert(assistantMessageInsert)
						.select()
						.single();

				if (assistantInsertError || !insertedAssistantMessage) {
					logger.error(
						"Normal path error: Failed to insert assistant message. This happened AFTER successful token debit and user message save.",
						{ error: assistantInsertError, chatId: currentChatId },
					);
					throw (
						assistantInsertError ||
						new Error("Failed to insert assistant message after token debit.")
					);
				}
				logger.info("Normal path: Inserted assistant message.", {
					id: insertedAssistantMessage.id,
				});

				const newAssistantMessageResponse: ChatMessageRow = {
					id: insertedAssistantMessage.id,
					chat_id: insertedAssistantMessage.chat_id,
					role: "assistant",
					content: insertedAssistantMessage.content,
					created_at: insertedAssistantMessage.created_at,
					updated_at: insertedAssistantMessage.updated_at,
					user_id: userId,
					ai_provider_id: insertedAssistantMessage.ai_provider_id,
					system_prompt_id: insertedAssistantMessage.system_prompt_id,
					token_usage: insertedAssistantMessage.token_usage,
					is_active_in_thread: insertedAssistantMessage.is_active_in_thread,
					error_type: null,
					response_to_message_id:
						insertedAssistantMessage.response_to_message_id,
				};

				return {
					userMessage: savedUserMessage,
					assistantMessage: newAssistantMessageResponse,
					chatId: currentChatId,
				};
			} catch (dbError) {
				const typedDbError =
					dbError instanceof Error ? dbError : new Error(String(dbError));
				logger.error(
					"DATABASE ERROR during message persistence. This occurred after a successful debit.",
					{
						error: typedDbError.message,
						chatId: currentChatId,
						userId,
						tokensDebited: actualTokensToDebitNormal,
					},
				);

				// Attempt to issue a credit to refund the user
				if (transactionRecordedSuccessfully && actualTokensToDebitNormal > 0) {
					try {
						const creditType: TokenWalletTransactionType = "CREDIT_ADJUSTMENT";
						const refundTransactionData = {
							walletId: wallet.walletId,
							type: creditType,
							amount: String(actualTokensToDebitNormal),
							recordedByUserId: userId, // or a system user ID
							idempotencyKey: crypto.randomUUID(), // New UUID for the refund transaction
							relatedEntityType: "chat_message",
							notes: `Automatic refund for failed message persistence in chat ${currentChatId}. Original debit amount: ${actualTokensToDebitNormal}.`,
						};
						await tokenWalletService!.recordTransaction(refundTransactionData);
						logger.info("Successfully issued refund credit transaction.", {
							walletId: wallet.walletId,
							amount: actualTokensToDebitNormal,
						});
					} catch (refundError) {
						logger.error(
							"CRITICAL: FAILED TO ISSUE REFUND after DB persistence error. Wallet balance is likely incorrect.",
							{
								walletId: wallet.walletId,
								amountToRefund: actualTokensToDebitNormal,
								refundError:
									refundError instanceof Error
										? refundError.message
										: String(refundError),
							},
						);
					}
				}

				// Return a specific error to the client.
				return {
					error: {
						message: `Database error during message persistence: ${typedDbError.message}`,
						status: 500,
					},
				};
			}
		}
	} catch (err) {
		logger.error("Unhandled error in handlePostRequest:", {
			error: err instanceof Error ? err.stack : String(err),
		});
		const errorMessage =
			err instanceof Error
				? err.message
				: "An unexpected error occurred processing the chat request.";
		return { error: { message: errorMessage, status: 500 } };
	}
}

// Helper function
function generateUUID() {
	return crypto.randomUUID();
}

// Start the server
serve(async (req: Request) => {
	try {
		return await handler(req, defaultDeps);
	} catch (e) {
		logger.error("Critical error in server request processing:", {
			error: e instanceof Error ? e.stack : String(e),
			request_url: req.url,
			request_method: req.method,
		});

		const errorResponse = defaultDeps.createErrorResponse(
			e instanceof Error ? e.message : "Internal Server Error",
			500,
			req,
		);
		return errorResponse;
	}
});
