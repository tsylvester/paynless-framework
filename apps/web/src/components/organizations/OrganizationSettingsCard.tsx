'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardBody, CardFooter, Divider, Button, Input, Select, SelectItem } from '@nextui-org/react'; // Assuming NextUI
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
        <h4 className="font-bold text-large">Organization Settings (Admin)</h4>
      </CardHeader>
      <form onSubmit={handleUpdate}>
        <CardBody className="space-y-4">
          <Input
            name="name"
            label="Organization Name"
            defaultValue={currentOrganizationDetails.name}
            // TODO: Add validation props
            isRequired 
          />
          <Select
            name="visibility"
            label="Visibility"
            defaultSelectedKeys={[currentOrganizationDetails.visibility || 'private']}
            // TODO: Add validation props
            isRequired
          >
            <SelectItem key="private" value="private">Private</SelectItem>
            <SelectItem key="public" value="public">Public</SelectItem>
          </Select>
        </CardBody>
        <Divider />
        <CardFooter className="flex justify-between">
          <Button 
            type="submit"
            color="primary"
            isLoading={isLoading} // Reflect loading state
          >
            Update Settings
          </Button>
          <Button 
            color="danger"
            variant="flat"
            onPress={openDeleteDialog}
          >
            Delete Organization
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}; 