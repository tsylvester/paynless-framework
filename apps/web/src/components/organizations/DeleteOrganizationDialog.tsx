'use client';

import React, { useState } from 'react';
import { useOrganizationStore } from '@paynless/store';
import {
  AlertDialog, // Using AlertDialog for destructive action confirmation
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { logger } from '@paynless/utils';

export const DeleteOrganizationDialog: React.FC = () => {
  const {
    isDeleteDialogOpen,
    closeDeleteDialog,
    softDeleteOrganization,
    currentOrganizationDetails,
    currentOrganizationId,
  } = useOrganizationStore();

  const [isDeleting, setIsDeleting] = useState(false);

  const orgName = currentOrganizationDetails?.name ?? 'the organization';

  const handleDeleteConfirm = async () => {
    if (!currentOrganizationId) {
      logger.error('[DeleteOrganizationDialog] Cannot delete, currentOrganizationId is null');
      toast.error('Could not delete organization: Missing ID.');
      closeDeleteDialog(); // Close dialog even if ID is missing somehow
      return;
    }

    setIsDeleting(true);
    try {
      const success = await softDeleteOrganization(currentOrganizationId);
      if (success) {
        toast.success(`Organization "${orgName}" successfully deleted.`);
        // No need to call closeDeleteDialog here, softDeleteOrganization handles it
      } else {
        // Error message handled by the store action's _setError and toast
        // Optionally add a generic toast here if store doesn't show one on failure
        // toast.error(`Failed to delete "${orgName}".`);
      }
    } catch (error: unknown) {
      let errorMessage = 'An unexpected error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Log the message and pass the error object as metadata if needed, or just log the message
      logger.error(`[DeleteOrganizationDialog] Unexpected error during delete confirmation: ${errorMessage}`, { originalError: error }); // Example with metadata
      // Or simply: logger.error(`[DeleteOrganizationDialog] Unexpected error during delete confirmation: ${errorMessage}`);
      toast.error('An unexpected error occurred while trying to delete the organization.');
    } finally {
      setIsDeleting(false);
      // Ensure dialog closes even if store action fails unexpectedly before closing it
    }
  };

  // Note: AlertDialog doesn't use `onOpenChange` like Dialog.
  // The open state is directly controlled by the `open` prop.
  // We rely on the store action `closeDeleteDialog` being called by 
  // the Cancel button or the successful `softDeleteOrganization` action.

  return (
    <AlertDialog open={isDeleteDialogOpen}>
      {/* No Trigger needed here, opened via store state */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone easily. This will permanently soft-delete the 
            organization <strong className="font-semibold">{orgName}</strong>.
            Members will lose access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={closeDeleteDialog} disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDeleteConfirm} 
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Yes, Delete Organization'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}; 