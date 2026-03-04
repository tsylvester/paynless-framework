import type {
	BuildJobProgressDtosDeps,
	BuildJobProgressDtosParams,
	JobProgressDto,
} from "./dialectic.interface.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";
import { isPlannerMetadata } from "../_shared/utils/type-guards/type_guards.dialectic.ts";

export function buildJobProgressDtos(
	_deps: BuildJobProgressDtosDeps,
	params: BuildJobProgressDtosParams,
): Map<string, JobProgressDto[]> {
	const result: Map<string, JobProgressDto[]> = new Map<string, JobProgressDto[]>();

	for (const job of params.jobs) {
		const payload: unknown = job.payload;

		let stepKey: string | null = null;
		if (isRecord(payload) && isPlannerMetadata(payload.planner_metadata)) {
			const recipeStepId: string | undefined = payload.planner_metadata.recipe_step_id;
			if (typeof recipeStepId === "string" && recipeStepId.length > 0) {
				stepKey = params.stepIdToStepKey.get(recipeStepId) ?? null;
			}
		}

		const modelId: string | null =
			isRecord(payload) && typeof payload.model_id === "string" ? payload.model_id : null;

		const modelName: string | null =
			isRecord(payload) && typeof payload.model_slug === "string" ? payload.model_slug : null;

		const documentKey: string | null =
			isRecord(payload) && typeof payload.documentKey === "string" ? payload.documentKey : null;

		const dto: JobProgressDto = {
			id: job.id,
			status: job.status,
			jobType: job.job_type,
			stepKey,
			modelId,
			modelName,
			documentKey,
			parentJobId: job.parent_job_id,
			createdAt: job.created_at,
			startedAt: job.started_at,
			completedAt: job.completed_at,
		};

		const slug: string = job.stage_slug;
		const list: JobProgressDto[] = result.get(slug) ?? [];
		list.push(dto);
		result.set(slug, list);
	}

	return result;
}
