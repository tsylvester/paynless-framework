import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useDialecticStore } from '@paynless/store';
import {
  selectCurrentProjectId,
  selectIsStartNewSessionModalOpen
} from '@paynless/store';
import { toast } from 'sonner';

interface StartDialecticSessionModalProps {
  onSessionStarted?: (sessionId: string) => void;
}

export const StartDialecticSessionModal: React.FC<StartDialecticSessionModalProps> = ({
  onSessionStarted,
}) => {
  const {
    setStartNewSessionModalOpen,
  } = useDialecticStore((state) => ({
    setStartNewSessionModalOpen: state.setStartNewSessionModalOpen,
  }));

  const projectIdFromStore = useDialecticStore(selectCurrentProjectId);
  const isModalOpen = useDialecticStore(selectIsStartNewSessionModalOpen);

  const handleOpenChange = (open: boolean) => {
    setStartNewSessionModalOpen(open);
  };

  const handleStartSessionAttempt = async () => {
    if (!projectIdFromStore) {
      toast.error("Project ID is missing. Cannot start session.");
      return;
    }
    
    console.log(`Attempting to start new session for project: ${projectIdFromStore} (Simplified)`);
    
    toast.info('Session start process initiated (placeholder).'); 
    onSessionStarted?.('new-simulated-session-id');
    handleOpenChange(false);
  };

  if (!isModalOpen) {
    return null;
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start New Dialectic Session</DialogTitle>
          <DialogDescription>
            Configure parameters for your new session on project: {projectIdFromStore || 'Loading project...'}
            <br/>(Session configuration form will be here)
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <p>Session configuration options will go here.</p>
          {!projectIdFromStore && <p className="text-destructive">Waiting for project information...</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleStartSessionAttempt} disabled={!projectIdFromStore}>
            Start Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 