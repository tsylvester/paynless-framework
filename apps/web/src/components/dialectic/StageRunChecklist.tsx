import React, { useCallback, useRef, useState } from 'react';
import type {
  DialecticStateValues,
  RegenerateDocumentPayload,
  SetFocusedStageDocumentPayload,
  StageDocumentEntry,
  StageRunChecklistProps,
} from '@paynless/types';
import type { DialecticStageRecipeStep } from '@paynless/types';
import {
  useDialecticStore,
  selectActiveContextSessionId,
  selectDocumentDisplayMetadata,
  selectStepList,
  selectStageRunProgress,
  selectStageDocumentChecklist,
  selectValidMarkdownDocumentKeys,
  selectSortedStages,
} from '@paynless/store';

import { isDocumentHighlighted } from '@paynless/utils';
import { cn } from '@/lib/utils';
import { Info, RefreshCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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

type RegenerateDialogContext = {
  documentKey: string;
  stageSlug: string;
  perModelLabels: PerModelLabel[];
};

type StageDocumentRow = {
  entry: StageDocumentEntry;
  stepKey: string;
  consolidatedLabel: string;
  perModelLabels: PerModelLabel[];
};

type StageChecklistData = {
  stage: { id: string; slug: string; display_name: string | null };
  isReady: boolean;
  hasStageProgress: boolean;
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

  // The store tracks which stage slug is actively generating via generatingForStageSlug.
  const generatingStageSlug: string | null = state.generatingForStageSlug ?? null;

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
    if (stageProgress?.jobs) {
      for (const job of stageProgress.jobs) {
        const docKey = job.documentKey;
        const modelId = job.modelId;
        if (
          docKey != null &&
          docKey.length > 0 &&
          modelId != null &&
          modelId.length > 0 &&
          validMarkdownDocumentKeys.has(docKey)
        ) {
          const existing = modelIdsByDocumentKey.get(docKey);
          if (existing) {
            if (!existing.includes(modelId)) {
              existing.push(modelId);
            }
          } else {
            modelIdsByDocumentKey.set(docKey, [modelId]);
          }
        }
      }
    }

    const descriptors = getMarkdownDocumentDescriptors(steps, validMarkdownDocumentKeys);
    const stepKeyByDocumentKey = new Map(descriptors.map((d) => [d.documentKey, d.stepKey]));
    const producedDocumentKeys = Array.from(validMarkdownDocumentKeys.values()).sort((a, b) =>
      a.localeCompare(b),
    );

    const allDocumentKeys: string[] = [...producedDocumentKeys];
    const documentRows: StageDocumentRow[] = [];

    function jobStatusToLabel(status: string): string {
      if (status === 'completed') return 'Completed';
      if (status === 'failed') return 'Failed';
      if (
        status === 'processing' ||
        status === 'retrying' ||
        status === 'waiting_for_children'
      ) {
        return 'Generating';
      }
      if (status === 'pending' || status === 'waiting_for_prerequisite') return 'Not started';
      return 'Continuing';
    }

    allDocumentKeys.forEach((documentKey) => {
      const stepKey = stepKeyByDocumentKey.get(documentKey);
      let completedCount = 0;
      let hasFailed = false;
      let hasContinuing = false;
      let firstRenderedEntry: StageDocumentEntry | null = null;
      const perModelLabels: PerModelLabel[] = [];

      const modelIdsFromJobs = modelIdsByDocumentKey.get(documentKey) ?? [];
      const contributionModelIds: string[] = Array.from(modelNameByModelId.keys());
      const hasNoJobsForStage = (stageProgress?.jobs?.length ?? 0) === 0;
      const modelIdsForDoc =
        modelIdsFromJobs.length > 0
          ? modelIdsFromJobs
          : hasNoJobsForStage
            ? contributionModelIds
            : [];

      if (progressKey) {
        for (const mid of modelIdsForDoc) {
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
            const jobsForModel =
              stageProgress?.jobs.filter(
                (j) => j.documentKey === documentKey && j.modelId === mid,
              ) ?? [];
            const job = jobsForModel[0];
            statusLabel = job != null ? jobStatusToLabel(job.status) : 'Missing status';
          }

          const jobsForModel =
            stageProgress?.jobs.filter(
              (j) => j.documentKey === documentKey && j.modelId === mid,
            ) ?? [];
          const job = jobsForModel[0];
          const nameFromJob =
            job?.modelName != null && job.modelName.trim().length > 0
              ? job.modelName
              : null;
          const nameFromContrib = modelNameByModelId.get(mid) ?? null;
          const displayName = nameFromJob ?? nameFromContrib ?? mid;

          perModelLabels.push({ modelId: mid, displayName, statusLabel });
        }
      }

      const totalModels = modelIdsForDoc.length;
      // If no per-model progress yet but the stage is actively generating, treat as generating
      const isStageGenerating = generatingStageSlug === stage.slug;
      const consolidatedLabel =
        hasFailed
          ? 'Failed'
          : hasContinuing
            ? 'Continuing'
            : completedCount === totalModels && totalModels > 0
              ? 'Completed'
              : completedCount === 0 && isStageGenerating
                ? 'Generating'
                : completedCount === 0
                  ? 'Not Started'
                  : `${completedCount}/${totalModels} complete`;

      const derivedStatus: StageDocumentEntry['status'] = hasFailed
        ? 'failed'
        : hasContinuing
          ? 'continuing'
          : completedCount === totalModels && totalModels > 0
            ? 'completed'
            : completedCount === 0 && isStageGenerating
              ? 'generating'
              : 'not_started';

      const stepKeyResolved: string = stepKey ?? '';

      const entry: StageDocumentEntry =
        derivedStatus !== 'not_started' && firstRenderedEntry != null && 'jobId' in firstRenderedEntry
          ? {
              descriptorType: 'rendered',
              documentKey,
              status: derivedStatus,
              jobId: firstRenderedEntry.jobId,
              latestRenderedResourceId: firstRenderedEntry.latestRenderedResourceId,
              modelId: firstRenderedEntry.modelId,
              stepKey: stepKeyResolved,
            }
          : {
              descriptorType: 'planned',
              documentKey,
              status: derivedStatus === 'generating' ? 'generating' : 'not_started',
              jobId: null,
              latestRenderedResourceId: null,
              modelId: null,
              stepKey: stepKeyResolved,
            };

      documentRows.push({ entry, stepKey: stepKeyResolved, consolidatedLabel, perModelLabels });
    });

    documentRows.sort((a, b) => a.entry.documentKey.localeCompare(b.entry.documentKey));

    const hasStageProgress = stageProgress != null;

    return {
      stage: {
        id: stage.id,
        slug: stage.slug,
        display_name: stage.display_name ?? null,
      },
      isReady,
      hasStageProgress,
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
  stageSlug: stageSlugProp,
}) => {
  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
  const iterationNumber = activeSessionDetail?.iteration_count;
  const storeActiveStageSlug = useDialecticStore((state) => state.activeStageSlug);
  const setActiveStage = useDialecticStore((state) => state.setActiveStage);
  const regenerateDocument = useDialecticStore((state) => state.regenerateDocument);
  const effectiveStageSlug = stageSlugProp ?? storeActiveStageSlug;
  const checklistData = useDialecticStore((state) =>
    computeStageRunChecklistData(state, modelId),
  );
  const documentDisplayMetadata = useDialecticStore((state) =>
    selectDocumentDisplayMetadata(state, effectiveStageSlug ?? ''),
  );
  const effectiveFocusedStageDocumentMap = focusedStageDocumentMap ?? {};

  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerateDialogContext, setRegenerateDialogContext] = useState<RegenerateDialogContext | null>(null);
  const [regenerateSelectedModelIds, setRegenerateSelectedModelIds] = useState<Set<string>>(new Set());
  const checklistRef = useRef<HTMLDivElement>(null);

  const handleDocumentSelectForStage = useCallback(
    (documentKey: string, stepKey: string, stageSlug: string, modelIds: string[]) => {
      if (
        !activeSessionId ||
        typeof iterationNumber !== 'number' ||
        modelIds.length === 0
      ) {
        return;
      }

      // Switch to the document's stage if it differs from the current active stage
      if (stageSlug !== storeActiveStageSlug) {
        setActiveStage(stageSlug);
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
      storeActiveStageSlug,
      setActiveStage,
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

  const stageDataForCurrentStage = checklistData.stageDataList.find(
    (candidate) => candidate.stage.slug === effectiveStageSlug,
  );
  const isDocumentOnCurrentStage =
    activeSessionDetail?.current_stage_id != null &&
    stageDataForCurrentStage != null &&
    stageDataForCurrentStage.stage.id === activeSessionDetail.current_stage_id;

  const openRegenerateDialog = useCallback(
    (documentKey: string, stageSlug: string, perModelLabels: PerModelLabel[]) => {
      const preChecked = new Set(
        perModelLabels
          .filter((l) => l.statusLabel === 'Failed' || l.statusLabel === 'Not started')
          .map((l) => l.modelId),
      );
      setRegenerateDialogContext({ documentKey, stageSlug, perModelLabels });
      setRegenerateSelectedModelIds(preChecked);
      setRegenerateDialogOpen(true);
    },
    [],
  );

  const handleRegenerateConfirm = useCallback(() => {
    if (
      !regenerateDialogContext ||
      !activeSessionId ||
      typeof iterationNumber !== 'number' ||
      regenerateSelectedModelIds.size === 0
    ) {
      setRegenerateDialogOpen(false);
      setRegenerateDialogContext(null);
      return;
    }
    const documents = Array.from(regenerateSelectedModelIds).map((modelId) => ({
      documentKey: regenerateDialogContext.documentKey,
      modelId,
    }));
    const payload: RegenerateDocumentPayload = {
      sessionId: activeSessionId,
      stageSlug: regenerateDialogContext.stageSlug,
      iterationNumber,
      documents,
    };
    void regenerateDocument(payload);
    setRegenerateDialogOpen(false);
    setRegenerateDialogContext(null);
  }, [
    regenerateDialogContext,
    activeSessionId,
    iterationNumber,
    regenerateSelectedModelIds,
    regenerateDocument,
  ]);

  const handleRegenerateButtonClick = useCallback(
    (e: React.MouseEvent, documentKey: string, stageSlug: string, perModelLabels: PerModelLabel[]) => {
      e.stopPropagation();
      if (
        !isDocumentOnCurrentStage ||
        !activeSessionId ||
        typeof iterationNumber !== 'number'
      ) {
        return;
      }
      if (perModelLabels.length === 1) {
        const payload: RegenerateDocumentPayload = {
          sessionId: activeSessionId,
          stageSlug,
          iterationNumber,
          documents: [{ documentKey, modelId: perModelLabels[0].modelId }],
        };
        void regenerateDocument(payload);
      } else {
        openRegenerateDialog(documentKey, stageSlug, perModelLabels);
      }
    },
    [
      isDocumentOnCurrentStage,
      activeSessionId,
      iterationNumber,
      regenerateDocument,
      openRegenerateDialog,
    ],
  );

  const shouldShowGuard = checklistData.sortedStages.length === 0;

  if (shouldShowGuard) {
    return null;
  }

  if (!effectiveStageSlug) {
    return null;
  }

  const stageData = checklistData.stageDataList.find(
    (candidate) => candidate.stage.slug === effectiveStageSlug,
  );

  if (!stageData || stageData.documentRows.length === 0) {
    return null;
  }

  return (
    <div
      ref={checklistRef}
      className="w-full flex flex-col gap-0 px-0"
      data-testid="stage-run-checklist-card"
    >
      <ul
        className="flex flex-col gap-1 pr-1"
        data-testid="stage-run-checklist-documents"
      >
        {stageData.documentRows.map(({ entry, stepKey, perModelLabels }) => {
          const meta = documentDisplayMetadata.get(entry.documentKey);
          const displayName: string =
            meta?.displayName ??
            entry.documentKey
              .split('_')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(' ');
          const description: string = meta?.description ?? '';
          const displayNameWithBreaks: string = displayName.split('. ').join('.\n\n');
          const descriptionWithBreaks: string = description.split('. ').join('.\n\n');

          const focusedModelIdsForStage: string[] =
            activeSessionId != null
              ? Object.keys(effectiveFocusedStageDocumentMap)
                  .filter((key) =>
                    key.startsWith(`${activeSessionId}:${stageData.stage.slug}:`),
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
                stageData.stage.slug,
                mid,
                entry.documentKey,
                effectiveFocusedStageDocumentMap,
              ),
            );

          const handleRowClick = () => {
            if (!canFocusRow) return;
            handleDocumentSelectForStage(
              entry.documentKey,
              stepKey,
              stageData.stage.slug,
              focusModelIds,
            );
          };

          return (
            <li
              key={entry.documentKey}
              data-testid={`document-${entry.documentKey}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                canFocusRow
                  ? 'cursor-pointer hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                  : 'cursor-default',
                isActive && 'bg-surface',
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
                  stageData.stage.slug,
                  focusModelIds,
                )
              }
            >
              {isDocumentOnCurrentStage &&
              stageData.hasStageProgress &&
              perModelLabels.length > 0 ? (
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full',
                    entry.status === 'completed' && 'bg-emerald-500',
                    entry.status === 'failed' && 'bg-destructive',
                    (entry.status === 'generating' ||
                      entry.status === 'continuing' ||
                      entry.status === 'not_started') &&
                      'bg-amber-400',
                  )}
                  aria-label="Regenerate document"
                  data-testid={
                    entry.status === 'completed'
                      ? 'document-completed-icon'
                      : entry.status === 'failed'
                        ? 'document-failed-icon'
                        : entry.status === 'not_started'
                          ? 'document-not-started-icon'
                          : 'document-generating-icon'
                  }
                  onClick={(e) =>
                    handleRegenerateButtonClick(
                      e,
                      entry.documentKey,
                      stageData.stage.slug,
                      perModelLabels,
                    )
                  }
                >
                  <RefreshCcw className="h-[15px] w-[15px] text-white" />
                </button>
              ) : (
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
                    entry.status === 'completed' && 'bg-emerald-500',
                    entry.status === 'failed' && 'bg-destructive',
                    (entry.status === 'generating' ||
                      entry.status === 'continuing' ||
                      entry.status === 'not_started') &&
                      'bg-amber-400',
                  )}
                  data-testid={
                    entry.status === 'completed'
                      ? 'document-completed-icon'
                      : entry.status === 'failed'
                        ? 'document-failed-icon'
                        : entry.status === 'not_started'
                          ? 'document-not-started-icon'
                          : 'document-generating-icon'
                  }
                  aria-hidden
                />
              )}
              <div className="flex flex-1 min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 font-mono text-xs whitespace-pre-line break-words">
                  {displayNameWithBreaks}
                </span>
                {description ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="ml-auto inline-flex shrink-0 text-muted-foreground hover:text-foreground cursor-help"
                        role="img"
                        aria-label="Document description"
                        data-testid={`document-info-${entry.documentKey}`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      align="center"
                      collisionBoundary={checklistRef.current}
                      className="max-w-sm whitespace-pre-line break-words"
                    >
                      {descriptionWithBreaks}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={regenerateDialogOpen}
        onOpenChange={(open) => {
          setRegenerateDialogOpen(open);
          if (!open) setRegenerateDialogContext(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate document</DialogTitle>
          </DialogHeader>
          {regenerateDialogContext && (() => {
            const dialogMeta = documentDisplayMetadata.get(regenerateDialogContext.documentKey);
            const dialogDisplayName: string =
              dialogMeta?.displayName ??
              regenerateDialogContext.documentKey
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            return (
            <>
              <p className="text-sm text-muted-foreground">
                Select which model outputs to regenerate for{' '}
                <code className="font-mono text-xs">{dialogDisplayName}</code>.
              </p>
              <div className="flex flex-col gap-2">
                {regenerateDialogContext.perModelLabels.map((label) => (
                  <label
                    key={label.modelId}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={regenerateSelectedModelIds.has(label.modelId)}
                      onCheckedChange={(checked) => {
                        setRegenerateSelectedModelIds((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.add(label.modelId);
                          } else {
                            next.delete(label.modelId);
                          }
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm">{label.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      ({label.statusLabel})
                    </span>
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRegenerateDialogOpen(false);
                    setRegenerateDialogContext(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerateConfirm}
                  disabled={regenerateSelectedModelIds.size === 0}
                >
                  Regenerate
                </Button>
              </DialogFooter>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { StageRunChecklist };

