import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    // DialogFooter, // No longer needed here, handled by form
    // DialogClose, // No longer needed here, handled by form
} from '@/components/ui/dialog'; // Assuming shadcn ui path alias
import { useOrganizationStore } from '@paynless/store';
// Import the form component
import { CreateOrganizationForm } from './CreateOrganizationForm';
// import { Button } from '@/components/ui/button'; // No longer needed here

export const CreateOrganizationModal: React.FC = () => {
    const isCreateModalOpen = useOrganizationStore((state) => state.isCreateModalOpen);
    const closeCreateModal = useOrganizationStore((state) => state.closeCreateModal);

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            // Reset potentially stuck form state if modal is closed externally
            // Note: The form itself also calls close on cancel/success
            closeCreateModal(); 
        }
        // We don't handle opening here, it's triggered by openCreateModal
    };

    return (
        <Dialog open={isCreateModalOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Organization</DialogTitle>
                    <DialogDescription>
                        Enter the details for your new organization.
                    </DialogDescription>
                </DialogHeader>
                
                {/* Render the form component */}
                <CreateOrganizationForm />

                {/* Footer is now handled within the form component */}
            </DialogContent>
        </Dialog>
    );
}; 