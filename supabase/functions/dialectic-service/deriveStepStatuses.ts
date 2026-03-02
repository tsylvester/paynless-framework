import type {
	DeriveStepStatusesDeps,
	DeriveStepStatusesParams,
	DeriveStepStatusesResult,
	UnifiedStageStatus,
} from "./dialectic.interface.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";

const ACTIVE_STATUSES: Set<string> = new Set([
	"pending",
	"processing",
	"retrying",
	"waiting_for_prerequisite",
	"waiting_for_children",
]);

const FAILED_STATUSES: Set<string> = new Set(["failed", "retry_loop_failed"]);

function getRecipeStepIdFromPayload(payload: unknown): string | undefined {
	if (!isRecord(payload)) return undefined;
	const planner_metadata: unknown = payload.planner_metadata;
	if (!isRecord(planner_metadata)) return undefined;
	const recipe_step_id: unknown = planner_metadata.recipe_step_id;
	if (typeof recipe_step_id !== "string" || recipe_step_id.length === 0) return undefined;
	return recipe_step_id;
}

export function deriveStepStatuses(
	_deps: DeriveStepStatusesDeps,
	params: DeriveStepStatusesParams,
): DeriveStepStatusesResult {
	const { steps, edges, jobs, stepIdToStepKey } = params;
	const result: DeriveStepStatusesResult = new Map<string, UnifiedStageStatus>();

	const successorMap: Map<string, Set<string>> = new Map<string, Set<string>>();
	for (const e of edges) {
		const set: Set<string> = successorMap.get(e.from_step_id) ?? new Set<string>();
		set.add(e.to_step_id);
		successorMap.set(e.from_step_id, set);
	}

	const stepKeyToHasActive: Map<string, boolean> = new Map<string, boolean>();
	const stepKeyToHasCompleted: Map<string, boolean> = new Map<string, boolean>();
	const stepKeyToHasFailed: Map<string, boolean> = new Map<string, boolean>();

	for (const job of jobs) {
		if (job.job_type === "RENDER") continue;
		if (job.target_contribution_id !== null) continue;
		const recipeStepId: string | undefined = getRecipeStepIdFromPayload(job.payload);
		if (recipeStepId === undefined) continue;
		const stepKey: string | undefined = stepIdToStepKey.get(recipeStepId);
		if (stepKey === undefined) continue;

		if (ACTIVE_STATUSES.has(job.status)) {
			stepKeyToHasActive.set(stepKey, true);
		} else if (job.status === "completed") {
			stepKeyToHasCompleted.set(stepKey, true);
		} else if (FAILED_STATUSES.has(job.status)) {
			stepKeyToHasFailed.set(stepKey, true);
		}
	}

	const stepsWithJobs: Set<string> = new Set<string>();
	for (const stepKey of stepKeyToHasActive.keys()) stepsWithJobs.add(stepKey);
	for (const stepKey of stepKeyToHasCompleted.keys()) stepsWithJobs.add(stepKey);
	for (const stepKey of stepKeyToHasFailed.keys()) stepsWithJobs.add(stepKey);

	const stepKeyToStepId: Map<string, string> = new Map<string, string>();
	for (const s of steps) {
		stepKeyToStepId.set(s.step_key, s.id);
	}

	for (const step of steps) {
		const sk: string = step.step_key;
		const hasActive: boolean = stepKeyToHasActive.get(sk) === true;
		const hasCompleted: boolean = stepKeyToHasCompleted.get(sk) === true;
		const hasFailed: boolean = stepKeyToHasFailed.get(sk) === true;
		const hasEvidence: boolean = hasActive || hasCompleted || hasFailed;

		if (hasEvidence) {
			if (hasActive) {
				result.set(sk, "in_progress");
			} else if (hasFailed) {
				result.set(sk, "failed");
			} else {
				result.set(sk, "completed");
			}
		} else {
			const stepId: string | undefined = stepKeyToStepId.get(sk);
			const successorIds: Set<string> | undefined = stepId !== undefined ? successorMap.get(stepId) : undefined;
			let anySuccessorReached: boolean = false;
			if (successorIds !== undefined) {
				for (const succId of successorIds) {
					const succKey: string | undefined = stepIdToStepKey.get(succId);
					if (succKey !== undefined && stepsWithJobs.has(succKey)) {
						anySuccessorReached = true;
						break;
					}
				}
			}
			result.set(sk, anySuccessorReached ? "completed" : "not_started");
		}
	}

	return result;
}
