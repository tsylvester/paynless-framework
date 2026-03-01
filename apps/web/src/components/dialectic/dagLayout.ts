import type {
  DAGLayoutParams,
  DAGLayoutResult,
  DAGNodePosition,
  DAGEdgePosition,
  DialecticStageRecipeStep,
} from '@paynless/types';

const H_SPACE = 120;
const V_SPACE = 80;

function assignLayers(
  stepIds: Set<string>,
  predecessors: Map<string, string[]>,
  successors: Map<string, string[]>
): Map<string, number> {
  const inDegree = new Map<string, number>();
  for (const id of stepIds) {
    inDegree.set(id, 0);
  }
  for (const [to, preds] of predecessors) {
    if (stepIds.has(to)) {
      inDegree.set(to, preds.length);
    }
  }
  const queue: string[] = [];
  for (const id of stepIds) {
    if (inDegree.get(id) === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const succ = successors.get(id) ?? [];
    for (const s of succ) {
      const d = (inDegree.get(s) ?? 1) - 1;
      inDegree.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  const layer = new Map<string, number>();
  for (const id of order) {
    const preds = predecessors.get(id) ?? [];
    const predLayers = preds.map((p) => layer.get(p) ?? 0);
    const maxPred = predLayers.length > 0 ? Math.max(...predLayers) : -1;
    layer.set(id, maxPred + 1);
  }
  for (const id of stepIds) {
    if (!layer.has(id)) layer.set(id, 0);
  }
  return layer;
}

export function computeDAGLayout(params: DAGLayoutParams): DAGLayoutResult {
  const { steps, edges, viewport } = params;
  if (steps.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const idToStep = new Map<string, DialecticStageRecipeStep>();
  const stepIds = new Set<string>();
  for (const s of steps) {
    idToStep.set(s.id, s);
    stepIds.add(s.id);
  }

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const e of edges) {
    if (!stepIds.has(e.from_step_id) || !stepIds.has(e.to_step_id)) continue;
    const preds = predecessors.get(e.to_step_id) ?? [];
    if (!preds.includes(e.from_step_id)) preds.push(e.from_step_id);
    predecessors.set(e.to_step_id, preds);
    const succs = successors.get(e.from_step_id) ?? [];
    if (!succs.includes(e.to_step_id)) succs.push(e.to_step_id);
    successors.set(e.from_step_id, succs);
  }

  const layerMap = assignLayers(stepIds, predecessors, successors);
  const layerToIds = new Map<number, string[]>();
  let maxLayer = 0;
  for (const [id, l] of layerMap) {
    maxLayer = Math.max(maxLayer, l);
    const list = layerToIds.get(l) ?? [];
    list.push(id);
    layerToIds.set(l, list);
  }
  for (const list of layerToIds.values()) {
    list.sort((a, b) => (idToStep.get(a)!.step_key < idToStep.get(b)!.step_key ? -1 : 1));
  }

  const orientation = viewport
    ? viewport.width >= viewport.height
      ? ('horizontal')
      : ('vertical')
    : ('horizontal');

  const nodes: DAGNodePosition[] = [];
  let contentWidth: number;
  let contentHeight: number;

  if (orientation === 'horizontal') {
    let maxNodesInLayer = 0;
    for (let l = 0; l <= maxLayer; l++) {
      const list = layerToIds.get(l) ?? [];
      maxNodesInLayer = Math.max(maxNodesInLayer, list.length);
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        const step = idToStep.get(id)!;
        nodes.push({
          stepKey: step.step_key,
          stepName: step.step_name,
          jobType: step.job_type,
          x: l * H_SPACE,
          y: i * V_SPACE,
          layer: l,
        });
      }
    }
    contentWidth = (maxLayer + 1) * H_SPACE;
    contentHeight = maxNodesInLayer > 0 ? maxNodesInLayer * V_SPACE : V_SPACE;
  } else {
    let maxNodesInLayer = 0;
    for (let l = 0; l <= maxLayer; l++) {
      const list = layerToIds.get(l) ?? [];
      maxNodesInLayer = Math.max(maxNodesInLayer, list.length);
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        const step = idToStep.get(id)!;
        nodes.push({
          stepKey: step.step_key,
          stepName: step.step_name,
          jobType: step.job_type,
          x: i * H_SPACE,
          y: l * V_SPACE,
          layer: l,
        });
      }
    }
    contentWidth = maxNodesInLayer > 0 ? maxNodesInLayer * H_SPACE : H_SPACE;
    contentHeight = (maxLayer + 1) * V_SPACE;
  }

  const nodeByKey = new Map<string, DAGNodePosition>();
  for (const n of nodes) {
    nodeByKey.set(n.stepKey, n);
  }

  const resultEdges: DAGEdgePosition[] = [];
  for (const e of edges) {
    const fromStep = idToStep.get(e.from_step_id);
    const toStep = idToStep.get(e.to_step_id);
    if (!fromStep || !toStep) continue;
    const fromNode = nodeByKey.get(fromStep.step_key);
    const toNode = nodeByKey.get(toStep.step_key);
    if (!fromNode || !toNode) continue;
    resultEdges.push({
      fromStepKey: fromStep.step_key,
      toStepKey: toStep.step_key,
      fromX: fromNode.x,
      fromY: fromNode.y,
      toX: toNode.x,
      toY: toNode.y,
    });
  }

  let width = contentWidth;
  let height = contentHeight;

  if (viewport && contentWidth > 0 && contentHeight > 0) {
    const scale = Math.min(viewport.width / contentWidth, viewport.height / contentHeight);
    width = contentWidth * scale;
    height = contentHeight * scale;
    for (const n of nodes) {
      n.x *= scale;
      n.y *= scale;
    }
    for (const e of resultEdges) {
      e.fromX *= scale;
      e.fromY *= scale;
      e.toX *= scale;
      e.toY *= scale;
    }
  }

  const result: DAGLayoutResult = {
    nodes,
    edges: resultEdges,
    width,
    height,
  };
  if (viewport) {
    result.orientation = orientation;
  }
  return result;
}
