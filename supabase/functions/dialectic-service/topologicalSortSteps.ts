import type {
	ProgressRecipeStep,
	ProgressRecipeEdge,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "./dialectic.interface.ts";

export function topologicalSortSteps(
	deps: TopologicalSortStepsDeps,
	params: TopologicalSortStepsParams,
): ProgressRecipeStep[] {
	const steps: ProgressRecipeStep[] = params.steps;
	const edges: ProgressRecipeEdge[] = params.edges;

	const idToStep = new Map<string, ProgressRecipeStep>();
	for (const s of steps) {
		idToStep.set(s.id, s);
	}

	for (const e of edges) {
		if (!idToStep.has(e.from_step_id)) {
			throw new Error(`Edge references missing step: from_step_id "${e.from_step_id}" not in steps`);
		}
		if (!idToStep.has(e.to_step_id)) {
			throw new Error(`Edge references missing step: to_step_id "${e.to_step_id}" not in steps`);
		}
	}

	const inDegree = new Map<string, number>();
	for (const s of steps) {
		inDegree.set(s.id, 0);
	}
	const successors = new Map<string, string[]>();
	for (const e of edges) {
		inDegree.set(e.to_step_id, (inDegree.get(e.to_step_id) ?? 0) + 1);
		const list = successors.get(e.from_step_id) ?? [];
		list.push(e.to_step_id);
		successors.set(e.from_step_id, list);
	}

	const queue: string[] = [];
	for (const s of steps) {
		if (inDegree.get(s.id) === 0) {
			queue.push(s.id);
		}
	}

	const orderedIds: string[] = [];
	while (queue.length > 0) {
		const id = queue.shift();
		if (id === undefined) break;
		orderedIds.push(id);
		const succ = successors.get(id) ?? [];
		for (const toId of succ) {
			const d = (inDegree.get(toId) ?? 0) - 1;
			inDegree.set(toId, d);
			if (d === 0) {
				queue.push(toId);
			}
		}
	}

	if (orderedIds.length < steps.length) {
		const emittedSet = new Set<string>(orderedIds);
		const remaining: string[] = steps.filter((s) => !emittedSet.has(s.id)).map((s) => s.id);
		throw new Error(`Cycle detected in recipe steps; remaining step ids: ${remaining.join(", ")}`);
	}

	const result: ProgressRecipeStep[] = [];
	for (const id of orderedIds) {
		const s = idToStep.get(id);
		if (s === undefined) continue;
		result.push(s);
	}
	return result;
}
