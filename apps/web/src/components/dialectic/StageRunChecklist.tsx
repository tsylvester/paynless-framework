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
} from '@paynless/store';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { XCircle } from 'lucide-react';

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

const isMarkdownTemplate = (value: string): boolean => {
  const lower = value.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
};

const extractMarkdownDocumentDescriptorsFromRule = (
  rawRule: unknown,
  stepKey: string,
  descriptors: Map<string, string>,
): void => {
  if (!isPlainRecord(rawRule)) {
    return;
  }

  const register = (documentKey: unknown) => {
    if (typeof documentKey === 'string' && documentKey.trim().length > 0 && !descriptors.has(documentKey)) {
      descriptors.set(documentKey, stepKey);
    }
  };

  const legacyDocumentKey = rawRule['document_key'];
  const legacyFileType = rawRule['file_type'];
  if (legacyFileType === 'markdown') {
    register(legacyDocumentKey);
  }

  const evaluateDocumentEntry = (entry: unknown) => {
    if (!isPlainRecord(entry)) {
      return;
    }

    const documentKey = entry['document_key'];
    const fileType = entry['file_type'];
    const templateFilename = entry['template_filename'];

    if (fileType === 'markdown') {
      register(documentKey);
      return;
    }

    if (typeof templateFilename === 'string' && isMarkdownTemplate(templateFilename)) {
      register(documentKey);
    }
  };

  const documents = toPlainArray(rawRule['documents']);
  documents.forEach(evaluateDocumentEntry);

  const assembledJson = toPlainArray(rawRule['assembled_json']);
  assembledJson.forEach(evaluateDocumentEntry);

  const filesToGenerate = toPlainArray(rawRule['files_to_generate']);
  filesToGenerate.forEach((entry) => {
    if (!isPlainRecord(entry)) {
      return;
    }

    const documentKey = entry['from_document_key'];
    const templateFilename = entry['template_filename'];
    if (
      typeof documentKey === 'string' &&
      documentKey.trim().length > 0 &&
      typeof templateFilename === 'string' &&
      isMarkdownTemplate(templateFilename)
    ) {
      register(documentKey);
    }
  });
};

