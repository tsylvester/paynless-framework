import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { TextInputArea } from '@/components/common/TextInputArea';
import { useDialecticStore } from '@paynless/store';
import type { StartSessionPayload, DialecticProject, DomainOverlayDescriptor } from '@paynless/types';
import { DialecticStage } from '@paynless/types';
import {
  selectCurrentProjectDetail,
  selectIsStartNewSessionModalOpen,
  selectIsStartingSession,
  selectStartSessionError,
  selectSelectedDomainOverlayId,
  selectAvailableDomainOverlays,
  selectSelectedDomain,
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
    setSelectedDomain,
    setSelectedDomainOverlayId,
    setSelectedStageAssociation,
  } = useDialecticStore((state) => ({
    setStartNewSessionModalOpen: state.setStartNewSessionModalOpen,
    startDialecticSession: state.startDialecticSession,
    setSelectedDomain: state.setSelectedDomain,
    setSelectedDomainOverlayId: state.setSelectedDomainOverlayId,
    setSelectedStageAssociation: state.setSelectedStageAssociation,
  }));

  const currentProjectDetail = useDialecticStore(selectCurrentProjectDetail) as DialecticProject | null;
  const isModalOpen = useDialecticStore(selectIsStartNewSessionModalOpen);
  const isStartingSession = useDialecticStore(selectIsStartingSession);
  const startSessionError = useDialecticStore(selectStartSessionError);
  const selectedDomainOverlayDescriptor = useDialecticStore(selectSelectedDomainOverlayDescriptor);
  const isLoadingModelCatalog = useDialecticStore(selectIsLoadingModelCatalog);

  const currentSelectedDomain = useDialecticStore(selectSelectedDomain);

  const currentDialecticStage = useDialecticStore(selectSelectedStageAssociation) as DialecticStage | undefined;
  const currentSelectedModelIds = useDialecticStore(selectSelectedModelIds) || [];

  const [sessionDescription, setSessionDescription] = useState<string | object>('');
  const [hasUserEditedDescription, setHasUserEditedDescription] = useState(false);

  const baseDomainDescription = useMemo(() => {
    return currentSelectedDomain?.description || null;
  }, [currentSelectedDomain]);

  useEffect(() => {
    if (isModalOpen && !hasUserEditedDescription) {
      const ov = selectedDomainOverlayDescriptor?.overlay_values;
      if (ov !== undefined && ov !== null) {
        setSessionDescription(ov);
      } else {
        setSessionDescription(selectedDomainOverlayDescriptor?.description || baseDomainDescription || '');
      }
    }
  }, [selectedDomainOverlayDescriptor, baseDomainDescription, isModalOpen, hasUserEditedDescription]);

  const resetFormAndClose = () => {
    setSessionDescription('');
    setHasUserEditedDescription(false);
    setSelectedDomain(null);
    setSelectedDomainOverlayId(null);
    setSelectedStageAssociation(null);
    // Note: setSelectedModelCatalogIds([]) would be needed here for full reset if available
    setStartNewSessionModalOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
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
      sessionDescriptionForPayload = `\`\`\`json\\n${JSON.stringify(sessionDescription, null, 2)}\\n\`\`\``;
    } else {
      sessionDescriptionForPayload = undefined;
    }

    const payload: StartSessionPayload = {
      projectId: currentProjectDetail.id,
      selectedModelCatalogIds: currentSelectedModelIds,
      sessionDescription: sessionDescriptionForPayload,
    };

    const result = await startDialecticSession(payload);
    const responseData = result.data as import('@paynless/types').DialecticSession | undefined;

    if (result && responseData && typeof responseData.id === 'string' && responseData.id.trim() !== '') {
      toast.success(`Session started successfully: ${responseData.id}`);
      onSessionStarted?.(responseData.id);
      resetFormAndClose();
    } else {
      let errorMessage = "Failed to start session.";
      if (result && result.error && result.error.message) {
        errorMessage = result.error.message;
      } else if (result && result.error) {
        errorMessage = "An unknown error occurred while starting the session.";
      } else if (result && responseData && (typeof responseData.id !== 'string' || responseData.id.trim() === '')) {
        errorMessage = "Session may have been created, but a valid Session ID was not returned by the server.";
        console.error("Start session response missing or invalid ID. Response data:", responseData);
      } else if (!result || !responseData) {
        errorMessage = "Failed to start session. No data or an unexpected response was returned from the server.";
        console.error("Start session response was missing, did not contain data, or was malformed. Response:", result);
      }
      toast.error(errorMessage);
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
          <DialogDescription>
            Configure and start a new Dialectic session for the selected project. Choose the stage, domain, describe the session, and select AI models.
          </DialogDescription>
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
            <Button variant="outline" disabled={isStartingSession} onClick={resetFormAndClose}>Cancel</Button>
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