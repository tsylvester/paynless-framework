'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';

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

// Placeholder for DeleteOrganizationDialog trigger
// import { useDeleteOrganizationDialog } from './DeleteOrganizationDialog';

// TODO: Add form handling (e.g., react-hook-form, zod) for validation

export const OrganizationSettingsCard: React.FC = () => {
  const {
    currentOrganizationDetails,
    updateOrganization,
    softDeleteOrganization, // Assuming this action exists
    isLoading, // Use main loading for now, maybe specific loading state later
    currentOrganizationId,
  } = useOrganizationStore();

  // Placeholder for delete dialog trigger
  const openDeleteDialog = () => {
    console.log('TODO: Open Delete Organization Dialog');
    // Example of triggering delete action (move to dialog confirmation)
    // if (currentOrganizationId) {
    //   softDeleteOrganization(currentOrganizationId);
    // }
  };

  // Placeholder for form submission
  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('TODO: Handle organization update submission');
    // Example structure:
    // const formData = new FormData(event.currentTarget);
    // const updatedData = {
    //   name: formData.get('name') as string,
    //   visibility: formData.get('visibility') as string,
    // };
    // if (currentOrganizationId) {
    //   updateOrganization(currentOrganizationId, updatedData);
    // }
  };

  if (!currentOrganizationDetails) {
    // Should ideally not render if no details, handled by parent?
    // Or show a specific message/state here.
    return null; 
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Settings (Admin)</CardTitle>
        {/* Optional: Add CardDescription here */}
      </CardHeader>
      <form onSubmit={handleUpdate}>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              name="name"
              defaultValue={currentOrganizationDetails.name}
              required
              // TODO: Add validation props
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-visibility">Visibility</Label>
            <Select
              name="visibility"
              defaultValue={currentOrganizationDetails.visibility || 'private'}
              required
              // TODO: Add validation props
            >
              <SelectTrigger id="org-visibility">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <Separator className="my-4" />
        <CardFooter className="flex justify-between">
          <Button
            type="submit"
            disabled={isLoading} // Use disabled for loading state
          >
            Update Settings
          </Button>
          <Button
            variant="destructive" // Use destructive variant
            onClick={openDeleteDialog} // Use onClick
            type="button" // Prevent form submission
          >
            Delete Organization
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}; 