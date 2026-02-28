import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	DialecticJobRow,
	DialecticRenderJobPayload,
	DialecticExecuteJobPayload,
	BuildDocumentDescriptorsDeps,
	BuildDocumentDescriptorsParams,
	StageDocumentDescriptorDto,
} from "./dialectic.interface.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import { buildDocumentDescriptors } from "./buildDocumentDescriptors.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

const SESSION_ID = "session-1";
const STAGE_SLUG = "thesis";
const USER_ID = "user-1";
const ITERATION = 1;
const WALLET_ID = "wallet-1";
const USER_JWT = "jwt-token";

interface JobOverrides {
	parent_job_id?: string | null;
	stage_slug?: string;
}

function job(
	id: string,
	job_type: DialecticJobRow["job_type"],
	status: string,
	payload: DialecticRenderJobPayload | DialecticExecuteJobPayload,
	target_contribution_id: string | null,
	overrides?: JobOverrides,
): DialecticJobRow {
	if (!isJson(payload)) {
		throw new Error("Payload is not a valid JSON object");
	}
	const row: DialecticJobRow = {
		id,
		session_id: SESSION_ID,
		stage_slug: overrides?.stage_slug ?? STAGE_SLUG,
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
		parent_job_id: overrides?.parent_job_id ?? null,
		prerequisite_job_id: null,
		is_test_job: false,
	};
	return row;
}

const deps: BuildDocumentDescriptorsDeps = {};

