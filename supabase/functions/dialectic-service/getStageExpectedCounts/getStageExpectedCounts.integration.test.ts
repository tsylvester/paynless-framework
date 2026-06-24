/**
 * Integration: real process template from database; real getStageExpectedCounts
 * with real computeTemplateStageCounts (real topologicalSortSteps/computeExpectedCounts).
 * Mocks only at auth setup boundaries — template, transitions, stages, and recipes come from the database.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { User } from "npm:@supabase/supabase-js@2";
import type { ServiceError } from "../../_shared/types.ts";
import type { Tables } from "../../types_db.ts";
import type {
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	DialecticStage,
	DialecticStageRecipeInstance,
	DialecticStageTransition,
	ExpectedCountsResult,
	PriorStageContext,
	ProgressRecipeStep,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "../dialectic.interface.ts";
import { computeExpectedCounts } from "../computeExpectedCounts.ts";
import { topologicalSortSteps } from "../topologicalSortSteps.ts";
import type { ComputeTemplateStageCountsData, StageCountsEntry } from "../computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import {
	buildComputeTemplateStageCountsDeps,
	buildComputeTemplateStageCountsParams,
	buildComputeTemplateStageCountsPayload,
	computeTemplateStageCounts,
	isComputeTemplateStageCountsResult,
} from "../computeTemplateStageCounts/computeTemplateStageCounts.provides.ts";
import {
	coreCleanupTestResources,
	coreCreateAndSetupTestUser,
	coreInitializeTestStep,
	initializeTestDeps,
} from "../../_shared/_integration.test.utils.ts";
import type {
	GetStageExpectedCountsPayload,
	GetStageExpectedCountsResponse,
	GetStageExpectedCountsResult,
	StageExpectedCount,
} from "./getStageExpectedCounts.interface.ts";
import {
	buildGetStageExpectedCountsDeps,
	buildGetStageExpectedCountsParams,
	buildGetStageExpectedCountsPayload,
	getStageExpectedCounts,
	isGetStageExpectedCountsResponse,
	isGetStageExpectedCountsResult,
} from "./getStageExpectedCounts.provides.ts";

const MODEL_COUNT = 3;
const THESIS_STAGE_SLUG = "thesis";
const ANTITHESIS_STAGE_SLUG = "antithesis";

function captureSum(countResult: ExpectedCountsResult): number {
	let sum = 0;
	for (const count of countResult.expected.values()) {
		sum += count;
	}
	return sum;
}

Deno.test("getStageExpectedCounts integration: database template, real core, every stage expectedCount matches spec", async (t) => {
	initializeTestDeps();
	const { adminClient } = await coreInitializeTestStep({}, "global");

	try {
		const { userClient } = await coreCreateAndSetupTestUser(undefined, "global");
		const userResponse = await userClient.auth.getUser();
		if (userResponse.error !== null) {
			throw userResponse.error;
		}
		if (userResponse.data.user === null) {
			throw new Error("Test user could not be fetched");
		}
		const testUser: User = userResponse.data.user;

		const templateResponse = await adminClient
			.from("dialectic_process_templates")
			.select("*")
			.not("starting_stage_id", "is", null)
			.limit(1)
			.single();
		if (templateResponse.error !== null) {
			throw templateResponse.error;
		}
		if (templateResponse.data === null) {
			throw new Error("No process template with starting_stage_id found in database");
		}
		const processTemplateId: string = templateResponse.data.id;

		const transitionsResponse = await adminClient
			.from("dialectic_stage_transitions")
			.select("*")
			.eq("process_template_id", processTemplateId);
		if (transitionsResponse.error !== null) {
			throw transitionsResponse.error;
		}
		if (transitionsResponse.data === null) {
			throw new Error("Stage transitions query returned null");
		}
		const transitionRows: DialecticStageTransition[] = transitionsResponse.data;

		const templateStageIdSet = new Set<string>();
		for (const transitionRow of transitionRows) {
			templateStageIdSet.add(transitionRow.source_stage_id);
			templateStageIdSet.add(transitionRow.target_stage_id);
		}
		const templateStageIds: string[] = Array.from(templateStageIdSet);

		const stagesResponse = await adminClient
			.from("dialectic_stages")
			.select("*")
			.in("id", templateStageIds);
		if (stagesResponse.error !== null) {
			throw stagesResponse.error;
		}
		if (stagesResponse.data === null) {
			throw new Error("Stages query returned null");
		}
		const stageRows: DialecticStage[] = stagesResponse.data;

		const capturedParams: ComputeExpectedCountsParams[] = [];
		const capturedResults: ExpectedCountsResult[] = [];

		const wrappedComputeExpectedCounts = (
			countDeps: ComputeExpectedCountsDeps,
			countParams: ComputeExpectedCountsParams,
		): ExpectedCountsResult => {
			capturedParams.push(countParams);
			const countResult: ExpectedCountsResult = computeExpectedCounts(countDeps, countParams);
			capturedResults.push(countResult);
			return countResult;
		};

		const coreDeps = buildComputeTemplateStageCountsDeps({
			dbClient: adminClient,
			computeExpectedCounts: wrappedComputeExpectedCounts,
			topologicalSortSteps: (
				sortDeps: TopologicalSortStepsDeps,
				sortParams: TopologicalSortStepsParams,
			): ProgressRecipeStep[] => topologicalSortSteps(sortDeps, sortParams),
		});
		const coreParams = buildComputeTemplateStageCountsParams();
		const corePayload = buildComputeTemplateStageCountsPayload({
			processTemplateId,
			modelCount: MODEL_COUNT,
		});

		const baselineResult = await computeTemplateStageCounts(coreDeps, coreParams, corePayload);
		assertEquals(isComputeTemplateStageCountsResult(baselineResult), true);
		if (baselineResult.status !== 200) {
			if (baselineResult.error !== undefined) {
				throw baselineResult.error;
			}
			const failure: ServiceError = {
				message: "computeTemplateStageCounts baseline failed without ServiceError",
				status: 500,
			};
			throw failure;
		}
		if (baselineResult.data === undefined) {
			const failure: ServiceError = {
				message: "computeTemplateStageCounts baseline returned 200 without data",
				status: 500,
			};
			throw failure;
		}
		const baselineData: ComputeTemplateStageCountsData = baselineResult.data;

		const handlerDeps = buildGetStageExpectedCountsDeps({
			dbClient: adminClient,
			user: testUser,
			computeTemplateStageCounts,
			topologicalSortSteps: (
				sortDeps: TopologicalSortStepsDeps,
				sortParams: TopologicalSortStepsParams,
			): ProgressRecipeStep[] => topologicalSortSteps(sortDeps, sortParams),
			computeExpectedCounts: (
				countDeps: ComputeExpectedCountsDeps,
				countParams: ComputeExpectedCountsParams,
			): ExpectedCountsResult => computeExpectedCounts(countDeps, countParams),
		});
		const handlerParams = buildGetStageExpectedCountsParams();
		const handlerPayload: GetStageExpectedCountsPayload = buildGetStageExpectedCountsPayload({
			processTemplateId,
			modelCount: MODEL_COUNT,
		});

		const result: GetStageExpectedCountsResult = await getStageExpectedCounts(
			handlerDeps,
			handlerParams,
			handlerPayload,
		);

		assertEquals(isGetStageExpectedCountsResult(result), true);
		assertEquals(result.status, 200);
		if (result.status !== 200) {
			return;
		}
		if (result.data === undefined) {
			const failure: ServiceError = {
				message: "getStageExpectedCounts returned status 200 without data",
				status: 500,
			};
			throw failure;
		}
		const data: GetStageExpectedCountsResponse = result.data;

		await t.step("response passes isGetStageExpectedCountsResponse", () => {
			assertEquals(isGetStageExpectedCountsResponse(data), true);
		});

		await t.step("totalStages matches database transition graph stage count", () => {
			assertEquals(data.totalStages, templateStageIds.length);
			assertEquals(data.stages.length, templateStageIds.length);
			assertEquals(baselineData.totalStages, templateStageIds.length);
			assertEquals(stageRows.length, templateStageIds.length);
		});

		await t.step("every database stage row has a matching handler StageExpectedCount entry", () => {
			for (const stageRow of stageRows) {
				let matched = false;
				for (const handlerStage of data.stages) {
					if (handlerStage.stageSlug === stageRow.slug) {
						matched = true;
					}
				}
				assertEquals(matched, true);
			}
		});

		await t.step("every database stage row has a matching core StageCountsEntry", () => {
			for (const stageRow of stageRows) {
				let matched = false;
				for (const entry of baselineData.stages) {
					if (entry.stageId === stageRow.id) {
						matched = true;
						assertEquals(entry.stageSlug, stageRow.slug);
					}
				}
				assertEquals(matched, true);
			}
		});

		await t.step("stages are in topological order per database transitions", () => {
			const indexByStageId = new Map<string, number>();
			for (let i = 0; i < baselineData.stages.length; i++) {
				indexByStageId.set(baselineData.stages[i].stageId, i);
			}
			for (const transitionRow of transitionRows) {
				const sourceIndexValue = indexByStageId.get(transitionRow.source_stage_id);
				const targetIndexValue = indexByStageId.get(transitionRow.target_stage_id);
				assertEquals(sourceIndexValue !== undefined, true);
				assertEquals(targetIndexValue !== undefined, true);
				if (sourceIndexValue === undefined || targetIndexValue === undefined) {
					continue;
				}
				const sourceIndex: number = sourceIndexValue;
				const targetIndex: number = targetIndexValue;
				assertEquals(sourceIndex < targetIndex, true);
			}
		});

		await t.step(
			"one computeExpectedCounts capture per database stage with matching totalExpected",
			() => {
				assertEquals(capturedParams.length, stageRows.length);
				assertEquals(capturedResults.length, stageRows.length);
				for (let i = 0; i < baselineData.stages.length; i++) {
					const entry: StageCountsEntry = baselineData.stages[i];
					const countParamsAt = capturedParams.at(i);
					const countResultAt = capturedResults.at(i);
					assertEquals(countParamsAt !== undefined, true);
					assertEquals(countResultAt !== undefined, true);
					if (countParamsAt === undefined || countResultAt === undefined) {
						const failure: ServiceError = {
							message: `Missing computeExpectedCounts capture at index ${i}`,
							status: 500,
						};
						throw failure;
					}
					const countResult: ExpectedCountsResult = countResultAt;
					assertEquals(entry.totalExpected, captureSum(countResult));
				}
			},
		);

		await t.step(
			"priorStageContext on each capture matches predecessor capture cardinality leaves",
			() => {
				for (let i = 0; i < capturedParams.length; i++) {
					const countParamsAt = capturedParams.at(i);
					assertEquals(countParamsAt !== undefined, true);
					if (countParamsAt === undefined) {
						const failure: ServiceError = {
							message: `Missing computeExpectedCounts params at index ${i}`,
							status: 500,
						};
						throw failure;
					}
					const countParams: ComputeExpectedCountsParams = countParamsAt;
					const priorContext = countParams.priorStageContext;
					if (priorContext === undefined) {
						continue;
					}
					const prior: PriorStageContext = priorContext;
					assertEquals(prior.reviewerCount, MODEL_COUNT);

					const prevParamsAt = capturedParams.at(i - 1);
					const prevResultAt = capturedResults.at(i - 1);
					assertEquals(prevParamsAt !== undefined, true);
					assertEquals(prevResultAt !== undefined, true);
					if (prevParamsAt === undefined || prevResultAt === undefined) {
						const failure: ServiceError = {
							message: `Missing predecessor capture at index ${i - 1}`,
							status: 500,
						};
						throw failure;
					}
					const prevParams: ComputeExpectedCountsParams = prevParamsAt;
					const prevResult: ExpectedCountsResult = prevResultAt;

					const leafStepIds = new Set<string>();
					for (const step of prevParams.steps) {
						leafStepIds.add(step.id);
					}
					for (const edge of prevParams.edges) {
						leafStepIds.delete(edge.from_step_id);
					}
					let lineageFromPrevCapture = 0;
					for (const step of prevParams.steps) {
						if (leafStepIds.has(step.id)) {
							const cardinalityValue = prevResult.cardinality.get(step.id);
							if (cardinalityValue === undefined) {
								const failure: ServiceError = {
									message: `Cardinality missing for leaf step: ${step.id}`,
									status: 500,
								};
								throw failure;
							}
							lineageFromPrevCapture += cardinalityValue;
						}
					}
					assertEquals(prior.lineageCount, lineageFromPrevCapture);
				}
			},
		);

		for (const stageRow of stageRows) {
			const stageSlug: string = stageRow.slug;
			await t.step(
				`${stageSlug}: handler expectedCount equals core totalExpected and capture sum`,
				() => {
					let coreEntry: StageCountsEntry = baselineData.stages[0];
					let captureIndex = 0;
					let coreMatched = false;
					for (let i = 0; i < baselineData.stages.length; i++) {
						if (baselineData.stages[i].stageId === stageRow.id) {
							coreEntry = baselineData.stages[i];
							captureIndex = i;
							coreMatched = true;
						}
					}
					assertEquals(coreMatched, true);

					let handlerStage: StageExpectedCount = data.stages[0];
					let handlerMatched = false;
					for (const candidate of data.stages) {
						if (candidate.stageSlug === stageSlug) {
							handlerStage = candidate;
							handlerMatched = true;
						}
					}
					assertEquals(handlerMatched, true);
					assertEquals(handlerStage.stageSlug, coreEntry.stageSlug);
					assertEquals(handlerStage.expectedCount, coreEntry.totalExpected);

					const countResultAt = capturedResults.at(captureIndex);
					assertEquals(countResultAt !== undefined, true);
					if (countResultAt === undefined) {
						const failure: ServiceError = {
							message: `Missing capture for stage ${stageRow.id}`,
							status: 500,
						};
						throw failure;
					}
					const countResult: ExpectedCountsResult = countResultAt;
					assertEquals(handlerStage.expectedCount, captureSum(countResult));
				},
			);
		}

		for (const stageRow of stageRows) {
			const stageSlug: string = stageRow.slug;
			await t.step(
				`${stageSlug}: result entry and capture use database recipe for stage ${stageRow.id}`,
				() => {
					let captureIndex = 0;
					let entryMatched = false;
					for (let i = 0; i < baselineData.stages.length; i++) {
						if (baselineData.stages[i].stageId === stageRow.id) {
							captureIndex = i;
							entryMatched = true;
						}
					}
					assertEquals(entryMatched, true);

					const entry: StageCountsEntry = baselineData.stages[captureIndex];
					assertEquals(entry.stageId, stageRow.id);
					assertEquals(entry.stageSlug, stageRow.slug);

					const countParamsAt = capturedParams.at(captureIndex);
					const countResultAt = capturedResults.at(captureIndex);
					assertEquals(countParamsAt !== undefined, true);
					assertEquals(countResultAt !== undefined, true);
					if (countParamsAt === undefined || countResultAt === undefined) {
						const failure: ServiceError = {
							message: `Missing capture for stage ${stageRow.id}`,
							status: 500,
						};
						throw failure;
					}
					const countParams: ComputeExpectedCountsParams = countParamsAt;
					assertEquals(countParams.steps.length, entry.steps.length);
					assertEquals(countParams.edges.length, entry.edges.length);
				},
			);
		}

		for (const stageRow of stageRows) {
			const stageSlug: string = stageRow.slug;
			await t.step(
				`${stageSlug}: recipe steps and edges match database recipe source for instance`,
				async () => {
					const instanceId: string | null = stageRow.active_recipe_instance_id;
					if (instanceId === null) {
						const failure: ServiceError = {
							message: `${stageSlug} active_recipe_instance_id is null`,
							status: 500,
						};
						throw failure;
					}

					let entry: StageCountsEntry = baselineData.stages[0];
					for (const stageEntry of baselineData.stages) {
						if (stageEntry.stageId === stageRow.id) {
							entry = stageEntry;
						}
					}

					const instanceResponse = await adminClient
						.from("dialectic_stage_recipe_instances")
						.select("*")
						.eq("id", instanceId)
						.single();
					if (instanceResponse.error !== null) {
						throw instanceResponse.error;
					}
					if (instanceResponse.data === null) {
						throw new Error(`Recipe instance row missing for ${stageSlug}`);
					}
					const instanceRow: DialecticStageRecipeInstance = instanceResponse.data;

					let dbStepIds = new Set<string>();
					let dbEdgePairs = new Set<string>();

					if (instanceRow.is_cloned === true) {
						const stepsResponse = await adminClient
							.from("dialectic_stage_recipe_steps")
							.select("*")
							.eq("instance_id", instanceRow.id);
						if (stepsResponse.error !== null) {
							throw stepsResponse.error;
						}
						if (stepsResponse.data === null) {
							throw new Error(`Recipe steps query returned null for ${stageSlug}`);
						}
						const stepRows: Tables<"dialectic_stage_recipe_steps">[] = stepsResponse.data;

						const edgesResponse = await adminClient
							.from("dialectic_stage_recipe_edges")
							.select("*")
							.eq("instance_id", instanceRow.id);
						if (edgesResponse.error !== null) {
							throw edgesResponse.error;
						}
						if (edgesResponse.data === null) {
							throw new Error(`Recipe edges query returned null for ${stageSlug}`);
						}
						const edgeRows: Tables<"dialectic_stage_recipe_edges">[] = edgesResponse.data;

						assertEquals(entry.steps.length, stepRows.length);
						assertEquals(entry.edges.length, edgeRows.length);

						dbStepIds = new Set<string>(stepRows.map((row) => row.id));
						dbEdgePairs = new Set<string>(
							edgeRows.map((row) => `${row.from_step_id}:${row.to_step_id}`),
						);
					} else {
						const templateId: string | null = instanceRow.template_id;
						if (templateId === null) {
							const failure: ServiceError = {
								message: `${stageSlug} template_id is null on recipe instance`,
								status: 500,
							};
							throw failure;
						}

						const stepsResponse = await adminClient
							.from("dialectic_recipe_template_steps")
							.select("*")
							.eq("template_id", templateId);
						if (stepsResponse.error !== null) {
							throw stepsResponse.error;
						}
						if (stepsResponse.data === null) {
							throw new Error(`Recipe template steps query returned null for ${stageSlug}`);
						}
						const stepRows: Tables<"dialectic_recipe_template_steps">[] = stepsResponse.data;

						const edgesResponse = await adminClient
							.from("dialectic_recipe_template_edges")
							.select("*")
							.eq("template_id", templateId);
						if (edgesResponse.error !== null) {
							throw edgesResponse.error;
						}
						if (edgesResponse.data === null) {
							throw new Error(`Recipe template edges query returned null for ${stageSlug}`);
						}
						const edgeRows: Tables<"dialectic_recipe_template_edges">[] = edgesResponse.data;

						assertEquals(entry.steps.length, stepRows.length);
						assertEquals(entry.edges.length, edgeRows.length);

						dbStepIds = new Set<string>(stepRows.map((row) => row.id));
						dbEdgePairs = new Set<string>(
							edgeRows.map((row) => `${row.from_step_id}:${row.to_step_id}`),
						);
					}

					for (const progressStep of entry.steps) {
						assertEquals(dbStepIds.has(progressStep.id), true);
						assertEquals(baselineData.stepIdToStepKey.get(progressStep.id), progressStep.step_key);
					}

					for (const progressEdge of entry.edges) {
						const pair = `${progressEdge.from_step_id}:${progressEdge.to_step_id}`;
						assertEquals(dbEdgePairs.has(pair), true);
					}
				},
			);
		}

		for (const stageRow of stageRows) {
			if (stageRow.slug !== THESIS_STAGE_SLUG) {
				continue;
			}
			await t.step(
				`${stageRow.slug}: totalExpected is 4n+1 at n=${MODEL_COUNT}`,
				() => {
					let coreEntry: StageCountsEntry = baselineData.stages[0];
					for (const stageEntry of baselineData.stages) {
						if (stageEntry.stageId === stageRow.id) {
							coreEntry = stageEntry;
						}
					}
					const specTotal: number = 4 * MODEL_COUNT + 1;
					assertEquals(coreEntry.totalExpected, specTotal);

					let handlerStage: StageExpectedCount = data.stages[0];
					for (const candidate of data.stages) {
						if (candidate.stageSlug === THESIS_STAGE_SLUG) {
							handlerStage = candidate;
						}
					}
					assertEquals(handlerStage.expectedCount, specTotal);
				},
			);
		}

		for (const stageRow of stageRows) {
			if (stageRow.slug !== ANTITHESIS_STAGE_SLUG) {
				continue;
			}
			await t.step(
				`${stageRow.slug}: totalExpected is 28n² at n=${MODEL_COUNT} (thesis lineage feeds per_source_document_by_lineage)`,
				() => {
					let coreEntry: StageCountsEntry = baselineData.stages[0];
					for (const stageEntry of baselineData.stages) {
						if (stageEntry.stageId === stageRow.id) {
							coreEntry = stageEntry;
						}
					}
					const specTotal: number = 28 * MODEL_COUNT * MODEL_COUNT;
					assertEquals(coreEntry.totalExpected, specTotal);

					let handlerStage: StageExpectedCount = data.stages[0];
					for (const candidate of data.stages) {
						if (candidate.stageSlug === ANTITHESIS_STAGE_SLUG) {
							handlerStage = candidate;
						}
					}
					assertEquals(handlerStage.expectedCount, specTotal);
				},
			);
		}
	} finally {
		await coreCleanupTestResources();
	}
});
