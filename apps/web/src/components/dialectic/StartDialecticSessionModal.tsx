import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDialecticStore } from '@paynless/store';
import type { StartSessionPayload, DialecticProject, DomainOverlayDescriptor, DialecticStage } from '@paynless/types';
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
  } = useDialecticStore((state) => ({
    setStartNewSessionModalOpen: state.setStartNewSessionModalOpen,
    startDialecticSession: state.startDialecticSession,
  }));

  const currentProjectDetail = useDialecticStore(selectCurrentProjectDetail) as DialecticProject | null;
  const isModalOpen = useDialecticStore(selectIsStartNewSessionModalOpen);
  const isStartingSession = useDialecticStore(selectIsStartingSession);
  const startSessionError = useDialecticStore(selectStartSessionError);
  const selectedDomainOverlayDescriptor = useDialecticStore(selectSelectedDomainOverlayDescriptor);
  const isLoadingModelCatalog = useDialecticStore(selectIsLoadingModelCatalog);

  const selectedDomainTag = useDialecticStore(selectSelectedDomainTag);
  const availableDomainTags = useDialecticStore(selectAvailableDomainTags);

  const currentDialecticStage = useDialecticStore(selectSelectedStageAssociation) as DialecticStage | undefined;
  const currentSelectedModelIds = useDialecticStore(selectSelectedModelIds) || [];

  const [sessionDescription, setSessionDescription] = useState('');
  const [hasUserEditedDescription, setHasUserEditedDescription] = useState(false);

  const baseDomainTagDescription = useMemo(() => {
    if (!selectedDomainTag || !availableDomainTags) return null;
    const currentTagDescriptor = availableDomainTags.find(tag => tag.domainTag === selectedDomainTag);
    return currentTagDescriptor?.description || null;
  }, [selectedDomainTag, availableDomainTags]);

  useEffect(() => {
    if (isModalOpen && !hasUserEditedDescription) {
      const newDescription = selectedDomainOverlayDescriptor?.description || baseDomainTagDescription || '';
      setSessionDescription(newDescription);
    }
  }, [selectedDomainOverlayDescriptor, baseDomainTagDescription, isModalOpen, hasUserEditedDescription]);

  useEffect(() => {
    if (isModalOpen) {
      setHasUserEditedDescription(false);
      const newDescription = selectedDomainOverlayDescriptor?.description || baseDomainTagDescription || '';
      setSessionDescription(newDescription);
    }
  }, [currentDialecticStage, isModalOpen, selectedDomainOverlayDescriptor, baseDomainTagDescription]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setHasUserEditedDescription(false);
    }
    setStartNewSessionModalOpen(open);
  };

  const handleSessionDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSessionDescription(e.target.value);
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

    const payload: StartSessionPayload = {
      projectId: currentProjectDetail.id,
      selectedModelCatalogIds: currentSelectedModelIds,
      sessionDescription: sessionDescription || undefined,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start New Dialectic Session</DialogTitle>
          <DialogDescription>
            For project: {currentProjectDetail?.project_name || currentProjectDetail?.id || 'Loading project...'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
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
            <Label htmlFor="sessionDescription">Session Description</Label>
            <Textarea
              id="sessionDescription"
              placeholder={selectedDomainOverlayDescriptor?.description || baseDomainTagDescription || undefined}
              value={sessionDescription}
              onChange={handleSessionDescriptionChange}
              disabled={isStartingSession}
              rows={3}
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