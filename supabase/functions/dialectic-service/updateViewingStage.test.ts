import { assertEquals, assertExists, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { stub } from "jsr:@std/testing@0.225.1/mock";
import { updateViewingStage } from "./updateViewingStage.ts";
import type { UpdateViewingStagePayload } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts";

Deno.test("handleUpdateViewingStage - updates viewing_stage_id in database and returns updated session", async () => {
	const mockUserId = "user-viewing-stage-owner-id";
	const mockSessionId = "session-viewing-stage-id";
	const mockProjectId = "project-viewing-stage-id";
	const mockViewingStageId = "stage-viewing-id";
	const now = new Date().toISOString();

	const mockUser: User = {
		id: mockUserId,
		app_metadata: {},
		user_metadata: {},
		aud: "authenticated",
		created_at: now,
	};

	const payload: UpdateViewingStagePayload = {
		sessionId: mockSessionId,
		viewingStageId: mockViewingStageId,
	};

	const mockSessionBeforeUpdate: Database["public"]["Tables"]["dialectic_sessions"]["Row"] = {
		id: mockSessionId,
		project_id: mockProjectId,
		session_description: null,
		user_input_reference_url: null,
		iteration_count: 0,
		selected_model_ids: null,
		status: "active",
		associated_chat_id: null,
		current_stage_id: "stage-current-id",
		viewing_stage_id: null,
		idempotency_key: null,
		created_at: now,
		updated_at: now,
	};

	const mockProject: Database["public"]["Tables"]["dialectic_projects"]["Row"] = {
		id: mockProjectId,
		user_id: mockUserId,
		project_name: "Test Project",
		initial_user_prompt: "",
		initial_prompt_resource_id: null,
		process_template_id: null,
		selected_domain_id: "domain-id",
		selected_domain_overlay_id: null,
		repo_url: null,
		user_domain_overlay_values: null,
		status: "active",
		created_at: now,
		updated_at: now,
		idempotency_key: null,
	};

	const mockSessionRowAfterUpdate: Database["public"]["Tables"]["dialectic_sessions"]["Row"] = {
		id: mockSessionId,
		project_id: mockProjectId,
		session_description: null,
		user_input_reference_url: null,
		iteration_count: 0,
		selected_model_ids: null,
		status: "active",
		associated_chat_id: null,
		current_stage_id: "stage-current-id",
		viewing_stage_id: mockViewingStageId,
		idempotency_key: null,
		created_at: now,
		updated_at: now,
	};

	const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
		genericMockResults: {
			dialectic_sessions: {
				select: async (state: MockQueryBuilderState) => {
					if (state.filters.some((f) => f.column === "id" && f.value === mockSessionId)) {
						return { data: [mockSessionBeforeUpdate], error: null, status: 200, statusText: "OK", count: 1 };
					}
					return { data: null, error: null, status: 200, count: 0, statusText: "OK" };
				},
				update: async () => ({
					data: [mockSessionRowAfterUpdate],
					error: null,
					status: 200,
					statusText: "OK",
					count: 1,
				}),
			},
			dialectic_projects: {
				select: async (state: MockQueryBuilderState) => {
					if (
						state.filters.some((f) => f.column === "id" && f.value === mockProjectId) &&
						state.filters.some((f) => f.column === "user_id" && f.value === mockUserId)
					) {
						return { data: [mockProject], error: null, status: 200, statusText: "OK", count: 1 };
					}
					return { data: null, error: null, status: 200, count: 0, statusText: "OK" };
				},
			},
		},
		mockUser: mockUser,
	});

	const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
	const loggerSpy = stub(logger, "info");

	try {
		const result = await updateViewingStage(
			{ dbClient: adminDbClient },
			{ userId: mockUserId },
			payload,
		);

		assertExists(result.data, `Update failed: ${result.error?.message}`);
		assertEquals(result.error, undefined);
		assertEquals(result.status, 200);
		assertEquals(result.data.id, mockSessionId);
		assertEquals(result.data.viewing_stage_id, mockViewingStageId);

		const sessionSelectSpies = mockAdminDbClientSetup.spies.getAllQueryBuilderSpies("dialectic_sessions");
		const sessionUpdateOperation = sessionSelectSpies?.find((s) => (s.update?.calls.length ?? 0) === 1);
		assert(sessionUpdateOperation, "Session update was not called once");

		assert(
			loggerSpy.calls.some(
				(call) =>
					call.args[0] ===
					`[updateViewingStage] Attempting to update viewing stage for session ${mockSessionId} by user ${mockUserId}.`,
			),
		);
		assert(
			loggerSpy.calls.some(
				(call) =>
					call.args[0] ===
					`[updateViewingStage] Successfully updated viewing stage for session ${mockSessionId}.`,
			),
		);
	} finally {
		loggerSpy.restore();
	}
});

