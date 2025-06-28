import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import { Button } from '@/components/ui/button';
import { logger } from '@paynless/utils';
import { toast } from 'sonner'; // Assuming sonner is used for toasts, as seen in other files

interface ViewProjectButtonProps {
  projectId: string;
  projectName: string;
  // You can add other props like `variant`, `size`, `className` if needed for styling
  // and pass them to the underlying Button component.
  children?: React.ReactNode; // To allow custom button text/icons if projectName is not enough
  asChild?: boolean;
  // Allow any other Button props
  [key: string]: unknown;
}

export const ViewProjectButton: React.FC<ViewProjectButtonProps> = ({
  projectId,
  projectName,
  children,
  asChild,
  ...rest // For other Button props like variant, size etc.
}) => {
  const navigate = useNavigate();
  const fetchDialecticProjectDetails = useDialecticStore(
    (state) => state.fetchDialecticProjectDetails
  );
  // Access selector for the error state
  const projectDetailError = useDialecticStore((state) => state.projectDetailError);
  // Get the whole state to check error *after* the async call
  const getStoreState = useDialecticStore.getState;

  const handleClick = async () => {
    if (!projectId) {
      logger.error('[ViewProjectButton] Project ID is missing.');
      toast.error('Cannot view project without a valid ID.');
      return;
    }
    try {
      logger.info(`[ViewProjectButton] Fetching details for project: ${projectId}`);
      await fetchDialecticProjectDetails(projectId);

      // Check the store for an error after the fetch attempt
      const currentError = getStoreState().projectDetailError;
      if (currentError) {
        logger.error('[ViewProjectButton] Error fetching project details from store:', { error: currentError });
        toast.error(`Failed to load project: ${currentError.message || 'Unknown error'}`);
      } else {
        logger.info(`[ViewProjectButton] Successfully fetched project ${projectId}, navigating...`);
        navigate(`/dialectic/${projectId}`);
      }
    } catch (error) {
      // This catch block handles unexpected errors in the handleClick itself,
      // not API errors handled by the thunk (which set projectDetailError).
      logger.error('[ViewProjectButton] Unexpected error during click handling:', { error });
      toast.error('An unexpected error occurred while trying to view the project.');
    }
  };

  return (
    <Button onClick={handleClick} {...rest} asChild={asChild}>
      {children || projectName}
    </Button>
  );
}; 