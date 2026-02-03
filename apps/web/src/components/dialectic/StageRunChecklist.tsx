import React, { useCallback, useState } from 'react';
import type {
  DialecticStateValues,
  SetFocusedStageDocumentPayload,
  StageDocumentEntry,
  StageRunChecklistProps,
} from '@paynless/types';
import type { DialecticStageRecipeStep } from '@paynless/types';

import {
  useDialecticStore,
  selectActiveContextSessionId,
  selectStepList,
  selectStageDocumentChecklist,
  selectValidMarkdownDocumentKeys,
  selectSortedStages,
  selectSelectedModels,
} from '@paynless/store';

import { isDocumentHighlighted } from '@paynless/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, XCircle } from 'lucide-react';

type MarkdownDocumentDescriptor = {
  documentKey: string;
  stepKey: string;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toPlainArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
};

function getMarkdownDocumentDescriptors(
  steps: DialecticStageRecipeStep[],
  validMarkdownDocumentKeys: Set<string>,
): MarkdownDocumentDescriptor[] {
  const documentKeyToStepKeyMap = new Map<string, string>();

  steps.forEach((step) => {
    if (!step.outputs_required) {
      return;
    }

    let rawOutputs: unknown = step.outputs_required;

    if (typeof rawOutputs === 'string') {
      try {
        rawOutputs = JSON.parse(rawOutputs);
      } catch {
        return;
      }
    }

    const rules = toPlainArray(rawOutputs);
    rules.forEach((rule) => {
      if (!isPlainRecord(rule)) {
        return;
      }

      const registerDocumentKey = (documentKey: unknown) => {
        if (
          typeof documentKey === 'string' &&
          documentKey.trim().length > 0 &&
          !documentKeyToStepKeyMap.has(documentKey)
        ) {
          documentKeyToStepKeyMap.set(documentKey, step.step_key);
        }
      };

      const extractDocumentKey = (entry: unknown) => {
        if (!isPlainRecord(entry)) {
          return;
        }
        const documentKey = entry['document_key'];
        if (typeof documentKey === 'string' && documentKey.trim().length > 0) {
          registerDocumentKey(documentKey);
        }
      };

      const legacyDocumentKey = rule['document_key'];
      if (typeof legacyDocumentKey === 'string' && legacyDocumentKey.trim().length > 0) {
        registerDocumentKey(legacyDocumentKey);
      }

      toPlainArray(rule['documents']).forEach(extractDocumentKey);
      toPlainArray(rule['assembled_json']).forEach(extractDocumentKey);
      const filesToGenerate = toPlainArray(rule['files_to_generate']);
      filesToGenerate.forEach((entry) => {
        if (!isPlainRecord(entry)) {
          return;
        }
        const documentKey = entry['from_document_key'];
        if (typeof documentKey === 'string' && documentKey.trim().length > 0) {
          registerDocumentKey(documentKey);
        }
      });
    });
  });

  const descriptors: MarkdownDocumentDescriptor[] = [];
  validMarkdownDocumentKeys.forEach((documentKey) => {
    const stepKey = documentKeyToStepKeyMap.get(documentKey);
    if (stepKey) {
      descriptors.push({ documentKey, stepKey });
    }
  });
  return descriptors;
}

type PerModelLabel = { modelId: string; displayName: string; statusLabel: string };

type StageDocumentRow = {
  entry: StageDocumentEntry;
  stepKey: string;
  consolidatedLabel: string;
  perModelLabels: PerModelLabel[];
};

type StageChecklistData = {
  stage: { id: string; slug: string; display_name: string | null };
  isReady: boolean;
  documentRows: StageDocumentRow[];
};

type ChecklistData = {
  sortedStages: Array<{ id: string; slug: string; display_name: string | null }>;
  activeStageIndex: number;
  effectiveModelIds: string[];
  stageDataList: StageChecklistData[];
};

