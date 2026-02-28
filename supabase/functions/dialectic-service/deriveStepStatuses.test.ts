import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	DialecticJobRow,
	DialecticExecuteJobPayload,
	DialecticPlanJobPayload,
	DialecticRenderJobPayload,
	ProgressRecipeStep,
	ProgressRecipeEdge,
	DeriveStepStatusesDeps,
	DeriveStepStatusesParams,
	DeriveStepStatusesResult,
} from "./dialectic.interface.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import { deriveStepStatuses } from "./deriveStepStatuses.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

const SESSION_ID = "session-1";
const STAGE_SLUG = "thesis";
const USER_ID = "user-1";
const ITERATION = 1;
const WALLET_ID = "wallet-1";
const USER_JWT = "jwt-token";

function job(
	id: string,
	job_type: DialecticJobRow["job_type"],
	status: string,
	payload: DialecticExecuteJobPayload | DialecticPlanJobPayload | DialecticRenderJobPayload,
	target_contribution_id: string | null,
): DialecticJobRow {
	if (!isJson(payload)) {
		throw new Error("Payload is not a valid JSON object");
	}
	const row: DialecticJobRow = {
		id,
		session_id: SESSION_ID,
		stage_slug: STAGE_SLUG,
		user_id: USER_ID,
		iteration_number: ITERATION,
		status,
		job_type,
		payload,
		target_contribution_id,
		attempt_count: 0,
		max_retries: 3,
		created_at: new Date().toISOString(),
		started_at: null,
		completed_at: null,
		results: null,
		error_details: null,
		parent_job_id: null,
		prerequisite_job_id: null,
		is_test_job: false,
	};
	return row;
}

function step(
	id: string,
	step_key: string,
	job_type: ProgressRecipeStep["job_type"],
	granularity_strategy: ProgressRecipeStep["granularity_strategy"],
): ProgressRecipeStep {
	return { id, step_key, job_type, granularity_strategy };
}

function edge(from_step_id: string, to_step_id: string): ProgressRecipeEdge {
	return { from_step_id, to_step_id };
}

function execPayload(recipe_step_id: string): DialecticExecuteJobPayload {
	return {
		sessionId: SESSION_ID,
		projectId: "proj-1",
		model_id: "model-1",
		walletId: WALLET_ID,
		user_jwt: USER_JWT,
		stageSlug: STAGE_SLUG,
		iterationNumber: ITERATION,
		planner_metadata: { recipe_step_id },
		prompt_template_id: "tpl-1",
		output_type: FileType.business_case,
		canonicalPathParams: { contributionType: "thesis", stageSlug: STAGE_SLUG, sourceModelSlugs: [] },
		inputs: {},
	};
}

const deps: DeriveStepStatusesDeps = {};

