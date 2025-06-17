import React, { useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDialecticStore } from '@paynless/store';
import {
  selectActiveContextStage,
  selectCurrentProjectDetail,
  selectCurrentProcessTemplate,
  selectIsLoadingProcessTemplate,
} from '@paynless/store';
import { Skeleton } from '@/components/ui/skeleton';
import { DialecticStage } from '@paynless/types';

interface DialecticStageSelectorProps {
  disabled?: boolean;
}

export const DialecticStageSelector: React.FC<DialecticStageSelectorProps> = ({ disabled }) => {
  const project = useDialecticStore(selectCurrentProjectDetail);
  const currentStage = useDialecticStore(selectActiveContextStage);
  const processTemplate = useDialecticStore(selectCurrentProcessTemplate);
  const isLoadingTemplate = useDialecticStore(selectIsLoadingProcessTemplate);
  const fetchProcessTemplate = useDialecticStore((state) => state.fetchProcessTemplate);
  const setActiveContextStage = useDialecticStore((state) => state.setActiveContextStage);

  useEffect(() => {
    if (project?.dialectic_process_templates && !processTemplate && !isLoadingTemplate) {
      fetchProcessTemplate(project.dialectic_process_templates.id);
    }
  }, [project, processTemplate, fetchProcessTemplate, isLoadingTemplate]);

  const availableStages = useMemo((): DialecticStage[] => {
    if (!currentStage || !processTemplate?.stages || !processTemplate.transitions) {
      return [];
    }

    const { stages, transitions } = processTemplate;
    
    // Build a map of predecessors (reversed graph)
    const predecessors = new Map<string, string[]>();
    for (const transition of transitions) {
      if (!predecessors.has(transition.target_stage_id)) {
        predecessors.set(transition.target_stage_id, []);
      }
      predecessors.get(transition.target_stage_id)!.push(transition.source_stage_id);
    }

    // BFS to find all predecessors
    const visited = new Set<string>();
    const queue: string[] = [currentStage.id];
    
    while (queue.length > 0) {
      const stageId = queue.shift()!;
      if (!visited.has(stageId)) {
        visited.add(stageId);
        const preds = predecessors.get(stageId) || [];
        for (const predId of preds) {
          if (!visited.has(predId)) {
            queue.push(predId);
          }
        }
      }
    }
    
    // The current stage is always available
    visited.add(currentStage.id);
    
    return stages.filter(stage => visited.has(stage.id));
  }, [currentStage, processTemplate]);

  const handleStageChange = (stageId: string) => {
    const selectedStage = processTemplate?.stages?.find((s) => s.id === stageId);
    if (selectedStage) {
      setActiveContextStage(selectedStage);
    }
  };

  if (isLoadingTemplate) {
    return <Skeleton className="h-9 w-48" data-testid="loading-skeleton" />;
  }

  return (
    <Select
      value={currentStage?.id || ''}
      onValueChange={handleStageChange}
      disabled={disabled || availableStages.length <= 1}
    >
      <SelectTrigger className="w-fit">
        <SelectValue placeholder="No active stage...">
          {currentStage?.display_name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableStages.map((stage) => (
          <SelectItem key={stage.id} value={stage.id}>
            {stage.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; 