import React, { useCallback, useMemo } from 'react';
import type {
  DialecticStageRecipeStep,
  SetFocusedStageDocumentPayload,
  StageDocumentEntry,
  StageRunChecklistProps,
} from '@paynless/types';

import {
  useDialecticStore,
  selectActiveContextSessionId,
  selectActiveStageSlug,
  selectStageRecipe,
  selectStepList,
  selectStageRunProgress,
  selectStageDocumentChecklist,
  selectStageProgressSummary,
} from '@paynless/store';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

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

const buildStepDocumentKeySet = (step: DialecticStageRecipeStep): Set<string> => {
  const keys = (step.outputs_required ?? [])
    .map((output) => output.document_key)
    .filter((key): key is string => typeof key === 'string' && key.length > 0);

  return new Set(keys);
};

const buildFocusedDocumentKey = (sessionId: string, stageSlug: string, modelId: string): string =>
  `${sessionId}:${stageSlug}:${modelId}`;

const StageRunChecklist: React.FC<StageRunChecklistProps> = ({
  focusedStageDocumentMap,
  onDocumentSelect,
  modelId,
}) => {
  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  const activeStageSlug = useDialecticStore(selectActiveStageSlug);
  const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);

  const iterationNumber = activeSessionDetail?.iteration_count;

  const recipe = useDialecticStore((state) =>
    activeStageSlug ? selectStageRecipe(state, activeStageSlug) : undefined
  );

  const steps = useDialecticStore((state) =>
    activeStageSlug ? selectStepList(state, activeStageSlug) : []
  );

  const progress = useDialecticStore((state) =>
    activeSessionId && activeStageSlug && typeof iterationNumber === 'number'
      ? selectStageRunProgress(state, activeSessionId, activeStageSlug, iterationNumber)
      : undefined
  );

  const progressKey = useMemo(() => {
    if (!activeSessionId || !activeStageSlug || typeof iterationNumber !== 'number') {
      return undefined;
    }
    return `${activeSessionId}:${activeStageSlug}:${iterationNumber}`;
  }, [activeSessionId, activeStageSlug, iterationNumber]);

  const documentChecklist = useDialecticStore((state) =>
    progressKey ? selectStageDocumentChecklist(state, progressKey, modelId) : []
  );

  const summary = useDialecticStore((state) =>
    activeSessionId && activeStageSlug && typeof iterationNumber === 'number'
      ? selectStageProgressSummary(state, activeSessionId, activeStageSlug, iterationNumber, modelId)
      : undefined
  );

  const documentsByKey = useMemo(() => {
    const map = new Map<string, StageDocumentEntry>();
    documentChecklist.forEach((entry) => {
      if (!entry.latestRenderedResourceId) {
        throw new Error('Latest rendered resource ID is required');
      }
      const sanitizedEntry: StageDocumentEntry = {
        ...entry,
        latestRenderedResourceId: entry.latestRenderedResourceId,
      };

      map.set(entry.documentKey, sanitizedEntry);
    });
    return map;
  }, [documentChecklist]);

  const openValues = useMemo(
    () => steps.map((step) => step.step_key),
    [steps]
  );

  const totalDocuments = summary?.totalDocuments ?? documentChecklist.length;
  const completedDocuments = summary?.completedDocuments ?? 0;
  const outstandingDocuments = summary?.outstandingDocuments ?? [];
  const hasAnyDocuments = documentChecklist.length > 0;

  const effectiveFocusedStageDocumentMap = focusedStageDocumentMap ?? {};

  const handleDocumentSelect = useCallback(
    (documentKey: string, modelId: string | undefined, stepKey: string) => {
      if (
        !activeSessionId ||
        !activeStageSlug ||
        typeof iterationNumber !== 'number' ||
        !modelId
      ) {
        return;
      }

      const basePayload: SetFocusedStageDocumentPayload = {
        sessionId: activeSessionId,
        stageSlug: activeStageSlug,
        modelId,
        documentKey,
        stepKey,
        iterationNumber,
      };

      onDocumentSelect(basePayload);
    },
    [activeSessionId, activeStageSlug, iterationNumber, onDocumentSelect],
  );

  const handleDocumentKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLLIElement>,
      documentKey: string,
      modelId: string | undefined,
      stepKey: string,
    ) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleDocumentSelect(documentKey, modelId, stepKey);
      }
    },
    [handleDocumentSelect],
  );

  const shouldShowGuard =
    !activeSessionId ||
    !activeStageSlug ||
    typeof iterationNumber !== 'number' ||
    !recipe ||
    !progress;

  if (shouldShowGuard) {
    return (
      <Card data-testid="stage-run-checklist-guard">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Stage progress data is unavailable.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Stage Run Checklist</h2>
          <div aria-live="polite" role="status" className="text-sm text-muted-foreground">
            {`Completed ${completedDocuments} of ${totalDocuments} documents`}
          </div>
          {outstandingDocuments.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {`Outstanding: ${outstandingDocuments.join(', ')}`}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAnyDocuments && (
          <p className="text-sm text-muted-foreground">No documents generated yet.</p>
        )}
        <Accordion
          type="multiple"
          className="border rounded-md"
          defaultValue={openValues}
        >
          {steps.map((step) => {
            const stepStatusValue = progress.stepStatuses[step.step_key] ?? 'not_started';
            const stepStatusLabel = formatStatusLabel(stepStatusValue);
            const documentKeys = Array.from(buildStepDocumentKeySet(step));
            const stepDocuments = documentKeys
              .map((key) => documentsByKey.get(key))
              .filter((entry): entry is StageDocumentEntry => Boolean(entry))
              .sort((left, right) => left.documentKey.localeCompare(right.documentKey));

            return (
              <AccordionItem key={step.step_key} value={step.step_key} className="px-4">
                <AccordionTrigger
                  className="gap-4"
                  data-testid={`step-row-${step.step_key}`}
                >
                  <div className="flex flex-col gap-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{step.step_name}</span>
                      <Badge>{stepStatusLabel}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {typeof step.parallel_group === 'number' && (
                        <span>{`Parallel Group ${step.parallel_group}`}</span>
                      )}
                      {step.branch_key && step.branch_key.length > 0 && (
                        <span>{`Branch ${step.branch_key}`}</span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div
                    data-testid={`documents-for-${step.step_key}`}
                    className="space-y-2"
                  >
                    {stepDocuments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No documents for this step.</p>
                    ) : (
                      <ul className="space-y-2">
                        {stepDocuments.map((document) => {
                          const documentStatusLabel = formatStatusLabel(document.status);
                          const jobIdRaw = document.jobId;
                          const resourceRaw = document.latestRenderedResourceId;
                          const modelId = document.modelId;
                          const isSelectable = Boolean(modelId);

                          const focusKey =
                            activeSessionId && activeStageSlug && modelId
                              ? buildFocusedDocumentKey(activeSessionId, activeStageSlug, modelId)
                              : null;

                          const isActive = Boolean(
                            focusKey &&
                              effectiveFocusedStageDocumentMap &&
                              effectiveFocusedStageDocumentMap[focusKey]?.documentKey === document.documentKey,
                          );

                          const hasJob = typeof jobIdRaw === 'string' && jobIdRaw.length > 0;
                          const hasResource = typeof resourceRaw === 'string' && resourceRaw.length > 0;

                          const jobIdDisplay = hasJob
                            ? jobIdRaw
                            : hasResource
                              ? '—'
                              : 'N/A';

                          const resourceDisplay = hasResource ? resourceRaw : '—';

                          return (
                            <li
                              key={document.documentKey}
                              data-testid={`document-${document.documentKey}`}
                              className={cn(
                                'border rounded-md p-3',
                                'flex flex-col gap-1 text-sm transition-colors outline-none',
                                isSelectable
                                  ? 'cursor-pointer hover:border-primary'
                                  : 'cursor-default',
                                isActive && 'border-primary ring-2 ring-primary/40',
                              )}
                              role={isSelectable ? 'button' : undefined}
                              tabIndex={isSelectable ? 0 : undefined}
                              aria-pressed={isActive || undefined}
                              data-active={isActive ? 'true' : undefined}
                              onClick={() =>
                                handleDocumentSelect(document.documentKey, modelId, step.step_key)
                              }
                              onKeyDown={(event) =>
                                handleDocumentKeyDown(
                                  event,
                                  document.documentKey,
                                  modelId,
                                  step.step_key,
                                )
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-xs sm:text-sm">
                                  {document.documentKey}
                                </span>
                                <Badge className="w-fit">{documentStatusLabel}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                <span>
                                  Job ID: <span className="font-medium text-foreground">{jobIdDisplay}</span>
                                </span>
                                <span>
                                  Latest Render: <span className="font-medium text-foreground">{resourceDisplay}</span>
                                </span>
                              </div>
                              {modelId && (
                                <div className="text-xs text-muted-foreground">
                                  Model:{' '}
                                  <span className="font-medium text-foreground">{modelId}</span>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
};

export { StageRunChecklist };