Deno.test("deriveStepStatuses", async (t) => {
	await t.step("all tests call deriveStepStatuses(deps, params) with typed Deps and Params", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "step_a", "EXECUTE", "per_model")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "step_a"]]);
		const params: DeriveStepStatusesParams = {
			steps,
			edges: [],
			jobs: [],
			stepIdToStepKey,
		};
		const result: DeriveStepStatusesResult = deriveStepStatuses(deps, params);
		assertEquals(result.get("step_a"), "not_started");
	});

	await t.step("step with completed jobs (no active, no failed) → status completed", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "business_case", "EXECUTE", "per_source_document")];
		const edges: ProgressRecipeEdge[] = [];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "business_case"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("e1"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges, jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("business_case"), "completed");
	});

	await t.step("step with active jobs (pending) → status in_progress", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "feature_spec", "EXECUTE", "per_model")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "feature_spec"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "pending", execPayload("e1"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("feature_spec"), "in_progress");
	});

	await t.step("step with active jobs (processing, retrying, waiting_for_prerequisite, waiting_for_children) → status in_progress", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "technical_approach", "EXECUTE", "per_source_document")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "technical_approach"]]);
		for (const status of ["processing", "retrying", "waiting_for_prerequisite", "waiting_for_children"] as const) {
			const jobs: DialecticJobRow[] = [
				job("j1", "EXECUTE", status, execPayload("e1"), null),
			];
			const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
			const result = deriveStepStatuses(deps, params);
			assertEquals(result.get("technical_approach"), "in_progress", `status ${status} should yield in_progress`);
		}
	});

	await t.step("step with failed/retry_loop_failed jobs and no active jobs → status failed", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "success_metrics", "EXECUTE", "per_model")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "success_metrics"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "failed", execPayload("e1"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("success_metrics"), "failed");
	});

	await t.step("step with retry_loop_failed job and no active jobs → status failed", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "step_x", "EXECUTE", "all_to_one")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "step_x"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "retry_loop_failed", execPayload("e1"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("step_x"), "failed");
	});

	await t.step("step with both active and failed jobs → status in_progress (active takes precedence)", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "mixed_step", "EXECUTE", "per_model")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "mixed_step"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "failed", execPayload("e1"), null),
			job("j2", "EXECUTE", "pending", execPayload("e1"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("mixed_step"), "in_progress");
	});

	await t.step("step with no jobs whose successors have been reached (have jobs) → status completed", () => {
		const plan = step("p1", "plan_header", "PLAN", "all_to_one");
		const exec = step("e1", "business_case", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [plan, exec];
		const edges: ProgressRecipeEdge[] = [edge("p1", "e1")];
		const stepIdToStepKey: Map<string, string> = new Map([["p1", "plan_header"], ["e1", "business_case"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("e1"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges, jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("plan_header"), "completed");
		assertEquals(result.get("business_case"), "completed");
	});

	await t.step("step with no jobs whose successors have NOT been reached → status not_started", () => {
		const plan = step("p1", "plan_header", "PLAN", "all_to_one");
		const exec = step("e1", "business_case", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [plan, exec];
		const edges: ProgressRecipeEdge[] = [edge("p1", "e1")];
		const stepIdToStepKey: Map<string, string> = new Map([["p1", "plan_header"], ["e1", "business_case"]]);
		const params: DeriveStepStatusesParams = { steps, edges, jobs: [], stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("plan_header"), "not_started");
		assertEquals(result.get("business_case"), "not_started");
	});

	await t.step("leaf step with no jobs → status not_started", () => {
		const plan = step("p1", "plan_header", "PLAN", "all_to_one");
		const leaf = step("e1", "leaf_step", "EXECUTE", "per_model");
		const steps: ProgressRecipeStep[] = [plan, leaf];
		const edges: ProgressRecipeEdge[] = [edge("p1", "e1")];
		const stepIdToStepKey: Map<string, string> = new Map([["p1", "plan_header"], ["e1", "leaf_step"]]);
		const params: DeriveStepStatusesParams = { steps, edges, jobs: [], stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("leaf_step"), "not_started");
	});

	await t.step("root PLAN job (no recipe_step_id) excluded from step attribution", () => {
		const planPayload: DialecticPlanJobPayload = {
			sessionId: SESSION_ID,
			projectId: "proj-1",
			model_id: "model-1",
			walletId: WALLET_ID,
			user_jwt: USER_JWT,
			stageSlug: STAGE_SLUG,
			iterationNumber: ITERATION,
		};
		const plan = step("p1", "plan_header", "PLAN", "all_to_one");
		const steps: ProgressRecipeStep[] = [plan];
		const stepIdToStepKey: Map<string, string> = new Map([["p1", "plan_header"]]);
		const jobs: DialecticJobRow[] = [
			job("root-plan", "PLAN", "completed", planPayload, null),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("plan_header"), "not_started");
	});

	await t.step("RENDER jobs excluded from step attribution", () => {
		const renderPayload: DialecticRenderJobPayload = {
			sessionId: SESSION_ID,
			projectId: "proj-1",
			model_id: "model-1",
			walletId: WALLET_ID,
			user_jwt: USER_JWT,
			stageSlug: STAGE_SLUG,
			iterationNumber: ITERATION,
			documentIdentity: "doc-1",
			documentKey: FileType.business_case,
			sourceContributionId: "contrib-1",
			template_filename: "template.md",
		};
		const steps: ProgressRecipeStep[] = [step("e1", "business_case", "EXECUTE", "per_source_document")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "business_case"]]);
		const jobs: DialecticJobRow[] = [
			job("render-1", "RENDER", "completed", renderPayload, null),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("business_case"), "not_started");
	});

	await t.step("continuation jobs (non-null target_contribution_id) excluded from step attribution", () => {
		const steps: ProgressRecipeStep[] = [step("e1", "business_case", "EXECUTE", "per_source_document")];
		const stepIdToStepKey: Map<string, string> = new Map([["e1", "business_case"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("e1"), "contrib-target"),
		];
		const params: DeriveStepStatusesParams = { steps, edges: [], jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("business_case"), "not_started");
	});

	await t.step("linear chain A→B→C: step status per evidence", () => {
		const A = step("a", "step_a", "PLAN", "all_to_one");
		const B = step("b", "step_b", "EXECUTE", "per_model");
		const C = step("c", "step_c", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [A, B, C];
		const edges: ProgressRecipeEdge[] = [edge("a", "b"), edge("b", "c")];
		const stepIdToStepKey: Map<string, string> = new Map([["a", "step_a"], ["b", "step_b"], ["c", "step_c"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("b"), null),
			job("j2", "EXECUTE", "pending", execPayload("c"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges, jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("step_a"), "completed");
		assertEquals(result.get("step_b"), "completed");
		assertEquals(result.get("step_c"), "in_progress");
	});

	await t.step("diamond A→B, A→C, B→D, C→D: all steps get status", () => {
		const A = step("a", "plan", "PLAN", "all_to_one");
		const B = step("b", "b", "EXECUTE", "per_model");
		const C = step("c", "c", "EXECUTE", "per_model");
		const D = step("d", "d", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [A, B, C, D];
		const edges: ProgressRecipeEdge[] = [
			edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d"),
		];
		const stepIdToStepKey: Map<string, string> = new Map([["a", "plan"], ["b", "b"], ["c", "c"], ["d", "d"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("b"), null),
			job("j2", "EXECUTE", "completed", execPayload("c"), null),
			job("j3", "EXECUTE", "completed", execPayload("d"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges, jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("plan"), "completed");
		assertEquals(result.get("b"), "completed");
		assertEquals(result.get("c"), "completed");
		assertEquals(result.get("d"), "completed");
	});

	await t.step("disconnected parallel groups: each step status independent", () => {
		const A = step("a", "a", "EXECUTE", "per_model");
		const B = step("b", "b", "EXECUTE", "per_model");
		const steps: ProgressRecipeStep[] = [A, B];
		const edges: ProgressRecipeEdge[] = [];
		const stepIdToStepKey: Map<string, string> = new Map([["a", "a"], ["b", "b"]]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("a"), null),
		];
		const params: DeriveStepStatusesParams = { steps, edges, jobs, stepIdToStepKey };
		const result = deriveStepStatuses(deps, params);
		assertEquals(result.get("a"), "completed");
		assertEquals(result.get("b"), "not_started");
	});

	await t.step("status independent of granularity strategy and model count", () => {
		const stepsPerModel: ProgressRecipeStep[] = [
			step("e1", "step_per_model", "EXECUTE", "per_model"),
		];
		const stepsAllToOne: ProgressRecipeStep[] = [
			step("e2", "step_all_to_one", "EXECUTE", "all_to_one"),
		];
		const stepIdToStepKey: Map<string, string> = new Map([
			["e1", "step_per_model"],
			["e2", "step_all_to_one"],
		]);
		const jobs: DialecticJobRow[] = [
			job("j1", "EXECUTE", "completed", execPayload("e1"), null),
			job("j2", "EXECUTE", "completed", execPayload("e2"), null),
		];
		const paramsPerModel: DeriveStepStatusesParams = {
			steps: stepsPerModel,
			edges: [],
			jobs: [jobs[0]],
			stepIdToStepKey,
		};
		const paramsAllToOne: DeriveStepStatusesParams = {
			steps: stepsAllToOne,
			edges: [],
			jobs: [jobs[1]],
			stepIdToStepKey,
		};
		const resultPerModel = deriveStepStatuses(deps, paramsPerModel);
		const resultAllToOne = deriveStepStatuses(deps, paramsAllToOne);
		assertEquals(resultPerModel.get("step_per_model"), "completed");
		assertEquals(resultAllToOne.get("step_all_to_one"), "completed");
	});
});
