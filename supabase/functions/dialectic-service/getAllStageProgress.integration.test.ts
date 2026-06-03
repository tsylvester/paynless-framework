/**
 * Integration: real database template/session/project/jobs/resources; real getAllStageProgress
 * with real computeTemplateStageCounts (real topologicalSortSteps/computeExpectedCounts).
 * Mocks only at auth/wallet setup boundaries — all dialectic rows come from the database.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { User } from "npm:@supabase/supabase-js@2";
import type { ServiceError } from "../_shared/types.ts";
import type { TablesInsert } from "../types_db.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import type { CanonicalPathParams } from "../_shared/types/file_manager.types.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { isGetAllStageProgressResponse } from "../_shared/utils/type-guards/type_guards.dialectic.progress.ts";
import type { TestTierIntent } from "../_shared/_integration.test.interface.ts";
import {
	coreCleanupTestResources,
	coreCreateAndSetupTestUser,
	coreEnsureTestUserAndWallet,
	coreInitializeTestStep,
	coreSelectModelsForTier,
	initializeTestDeps,
} from "../_shared/_integration.test.utils.ts";
import type { ComputeTemplateStageCountsData } from "./computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import { buildComputeTemplateStageCountsPayload } from "./computeTemplateStageCounts/computeTemplateStageCounts.mock.ts";
import {
	buildComputeTemplateStageCountsDeps,
	buildComputeTemplateStageCountsParams,
	computeTemplateStageCounts,
	isComputeTemplateStageCountsResult,
} from "./computeTemplateStageCounts/computeTemplateStageCounts.provides.ts";
import { createProject } from "./createProject.ts";
import { startSession } from "./startSession.ts";
import { getAllStageProgress } from "./getAllStageProgress.ts";
import {
	buildGetAllStageProgressDeps,
	buildGetAllStageProgressParams,
} from "./getAllStageProgress.mock.ts";
import type {
	ContributionType,
	DialecticExecuteJobPayload,
	DialecticPlanJobPayload,
	DialecticProcessTemplate,
	DialecticProject,
	DialecticRenderJobPayload,
	DialecticStepPlannerMetadata,
	GetAllStageProgressPayload,
	GetAllStageProgressResponse,
	GetAllStageProgressResult,
	SelectedModels,
	StageProgressEntry,
	StartSessionPayload,
	StartSessionSuccessResponse,
	StepProgressDto,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
	ProgressRecipeStep,
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	ExpectedCountsResult,
} from "./dialectic.interface.ts";
import { topologicalSortSteps } from "./topologicalSortSteps.ts";
import { computeExpectedCounts } from "./computeExpectedCounts.ts";

const MODEL_COUNT = 3;
const THESIS_STAGE_SLUG = "thesis";

Deno.test("getAllStageProgress integration: DB template, real core, expectedCount matches spec", async (t) => {
	initializeTestDeps();
	const { adminClient } = await coreInitializeTestStep({}, "global");

	try {
		const tierIntent: TestTierIntent = { minModelsPerProject: MODEL_COUNT };
		const { userId, userClient, jwt, effectiveTier } = await coreCreateAndSetupTestUser(
			undefined,
			"global",
			tierIntent,
		);
		await coreEnsureTestUserAndWallet(userId, 1_000_000, "global");

		const userResponse = await userClient.auth.getUser();
		if (userResponse.error !== null) {
			throw userResponse.error;
		}
		if (userResponse.data.user === null) {
			throw new Error("Test user could not be fetched");
		}
		const testUser: User = userResponse.data.user;

		const walletResponse = await adminClient
			.from("token_wallets")
			.select("wallet_id")
			.eq("user_id", userId)
			.is("organization_id", null)
			.single();
		if (walletResponse.error !== null) {
			throw walletResponse.error;
		}
		if (walletResponse.data === null) {
			throw new Error("Wallet row missing");
		}
		const walletId: string = walletResponse.data.wallet_id;

		const domainResponse = await adminClient
			.from("dialectic_domains")
			.select("id")
			.eq("name", "Software Development")
			.single();
		if (domainResponse.error !== null) {
			throw domainResponse.error;
		}
		if (domainResponse.data === null) {
			throw new Error("Software Development domain missing");
		}
		const domainId: string = domainResponse.data.id;

		const modelSelection = await coreSelectModelsForTier(
			adminClient,
			userClient,
			effectiveTier,
			MODEL_COUNT,
		);
		const selectedModels: SelectedModels[] = modelSelection.selectedModels;

		const projectFormData = new FormData();
		projectFormData.append("projectName", `getAllStageProgress IT ${crypto.randomUUID().slice(0, 8)}`);
		projectFormData.append(
			"initialUserPromptText",
			"Integration test: getAllStageProgress expectedCount boundary.",
		);
		projectFormData.append("selectedDomainId", domainId);
		projectFormData.append("idempotencyKey", crypto.randomUUID());

		const projectResult = await createProject(projectFormData, adminClient, testUser);
		if (projectResult.error !== undefined) {
			throw new Error(projectResult.error.message);
		}
		if (projectResult.data === undefined) {
			throw new Error("createProject returned no data");
		}
		const project: DialecticProject = projectResult.data;

		if (project.process_template === null) {
			throw new Error("Project has no process_template");
		}
		if (project.process_template === undefined) {
			throw new Error("Project has no process_template");
		}
		const processTemplate: DialecticProcessTemplate = project.process_template;
		const processTemplateId: string = processTemplate.id;

		const sessionPayload: StartSessionPayload = {
			projectId: project.id,
			selectedModels,
			sessionDescription: "getAllStageProgress integration session",
			idempotencyKey: crypto.randomUUID(),
		};
		const sessionResult = await startSession(testUser, adminClient, userClient, sessionPayload);
		if (sessionResult.error !== undefined) {
			throw new Error(sessionResult.error.message);
		}
		if (sessionResult.data === undefined) {
			throw new Error("startSession returned no data");
		}
		const session: StartSessionSuccessResponse = sessionResult.data;

		const countsDeps = buildComputeTemplateStageCountsDeps({ 
			dbClient: adminClient, topologicalSortSteps: (
				d: TopologicalSortStepsDeps, 
				p: TopologicalSortStepsParams): ProgressRecipeStep[] => topologicalSortSteps(d, p), computeExpectedCounts: (
					deps: ComputeExpectedCountsDeps, 
					params: ComputeExpectedCountsParams): ExpectedCountsResult => computeExpectedCounts(deps, params) });
		const countsParams = buildComputeTemplateStageCountsParams();
		const countsPayload = buildComputeTemplateStageCountsPayload({
			processTemplateId,
			modelCount: MODEL_COUNT,
		});
		const countsResult = await computeTemplateStageCounts(countsDeps, countsParams, countsPayload);
		assertEquals(isComputeTemplateStageCountsResult(countsResult), true);
		if (countsResult.status !== 200) {
			if (countsResult.error !== undefined) {
				throw countsResult.error;
			}
			const failure: ServiceError = {
				message: "computeTemplateStageCounts baseline failed without ServiceError",
				status: 500,
			};
			throw failure;
		}
		if (countsResult.data === undefined) {
			const failure: ServiceError = {
				message: "computeTemplateStageCounts baseline returned 200 without data",
				status: 500,
			};
			throw failure;
		}
		const countsData: ComputeTemplateStageCountsData = countsResult.data;

		const progressPayload: GetAllStageProgressPayload = {
			sessionId: session.id,
			iterationNumber: 1,
			userId: testUser.id,
			projectId: project.id,
		};
		const progressParams = buildGetAllStageProgressParams(progressPayload);
		const progressDeps = buildGetAllStageProgressDeps(adminClient, testUser, {
			computeTemplateStageCounts,
		});
		const progressResult: GetAllStageProgressResult = await getAllStageProgress(
			progressDeps,
			progressParams,
		);

		assertEquals(progressResult.status, 200);
		if (progressResult.status !== 200) {
			if (progressResult.error !== undefined) {
				throw progressResult.error;
			}
			const failure: ServiceError = {
				message: "getAllStageProgress failed without ServiceError",
				status: 500,
			};
			throw failure;
		}
		if (progressResult.data === undefined) {
			const failure: ServiceError = {
				message: "getAllStageProgress returned 200 without data",
				status: 500,
			};
			throw failure;
		}
		const progressData: GetAllStageProgressResponse = progressResult.data;

		await t.step("response passes isGetAllStageProgressResponse", () => {
			assertEquals(isGetAllStageProgressResponse(progressData), true);
		});

		await t.step("dagProgress.totalStages matches core baseline", () => {
			assertEquals(progressData.dagProgress.totalStages, countsData.totalStages);
			assertEquals(progressData.stages.length, countsData.stages.length);
		});

		await t.step("each StageProgressEntry.expectedCount equals StageCountsEntry.totalExpected", () => {
			for (const countsEntry of countsData.stages) {
				let progressEntry: StageProgressEntry = progressData.stages[0];
				for (const candidate of progressData.stages) {
					if (candidate.stageSlug === countsEntry.stageSlug) {
						progressEntry = candidate;
					}
				}
				assertEquals(progressEntry.stageSlug, countsEntry.stageSlug);
				assertEquals(progressEntry.expectedCount, countsEntry.totalExpected);
			}
		});

		await t.step("thesis stage totalExpected is 4n+1 at n=MODEL_COUNT", () => {
			let thesisFound = false;
			for (const countsEntry of countsData.stages) {
				if (countsEntry.stageSlug !== THESIS_STAGE_SLUG) {
					continue;
				}
				thesisFound = true;
				assertEquals(countsEntry.totalExpected, 4 * MODEL_COUNT + 1);
				let progressEntry: StageProgressEntry = progressData.stages[0];
				for (const candidate of progressData.stages) {
					if (candidate.stageSlug === THESIS_STAGE_SLUG) {
						progressEntry = candidate;
					}
				}
				assertEquals(progressEntry.expectedCount, 4 * MODEL_COUNT + 1);
			}
			assertEquals(thesisFound, true);
		});

		await t.step("thesis layering: completed jobs surface jobs documents steps and statuses", async () => {
			const stageSlug: string = THESIS_STAGE_SLUG;
			const iterationNumber: number = 1;
			const modelId: string = selectedModels[0].id;

			const stageResponse = await adminClient
				.from("dialectic_stages")
				.select("active_recipe_instance_id")
				.eq("slug", stageSlug)
				.single();
			if (stageResponse.error !== null) {
				throw stageResponse.error;
			}
			if (stageResponse.data === null) {
				throw new Error("thesis stage row missing");
			}
			if (stageResponse.data.active_recipe_instance_id === null) {
				throw new Error("thesis stage has no active_recipe_instance_id");
			}
			const instanceId: string = stageResponse.data.active_recipe_instance_id;

			const instanceResponse = await adminClient
				.from("dialectic_stage_recipe_instances")
				.select("id, is_cloned, template_id")
				.eq("id", instanceId)
				.single();
			if (instanceResponse.error !== null) {
				throw instanceResponse.error;
			}
			if (instanceResponse.data === null) {
				throw new Error("recipe instance row missing");
			}

			let executeRecipeStepId: string;
			if (instanceResponse.data.is_cloned === true) {
				const stepResponse = await adminClient
					.from("dialectic_stage_recipe_steps")
					.select("id")
					.eq("instance_id", instanceId)
					.eq("job_type", "EXECUTE")
					.limit(1)
					.single();
				if (stepResponse.error !== null) {
					throw stepResponse.error;
				}
				if (stepResponse.data === null) {
					throw new Error("cloned EXECUTE step missing");
				}
				executeRecipeStepId = stepResponse.data.id;
			} else {
				if (instanceResponse.data.template_id === null) {
					throw new Error("non-cloned instance missing template_id");
				}
				const templateId: string = instanceResponse.data.template_id;
				const stepResponse = await adminClient
					.from("dialectic_recipe_template_steps")
					.select("id")
					.eq("template_id", templateId)
					.eq("job_type", "EXECUTE")
					.limit(1)
					.single();
				if (stepResponse.error !== null) {
					throw stepResponse.error;
				}
				if (stepResponse.data === null) {
					throw new Error("template EXECUTE step missing");
				}
				executeRecipeStepId = stepResponse.data.id;
			}

			const planPayload: DialecticPlanJobPayload = {
				sessionId: session.id,
				projectId: project.id,
				stageSlug,
				iterationNumber,
				walletId,
				continueUntilComplete: true,
				user_jwt: jwt,
				model_id: modelId,
				idempotencyKey: crypto.randomUUID(),
			};
			if (!isJson(planPayload)) {
				throw new Error("Invalid plan payload");
			}
			const planJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
				session_id: session.id,
				user_id: userId,
				stage_slug: stageSlug,
				iteration_number: iterationNumber,
				payload: planPayload,
				status: "completed",
				job_type: "PLAN",
				is_test_job: true,
				max_retries: 0,
				attempt_count: 0,
				results: null,
				error_details: null,
				parent_job_id: null,
				prerequisite_job_id: null,
				target_contribution_id: null,
				started_at: null,
				completed_at: new Date().toISOString(),
			};
			const planJobResponse = await adminClient
				.from("dialectic_generation_jobs")
				.insert(planJobInsert)
				.select("id")
				.single();
			if (planJobResponse.error !== null) {
				throw planJobResponse.error;
			}
			if (planJobResponse.data === null) {
				throw new Error("plan job insert returned null");
			}
			const planJobId: string = planJobResponse.data.id;

			const contributionType: ContributionType = "thesis";
			const canonicalPathParams: CanonicalPathParams = {
				contributionType,
				stageSlug,
			};
			const plannerMetadata: DialecticStepPlannerMetadata = {
				recipe_step_id: executeRecipeStepId,
				stage_slug: stageSlug,
			};
			const executePayload: DialecticExecuteJobPayload = {
				sessionId: session.id,
				projectId: project.id,
				stageSlug,
				iterationNumber,
				walletId,
				user_jwt: jwt,
				model_id: modelId,
				idempotencyKey: crypto.randomUUID(),
				prompt_template_id: "pt-getAllStageProgress-integration",
				output_type: FileType.business_case,
				canonicalPathParams,
				inputs: {},
				planner_metadata: plannerMetadata,
			};
			if (!isJson(executePayload)) {
				throw new Error("Invalid execute payload");
			}
			const executeJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
				session_id: session.id,
				user_id: userId,
				stage_slug: stageSlug,
				iteration_number: iterationNumber,
				payload: executePayload,
				status: "completed",
				job_type: "EXECUTE",
				is_test_job: true,
				max_retries: 0,
				attempt_count: 0,
				results: null,
				error_details: null,
				parent_job_id: planJobId,
				prerequisite_job_id: null,
				target_contribution_id: null,
				started_at: null,
				completed_at: new Date().toISOString(),
			};
			const executeJobResponse = await adminClient
				.from("dialectic_generation_jobs")
				.insert(executeJobInsert)
				.select("id")
				.single();
			if (executeJobResponse.error !== null) {
				throw executeJobResponse.error;
			}
			if (executeJobResponse.data === null) {
				throw new Error("execute job insert returned null");
			}
			const executeJobId: string = executeJobResponse.data.id;

			const sourceContributionId: string = crypto.randomUUID();
			const modelName: string = selectedModels[0].displayName;
			const contributionInsert: TablesInsert<"dialectic_contributions"> = {
				id: sourceContributionId,
				session_id: session.id,
				stage: stageSlug,
				iteration_number: iterationNumber,
				model_id: modelId,
				model_name: modelName,
				user_id: userId,
				contribution_type: contributionType,
				storage_bucket: "dialectic-documents",
				storage_path: `integration/${project.id}/contributions/${sourceContributionId}`,
				file_name: "business_case.json",
				mime_type: "application/json",
				size_bytes: 128,
				is_latest_edit: true,
				edit_version: 1,
			};
			const contributionResponse = await adminClient
				.from("dialectic_contributions")
				.insert(contributionInsert)
				.select("id")
				.single();
			if (contributionResponse.error !== null) {
				throw contributionResponse.error;
			}
			if (contributionResponse.data === null) {
				throw new Error("contribution insert returned null");
			}

			const renderPayload: DialecticRenderJobPayload = {
				idempotencyKey: crypto.randomUUID(),
				sessionId: session.id,
				projectId: project.id,
				stageSlug,
				iterationNumber,
				walletId,
				user_jwt: jwt,
				model_id: modelId,
				documentIdentity: "doc-getAllStageProgress-integration",
				documentKey: FileType.business_case,
				sourceContributionId,
				template_filename: "output.md",
			};
			if (!isJson(renderPayload)) {
				throw new Error("Invalid render payload");
			}
			const renderJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
				session_id: session.id,
				user_id: userId,
				stage_slug: stageSlug,
				iteration_number: iterationNumber,
				payload: renderPayload,
				status: "completed",
				job_type: "RENDER",
				is_test_job: true,
				max_retries: 0,
				attempt_count: 0,
				results: null,
				error_details: null,
				parent_job_id: executeJobId,
				prerequisite_job_id: null,
				target_contribution_id: null,
				started_at: null,
				completed_at: new Date().toISOString(),
			};
			const renderJobResponse = await adminClient
				.from("dialectic_generation_jobs")
				.insert(renderJobInsert)
				.select("id")
				.single();
			if (renderJobResponse.error !== null) {
				throw renderJobResponse.error;
			}
			if (renderJobResponse.data === null) {
				throw new Error("render job insert returned null");
			}

			const resourceInsert: TablesInsert<"dialectic_project_resources"> = {
				file_name: "business_case.md",
				mime_type: "text/markdown",
				project_id: project.id,
				size_bytes: 128,
				storage_path: `integration/${project.id}/business_case.md`,
				storage_bucket: "dialectic-documents",
				user_id: userId,
				resource_type: "rendered_document",
				session_id: session.id,
				stage_slug: stageSlug,
				iteration_number: iterationNumber,
				source_contribution_id: sourceContributionId,
			};
			const resourceResponse = await adminClient
				.from("dialectic_project_resources")
				.insert(resourceInsert)
				.select("id")
				.single();
			if (resourceResponse.error !== null) {
				throw resourceResponse.error;
			}
			if (resourceResponse.data === null) {
				throw new Error("resource insert returned null");
			}

			const layeredResult: GetAllStageProgressResult = await getAllStageProgress(
				progressDeps,
				progressParams,
			);
			assertEquals(layeredResult.status, 200);
			if (layeredResult.data === undefined) {
				throw new Error("layered getAllStageProgress returned no data");
			}
			const layeredData: GetAllStageProgressResponse = layeredResult.data;

			let thesisEntry: StageProgressEntry = layeredData.stages[0];
			for (const candidate of layeredData.stages) {
				if (candidate.stageSlug === THESIS_STAGE_SLUG) {
					thesisEntry = candidate;
				}
			}
			assertEquals(thesisEntry.stageSlug, THESIS_STAGE_SLUG);
			assertEquals(thesisEntry.expectedCount, 4 * MODEL_COUNT + 1);
			assertEquals(thesisEntry.modelCount, MODEL_COUNT);
			assertEquals(thesisEntry.status, "in_progress");
			assertEquals(thesisEntry.jobs.length >= 3, true);
			assertEquals(thesisEntry.documents.length > 0, true);
			assertEquals(thesisEntry.steps.length > 0, true);
			assertEquals(thesisEntry.progress.totalSteps > 0, true);
			let completedStepCount = 0;
			for (const stepDto of thesisEntry.steps) {
				const step: StepProgressDto = stepDto;
				if (step.status === "completed") {
					completedStepCount += 1;
				}
			}
			assertEquals(completedStepCount > 0, true);
			assertEquals(layeredData.dagProgress.totalStages, countsData.totalStages);
		});
	} finally {
		await coreCleanupTestResources();
	}
});
