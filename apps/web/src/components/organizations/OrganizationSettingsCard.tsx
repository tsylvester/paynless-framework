'use client';

import React, { useEffect } from 'react';
import { useOrganizationStore } from '@paynless/store';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Add shadcn/ui imports
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem 
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';

// Placeholder for DeleteOrganizationDialog trigger
// import { useDeleteOrganizationDialog } from './DeleteOrganizationDialog';

// Define Zod schema for validation
const settingsSchema = z.object({
  name: z.string().min(3, { message: "Organization name must be at least 3 characters." }),
  visibility: z.enum(['private', 'public'], { message: "Please select a valid visibility." })
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export const OrganizationSettingsCard: React.FC = () => {
  const {
    currentOrganizationDetails,
    updateOrganization,
    // softDeleteOrganization, // Commented out as unused for now
    openDeleteDialog, // Import the action
    selectCurrentUserRoleInOrg, // Add selector for role check
    isLoading, // Use main loading for now, maybe specific loading state later
    currentOrganizationId,
  } = useOrganizationStore();

  const {
    register,
    handleSubmit,
    control,
    reset, // To reset form when details change
    formState: { errors, isSubmitting }, // Get errors and submitting state
    setValue // Get setValue from RHF
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    // Set defaultValues within useEffect to ensure data is available
    // and avoid potential type conflicts during initial render.
    defaultValues: { 
      name: '', 
      visibility: 'private' // Provide a definite initial default
    }
  });

  // Set/Reset form values when the organization details change
  useEffect(() => {
    if (currentOrganizationDetails) {
      // Use setValue for more granular control or reset for full form
      setValue('name', currentOrganizationDetails.name);
      // Cast is still likely needed here if the source type isn't strictly the enum
      setValue('visibility', currentOrganizationDetails.visibility as 'private' | 'public');
      // Alternatively, reset can be used, but ensure the object type matches:
      // reset({
      //   name: currentOrganizationDetails.name,
      //   visibility: currentOrganizationDetails.visibility as 'private' | 'public',
      // });
    }
  }, [currentOrganizationDetails, reset, setValue]); // Added setValue dependency

  // // Placeholder for delete dialog trigger - REMOVED
  // const openDeleteDialogPlaceholder = () => {
  //   console.log('TODO: Open Delete Organization Dialog');
  // };

  // Actual form submission handler - Remove explicit type annotation
  const onSubmit = async (data: SettingsFormData) => { // Let type inference work with useForm<T>
    if (!currentOrganizationId) {
      toast.error("Cannot update: No organization selected.");
      return;
    }
    try {
      // Call the update action from the store
      await updateOrganization(currentOrganizationId, data);
      toast.success("Organization settings updated successfully!");
      // Optional: reset form to new values if needed, though useEffect handles external changes
      // reset(data); 
    } catch (error: unknown) { // Use unknown for safer error handling
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(`Failed to update settings: ${errorMessage}`);
    }
  };

  // Get the current user's role
  const currentUserRole = selectCurrentUserRoleInOrg();

  // Check if the user is an admin
  if (currentUserRole !== 'admin') {
    // Optional: Render a message or return null based on design
    // console.log('[OrganizationSettingsCard] User is not admin, rendering nothing.');
    return null; // Don't render the card for non-admins
  }

  if (!currentOrganizationDetails) {
    // Should ideally not render if no details, handled by parent?
    // Or show a specific message/state here.
    return null; 
  }

  // Combine store loading state with form submitting state
  const formDisabled = isLoading || isSubmitting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Settings (Admin)</CardTitle>
        {/* Optional: Add CardDescription here */}
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              {...register("name")} // Register input with RHF
              // defaultValue is now handled by useForm
              disabled={formDisabled}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-visibility">Visibility</Label>
            <Controller
              name="visibility"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value} // Ensure value is controlled
                  disabled={formDisabled}
                >
                  <SelectTrigger id="org-visibility">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
             {errors.visibility && <p className="text-sm text-red-500">{errors.visibility.message}</p>}
          </div>
        </CardContent>
        <Separator className="my-4" />
        <CardFooter className="flex justify-between">
          <Button
            type="submit"
            disabled={formDisabled} // Use combined disabled state
          >
            {isSubmitting ? 'Updating...' : 'Update Settings'} {/* Show loading text */}
          </Button>
          <Button
            variant="destructive"
            onClick={openDeleteDialog}
            type="button"
            disabled={formDisabled} // Also disable delete during update
            // className={!isAdmin ? 'hidden' : ''} // Keep commented until role check is confirmed needed here
          >
            Delete Organization
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}; 