function computeStageRunChecklistData(

  state: DialecticStateValues,
  modelIdProp: string | null,
): ChecklistData {
  const sortedStages = selectSortedStages(state);
  const activeStageSlug = state.activeStageSlug;
  const activeSessionId = state.activeContextSessionId;
  const iterationNumber = state.activeSessionDetail?.iteration_count;
  const selectedModels = selectSelectedModels(state);
  const effectiveModelIds: string[] =
    selectedModels.length > 0 ? selectedModels.map((m) => m.id) : modelIdProp ? [modelIdProp] : [];
  const displayNameByModelId = new Map(selectedModels.map((m) => [m.id, m.displayName]));

  const activeStageIndex =
    activeStageSlug != null
      ? sortedStages.findIndex((s) => s.slug === activeStageSlug)
      : -1;

  const stageDataList: StageChecklistData[] = sortedStages.map((stage) => {
    const stageIndex = sortedStages.indexOf(stage);
    const isReady = activeStageIndex >= 0 && stageIndex <= activeStageIndex;

    const steps = selectStepList(state, stage.slug);
    const validMarkdownDocumentKeys = selectValidMarkdownDocumentKeys(state, stage.slug);
    const progressKey =
      activeSessionId != null && typeof iterationNumber === 'number'
        ? `${activeSessionId}:${stage.slug}:${iterationNumber}`
        : '';

    const descriptors = getMarkdownDocumentDescriptors(steps, validMarkdownDocumentKeys);
    const documentRows: StageDocumentRow[] = [];

    descriptors.forEach(({ documentKey, stepKey }) => {
      let completedCount = 0;
      let hasFailed = false;
      let hasContinuing = false;
      let firstRenderedEntry: StageDocumentEntry | null = null;
      const perModelLabels: PerModelLabel[] = [];

      if (progressKey && effectiveModelIds.length > 0) {
        for (const mid of effectiveModelIds) {
          const checklist = selectStageDocumentChecklist(state, progressKey, mid);
          const checklistEntry = checklist.find((e) => e.documentKey === documentKey);
          let statusLabel: string;
          if (checklistEntry) {
            if (checklistEntry.status === 'completed') {
              completedCount += 1;
              statusLabel = 'Completed';
            } else if (checklistEntry.status === 'failed') {
              hasFailed = true;
              statusLabel = 'Failed';
            } else if (checklistEntry.status === 'continuing') {
              hasContinuing = true;
              statusLabel = 'Continuing';
            } else if (checklistEntry.status === 'generating') {
              hasContinuing = true;
              statusLabel = 'Generating';
            } else {
              statusLabel = 'Not started';
            }
            if (
              firstRenderedEntry == null &&
              checklistEntry.descriptorType !== 'planned' &&
              'jobId' in checklistEntry
            ) {
              firstRenderedEntry = checklistEntry;
            }
          } else {
            statusLabel = 'Not started';
          }
          const displayName = displayNameByModelId.get(mid) ?? mid;
          perModelLabels.push({ modelId: mid, displayName, statusLabel });
        }
      }

      const totalModels = effectiveModelIds.length;
      const consolidatedLabel =
        hasFailed
          ? 'Failed'
          : hasContinuing
            ? 'Continuing'
            : completedCount === totalModels && totalModels > 0
              ? 'Completed'
              : completedCount === 0
                ? 'Not Started'
                : `${completedCount}/${totalModels} complete`;

      const derivedStatus: StageDocumentEntry['status'] = hasFailed
        ? 'failed'
        : hasContinuing
          ? 'continuing'
          : completedCount === totalModels && totalModels > 0
            ? 'completed'
            : 'not_started';

      const entry: StageDocumentEntry =
        derivedStatus !== 'not_started' && firstRenderedEntry != null && 'jobId' in firstRenderedEntry
          ? {
              descriptorType: 'rendered',
              documentKey,
              status: derivedStatus,
              jobId: firstRenderedEntry.jobId,
              latestRenderedResourceId: firstRenderedEntry.latestRenderedResourceId,
              modelId: firstRenderedEntry.modelId,
              stepKey,
            }
          : {
              descriptorType: 'planned',
              documentKey,
              status: 'not_started',
              jobId: null,
              latestRenderedResourceId: null,
              modelId: effectiveModelIds[0] ?? null,
              stepKey,
            };

      documentRows.push({ entry, stepKey, consolidatedLabel, perModelLabels });
    });

    documentRows.sort((a, b) => a.entry.documentKey.localeCompare(b.entry.documentKey));

    return {
      stage: {
        id: stage.id,
        slug: stage.slug,
        display_name: stage.display_name ?? null,
      },
      isReady,
      documentRows,
    };
  });

  return {
    sortedStages: sortedStages.map((s) => ({
      id: s.id,
      slug: s.slug,
      display_name: s.display_name ?? null,
    })),
    activeStageIndex,
    effectiveModelIds,
    stageDataList,
  };
}