Deno.test("handleUpdateViewingStage - returns error if session not found", async () => {
	const mockUserId = "user-session-not-found-id";
	const mockSessionId = "non-existent-session-id";
	const payload: UpdateViewingStagePayload = {
		sessionId: mockSessionId,
		viewingStageId: "stage-any-id",
	};
	const mockUser: User = {
		id: mockUserId,
		app_metadata: {},
		user_metadata: {},
		aud: "authenticated",
		created_at: new Date().toISOString(),
	};

	const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
		genericMockResults: {
			dialectic_sessions: {
				select: async (state: MockQueryBuilderState) => {
					if (state.filters.some((f) => f.column === "id" && f.value === mockSessionId)) {
						return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
					}
					return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
				},
			},
		},
		mockUser: mockUser,
	});
	const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
	const loggerSpy = stub(logger, "warn");

	try {
		const result = await updateViewingStage(
			{ dbClient: adminDbClient },
			{ userId: mockUserId },
			payload,
		);
		assertExists(result.error);
		assertEquals(result.status, 404);
		assertEquals(result.error?.message, "Session not found.");
		assertEquals(result.error?.code, "SESSION_NOT_FOUND");
		assert(
			loggerSpy.calls.some((call) => call.args[0] === "[updateViewingStage] Session not found for update:"),
		);
	} finally {
		loggerSpy.restore();
	}
});

Deno.test("handleUpdateViewingStage - returns error if user is not session owner", async () => {
	const mockUserId = "user-not-owner-id";
	const mockSessionId = "session-owned-by-other-id";
	const mockProjectId = "project-owned-by-other-id";
	const now = new Date().toISOString();
	const payload: UpdateViewingStagePayload = {
		sessionId: mockSessionId,
		viewingStageId: "stage-any-id",
	};
	const mockUser: User = {
		id: mockUserId,
		app_metadata: {},
		user_metadata: {},
		aud: "authenticated",
		created_at: now,
	};
	const mockSessionInstance: Database["public"]["Tables"]["dialectic_sessions"]["Row"] = {
		id: mockSessionId,
		project_id: mockProjectId,
		session_description: null,
		user_input_reference_url: null,
		iteration_count: 0,
		selected_model_ids: null,
		status: "active",
		associated_chat_id: null,
		current_stage_id: "stage-current-id",
		viewing_stage_id: null,
		idempotency_key: null,
		created_at: now,
		updated_at: now,
	};

	const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
		genericMockResults: {
			dialectic_sessions: {
				select: async (state: MockQueryBuilderState) => {
					if (state.filters.some((f) => f.column === "id" && f.value === mockSessionId)) {
						return { data: [mockSessionInstance], error: null, status: 200, statusText: "OK", count: 1 };
					}
					return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
				},
			},
			dialectic_projects: {
				select: async (state: MockQueryBuilderState) => {
					if (
						state.filters.some((f) => f.column === "id" && f.value === mockProjectId) &&
						state.filters.some((f) => f.column === "user_id" && f.value === mockUserId)
					) {
						return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
					}
					return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
				},
			},
		},
		mockUser: mockUser,
	});
	const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
	const loggerSpy = stub(logger, "warn");

	try {
		const result = await updateViewingStage(
			{ dbClient: adminDbClient },
			{ userId: mockUserId },
			payload,
		);
		assertExists(result.error);
		assertEquals(result.status, 403);
		assertEquals(result.error?.message, "Forbidden: You do not have permission to update this session.");
		assertEquals(result.error?.code, "FORBIDDEN_SESSION_UPDATE");
		assert(
			loggerSpy.calls.some(
				(call) =>
					call.args[0] ===
					"[updateViewingStage] User does not own the project associated with the session, or project not found.",
			),
		);
	} finally {
		loggerSpy.restore();
	}
});
