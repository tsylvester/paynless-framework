import React, { useCallback, useState } from 'react';
import type {
  DialecticStateValues,
  SetFocusedStageDocumentPayload,
  StageDocumentEntry,
  StageRunChecklistProps,
} from '@paynless/types';
import type { DialecticStageRecipeStep } from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';

import {
  useDialecticStore,
  selectActiveContextSessionId,
  selectStepList,
  selectStageRunProgress,
  selectStageDocumentChecklist,
  selectValidMarkdownDocumentKeys,
  selectSortedStages,
} from '@paynless/store';

import { isDocumentHighlighted } from '@paynless/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, XCircle, CheckCircle2, Loader2 } from 'lucide-react';

const formatStatusLabel = (value: string): string => {
  const mapping: Record<string, string> = {
    completed: 'Completed',
    in_progress: 'In Progress',
    not_started: 'Not Started',
    waiting_for_children: 'Waiting for Children',
    failed: 'Failed',
    generating: 'Generating',
    continuing: 'Continuing',
    retrying: 'Retrying',
    idle: 'Idle',
  };

  if (mapping[value]) {
    return mapping[value];
  }

  return value
    .split('_')
    .map((segment) =>
      segment.length > 0
        ? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`
        : segment
    )
    .join(' ');
};

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
  const activeStageSlug: string | null = state.activeStageSlug;
  const activeSessionId = state.activeContextSessionId;
  const iterationNumber = state.activeSessionDetail?.iteration_count;
  void modelIdProp;

  const contributions = state.activeSessionDetail?.dialectic_contributions ?? [];
  const modelNameByModelId = new Map<string, string>();
  contributions.forEach((contribution) => {
    const modelId = contribution.model_id;
    const modelName = contribution.model_name;
    if (typeof modelId !== 'string' || modelId.trim().length === 0) {
      return;
    }
    if (typeof modelName !== 'string' || modelName.trim().length === 0) {
      return;
    }
    const existing = modelNameByModelId.get(modelId);
    if (existing && existing !== modelName) {
      throw new Error(
        `StageRunChecklist invariant violation: conflicting model_name values for modelId "${modelId}" ("${existing}" vs "${modelName}")`,
      );
    }
    modelNameByModelId.set(modelId, modelName);
  });

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

    const stageProgress =
      activeSessionId != null && typeof iterationNumber === 'number'
        ? selectStageRunProgress(state, activeSessionId, stage.slug, iterationNumber)
        : undefined;

    const modelIdsByDocumentKey = new Map<string, string[]>();
    const progressDocumentKeys = new Set<string>();

    if (stageProgress) {
      Object.entries(stageProgress.documents).forEach(([compositeKey, descriptor]) => {
        if (!descriptor || typeof descriptor.modelId !== 'string' || descriptor.modelId.length === 0) {
          return;
        }

        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
        const logicalDocumentKey = compositeKey.includes(sep)
          ? compositeKey.slice(0, compositeKey.indexOf(sep))
          : compositeKey;

        // Documents are markdown-only and recipe-defined. Ignore all non-markdown artifacts.
        if (!validMarkdownDocumentKeys.has(logicalDocumentKey)) {
          return;
        }

        progressDocumentKeys.add(logicalDocumentKey);

        const existing = modelIdsByDocumentKey.get(logicalDocumentKey);
        if (existing) {
          if (!existing.includes(descriptor.modelId)) {
            existing.push(descriptor.modelId);
          }
        } else {
          modelIdsByDocumentKey.set(logicalDocumentKey, [descriptor.modelId]);
        }
      });
    }

    const descriptors = getMarkdownDocumentDescriptors(steps, validMarkdownDocumentKeys);
    const stepKeyByDocumentKey = new Map(descriptors.map((d) => [d.documentKey, d.stepKey]));
    const producedDocumentKeys = Array.from(validMarkdownDocumentKeys.values()).sort((a, b) =>
      a.localeCompare(b),
    );

    const allDocumentKeys: string[] = [...producedDocumentKeys];
    const documentRows: StageDocumentRow[] = [];

    allDocumentKeys.forEach((documentKey) => {
      const stepKey = stepKeyByDocumentKey.get(documentKey) ?? '';
      const documentModelIds = modelIdsByDocumentKey.get(documentKey) ?? [];
      let completedCount = 0;
      let hasFailed = false;
      let hasContinuing = false;
      let firstRenderedEntry: StageDocumentEntry | null = null;
      const perModelLabels: PerModelLabel[] = [];

      if (progressKey && documentModelIds.length > 0) {
        for (const mid of documentModelIds) {
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
            statusLabel = 'Missing status';
          }

          // Canonical model display labels come from already-produced contributions in the active session.
          const displayName = modelNameByModelId.get(mid);
          if (!displayName) {
            throw new Error(
              `StageRunChecklist invariant violation: missing dialectic_contributions model_name for modelId "${mid}" (stage "${stage.slug}", documentKey "${documentKey}")`,
            );
          }
          perModelLabels.push({ modelId: mid, displayName, statusLabel });
        }
      }

      const totalModels = documentModelIds.length;
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
              modelId: null,
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
    effectiveModelIds: [],
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
  const activeStageSlug = useDialecticStore((state) => state.activeStageSlug);
  const checklistData = useDialecticStore((state) =>
    computeStageRunChecklistData(state, modelId),
  );
  const [expandedRowKeys, setExpandedRowKeys] = useState<Record<string, boolean>>({});

  const effectiveFocusedStageDocumentMap = focusedStageDocumentMap ?? {};

  const handleDocumentSelectForStage = useCallback(
    (documentKey: string, stepKey: string, stageSlug: string, modelIds: string[]) => {
      if (
        !activeSessionId ||
        typeof iterationNumber !== 'number' ||
        modelIds.length === 0
      ) {
        return;
      }

      modelIds.forEach((mid) => {
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
      onDocumentSelect,
    ],
  );

  const handleDocumentKeyDownForStage = useCallback(
    (
      event: React.KeyboardEvent<HTMLLIElement>,
      documentKey: string,
      stepKey: string,
      stageSlug: string,
      modelIds: string[],
    ) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleDocumentSelectForStage(documentKey, stepKey, stageSlug, modelIds);
      }
    },
    [handleDocumentSelectForStage],
  );

  const shouldShowGuard = checklistData.sortedStages.length === 0;

  if (shouldShowGuard) {
    return (
      <Card className="w-full max-w-full p-4" data-testid="stage-run-checklist-guard">
        <p className="text-sm text-muted-foreground">No stages available.</p>
      </Card>
    );
  }

  if (!activeStageSlug) {
    return (
      <Card className="w-full max-w-full p-4" data-testid="stage-run-checklist-guard">
        <p className="text-sm text-muted-foreground">No active stage selected.</p>
      </Card>
    );
  }

  const activeStageData =
    activeStageSlug
      ? checklistData.stageDataList.find((candidate) => candidate.stage.slug === activeStageSlug)
      : undefined;

  if (!activeStageData) {
    return (
      <Card className="w-full max-w-full p-4" data-testid="stage-run-checklist-guard">
        <p className="text-sm text-muted-foreground">Active stage not found in process template.</p>
      </Card>
    );
  }

  const defaultValue = 'documents';

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
        <AccordionItem value="documents" className="border-none">
          <AccordionTrigger
            className="px-0 py-2 text-sm font-medium hover:no-underline"
            data-testid="stage-run-checklist-documents-trigger"
          >
                    <p className="px-0 pb-2 text-sm text-muted-foreground">
                      {activeStageData.documentRows.filter((r) => r.consolidatedLabel === 'Completed').length} / {activeStageData.documentRows.length} Documents
                    </p>          
          </AccordionTrigger>
          <AccordionContent
            data-testid="stage-run-checklist-documents-content"
            className="flex w-full flex-col gap-0 overflow-hidden px-0"
          >
            {activeStageData.documentRows.length > 0 ? (
                  <>
                    <ul
                      className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
                      data-testid="stage-run-checklist-documents"
                    >
                      {activeStageData.documentRows.map(({ entry, stepKey, consolidatedLabel, perModelLabels }) => {
                        const rowKey = `${activeStageData.stage.slug}:${entry.documentKey}`;
                        const isExpanded = expandedRowKeys[rowKey] === true;
                        const focusedModelIdsForStage: string[] =
                          activeSessionId != null
                            ? Object.keys(effectiveFocusedStageDocumentMap)
                                .filter((key) =>
                                  key.startsWith(`${activeSessionId}:${activeStageData.stage.slug}:`),
                                )
                                .map((key) => key.split(':').slice(2).join(':'))
                            : [];

                        const focusModelIds: string[] = perModelLabels.map((label) => label.modelId);

                        const canFocusRow =
                          activeSessionId != null &&
                          typeof iterationNumber === 'number' &&
                          focusModelIds.length > 0;

                        const highlightModelIds: string[] = Array.from(
                          new Set([...focusModelIds, ...focusedModelIdsForStage]),
                        );
                        const isActive =
                          activeSessionId != null &&
                          highlightModelIds.some((mid) =>
                            isDocumentHighlighted(
                              activeSessionId,
                              activeStageData.stage.slug,
                              mid,
                              entry.documentKey,
                              effectiveFocusedStageDocumentMap,
                            ),
                          );

                        const handleRowClick = () => {
                          if (!canFocusRow) return;
                          setExpandedRowKeys((prev) => ({ ...prev, [rowKey]: true }));
                          handleDocumentSelectForStage(
                            entry.documentKey,
                            stepKey,
                            activeStageData.stage.slug,
                            focusModelIds,
                          );
                        };

                        const handleTogglePerModel = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          setExpandedRowKeys((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
                        };

                        const statusBadgeLabel = formatStatusLabel(consolidatedLabel);

                        return (
                          <li
                            key={entry.documentKey}
                            data-testid={`document-${entry.documentKey}`}
                            className={cn(
                              'flex flex-col gap-1 rounded-md border border-border px-2 py-1 text-sm transition-colors',
                              canFocusRow
                                ? 'cursor-pointer hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                                : 'cursor-default',
                              isActive && 'border-primary ring-2 ring-primary/40',
                            )}
                            tabIndex={canFocusRow ? 0 : undefined}
                            aria-pressed={
                              canFocusRow ? (isActive || undefined) : undefined
                            }
                            data-active={isActive ? 'true' : undefined}
                            onClick={handleRowClick}
                            onKeyDown={(e) =>
                              canFocusRow &&
                              handleDocumentKeyDownForStage(
                                e,
                                entry.documentKey,
                                stepKey,
                                activeStageData.stage.slug,
                                focusModelIds,
                              )
                            }
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {entry.status === 'completed' ? (
                                  <CheckCircle2
                                    aria-label="Document completed"
                                    className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                                    data-testid="document-completed-icon"
                                  />
                                ) : entry.status === 'failed' ? (
                                  <XCircle
                                    aria-label="Document failed"
                                    className="h-4 w-4 shrink-0 text-destructive"
                                    data-testid="document-failed-icon"
                                  />
                                ) : entry.status === 'generating' || entry.status === 'continuing' ? (
                                  <Loader2
                                    aria-label="Document generating"
                                    className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 animate-spin"
                                    data-testid="document-generating-icon"
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
                                <Badge variant="outline" className="text-xs px-1.5 py-0">
                                  {statusBadgeLabel}
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
                ) : activeStageData ? (
                  <>
                    <p className="px-0 pb-2 text-sm text-muted-foreground">0 / 0 Documents</p>
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No documents generated yet.
                    </p>
                  </>
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No active stage selected.
                  </p>
                )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
};

export { StageRunChecklist };

