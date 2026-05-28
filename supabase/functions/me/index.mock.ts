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
import { MeGetResponse, MeHandlerDeps, TierRow } from "./index.interface.ts";

/** Seeded tier_definitions rows — single source for tiers[] and userTier lookup. */
export const MOCK_TIER_DEFINITIONS: TierRow[] = [
  {
    level: 0,
    name: "free",
    output_cap_tokens: 8192,
    max_models_per_project: 1,
  },
  {
    level: 10,
    name: "basic",
    output_cap_tokens: 32768,
    max_models_per_project: 2,
  },
  {
    level: 20,
    name: "premium",
    output_cap_tokens: 131072,
    max_models_per_project: 3,
  },
  {
    level: 30,
    name: "ultra",
    output_cap_tokens: null,
    max_models_per_project: null,
  },
  {
    level: 99,
    name: "unreachable",
    output_cap_tokens: null,
    max_models_per_project: null,
  },
];

export function createMockTierDefinitions(): TierRow[] {
  return [...MOCK_TIER_DEFINITIONS];
}

export function findMockTierByLevel(tierLevel: number): TierRow {
  const tier: TierRow | undefined = MOCK_TIER_DEFINITIONS.find(
    (row) => row.level === tierLevel,
  );
  if (tier === undefined) {
    throw new Error(`No mock tier definition for level ${tierLevel}`);
  }
  return tier;
}

export function createMockTierRow(overrides: Partial<TierRow> = {}): TierRow {
  const level: number = overrides.level ?? 0;
  const row: TierRow = { ...findMockTierByLevel(level), ...overrides };
  return row;
}

export function mockUserSubscriptionsSelect(
  tierLevel: number = 0,
): { data: { tier_level: number }[]; error: null } {
  return { data: [{ tier_level: tierLevel }], error: null };
}

export function mockTierDefinitionsSelect(
  tiers: TierRow[] = createMockTierDefinitions(),
): { data: TierRow[]; error: null } {
  return { data: tiers, error: null };
}

export function createMockMeGetResponse(
  user: User,
  overrides: Partial<MeGetResponse> = {},
): MeGetResponse {
  const tiers: TierRow[] = overrides.tiers ?? createMockTierDefinitions();
  const userTier: TierRow = overrides.userTier ?? findMockTierByLevel(0);
  const response: MeGetResponse = {
    user,
    profile: overrides.profile ?? {
      id: user.id,
      chat_context: null,
      created_at: new Date(0).toISOString(),
      first_name: null,
      has_seen_welcome_modal: false,
      is_subscribed_to_newsletter: false,
      last_name: null,
      last_selected_org_id: null,
      profile_privacy_setting: "public",
      role: "user",
      signup_ref: null,
      subscribed_at: null,
      synced_to_kit_at: null,
      unsubscribed_at: null,
      updated_at: new Date(0).toISOString(),
    },
    userTier,
    tiers,
    ...overrides,
  };
  return response;
}

export function mockMeHandlerDeps(
  overrides: Partial<MeHandlerDeps> = {},
): MeHandlerDeps {
  const deps: MeHandlerDeps = {
    handleCorsPreflightRequest:
      overrides.handleCorsPreflightRequest ?? handleCorsPreflightRequest,
    createUnauthorizedResponse:
      overrides.createUnauthorizedResponse ?? createUnauthorizedResponse,
    createErrorResponse: overrides.createErrorResponse ?? createErrorResponse,
    createSuccessResponse:
      overrides.createSuccessResponse ?? createSuccessResponse,
    createSupabaseClient: overrides.createSupabaseClient ?? createSupabaseClient,
    getEmailMarketingService:
      overrides.getEmailMarketingService ?? getEmailMarketingService,
  };
  return deps;
}
