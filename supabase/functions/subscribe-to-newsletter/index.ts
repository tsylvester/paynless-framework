import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { logger } from "../_shared/logger.ts";
import {
	handleCorsPreflightRequest,
	createSuccessResponse,
	createErrorResponse,
} from "../_shared/cors-headers.ts";
import {
	createSupabaseClient,
	createSupabaseAdminClient,
} from "../_shared/auth.ts";
import { KitService } from "../_shared/email_service/kit_service.ts";
import { getTagIdForRef } from "../_shared/email_service/kit_tags.config.ts";

logger.info("`subscribe-to-newsletter` function starting up.");

interface SubscribeRequest {
	email: string;
	ref?: string;
}

export async function handler(req: Request): Promise<Response> {
	// Handle CORS preflight
	const corsResponse = handleCorsPreflightRequest(req);
	if (corsResponse) return corsResponse;

	try {
		// Parse request body
		const body = (await req.json()) as SubscribeRequest;

		if (!body.email) {
			logger.error("Email is required for newsletter subscription");
			return createErrorResponse("Email is required", 400, req);
		}

		// Get the authorization header
		const authHeader = req.headers.get("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			logger.error("Missing or invalid authorization header");
			return createErrorResponse("Authorization required", 401, req);
		}

		// Create authenticated Supabase client
		const supabaseClient = createSupabaseClient(req);

		// Verify the user's session
		const {
			data: { user },
			error: authError,
		} = await supabaseClient.auth.getUser();

		if (authError || !user) {
			logger.error("Failed to authenticate user:", {
				error: authError?.message,
			});
			return createErrorResponse("Authentication failed", 401, req, authError);
		}

		// Subscribe to Kit.com in real-time
		try {
			// Create KitService with proper config
			const kitConfig = {
				apiKey: Deno.env.get("EMAIL_MARKETING_API_KEY")!,
				baseUrl: Deno.env.get("EMAIL_MARKETING_BASE_URL")!,
				tagId: Deno.env.get("EMAIL_MARKETING_TAG_ID")!,
				customUserIdField: Deno.env.get(
					"EMAIL_MARKETING_CUSTOM_USER_ID_FIELD",
				)!,
				customCreatedAtField: Deno.env.get(
					"EMAIL_MARKETING_CUSTOM_CREATED_AT_FIELD",
				)!,
			};

			const emailService = new KitService(kitConfig);

			// Prepare user data for Kit - using the UserData interface expected by KitService
			const userDataForKit = {
				id: user.id,
				email: body.email || user.email!,
				firstName: user.user_metadata?.first_name || "",
				lastName: user.user_metadata?.last_name || "",
				createdAt: user.created_at || new Date().toISOString(),
			};

			logger.info("Subscribing user to Kit.com:", {
				email: userDataForKit.email,
				userId: user.id,
				userDataForKit,
			});

			// Add user to Kit.com
			await emailService.addUserToList(userDataForKit);

			// Add ref-specific tag if provided
			const ref = body.ref || "direct";
			if (ref !== "direct") {
				const tagId = getTagIdForRef(ref);
				if (tagId) {
					logger.info(`Adding tag ${tagId} for ref: ${ref}`);
					await emailService.addTagToSubscriber(userDataForKit.email, tagId);
				}
			}

			// Also create newsletter event for record keeping
			const adminClient = createSupabaseAdminClient();
			const { error: eventError } = await adminClient
				.from("newsletter_events")
				.insert({
					user_id: user.id,
					event_type: "subscribe",
					ref: ref,
					status: "completed",
					processed_at: new Date().toISOString(),
				});

			if (eventError) {
				logger.warn("Failed to create newsletter event record:", {
					error: eventError.message,
					userId: user.id,
				});
				// Don't fail the request - subscription was successful
			}

			// Update user profile to mark subscription status
			const { error: profileError } = await adminClient
				.from("profiles")
				.update({
					is_subscribed_to_newsletter: true,
					updated_at: new Date().toISOString(),
				})
				.eq("user_id", user.id);

			if (profileError) {
				logger.warn("Failed to update profile subscription status:", {
					error: profileError.message,
					userId: user.id,
				});
				// Don't fail the request - subscription was successful
			}

			logger.info("Successfully subscribed user to Kit.com newsletter", {
				userId: user.id,
				email: userDataForKit.email,
				ref: ref,
			});

			return createSuccessResponse(
				{
					message: "Successfully subscribed to newsletter",
					subscribed: true,
				},
				200,
				req,
			);
		} catch (kitError) {
			logger.error("Failed to subscribe user to Kit.com:", {
				error: kitError instanceof Error ? kitError.message : String(kitError),
				errorDetails:
					kitError instanceof Error ? kitError.stack : String(kitError),
				userId: user.id,
				email: body.email,
				userDataSent: {
					id: user.id,
					email: body.email || user.email!,
					firstName: user.user_metadata?.first_name || "",
					lastName: user.user_metadata?.last_name || "",
					createdAt: user.created_at || new Date().toISOString(),
				},
			});

			// Still try to create a pending event for later processing
			const adminClient = createSupabaseAdminClient();
			const { error: eventError } = await adminClient
				.from("newsletter_events")
				.insert({
					user_id: user.id,
					event_type: "subscribe",
					ref: body.ref || "direct",
					status: "pending",
					error:
						kitError instanceof Error ? kitError.message : String(kitError),
				});

			if (eventError) {
				logger.error("Failed to create newsletter event for retry:", {
					error: eventError.message,
				});
			}

			return createErrorResponse(
				"Failed to subscribe to newsletter. We'll retry shortly.",
				500,
				req,
				kitError instanceof Error ? kitError : new Error(String(kitError)),
			);
		}
	} catch (error) {
		logger.error("Unexpected error in subscribe-to-newsletter:", {
			error: error instanceof Error ? error.message : String(error),
		});
		return createErrorResponse("Internal server error", 500, req, error);
	}
}

// Only run the server if executed directly
if (import.meta.main) {
	logger.info("`subscribe-to-newsletter` function initializing HTTP server...");
	serve(handler);
	logger.info("`subscribe-to-newsletter` function initialized and listening.");
}
