import { describe, it, expect } from 'vitest';
import { computeDAGLayout } from './dagLayout';
import type {
  DAGLayoutParams,
  DAGLayoutResult,
  DAGNodePosition,
  DAGEdgePosition,
  DAGViewport,
  DialecticStageRecipeStep,
  DialecticRecipeEdge,
} from '@paynless/types';

function step(
  overrides: {
    id: string;
    step_key: string;
    step_name: string;
    job_type: 'PLAN' | 'EXECUTE' | 'RENDER';
    execution_order: number;
  }
): DialecticStageRecipeStep {
  return {
    id: overrides.id,
    step_key: overrides.step_key,
    step_slug: overrides.step_key,
    step_name: overrides.step_name,
    execution_order: overrides.execution_order,
    job_type: overrides.job_type,
    prompt_type: 'Planner',
    output_type: 'header_context',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
  };
}

function edge(fromId: string, toId: string): DialecticRecipeEdge {
  return { from_step_id: fromId, to_step_id: toId };
}

describe('computeDAGLayout', () => {
  it('returns empty nodes, empty edges, zero width and height when steps array is empty', () => {
    const params: DAGLayoutParams = { steps: [], edges: [] };
    const result: DAGLayoutResult = computeDAGLayout(params);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('places single node at origin with no edges and width/height equal to single node dimensions', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const params: DAGLayoutParams = { steps, edges: [] };
    const result: DAGLayoutResult = computeDAGLayout(params);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].stepKey).toBe('plan');
    expect(result.nodes[0].x).toBe(0);
    expect(result.nodes[0].y).toBe(0);
    expect(result.nodes[0].layer).toBe(0);
    expect(result.edges).toHaveLength(0);
    expect(result.width).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThanOrEqual(0);
  });

  it('places linear chain A→B→C in three successive layers with two edges', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'a', step_key: 'a', step_name: 'A', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'b', step_key: 'b', step_name: 'B', job_type: 'EXECUTE', execution_order: 1 }),
      step({ id: 'c', step_key: 'c', step_name: 'C', job_type: 'RENDER', execution_order: 2 }),
    ];
    const edges: DialecticRecipeEdge[] = [edge('a', 'b'), edge('b', 'c')];
    const params: DAGLayoutParams = { steps, edges };
    const result: DAGLayoutResult = computeDAGLayout(params);
    expect(result.nodes).toHaveLength(3);
    const byKey = new Map(result.nodes.map((n) => [n.stepKey, n]));
    expect(byKey.get('a')?.layer).toBe(0);
    expect(byKey.get('b')?.layer).toBe(1);
    expect(byKey.get('c')?.layer).toBe(2);
    expect(result.edges).toHaveLength(2);
  });

  it('places fan-out PLAN→(EXEC1, EXEC2, EXEC3) with PLAN in layer 0 and three EXECs in layer 1 stacked vertically', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'plan', step_key: 'plan', step_name: 'PLAN', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'e1', step_key: 'e1', step_name: 'EXEC1', job_type: 'EXECUTE', execution_order: 1 }),
      step({ id: 'e2', step_key: 'e2', step_name: 'EXEC2', job_type: 'EXECUTE', execution_order: 2 }),
      step({ id: 'e3', step_key: 'e3', step_name: 'EXEC3', job_type: 'EXECUTE', execution_order: 3 }),
    ];
    const edges: DialecticRecipeEdge[] = [
      edge('plan', 'e1'),
      edge('plan', 'e2'),
      edge('plan', 'e3'),
    ];
    const params: DAGLayoutParams = { steps, edges };
    const result: DAGLayoutResult = computeDAGLayout(params);
    expect(result.nodes).toHaveLength(4);
    const byKey = new Map(result.nodes.map((n) => [n.stepKey, n]));
    expect(byKey.get('plan')?.layer).toBe(0);
    expect(byKey.get('e1')?.layer).toBe(1);
    expect(byKey.get('e2')?.layer).toBe(1);
    expect(byKey.get('e3')?.layer).toBe(1);
    const layer1 = result.nodes.filter((n) => n.layer === 1);
    expect(layer1).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
  });

  it('places diamond A→B, A→C, B→D, C→D with A in layer 0, B/C in layer 1, D in layer 2', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'a', step_key: 'a', step_name: 'A', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'b', step_key: 'b', step_name: 'B', job_type: 'EXECUTE', execution_order: 1 }),
      step({ id: 'c', step_key: 'c', step_name: 'C', job_type: 'EXECUTE', execution_order: 2 }),
      step({ id: 'd', step_key: 'd', step_name: 'D', job_type: 'RENDER', execution_order: 3 }),
    ];
    const edges: DialecticRecipeEdge[] = [
      edge('a', 'b'),
      edge('a', 'c'),
      edge('b', 'd'),
      edge('c', 'd'),
    ];
    const params: DAGLayoutParams = { steps, edges };
    const result: DAGLayoutResult = computeDAGLayout(params);
    expect(result.nodes).toHaveLength(4);
    const byKey = new Map(result.nodes.map((n) => [n.stepKey, n]));
    expect(byKey.get('a')?.layer).toBe(0);
    expect(byKey.get('b')?.layer).toBe(1);
    expect(byKey.get('c')?.layer).toBe(1);
    expect(byKey.get('d')?.layer).toBe(2);
    expect(result.edges).toHaveLength(4);
  });

  it('gives all node positions non-negative x and y', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'a', step_key: 'a', step_name: 'A', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'b', step_key: 'b', step_name: 'B', job_type: 'EXECUTE', execution_order: 1 }),
    ];
    const params: DAGLayoutParams = { steps, edges: [edge('a', 'b')] };
    const result: DAGLayoutResult = computeDAGLayout(params);
    for (const node of result.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('assigns the same x coordinate to nodes in the same layer', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'plan', step_key: 'plan', step_name: 'PLAN', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'e1', step_key: 'e1', step_name: 'E1', job_type: 'EXECUTE', execution_order: 1 }),
      step({ id: 'e2', step_key: 'e2', step_name: 'E2', job_type: 'EXECUTE', execution_order: 2 }),
    ];
    const params: DAGLayoutParams = { steps, edges: [edge('plan', 'e1'), edge('plan', 'e2')] };
    const result: DAGLayoutResult = computeDAGLayout(params);
    const layer1 = result.nodes.filter((n) => n.layer === 1);
    expect(layer1).toHaveLength(2);
    expect(layer1[0].x).toBe(layer1[1].x);
  });

  it('assigns distinct y within the same layer so no two nodes overlap', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'plan', step_key: 'plan', step_name: 'PLAN', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'e1', step_key: 'e1', step_name: 'E1', job_type: 'EXECUTE', execution_order: 1 }),
      step({ id: 'e2', step_key: 'e2', step_name: 'E2', job_type: 'EXECUTE', execution_order: 2 }),
    ];
    const params: DAGLayoutParams = { steps, edges: [edge('plan', 'e1'), edge('plan', 'e2')] };
    const result: DAGLayoutResult = computeDAGLayout(params);
    const layer1 = result.nodes.filter((n) => n.layer === 1);
    const yValues = layer1.map((n) => n.y);
    expect(new Set(yValues).size).toBe(yValues.length);
  });

  it('sets edge fromX/fromY and toX/toY to match their respective node positions', () => {
    const steps: DialecticStageRecipeStep[] = [
      step({ id: 'a', step_key: 'a', step_name: 'A', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'b', step_key: 'b', step_name: 'B', job_type: 'EXECUTE', execution_order: 1 }),
    ];
    const params: DAGLayoutParams = { steps, edges: [edge('a', 'b')] };
    const result: DAGLayoutResult = computeDAGLayout(params);
    expect(result.edges).toHaveLength(1);
    const nodeByKey = new Map(result.nodes.map((n) => [n.stepKey, n]));
    const fromNode: DAGNodePosition | undefined = nodeByKey.get('a');
    const toNode: DAGNodePosition | undefined = nodeByKey.get('b');
    const edgePos: DAGEdgePosition = result.edges[0];
    expect(fromNode).toBeDefined();
    expect(toNode).toBeDefined();
    expect(edgePos.fromX).toBe(fromNode!.x);
    expect(edgePos.fromY).toBe(fromNode!.y);
    expect(edgePos.toX).toBe(toNode!.x);
    expect(edgePos.toY).toBe(toNode!.y);
  });

  describe('viewport: layout reacts to window size, scales to fit, prefers largest dimension', () => {
    const linearSteps: DialecticStageRecipeStep[] = [
      step({ id: 'a', step_key: 'a', step_name: 'A', job_type: 'PLAN', execution_order: 0 }),
      step({ id: 'b', step_key: 'b', step_name: 'B', job_type: 'EXECUTE', execution_order: 1 }),
      step({ id: 'c', step_key: 'c', step_name: 'C', job_type: 'RENDER', execution_order: 2 }),
    ];
    const linearEdges: DialecticRecipeEdge[] = [edge('a', 'b'), edge('b', 'c')];

    it('uses horizontal layout when viewport is wider than tall (largest dimension is width)', () => {
      const viewport: DAGViewport = { width: 800, height: 400 };
      const params: DAGLayoutParams = { steps: linearSteps, edges: linearEdges, viewport };
      const result: DAGLayoutResult = computeDAGLayout(params);
      expect(result.orientation).toBe('horizontal');
      const byKey = new Map(result.nodes.map((n) => [n.stepKey, n]));
      expect(byKey.get('a')?.layer).toBe(0);
      expect(byKey.get('b')?.layer).toBe(1);
      expect(byKey.get('c')?.layer).toBe(2);
      const layer0X = byKey.get('a')?.x;
      const layer1X = byKey.get('b')?.x;
      const layer2X = byKey.get('c')?.x;
      expect(layer0X).not.toBe(layer1X);
      expect(layer1X).not.toBe(layer2X);
    });

    it('uses vertical layout when viewport is taller than wide (largest dimension is height)', () => {
      const viewport: DAGViewport = { width: 400, height: 800 };
      const params: DAGLayoutParams = { steps: linearSteps, edges: linearEdges, viewport };
      const result: DAGLayoutResult = computeDAGLayout(params);
      expect(result.orientation).toBe('vertical');
      const byKey = new Map(result.nodes.map((n) => [n.stepKey, n]));
      const layer0Y = byKey.get('a')?.y;
      const layer1Y = byKey.get('b')?.y;
      const layer2Y = byKey.get('c')?.y;
      expect(layer0Y).not.toBe(layer1Y);
      expect(layer1Y).not.toBe(layer2Y);
    });

    it('scales layout to fit within viewport when viewport is provided', () => {
      const viewport: DAGViewport = { width: 600, height: 400 };
      const params: DAGLayoutParams = { steps: linearSteps, edges: linearEdges, viewport };
      const result: DAGLayoutResult = computeDAGLayout(params);
      expect(result.width).toBeLessThanOrEqual(viewport.width);
      expect(result.height).toBeLessThanOrEqual(viewport.height);
      for (const node of result.nodes) {
        expect(node.x).toBeLessThanOrEqual(viewport.width);
        expect(node.y).toBeLessThanOrEqual(viewport.height);
      }
      for (const e of result.edges) {
        expect(e.fromX).toBeLessThanOrEqual(viewport.width);
        expect(e.fromY).toBeLessThanOrEqual(viewport.height);
        expect(e.toX).toBeLessThanOrEqual(viewport.width);
        expect(e.toY).toBeLessThanOrEqual(viewport.height);
      }
    });

    it('reacts to window size: same graph with wide vs tall viewport yields different orientation', () => {
      const wideViewport: DAGViewport = { width: 1000, height: 300 };
      const tallViewport: DAGViewport = { width: 300, height: 1000 };
      const paramsWide: DAGLayoutParams = { steps: linearSteps, edges: linearEdges, viewport: wideViewport };
      const paramsTall: DAGLayoutParams = { steps: linearSteps, edges: linearEdges, viewport: tallViewport };
      const resultWide: DAGLayoutResult = computeDAGLayout(paramsWide);
      const resultTall: DAGLayoutResult = computeDAGLayout(paramsTall);
      expect(resultWide.orientation).toBe('horizontal');
      expect(resultTall.orientation).toBe('vertical');
      const byKeyWide = new Map(resultWide.nodes.map((n) => [n.stepKey, n]));
      const byKeyTall = new Map(resultTall.nodes.map((n) => [n.stepKey, n]));
      const wideLayerXs = [byKeyWide.get('a')?.x, byKeyWide.get('b')?.x, byKeyWide.get('c')?.x];
      const tallLayerYs = [byKeyTall.get('a')?.y, byKeyTall.get('b')?.y, byKeyTall.get('c')?.y];
      expect(new Set(wideLayerXs).size).toBeGreaterThan(1);
      expect(new Set(tallLayerYs).size).toBeGreaterThan(1);
    });
  });
});
