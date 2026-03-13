import React, { useCallback, useState } from 'react';
import type { DocumentDisplayMetadata, RegenerateDocumentPayload } from '@paynless/types';
import { useDialecticStore } from '@paynless/store';
import { Loader2, RefreshCcw, Circle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export type PerModelLabel = { modelId: string; displayName: string; statusLabel: string };

type RegenerateDialogContext = {
  documentKey: string;
  stageSlug: string;
  perModelLabels: PerModelLabel[];
};

export interface RegenerateDocumentButtonProps {
  activeSessionId: string | null;
  iterationNumber: number | undefined;
  documentKey: string;
  stageSlug: string;
  perModelLabels: PerModelLabel[];
  isDocumentOnCurrentStage: boolean;
  hasStageProgress: boolean;
  documentDisplayMetadata: Map<string, DocumentDisplayMetadata>;
  entryStatus: string;
}

const RegenerateDocumentButton: React.FC<RegenerateDocumentButtonProps> = ({
  activeSessionId,
  iterationNumber,
  documentKey,
  stageSlug,
  perModelLabels,
  isDocumentOnCurrentStage,
  hasStageProgress,
  documentDisplayMetadata,
  entryStatus,
}) => {
  const regenerateDocument = useDialecticStore((state) => state.regenerateDocument);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerateDialogContext, setRegenerateDialogContext] = useState<RegenerateDialogContext | null>(null);
  const [regenerateSelectedModelIds, setRegenerateSelectedModelIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openRegenerateDialog = useCallback(
    (docKey: string, stage: string, labels: PerModelLabel[]) => {
      const preChecked = new Set(
        labels
          .filter((l) => l.statusLabel === 'Failed' || l.statusLabel === 'Not started')
          .map((l) => l.modelId),
      );
      setRegenerateDialogContext({ documentKey: docKey, stageSlug: stage, perModelLabels: labels });
      setRegenerateSelectedModelIds(preChecked);
      setRegenerateDialogOpen(true);
    },
    [],
  );

  const handleRegenerateConfirm = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
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
      idempotencyKey: crypto.randomUUID(),
      sessionId: activeSessionId,
      stageSlug: regenerateDialogContext.stageSlug,
      iterationNumber,
      documents,
    };
    setIsSubmitting(true);
    try {
      await regenerateDocument(payload);
    } finally {
      setIsSubmitting(false);
    }
    setRegenerateDialogOpen(false);
    setRegenerateDialogContext(null);
  }, [
    isSubmitting,
    regenerateDialogContext,
    activeSessionId,
    iterationNumber,
    regenerateSelectedModelIds,
    regenerateDocument,
  ]);

  const handleRegenerateButtonClick = useCallback(
    async (e: React.MouseEvent, docKey: string, stage: string, labels: PerModelLabel[]) => {
      e.stopPropagation();
      if (isSubmitting) {
        return;
      }
      if (!isDocumentOnCurrentStage || !activeSessionId || typeof iterationNumber !== 'number') {
        return;
      }
      if (labels.length === 1) {
        const payload: RegenerateDocumentPayload = {
          idempotencyKey: crypto.randomUUID(),
          sessionId: activeSessionId,
          stageSlug: stage,
          iterationNumber,
          documents: [{ documentKey: docKey, modelId: labels[0].modelId }],
        };
        setIsSubmitting(true);
        try {
          await regenerateDocument(payload);
        } finally {
          setIsSubmitting(false);
        }
      } else {
        openRegenerateDialog(docKey, stage, labels);
      }
    },
    [
      isSubmitting,
      isDocumentOnCurrentStage,
      activeSessionId,
      iterationNumber,
      regenerateDocument,
      openRegenerateDialog,
    ],
  );

  const statusDataTestId: string =
    entryStatus === 'completed'
      ? 'document-completed-icon'
      : entryStatus === 'failed'
        ? 'document-failed-icon'
        : entryStatus === 'not_started'
          ? 'document-not-started-icon'
          : 'document-generating-icon';

  const showButton =
    isDocumentOnCurrentStage && hasStageProgress && perModelLabels.length > 0;

  // Check if this stage is currently generating
  const generatingForStageSlug = useDialecticStore((state) => state.generatingForStageSlug);
  const contributionGenerationStatus = useDialecticStore((state) => state.contributionGenerationStatus);
  const isStageGenerating = generatingForStageSlug === stageSlug && contributionGenerationStatus === 'generating';

  // Show pulsing animation for any non-completed, non-failed status during active generation
  // or if the document itself is in a generating state
  const isGenerating = (isStageGenerating && entryStatus !== 'completed' && entryStatus !== 'failed') ||
                       entryStatus === 'generating' || 
                       entryStatus === 'continuing' || 
                       entryStatus === 'retrying';

  return (
    <>
      {showButton ? (
        <button
          type="button"
          className={cn(
            'inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full relative',
            entryStatus === 'completed' && 'bg-emerald-500',
            entryStatus === 'failed' && 'bg-destructive',
            (entryStatus === 'generating' ||
              entryStatus === 'continuing' ||
              entryStatus === 'not_started') &&
              'bg-amber-400',
          )}
          aria-label="Regenerate document"
          data-testid={statusDataTestId}
          disabled={isSubmitting}
          onClick={(e) => void handleRegenerateButtonClick(e, documentKey, stageSlug, perModelLabels)}
        >
          {isGenerating ? (
            <Loader2 className="h-3 w-3 text-white animate-spin" />
          ) : (
            <RefreshCcw className="h-[15px] w-[15px] text-white" />
          )}
        </button>
      ) : (
        <div className="relative">
          {isGenerating ? (
            <>
              <Circle 
                className={cn(
                  'h-2.5 w-2.5 shrink-0 text-amber-400 animate-pulse',
                )}
                fill="currentColor"
                data-testid={statusDataTestId}
                aria-hidden
              />
              <Circle 
                className={cn(
                  'h-2.5 w-2.5 shrink-0 text-amber-400 absolute top-0 left-0 animate-ping',
                )}
                fill="currentColor"
                aria-hidden
              />
            </>
          ) : (
            <span
              className={cn(
                'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
                entryStatus === 'completed' ? 'bg-emerald-500' :
                entryStatus === 'failed' ? 'bg-destructive' :
                'bg-amber-400', // Only amber for truly incomplete states
              )}
              data-testid={statusDataTestId}
              aria-hidden
            />
          )}
        </div>
      )}
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
                    onClick={() => void handleRegenerateConfirm()}
                    disabled={regenerateSelectedModelIds.size === 0 || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      'Regenerate'
                    )}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export { RegenerateDocumentButton };
