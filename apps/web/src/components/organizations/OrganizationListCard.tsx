'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardBody, CardFooter, Divider, Button, Listbox, ListboxItem } from '@nextui-org/react'; // Import necessary UI components

// Placeholder for CreateOrganizationModal trigger
// import { useCreateOrganizationModal } from './CreateOrganizationModal'; 

export const OrganizationListCard: React.FC = () => {
  const {
    userOrganizations,
    currentOrganizationId,
    setCurrentOrganizationId,
    isLoading, // Use the main store loading state for now
    // TODO: Consider a specific loading state for list actions if needed
  } = useOrganizationStore();

  // TODO: Get function to open the Create Org Modal
  // const { onOpen: openCreateOrgModal } = useCreateOrganizationModal(); 
  const openCreateOrgModal = () => {
    console.log('TODO: Trigger Create Organization Modal');
  };

  const handleSelectionChange = (keys: Set<React.Key>) => {
    // Assuming the Listbox key is the organization_id
    const selectedId = Array.from(keys)[0] as string;
    if (selectedId && selectedId !== currentOrganizationId) {
      setCurrentOrganizationId(selectedId);
    }
  };

  return (
    <Card>
      <CardHeader className="flex justify-between items-center">
        <h4 className="font-bold text-large">Your Organizations</h4>
        <Button 
          color="primary" 
          size="sm" 
          onPress={openCreateOrgModal} 
          // TODO: Add '+' icon
        >
          Create New
        </Button>
      </CardHeader>
      <Divider />
      <CardBody className="p-0">
        {isLoading && userOrganizations.length === 0 ? (
          <div className="p-4 text-center">Loading...</div> // Simple loading indicator
        ) : userOrganizations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No organizations found.</div>
        ) : (
          <Listbox
            aria-label="Organizations"
            variant="flat"
            disallowEmptySelection
            selectionMode="single"
            selectedKeys={currentOrganizationId ? new Set([currentOrganizationId]) : new Set()}
            onSelectionChange={(keys) => handleSelectionChange(keys as Set<React.Key>)} // Type assertion needed
          >
            {userOrganizations.map((orgMembership) => (
              <ListboxItem 
                key={orgMembership.organization_id} 
                // TODO: Add organization name display, maybe logo?
              >
                {orgMembership.organization_name || orgMembership.organization_id} 
              </ListboxItem>
            ))}
          </Listbox>
        )}
      </CardBody>
      {/* Optional Footer */}
      {/* <CardFooter>
        <p>Footer content if needed</p>
      </CardFooter> */}
    </Card>
  );
}; 