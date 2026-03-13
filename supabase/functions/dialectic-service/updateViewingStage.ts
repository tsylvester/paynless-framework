import type {
	UpdateViewingStageDeps,
	UpdateViewingStageParams,
	UpdateViewingStagePayload,
	UpdateViewingStageReturn,
	UpdateViewingStageFn,
} from "./dialectic.interface.ts";
import { logger } from "../_shared/logger.ts";

export const updateViewingStage: UpdateViewingStageFn = async (
	deps: UpdateViewingStageDeps,
	params: UpdateViewingStageParams,
	payload: UpdateViewingStagePayload,
): Promise<UpdateViewingStageReturn> => {
	const { sessionId, viewingStageId }: UpdateViewingStagePayload = payload;
	const { userId }: UpdateViewingStageParams = params;
	const { dbClient }: UpdateViewingStageDeps = deps;

	if (typeof sessionId !== "string" || sessionId.trim() === "") {
		return {
			error: { message: "sessionId is required and must be a non-empty string.", status: 400, code: "INVALID_PAYLOAD" },
			status: 400,
		};
	}
	if (typeof viewingStageId !== "string" || viewingStageId.trim() === "") {
		return {
			error: { message: "viewingStageId is required and must be a non-empty string.", status: 400, code: "INVALID_PAYLOAD" },
			status: 400,
		};
	}

	logger.info(`[updateViewingStage] Attempting to update viewing stage for session ${sessionId} by user ${userId}.`, { payload });

	const { data: sessionData, error: sessionFetchError } = await dbClient
		.from("dialectic_sessions")
		.select("id, project_id")
		.eq("id", sessionId)
		.single();

	if (sessionFetchError) {
		if (sessionFetchError.code === "PGRST116") {
			logger.warn("[updateViewingStage] Session not found for update:", { sessionId });
			return { error: { message: "Session not found.", status: 404, code: "SESSION_NOT_FOUND" }, status: 404 };
		}
		logger.error("[updateViewingStage] Error fetching session for verification:", { sessionId, error: sessionFetchError });
		return {
			error: {
				message: "Error fetching session for update.",
				status: 500,
				code: "SESSION_FETCH_ERROR",
				details: sessionFetchError.message,
			},
			status: 500,
		};
	}

	const { data: _projectData, error: projectFetchError } = await dbClient
		.from("dialectic_projects")
		.select("id, user_id")
		.eq("id", sessionData.project_id)
		.eq("user_id", userId)
		.single();

	if (projectFetchError) {
		if (projectFetchError.code === "PGRST116") {
			logger.warn("[updateViewingStage] User does not own the project associated with the session, or project not found.", {
				sessionId,
				projectId: sessionData.project_id,
				userId,
			});
			return {
				error: {
					message: "Forbidden: You do not have permission to update this session.",
					status: 403,
					code: "FORBIDDEN_SESSION_UPDATE",
				},
				status: 403,
			};
		}
		logger.error("[updateViewingStage] Error fetching project for session ownership verification:", {
			projectId: sessionData.project_id,
			error: projectFetchError,
		});
		return {
			error: {
				message: "Error verifying project ownership.",
				status: 500,
				code: "PROJECT_FETCH_ERROR",
				details: projectFetchError.message,
			},
			status: 500,
		};
	}

	const { data: updatedSession, error: updateError } = await dbClient
		.from("dialectic_sessions")
		.update({ viewing_stage_id: viewingStageId })
		.eq("id", sessionId)
		.select()
		.single();

	if (updateError) {
		logger.error("[updateViewingStage] Error updating viewing_stage_id in DB:", { sessionId, error: updateError });
		return {
			error: {
				message: "Failed to update viewing stage.",
				status: 500,
				code: "DB_UPDATE_FAILED",
				details: updateError.message,
			},
			status: 500,
		};
	}

	if (!updatedSession) {
		logger.error("[updateViewingStage] Session not found after update (should not happen if update was successful without error):", {
			sessionId,
		});
		return {
			error: {
				message: "Failed to retrieve session after update.",
				status: 500,
				code: "SESSION_RETRIEVAL_FAILED",
			},
			status: 500,
		};
	}

	logger.info(`[updateViewingStage] Successfully updated viewing stage for session ${sessionId}.`, { data: updatedSession });
	return { data: updatedSession, status: 200 };
};