const collectMarkdownDocumentDescriptors = (
  steps: DialecticStageRecipeStep[],
): MarkdownDocumentDescriptor[] => {
  const descriptors = new Map<string, string>();

  steps.forEach((step) => {
    if (!step.outputs_required) {
      return;
    }

    let rawOutputs: unknown = step.outputs_required;

    if (typeof rawOutputs === 'string') {
      try {
        rawOutputs = JSON.parse(rawOutputs);
      } catch (error) {
        console.warn(
          '[StageRunChecklist] Failed to parse outputs_required JSON',
          { stepKey: step.step_key, raw: rawOutputs, error },
        );
        return;
      }
    }

    const rules = toPlainArray(rawOutputs);
    console.debug('[StageRunChecklist] Parsed outputs_required', {
      stepKey: step.step_key,
      ruleCount: rules.length,
      sampleRule: rules[0],
    });

    rules.forEach((rule) => {
      extractMarkdownDocumentDescriptorsFromRule(rule, step.step_key, descriptors);
    });
  });

  return Array.from(descriptors.entries()).map(([documentKey, stepKey]) => ({
    documentKey,
    stepKey,
  }));
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

  const markdownDocumentDescriptors = useMemo(
    () => collectMarkdownDocumentDescriptors(steps),
    [steps],
  );

  const markdownDescriptorMap = useMemo(() => {
    const descriptors = new Map<string, MarkdownDocumentDescriptor>();
    markdownDocumentDescriptors.forEach((descriptor) => {
      descriptors.set(descriptor.documentKey, descriptor);
    });
    return descriptors;
  }, [markdownDocumentDescriptors]);

  const markdownStepKeys = useMemo(() => {
    const keys = new Set<string>();
    markdownDocumentDescriptors.forEach(({ stepKey }) => {
      keys.add(stepKey);
    });
    return keys;
  }, [markdownDocumentDescriptors]);

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

  const checklistDocuments = useMemo(() => {
    const documentsByKey = new Map<string, { entry: StageDocumentEntry; stepKey: string }>();

    documentChecklist.forEach((entry) => {
      const descriptor = markdownDescriptorMap.get(entry.documentKey);
      if (!descriptor) {
        return;
      }

      const effectiveStepKey = entry.stepKey ?? descriptor.stepKey ?? entry.documentKey;
      documentsByKey.set(entry.documentKey, {
        entry,
        stepKey: effectiveStepKey,
      });
    });

    markdownDescriptorMap.forEach(({ documentKey, stepKey }) => {
      if (!documentsByKey.has(documentKey)) {
        const fallbackEntry: StageDocumentEntry = {
          descriptorType: 'planned',
          documentKey,
          status: 'not_started',
          jobId: null,
          latestRenderedResourceId: null,
          modelId: modelId || null,
          stepKey,
        };
        documentsByKey.set(documentKey, {
          entry: fallbackEntry,
          stepKey,
        });
      }
    });

    return Array.from(documentsByKey.values()).sort((left, right) =>
      left.entry.documentKey.localeCompare(right.entry.documentKey),
    );
  }, [documentChecklist, markdownDescriptorMap, markdownStepKeys, modelId]);

  const totalDocuments = checklistDocuments.length;

  const completedDocuments = checklistDocuments.reduce(
    (count, { entry }) => (entry.status === 'completed' ? count + 1 : count),
    0,
  );

  const hasAnyDocuments = checklistDocuments.length > 0;

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
    (markdownDocumentDescriptors.length === 0 && documentChecklist.length === 0 && !progress);

  if (shouldShowGuard) {
    return (
      <Card className="w-full max-w-full p-4" data-testid="stage-run-checklist-guard">
        <p className="text-sm text-muted-foreground">Stage progress data is unavailable.</p>
      </Card>
    );
  }

  return (
    <Card
      className="w-full max-w-full max-h-96 overflow-hidden border-none p-0"
      data-testid="stage-run-checklist-card"
    >
      <Accordion
        type="single"
        collapsible
        defaultValue="documents"
        className="w-full"
        data-testid="stage-run-checklist-accordion"
      >
        <AccordionItem value="documents" className="border-none">
          <AccordionTrigger
            data-testid="stage-run-checklist-accordion-trigger"
            className="justify-between rounded-none px-0 py-1 text-sm font-normal text-muted-foreground hover:no-underline"
          >
            <span aria-live="polite" role="status" className="text-left">
              {`Completed ${completedDocuments} of ${totalDocuments} documents`}
            </span>
          </AccordionTrigger>
          <AccordionContent
            data-testid="stage-run-checklist-accordion-content"
            className="flex w-full flex-col gap-0 overflow-hidden px-0"
          >
            {hasAnyDocuments ? (
              <ul
                className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
                data-testid="stage-run-checklist-documents"
              >
                {checklistDocuments.map(({ entry, stepKey }) => {
                  const documentStatusLabel = formatStatusLabel(entry.status);
                  const documentModelId = entry.modelId ?? null;
                  const isSelectable = Boolean(documentModelId);

                  const focusKey =
                    activeSessionId && activeStageSlug && documentModelId
                      ? buildFocusedDocumentKey(activeSessionId, activeStageSlug, documentModelId)
                      : null;

                  const isActive = Boolean(
                    focusKey &&
                      effectiveFocusedStageDocumentMap &&
                      effectiveFocusedStageDocumentMap[focusKey]?.documentKey === entry.documentKey,
                  );

                  return (
                    <li
                      key={entry.documentKey}
                      data-testid={`document-${entry.documentKey}`}
                      className={cn(
                        'flex items-center justify-between rounded-md border border-border px-2 py-1 text-sm transition-colors',
                        isSelectable
                          ? 'cursor-pointer hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                          : 'cursor-default bg-muted/20 text-muted-foreground',
                        isActive && 'border-primary ring-2 ring-primary/40',
                      )}
                      tabIndex={isSelectable ? 0 : undefined}
                      aria-pressed={isSelectable ? (isActive || undefined) : undefined}
                      data-active={isActive ? 'true' : undefined}
                      onClick={() =>
                        isSelectable &&
                        handleDocumentSelect(entry.documentKey, documentModelId || undefined, stepKey)
                      }
                      onKeyDown={(event) =>
                        isSelectable &&
                        handleDocumentKeyDown(event, entry.documentKey, documentModelId || undefined, stepKey)
                      }
                    >
                      <div className="flex items-center gap-2">
                        {entry.status === 'failed' ? (
                          <XCircle
                            aria-label="Document failed"
                            className="h-4 w-4 text-destructive"
                            data-testid="document-failed-icon"
                          />
                        ) : null}
                        <span className="font-mono text-xs sm:text-sm">{entry.documentKey}</span>
                      </div>
                      <Badge className="shrink-0">{documentStatusLabel}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No documents generated yet.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
};

export { StageRunChecklist };