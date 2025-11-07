import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { type SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
import type { Database } from "../types_db.ts";
import { createSystemPromptsHandler } from "./index.ts";

type SystemPrompt = Database["public"]["Tables"]["system_prompts"]["Row"];

Deno.test("system-prompts handler", async (t) => {
  const mockUser: User = {
    id: "test-user-id",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };

  const mockPrompts: SystemPrompt[] = [
    {
      id: "prompt-1",
      name: "User Prompt 1",
      prompt_text: "This is a user-selectable prompt.",
      is_active: true,
      user_selectable: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      description: null,
      document_template_id: null,
    },
    {
      id: "prompt-2",
      name: "System-Only Prompt",
      prompt_text: "This prompt is for the system only.",
      is_active: true,
      user_selectable: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      description: null,
      document_template_id: null,
    },
    {
      id: "prompt-3",
      name: "User Prompt 2",
      prompt_text: "Another user-selectable prompt.",
      is_active: true,
      user_selectable: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      description: null,
      document_template_id: null,
    },
    {
      id: "prompt-4",
      name: "Inactive Prompt",
      prompt_text: "This prompt is inactive.",
      is_active: false,
      user_selectable: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      description: null,
      document_template_id: null,
    },
  ];

  await t.step(
    "1. Happy Path: returns only active and user-selectable prompts",
    async () => {
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: {
              data: mockPrompts.filter(
                (p) => p.is_active && p.user_selectable,
              ),
            },
          },
        },
      };
      const mockSupabase = createMockSupabaseClient("test-user", mockDbConfig);
      const handler = createSystemPromptsHandler({
        createSupabaseClient: () =>
          mockSupabase.client as unknown as SupabaseClient<Database>,
      });

      const req = new Request("http://localhost/system-prompts", {
        method: "GET",
        headers: { Authorization: "Bearer FAKE_TOKEN" },
      });

      const res = await handler(req);
      assertEquals(res.status, 200);
      const { prompts } = await res.json();
      assertEquals(prompts.length, 2);
      assertEquals(prompts[0].id, "prompt-1");
      assertEquals(prompts[1].id, "prompt-3");

      const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
        "system_prompts",
      )?.select;
      assertExists(selectSpy);
      const eqCalls =
        mockSupabase.spies.getLatestQueryBuilderSpies("system_prompts")
          ?.eq?.calls;
      assertExists(eqCalls);
      assertEquals(eqCalls.length, 2, "Expected two .eq() calls");
      assertEquals(eqCalls[0].args, ["is_active", true]);
      assertEquals(eqCalls[1].args, ["user_selectable", true]);
    },
  );

  await t.step(
    "2. Edge Case: returns empty array when no user-selectable prompts exist",
    async () => {
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [] }, // DB returns nothing matching the filter
          },
        },
      };
      const mockSupabase = createMockSupabaseClient("test-user", mockDbConfig);
      const handler = createSystemPromptsHandler({
        createSupabaseClient: () =>
          mockSupabase.client as unknown as SupabaseClient<Database>,
      });

      const req = new Request("http://localhost/system-prompts", {
        method: "GET",
        headers: { Authorization: "Bearer FAKE_TOKEN" },
      });

      const res = await handler(req);
      assertEquals(res.status, 200);
      const { prompts } = await res.json();
      assertEquals(prompts.length, 0);
    },
  );

  await t.step(
    "3. Auth Failure: returns 401 if Authorization header is missing",
    async () => {
      const mockSupabase = createMockSupabaseClient();
      const handler = createSystemPromptsHandler({
        createSupabaseClient: () =>
          mockSupabase.client as unknown as SupabaseClient<Database>,
      });
      const req = new Request("http://localhost/system-prompts", {
        method: "GET",
      }); // No Auth header

      const res = await handler(req);
      assertEquals(res.status, 401);
      const body = await res.json();
      assertExists(body.error);
    },
  );

  await t.step("4. Method Not Allowed: returns 405 for POST request", async () => {
    const mockSupabase = createMockSupabaseClient();
    const handler = createSystemPromptsHandler({
      createSupabaseClient: () =>
        mockSupabase.client as unknown as SupabaseClient<Database>,
    });
    const req = new Request("http://localhost/system-prompts", {
      method: "POST",
      headers: { Authorization: "Bearer FAKE_TOKEN" },
    });

    const res = await handler(req);
    assertEquals(res.status, 405);
  });

  await t.step("5. DB Error: returns 500 if database query fails", async () => {
    const dbError = { name: "DBError", message: "Something went wrong", code: "50000" };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: null, error: dbError },
        },
      },
    };
    const mockSupabase = createMockSupabaseClient("test-user", mockDbConfig);
    const handler = createSystemPromptsHandler({
      createSupabaseClient: () =>
        mockSupabase.client as unknown as SupabaseClient<Database>,
    });

    const req = new Request("http://localhost/system-prompts", {
      method: "GET",
      headers: { Authorization: "Bearer FAKE_TOKEN" },
    });

    const res = await handler(req);
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "Internal Server Error");
  });
});
