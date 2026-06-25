import { assertEquals } from "jsr:@std/assert@0.225.3";
import { isMeGetResponse, isTierRow } from "./index.guard.ts";

Deno.test(
  "isTierRow accepts free tier with all fields present",
  () => {
    const value = {
      level: 0,
      name: "free",
      output_cap_tokens: 8192,
      max_models_per_project: 1,
    };
    assertEquals(isTierRow(value), true);
  },
);

Deno.test(
  "isTierRow accepts ultra tier with nullable fields null",
  () => {
    const value = {
      level: 30,
      name: "ultra",
      output_cap_tokens: null,
      max_models_per_project: null,
    };
    assertEquals(isTierRow(value), true);
  },
);

Deno.test("isTierRow rejects null", () => {
  assertEquals(isTierRow(null), false);
});

Deno.test("isTierRow rejects object missing level", () => {
  const value = {
    name: "free",
    output_cap_tokens: 8192,
    max_models_per_project: 1,
  };
  assertEquals(isTierRow(value), false);
});

Deno.test("isTierRow rejects object missing name", () => {
  const value = {
    level: 0,
    output_cap_tokens: 8192,
    max_models_per_project: 1,
  };
  assertEquals(isTierRow(value), false);
});

Deno.test("isTierRow rejects object where level is a string", () => {
  const value = {
    level: "0",
    name: "free",
    output_cap_tokens: 8192,
    max_models_per_project: 1,
  };
  assertEquals(isTierRow(value), false);
});

Deno.test(
  "isMeGetResponse accepts full valid response with userTier and non-empty tiers",
  () => {
    const value = {
      user: {
        id: "user-me-guard-1",
        aud: "authenticated",
        role: "authenticated",
        email: "me-guard@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      },
      profile: {
        id: "user-me-guard-1",
        chat_context: null,
        created_at: new Date(0).toISOString(),
        first_name: "Guard",
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
      userTier: {
        level: 0,
        name: "free",
        output_cap_tokens: 8192,
        max_models_per_project: 1,
      },
      tiers: [
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
      ],
    };
    assertEquals(isMeGetResponse(value), true);
  },
);

Deno.test("isMeGetResponse rejects object missing userTier", () => {
  const value = {
    user: {
      id: "user-me-guard-2",
      aud: "authenticated",
      role: "authenticated",
      email: "me-guard-2@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
    profile: {
      id: "user-me-guard-2",
      chat_context: null,
      created_at: new Date(0).toISOString(),
      first_name: "Guard",
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
    tiers: [
      {
        level: 0,
        name: "free",
        output_cap_tokens: 8192,
        max_models_per_project: 1,
      },
    ],
  };
  assertEquals(isMeGetResponse(value), false);
});

Deno.test("isMeGetResponse rejects object missing tiers", () => {
  const value = {
    user: {
      id: "user-me-guard-3",
      aud: "authenticated",
      role: "authenticated",
      email: "me-guard-3@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
    profile: {
      id: "user-me-guard-3",
      chat_context: null,
      created_at: new Date(0).toISOString(),
      first_name: "Guard",
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
    userTier: {
      level: 0,
      name: "free",
      output_cap_tokens: 8192,
      max_models_per_project: 1,
    },
  };
  assertEquals(isMeGetResponse(value), false);
});

Deno.test("isMeGetResponse rejects object where tiers is empty array", () => {
  const value = {
    user: {
      id: "user-me-guard-4",
      aud: "authenticated",
      role: "authenticated",
      email: "me-guard-4@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
    profile: {
      id: "user-me-guard-4",
      chat_context: null,
      created_at: new Date(0).toISOString(),
      first_name: "Guard",
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
    userTier: {
      level: 0,
      name: "free",
      output_cap_tokens: 8192,
      max_models_per_project: 1,
    },
    tiers: [],
  };
  assertEquals(isMeGetResponse(value), false);
});
