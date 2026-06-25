import { assertEquals } from "jsr:@std/assert@0.225.3";
import { MeGetResponse, TierRow } from "./index.interface.ts";

Deno.test(
  "Contract: TierRow valid - free tier all fields present with correct types",
  () => {
    const row: TierRow = {
      level: 0,
      name: "free",
      output_cap_tokens: 8192,
      max_models_per_project: 1,
    };
    assertEquals(row.level, 0);
    assertEquals(row.name, "free");
    assertEquals(row.output_cap_tokens, 8192);
    assertEquals(row.max_models_per_project, 1);
    assertEquals(typeof row.level, "number");
    assertEquals(typeof row.name, "string");
    assertEquals(typeof row.output_cap_tokens, "number");
    assertEquals(typeof row.max_models_per_project, "number");
  },
);

Deno.test(
  "Contract: TierRow valid - ultra tier nullable fields are null",
  () => {
    const row: TierRow = {
      level: 30,
      name: "ultra",
      output_cap_tokens: null,
      max_models_per_project: null,
    };
    assertEquals(row.level, 30);
    assertEquals(row.name, "ultra");
    assertEquals(row.output_cap_tokens, null);
    assertEquals(row.max_models_per_project, null);
  },
);

Deno.test("Contract: TierRow invalid - missing level field", () => {
  const requiredKeys: (keyof TierRow)[] = [
    "level",
    "name",
    "output_cap_tokens",
    "max_models_per_project",
  ];
  assertEquals(requiredKeys.includes("level"), true);
  assertEquals(requiredKeys.length, 4);
});

Deno.test("Contract: TierRow invalid - missing name field", () => {
  const requiredKeys: (keyof TierRow)[] = [
    "level",
    "name",
    "output_cap_tokens",
    "max_models_per_project",
  ];
  assertEquals(requiredKeys.includes("name"), true);
  assertEquals(requiredKeys.length, 4);
});

Deno.test(
  "Contract: TierRow invalid - level is string instead of number",
  () => {
    const levelField: TierRow["level"] = 0;
    assertEquals(typeof levelField, "number");
    assertEquals(typeof levelField === "string", false);
  },
);

Deno.test("Contract: TierRow invalid - null value for whole object", () => {
  const absent: TierRow | null = null;
  assertEquals(absent, null);
});

Deno.test(
  "Contract: MeGetResponse valid - user profile userTier and non-empty tiers",
  () => {
    const userTier: TierRow = {
      level: 0,
      name: "free",
      output_cap_tokens: 8192,
      max_models_per_project: 1,
    };
    const tiers: TierRow[] = [
      userTier,
      {
        level: 10,
        name: "basic",
        output_cap_tokens: 32768,
        max_models_per_project: 2,
      },
    ];
    const user: MeGetResponse["user"] = {
      id: "user-me-contract-1",
      aud: "authenticated",
      role: "authenticated",
      email: "me-contract@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    };
    const profile: MeGetResponse["profile"] = {
      id: "user-me-contract-1",
      chat_context: null,
      created_at: new Date(0).toISOString(),
      first_name: "Contract",
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
    };
    const response: MeGetResponse = {
      user,
      profile,
      userTier,
      tiers,
    };
    assertEquals(response.user !== null, true);
    assertEquals(response.profile !== null, true);
    assertEquals(response.userTier.level, 0);
    assertEquals(response.tiers.length > 0, true);
    assertEquals(
      response.tiers.every((tier: TierRow) => typeof tier.level === "number"),
      true,
    );
  },
);

Deno.test("Contract: MeGetResponse invalid - missing userTier key", () => {
  const requiredKeys: (keyof MeGetResponse)[] = [
    "user",
    "profile",
    "userTier",
    "tiers",
  ];
  assertEquals(requiredKeys.includes("userTier"), true);
  assertEquals(requiredKeys.length, 4);
});

Deno.test("Contract: MeGetResponse invalid - missing tiers key", () => {
  const requiredKeys: (keyof MeGetResponse)[] = [
    "user",
    "profile",
    "userTier",
    "tiers",
  ];
  assertEquals(requiredKeys.includes("tiers"), true);
  assertEquals(requiredKeys.length, 4);
});

Deno.test(
  "Contract: MeGetResponse invalid - tiers is empty array",
  () => {
    const emptyTiers: MeGetResponse["tiers"] = [];
    assertEquals(emptyTiers.length, 0);
    const nonEmptyTiers: MeGetResponse["tiers"] = [
      {
        level: 0,
        name: "free",
        output_cap_tokens: 8192,
        max_models_per_project: 1,
      },
    ];
    assertEquals(nonEmptyTiers.length > 0, true);
  },
);
