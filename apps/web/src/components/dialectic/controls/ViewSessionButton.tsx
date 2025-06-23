import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import { Button } from '@/components/ui/button';
import { logger } from '@paynless/utils';
import { toast } from 'sonner';

interface ViewSessionButtonProps {
  projectId: string;
  sessionId: string;
  children?: React.ReactNode;
  onClick?: () => void;
}

export const ViewSessionButton: React.FC<ViewSessionButtonProps> = ({
  projectId,
  sessionId,
  children,
  ...rest
}) => {
  const navigate = useNavigate();
  const activateProjectAndSessionContextForDeepLink = useDialecticStore(
    (state) => state.activateProjectAndSessionContextForDeepLink
  );
  const getStoreState = useDialecticStore.getState;

  const handleClick = async () => {
    if (!projectId || !sessionId) {
      logger.error('[ViewSessionButton] Project ID or Session ID is missing.', { projectId, sessionId });
      toast.error('Project ID or Session ID is missing.');
      return;
    }

    try {
      logger.info(`[ViewSessionButton] Activating context for project: ${projectId}, session: ${sessionId}`);
      await activateProjectAndSessionContextForDeepLink(projectId, sessionId);

      // Check the store for errors after the thunk attempt
      const { projectDetailError, activeSessionDetailError } = getStoreState();

      if (projectDetailError) {
        logger.error('[ViewSessionButton] Error setting project context:', { error: projectDetailError });
        toast.error(`Failed to load project or session context: ${projectDetailError.message || 'Unknown project error'}`);
      } else if (activeSessionDetailError) {
        logger.error('[ViewSessionButton] Error setting session context:', { error: activeSessionDetailError });
        toast.error(`Failed to load project or session context: ${activeSessionDetailError.message || 'Unknown session error'}`);
      } else {
        logger.info(`[ViewSessionButton] Successfully activated context for project ${projectId}, session ${sessionId}. Navigating...`);
        navigate(`/dialectic/${projectId}/session/${sessionId}`);
      }
    } catch (error) {
      // This catch block handles unexpected errors in the handleClick itself or the thunk if it throws
      logger.error('[ViewSessionButton] Unexpected error during click handling:', { error, projectId, sessionId });
      toast.error('An unexpected error occurred while trying to view the session.');
    }
  };

  return (
    <Button onClick={handleClick} {...rest}>
      {children || 'View Session'} 
    </Button>
  );
}; 