const StageRunChecklist: React.FC<StageRunChecklistProps> = ({
  focusedStageDocumentMap,
  onDocumentSelect,
  modelId,
}) => {
  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
  const iterationNumber = activeSessionDetail?.iteration_count;
  const checklistData = useDialecticStore((state) =>
    computeStageRunChecklistData(state, modelId),
  );
  const [expandedRowKeys, setExpandedRowKeys] = useState<Record<string, boolean>>({});

  const effectiveFocusedStageDocumentMap = focusedStageDocumentMap ?? {};

  const handleDocumentSelectForStage = useCallback(
    (documentKey: string, stepKey: string, stageSlug: string) => {
      if (
        !activeSessionId ||
        typeof iterationNumber !== 'number' ||
        checklistData.effectiveModelIds.length === 0
      ) {
        return;
      }

      checklistData.effectiveModelIds.forEach((mid) => {
        const payload: SetFocusedStageDocumentPayload = {
          sessionId: activeSessionId,
          stageSlug,
          modelId: mid,
          documentKey,
          stepKey,
          iterationNumber,
        };
        onDocumentSelect(payload);
      });
    },
    [
      activeSessionId,
      iterationNumber,
      checklistData.effectiveModelIds,
      onDocumentSelect,
    ],
  );

  const handleDocumentKeyDownForStage = useCallback(
    (
      event: React.KeyboardEvent<HTMLLIElement>,
      documentKey: string,
      stepKey: string,
      stageSlug: string,
    ) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleDocumentSelectForStage(documentKey, stepKey, stageSlug);
      }
    },
    [handleDocumentSelectForStage],
  );

  const shouldShowGuard =
    !activeSessionId ||
    typeof iterationNumber !== 'number' ||
    checklistData.sortedStages.length === 0;

  if (shouldShowGuard) {
    return (
      <Card className="w-full max-w-full p-4" data-testid="stage-run-checklist-guard">
        <p className="text-sm text-muted-foreground">Stage progress data is unavailable.</p>
      </Card>
    );
  }

  const defaultValue =
    checklistData.sortedStages[checklistData.activeStageIndex]?.slug ??
    checklistData.sortedStages[0]?.slug ??
    'documents';

  return (
    <Card
      className="w-full max-w-full max-h-96 overflow-hidden border-none p-0"
      data-testid="stage-run-checklist-card"
    >
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultValue}
        className="w-full"
        data-testid="stage-run-checklist-accordion"
      >
        {checklistData.stageDataList.map((stageData) => {
          return (
            <AccordionItem
              key={stageData.stage.slug}
              value={stageData.stage.slug}
              className="border-none"
            >
              <AccordionContent
                data-testid={`stage-run-checklist-accordion-content-${stageData.stage.slug}`}
                className="flex w-full flex-col gap-0 overflow-hidden px-0"
              >
                {stageData.documentRows.length > 0 ? (
                  <>
                    <p className="px-0 pb-2 text-sm text-muted-foreground">
                      {stageData.documentRows.filter((r) => r.consolidatedLabel === 'Completed').length} / {stageData.documentRows.length} Documents
                    </p>
                    <ul
                      className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
                      data-testid="stage-run-checklist-documents"
                    >
                    {stageData.documentRows.map(({ entry, stepKey, consolidatedLabel, perModelLabels }) => {
                      const rowKey = `${stageData.stage.slug}:${entry.documentKey}`;
                      const isExpanded = expandedRowKeys[rowKey] === true;
                      const isSelectable =
                        checklistData.effectiveModelIds.length > 0;
                      const isActive =
                        activeSessionId != null &&
                        checklistData.effectiveModelIds.some((mid) =>
                          isDocumentHighlighted(
                            activeSessionId,
                            stageData.stage.slug,
                            mid,
                            entry.documentKey,
                            effectiveFocusedStageDocumentMap,
                          ),
                        );

                      const handleRowClick = () => {
                        if (!isSelectable) return;
                        setExpandedRowKeys((prev) => ({ ...prev, [rowKey]: true }));
                        handleDocumentSelectForStage(
                          entry.documentKey,
                          stepKey,
                          stageData.stage.slug,
                        );
                      };

                      const handleTogglePerModel = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setExpandedRowKeys((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
                      };

                      return (
                        <li
                          key={entry.documentKey}
                          data-testid={`document-${entry.documentKey}`}
                          className={cn(
                            'flex flex-col gap-1 rounded-md border border-border px-2 py-1 text-sm transition-colors',
                            isSelectable
                              ? 'cursor-pointer hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                              : 'cursor-default bg-muted/20 text-muted-foreground',
                            isActive && 'border-primary ring-2 ring-primary/40',
                          )}
                          tabIndex={isSelectable ? 0 : undefined}
                          aria-pressed={
                            isSelectable ? (isActive || undefined) : undefined
                          }
                          data-active={isActive ? 'true' : undefined}
                          onClick={handleRowClick}
                          onKeyDown={(e) =>
                            isSelectable &&
                            handleDocumentKeyDownForStage(
                              e,
                              entry.documentKey,
                              stepKey,
                              stageData.stage.slug,
                            )
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              {(entry.status === 'failed' || consolidatedLabel === 'Failed') ? (
                                <XCircle
                                  aria-label="Document failed"
                                  className="h-4 w-4 shrink-0 text-destructive"
                                  data-testid="document-failed-icon"
                                />
                              ) : null}
                              <span className="font-mono text-xs sm:text-sm truncate">
                                {entry.documentKey}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                data-testid="stage-run-checklist-row-toggle-per-model"
                                className="rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Collapse per-model status' : 'Expand per-model status'}
                                onClick={handleTogglePerModel}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <Badge>
                                {consolidatedLabel}
                              </Badge>
                            </div>
                          </div>
                          {isExpanded && perModelLabels.length > 0 ? (
                            <div
                              data-testid="stage-run-checklist-row-per-model-status"
                              className="flex flex-col gap-0.5 pl-6 text-xs text-muted-foreground"
                            >
                              {perModelLabels.map(({ modelId: mid, displayName, statusLabel }) => (
                                <span key={mid}>
                                  {displayName}: {statusLabel}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  </>
                ) : (
                  <>
                    <p className="px-0 pb-2 text-sm text-muted-foreground">0 / 0 Documents</p>
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No documents generated yet.
                    </p>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
};

export { StageRunChecklist };

