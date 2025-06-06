import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { TextInputArea } from '@/components/common/TextInputArea';
import { useDialecticStore } from '@paynless/store';
import type { StartSessionPayload, DialecticProject, DomainOverlayDescriptor, DialecticStage, DomainTagDescriptor } from '@paynless/types';
import {
  selectCurrentProjectDetail,
  selectIsStartNewSessionModalOpen,
  selectIsStartingSession,
  selectStartSessionError,
  selectSelectedDomainOverlayId,
  selectAvailableDomainOverlays,
  selectSelectedDomainTag,
  selectAvailableDomainTags,
  selectSelectedStageAssociation,
  selectSelectedModelIds,
  selectIsLoadingModelCatalog,
} from '@paynless/store';
import { toast } from 'sonner';
import { DomainSelector } from './DomainSelector';
import { DialecticStageSelector } from './DialecticStageSelector';
import { AIModelSelector } from './AIModelSelector';

interface StartDialecticSessionModalProps {
  onSessionStarted?: (sessionId: string) => void;
}

const selectSelectedDomainOverlayDescriptor = (state: ReturnType<typeof useDialecticStore['getState']>) => {
  const selectedId = selectSelectedDomainOverlayId(state);
  const overlays = selectAvailableDomainOverlays(state);
  if (!selectedId || !overlays) return null;
  return overlays.find((ov: DomainOverlayDescriptor) => ov.id === selectedId) || null;
};

