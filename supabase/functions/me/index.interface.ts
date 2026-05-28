import { User } from "npm:@supabase/gotrue-js@^2.6.3";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflightRequest,
} from "../_shared/cors-headers.ts";
import {
  createSupabaseClient,
  createUnauthorizedResponse,
} from "../_shared/auth.ts";
import { getEmailMarketingService } from "../_shared/email_service/factory.ts";
import { Database } from "../types_db.ts";

export type TierRow = Database["public"]["Tables"]["tier_definitions"]["Row"];

export interface MeGetResponse {
  user: User;
  profile: Database["public"]["Tables"]["user_profiles"]["Row"];
  userTier: TierRow;
  tiers: TierRow[];
}

export interface MeHandlerDeps {
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createUnauthorizedResponse: typeof createUnauthorizedResponse;
  createErrorResponse: typeof createErrorResponse;
  createSuccessResponse: typeof createSuccessResponse;
  createSupabaseClient: typeof createSupabaseClient;
  getEmailMarketingService: typeof getEmailMarketingService;
}
