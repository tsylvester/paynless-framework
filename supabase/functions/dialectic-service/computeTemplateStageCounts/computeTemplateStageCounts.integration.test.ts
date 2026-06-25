/**
 * Integration: full seeded process template from database, real count pipeline.
 * Assertions use database rows and computeExpectedCounts captures only.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
} from "../dialectic.interface.ts";
import { computeExpectedCounts } from "../computeExpectedCounts.ts";
import {
	coreCleanupTestResources,
	coreInitializeTestStep,
	initializeTestDeps,
} from "../../_shared/_integration.test.utils.ts";
import type {
	ComputeTemplateStageCountsData,
	StageCountsEntry,
} from "./computeTemplateStageCounts.interface.ts";
import {
	buildComputeTemplateStageCountsDeps,
	buildComputeTemplateStageCountsParams,
	buildComputeTemplateStageCountsPayload,
	computeTemplateStageCounts,
	isComputeTemplateStageCountsResult,
} from "./computeTemplateStageCounts.provides.ts";
import type { ProgressRecipeStep, TopologicalSortStepsDeps, TopologicalSortStepsParams } from "../dialectic.interface.ts";
import { topologicalSortSteps } from "../topologicalSortSteps.ts";

const MODEL_COUNT = 3;

Deno.test("computeTemplateStageCounts integration: full existing DAG from database", async (t) => {
	initializeTestDeps();
	const { adminClient } = await coreInitializeTestStep({}, "global");

	try {
		const templateResponse = await adminClient
			.from("dialectic_process_templates")
			.select("*")
			.not("starting_stage_id", "is", null)
			.limit(1)
			.single();
		if (templateResponse.error !== null) {
			throw templateResponse.error;
		}
		assertEquals(templateResponse.data !== null, true);
		const processTemplateId: string = templateResponse.data.id;

		const transitionsResponse = await adminClient
			.from("dialectic_stage_transitions")
			.select("*")
			.eq("process_template_id", processTemplateId);
		if (transitionsResponse.error !== null) {
			throw transitionsResponse.error;
		}
		assertEquals(transitionsResponse.data !== null, true);
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
		assertEquals(stagesResponse.data !== null, true);
		const stageRows: DialecticStage[] = stagesResponse.data;

		const capturedParams: ComputeExpectedCountsParams[] = [];
		const capturedResults: ExpectedCountsResult[] = [];

		const deps = buildComputeTemplateStageCountsDeps({
			dbClient: adminClient,
			computeExpectedCounts: (
				countDeps: ComputeExpectedCountsDeps,
				countParams: ComputeExpectedCountsParams,
			): ExpectedCountsResult => {
				capturedParams.push(countParams);
				const countResult: ExpectedCountsResult = computeExpectedCounts(countDeps, countParams);
				capturedResults.push(countResult);
				return countResult;
			},
			topologicalSortSteps: (
				d: TopologicalSortStepsDeps,
				p: TopologicalSortStepsParams,
			): ProgressRecipeStep[] => topologicalSortSteps(d, p),
		});
		const params = buildComputeTemplateStageCountsParams();
		const payload = buildComputeTemplateStageCountsPayload({
			processTemplateId,
			modelCount: MODEL_COUNT,
		});

		const result = await computeTemplateStageCounts(deps, params, payload);

		assertEquals(isComputeTemplateStageCountsResult(result), true);
		if (result.status !== 200) {
			if (result.error !== undefined) {
				throw result.error;
			}
			const failure: ServiceError = {
				message: "computeTemplateStageCounts failed without ServiceError",
				status: 500,
			};
			throw failure;
		}
		if (result.data === undefined) {
			const failure: ServiceError = {
				message: "computeTemplateStageCounts returned status 200 without data",
				status: 500,
			};
			throw failure;
		}
		const data: ComputeTemplateStageCountsData = result.data;

		await t.step("totalStages and stage count match database transition graph", () => {
			assertEquals(data.totalStages, templateStageIds.length);
			assertEquals(data.stages.length, templateStageIds.length);
			assertEquals(stageRows.length, templateStageIds.length);
		});

		await t.step("every database stage row has a matching result entry", () => {
			for (const stageRow of stageRows) {
				let matched = false;
				for (const entry of data.stages) {
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
			for (let i = 0; i < data.stages.length; i++) {
				indexByStageId.set(data.stages[i].stageId, i);
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
				for (let i = 0; i < data.stages.length; i++) {
					const entry: StageCountsEntry = data.stages[i];
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
					let captureSum = 0;
					for (const count of countResult.expected.values()) {
						captureSum += count;
					}
					assertEquals(entry.totalExpected, captureSum);
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
				`${stageSlug}: result entry and capture use database recipe for stage ${stageRow.id}`,
				() => {
					let captureIndex = 0;
					let entryMatched = false;
					for (let i = 0; i < data.stages.length; i++) {
						if (data.stages[i].stageId === stageRow.id) {
							captureIndex = i;
							entryMatched = true;
						}
					}
					assertEquals(entryMatched, true);

					const entry: StageCountsEntry = data.stages[captureIndex];
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

					let entry: StageCountsEntry = data.stages[0];
					for (const stageEntry of data.stages) {
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
					assertEquals(instanceResponse.data !== null, true);
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
						assertEquals(stepsResponse.data !== null, true);
						const stepRows: Tables<"dialectic_stage_recipe_steps">[] = stepsResponse.data;

						const edgesResponse = await adminClient
							.from("dialectic_stage_recipe_edges")
							.select("*")
							.eq("instance_id", instanceRow.id);
						if (edgesResponse.error !== null) {
							throw edgesResponse.error;
						}
						assertEquals(edgesResponse.data !== null, true);
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
						assertEquals(stepsResponse.data !== null, true);
						const stepRows: Tables<"dialectic_recipe_template_steps">[] = stepsResponse.data;

						const edgesResponse = await adminClient
							.from("dialectic_recipe_template_edges")
							.select("*")
							.eq("template_id", templateId);
						if (edgesResponse.error !== null) {
							throw edgesResponse.error;
						}
						assertEquals(edgesResponse.data !== null, true);
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
						assertEquals(data.stepIdToStepKey.get(progressStep.id), progressStep.step_key);
					}

					for (const progressEdge of entry.edges) {
						const pair = `${progressEdge.from_step_id}:${progressEdge.to_step_id}`;
						assertEquals(dbEdgePairs.has(pair), true);
					}
				},
			);
		}

		for (const stageRow of stageRows) {
			if (stageRow.slug !== "thesis") {
				continue;
			}
			await t.step(
				`${stageRow.slug}: totalExpected is 4n+1 at n=${MODEL_COUNT}`,
				() => {
					let entry: StageCountsEntry = data.stages[0];
					for (const stageEntry of data.stages) {
						if (stageEntry.stageId === stageRow.id) {
							entry = stageEntry;
						}
					}
					assertEquals(entry.totalExpected, 4 * MODEL_COUNT + 1);
				},
			);
		}
	} finally {
		await coreCleanupTestResources();
	}
});