export const StartDialecticSessionModal: React.FC<StartDialecticSessionModalProps> = ({
  onSessionStarted,
}) => {
  const {
    setStartNewSessionModalOpen,
    startDialecticSession,
    setSelectedDomainTag,
    setSelectedDomainOverlayId,
    setSelectedStageAssociation,
  } = useDialecticStore((state) => ({
    setStartNewSessionModalOpen: state.setStartNewSessionModalOpen,
    startDialecticSession: state.startDialecticSession,
    setSelectedDomainTag: state.setSelectedDomainTag,
    setSelectedDomainOverlayId: state.setSelectedDomainOverlayId,
    setSelectedStageAssociation: state.setSelectedStageAssociation,
  }));

  const currentProjectDetail = useDialecticStore(selectCurrentProjectDetail) as DialecticProject | null;
  const isModalOpen = useDialecticStore(selectIsStartNewSessionModalOpen);
  const isStartingSession = useDialecticStore(selectIsStartingSession);
  const startSessionError = useDialecticStore(selectStartSessionError);
  const selectedDomainOverlayDescriptor = useDialecticStore(selectSelectedDomainOverlayDescriptor);
  const isLoadingModelCatalog = useDialecticStore(selectIsLoadingModelCatalog);

  const currentSelectedDomainTagFromStore = useDialecticStore(selectSelectedDomainTag);
  const availableDomainTags = useDialecticStore(selectAvailableDomainTags);

  const currentSelectedStageFromStore = useDialecticStore(selectSelectedStageAssociation);
  const currentSelectedOverlayIdFromStore = useDialecticStore(selectSelectedDomainOverlayId);

  const currentDialecticStage = useDialecticStore(selectSelectedStageAssociation) as DialecticStage | undefined;
  const currentSelectedModelIds = useDialecticStore(selectSelectedModelIds) || [];

  const [sessionDescription, setSessionDescription] = useState<string | object>('');
  const [hasUserEditedDescription, setHasUserEditedDescription] = useState(false);

  const baseDomainTagDescription = useMemo(() => {
    if (!currentSelectedDomainTagFromStore || !availableDomainTags) return null;
    const currentTagDescriptor = availableDomainTags.find(tag => tag.domainTag === currentSelectedDomainTagFromStore);
    return currentTagDescriptor?.description || null;
  }, [currentSelectedDomainTagFromStore, availableDomainTags]);

  useEffect(() => {
    if (isModalOpen && currentProjectDetail && availableDomainTags && availableDomainTags.length > 0) {
      let projectOverlayId = currentProjectDetail.selected_domain_overlay_id;
      const projectDomainTag = currentProjectDetail.selected_domain_tag;
      let targetDescriptor: DomainTagDescriptor | undefined = undefined;

      if (projectOverlayId) {
        targetDescriptor = availableDomainTags.find(d => d.id === projectOverlayId);
      } else if (projectDomainTag) {
        targetDescriptor = availableDomainTags.find(d => d.domainTag === projectDomainTag);
        if (targetDescriptor) {
          projectOverlayId = targetDescriptor.id;
        }
      }

      if (targetDescriptor) {
        const needsUpdate =
          targetDescriptor.stageAssociation !== currentSelectedStageFromStore ||
          targetDescriptor.domainTag !== currentSelectedDomainTagFromStore ||
          projectOverlayId !== currentSelectedOverlayIdFromStore;

        if (needsUpdate) {
          if (targetDescriptor.stageAssociation && targetDescriptor.stageAssociation !== currentSelectedStageFromStore) {
            setSelectedStageAssociation(targetDescriptor.stageAssociation as DialecticStage);
          }
          if (targetDescriptor.domainTag && targetDescriptor.domainTag !== currentSelectedDomainTagFromStore) {
            setSelectedDomainTag(targetDescriptor.domainTag);
          }
          if (projectOverlayId !== currentSelectedOverlayIdFromStore) {
            setSelectedDomainOverlayId(projectOverlayId || null);
          }
        }
      } else if (!projectOverlayId && !projectDomainTag) {
        if (currentSelectedDomainTagFromStore !== null) { setSelectedDomainTag(null); }
        if (currentSelectedOverlayIdFromStore !== null) { setSelectedDomainOverlayId(null); }
      }
    } else if (isModalOpen && !currentProjectDetail) {
      if (currentSelectedDomainTagFromStore !== null) { setSelectedDomainTag(null); }
      if (currentSelectedOverlayIdFromStore !== null) { setSelectedDomainOverlayId(null); }
    }
  }, [
    isModalOpen,
    currentProjectDetail,
    availableDomainTags,
    setSelectedStageAssociation,
    setSelectedDomainTag,
    setSelectedDomainOverlayId,
    currentSelectedStageFromStore,
    currentSelectedDomainTagFromStore,
    currentSelectedOverlayIdFromStore
  ]);

  useEffect(() => {
    if (isModalOpen && !hasUserEditedDescription) {
      const ov = selectedDomainOverlayDescriptor?.overlay_values;
      if (ov !== undefined && ov !== null) {
        setSessionDescription(ov);
      } else {
        setSessionDescription(selectedDomainOverlayDescriptor?.description || baseDomainTagDescription || '');
      }
    }
  }, [selectedDomainOverlayDescriptor, baseDomainTagDescription, isModalOpen, hasUserEditedDescription]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setHasUserEditedDescription(false);
    }
    setStartNewSessionModalOpen(open);
  };

  const getSessionDescriptionForTextarea = (): string => {
    if (typeof sessionDescription === 'string') {
      return sessionDescription;
    }
    if (typeof sessionDescription === 'object' && sessionDescription !== null) {
      return `\`\`\`json\n${JSON.stringify(sessionDescription, null, 2)}\n\`\`\``;
    }
    return '';
  };

  const handleSessionDescriptionChange = (newValue: string) => {
    setSessionDescription(newValue);
    setHasUserEditedDescription(true);
  };

  const handleStartSessionSubmit = async () => {
    if (!currentProjectDetail?.id) {
      toast.error('Project ID is missing. Cannot start session.');
      return;
    }
    if (currentSelectedModelIds.length === 0) {
      toast.error('Please select at least one AI model.');
      return;
    }

    let sessionDescriptionForPayload: string | undefined;
    if (typeof sessionDescription === 'string') {
      sessionDescriptionForPayload = sessionDescription || undefined;
    } else if (typeof sessionDescription === 'object' && sessionDescription !== null) {
      sessionDescriptionForPayload = `\`\`\`json\n${JSON.stringify(sessionDescription, null, 2)}\n\`\`\``;
    } else {
      sessionDescriptionForPayload = undefined;
    }

    const payload: StartSessionPayload = {
      projectId: currentProjectDetail.id,
      selectedModelCatalogIds: currentSelectedModelIds,
      sessionDescription: sessionDescriptionForPayload,
      thesisPromptTemplateId: selectedDomainOverlayDescriptor?.id || undefined,
      antithesisPromptTemplateId: selectedDomainOverlayDescriptor?.id || undefined,
      synthesisPromptTemplateId: selectedDomainOverlayDescriptor?.id || undefined,
      parenthesisPromptTemplateId: selectedDomainOverlayDescriptor?.id || undefined, 
      paralysisPromptTemplateId: selectedDomainOverlayDescriptor?.id || undefined,
      formalDebateStructureId: selectedDomainOverlayDescriptor?.id || undefined,
    };

    const result = await startDialecticSession(payload);

    if (result && !result.error && result.data) {
      toast.success(`Session started successfully: ${result.data.id}`);
      onSessionStarted?.(result.data.id);
      handleOpenChange(false);
    }
  };
  
  useEffect(() => {
    if(startSessionError) {
      toast.error(startSessionError.message || "Failed to start session.");
    }
  }, [startSessionError]);

  if (!isModalOpen) {
    return null;
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Start New Dialectic Session for {currentProjectDetail?.project_name || currentProjectDetail?.id || 'Loading project...'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="flex flex-row gap-4 items-start">
            <div className="flex-1 grid gap-1">
              <DialecticStageSelector
                disabled={isStartingSession || !currentProjectDetail}
              />
            </div>

            <div className="flex-1 grid gap-1">
              <DomainSelector />
            </div>
          </div>

          <div className="grid gap-2">
            <TextInputArea
              id="sessionDescription"
              label="Session Description"
              placeholder="Enter session description (Markdown supported)"
              value={getSessionDescriptionForTextarea()}
              onChange={handleSessionDescriptionChange}
              disabled={isStartingSession}
              rows={5}
              showPreviewToggle={true}
              initialPreviewMode={true}
              dataTestId="session-description-input-area"
            />
          </div>

          <AIModelSelector
            disabled={isStartingSession || isLoadingModelCatalog}
          />
          
          {!currentProjectDetail?.id && <p className="text-destructive">Waiting for project information...</p>}
          {startSessionError && <p className="text-destructive mt-2">Error: {startSessionError.message}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isStartingSession}>Cancel</Button>
          </DialogClose>
          <Button 
            onClick={handleStartSessionSubmit} 
            disabled={!currentProjectDetail?.id || isStartingSession || currentSelectedModelIds.length === 0 || !currentDialecticStage || !selectedDomainOverlayDescriptor}
          >
            {isStartingSession ? 'Starting...' : 'Start Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 