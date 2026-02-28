import type {
	ProgressRecipeStep,
	ProgressRecipeEdge,
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	ExpectedCountsResult,
	TopologicalSortStepsDeps,
} from "./dialectic.interface.ts";

function hasPsdChildren(
	step: ProgressRecipeStep,
	edges: ProgressRecipeEdge[],
	steps: ProgressRecipeStep[],
): boolean {
	const stepIds = new Set<string>(steps.map((s: ProgressRecipeStep) => s.id));
	for (const e of edges) {
		if (e.from_step_id !== step.id) continue;
		const toId = e.to_step_id;
		if (!stepIds.has(toId)) continue;
		const successor = steps.find((s: ProgressRecipeStep) => s.id === toId);
		if (successor && successor.granularity_strategy === "per_source_document") {
			return true;
		}
	}
	return false;
}

function findPrimaryInputPredecessor(
	step: ProgressRecipeStep,
	edges: ProgressRecipeEdge[],
	steps: ProgressRecipeStep[],
): ProgressRecipeStep {
	const incoming = edges.filter((e: ProgressRecipeEdge) => e.to_step_id === step.id);
	if (incoming.length === 0) {
		throw new Error(
			`per_source_document step "${step.step_key}" (id: ${step.id}) has no predecessor via edges`,
		);
	}
	const fromStepId: string = incoming[0].from_step_id;
	const pred = steps.find((s: ProgressRecipeStep) => s.id === fromStepId);
	if (!pred) {
		throw new Error(
			`per_source_document step "${step.step_key}": predecessor step id "${fromStepId}" not found in steps`,
		);
	}
	return pred;
}

export function computeExpectedCounts(
	deps: ComputeExpectedCountsDeps,
	params: ComputeExpectedCountsParams,
): ExpectedCountsResult {
	const sortDeps: TopologicalSortStepsDeps = {};
	const ordered = deps.topologicalSortSteps(sortDeps, {
		steps: params.steps,
		edges: params.edges,
	});

	const expected = new Map<string, number>();
	const cardinality = new Map<string, number>();

	for (const step of ordered) {
		const strategy = step.granularity_strategy;
		switch (strategy) {
			case "all_to_one": {
				expected.set(step.step_key, 1);
				const c = hasPsdChildren(step, params.edges, params.steps) ? params.n : 1;
				cardinality.set(step.id, c);
				break;
			}
			case "per_model": {
				expected.set(step.step_key, params.n);
				cardinality.set(step.id, params.n);
				break;
			}
			case "per_source_document": {
				const incoming = params.edges.filter((e: ProgressRecipeEdge) => e.to_step_id === step.id);
				if (incoming.length === 0) {
					expected.set(step.step_key, params.n);
					cardinality.set(step.id, params.n);
				} else {
					const predecessor = findPrimaryInputPredecessor(step, params.edges, params.steps);
					const c = cardinality.get(predecessor.id);
					if (c === undefined) {
						throw new Error(
							`per_source_document step "${step.step_key}": predecessor "${predecessor.id}" has no cardinality`,
						);
					}
					expected.set(step.step_key, c);
					cardinality.set(step.id, c);
				}
				break;
			}
			case "pairwise_by_origin": {
				const ctx = params.priorStageContext;
				if (!ctx) {
					throw new Error(
						`pairwise_by_origin step "${step.step_key}" requires priorStageContext`,
					);
				}
				const val = ctx.lineageCount * ctx.reviewerCount * params.n;
				expected.set(step.step_key, val);
				cardinality.set(step.id, val);
				break;
			}
			case "per_source_document_by_lineage": {
				const ctx = params.priorStageContext;
				if (!ctx) {
					throw new Error(
						`per_source_document_by_lineage step "${step.step_key}" requires priorStageContext`,
					);
				}
				const val = params.n * ctx.lineageCount;
				expected.set(step.step_key, val);
				cardinality.set(step.id, val);
				break;
			}
			default: {
				throw new Error(
					`Unsupported granularity_strategy "${strategy}" for step "${step.step_key}"`,
				);
			}
		}
	}

	return { expected, cardinality };
}
