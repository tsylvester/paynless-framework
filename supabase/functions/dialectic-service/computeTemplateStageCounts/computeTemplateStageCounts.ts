import type {
	DialecticRecipeTemplateStep,
	DialecticStage,
	DialecticStageRecipeEdge,
	DialecticStageRecipeInstance,
	DialecticStageRecipeStep,
	DialecticStageTransition,
	ExpectedCountsResult,
	GranularityStrategy,
	JobType,
	PriorStageContext,
	ProgressRecipeEdge,
	ProgressRecipeStep,
} from "../dialectic.interface.ts";
import {
	isDialecticRecipeTemplateStep,
	isDialecticStageRecipeStep,
} from "../../_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import type { ServiceError } from "../../_shared/types.ts";
import type { Tables } from "../../types_db.ts";
import type {
	ComputeTemplateStageCountsDeps,
	ComputeTemplateStageCountsParams,
	ComputeTemplateStageCountsPayload,
	ComputeTemplateStageCountsResult,
	StageCountsEntry,
} from "./computeTemplateStageCounts.interface.ts";

export async function computeTemplateStageCounts(
	deps: ComputeTemplateStageCountsDeps,
	params: ComputeTemplateStageCountsParams,
	payload: ComputeTemplateStageCountsPayload,
): Promise<ComputeTemplateStageCountsResult> {
	const dbClient = deps.dbClient;
	const processTemplateId: string = payload.processTemplateId;
	const n: number = payload.modelCount;

	const transitionsResponse = await dbClient
		.from("dialectic_stage_transitions")
		.select("*")
		.eq("process_template_id", processTemplateId);
	if (transitionsResponse.error) {
		const error: ServiceError = {
			message: `Failed to fetch stage transitions: ${transitionsResponse.error.message}`,
			status: 500,
		};
		return { status: 500, error };
	}
	if (!transitionsResponse.data) {
		const error: ServiceError = { message: "Failed to fetch stage transitions: null data", status: 500 };
		return { status: 500, error };
	}
	const transitionsData: DialecticStageTransition[] = transitionsResponse.data;
	const nonSelfTransitions: DialecticStageTransition[] = transitionsData.filter(
		(t: DialecticStageTransition) => t.source_stage_id !== t.target_stage_id,
	);
	const templateStageIdSet: Set<string> = new Set<string>();
	for (const t of transitionsData) {
		templateStageIdSet.add(t.source_stage_id);
		templateStageIdSet.add(t.target_stage_id);
	}
	const templateStageIds: string[] = Array.from(templateStageIdSet);
	const totalStages: number = templateStageIds.length;

	const inDegree: Map<string, number> = new Map<string, number>();
	for (const stageId of templateStageIds) {
		inDegree.set(stageId, 0);
	}
	for (const t of nonSelfTransitions) {
		const target: string = t.target_stage_id;
		if (!inDegree.has(target)) {
			const error: ServiceError = {
				message: `Stage transition target not found in template stage ids: ${target}`,
				status: 500,
			};
			return { status: 500, error };
		}
		const currentInDegree = inDegree.get(target);
		if (typeof currentInDegree !== "number") {
			const error: ServiceError = {
				message: `Stage transition target in-degree missing for: ${target}`,
				status: 500,
			};
			return { status: 500, error };
		}
		inDegree.set(target, currentInDegree + 1);
	}
	const orderedStageIds: string[] = [];
	const queue: string[] = templateStageIds.filter((id: string) => {
		const degree = inDegree.get(id);
		return typeof degree === "number" && degree === 0;
	});
	while (queue.length > 0) {
		const stageIdShifted = queue.shift();
		if (stageIdShifted === undefined || stageIdShifted.length === 0) {
			const error: ServiceError = { message: "Stage queue produced invalid stage id", status: 500 };
			return { status: 500, error };
		}
		const stageId: string = stageIdShifted;
		orderedStageIds.push(stageId);
		for (const t of nonSelfTransitions) {
			if (t.source_stage_id !== stageId) continue;
			const nextId: string = t.target_stage_id;
			const currentDegree = inDegree.get(nextId);
			if (typeof currentDegree !== "number") {
				const error: ServiceError = {
					message: `Stage transition target in-degree missing for: ${nextId}`,
					status: 500,
				};
				return { status: 500, error };
			}
			const d: number = currentDegree - 1;
			inDegree.set(nextId, d);
			if (d === 0) queue.push(nextId);
		}
	}
	if (orderedStageIds.length !== templateStageIds.length) {
		const error: ServiceError = {
			message: "Stage transition graph contains a cycle or unresolved node",
			status: 500,
		};
		return { status: 500, error };
	}

	const stagesResponse = await dbClient
		.from("dialectic_stages")
		.select("*")
		.in("id", templateStageIds);
	if (stagesResponse.error) {
		let stagesErrorMessage: string = "null";
		if (
			stagesResponse.error &&
			typeof stagesResponse.error.message === "string" &&
			stagesResponse.error.message.length > 0
		) {
			stagesErrorMessage = stagesResponse.error.message;
		}
		const error: ServiceError = {
			message: `Failed to fetch stages: ${stagesErrorMessage}`,
			status: 500,
		};
		return { status: 500, error };
	}
	if (!stagesResponse.data) {
		const error: ServiceError = { message: "Failed to fetch stages: null data", status: 500 };
		return { status: 500, error };
	}
	const stagesData: DialecticStage[] = stagesResponse.data;
	if (stagesData.length !== templateStageIds.length) {
		const error: ServiceError = {
			message: "Stage count does not match template stage count",
			status: 500,
		};
		return { status: 500, error };
	}

	const stageIdToStage: Map<string, DialecticStage> = new Map<string, DialecticStage>();
	for (const row of stagesData) {
		if (typeof row.id !== "string" || row.id.length === 0) {
			const error: ServiceError = { message: "Stage id is null or invalid", status: 500 };
			return { status: 500, error };
		}
		if (typeof row.slug !== "string" || row.slug.length === 0) {
			const error: ServiceError = { message: "Stage slug is null or invalid", status: 500 };
			return { status: 500, error };
		}
		stageIdToStage.set(row.id, row);
	}

	const stageSlugToInstanceId: Map<string, string> = new Map<string, string>();
	const instanceIdSet: Set<string> = new Set<string>();
	for (const stage of stagesData) {
		const slug: string = stage.slug;
		const instanceId: string | null = stage.active_recipe_instance_id;
		if (typeof slug !== "string" || slug.length === 0) {
			const error: ServiceError = { message: "Stage slug is null or invalid", status: 500 };
			return { status: 500, error };
		}
		if (typeof instanceId !== "string" || instanceId.length === 0) {
			const error: ServiceError = {
				message: `Stage active_recipe_instance_id is null or invalid for slug: ${slug}`,
				status: 500,
			};
			return { status: 500, error };
		}
		stageSlugToInstanceId.set(slug, instanceId);
		instanceIdSet.add(instanceId);
	}
	const instanceIds: string[] = Array.from(instanceIdSet);

	const instancesResponse = await dbClient
		.from("dialectic_stage_recipe_instances")
		.select("*")
		.in("id", instanceIds);
	if (instancesResponse.error) {
		const error: ServiceError = {
			message: `Failed to fetch recipe instances: ${instancesResponse.error.message}`,
			status: 500,
		};
		return { status: 500, error };
	}
	if (!instancesResponse.data) {
		const error: ServiceError = { message: "Failed to fetch recipe instances: null data", status: 500 };
		return { status: 500, error };
	}
	const instancesData: DialecticStageRecipeInstance[] = instancesResponse.data;
	const instanceIdToInstance: Map<string, DialecticStageRecipeInstance> = new Map<
		string,
		DialecticStageRecipeInstance
	>();
	for (const instance of instancesData) {
		if (typeof instance.id !== "string" || instance.id.length === 0) {
			const error: ServiceError = { message: "Recipe instance id is null or invalid", status: 500 };
			return { status: 500, error };
		}
		instanceIdToInstance.set(instance.id, instance);
	}
	for (const instanceId of instanceIds) {
		if (!instanceIdToInstance.has(instanceId)) {
			const error: ServiceError = {
				message: `Recipe instance not found for id: ${instanceId}`,
				status: 500,
			};
			return { status: 500, error };
		}
	}

	const instanceIdToIsCloned: Map<string, boolean> = new Map<string, boolean>();
	const instanceIdToTemplateId: Map<string, string> = new Map<string, string>();
	const clonedInstanceIds: string[] = [];
	const templateIds: string[] = [];

	for (const instance of instancesData) {
		if (typeof instance.id !== "string" || instance.id.length === 0) {
			const error: ServiceError = { message: "Recipe instance id is null or invalid", status: 500 };
			return { status: 500, error };
		}
		if (typeof instance.is_cloned !== "boolean") {
			const error: ServiceError = {
				message: `Recipe instance is_cloned is null or invalid for id: ${instance.id}`,
				status: 500,
			};
			return { status: 500, error };
		}
		instanceIdToIsCloned.set(instance.id, instance.is_cloned);
		if (typeof instance.template_id !== "string" || instance.template_id.length === 0) {
			const error: ServiceError = {
				message: `Recipe instance template_id is null or invalid for id: ${instance.id}`,
				status: 500,
			};
			return { status: 500, error };
		}
		instanceIdToTemplateId.set(instance.id, instance.template_id);
		if (instance.is_cloned === true) {
			clonedInstanceIds.push(instance.id);
		} else {
			templateIds.push(instance.template_id);
		}
	}

	const stepIdToStepKey: Map<string, string> = new Map<string, string>();
	const stepsByInstanceId: Map<string, ProgressRecipeStep[]> = new Map<string, ProgressRecipeStep[]>();
	const stepsByTemplateId: Map<string, ProgressRecipeStep[]> = new Map<string, ProgressRecipeStep[]>();

	if (clonedInstanceIds.length > 0) {
		const stepsResponse = await dbClient
			.from("dialectic_stage_recipe_steps")
			.select("*")
			.in("instance_id", clonedInstanceIds);
		if (stepsResponse.error) {
			const error: ServiceError = {
				message: `Failed to fetch stage recipe steps: ${stepsResponse.error.message}`,
				status: 500,
			};
			return { status: 500, error };
		}
		if (!stepsResponse.data) {
			const error: ServiceError = { message: "Failed to fetch stage recipe steps: null data", status: 500 };
			return { status: 500, error };
		}
		for (const stepRow of stepsResponse.data) {
			if (!isDialecticStageRecipeStep(stepRow)) {
				const error: ServiceError = { message: "Stage recipe step row is invalid", status: 500 };
				return { status: 500, error };
			}
			const row: DialecticStageRecipeStep = stepRow;
			const jobType: JobType = row.job_type;
			const granularity: GranularityStrategy = row.granularity_strategy;
			stepIdToStepKey.set(row.id, row.step_key);
			const step: ProgressRecipeStep = {
				id: row.id,
				step_key: row.step_key,
				job_type: jobType,
				granularity_strategy: granularity,
			};
			const arrExisting = stepsByInstanceId.get(row.instance_id);
			const arr: ProgressRecipeStep[] = arrExisting ? [...arrExisting, step] : [step];
			stepsByInstanceId.set(row.instance_id, arr);
		}
	}

	if (templateIds.length > 0) {
		const templateStepsResponse = await dbClient
			.from("dialectic_recipe_template_steps")
			.select("*")
			.in("template_id", templateIds);
		if (templateStepsResponse.error) {
			const error: ServiceError = {
				message: `Failed to fetch template recipe steps: ${templateStepsResponse.error.message}`,
				status: 500,
			};
			return { status: 500, error };
		}
		if (!templateStepsResponse.data) {
			const error: ServiceError = { message: "Failed to fetch template recipe steps: null data", status: 500 };
			return { status: 500, error };
		}
		for (const stepRow of templateStepsResponse.data) {
			if (!isDialecticRecipeTemplateStep(stepRow)) {
				const error: ServiceError = { message: "Template recipe step row is invalid", status: 500 };
				return { status: 500, error };
			}
			const row: DialecticRecipeTemplateStep = stepRow;
			const jobType: JobType = row.job_type;
			const granularity: GranularityStrategy = row.granularity_strategy;
			stepIdToStepKey.set(row.id, row.step_key);
			const step: ProgressRecipeStep = {
				id: row.id,
				step_key: row.step_key,
				job_type: jobType,
				granularity_strategy: granularity,
			};
			const arrExisting = stepsByTemplateId.get(row.template_id);
			const arr: ProgressRecipeStep[] = arrExisting ? [...arrExisting, step] : [step];
			stepsByTemplateId.set(row.template_id, arr);
		}
	}

	const edgesByInstanceId: Map<string, ProgressRecipeEdge[]> = new Map<string, ProgressRecipeEdge[]>();
	const edgesByTemplateId: Map<string, ProgressRecipeEdge[]> = new Map<string, ProgressRecipeEdge[]>();

	if (clonedInstanceIds.length > 0) {
		const edgesResponse = await dbClient
			.from("dialectic_stage_recipe_edges")
			.select("*")
			.in("instance_id", clonedInstanceIds);
		if (edgesResponse.error) {
			const error: ServiceError = {
				message: `Failed to fetch stage recipe edges: ${edgesResponse.error.message}`,
				status: 500,
			};
			return { status: 500, error };
		}
		if (!edgesResponse.data) {
			const error: ServiceError = { message: "Failed to fetch stage recipe edges: null data", status: 500 };
			return { status: 500, error };
		}
		const edgesData: DialecticStageRecipeEdge[] = edgesResponse.data;
		for (const row of edgesData) {
			if (typeof row.instance_id !== "string" || row.instance_id.length === 0) {
				const error: ServiceError = { message: "Stage recipe edge instance_id is null or invalid", status: 500 };
				return { status: 500, error };
			}
			const edge: ProgressRecipeEdge = {
				from_step_id: row.from_step_id,
				to_step_id: row.to_step_id,
			};
			const arrExisting = edgesByInstanceId.get(row.instance_id);
			const arr: ProgressRecipeEdge[] = arrExisting ? [...arrExisting, edge] : [edge];
			edgesByInstanceId.set(row.instance_id, arr);
		}
	}

	if (templateIds.length > 0) {
		const templateEdgesResponse = await dbClient
			.from("dialectic_recipe_template_edges")
			.select("*")
			.in("template_id", templateIds);
		if (templateEdgesResponse.error) {
			const error: ServiceError = {
				message: `Failed to fetch recipe template edges: ${templateEdgesResponse.error.message}`,
				status: 500,
			};
			return { status: 500, error };
		}
		if (!templateEdgesResponse.data) {
			const error: ServiceError = { message: "Failed to fetch recipe template edges: null data", status: 500 };
			return { status: 500, error };
		}
		const templateEdgesData: Tables<"dialectic_recipe_template_edges">[] = templateEdgesResponse.data;
		for (const row of templateEdgesData) {
			if (typeof row.template_id !== "string" || row.template_id.length === 0) {
				const error: ServiceError = {
					message: "Recipe template edge template_id is null or invalid",
					status: 500,
				};
				return { status: 500, error };
			}
			const edge: ProgressRecipeEdge = {
				from_step_id: row.from_step_id,
				to_step_id: row.to_step_id,
			};
			const arrExisting = edgesByTemplateId.get(row.template_id);
			const arr: ProgressRecipeEdge[] = arrExisting ? [...arrExisting, edge] : [edge];
			edgesByTemplateId.set(row.template_id, arr);
		}
	}

	const stages: StageCountsEntry[] = [];
	const priorStageContextByStageId: Map<string, PriorStageContext> = new Map<string, PriorStageContext>();

	for (const stageId of orderedStageIds) {
		const templateStage = stageIdToStage.get(stageId);
		if (!templateStage) {
			const error: ServiceError = {
				message: `Template stage not found for stage id: ${stageId}`,
				status: 500,
			};
			return { status: 500, error };
		}
		const stageSlug: string = templateStage.slug;
		const instanceId = stageSlugToInstanceId.get(stageSlug);
		if (!instanceId) {
			const error: ServiceError = {
				message: `Stage active recipe instance not found for stage: ${stageSlug}`,
				status: 500,
			};
			return { status: 500, error };
		}

		const isCloned = instanceIdToIsCloned.get(instanceId);
		if (typeof isCloned !== "boolean") {
			const error: ServiceError = {
				message: `Recipe instance clone state missing for instance: ${instanceId}`,
				status: 500,
			};
			return { status: 500, error };
		}
		const templateId = instanceIdToTemplateId.get(instanceId);
		if (typeof templateId !== "string" || templateId.length === 0) {
			const error: ServiceError = {
				message: `Recipe instance template id missing for instance: ${instanceId}`,
				status: 500,
			};
			return { status: 500, error };
		}

		let steps: ProgressRecipeStep[] = [];
		let edges: ProgressRecipeEdge[] = [];
		if (isCloned) {
			const stageSteps = stepsByInstanceId.get(instanceId);
			if (!stageSteps || stageSteps.length === 0) {
				const error: ServiceError = {
					message: `No cloned recipe steps found for instance: ${instanceId}`,
					status: 500,
				};
				return { status: 500, error };
			}
			steps = stageSteps;
			const stageEdges = edgesByInstanceId.get(instanceId);
			if (stageEdges) {
				edges = stageEdges;
			}
		} else {
			const templateSteps = stepsByTemplateId.get(templateId);
			if (!templateSteps || templateSteps.length === 0) {
				const error: ServiceError = {
					message: `No template recipe steps found for template: ${templateId}`,
					status: 500,
				};
				return { status: 500, error };
			}
			steps = templateSteps;
			const templateEdges = edgesByTemplateId.get(templateId);
			if (templateEdges) {
				edges = templateEdges;
			}
		}

		if (steps.length === 0) {
			const error: ServiceError = { message: `No recipe steps found for stage: ${stageSlug}`, status: 500 };
			return { status: 500, error };
		}

		const needsPriorContext: boolean = steps.some(
			(s: ProgressRecipeStep) =>
				s.granularity_strategy === "pairwise_by_origin" ||
				s.granularity_strategy === "per_source_document_by_lineage",
		);

		let predecessorStageId = "";
		if (needsPriorContext) {
			for (const t of nonSelfTransitions) {
				if (t.target_stage_id === stageId) {
					predecessorStageId = t.source_stage_id;
					break;
				}
			}
		}

		let expectedResult: ExpectedCountsResult;
		try {
			const storedPrior = priorStageContextByStageId.get(predecessorStageId);
			if (needsPriorContext && storedPrior) {
				expectedResult = deps.computeExpectedCounts(
					{ topologicalSortSteps: deps.topologicalSortSteps },
					{ steps, edges, n, priorStageContext: storedPrior },
				);
			} else {
				expectedResult = deps.computeExpectedCounts(
					{ topologicalSortSteps: deps.topologicalSortSteps },
					{ steps, edges, n },
				);
			}
		} catch (e) {
			let computeErrorMessage: string = "unknown error";
			if (e instanceof Error && typeof e.message === "string" && e.message.length > 0) {
				computeErrorMessage = e.message;
			} else {
				computeErrorMessage = String(e);
			}
			const error: ServiceError = {
				message: `computeExpectedCounts failed: ${computeErrorMessage}`,
				status: 500,
			};
			return { status: 500, error };
		}

		const leafStepIds: Set<string> = new Set<string>(steps.map((s: ProgressRecipeStep) => s.id));
		for (const edge of edges) {
			leafStepIds.delete(edge.from_step_id);
		}
		let lineageCount: number = 0;
		for (const step of steps) {
			if (leafStepIds.has(step.id)) {
				const cardinalityValue = expectedResult.cardinality.get(step.id);
				if (typeof cardinalityValue !== "number") {
					const error: ServiceError = {
						message: `Cardinality missing for step: ${step.id}`,
						status: 500,
					};
					return { status: 500, error };
				}
				lineageCount += cardinalityValue;
			}
		}
		const reviewerCount: number = n;
		priorStageContextByStageId.set(stageId, { lineageCount, reviewerCount });

		let totalExpected: number = 0;
		for (const count of expectedResult.expected.values()) {
			totalExpected += count;
		}

		const entry: StageCountsEntry = {
			stageId,
			stageSlug,
			steps,
			edges,
			expected: expectedResult.expected,
			totalExpected,
		};
		stages.push(entry);
	}

	return {
		status: 200,
		data: {
			stages,
			totalStages,
			stepIdToStepKey,
		},
	};
}