Deno.test("buildDocumentDescriptors", async (t) => {
	await t.step("all tests call buildDocumentDescriptors(deps, params) with typed Deps and Params", () => {
		const resourceIdBySourceContributionId: Map<string, string> = new Map<string, string>();
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobIdToJob: Map<string, DialecticJobRow> = new Map<string, DialecticJobRow>();
		const params: BuildDocumentDescriptorsParams = {
			jobs: [],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		const result: Map<string, StageDocumentDescriptorDto[]> = buildDocumentDescriptors(deps, params);
		assertEquals(result.size, 0);
	});

	await t.step("completed RENDER job with matching resource produces descriptor with documentKey, modelId, jobId, latestRenderedResourceId, status completed", () => {
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
		const renderJob: DialecticJobRow = job("render-1", "RENDER", "completed", renderPayload, null);
		const resourceIdBySourceContributionId: Map<string, string> = new Map([["contrib-1", "resource-1"]]);
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobIdToJob: Map<string, DialecticJobRow> = new Map([["render-1", renderJob]]);
		const params: BuildDocumentDescriptorsParams = {
			jobs: [renderJob],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		const result: Map<string, StageDocumentDescriptorDto[]> = buildDocumentDescriptors(deps, params);
		assertEquals(result.size, 1);
		const descriptors: StageDocumentDescriptorDto[] = result.get(STAGE_SLUG) ?? [];
		assertEquals(descriptors.length, 1);
		assertEquals(descriptors[0].documentKey, FileType.business_case);
		assertEquals(descriptors[0].modelId, "model-1");
		assertEquals(descriptors[0].jobId, "render-1");
		assertEquals(descriptors[0].latestRenderedResourceId, "resource-1");
		assertEquals(descriptors[0].status, "completed");
	});

	await t.step("non-completed RENDER job skipped, no descriptor produced", () => {
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
		const renderJob: DialecticJobRow = job("render-1", "RENDER", "in_progress", renderPayload, null);
		const resourceIdBySourceContributionId: Map<string, string> = new Map([["contrib-1", "resource-1"]]);
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobIdToJob: Map<string, DialecticJobRow> = new Map([["render-1", renderJob]]);
		const params: BuildDocumentDescriptorsParams = {
			jobs: [renderJob],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		const result: Map<string, StageDocumentDescriptorDto[]> = buildDocumentDescriptors(deps, params);
		assertEquals(result.size, 0);
	});

	await t.step("RENDER job whose sourceContributionId has no matching resource produces error", async () => {
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
			sourceContributionId: "contrib-missing",
			template_filename: "template.md",
		};
		const renderJob: DialecticJobRow = job("render-1", "RENDER", "completed", renderPayload, null);
		const resourceIdBySourceContributionId: Map<string, string> = new Map<string, string>();
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobIdToJob: Map<string, DialecticJobRow> = new Map([["render-1", renderJob]]);
		const params: BuildDocumentDescriptorsParams = {
			jobs: [renderJob],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		await assertRejects(
			async () => {
				buildDocumentDescriptors(deps, params);
			},
			Error,
			"sourceContributionId",
		);
	});

	await t.step("stepKey derived from parent EXECUTE job planner_metadata recipe_step_id via stepIdToStepKey", () => {
		const execPayload: DialecticExecuteJobPayload = {
			sessionId: SESSION_ID,
			projectId: "proj-1",
			model_id: "model-1",
			walletId: WALLET_ID,
			user_jwt: USER_JWT,
			stageSlug: STAGE_SLUG,
			iterationNumber: ITERATION,
			planner_metadata: { recipe_step_id: "step-e1" },
			prompt_template_id: "tpl-1",
			output_type: FileType.business_case,
			canonicalPathParams: { contributionType: "thesis", stageSlug: STAGE_SLUG, sourceModelSlugs: [] },
			inputs: {},
		};
		const executeJob: DialecticJobRow = job("exec-1", "EXECUTE", "completed", execPayload, null);
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
		const renderJob: DialecticJobRow = job("render-1", "RENDER", "completed", renderPayload, null, { parent_job_id: "exec-1" });
		const resourceIdBySourceContributionId: Map<string, string> = new Map([["contrib-1", "resource-1"]]);
		const stepIdToStepKey: Map<string, string> = new Map([["step-e1", "business_case"]]);
		const jobIdToJob: Map<string, DialecticJobRow> = new Map<string, DialecticJobRow>([
			["exec-1", executeJob],
			["render-1", renderJob],
		]);
		const params: BuildDocumentDescriptorsParams = {
			jobs: [executeJob, renderJob],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		const result: Map<string, StageDocumentDescriptorDto[]> = buildDocumentDescriptors(deps, params);
		const descriptors: StageDocumentDescriptorDto[] = result.get(STAGE_SLUG) ?? [];
		assertEquals(descriptors.length, 1);
		assertEquals(descriptors[0].stepKey, "business_case");
	});

	await t.step("multiple completed RENDER jobs across stages descriptors grouped by stageSlug", () => {
		const renderPayloadA: DialecticRenderJobPayload = {
			sessionId: SESSION_ID,
			projectId: "proj-1",
			model_id: "model-1",
			walletId: WALLET_ID,
			user_jwt: USER_JWT,
			stageSlug: "thesis",
			iterationNumber: ITERATION,
			documentIdentity: "doc-a",
			documentKey: FileType.business_case,
			sourceContributionId: "contrib-a",
			template_filename: "template.md",
		};
		const renderPayloadB: DialecticRenderJobPayload = {
			sessionId: SESSION_ID,
			projectId: "proj-1",
			model_id: "model-1",
			walletId: WALLET_ID,
			user_jwt: USER_JWT,
			stageSlug: "antithesis",
			iterationNumber: ITERATION,
			documentIdentity: "doc-b",
			documentKey: FileType.business_case,
			sourceContributionId: "contrib-b",
			template_filename: "template.md",
		};
		const renderJobA: DialecticJobRow = job("render-a", "RENDER", "completed", renderPayloadA, null, { stage_slug: "thesis" });
		const renderJobB: DialecticJobRow = job("render-b", "RENDER", "completed", renderPayloadB, null, { stage_slug: "antithesis" });
		const resourceIdBySourceContributionId: Map<string, string> = new Map<string, string>([
			["contrib-a", "resource-a"],
			["contrib-b", "resource-b"],
		]);
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobIdToJob: Map<string, DialecticJobRow> = new Map<string, DialecticJobRow>([
			["render-a", renderJobA],
			["render-b", renderJobB],
		]);
		const params: BuildDocumentDescriptorsParams = {
			jobs: [renderJobA, renderJobB],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		const result: Map<string, StageDocumentDescriptorDto[]> = buildDocumentDescriptors(deps, params);
		assertEquals(result.size, 2);
		const thesisDescriptors: StageDocumentDescriptorDto[] = result.get("thesis") ?? [];
		const antithesisDescriptors: StageDocumentDescriptorDto[] = result.get("antithesis") ?? [];
		assertEquals(thesisDescriptors.length, 1);
		assertEquals(antithesisDescriptors.length, 1);
		assertEquals(thesisDescriptors[0].jobId, "render-a");
		assertEquals(antithesisDescriptors[0].jobId, "render-b");
	});

	await t.step("empty RENDER job array returns empty map", () => {
		const resourceIdBySourceContributionId: Map<string, string> = new Map<string, string>();
		const stepIdToStepKey: Map<string, string> = new Map<string, string>();
		const jobIdToJob: Map<string, DialecticJobRow> = new Map<string, DialecticJobRow>();
		const params: BuildDocumentDescriptorsParams = {
			jobs: [],
			resourceIdBySourceContributionId,
			stepIdToStepKey,
			jobIdToJob,
		};
		const result: Map<string, StageDocumentDescriptorDto[]> = buildDocumentDescriptors(deps, params);
		assertEquals(result.size, 0);
	});
});
