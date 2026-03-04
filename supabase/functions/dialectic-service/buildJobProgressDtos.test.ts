import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	BuildJobProgressDtosDeps,
	BuildJobProgressDtosParams,
	DialecticJobRow,
	JobProgressDto,
} from "./dialectic.interface.ts";
import type { Json } from "../types_db.ts";
import { buildJobProgressDtos } from "./buildJobProgressDtos.ts";

const SESSION_ID = "session-1";
const USER_ID = "user-1";
const ITERATION = 1;

function jobRow(
	id: string,
	job_type: DialecticJobRow["job_type"],
	status: string,
	payload: Json,
	overrides: {
		stage_slug?: string;
		parent_job_id?: string | null;
		created_at?: string;
		started_at?: string | null;
		completed_at?: string | null;
	} = {},
): DialecticJobRow {
	const row: DialecticJobRow = {
		id,
		session_id: SESSION_ID,
		stage_slug: overrides.stage_slug ?? "thesis",
		user_id: USER_ID,
		iteration_number: ITERATION,
		status,
		job_type,
		payload,
		target_contribution_id: null,
		attempt_count: 0,
		max_retries: 3,
		created_at: overrides.created_at ?? new Date().toISOString(),
		started_at: overrides.started_at ?? null,
		completed_at: overrides.completed_at ?? null,
		results: null,
		error_details: null,
		parent_job_id: overrides.parent_job_id ?? null,
		prerequisite_job_id: null,
		is_test_job: false,
	};
	return row;
}

const deps: BuildJobProgressDtosDeps = {};

Deno.test("buildJobProgressDtos", async (t) => {
	await t.step("job with complete planner_metadata.recipe_step_id in payload produces DTO with correct stepKey from stepIdToStepKey lookup", () => {
		const recipeStepId = "step-uuid-1";
		const stepKey = "header_context";
		const stepIdToStepKey: Map<string, string> = new Map([[recipeStepId, stepKey]]);
		const payload: Json = {
			planner_metadata: { recipe_step_id: recipeStepId },
			model_id: "model-1",
			documentKey: "business_case",
		};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		assertEquals(result.size, 1);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].stepKey, stepKey);
	});

	await t.step("job with model_id in payload produces DTO with correct modelId", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = { model_id: "model-abc" };
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].modelId, "model-abc");
	});

	await t.step("job with model_slug in payload produces DTO with correct modelName", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = { model_slug: "model-xyz" };
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].modelName, "model-xyz");
	});

	await t.step("job with documentKey in payload produces DTO with correct documentKey", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = { documentKey: "business_case" };
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "RENDER", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].documentKey, "business_case");
	});

	await t.step("job without planner_metadata produces DTO with stepKey null", () => {
		const stepIdToStepKey: Map<string, string> = new Map([["step-1", "step_a"]]);
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].stepKey, null);
	});

	await t.step("job without model_id produces DTO with modelId null", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "PLAN", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].modelId, null);
	});

	await t.step("job without documentKey produces DTO with documentKey null", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = { model_id: "m1" };
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].documentKey, null);
	});

	await t.step("PLAN job is included in output and not filtered", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-plan-1", "PLAN", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].jobType, "PLAN");
		assertEquals(dtos[0].id, "job-plan-1");
	});

	await t.step("EXECUTE job is included in output and not filtered", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-exec-1", "EXECUTE", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].jobType, "EXECUTE");
		assertEquals(dtos[0].id, "job-exec-1");
	});

	await t.step("RENDER job is included in output and not filtered", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-render-1", "RENDER", "completed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].jobType, "RENDER");
		assertEquals(dtos[0].id, "job-render-1");
	});

	await t.step("job with status failed is included and not filtered by status", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "failed", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].status, "failed");
	});

	await t.step("job with status superseded is included and not filtered by status", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "superseded", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].status, "superseded");
	});

	await t.step("job with status paused_nsf is included and not filtered by status", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "paused_nsf", payload),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].status, "paused_nsf");
	});

	await t.step("multiple jobs across two stage_slug values are grouped correctly in returned Map", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobs: DialecticJobRow[] = [
			jobRow("job-a", "EXECUTE", "completed", {}, { stage_slug: "thesis" }),
			jobRow("job-b", "RENDER", "completed", {}, { stage_slug: "thesis" }),
			jobRow("job-c", "PLAN", "completed", {}, { stage_slug: "antithesis" }),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		assertEquals(result.size, 2);
		const thesisDtos: JobProgressDto[] = result.get("thesis") ?? [];
		const antithesisDtos: JobProgressDto[] = result.get("antithesis") ?? [];
		assertEquals(thesisDtos.length, 2);
		assertEquals(antithesisDtos.length, 1);
		assertEquals(thesisDtos.map((d) => d.id).sort(), ["job-a", "job-b"]);
		assertEquals(antithesisDtos[0].id, "job-c");
	});

	await t.step("parentJobId is correctly mapped from parent_job_id column", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-child", "EXECUTE", "completed", payload, { parent_job_id: "job-parent-1" }),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].parentJobId, "job-parent-1");
	});

	await t.step("createdAt, startedAt, completedAt are correctly mapped from DB columns", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const createdAt = "2025-01-01T00:00:00.000Z";
		const startedAt = "2025-01-01T00:01:00.000Z";
		const completedAt = "2025-01-01T00:02:00.000Z";
		const payload: Json = {};
		const jobs: DialecticJobRow[] = [
			jobRow("job-1", "EXECUTE", "completed", payload, {
				created_at: createdAt,
				started_at: startedAt,
				completed_at: completedAt,
			}),
		];
		const params: BuildJobProgressDtosParams = { jobs, stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		const dtos: JobProgressDto[] = result.get("thesis") ?? [];
		assertEquals(dtos.length, 1);
		assertEquals(dtos[0].createdAt, createdAt);
		assertEquals(dtos[0].startedAt, startedAt);
		assertEquals(dtos[0].completedAt, completedAt);
	});

	await t.step("empty jobs array produces empty map", () => {
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const params: BuildJobProgressDtosParams = { jobs: [], stepIdToStepKey };
		const result: Map<string, JobProgressDto[]> = buildJobProgressDtos(deps, params);
		assertEquals(result.size, 0);
	});
});
