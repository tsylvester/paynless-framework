import React, { useMemo, useEffect, useCallback } from 'react';
import { useDialecticStore } from '@paynless/store';
import { selectUnifiedProjectProgress, selectStageRunProgress } from '@paynless/store';
import type { StageDAGProgressDialogProps } from '@paynless/types';
import type { UnifiedProjectStatus } from '@paynless/types';
import type { StageRunDocumentDescriptor } from '@paynless/types';
import type { DAGNodePosition, DAGEdgePosition } from '@paynless/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { computeDAGLayout } from './dagLayout';

const NODE_WIDTH = 100;
const NODE_HEIGHT = 40;

const STATUS_FILL: Record<UnifiedProjectStatus, string> = {
  not_started: '#9ca3af',
  in_progress: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
};

function isRenderedAndCompleted(descriptor: StageRunDocumentDescriptor | undefined): boolean {
  if (!descriptor) return false;
  if (descriptor.descriptorType === 'planned') return false;
  return descriptor.status === 'completed';
}

export const StageDAGProgressDialog: React.FC<StageDAGProgressDialogProps> = ({
  open,
  onOpenChange,
  stageSlug,
  sessionId,
  iterationNumber,
}) => {
  const recipe = useDialecticStore((state) => state.recipesByStageSlug[stageSlug]);
  const unifiedProgress = useDialecticStore(useCallback((state) => selectUnifiedProjectProgress(state, sessionId), [sessionId]));
  const documents = useDialecticStore(
    useCallback(
      (state) => {
        const progress = selectStageRunProgress(state, sessionId, stageSlug, iterationNumber);
        return progress?.documents ?? {};
      },
      [sessionId, stageSlug, iterationNumber]
    )
  );

  const layout = useMemo(() => {
    const steps = recipe?.steps ?? [];
    const edges = recipe?.edges ?? [];
    return computeDAGLayout({ steps, edges });
  }, [recipe]);

  const statusByStepKey = useMemo(() => {
    const detail = unifiedProgress.stageDetails.find((s) => s.stageSlug === stageSlug);
    if (!detail) return new Map<string, UnifiedProjectStatus>();
    const map = new Map<string, UnifiedProjectStatus>();
    for (const step of detail.stepsDetail) {
      map.set(step.stepKey, step.status);
    }
    return map;
  }, [unifiedProgress.stageDetails, stageSlug]);

  useEffect(() => {
    if (!open) return;
    const hasRenderedCompleted = Object.values(documents).some(isRenderedAndCompleted);
    if (hasRenderedCompleted) {
      onOpenChange(false);
    }
  }, [open, documents, onOpenChange]);

  const hasRecipeData = recipe && recipe.steps.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Stage progress</DialogTitle>
        {!hasRecipeData ? (
          <p className="text-muted-foreground">No recipe data available</p>
        ) : (
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={layout.width}
            height={layout.height}
            className="overflow-visible"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
            </defs>
            {layout.edges.map((edge: DAGEdgePosition, i: number) => (
              <line
                key={`edge-${i}-${edge.fromStepKey}-${edge.toStepKey}`}
                x1={edge.fromX}
                y1={edge.fromY}
                x2={edge.toX}
                y2={edge.toY}
                stroke="#64748b"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            ))}
            {layout.nodes.map((node: DAGNodePosition) => {
              const status: UnifiedProjectStatus = statusByStepKey.get(node.stepKey) ?? 'not_started';
              const fill = STATUS_FILL[status];
              const isInProgress = status === 'in_progress';
              return (
                <g key={node.stepKey}>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={6}
                    fill={fill}
                    className={isInProgress ? 'animate-pulse' : undefined}
                  />
                  <text
                    x={node.x + NODE_WIDTH / 2}
                    y={node.y + NODE_HEIGHT / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-background text-xs font-medium"
                  >
                    {node.stepName}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </DialogContent>
    </Dialog>
  );
};
